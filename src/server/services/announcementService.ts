import crypto from 'crypto';
import { query, queryOne, execute, transaction, REAL_EVENT_ID } from '../db';
import {
  MessageDomainError,
  validateSubject,
  validateBody,
  isAdminRole
} from './messageService';
import { notifyAnnouncementPublished } from './messagingNotificationService';

export const ALLOWED_AUDIENCE_TYPES = [
  'all_parents',
  'all_volunteers',
  'everyone',
  'selected_parent',
  'selected_volunteer'
] as const;

export type AnnouncementAudienceType = typeof ALLOWED_AUDIENCE_TYPES[number];

export interface CreateAnnouncementParams {
  title: string;
  body: string;
  audienceType: string;
  targetUserId?: string | null;
  adminUserId: string;
  adminRole: string;
  eventId?: string | null;
}

/**
 * Validates and publishes a new announcement.
 * Transaction-safe: immediately published upon creation with published_at set.
 */
export async function createAnnouncement(params: CreateAnnouncementParams) {
  // 1. Authorize admin
  if (!isAdminRole(params.adminRole)) {
    throw new MessageDomainError('ANNOUNCEMENT_FORBIDDEN', 'Only admins can publish announcements.', 403);
  }

  // 2. Validate audience
  const audience = (params.audienceType || '').trim();
  if (!ALLOWED_AUDIENCE_TYPES.includes(audience as AnnouncementAudienceType)) {
    throw new MessageDomainError(
      'ANNOUNCEMENT_INVALID_AUDIENCE',
      `Invalid audience type: ${audience}. Allowed: ${ALLOWED_AUDIENCE_TYPES.join(', ')}`,
      400
    );
  }
  const audienceType = audience as AnnouncementAudienceType;

  // 3. Validate content
  const title = validateSubject(params.title);
  const body = validateBody(params.body);

  // 4. Validate selected recipient if applicable
  let resolvedTargetUserId: string | null = null;

  if (audienceType === 'selected_parent') {
    const rawTarget = (params.targetUserId || '').trim();
    if (!rawTarget) {
      throw new MessageDomainError('ANNOUNCEMENT_TARGET_USER_REQUIRED', 'Selected parent recipient is required.', 400);
    }

    const user = await queryOne('SELECT id, role, status FROM users WHERE id = ?', [rawTarget]);
    if (!user || user.status === 'suspended' || user.status === 'revoked') {
      throw new MessageDomainError('ANNOUNCEMENT_TARGET_NOT_FOUND', 'Selected recipient user was not found or is inactive.', 404);
    }

    const parentProfile = await queryOne('SELECT id FROM parent_profiles WHERE user_id = ?', [rawTarget]);
    if (user.role !== 'parent' && !parentProfile) {
      throw new MessageDomainError('ANNOUNCEMENT_TARGET_NOT_PARENT', 'Selected recipient is not a valid Parent.', 400);
    }

    resolvedTargetUserId = user.id;
  } else if (audienceType === 'selected_volunteer') {
    const rawTarget = (params.targetUserId || '').trim();
    if (!rawTarget) {
      throw new MessageDomainError('ANNOUNCEMENT_TARGET_USER_REQUIRED', 'Selected volunteer recipient is required.', 400);
    }

    const user = await queryOne('SELECT id, role, status FROM users WHERE id = ?', [rawTarget]);
    if (!user || user.status === 'suspended' || user.status === 'revoked') {
      throw new MessageDomainError('ANNOUNCEMENT_TARGET_NOT_FOUND', 'Selected recipient user was not found or is inactive.', 404);
    }

    const volunteerProfile = await queryOne('SELECT id FROM volunteer_profiles WHERE user_id = ?', [rawTarget]);
    if (user.role !== 'volunteer' && !volunteerProfile) {
      throw new MessageDomainError('ANNOUNCEMENT_TARGET_NOT_VOLUNTEER', 'Selected recipient is not a valid Volunteer.', 400);
    }

    resolvedTargetUserId = user.id;
  } else {
    // Broad audiences must not pin target_user_id
    resolvedTargetUserId = null;
  }

  const announcementId = `anc-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const eventId = params.eventId || REAL_EVENT_ID;

  await transaction(async () => {
    await execute(`
      INSERT INTO announcements (
        id, event_id, title, body, audience_type, target_user_id, created_by_user_id, published_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      announcementId,
      eventId,
      title,
      body,
      audienceType,
      resolvedTargetUserId,
      params.adminUserId,
      now,
      now
    ]);

    // Record audit log (exclude message body for privacy & storage hygiene)
    try {
      await execute(`
        INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
        VALUES (?, ?, ?, 'ADMIN_ANNOUNCEMENT_PUBLISHED', 'announcement', ?, ?, ?)
      `, [
        `audit-${crypto.randomUUID()}`,
        params.adminUserId,
        params.adminRole,
        announcementId,
        JSON.stringify({
          announcementId,
          audienceType,
          targetUserId: resolvedTargetUserId,
          eventId
        }),
        now
      ]);
    } catch (auditErr) {
      console.error('[announcementService] Failed to record audit log:', auditErr);
    }
  });

  const created = await queryOne('SELECT * FROM announcements WHERE id = ?', [announcementId]);

  // Trigger Phase H notification and SSE dispatch (non-blocking)
  notifyAnnouncementPublished({
    announcementId: created.id,
    audienceType: created.audience_type,
    targetUserId: created.target_user_id,
    adminUserId: params.adminUserId,
    eventId: created.event_id
  }).catch(e => console.error('[createAnnouncement] Realtime dispatch error:', e));

  return {
    success: true,
    announcement: created
  };
}

/**
 * List announcements for Admin with total reads summary and target user details.
 */
export async function listAdminAnnouncements(params: { page?: number; limit?: number }) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;

  const countRow = await queryOne('SELECT COUNT(*) as total FROM announcements');
  const total = Number(countRow?.total || 0);

  const announcements = await query(`
    SELECT
      a.id,
      a.event_id,
      a.title,
      a.body,
      a.audience_type,
      a.target_user_id,
      a.created_by_user_id,
      a.published_at,
      a.created_at,
      COUNT(ar.id) as total_reads,
      u.email as target_user_email,
      pp.full_name as target_parent_name,
      vp.full_name as target_volunteer_name
    FROM announcements a
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id
    LEFT JOIN users u ON u.id = a.target_user_id
    LEFT JOIN parent_profiles pp ON pp.user_id = a.target_user_id
    LEFT JOIN volunteer_profiles vp ON vp.user_id = a.target_user_id
    GROUP BY
      a.id, a.event_id, a.title, a.body, a.audience_type,
      a.target_user_id, a.created_by_user_id, a.published_at, a.created_at,
      u.email, pp.full_name, vp.full_name
    ORDER BY a.published_at DESC
    LIMIT ? OFFSET ?
  `, [limit, offset]);

  return {
    announcements: announcements.map(a => ({
      ...a,
      total_reads: Number(a.total_reads || 0)
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Get single announcement for Admin.
 */
export async function getAdminAnnouncement(id: string) {
  const announcement = await queryOne(`
    SELECT
      a.id,
      a.event_id,
      a.title,
      a.body,
      a.audience_type,
      a.target_user_id,
      a.created_by_user_id,
      a.published_at,
      a.created_at,
      COUNT(ar.id) as total_reads,
      u.email as target_user_email,
      pp.full_name as target_parent_name,
      vp.full_name as target_volunteer_name
    FROM announcements a
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id
    LEFT JOIN users u ON u.id = a.target_user_id
    LEFT JOIN parent_profiles pp ON pp.user_id = a.target_user_id
    LEFT JOIN volunteer_profiles vp ON vp.user_id = a.target_user_id
    WHERE a.id = ?
    GROUP BY
      a.id, a.event_id, a.title, a.body, a.audience_type,
      a.target_user_id, a.created_by_user_id, a.published_at, a.created_at,
      u.email, pp.full_name, vp.full_name
  `, [id]);

  if (!announcement) {
    throw new MessageDomainError('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found.', 404);
  }

  return {
    announcement: {
      ...announcement,
      total_reads: Number(announcement.total_reads || 0)
    }
  };
}

/**
 * Search candidates for selected parent or volunteer announcement.
 * Privacy-safe: returns only user id, full_name, and email. No child or application data.
 */
export async function searchAnnouncementRecipients(role: 'parent' | 'volunteer', searchTerm?: string) {
  const queryTerm = (searchTerm || '').trim().toLowerCase();
  const searchPattern = `%${queryTerm}%`;

  if (role === 'parent') {
    if (queryTerm) {
      const rows = await query(`
        SELECT u.id, COALESCE(pp.full_name, u.email) as name, u.email
        FROM users u
        LEFT JOIN parent_profiles pp ON pp.user_id = u.id
        WHERE u.status NOT IN ('suspended', 'revoked')
          AND (u.role = 'parent' OR pp.id IS NOT NULL)
          AND (LOWER(COALESCE(pp.full_name, '')) LIKE ? OR LOWER(u.email) LIKE ?)
        ORDER BY pp.full_name ASC, u.email ASC
        LIMIT 25
      `, [searchPattern, searchPattern]);
      return { recipients: rows };
    } else {
      const rows = await query(`
        SELECT u.id, COALESCE(pp.full_name, u.email) as name, u.email
        FROM users u
        LEFT JOIN parent_profiles pp ON pp.user_id = u.id
        WHERE u.status NOT IN ('suspended', 'revoked')
          AND (u.role = 'parent' OR pp.id IS NOT NULL)
        ORDER BY pp.full_name ASC, u.email ASC
        LIMIT 25
      `);
      return { recipients: rows };
    }
  } else if (role === 'volunteer') {
    if (queryTerm) {
      const rows = await query(`
        SELECT u.id, COALESCE(vp.full_name, u.email) as name, u.email
        FROM users u
        LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
        WHERE u.status NOT IN ('suspended', 'revoked')
          AND (u.role = 'volunteer' OR vp.id IS NOT NULL)
          AND (LOWER(COALESCE(vp.full_name, '')) LIKE ? OR LOWER(u.email) LIKE ?)
        ORDER BY vp.full_name ASC, u.email ASC
        LIMIT 25
      `, [searchPattern, searchPattern]);
      return { recipients: rows };
    } else {
      const rows = await query(`
        SELECT u.id, COALESCE(vp.full_name, u.email) as name, u.email
        FROM users u
        LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
        WHERE u.status NOT IN ('suspended', 'revoked')
          AND (u.role = 'volunteer' OR vp.id IS NOT NULL)
        ORDER BY vp.full_name ASC, u.email ASC
        LIMIT 25
      `);
      return { recipients: rows };
    }
  }

  throw new MessageDomainError('ANNOUNCEMENT_INVALID_ROLE', 'Invalid recipient role.', 400);
}

/**
 * List announcements for a Parent.
 * Accessible: all_parents, everyone, OR selected_parent targeting this user.
 * Returns only sanitized public announcement info + user's own read status.
 */
export async function listParentAnnouncements(params: { parentUserId: string; page?: number; limit?: number }) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;

  const countRow = await queryOne(`
    SELECT COUNT(*) as total
    FROM announcements a
    WHERE (a.audience_type IN ('all_parents', 'everyone') OR (a.audience_type = 'selected_parent' AND a.target_user_id = ?))
  `, [params.parentUserId]);
  const total = Number(countRow?.total || 0);

  const rows = await query(`
    SELECT
      a.id,
      a.event_id,
      a.title,
      a.body,
      a.audience_type,
      a.published_at,
      a.created_at,
      CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END as is_read,
      ar.read_at
    FROM announcements a
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
    WHERE (a.audience_type IN ('all_parents', 'everyone') OR (a.audience_type = 'selected_parent' AND a.target_user_id = ?))
    ORDER BY a.published_at DESC
    LIMIT ? OFFSET ?
  `, [params.parentUserId, params.parentUserId, limit, offset]);

  return {
    announcements: rows.map(r => ({
      id: r.id,
      event_id: r.event_id,
      title: r.title,
      body: r.body,
      audience_type: r.audience_type,
      published_at: r.published_at,
      created_at: r.created_at,
      is_read: Boolean(r.is_read),
      read_at: r.read_at || null
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Get single announcement for Parent.
 */
export async function getParentAnnouncement(params: { id: string; parentUserId: string }) {
  const r = await queryOne(`
    SELECT
      a.id,
      a.event_id,
      a.title,
      a.body,
      a.audience_type,
      a.published_at,
      a.created_at,
      CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END as is_read,
      ar.read_at
    FROM announcements a
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
    WHERE a.id = ?
      AND (a.audience_type IN ('all_parents', 'everyone') OR (a.audience_type = 'selected_parent' AND a.target_user_id = ?))
  `, [params.parentUserId, params.id, params.parentUserId]);

  if (!r) {
    throw new MessageDomainError('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found.', 404);
  }

  return {
    announcement: {
      id: r.id,
      event_id: r.event_id,
      title: r.title,
      body: r.body,
      audience_type: r.audience_type,
      published_at: r.published_at,
      created_at: r.created_at,
      is_read: Boolean(r.is_read),
      read_at: r.read_at || null
    }
  };
}

/**
 * Unread count for Parent announcements.
 */
export async function getParentAnnouncementUnreadCount(params: { parentUserId: string }) {
  const row = await queryOne(`
    SELECT COUNT(*) as unread_count
    FROM announcements a
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
    WHERE (a.audience_type IN ('all_parents', 'everyone') OR (a.audience_type = 'selected_parent' AND a.target_user_id = ?))
      AND ar.id IS NULL
  `, [params.parentUserId, params.parentUserId]);

  return {
    unreadCount: Number(row?.unread_count || 0)
  };
}

/**
 * Mark announcement as read for Parent.
 * Idempotent.
 */
export async function markParentAnnouncementRead(params: { id: string; parentUserId: string }) {
  // 1. Verify existence & audience
  const announcement = await queryOne(`
    SELECT id FROM announcements
    WHERE id = ?
      AND (audience_type IN ('all_parents', 'everyone') OR (audience_type = 'selected_parent' AND target_user_id = ?))
  `, [params.id, params.parentUserId]);

  if (!announcement) {
    throw new MessageDomainError('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found.', 404);
  }

  const now = new Date().toISOString();
  const readId = `ar-${crypto.randomUUID()}`;

  await execute(`
    INSERT INTO announcement_reads (id, announcement_id, user_id, read_at, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (announcement_id, user_id) DO NOTHING
  `, [readId, params.id, params.parentUserId, now, now]);

  return {
    success: true,
    read_at: now
  };
}

/**
 * List announcements for a Volunteer.
 * Accessible: all_volunteers, everyone, OR selected_volunteer targeting this user.
 */
export async function listVolunteerAnnouncements(params: { volunteerUserId: string; page?: number; limit?: number }) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;

  const countRow = await queryOne(`
    SELECT COUNT(*) as total
    FROM announcements a
    WHERE (a.audience_type IN ('all_volunteers', 'everyone') OR (a.audience_type = 'selected_volunteer' AND a.target_user_id = ?))
  `, [params.volunteerUserId]);
  const total = Number(countRow?.total || 0);

  const rows = await query(`
    SELECT
      a.id,
      a.event_id,
      a.title,
      a.body,
      a.audience_type,
      a.published_at,
      a.created_at,
      CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END as is_read,
      ar.read_at
    FROM announcements a
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
    WHERE (a.audience_type IN ('all_volunteers', 'everyone') OR (a.audience_type = 'selected_volunteer' AND a.target_user_id = ?))
    ORDER BY a.published_at DESC
    LIMIT ? OFFSET ?
  `, [params.volunteerUserId, params.volunteerUserId, limit, offset]);

  return {
    announcements: rows.map(r => ({
      id: r.id,
      event_id: r.event_id,
      title: r.title,
      body: r.body,
      audience_type: r.audience_type,
      published_at: r.published_at,
      created_at: r.created_at,
      is_read: Boolean(r.is_read),
      read_at: r.read_at || null
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Get single announcement for Volunteer.
 */
export async function getVolunteerAnnouncement(params: { id: string; volunteerUserId: string }) {
  const r = await queryOne(`
    SELECT
      a.id,
      a.event_id,
      a.title,
      a.body,
      a.audience_type,
      a.published_at,
      a.created_at,
      CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END as is_read,
      ar.read_at
    FROM announcements a
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
    WHERE a.id = ?
      AND (a.audience_type IN ('all_volunteers', 'everyone') OR (a.audience_type = 'selected_volunteer' AND a.target_user_id = ?))
  `, [params.volunteerUserId, params.id, params.volunteerUserId]);

  if (!r) {
    throw new MessageDomainError('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found.', 404);
  }

  return {
    announcement: {
      id: r.id,
      event_id: r.event_id,
      title: r.title,
      body: r.body,
      audience_type: r.audience_type,
      published_at: r.published_at,
      created_at: r.created_at,
      is_read: Boolean(r.is_read),
      read_at: r.read_at || null
    }
  };
}

/**
 * Unread count for Volunteer announcements.
 */
export async function getVolunteerAnnouncementUnreadCount(params: { volunteerUserId: string }) {
  const row = await queryOne(`
    SELECT COUNT(*) as unread_count
    FROM announcements a
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
    WHERE (a.audience_type IN ('all_volunteers', 'everyone') OR (a.audience_type = 'selected_volunteer' AND a.target_user_id = ?))
      AND ar.id IS NULL
  `, [params.volunteerUserId, params.volunteerUserId]);

  return {
    unreadCount: Number(row?.unread_count || 0)
  };
}

/**
 * Mark announcement as read for Volunteer.
 * Idempotent.
 */
export async function markVolunteerAnnouncementRead(params: { id: string; volunteerUserId: string }) {
  const announcement = await queryOne(`
    SELECT id FROM announcements
    WHERE id = ?
      AND (audience_type IN ('all_volunteers', 'everyone') OR (audience_type = 'selected_volunteer' AND target_user_id = ?))
  `, [params.id, params.volunteerUserId]);

  if (!announcement) {
    throw new MessageDomainError('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found.', 404);
  }

  const now = new Date().toISOString();
  const readId = `ar-${crypto.randomUUID()}`;

  await execute(`
    INSERT INTO announcement_reads (id, announcement_id, user_id, read_at, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (announcement_id, user_id) DO NOTHING
  `, [readId, params.id, params.volunteerUserId, now, now]);

  return {
    success: true,
    read_at: now
  };
}
