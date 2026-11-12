import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import {
  sendParentRegistrationInviteEmail,
  sendParentRegistrationReminderEmail,
  SendEmailResult
} from './email';
import { buildPublicAppUrl } from '../utils/urlHelper';

export const REGISTRATION_EMAIL_AUDIT_ACTIONS = [
  'SEND_INVITATION',
  'RESEND_INVITATION',
  'SEND_PARENT_REGISTRATION_INVITE',
  'RESEND_PARENT_REGISTRATION_INVITE',
  'SEND_PARENT_REGISTRATION_REMINDER'
] as const;

export type RegistrationAccessActionResult =
  | 'invitation_sent'
  | 'invitation_resent'
  | 'registration_reminder_sent';

export interface RegistrationEmailStats {
  registrationEmailCount: number;
  registrationEmailLastSentAt: string | null;
  lastRegistrationEmailStatus: 'sent' | 'failed' | null;
  lastRegistrationEmailAction: RegistrationAccessActionResult | null;
  latestInviteTimestamp: string | null;
  latestInviteStatus: 'sent' | 'failed';
}

export interface RegistrationEmailProviderOverrides {
  sendInvite?: (params: Parameters<typeof sendParentRegistrationInviteEmail>[0]) => Promise<SendEmailResult>;
  sendReminder?: (params: Parameters<typeof sendParentRegistrationReminderEmail>[0]) => Promise<SendEmailResult>;
}

/**
 * Shared invite-token helper: revokes any previous unused invitation tokens for a user
 * and creates a fresh hashed `admin_invite` token with configured expiry.
 */
export async function issueOrReplaceInviteToken(params: {
  userId: string;
  revokedByUserId?: string | null;
  nowStr?: string;
}): Promise<{ rawToken: string; expiresAt: string; nowStr: string }> {
  const nowStr = params.nowStr || new Date().toISOString();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const tokenId = crypto.randomUUID();
  const expiryHours = parseInt(process.env.INVITATION_EXPIRY_HOURS || '72', 10);
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  await execute(
    'UPDATE auth_tokens SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL',
    [nowStr, params.revokedByUserId || null, params.userId]
  );

  await execute(
    `INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
     VALUES (?, ?, ?, 'admin_invite', ?, ?)`,
    [tokenId, params.userId, tokenHash, expiresAt, nowStr]
  );

  return { rawToken, expiresAt, nowStr };
}

/**
 * Aggregates registration & invitation email audit history per user ID.
 */
export async function buildRegistrationEmailStatsMap(
  userIds: string[]
): Promise<Record<string, RegistrationEmailStats>> {
  const cleanUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const statsByUserId: Record<string, RegistrationEmailStats> = {};
  if (cleanUserIds.length === 0) return statsByUserId;

  const userPlaceholders = cleanUserIds.map(() => '?').join(',');
  const actionPlaceholders = REGISTRATION_EMAIL_AUDIT_ACTIONS.map(() => '?').join(',');

  const logs = await query<{
    target_id: string;
    action: string;
    details: string | null;
    timestamp: string;
  }>(
    `SELECT target_id, action, details, timestamp
     FROM audit_logs
     WHERE action IN (${actionPlaceholders})
       AND target_id IN (${userPlaceholders})
     ORDER BY timestamp DESC`,
    [...REGISTRATION_EMAIL_AUDIT_ACTIONS, ...cleanUserIds]
  );

  for (const log of logs) {
    if (!statsByUserId[log.target_id]) {
      statsByUserId[log.target_id] = {
        registrationEmailCount: 0,
        registrationEmailLastSentAt: null,
        lastRegistrationEmailStatus: null,
        lastRegistrationEmailAction: null,
        latestInviteTimestamp: null,
        latestInviteStatus: 'sent'
      };
    }

    const entry = statsByUserId[log.target_id];
    let parsedDetails: any = null;
    try {
      parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
    } catch {
      parsedDetails = null;
    }

    const deliveryStatus: 'sent' | 'failed' = parsedDetails?.status === 'failed' ? 'failed' : 'sent';

    // Capture the overall latest event (logs are ordered DESC)
    if (entry.lastRegistrationEmailStatus === null) {
      entry.lastRegistrationEmailStatus = deliveryStatus;
      if (parsedDetails?.action) {
        entry.lastRegistrationEmailAction = parsedDetails.action;
      } else if (log.action === 'SEND_PARENT_REGISTRATION_REMINDER') {
        entry.lastRegistrationEmailAction = 'registration_reminder_sent';
      } else if (log.action === 'RESEND_PARENT_REGISTRATION_INVITE' || log.action === 'RESEND_INVITATION') {
        entry.lastRegistrationEmailAction = 'invitation_resent';
      } else {
        entry.lastRegistrationEmailAction = 'invitation_sent';
      }
    }

    // Track invite-specific latest state for pending/failed status badges
    const isInviteAction = log.action !== 'SEND_PARENT_REGISTRATION_REMINDER';
    if (isInviteAction && entry.latestInviteTimestamp === null) {
      entry.latestInviteTimestamp = log.timestamp;
      entry.latestInviteStatus = deliveryStatus;
    }

    // Count all delivered registration/invite emails
    if (deliveryStatus === 'sent') {
      entry.registrationEmailCount += 1;
      if (!entry.registrationEmailLastSentAt) {
        entry.registrationEmailLastSentAt = log.timestamp;
      }
    }
  }

  return statsByUserId;
}

export interface SingleParentAccessEmailOutcome {
  parentId: string;
  success: boolean;
  status: 'sent' | 'failed' | 'skipped';
  httpStatus: number;
  action?: RegistrationAccessActionResult;
  code?: string;
  error?: string;
}

/**
 * Resolves a zero-child Parent's account state (`no_account`, `invitation_pending`,
 * `email_delivery_failed`, or `active`) and dispatches the appropriate registration access email.
 */
export async function sendRegistrationAccessEmailForParent(params: {
  parentId: string;
  adminUserId: string;
  adminRole: string;
  emailOverrides?: RegistrationEmailProviderOverrides;
}): Promise<SingleParentAccessEmailOutcome> {
  const row = await queryOne<any>(
    `SELECT
       p.*,
       u.id as uid,
       u.email as user_email,
       u.password_hash as user_password_hash,
       u.role as user_role
     FROM parent_profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
    [params.parentId]
  );

  if (!row) {
    return {
      parentId: params.parentId,
      success: false,
      status: 'skipped',
      httpStatus: 404,
      code: 'NOT_FOUND',
      error: 'Parent profile not found.'
    };
  }

  if (row.is_deleted === 1) {
    return {
      parentId: params.parentId,
      success: false,
      status: 'skipped',
      httpStatus: 400,
      code: 'PARENT_REMOVED',
      error: 'Cannot send registration access email to a removed parent.'
    };
  }

  const childrenRow = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt
     FROM children
     WHERE parent_profile_id = ?
       AND (is_deleted = 0 OR is_deleted IS NULL)`,
    [row.id]
  );
  const childrenCount = Number(childrenRow?.cnt || 0);
  if (childrenCount > 0) {
    return {
      parentId: params.parentId,
      success: false,
      status: 'skipped',
      httpStatus: 400,
      code: 'PARENT_HAS_CHILDREN',
      error: 'This parent already has registered children.'
    };
  }

  const cleanEmail = String(row.email || row.user_email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return {
      parentId: params.parentId,
      success: false,
      status: 'skipped',
      httpStatus: 400,
      code: 'NO_EMAIL',
      error: 'Parent profile does not have an email address.'
    };
  }

  const nowStr = new Date().toISOString();
  const recipientName = row.full_name || 'Parent';
  const sendInviteFn = params.emailOverrides?.sendInvite || sendParentRegistrationInviteEmail;
  const sendReminderFn = params.emailOverrides?.sendReminder || sendParentRegistrationReminderEmail;

  // Case A: no_account (`profile_no_account`) -> reuse SAME user ID, promote to invited_pending, send invite
  if (row.user_password_hash === 'profile_no_account') {
    let rawToken = '';
    let expiresAt = '';

    await transaction(async () => {
      await execute(
        `UPDATE users SET password_hash = 'invited_pending', updated_at = ? WHERE id = ?`,
        [nowStr, row.user_id]
      );
      const tokenRes = await issueOrReplaceInviteToken({
        userId: row.user_id,
        revokedByUserId: params.adminUserId,
        nowStr
      });
      rawToken = tokenRes.rawToken;
      expiresAt = tokenRes.expiresAt;
    });

    const inviteLink = buildPublicAppUrl(`/admin/accept-invite?token=${rawToken}`);
    let emailResult: SendEmailResult | null = null;
    let deliveryErr: string | null = null;
    try {
      emailResult = await sendInviteFn({
        recipientEmail: cleanEmail,
        recipientName,
        inviteLink,
        expiresAt
      });
    } catch (err: any) {
      deliveryErr = err?.message || 'Email delivery failed';
    }

    const delivered = Boolean(emailResult && emailResult.success);
    const finalError = delivered ? null : (emailResult?.error || deliveryErr || 'Email delivery failed');

    try {
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
         VALUES (?, ?, ?, 'SEND_PARENT_REGISTRATION_INVITE', 'user', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          params.adminUserId,
          params.adminRole || 'admin',
          row.user_id,
          JSON.stringify({
            email: cleanEmail,
            parentId: row.id,
            action: 'invitation_sent',
            status: delivered ? 'sent' : 'failed',
            providerMessageId: emailResult?.id || null,
            error: finalError,
            attemptedAt: nowStr
          }),
          nowStr
        ]
      );
    } catch {}

    if (!delivered) {
      return {
        parentId: row.id,
        success: false,
        status: 'failed',
        httpStatus: 200,
        action: 'invitation_sent',
        code: 'EMAIL_DELIVERY_FAILED',
        error: 'Email could not be delivered. Try again.'
      };
    }

    return {
      parentId: row.id,
      success: true,
      status: 'sent',
      httpStatus: 200,
      action: 'invitation_sent'
    };
  }

  // Case B: invitation_pending or email_delivery_failed (`invited_pending`) -> revoke old token & resend invite
  if (row.user_password_hash === 'invited_pending') {
    let rawToken = '';
    let expiresAt = '';

    await transaction(async () => {
      const tokenRes = await issueOrReplaceInviteToken({
        userId: row.user_id,
        revokedByUserId: params.adminUserId,
        nowStr
      });
      rawToken = tokenRes.rawToken;
      expiresAt = tokenRes.expiresAt;
    });

    const inviteLink = buildPublicAppUrl(`/admin/accept-invite?token=${rawToken}`);
    let emailResult: SendEmailResult | null = null;
    let deliveryErr: string | null = null;
    try {
      emailResult = await sendInviteFn({
        recipientEmail: cleanEmail,
        recipientName,
        inviteLink,
        expiresAt
      });
    } catch (err: any) {
      deliveryErr = err?.message || 'Email delivery failed';
    }

    const delivered = Boolean(emailResult && emailResult.success);
    const finalError = delivered ? null : (emailResult?.error || deliveryErr || 'Email delivery failed');

    try {
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
         VALUES (?, ?, ?, 'RESEND_PARENT_REGISTRATION_INVITE', 'user', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          params.adminUserId,
          params.adminRole || 'admin',
          row.user_id,
          JSON.stringify({
            email: cleanEmail,
            parentId: row.id,
            action: 'invitation_resent',
            status: delivered ? 'sent' : 'failed',
            providerMessageId: emailResult?.id || null,
            error: finalError,
            attemptedAt: nowStr
          }),
          nowStr
        ]
      );
    } catch {}

    if (!delivered) {
      return {
        parentId: row.id,
        success: false,
        status: 'failed',
        httpStatus: 200,
        action: 'invitation_resent',
        code: 'EMAIL_DELIVERY_FAILED',
        error: 'Email could not be delivered. Try again.'
      };
    }

    return {
      parentId: row.id,
      success: true,
      status: 'sent',
      httpStatus: 200,
      action: 'invitation_resent'
    };
  }

  // Case C: active account -> send sign-in reminder email ONLY (no password mutation, no invite token)
  const signInUrl = buildPublicAppUrl('/parent/sign-in');
  let emailResult: SendEmailResult | null = null;
  let deliveryErr: string | null = null;
  try {
    emailResult = await sendReminderFn({
      recipientEmail: cleanEmail,
      recipientName,
      signInUrl
    });
  } catch (err: any) {
    deliveryErr = err?.message || 'Email delivery failed';
  }

  const delivered = Boolean(emailResult && emailResult.success);
  const finalError = delivered ? null : (emailResult?.error || deliveryErr || 'Email delivery failed');

  try {
    await execute(
      `INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
       VALUES (?, ?, ?, 'SEND_PARENT_REGISTRATION_REMINDER', 'user', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        params.adminUserId,
        params.adminRole || 'admin',
        row.user_id,
        JSON.stringify({
          email: cleanEmail,
          parentId: row.id,
          action: 'registration_reminder_sent',
          status: delivered ? 'sent' : 'failed',
          providerMessageId: emailResult?.id || null,
          error: finalError,
          attemptedAt: nowStr
        }),
        nowStr
      ]
    );
  } catch {}

  if (!delivered) {
    return {
      parentId: row.id,
      success: false,
      status: 'failed',
      httpStatus: 200,
      action: 'registration_reminder_sent',
      code: 'EMAIL_DELIVERY_FAILED',
      error: 'Email could not be delivered. Try again.'
    };
  }

  return {
    parentId: row.id,
    success: true,
    status: 'sent',
    httpStatus: 200,
    action: 'registration_reminder_sent'
  };
}

/**
 * Bulk processor for zero-child registration access emails.
 * Processes each parent independently so single failures never abort the batch.
 */
export async function sendBulkRegistrationAccessEmails(params: {
  parentIds: string[];
  adminUserId: string;
  adminRole: string;
  emailOverrides?: RegistrationEmailProviderOverrides;
}): Promise<{
  success: boolean;
  requested: number;
  sent: number;
  failed: number;
  skipped: number;
  results: SingleParentAccessEmailOutcome[];
}> {
  const uniqueIds = Array.from(new Set(params.parentIds.map((id) => String(id).trim()).filter(Boolean)));
  const results: SingleParentAccessEmailOutcome[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const parentId of uniqueIds) {
    try {
      const outcome = await sendRegistrationAccessEmailForParent({
        parentId,
        adminUserId: params.adminUserId,
        adminRole: params.adminRole,
        emailOverrides: params.emailOverrides
      });
      results.push(outcome);
      if (outcome.status === 'sent') sent += 1;
      else if (outcome.status === 'failed') failed += 1;
      else skipped += 1;
    } catch (err: any) {
      failed += 1;
      results.push({
        parentId,
        success: false,
        status: 'failed',
        httpStatus: 500,
        code: 'EMAIL_DELIVERY_FAILED',
        error: err?.message || 'Unexpected error processing parent.'
      });
    }
  }

  return {
    success: true,
    requested: uniqueIds.length,
    sent,
    failed,
    skipped,
    results
  };
}

