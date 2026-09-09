import crypto from 'crypto';
import { query, queryOne, execute } from '../../db';
import { getWhatsAppProvider } from './index';
import { evaluateWhatsAppEligibility } from './consent';
import { isTransientError } from './queue';

export interface WhatsAppWorkerOptions {
  maxBatchSize?: number;
  rateLimitDelayMs?: number;
  staleLockTimeoutMs?: number;
  maxAttempts?: number;
}

const DEFAULT_OPTIONS: Required<WhatsAppWorkerOptions> = {
  maxBatchSize: 20,
  rateLimitDelayMs: 60, // ~16 messages/second rate limit
  staleLockTimeoutMs: 5 * 60 * 1000, // 5 minutes stale worker lock recovery
  maxAttempts: 3
};

/**
 * Checks whether the in-process queue worker should run on this server instance.
 * Controlled by WHATSAPP_WORKER_MODE:
 * - 'external': Queue processed by Render Background Worker / external script
 * - 'disabled': Polling disabled
 * - 'in_process': Explicitly enable in-process polling
 *
 * Production rule:
 * In production (NODE_ENV === 'production'), in-process worker is strictly disabled
 * unless WHATSAPP_WORKER_MODE is explicitly set to 'in_process'.
 *
 * Development rule:
 * In non-production, in-process worker runs by default unless WHATSAPP_WORKER_MODE is 'external' or 'disabled'.
 */
export function isWhatsAppInProcessWorkerEnabled(): boolean {
  const mode = (process.env.WHATSAPP_WORKER_MODE || '').trim().toLowerCase();
  if (process.env.NODE_ENV === 'production') {
    return mode === 'in_process';
  }
  return mode !== 'disabled' && mode !== 'external';
}

let isWorkerRunning = false;

/**
 * Creates or updates a delivery log entry in whatsapp_delivery_logs.
 * Idempotently respects provider-scoped message ID uniqueness.
 */
export async function logWhatsAppDelivery(params: {
  id?: string;
  jobId?: string | null;
  campaignId?: string | null;
  parentProfileId?: string | null;
  childEventEntryId?: string | null;
  recipientPhone: string;
  provider: string;
  providerMessageId?: string | null;
  templateName?: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  errorCode?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  failedAt?: string | null;
}): Promise<string> {
  const logId = params.id || `wa_log_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  // If provider_message_id is provided, check for existing entry
  if (params.providerMessageId) {
    const existing = await queryOne(`
      SELECT id, status FROM whatsapp_delivery_logs 
      WHERE provider = ? AND provider_message_id = ?
    `, [params.provider, params.providerMessageId]);

    if (existing) {
      // Idempotent progression: never downgrade a delivery state
      const statusRanks: Record<string, number> = {
        queued: 1,
        sent: 2,
        delivered: 3,
        read: 4,
        failed: 5
      };

      const currentRank = statusRanks[existing.status] || 0;
      const incomingRank = statusRanks[params.status] || 0;

      // Allow failure updates or forward rank progression
      if (params.status === 'failed' || incomingRank >= currentRank) {
        await execute(`
          UPDATE whatsapp_delivery_logs SET
            status = ?,
            error_code = COALESCE(?, error_code),
            error_message = COALESCE(?, error_message),
            sent_at = COALESCE(?, sent_at),
            delivered_at = COALESCE(?, delivered_at),
            read_at = COALESCE(?, read_at),
            failed_at = COALESCE(?, failed_at),
            updated_at = ?
          WHERE id = ?
        `, [
          params.status,
          params.errorCode || null,
          params.errorMessage || null,
          params.sentAt || null,
          params.deliveredAt || null,
          params.readAt || null,
          params.failedAt || null,
          now,
          existing.id
        ]);
      }
      return existing.id;
    }
  }

  // Insert new log entry
  await execute(`
    INSERT INTO whatsapp_delivery_logs (
      id, job_id, campaign_id, parent_profile_id, child_event_entry_id,
      recipient_phone, provider, provider_message_id, template_name,
      status, error_code, error_message, sent_at, delivered_at, read_at, failed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    logId,
    params.jobId || null,
    params.campaignId || null,
    params.parentProfileId || null,
    params.childEventEntryId || null,
    params.recipientPhone,
    params.provider,
    params.providerMessageId || null,
    params.templateName || null,
    params.status,
    params.errorCode || null,
    params.errorMessage || null,
    params.sentAt || null,
    params.deliveredAt || null,
    params.readAt || null,
    params.failedAt || null,
    now,
    now
  ]);

  return logId;
}

/**
 * Main queue processor for WhatsApp notification jobs.
 * Implements atomic claiming, rate limiting, and transient retry management.
 */
export async function processQueuedWhatsAppJobs(
  options?: WhatsAppWorkerOptions
): Promise<{ processed: number; succeeded: number; failed: number; retried: number }> {
  if (isWorkerRunning) {
    return { processed: 0, succeeded: 0, failed: 0, retried: 0 };
  }

  isWorkerRunning = true;
  const config = { ...DEFAULT_OPTIONS, ...options };
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let retried = 0;

  try {
    const provider = getWhatsAppProvider();

    while (processed < config.maxBatchSize) {
      const nowIso = new Date().toISOString();
      const staleCutoffIso = new Date(Date.now() - config.staleLockTimeoutMs).toISOString();

      // 1. Atomic job selection: find eligible job
      // Includes stale processing jobs for crash/restart recovery
      const candidate = await queryOne(`
        SELECT id, event_id, rule_id, parent_id, child_id, channel, scheduled_for, status, idempotency_key, attempt_count
        FROM notification_jobs
        WHERE channel = 'whatsapp'
          AND (
            (status = 'pending' AND (scheduled_for IS NULL OR scheduled_for <= ?) AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
            OR (status = 'processing' AND processing_started_at < ?)
          )
        ORDER BY created_at ASC
        LIMIT 1
      `, [nowIso, nowIso, staleCutoffIso]);

      if (!candidate) {
        break; // No more eligible jobs in queue
      }

      // 2. Atomic claim via conditional UPDATE
      const claimResult = await execute(`
        UPDATE notification_jobs
        SET status = 'processing',
            processing_started_at = ?,
            attempt_count = attempt_count + 1,
            updated_at = ?
        WHERE id = ?
          AND (
            status = 'pending'
            OR (status = 'processing' AND processing_started_at < ?)
          )
      `, [nowIso, nowIso, candidate.id, staleCutoffIso]);

      if (!claimResult || claimResult.changes === 0) {
        // Job was claimed concurrently by another worker process
        continue;
      }

      processed++;
      const currentAttempt = (candidate.attempt_count || 0) + 1;

      try {
        // 3. Resolve parent profile & verify consent eligibility
        const parent = await queryOne(`
          SELECT id, user_id, full_name, phone_number, whatsapp_number, whatsapp_consent_status, email
          FROM parent_profiles
          WHERE id = ?
        `, [candidate.parent_id]);

        if (!parent) {
          throw new Error('Parent profile does not exist or has been removed.');
        }

        const eligibility = evaluateWhatsAppEligibility(parent);
        if (!eligibility.eligible) {
          // Terminal failure: unconsented or invalid number
          const termError = eligibility.reason || 'Parent is not eligible for WhatsApp delivery.';
          await execute(`
            UPDATE notification_jobs
            SET status = 'failed',
                failure_reason = ?,
                last_error = ?,
                updated_at = ?
            WHERE id = ?
          `, [termError, termError, new Date().toISOString(), candidate.id]);

          await logWhatsAppDelivery({
            jobId: candidate.id,
            campaignId: candidate.rule_id || 'manual_broadcast',
            parentProfileId: candidate.parent_id,
            childEventEntryId: candidate.child_id || null,
            recipientPhone: parent.whatsapp_number || parent.phone_number || 'unknown',
            provider: provider.name,
            status: 'failed',
            errorMessage: termError,
            failedAt: new Date().toISOString()
          });

          failed++;
          continue;
        }

        // 4. Resolve message body from admin broadcast or event rule
        let messageBody = '';
        let templateName: string | undefined = undefined;

        // Try extracting broadcast log id from idempotency_key or rule_id
        const campaignMatch = candidate.idempotency_key?.match(/admin_message:([^:]+)/)
          || candidate.idempotency_key?.match(/campaign:([^:]+)/);
        const broadcastId = campaignMatch ? campaignMatch[1] : (candidate.rule_id || null);
        const resolvedCampaignId = broadcastId || candidate.rule_id || 'broadcast';

        if (broadcastId) {
          const broadcastLog = await queryOne(`
            SELECT subject, body FROM admin_message_logs WHERE id = ?
          `, [broadcastId]);

          if (broadcastLog && broadcastLog.body) {
            messageBody = broadcastLog.body;
          }
        }

        if (!messageBody && candidate.rule_id) {
          // Check if rule_id points to an automated event rule
          const eventRule = await queryOne(`
            SELECT title, message_template FROM event_notification_rules WHERE id = ?
          `, [candidate.rule_id]);

          if (eventRule && eventRule.message_template) {
            messageBody = eventRule.message_template;
          }
        }

        if (!messageBody.trim()) {
          messageBody = 'Koinonia Children & Teens: You have an important update for The General Assembly.';
        }

        let eventName = 'The General Assembly';
        if (candidate.event_id) {
          const ev = await queryOne(`SELECT title FROM events WHERE id = ?`, [candidate.event_id]);
          if (ev && ev.title) eventName = ev.title;
        }

        // Resolve personalized placeholders per recipient parent
        const parentDisplayName = (parent.full_name || '').trim() || 'Parent';
        messageBody = messageBody
          .replace(/\{Parent name\}/gi, parentDisplayName)
          .replace(/\{Event name\}/gi, eventName)
          .replace(/\{Child name\}/gi, 'your child')
          .replace(/\{Review link\}/gi, 'https://koinonia.org/parent/status')
          .replace(/\{Pickup time\}/gi, '4:00 PM')
          .replace(/\{Support contact\}/gi, '+234 803 123 4567');

        const recipientPhone = eligibility.normalizedNumber!;

        // 5. Send message via selected WhatsApp provider
        const sendResult = await provider.sendSessionMessage({
          to: recipientPhone,
          body: messageBody,
          idempotencyKey: candidate.idempotency_key || undefined
        });

        const dispatchTimestamp = new Date().toISOString();

        if (sendResult.success) {
          // Success: update job and delivery log
          await execute(`
            UPDATE notification_jobs
            SET status = 'sent',
                sent_at = ?,
                updated_at = ?
            WHERE id = ?
          `, [dispatchTimestamp, dispatchTimestamp, candidate.id]);

          await logWhatsAppDelivery({
            jobId: candidate.id,
            campaignId: resolvedCampaignId,
            parentProfileId: candidate.parent_id,
            childEventEntryId: candidate.child_id || null,
            recipientPhone,
            provider: provider.name,
            providerMessageId: sendResult.messageId || null,
            templateName,
            status: sendResult.status === 'queued' ? 'queued' : 'sent',
            sentAt: dispatchTimestamp
          });

          succeeded++;
        } else {
          // Provider reported failure
          const errMsg = sendResult.error || 'WhatsApp provider dispatch rejected';
          const isTransient = isTransientError(errMsg);

          if (isTransient && currentAttempt < config.maxAttempts) {
            // Transient error: schedule exponential backoff retry
            const backoffSeconds = Math.min(30 * Math.pow(2, currentAttempt - 1), 300);
            const nextAttemptIso = new Date(Date.now() + backoffSeconds * 1000).toISOString();

            await execute(`
              UPDATE notification_jobs
              SET status = 'pending',
                  next_attempt_at = ?,
                  last_error = ?,
                  updated_at = ?
              WHERE id = ?
            `, [nextAttemptIso, errMsg, dispatchTimestamp, candidate.id]);

            await logWhatsAppDelivery({
              jobId: candidate.id,
              campaignId: resolvedCampaignId,
              parentProfileId: candidate.parent_id,
              recipientPhone,
              provider: provider.name,
              status: 'queued',
              errorMessage: `Attempt ${currentAttempt} failed (${errMsg}). Retrying in ${backoffSeconds}s.`
            });

            retried++;
          } else {
            // Terminal error or max attempts reached
            await execute(`
              UPDATE notification_jobs
              SET status = 'failed',
                  failure_reason = ?,
                  last_error = ?,
                  updated_at = ?
              WHERE id = ?
            `, [errMsg, errMsg, dispatchTimestamp, candidate.id]);

            await logWhatsAppDelivery({
              jobId: candidate.id,
              campaignId: resolvedCampaignId,
              parentProfileId: candidate.parent_id,
              recipientPhone,
              provider: provider.name,
              status: 'failed',
              errorMessage: errMsg,
              failedAt: dispatchTimestamp
            });

            failed++;
          }
        }
      } catch (jobErr: any) {
        const errStr = jobErr?.message || 'Unexpected worker error';
        console.error(`[WhatsApp Worker] Exception processing job ${candidate.id}:`, jobErr);

        const nowErr = new Date().toISOString();
        if (currentAttempt < config.maxAttempts) {
          const backoff = 30 * currentAttempt;
          const nextIso = new Date(Date.now() + backoff * 1000).toISOString();
          await execute(`
            UPDATE notification_jobs
            SET status = 'pending',
                next_attempt_at = ?,
                last_error = ?,
                updated_at = ?
            WHERE id = ?
          `, [nextIso, errStr, nowErr, candidate.id]);
          retried++;
        } else {
          await execute(`
            UPDATE notification_jobs
            SET status = 'failed',
                failure_reason = ?,
                last_error = ?,
                updated_at = ?
            WHERE id = ?
          `, [errStr, errStr, nowErr, candidate.id]);
          failed++;
        }
      }

      // 6. Enforce dispatch rate limit
      if (config.rateLimitDelayMs > 0) {
        await new Promise(r => setTimeout(r, config.rateLimitDelayMs));
      }
    }
  } catch (loopErr) {
    console.error('[WhatsApp Worker] Outer loop error:', loopErr);
  } finally {
    isWorkerRunning = false;
  }

  return { processed, succeeded, failed, retried };
}
