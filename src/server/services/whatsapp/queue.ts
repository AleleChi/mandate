import crypto from 'crypto';
import { execute, queryOne } from '../../db';

export interface EnqueueWhatsAppJobParams {
  eventId: string;
  parentId: string;
  childId?: string | null;
  ruleId?: string | null;
  idempotencyKey?: string;
  scheduledFor?: string;
}

export interface EnqueueResult {
  jobId: string;
  queued: boolean;
  duplicate: boolean;
}

/**
 * Builds standard deterministic idempotency keys for WhatsApp deliveries.
 */
export function buildIdempotencyKey(scope: {
  type: 'campaign' | 'child_event' | 'test';
  campaignId?: string;
  parentId?: string;
  childId?: string;
  eventType?: string;
  entryId?: string;
  version?: string | number;
  adminUserId?: string;
}): string {
  if (scope.type === 'campaign') {
    if (scope.childId) {
      return `campaign:${scope.campaignId || 'general'}:parent:${scope.parentId || 'unknown'}:child:${scope.childId}:whatsapp`;
    }
    return `campaign:${scope.campaignId || 'general'}:parent:${scope.parentId || 'unknown'}:whatsapp`;
  }
  if (scope.type === 'child_event') {
    return `event:${scope.eventType || 'notice'}:entry:${scope.entryId || 'unknown'}:${scope.version || 'v1'}:whatsapp`;
  }
  return `test:${scope.adminUserId || 'super_admin'}:${Date.now()}:whatsapp`;
}

/**
 * Checks whether an error is transient (eligible for retry) or terminal.
 */
export function isTransientError(error: string | undefined | null, statusCode?: number): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();

  // Terminal errors that MUST NEVER be retried
  if (
    lower.includes('invalid phone') ||
    lower.includes('unregistered') ||
    lower.includes('not a valid whatsapp subscriber') ||
    lower.includes('opt-out') ||
    lower.includes('unconsented') ||
    lower.includes('template rejected') ||
    lower.includes('authentication failed') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    statusCode === 400 ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 404
  ) {
    return false;
  }

  // Transient errors
  if (
    lower.includes('timeout') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('connection refused') ||
    lower.includes('service unavailable') ||
    statusCode === 429 ||
    (statusCode && statusCode >= 500)
  ) {
    return true;
  }

  return false;
}

/**
 * Safely enqueues a WhatsApp job into the notification_jobs table.
 * Enforces real database idempotency using idempotency_key.
 * 
 * On duplicate idempotency key:
 * - Does not create duplicate job
 * - Reuses and returns existing queued job
 * - Does not throw an error
 */
export async function enqueueWhatsAppJob(params: EnqueueWhatsAppJobParams): Promise<EnqueueResult> {
  const scheduledFor = params.scheduledFor || new Date().toISOString();
  const ruleId = params.ruleId || null;
  const idempotencyKey = params.idempotencyKey || buildIdempotencyKey({
    type: 'campaign',
    campaignId: ruleId || 'broadcast',
    parentId: params.parentId
  });

  // 1. Check for existing job by idempotency_key
  if (idempotencyKey) {
    const existing = await queryOne(`
      SELECT id, status FROM notification_jobs 
      WHERE idempotency_key = ?
    `, [idempotencyKey]);

    if (existing) {
      return {
        jobId: existing.id,
        queued: false,
        duplicate: true
      };
    }
  }

  // Fallback check for legacy jobs without idempotency_key
  const legacyExisting = ruleId ? await queryOne(`
    SELECT id FROM notification_jobs 
    WHERE rule_id = ? AND parent_id = ? AND scheduled_for = ? AND channel = 'whatsapp'
  `, [ruleId, params.parentId, scheduledFor]) : null;

  if (legacyExisting) {
    return {
      jobId: legacyExisting.id,
      queued: false,
      duplicate: true
    };
  }

  const jobId = crypto.randomUUID();
  const nowStr = new Date().toISOString();

  try {
    await execute(`
      INSERT INTO notification_jobs (
        id, event_id, rule_id, parent_id, child_id, channel, scheduled_for, status, idempotency_key, attempt_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'whatsapp', ?, 'pending', ?, 0, ?, ?)
    `, [
      jobId,
      params.eventId,
      ruleId,
      params.parentId,
      params.childId || null,
      scheduledFor,
      idempotencyKey || null,
      nowStr,
      nowStr
    ]);

    return {
      jobId,
      queued: true,
      duplicate: false
    };
  } catch (err: any) {
    // Gracefully handle concurrent race conditions caught by the database UNIQUE index
    if (
      err?.message?.includes('UNIQUE') ||
      err?.code === '23505' ||
      err?.message?.includes('idx_notification_jobs_idempotency_key')
    ) {
      const existingAfterRace = await queryOne(`
        SELECT id FROM notification_jobs WHERE idempotency_key = ?
      `, [idempotencyKey]);

      if (existingAfterRace) {
        return {
          jobId: existingAfterRace.id,
          queued: false,
          duplicate: true
        };
      }
    }
    throw err;
  }
}
