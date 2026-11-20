import { query, queryOne, execute } from '../db';
import { sendEmail } from './email';
import crypto from 'crypto';

export interface EmailBroadcastRecipient {
  parentId?: string;
  userId?: string;
  email: string;
  parentName?: string;
  subject: string;
  body: string;
  deliveryLogId?: string;
  roundId?: string;
  sendRound?: number;
  allowResend?: boolean;
}

export interface BroadcastProgress {
  campaignId: string;
  total: number;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  status: 'idle' | 'running' | 'completed' | 'error';
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
}

// Active campaign locks to guarantee single concurrent runner per campaign
const activeCampaigns = new Map<string, BroadcastProgress>();
let globalDispatchLock = false;

export function getCampaignProgress(campaignId: string): BroadcastProgress | null {
  return activeCampaigns.get(campaignId) || null;
}

export function isCampaignActive(campaignId: string): boolean {
  const p = activeCampaigns.get(campaignId);
  return Boolean(p && p.status === 'running');
}

/**
 * Database-backed campaign progress query.
 * Fully durable across server restarts.
 */
export async function getDurableCampaignProgress(campaignId: string): Promise<BroadcastProgress> {
  const inMemory = activeCampaigns.get(campaignId);
  const isRunning = Boolean(inMemory && inMemory.status === 'running');

  // Query database state from email_delivery_logs
  const logStats = await queryOne<any>(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('sent', 'delivered') THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'sending' THEN 1 ELSE 0 END) as sending,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
      MIN(created_at) as started_at,
      MAX(updated_at) as last_updated
    FROM email_delivery_logs
    WHERE campaign_id = ?
  `, [campaignId]);

  const total = Number(logStats?.total || inMemory?.total || 0);
  const sent = Number(logStats?.sent || inMemory?.sent || 0);
  const failed = Number(logStats?.failed || inMemory?.failed || 0);
  const sending = Number(logStats?.sending || 0);
  const queued = Number(logStats?.queued || 0);
  const processed = sent + failed;

  let status: 'idle' | 'running' | 'completed' | 'error' = 'idle';
  if (isRunning || sending > 0 || queued > 0) {
    status = 'running';
  } else if (inMemory?.status === 'error') {
    status = 'error';
  } else if (total > 0 && processed >= total) {
    status = 'completed';
  } else if (processed > 0) {
    status = inMemory?.status || 'completed';
  }

  return {
    campaignId,
    total: inMemory?.total || total,
    processed,
    sent,
    failed,
    skipped: inMemory?.skipped || 0,
    status,
    startedAt: inMemory?.startedAt || logStats?.started_at || undefined,
    finishedAt: inMemory?.finishedAt || undefined,
    lastError: inMemory?.lastError || undefined
  };
}

/**
 * Utility sleep helper
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Safely parses HTML line breaks from plain text body
 */
function formatHtmlBody(text: string): string {
  const sanitized = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #27272A; margin: 0 0 16px 0;">${sanitized.replace(/\n/g, '<br>')}</p>`;
}

/**
 * Checks whether an error is a rate limit / 429 response from Resend
 */
function isRateLimitError(errStr?: string): boolean {
  if (!errStr) return false;
  const s = errStr.toLowerCase();
  return (
    s.includes('429') ||
    s.includes('rate limit') ||
    s.includes('too many requests') ||
    s.includes('rate_limit_exceeded')
  );
}

/**
 * Dispatches an email to a single recipient with rate-limit pacing and automatic 429 exponential backoff.
 * Returns the final delivery outcome.
 */
export async function sendPacedEmailWithBackoff(options: {
  campaignId: string;
  eventId?: string;
  parentId?: string;
  userId?: string;
  recipientEmail: string;
  subject: string;
  body: string;
  customFromName?: string;
  customReplyTo?: string;
  maxRetries?: number;
  deliveryLogId?: string;
  roundId?: string;
  sendRound?: number;
  allowResend?: boolean;
}): Promise<{
  success: boolean;
  skipped?: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}> {
  const {
    campaignId,
    eventId,
    parentId,
    userId,
    recipientEmail,
    subject,
    body,
    customFromName,
    customReplyTo,
    maxRetries = 2,
    deliveryLogId: explicitDeliveryLogId,
    roundId,
    sendRound = 1,
    allowResend = false
  } = options;

  const cleanEmail = recipientEmail.trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, errorMessage: 'Invalid recipient email address' };
  }

  const nowStr = new Date().toISOString();
  let deliveryLogId = explicitDeliveryLogId;

  // 1. Strict Idempotency Check:
  if (deliveryLogId) {
    // If an explicit deliveryLogId is provided, check that specific row
    const existingTarget = await queryOne<any>(
      `SELECT id, status, provider_message_id FROM email_delivery_logs WHERE id = ?`,
      [deliveryLogId]
    );
    if (existingTarget && (existingTarget.status === 'sent' || existingTarget.status === 'delivered')) {
      return {
        success: true,
        skipped: true,
        providerMessageId: existingTarget.provider_message_id
      };
    }
  } else if (allowResend && roundId) {
    // Deliberate resend mode: check if already sent or delivered IN THIS SPECIFIC ROUND
    let existingInRound: any = null;
    if (parentId) {
      existingInRound = await queryOne(
        `SELECT id, provider_message_id, status FROM email_delivery_logs
         WHERE campaign_id = ? AND round_id = ? AND parent_profile_id = ? AND status IN ('sent', 'delivered')
         LIMIT 1`,
        [campaignId, roundId, parentId]
      );
    }
    if (!existingInRound) {
      existingInRound = await queryOne(
        `SELECT id, provider_message_id, status FROM email_delivery_logs
         WHERE campaign_id = ? AND round_id = ? AND recipient_email = ? AND status IN ('sent', 'delivered')
         LIMIT 1`,
        [campaignId, roundId, cleanEmail]
      );
    }
    if (existingInRound) {
      return {
        success: true,
        skipped: true,
        providerMessageId: existingInRound.provider_message_id
      };
    }
  } else if (!allowResend) {
    // Safe retry uncontacted mode: check if already accepted in this campaign
    let existingAccepted: any = null;
    if (parentId) {
      existingAccepted = await queryOne(
        `SELECT id, provider_message_id, status FROM email_delivery_logs
         WHERE campaign_id = ? AND parent_profile_id = ? AND status IN ('sent', 'delivered')
         LIMIT 1`,
        [campaignId, parentId]
      );
    }
    if (!existingAccepted) {
      existingAccepted = await queryOne(
        `SELECT id, provider_message_id, status FROM email_delivery_logs
         WHERE campaign_id = ? AND recipient_email = ? AND status IN ('sent', 'delivered')
         LIMIT 1`,
        [campaignId, cleanEmail]
      );
    }

    if (existingAccepted) {
      return {
        success: true,
        skipped: true,
        providerMessageId: existingAccepted.provider_message_id
      };
    }
  }

  // 2. Locate or prepare delivery log row
  if (deliveryLogId) {
    await execute(
      `UPDATE email_delivery_logs
       SET status = 'sending', updated_at = ?
       WHERE id = ?`,
      [nowStr, deliveryLogId]
    );
  } else {
    deliveryLogId = `edl-${crypto.randomUUID()}`;
    await execute(
      `INSERT INTO email_delivery_logs (
         id, campaign_id, round_id, send_round, event_id, parent_profile_id, user_id, recipient_email,
         subject, provider, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'resend', 'sending', ?, ?)`,
      [
        deliveryLogId,
        campaignId,
        roundId || null,
        sendRound,
        eventId || null,
        parentId || null,
        userId || null,
        cleanEmail,
        subject,
        nowStr,
        nowStr
      ]
    );
  }

  // 3. Send email with exponential backoff on 429
  let attempt = 0;
  let lastError = '';
  let providerMessageId: string | undefined;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const res = await sendEmail({
        to: cleanEmail,
        subject,
        text: body,
        html: formatHtmlBody(body),
        fromName: customFromName,
        replyTo: customReplyTo,
        idempotencyKey: deliveryLogId
      });

      if (res.success && res.id) {
        providerMessageId = res.id;
        const sentTime = new Date().toISOString();
        await execute(
          `UPDATE email_delivery_logs
           SET status = 'sent', provider_message_id = ?, sent_at = ?, error_message = NULL, updated_at = ?
           WHERE id = ?`,
          [providerMessageId, sentTime, sentTime, deliveryLogId]
        );
        return { success: true, providerMessageId };
      }

      lastError = res.error || 'Email dispatch failed';

      // Check if rate limited
      if (isRateLimitError(lastError) && attempt <= maxRetries) {
        const backoffMs = 1500 * Math.pow(2, attempt - 1);
        console.warn(`[EmailBroadcast] Rate limit encountered for ${cleanEmail}. Backing off for ${backoffMs}ms (attempt ${attempt}/${maxRetries})...`);
        await sleep(backoffMs);
        continue;
      }

      // Non-rate-limit error or retries exhausted
      break;
    } catch (err: any) {
      lastError = err?.message || 'Send exception';
      if (isRateLimitError(lastError) && attempt <= maxRetries) {
        const backoffMs = 1500 * Math.pow(2, attempt - 1);
        console.warn(`[EmailBroadcast] Rate limit exception for ${cleanEmail}. Backing off for ${backoffMs}ms...`);
        await sleep(backoffMs);
        continue;
      }
      break;
    }
  }

  // 4. Record failure in delivery logs
  const failTime = new Date().toISOString();
  await execute(
    `UPDATE email_delivery_logs
     SET status = 'failed', error_message = ?, failed_at = ?, updated_at = ?
     WHERE id = ?`,
    [lastError || 'Delivery attempt failed', failTime, failTime, deliveryLogId]
  );

  return { success: false, errorMessage: lastError };
}

/**
 * Paced background dispatcher.
 * Paces at 4-5 requests/sec (~220ms inter-request interval), well within Resend's 10 req/sec limit.
 * Concurrency protected.
 */
export async function runPacedBroadcast(options: {
  campaignId: string;
  eventId?: string;
  recipients: EmailBroadcastRecipient[];
  customFromName?: string;
  customReplyTo?: string;
  delayMs?: number; // default 220ms (~4.5 req/sec)
}): Promise<BroadcastProgress> {
  const {
    campaignId,
    eventId,
    recipients,
    customFromName,
    customReplyTo,
    delayMs = 220
  } = options;

  if (activeCampaigns.has(campaignId) && activeCampaigns.get(campaignId)?.status === 'running') {
    console.warn(`[EmailBroadcast] Campaign ${campaignId} is already running in background.`);
    return activeCampaigns.get(campaignId)!;
  }

  const progress: BroadcastProgress = {
    campaignId,
    total: recipients.length,
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    status: 'running',
    startedAt: new Date().toISOString()
  };
  activeCampaigns.set(campaignId, progress);

  // Run in asynchronous worker
  (async () => {
    try {
      console.log(`[EmailBroadcast] Starting paced broadcast for campaign ${campaignId}. Total recipients: ${recipients.length}`);

      // Reset any lingering 'sending' status from previous server crash/interruption
      await execute(
        `UPDATE email_delivery_logs
         SET status = 'queued', updated_at = ?
         WHERE campaign_id = ? AND status = 'sending'`,
        [new Date().toISOString(), campaignId]
      ).catch((err) => {
        console.warn('[EmailBroadcast] Could not reset lingering sending records:', err?.message || err);
      });

      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];

        try {
          const outcome = await sendPacedEmailWithBackoff({
            campaignId,
            eventId,
            parentId: r.parentId,
            userId: r.userId,
            recipientEmail: r.email,
            subject: r.subject,
            body: r.body,
            customFromName,
            customReplyTo,
            deliveryLogId: r.deliveryLogId,
            roundId: r.roundId,
            sendRound: r.sendRound,
            allowResend: r.allowResend
          });

          progress.processed++;
          if (outcome.skipped) {
            progress.skipped++;
          } else if (outcome.success) {
            progress.sent++;
          } else {
            progress.failed++;
          }
        } catch (itemErr: any) {
          console.error(`[EmailBroadcast] Unexpected error processing ${r.email}:`, itemErr);
          progress.processed++;
          progress.failed++;
        }

        // Pacing delay between consecutive external requests
        if (i < recipients.length - 1) {
          await sleep(delayMs);
        }
      }

      progress.status = 'completed';
      progress.finishedAt = new Date().toISOString();
      console.log(
        `[EmailBroadcast] Finished broadcast ${campaignId}: ${progress.sent} sent, ${progress.failed} failed, ${progress.skipped} skipped out of ${progress.total}`
      );
    } catch (fatalErr: any) {
      console.error(`[EmailBroadcast] Fatal error in campaign ${campaignId}:`, fatalErr);
      progress.status = 'error';
      progress.lastError = fatalErr?.message || 'Fatal background runner error';
      progress.finishedAt = new Date().toISOString();
    }
  })().catch((err) => {
    console.error(`[EmailBroadcast Unhandled Background Error]:`, err);
  });

  return progress;
}

/**
 * Automatically detects and resumes interrupted email broadcasts after server restart or crash.
 * Reconciles unknown sending outcomes and finishes queued recipients safely with rate-limit pacing.
 */
export async function resumeInterruptedEmailBroadcasts(): Promise<{
  recoveredCount: number;
  campaigns: string[];
}> {
  console.log('[EmailBroadcast Recovery] Checking for interrupted broadcasts in database...');

  // 1. Reconcile unknown sending outcomes: any record lingering in 'sending' status
  // If provider_message_id is already present, mark as 'sent'.
  await execute(`
    UPDATE email_delivery_logs
    SET status = 'sent', updated_at = ?
    WHERE status = 'sending' AND provider_message_id IS NOT NULL
  `, [new Date().toISOString()]).catch((e) => console.warn('[EmailBroadcast Recovery] Note:', e));

  // If provider_message_id is NULL and lingering in 'sending', reset safely to 'queued'.
  // Because sendEmail supplies an Idempotency-Key matching the delivery log ID,
  // retrying it cannot result in duplicate dispatch from the email provider.
  await execute(`
    UPDATE email_delivery_logs
    SET status = 'queued', updated_at = ?
    WHERE status = 'sending' AND (provider_message_id IS NULL OR provider_message_id = '')
  `, [new Date().toISOString()]).catch((e) => console.warn('[EmailBroadcast Recovery] Note:', e));

  // 2. Identify all campaigns with unfinished queued records
  const queuedCampaigns = await query<{ campaign_id: string; event_id: string }>(`
    SELECT DISTINCT campaign_id, event_id
    FROM email_delivery_logs
    WHERE status = 'queued' AND campaign_id IS NOT NULL
  `);

  if (!queuedCampaigns || queuedCampaigns.length === 0) {
    console.log('[EmailBroadcast Recovery] No interrupted queued broadcasts found.');
    return { recoveredCount: 0, campaigns: [] };
  }

  let totalRecovered = 0;
  const processedCampaigns: string[] = [];

  for (const c of queuedCampaigns) {
    const campaignId = c.campaign_id;
    const eventId = c.event_id || 'event-ga-2026';

    if (isCampaignActive(campaignId)) {
      console.log(`[EmailBroadcast Recovery] Campaign ${campaignId} is already running in memory.`);
      continue;
    }

    // Retrieve all queued logs for this campaign
    const queuedRows = await query<any>(`
      SELECT id, campaign_id, round_id, send_round, event_id, parent_profile_id, user_id, recipient_email, subject
      FROM email_delivery_logs
      WHERE campaign_id = ? AND status = 'queued'
      ORDER BY created_at ASC
    `, [campaignId]);

    if (!queuedRows || queuedRows.length === 0) continue;

    // Retrieve the original approved announcement body
    let rawSubject = queuedRows[0]?.subject;
    let rawBody: string | undefined;

    if (rawSubject) {
      const origMsg = await queryOne<any>(`
        SELECT subject, body
        FROM admin_message_logs
        WHERE recipient_group IN ('selected_parents', 'selected_children', 'specific_parents')
          AND channel LIKE '%email%'
          AND subject = ?
        ORDER BY CASE WHEN id = 'ea654919-3da5-4a3a-9e80-213fb8beed90' THEN 0 ELSE 1 END, created_at DESC
        LIMIT 1
      `, [rawSubject]);
      rawBody = origMsg?.body;
    }

    if (!rawBody) {
      // Fallback: look for any admin message log for this event
      const fallbackMsg = await queryOne<any>(`
        SELECT subject, body
        FROM admin_message_logs
        WHERE channel LIKE '%email%'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      rawBody = fallbackMsg?.body;
    }

    if (!rawBody) {
      console.warn(`[EmailBroadcast Recovery] Could not resolve announcement body for campaign ${campaignId}. Skipping auto-resume.`);
      continue;
    }

    // Map queued rows into EmailBroadcastRecipient array
    const recipients: EmailBroadcastRecipient[] = queuedRows.map((row) => ({
      parentId: row.parent_profile_id || undefined,
      userId: row.user_id || undefined,
      email: row.recipient_email,
      subject: row.subject || rawSubject,
      body: rawBody!,
      deliveryLogId: row.id,
      roundId: row.round_id || undefined,
      sendRound: row.send_round || 1,
      allowResend: true
    }));

    console.log(`[EmailBroadcast Recovery] Resuming ${recipients.length} queued emails for campaign ${campaignId}...`);
    totalRecovered += recipients.length;
    processedCampaigns.push(campaignId);

    // Launch paced broadcast
    runPacedBroadcast({
      campaignId,
      eventId,
      recipients,
      delayMs: 220
    });
  }

  return { recoveredCount: totalRecovered, campaigns: processedCampaigns };
}
