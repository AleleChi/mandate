import crypto from 'crypto';
import { execute, query, queryOne } from '../db';
import {
  emitSSEEventToUser,
  emitSSEEventToRoles,
  emitSSEEventToAudience
} from './sse';

/**
 * Creates in-app notification and emits SSE events when a new direct message is created
 */
export async function notifyMessageCreated(params: {
  threadId: string;
  messageId: string;
  senderUserId: string;
  senderRole: string;
  eventId?: string | null;
}) {
  try {
    const now = new Date().toISOString();
    const { threadId, messageId, senderUserId, senderRole, eventId } = params;

    // 1. Fetch thread and participants
    const thread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [threadId]);
    if (!thread) return;

    const participants = await query(`
      SELECT p.user_id, p.role, pp.id as parent_profile_id
      FROM message_thread_participants p
      LEFT JOIN parent_profiles pp ON pp.user_id = p.user_id
      WHERE p.thread_id = ?
    `, [threadId]);

    const resolvedEventId = eventId || thread.event_id || null;

    if (senderRole === 'admin' || senderRole === 'super_admin') {
      // Admin replied -> Notify Parent or Volunteer participant
      const recipient = participants.find((p: any) => p.user_id !== senderUserId && (p.role === 'parent' || p.role === 'volunteer'));
      if (recipient) {
        const isParent = recipient.role === 'parent';
        const notifId = `notif-msg-${messageId}-${recipient.user_id}`;

        const title = 'New message from Koinonia';
        const message = isParent
          ? 'You have a new message from the Koinonia Registration Team.'
          : 'You have a new message from the Koinonia team.';
        const deepLink = isParent
          ? `/parent/messages/${threadId}`
          : `/volunteer/messages/${threadId}`;

        const metadataJson = JSON.stringify({
          targetUserId: recipient.user_id,
          deepLink,
          threadId
        });

        // Safe idempotent insert
        await execute(`
          INSERT OR IGNORE INTO notifications (
            id, title, message, type, audience_role, audience_scope,
            event_id, child_id, parent_id, created_by_user_id, created_at, metadata_json
          ) VALUES (?, ?, ?, 'info', ?, 'individual', ?, ?, ?, ?, ?, ?)
        `, [
          notifId,
          title,
          message,
          recipient.role,
          resolvedEventId,
          thread.linked_child_id || null,
          isParent ? (recipient.parent_profile_id || null) : null,
          senderUserId,
          now,
          metadataJson
        ]);

        // Emit SSE to recipient user only (MINIMIZED PAYLOAD: No private body or child data)
        emitSSEEventToUser(recipient.user_id, 'message.created', {
          threadId,
          messageId,
          eventId: resolvedEventId,
          senderRole: 'admin',
          timestamp: now
        });

        emitSSEEventToUser(recipient.user_id, 'notification.created', {
          notificationId: notifId,
          timestamp: now
        });
      }
    } else {
      // Parent or Volunteer sent message -> Notify Admins
      const notifId = `notif-msg-${messageId}-admin`;
      const isParent = senderRole === 'parent';
      const title = isParent ? 'New Parent message' : 'New Volunteer message';
      const message = isParent
        ? 'A Parent has sent a new registration message.'
        : 'A Volunteer has sent a new support message.';
      const deepLink = `/admin/messages/${threadId}`;

      const metadataJson = JSON.stringify({
        deepLink,
        threadId,
        senderUserId
      });

      await execute(`
        INSERT OR IGNORE INTO notifications (
          id, title, message, type, audience_role, audience_scope,
          event_id, child_id, parent_id, created_by_user_id, created_at, metadata_json
        ) VALUES (?, ?, ?, 'info', 'admin', 'all', ?, ?, ?, ?, ?, ?)
      `, [
        notifId,
        title,
        message,
        resolvedEventId,
        thread.linked_child_id || null,
        null,
        senderUserId,
        now,
        metadataJson
      ]);

      // Emit SSE to Admins only
      emitSSEEventToRoles(['admin', 'super_admin'], 'message.created', {
        threadId,
        messageId,
        eventId: resolvedEventId,
        senderRole,
        timestamp: now
      });

      emitSSEEventToRoles(['admin', 'super_admin'], 'notification.created', {
        notificationId: notifId,
        timestamp: now
      });
    }
  } catch (err) {
    // Non-blocking failure semantics: messaging remains intact even if notification/SSE fails
    console.error('[notifyMessageCreated] Failed to dispatch notification/SSE:', err);
  }
}

/**
 * Emits SSE thread.updated event when thread lifecycle changes (resolve / reopen)
 */
export async function notifyThreadUpdated(params: {
  threadId: string;
  status: 'open' | 'resolved';
  adminUserId: string;
}) {
  try {
    const now = new Date().toISOString();
    const { threadId, status } = params;

    const participants = await query(`
      SELECT user_id, role FROM message_thread_participants WHERE thread_id = ?
    `, [threadId]);

    const recipientUserIds = participants.map((p: any) => p.user_id);

    const payload = {
      threadId,
      status,
      timestamp: now
    };

    // Emit to all thread participants
    for (const uid of recipientUserIds) {
      emitSSEEventToUser(uid, 'thread.updated', payload);
    }

    // Also emit to all active admins
    emitSSEEventToRoles(['admin', 'super_admin'], 'thread.updated', payload);
  } catch (err) {
    console.error('[notifyThreadUpdated] Failed to dispatch thread.updated SSE:', err);
  }
}

/**
 * Creates notification and emits SSE for Application Completion Reminder
 */
export async function notifyCompletionReminderSent(params: {
  threadId: string;
  messageId: string;
  parentUserId: string;
  parentProfileId: string;
  adminUserId: string;
  eventId?: string | null;
}) {
  try {
    const now = new Date().toISOString();
    const { threadId, messageId, parentUserId, parentProfileId, adminUserId, eventId } = params;

    const notifId = `notif-rem-${messageId}-${parentUserId}`;
    const title = "Complete your child's application";
    const message = 'You have an important registration message from Koinonia.';
    const deepLink = `/parent/messages/${threadId}`;

    const metadataJson = JSON.stringify({
      deepLink,
      threadId,
      action: 'View'
    });

    // Resolve linked child for parent_notifications child_id column
    const threadRow = await queryOne('SELECT linked_child_id FROM message_threads WHERE id = ?', [threadId]);
    const linkedChildId = threadRow?.linked_child_id || null;

    await execute(`
      INSERT OR IGNORE INTO notifications (
        id, title, message, type, audience_role, audience_scope,
        event_id, child_id, parent_id, created_by_user_id, created_at, metadata_json
      ) VALUES (?, ?, ?, 'info', 'parent', 'individual', ?, NULL, ?, ?, ?, ?)
    `, [
      notifId,
      title,
      message,
      eventId || null,
      parentProfileId,
      adminUserId,
      now,
      metadataJson
    ]);

    // Also write to parent_notifications — /api/parent/notifications reads ONLY this table.
    // Without this row the parent bell badge never increments.
    const pNotifId = `pnotif-rem-${messageId}`;
    await execute(`
      INSERT OR IGNORE INTO parent_notifications (
        id, parent_id, event_id, child_id, title, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      pNotifId,
      parentProfileId,
      eventId || null,
      linkedChildId,
      title,
      message,
      now
    ]);

    // Emit SSE strictly to that Parent user
    emitSSEEventToUser(parentUserId, 'message.created', {
      threadId,
      messageId,
      eventId: eventId || null,
      senderRole: 'admin',
      timestamp: now
    });

    emitSSEEventToUser(parentUserId, 'notification.created', {
      notificationId: notifId,
      timestamp: now
    });
  } catch (err) {
    console.error('[notifyCompletionReminderSent] Failed to dispatch reminder notification/SSE:', err);
  }
}

/**
 * Creates notifications and emits targeted SSE events for published Announcements
 */
export async function notifyAnnouncementPublished(params: {
  announcementId: string;
  audienceType: string;
  targetUserId?: string | null;
  adminUserId: string;
  eventId?: string | null;
}) {
  try {
    const now = new Date().toISOString();
    const { announcementId, audienceType, targetUserId, adminUserId, eventId } = params;

    const notifTitle = 'New announcement from Koinonia';
    const notifBody = 'A new event announcement is available in Messages.';

    // 1. Emit SSE with strict audience targeting
    emitSSEEventToAudience(audienceType, 'announcement.published', {
      announcementId,
      audienceType,
      timestamp: now
    }, targetUserId);

    // 2. Insert In-App Notifications according to audience
    if (audienceType === 'all_parents') {
      const notifId = `notif-anc-${announcementId}-parents`;
      await execute(`
        INSERT OR IGNORE INTO notifications (
          id, title, message, type, audience_role, audience_scope,
          event_id, child_id, parent_id, created_by_user_id, created_at, metadata_json
        ) VALUES (?, ?, ?, 'info', 'parent', 'broadcast', ?, NULL, NULL, ?, ?, ?)
      `, [
        notifId,
        notifTitle,
        notifBody,
        eventId || null,
        adminUserId,
        now,
        JSON.stringify({ deepLink: '/parent/messages' })
      ]);

      emitSSEEventToRoles(['parent'], 'notification.created', {
        notificationId: notifId,
        timestamp: now
      });
    } else if (audienceType === 'all_volunteers') {
      const notifId = `notif-anc-${announcementId}-volunteers`;
      await execute(`
        INSERT OR IGNORE INTO notifications (
          id, title, message, type, audience_role, audience_scope,
          event_id, child_id, parent_id, created_by_user_id, created_at, metadata_json
        ) VALUES (?, ?, ?, 'info', 'volunteer', 'broadcast', ?, NULL, NULL, ?, ?, ?)
      `, [
        notifId,
        notifTitle,
        notifBody,
        eventId || null,
        adminUserId,
        now,
        JSON.stringify({ deepLink: '/volunteer/messages' })
      ]);

      emitSSEEventToRoles(['volunteer'], 'notification.created', {
        notificationId: notifId,
        timestamp: now
      });
    } else if (audienceType === 'everyone') {
      const notifId = `notif-anc-${announcementId}-everyone`;
      await execute(`
        INSERT OR IGNORE INTO notifications (
          id, title, message, type, audience_role, audience_scope,
          event_id, child_id, parent_id, created_by_user_id, created_at, metadata_json
        ) VALUES (?, ?, ?, 'info', 'all', 'broadcast', ?, NULL, NULL, ?, ?, ?)
      `, [
        notifId,
        notifTitle,
        notifBody,
        eventId || null,
        adminUserId,
        now,
        JSON.stringify({ deepLink: '/parent/messages' })
      ]);

      emitSSEEventToRoles(['parent', 'volunteer'], 'notification.created', {
        notificationId: notifId,
        timestamp: now
      });
    } else if (audienceType === 'selected_parent' && targetUserId) {
      const pProfile = await queryOne('SELECT id FROM parent_profiles WHERE user_id = ?', [targetUserId]);
      const notifId = `notif-anc-${announcementId}-${targetUserId}`;
      await execute(`
        INSERT OR IGNORE INTO notifications (
          id, title, message, type, audience_role, audience_scope,
          event_id, child_id, parent_id, created_by_user_id, created_at, metadata_json
        ) VALUES (?, ?, ?, 'info', 'parent', 'individual', ?, NULL, ?, ?, ?, ?)
      `, [
        notifId,
        notifTitle,
        notifBody,
        eventId || null,
        pProfile?.id || null,
        adminUserId,
        now,
        JSON.stringify({ targetUserId, deepLink: '/parent/messages' })
      ]);

      emitSSEEventToUser(targetUserId, 'notification.created', {
        notificationId: notifId,
        timestamp: now
      });
    } else if (audienceType === 'selected_volunteer' && targetUserId) {
      const notifId = `notif-anc-${announcementId}-${targetUserId}`;
      await execute(`
        INSERT OR IGNORE INTO notifications (
          id, title, message, type, audience_role, audience_scope,
          event_id, child_id, parent_id, created_by_user_id, created_at, metadata_json
        ) VALUES (?, ?, ?, 'info', 'volunteer', 'individual', ?, NULL, NULL, ?, ?, ?)
      `, [
        notifId,
        notifTitle,
        notifBody,
        eventId || null,
        adminUserId,
        now,
        JSON.stringify({ targetUserId, deepLink: '/volunteer/messages' })
      ]);

      emitSSEEventToUser(targetUserId, 'notification.created', {
        notificationId: notifId,
        timestamp: now
      });
    }
  } catch (err) {
    console.error('[notifyAnnouncementPublished] Failed to dispatch announcement notification/SSE:', err);
  }
}
