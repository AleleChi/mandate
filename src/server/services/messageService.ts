import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import { getCurrentEventId } from './eventService';
import { notifyMessageCreated, notifyThreadUpdated } from './messagingNotificationService';

export class MessageDomainError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number = 400) {
    super(message);
    this.name = 'MessageDomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const PARENT_ALLOWED_CATEGORIES = [
  'general_support',
  'registration_support',
  'child_application'
] as const;

export const VOLUNTEER_ALLOWED_CATEGORIES = [
  'general_support',
  'duty_support',
  'training_support',
  'technical_support'
] as const;

export type ParentCategory = typeof PARENT_ALLOWED_CATEGORIES[number];
export type VolunteerCategory = typeof VOLUNTEER_ALLOWED_CATEGORIES[number];
export type MessagingRole = 'parent' | 'volunteer' | 'admin' | 'super_admin';

export function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin';
}

/**
 * Strips HTML tags and decodes basic entities to ensure plain-text storage.
 */
export function stripHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/');
}

/**
 * Normalizes single-line plain text (for subjects, previews).
 */
export function normalizeSingleLineText(input: string): string {
  return stripHtml(input).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Validates and sanitizes subject.
 */
export function validateSubject(rawSubject?: string | null): string {
  const sanitized = normalizeSingleLineText(rawSubject || '');
  if (!sanitized) {
    throw new MessageDomainError('MESSAGE_SUBJECT_REQUIRED', 'Subject is required.', 400);
  }
  if (sanitized.length > 120) {
    throw new MessageDomainError('MESSAGE_SUBJECT_TOO_LONG', 'Subject cannot exceed 120 characters.', 400);
  }
  return sanitized;
}

/**
 * Validates and sanitizes message body.
 */
export function validateBody(rawBody?: string | null): string {
  const stripped = stripHtml(rawBody || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!stripped) {
    throw new MessageDomainError('MESSAGE_BODY_REQUIRED', 'Message body is required.', 400);
  }
  if (stripped.length > 5000) {
    throw new MessageDomainError('MESSAGE_BODY_TOO_LONG', 'Message body cannot exceed 5000 characters.', 400);
  }
  return stripped;
}

/**
 * Validates category against caller role allowlist.
 */
export function validateCategory(category: string, role: 'parent' | 'volunteer' | 'admin'): string {
  const cat = (category || '').trim();
  if (role === 'parent') {
    if (!PARENT_ALLOWED_CATEGORIES.includes(cat as ParentCategory)) {
      throw new MessageDomainError('MESSAGE_CATEGORY_INVALID', `Invalid category for Parent: ${cat}`, 400);
    }
  } else if (role === 'volunteer') {
    if (!VOLUNTEER_ALLOWED_CATEGORIES.includes(cat as VolunteerCategory)) {
      throw new MessageDomainError('MESSAGE_CATEGORY_INVALID', `Invalid category for Volunteer: ${cat}`, 400);
    }
  } else if (role === 'admin') {
    const allAllowed = [...PARENT_ALLOWED_CATEGORIES, ...VOLUNTEER_ALLOWED_CATEGORIES];
    if (!allAllowed.includes(cat as any)) {
      throw new MessageDomainError('MESSAGE_CATEGORY_INVALID', `Invalid message category: ${cat}`, 400);
    }
  } else {
    throw new MessageDomainError('FORBIDDEN', 'Role not permitted to create conversations.', 403);
  }
  return cat;
}

export interface CreateThreadParams {
  eventId?: string | null;
  category: string;
  subject: string;
  body: string;
  creatorUserId: string;
  creatorRole: 'parent' | 'volunteer' | 'admin';
  parentProfileId?: string | null;
  linkedChildId?: string | null;
  linkedEntryId?: string | null;
}

/**
 * Creates a new direct message thread or reuses an existing matching open thread.
 */
export async function createThread(params: CreateThreadParams) {
  const validCategory = validateCategory(params.category, params.creatorRole);
  const validSubject = validateSubject(params.subject);
  const validBody = validateBody(params.body);

  let eventId = params.eventId || null;
  if (!eventId) {
    eventId = await getCurrentEventId();
  }

  let linkedChildId = params.linkedChildId || null;
  let linkedEntryId = params.linkedEntryId || null;

  // Validate linked child and registration entry ownership
  if (params.creatorRole === 'volunteer') {
    if (linkedChildId || linkedEntryId) {
      throw new MessageDomainError('MESSAGE_CATEGORY_INVALID', 'Volunteers cannot link child applications.', 400);
    }
  } else if (params.creatorRole === 'parent') {
    if (linkedChildId) {
      if (!params.parentProfileId) {
        throw new MessageDomainError('MESSAGE_CHILD_FORBIDDEN', 'Parent profile required to link child.', 403);
      }
      const child = await queryOne(`
        SELECT id FROM children
        WHERE id = ? AND parent_profile_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      `, [linkedChildId, params.parentProfileId]);
      if (!child) {
        throw new MessageDomainError('MESSAGE_CHILD_FORBIDDEN', 'Child not found or not owned by parent.', 403);
      }
    }

    if (linkedEntryId) {
      const entry = await queryOne(`
        SELECT id, child_id FROM child_event_entries
        WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      `, [linkedEntryId]);
      if (!entry) {
        throw new MessageDomainError('MESSAGE_CHILD_FORBIDDEN', 'Child registration entry not found.', 403);
      }
      if (linkedChildId && entry.child_id !== linkedChildId) {
        throw new MessageDomainError('MESSAGE_CHILD_FORBIDDEN', 'Linked child and entry ID mismatch.', 403);
      }
      if (!linkedChildId) {
        linkedChildId = entry.child_id;
        if (params.parentProfileId) {
          const child = await queryOne(`
            SELECT id FROM children
            WHERE id = ? AND parent_profile_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
          `, [linkedChildId, params.parentProfileId]);
          if (!child) {
            throw new MessageDomainError('MESSAGE_CHILD_FORBIDDEN', 'Entry does not belong to parent child.', 403);
          }
        }
      }
    }
  }

  // Idempotency / Duplicate thread protection:
  // 1. For child_application: reuse existing open thread for same user and entry
  if (validCategory === 'child_application' && linkedEntryId) {
    const existingThread = await queryOne(`
      SELECT * FROM message_threads
      WHERE created_by_user_id = ?
        AND category = 'child_application'
        AND linked_entry_id = ?
        AND status = 'open'
      LIMIT 1
    `, [params.creatorUserId, linkedEntryId]);

    if (existingThread) {
      // Append initial message to existing open thread
      const appended = await appendMessage({
        threadId: existingThread.id,
        senderUserId: params.creatorUserId,
        senderRole: params.creatorRole,
        body: validBody
      });
      return {
        thread: existingThread,
        message: appended.message,
        isExisting: true
      };
    }
  } else {
    // 2. Rapid double-click protection (same user, category, subject created in last 60 seconds)
    const recentThread = await queryOne(`
      SELECT * FROM message_threads
      WHERE created_by_user_id = ?
        AND category = ?
        AND subject = ?
        AND status = 'open'
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [params.creatorUserId, validCategory, validSubject, new Date(Date.now() - 60000).toISOString()]);

    if (recentThread) {
      const appended = await appendMessage({
        threadId: recentThread.id,
        senderUserId: params.creatorUserId,
        senderRole: params.creatorRole,
        body: validBody
      });
      return {
        thread: recentThread,
        message: appended.message,
        isExisting: true
      };
    }
  }

  const threadId = `thrd-${crypto.randomUUID()}`;
  const participantId = `part-${crypto.randomUUID()}`;
  const messageId = `msg-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const preview = normalizeSingleLineText(validBody).slice(0, 120);

  let createdThread: any = null;
  let createdMessage: any = null;

  await transaction(async () => {
    // 1. Create thread
    await execute(`
      INSERT INTO message_threads (
        id, event_id, category, subject, status, linked_child_id, linked_entry_id,
        created_by_user_id, last_message_at, last_message_preview, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)
    `, [
      threadId,
      eventId,
      validCategory,
      validSubject,
      linkedChildId,
      linkedEntryId,
      params.creatorUserId,
      now,
      preview,
      now,
      now
    ]);

    // 2. Add creator as participant
    await execute(`
      INSERT INTO message_thread_participants (
        id, thread_id, user_id, role, last_read_at, is_archived, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?)
    `, [
      participantId,
      threadId,
      params.creatorUserId,
      params.creatorRole,
      now,
      now
    ]);

    // 3. Insert initial message
    await execute(`
      INSERT INTO messages (
        id, thread_id, sender_user_id, sender_role, message_type, body,
        action_type, action_payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'standard', ?, NULL, NULL, ?, ?)
    `, [
      messageId,
      threadId,
      params.creatorUserId,
      params.creatorRole,
      validBody,
      now,
      now
    ]);

    createdThread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [threadId]);
    createdMessage = await queryOne('SELECT * FROM messages WHERE id = ?', [messageId]);
  });

  // Trigger Phase H notification and SSE dispatch (non-blocking)
  notifyMessageCreated({
    threadId: createdThread.id,
    messageId: createdMessage.id,
    senderUserId: params.creatorUserId,
    senderRole: params.creatorRole,
    eventId: createdThread.event_id
  }).catch(e => console.error('[createThread] Realtime dispatch error:', e));

  return {
    thread: createdThread,
    message: createdMessage,
    isExisting: false
  };
}

export interface ListThreadsParams {
  userId: string;
  role: MessagingRole;
  category?: string;
  status?: string;
  participantRole?: 'parent' | 'volunteer' | string;
  unreadOnly?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Lists threads authorized for the given user role with pagination.
 */
export async function listThreads(params: ListThreadsParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(50, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;

  let countSql = '';
  let selectSql = '';
  const queryParams: any[] = [];
  const countParams: any[] = [];

  if (isAdminRole(params.role)) {
    // Admin & Super Admin see all direct support threads
    countSql = `SELECT COUNT(*) as total FROM message_threads t WHERE 1=1`;
    selectSql = `
      SELECT t.*,
             (SELECT p.last_read_at FROM message_thread_participants p WHERE p.thread_id = t.id AND p.user_id = ?) as my_last_read_at,
             (
               SELECT COUNT(*) FROM messages m
               WHERE m.thread_id = t.id
                 AND m.sender_role NOT IN ('admin', 'super_admin')
                 AND (
                   (SELECT p2.last_read_at FROM message_thread_participants p2 WHERE p2.thread_id = t.id AND p2.user_id = ?) IS NULL
                   OR m.created_at > (SELECT p3.last_read_at FROM message_thread_participants p3 WHERE p3.thread_id = t.id AND p3.user_id = ?)
                 )
             ) as unread_count,
             (SELECT p4.role FROM message_thread_participants p4 WHERE p4.thread_id = t.id AND p4.role IN ('parent', 'volunteer') LIMIT 1) as participant_role,
             (SELECT p4.user_id FROM message_thread_participants p4 WHERE p4.thread_id = t.id AND p4.role IN ('parent', 'volunteer') LIMIT 1) as participant_user_id,
             (
               COALESCE(
                 (SELECT pp.full_name FROM message_thread_participants p5 JOIN parent_profiles pp ON pp.user_id = p5.user_id WHERE p5.thread_id = t.id AND p5.role = 'parent' LIMIT 1),
                 (SELECT vp.full_name FROM message_thread_participants p6 JOIN volunteer_profiles vp ON vp.user_id = p6.user_id WHERE p6.thread_id = t.id AND p6.role = 'volunteer' LIMIT 1),
                 (SELECT u.email FROM message_thread_participants p7 JOIN users u ON u.id = p7.user_id WHERE p7.thread_id = t.id AND p7.role IN ('parent', 'volunteer') LIMIT 1)
               )
             ) as participant_name,
             (SELECT c.full_name FROM children c WHERE c.id = t.linked_child_id) as child_full_name,
             (SELECT e.status FROM child_event_entries e WHERE e.id = t.linked_entry_id) as entry_status
      FROM message_threads t
      WHERE 1=1
    `;
    queryParams.push(params.userId, params.userId, params.userId);

    if (params.status && ['open', 'resolved'].includes(params.status)) {
      countSql += ` AND t.status = ?`;
      selectSql += ` AND t.status = ?`;
      countParams.push(params.status);
      queryParams.push(params.status);
    }

    if (params.category) {
      countSql += ` AND t.category = ?`;
      selectSql += ` AND t.category = ?`;
      countParams.push(params.category);
      queryParams.push(params.category);
    }

    if (params.participantRole && ['parent', 'volunteer'].includes(params.participantRole)) {
      countSql += ` AND EXISTS (SELECT 1 FROM message_thread_participants pr WHERE pr.thread_id = t.id AND pr.role = ?)`;
      selectSql += ` AND EXISTS (SELECT 1 FROM message_thread_participants pr WHERE pr.thread_id = t.id AND pr.role = ?)`;
      countParams.push(params.participantRole);
      queryParams.push(params.participantRole);
    }

    if (params.unreadOnly) {
      countSql += ` AND EXISTS (
        SELECT 1 FROM messages mu
        WHERE mu.thread_id = t.id
          AND mu.sender_role NOT IN ('admin', 'super_admin')
          AND (
            (SELECT p_un.last_read_at FROM message_thread_participants p_un WHERE p_un.thread_id = t.id AND p_un.user_id = ?) IS NULL
            OR mu.created_at > (SELECT p_un.last_read_at FROM message_thread_participants p_un WHERE p_un.thread_id = t.id AND p_un.user_id = ?)
          )
      )`;
      selectSql += ` AND EXISTS (
        SELECT 1 FROM messages mu
        WHERE mu.thread_id = t.id
          AND mu.sender_role NOT IN ('admin', 'super_admin')
          AND (
            (SELECT p_un.last_read_at FROM message_thread_participants p_un WHERE p_un.thread_id = t.id AND p_un.user_id = ?) IS NULL
            OR mu.created_at > (SELECT p_un.last_read_at FROM message_thread_participants p_un WHERE p_un.thread_id = t.id AND p_un.user_id = ?)
          )
      )`;
      countParams.push(params.userId, params.userId);
      queryParams.push(params.userId, params.userId);
    }

    if (params.search && params.search.trim()) {
      const s = `%${params.search.trim()}%`;
      countSql += ` AND (t.subject LIKE ? OR t.last_message_preview LIKE ?)`;
      selectSql += ` AND (t.subject LIKE ? OR t.last_message_preview LIKE ?)`;
      countParams.push(s, s);
      queryParams.push(s, s);
    }
  } else {
    // Parent or Volunteer: strictly only threads where they are an active participant
    countSql = `
      SELECT COUNT(*) as total
      FROM message_threads t
      JOIN message_thread_participants p ON p.thread_id = t.id AND p.user_id = ?
      WHERE 1=1
    `;
    countParams.push(params.userId);

    selectSql = `
      SELECT t.*, p.last_read_at as my_last_read_at, p.is_archived,
             (
               SELECT COUNT(*) FROM messages m
               WHERE m.thread_id = t.id
                 AND m.sender_user_id != ?
                 AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
             ) as unread_count
      FROM message_threads t
      JOIN message_thread_participants p ON p.thread_id = t.id AND p.user_id = ?
      WHERE 1=1
    `;
    queryParams.push(params.userId, params.userId);

    if (params.status && ['open', 'resolved'].includes(params.status)) {
      countSql += ` AND t.status = ?`;
      selectSql += ` AND t.status = ?`;
      countParams.push(params.status);
      queryParams.push(params.status);
    }

    if (params.category) {
      countSql += ` AND t.category = ?`;
      selectSql += ` AND t.category = ?`;
      countParams.push(params.category);
      queryParams.push(params.category);
    }
  }

  const countRow = await queryOne(countSql, countParams);
  const total = Number(countRow?.total || 0);

  selectSql += ` ORDER BY t.last_message_at DESC, t.created_at DESC LIMIT ? OFFSET ?`;
  queryParams.push(limit, offset);

  const threads = await query(selectSql, queryParams);

  return {
    threads: threads.map(t => ({
      ...t,
      unread_count: Number(t.unread_count || 0),
      is_unread: Number(t.unread_count || 0) > 0
    })),
    pagination: {
      page,
      limit,
      total,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total
    }
  };
}

export interface GetThreadParams {
  threadId: string;
  userId: string;
  role: MessagingRole;
}

/**
 * Retrieves a single thread if authorized.
 */
export async function getThread(params: GetThreadParams) {
  const thread = await queryOne(`
    SELECT t.*,
           (
             COALESCE(
               (SELECT pp.full_name FROM message_thread_participants p5 JOIN parent_profiles pp ON pp.user_id = p5.user_id WHERE p5.thread_id = t.id AND p5.role = 'parent' LIMIT 1),
               (SELECT vp.full_name FROM message_thread_participants p6 JOIN volunteer_profiles vp ON vp.user_id = p6.user_id WHERE p6.thread_id = t.id AND p6.role = 'volunteer' LIMIT 1),
               (SELECT u.email FROM message_thread_participants p7 JOIN users u ON u.id = p7.user_id WHERE p7.thread_id = t.id AND p7.role IN ('parent', 'volunteer') LIMIT 1)
             )
           ) as participant_name,
           (SELECT p4.role FROM message_thread_participants p4 WHERE p4.thread_id = t.id AND p4.role IN ('parent', 'volunteer') LIMIT 1) as participant_role,
           (SELECT c.full_name FROM children c WHERE c.id = t.linked_child_id) as child_full_name,
           (SELECT e.status FROM child_event_entries e WHERE e.id = t.linked_entry_id) as entry_status
    FROM message_threads t
    WHERE t.id = ?
  `, [params.threadId]);
  if (!thread) {
    throw new MessageDomainError('MESSAGE_THREAD_NOT_FOUND', 'Conversation not found.', 404);
  }

  // Authorization check
  if (!isAdminRole(params.role)) {
    const participant = await queryOne(`
      SELECT * FROM message_thread_participants
      WHERE thread_id = ? AND user_id = ?
    `, [params.threadId, params.userId]);

    if (!participant) {
      // Fail closed with 404 to avoid leaking thread existence
      throw new MessageDomainError('MESSAGE_THREAD_NOT_FOUND', 'Conversation not found.', 404);
    }
  }

  // Get participants with profile names
  const participants = await query(`
    SELECT p.id, p.thread_id, p.user_id, p.role, p.last_read_at, p.is_archived, p.created_at,
           u.email as user_email,
           COALESCE(pp.full_name, vp.full_name) as full_name
    FROM message_thread_participants p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN parent_profiles pp ON pp.user_id = p.user_id
    LEFT JOIN volunteer_profiles vp ON vp.user_id = p.user_id
    WHERE p.thread_id = ?
  `, [params.threadId]);

  return {
    thread,
    participants
  };
}

export interface GetThreadMessagesParams {
  threadId: string;
  userId: string;
  role: MessagingRole;
  page?: number;
  limit?: number;
}

/**
 * Retrieves chronological messages for an authorized thread with pagination.
 */
export async function getThreadMessages(params: GetThreadMessagesParams) {
  // Ensure authorized access to thread first
  await getThread({ threadId: params.threadId, userId: params.userId, role: params.role });

  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 50));
  const offset = (page - 1) * limit;

  const countRow = await queryOne('SELECT COUNT(*) as total FROM messages WHERE thread_id = ?', [params.threadId]);
  const total = Number(countRow?.total || 0);

  const messages = await query(`
    SELECT id, thread_id, sender_user_id, sender_role, message_type, body, action_type, action_payload_json, created_at, updated_at
    FROM messages
    WHERE thread_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT ? OFFSET ?
  `, [params.threadId, limit, offset]);

  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total
    }
  };
}

export interface AppendMessageParams {
  threadId: string;
  senderUserId: string;
  senderRole: MessagingRole;
  body: string;
}

/**
 * Appends a plain-text message to an authorized open thread and updates metadata.
 */
export async function appendMessage(params: AppendMessageParams) {
  const validBody = validateBody(params.body);

  const thread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [params.threadId]);
  if (!thread) {
    throw new MessageDomainError('MESSAGE_THREAD_NOT_FOUND', 'Conversation not found.', 404);
  }

  // Authorization check
  if (!isAdminRole(params.senderRole)) {
    const participant = await queryOne(`
      SELECT * FROM message_thread_participants
      WHERE thread_id = ? AND user_id = ?
    `, [params.threadId, params.senderUserId]);

    if (!participant) {
      throw new MessageDomainError('MESSAGE_THREAD_NOT_FOUND', 'Conversation not found.', 404);
    }

    if (thread.status === 'resolved') {
      throw new MessageDomainError(
        'MESSAGE_THREAD_RESOLVED',
        'This conversation has been resolved. Please start a new inquiry if you need assistance.',
        409
      );
    }
  }

  const messageId = `msg-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const preview = normalizeSingleLineText(validBody).slice(0, 120);

  let insertedMessage: any = null;

  await transaction(async () => {
    // 1. Insert message
    await execute(`
      INSERT INTO messages (
        id, thread_id, sender_user_id, sender_role, message_type, body,
        action_type, action_payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'standard', ?, NULL, NULL, ?, ?)
    `, [
      messageId,
      params.threadId,
      params.senderUserId,
      params.senderRole,
      validBody,
      now,
      now
    ]);

    // 2. Update thread metadata
    await execute(`
      UPDATE message_threads
      SET last_message_at = ?,
          last_message_preview = ?,
          updated_at = ?
      WHERE id = ?
    `, [now, preview, now, params.threadId]);

    // 3. Mark sender's participant record as read up to this message
    const senderParticipant = await queryOne(`
      SELECT id FROM message_thread_participants
      WHERE thread_id = ? AND user_id = ?
    `, [params.threadId, params.senderUserId]);

    if (senderParticipant) {
      await execute(`
        UPDATE message_thread_participants
        SET last_read_at = ?
        WHERE id = ?
      `, [now, senderParticipant.id]);
    } else if (isAdminRole(params.senderRole)) {
      // Auto-register admin participant if not already present
      const partId = `part-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO message_thread_participants (
          id, thread_id, user_id, role, last_read_at, is_archived, created_at
        ) VALUES (?, ?, ?, 'admin', ?, 0, ?)
      `, [partId, params.threadId, params.senderUserId, now, now]);
    }

    insertedMessage = await queryOne('SELECT * FROM messages WHERE id = ?', [messageId]);
  });

  // Record audit log for Admin actions
  if (isAdminRole(params.senderRole)) {
    try {
      await execute(`
        INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
        VALUES (?, ?, ?, 'ADMIN_MESSAGE_SENT', 'message_thread', ?, ?, ?)
      `, [
        `audit-${crypto.randomUUID()}`,
        params.senderUserId,
        params.senderRole,
        params.threadId,
        JSON.stringify({ threadId: params.threadId, messageId }),
        now
      ]);
    } catch (auditErr) {
      console.error('[messageService] Failed to record audit log:', auditErr);
    }
  }

  // Trigger Phase H notification and SSE dispatch (non-blocking)
  notifyMessageCreated({
    threadId: params.threadId,
    messageId: insertedMessage.id,
    senderUserId: params.senderUserId,
    senderRole: params.senderRole
  }).catch(e => console.error('[appendMessage] Realtime dispatch error:', e));

  return {
    message: insertedMessage
  };
}

export interface MarkThreadReadParams {
  threadId: string;
  userId: string;
  role: MessagingRole;
}

/**
 * Marks thread read for the caller without affecting other participants.
 */
export async function markThreadRead(params: MarkThreadReadParams) {
  // Authorization verify
  await getThread({ threadId: params.threadId, userId: params.userId, role: params.role });

  const now = new Date().toISOString();
  const participant = await queryOne(`
    SELECT id FROM message_thread_participants
    WHERE thread_id = ? AND user_id = ?
  `, [params.threadId, params.userId]);

  if (participant) {
    await execute(`
      UPDATE message_thread_participants
      SET last_read_at = ?
      WHERE id = ?
    `, [now, participant.id]);
  } else if (isAdminRole(params.role)) {
    // Admin viewing thread for first time: insert participant row with last_read_at
    const partId = `part-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO message_thread_participants (
        id, thread_id, user_id, role, last_read_at, is_archived, created_at
      ) VALUES (?, ?, ?, 'admin', ?, 0, ?)
    `, [partId, params.threadId, params.userId, now, now]);
  }

  return { success: true, markedRead: true, readAt: now };
}

export interface ResolveThreadParams {
  threadId: string;
  adminUserId: string;
  adminRole: string;
}

/**
 * Resolves an open conversation (Admin only).
 */
export async function resolveThread(params: ResolveThreadParams) {
  if (!['admin', 'super_admin'].includes(params.adminRole)) {
    throw new MessageDomainError('MESSAGE_THREAD_FORBIDDEN', 'Only admins can resolve conversations.', 403);
  }

  const thread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [params.threadId]);
  if (!thread) {
    throw new MessageDomainError('MESSAGE_THREAD_NOT_FOUND', 'Conversation not found.', 404);
  }

  const now = new Date().toISOString();
  await execute(`
    UPDATE message_threads
    SET status = 'resolved', updated_at = ?
    WHERE id = ?
  `, [now, params.threadId]);

  try {
    await execute(`
      INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
      VALUES (?, ?, ?, 'THREAD_RESOLVED', 'message_thread', ?, ?, ?)
    `, [
      `audit-${crypto.randomUUID()}`,
      params.adminUserId,
      params.adminRole,
      params.threadId,
      JSON.stringify({ threadId: params.threadId, previousStatus: thread.status, newStatus: 'resolved' }),
      now
    ]);
  } catch (auditErr) {
    console.error('[messageService] Failed to record audit log for resolve:', auditErr);
  }

  const updated = await queryOne('SELECT * FROM message_threads WHERE id = ?', [params.threadId]);

  // Trigger Phase H thread.updated SSE dispatch (non-blocking)
  notifyThreadUpdated({
    threadId: params.threadId,
    status: 'resolved',
    adminUserId: params.adminUserId
  }).catch(e => console.error('[resolveThread] Realtime dispatch error:', e));

  return { success: true, status: 'resolved', updated_at: now, thread: updated };
}

export interface ReopenThreadParams {
  threadId: string;
  adminUserId: string;
  adminRole: string;
}

/**
 * Reopens a resolved conversation (Admin only).
 */
export async function reopenThread(params: ReopenThreadParams) {
  if (!['admin', 'super_admin'].includes(params.adminRole)) {
    throw new MessageDomainError('MESSAGE_THREAD_FORBIDDEN', 'Only admins can reopen conversations.', 403);
  }

  const thread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [params.threadId]);
  if (!thread) {
    throw new MessageDomainError('MESSAGE_THREAD_NOT_FOUND', 'Conversation not found.', 404);
  }

  const now = new Date().toISOString();
  await execute(`
    UPDATE message_threads
    SET status = 'open', updated_at = ?
    WHERE id = ?
  `, [now, params.threadId]);

  try {
    await execute(`
      INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
      VALUES (?, ?, ?, 'THREAD_REOPENED', 'message_thread', ?, ?, ?)
    `, [
      `audit-${crypto.randomUUID()}`,
      params.adminUserId,
      params.adminRole,
      params.threadId,
      JSON.stringify({ threadId: params.threadId, previousStatus: thread.status, newStatus: 'open' }),
      now
    ]);
  } catch (auditErr) {
    console.error('[messageService] Failed to record audit log for reopen:', auditErr);
  }

  const updated = await queryOne('SELECT * FROM message_threads WHERE id = ?', [params.threadId]);

  // Trigger Phase H thread.updated SSE dispatch (non-blocking)
  notifyThreadUpdated({
    threadId: params.threadId,
    status: 'open',
    adminUserId: params.adminUserId
  }).catch(e => console.error('[reopenThread] Realtime dispatch error:', e));

  return { success: true, status: 'open', updated_at: now, thread: updated };
}

/**
 * Computes unread thread and message counts for the authenticated caller.
 */
export async function getUnreadCount(params: { userId: string; role: MessagingRole }) {
  if (isAdminRole(params.role)) {
    const row = await queryOne(`
      SELECT COUNT(DISTINCT t.id) as unread_threads,
             COUNT(m.id) as unread_messages
      FROM message_threads t
      LEFT JOIN message_thread_participants p ON p.thread_id = t.id AND p.user_id = ?
      JOIN messages m ON m.thread_id = t.id AND m.sender_role NOT IN ('admin', 'super_admin')
      WHERE t.status = 'open'
        AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
    `, [params.userId]);

    const unreadThreads = Number(row?.unread_threads || 0);
    const unreadMessages = Number(row?.unread_messages || 0);

    return {
      unreadThreads,
      unreadMessages,
      unreadThreadCount: unreadThreads,
      unreadMessageCount: unreadMessages,
      unreadCount: unreadThreads
    };
  } else {
    const row = await queryOne(`
      SELECT COUNT(DISTINCT t.id) as unread_threads,
             COUNT(m.id) as unread_messages
      FROM message_threads t
      JOIN message_thread_participants p ON p.thread_id = t.id AND p.user_id = ?
      JOIN messages m ON m.thread_id = t.id AND m.sender_user_id != ?
      WHERE (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
    `, [params.userId, params.userId]);

    const unreadThreads = Number(row?.unread_threads || 0);
    const unreadMessages = Number(row?.unread_messages || 0);

    return {
      unreadThreads,
      unreadMessages,
      unreadThreadCount: unreadThreads,
      unreadMessageCount: unreadMessages,
      unreadCount: unreadThreads
    };
  }
}
