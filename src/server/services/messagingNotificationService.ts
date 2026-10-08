import crypto from 'crypto';
import { execute, query, queryOne } from '../db';
import {
  emitSSEEventToUser,
  emitSSEEventToRoles,
  emitSSEEventToAudience
} from './sse';
import { sendEmail, sendApplicationCompletionReminderEmail } from './email';
import { sendWhatsApp } from './notifications';
import { sendWebPush } from './push';
import { buildPublicAppUrl } from '../utils/urlHelper';

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Creates in-app notification and emits SSE events when a new direct message is created,
 * and automatically dispatches Email and WhatsApp when an Admin replies to a Parent or Volunteer.
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

        // Safe idempotent insert into notifications table
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

        // If parent, also insert into parent_notifications for bell badge & notification history
        let parentProfileId = recipient.parent_profile_id;
        if (isParent) {
          if (!parentProfileId) {
            const pProfile = await queryOne('SELECT id FROM parent_profiles WHERE user_id = ?', [recipient.user_id]);
            parentProfileId = pProfile?.id || null;
          }
          if (parentProfileId) {
            const pNotifId = `pnotif-msg-${messageId}`;
            await execute(`
              INSERT OR IGNORE INTO parent_notifications (
                id, parent_id, event_id, child_id, title, message, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
              pNotifId,
              parentProfileId,
              resolvedEventId,
              thread.linked_child_id || null,
              title,
              message,
              now
            ]);
          }
        }

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

        // Fetch message details for external dispatch (Email & WhatsApp)
        const messageRow = await queryOne('SELECT body, message_type FROM messages WHERE id = ?', [messageId]);
        const messageBody = messageRow?.body || '';

        let childName: string | null = null;
        if (thread.linked_child_id) {
          const childRow = await queryOne('SELECT full_name FROM children WHERE id = ?', [thread.linked_child_id]);
          childName = childRow?.full_name || null;
        }

        let eventTitle: string | null = null;
        if (resolvedEventId) {
          const eventRow = await queryOne('SELECT title FROM events WHERE id = ?', [resolvedEventId]);
          eventTitle = eventRow?.title || null;
        }

        const threadSubject = thread.subject || 'Registration Inquiry';

        if (isParent) {
          // Resolve parent contact info
          const parent = await queryOne(`
            SELECT p.id as parent_id, p.full_name, p.phone_number, p.whatsapp_number,
                   COALESCE(p.email, u.email) as effective_email
            FROM parent_profiles p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.user_id = ? OR p.id = ?
          `, [recipient.user_id, parentProfileId || '']);

          let parentEmail = parent?.effective_email;
          if (!parentEmail) {
            const u = await queryOne('SELECT email FROM users WHERE id = ?', [recipient.user_id]);
            parentEmail = u?.email;
          }

          const parentFullName = parent?.full_name || 'Parent';
          const parentFirstName = parentFullName.trim().split(' ')[0] || 'Parent';
          const targetPhone = parent?.whatsapp_number || parent?.phone_number;
          const portalUrl = buildPublicAppUrl(`/parent/messages/${threadId}`);

          // Dispatch Email to Parent
          if (parentEmail) {
            const emailSubject = `New message from Koinonia: ${threadSubject}`;
            const childContextText = childName ? ` (Child: <strong>${escapeHtml(childName)}</strong>)` : '';
            const eventContextText = eventTitle ? ` &bull; <em>${escapeHtml(eventTitle)}</em>` : '';

            const emailHtml = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #18181B; max-width: 600px; margin: 0 auto; border: 1px solid #EAE8E1; padding: 28px; border-radius: 16px; background-color: #FAF9F6;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <span style="font-family: serif; font-size: 22px; font-weight: bold; color: #18181B; letter-spacing: 2px;">KOINONIA</span>
                  <div style="width: 44px; height: 2px; background-color: #C59B27; margin: 8px auto 0;"></div>
                </div>
                <h2 style="font-size: 18px; color: #18181B; margin-top: 0; font-weight: 600;">Response from Registration Team</h2>
                <p style="font-size: 14px; color: #3F3F46;">Hello ${escapeHtml(parentFirstName)},</p>
                <p style="font-size: 14px; color: #3F3F46; line-height: 1.6;">
                  The Koinonia Registration Team has sent a response to your message regarding <strong>${escapeHtml(threadSubject)}</strong>${childContextText}${eventContextText}:
                </p>
                <div style="background-color: #F4EFE6; border-left: 4px solid #C59B27; padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #27272A; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(messageBody)}</div>
                <p style="font-size: 14px; color: #3F3F46; line-height: 1.6;">
                  You can view the full conversation and reply at any time in your Parent Portal.
                </p>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${portalUrl}" style="display: inline-block; background-color: #C59B27; color: #FFFFFF; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
                    Open Conversation in Portal
                  </a>
                </div>
                <hr style="border: 0; border-top: 1px solid #EAE8E1; margin: 24px 0;">
                <p style="font-size: 11px; color: #71717A; text-align: center;">
                  This is an official administrative response regarding your Koinonia Children and Teens registration.
                </p>
              </div>
            `;

            const plainTextMessage = `Hello ${parentFirstName},

The Koinonia Registration Team has replied to your message regarding "${threadSubject}"${childName ? ` (${childName})` : ''}:

"${messageBody}"

You can view and reply to this message directly in the Parent Portal:
${portalUrl}

Thank you,
Koinonia Children and Teens Ministry`;

            sendEmail({
              to: parentEmail,
              subject: emailSubject,
              text: plainTextMessage,
              html: emailHtml
            }).catch(err => console.error('[notifyMessageCreated] Failed to dispatch email to parent:', err));
          }

          // Dispatch WhatsApp to Parent
          if (targetPhone) {
            const snippet = messageBody.length > 280 ? `${messageBody.substring(0, 277)}...` : messageBody;
            const waText = `Hello ${parentFirstName},\n\nThe Koinonia Registration Team has replied to your inquiry ("${threadSubject}"${childName ? ` for ${childName}` : ''}):\n\n"${snippet}"\n\nYou can read and reply in your Parent Portal here:\n${portalUrl}`;

            sendWhatsApp(targetPhone, waText).catch(err => console.error('[notifyMessageCreated] Failed to dispatch WhatsApp to parent:', err));
          }
        } else if (recipient.role === 'volunteer') {
          // Volunteer contact lookup
          const volunteer = await queryOne(`
            SELECT v.*, u.email as user_email
            FROM volunteer_profiles v
            LEFT JOIN users u ON u.id = v.user_id
            WHERE v.user_id = ?
          `, [recipient.user_id]);

          const volEmail = volunteer?.user_email;
          const volPhone = volunteer?.whatsapp || volunteer?.phone;
          const volFullName = volunteer?.full_name || 'Volunteer';
          const volFirstName = volFullName.trim().split(' ')[0] || 'Volunteer';
          const volPortalUrl = buildPublicAppUrl(`/volunteer/messages/${threadId}`);

          if (volEmail) {
            const volSubject = `New message from Koinonia Team: ${threadSubject}`;
            const volHtml = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #18181B; max-width: 600px; margin: 0 auto; border: 1px solid #EAE8E1; padding: 28px; border-radius: 16px; background-color: #FAF9F6;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <span style="font-family: serif; font-size: 22px; font-weight: bold; color: #18181B; letter-spacing: 2px;">KOINONIA</span>
                  <div style="width: 44px; height: 2px; background-color: #C59B27; margin: 8px auto 0;"></div>
                </div>
                <h2 style="font-size: 18px; color: #18181B; margin-top: 0; font-weight: 600;">Response from Koinonia Team</h2>
                <p style="font-size: 14px; color: #3F3F46;">Hello ${escapeHtml(volFirstName)},</p>
                <p style="font-size: 14px; color: #3F3F46; line-height: 1.6;">
                  The Koinonia Team has responded to your message regarding <strong>${escapeHtml(threadSubject)}</strong>:
                </p>
                <div style="background-color: #F4EFE6; border-left: 4px solid #C59B27; padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #27272A; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(messageBody)}</div>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${volPortalUrl}" style="display: inline-block; background-color: #C59B27; color: #FFFFFF; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
                    Open Conversation in Volunteer Portal
                  </a>
                </div>
                <hr style="border: 0; border-top: 1px solid #EAE8E1; margin: 24px 0;">
                <p style="font-size: 11px; color: #71717A; text-align: center;">
                  Koinonia Children and Teens Ministry
                </p>
              </div>
            `;

            sendEmail({
              to: volEmail,
              subject: volSubject,
              text: `Hello ${volFirstName},\n\nThe Koinonia Team responded to "${threadSubject}":\n\n"${messageBody}"\n\n${volPortalUrl}`,
              html: volHtml
            }).catch(err => console.error('[notifyMessageCreated] Failed to dispatch email to volunteer:', err));
          }

          if (volPhone) {
            const snippet = messageBody.length > 280 ? `${messageBody.substring(0, 277)}...` : messageBody;
            const waText = `Hello ${volFirstName},\n\nThe Koinonia Team has replied to your message ("${threadSubject}"):\n\n"${snippet}"\n\nYou can read and reply here:\n${volPortalUrl}`;
            sendWhatsApp(volPhone, waText).catch(err => console.error('[notifyMessageCreated] Failed to dispatch WhatsApp to volunteer:', err));
          }
        }
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
  formattedDeadline?: string;
}) {
  const now = new Date().toISOString();
  const { threadId, messageId, parentUserId, parentProfileId, adminUserId, eventId, formattedDeadline } = params;

  const notifId = `notif-rem-${messageId}-${parentUserId}`;
  const title = "Complete your child's application";
  const message = 'You have an important registration message from Koinonia.';
  const deepLink = `/parent/messages/${threadId}`;

  const metadataJson = JSON.stringify({
    deepLink,
    threadId,
    action: 'View'
  });

  // 1. Resolve linked child
  let linkedChildId: string | null = null;
  try {
    const threadRow = await queryOne('SELECT linked_child_id FROM message_threads WHERE id = ?', [threadId]);
    linkedChildId = threadRow?.linked_child_id || null;
  } catch (tErr) {
    console.warn('[notifyCompletionReminderSent] Failed to query thread linked_child_id:', tErr);
  }

  // 2. In-App Notifications (PostgreSQL & SQLite compatible ON CONFLICT)
  try {
    await execute(`
      INSERT INTO notifications (
        id, title, message, type, audience_role, audience_scope,
        event_id, child_id, parent_id, created_by_user_id, created_at, metadata_json
      ) VALUES (?, ?, ?, 'info', 'parent', 'individual', ?, NULL, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
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

    const pNotifId = `pnotif-rem-${messageId}`;
    await execute(`
      INSERT INTO parent_notifications (
        id, parent_id, event_id, child_id, title, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `, [
      pNotifId,
      parentProfileId,
      eventId || null,
      linkedChildId,
      title,
      message,
      now
    ]);
  } catch (notifErr) {
    console.error('[notifyCompletionReminderSent] Failed to record in-app notifications:', notifErr);
  }

  // 3. Emit SSE strictly to that Parent user
  try {
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
  } catch (sseErr) {
    console.error('[notifyCompletionReminderSent] Failed to emit SSE:', sseErr);
  }

  // 4. Resolve details for outbound Email, Push, and WhatsApp dispatch
  try {
    const parentProfile = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [parentProfileId]);
    const parentUser = await queryOne('SELECT * FROM users WHERE id = ?', [parentUserId]);
    const parentEmail = parentProfile?.email || parentUser?.email;
    const parentPhone = parentProfile?.whatsapp_number || parentProfile?.phone_number;
    const parentFirstName = parentProfile?.full_name ? parentProfile.full_name.trim().split(/\s+/)[0] : 'Parent';

    let childFirstName = 'Child';
    if (linkedChildId) {
      const childRow = await queryOne('SELECT full_name FROM children WHERE id = ?', [linkedChildId]);
      if (childRow?.full_name) {
        childFirstName = childRow.full_name.trim().split(/\s+/)[0] || childRow.full_name.trim();
      }
    }

    const msgRow = await queryOne('SELECT body FROM messages WHERE id = ?', [messageId]);
    const messageBody = msgRow?.body || '';
    const portalUrl = buildPublicAppUrl(deepLink);

    // 4a. Dispatch Email notification to Parent (CRITICAL: Await with delivery logging)
    if (parentEmail) {
      try {
        console.log(`[notifyCompletionReminderSent] Dispatching completion reminder email to ${parentEmail} (child: ${childFirstName})...`);
        const emailResult = await sendApplicationCompletionReminderEmail({
          parentEmail,
          parentFirstName,
          childName: childFirstName,
          messageBody,
          formattedDeadline,
          parentPortalLink: portalUrl
        });
        if (emailResult.success) {
          console.log(`[notifyCompletionReminderSent] Email successfully sent to ${parentEmail} (provider: ${emailResult.provider}, id: ${emailResult.id})`);
        } else {
          console.error(`[notifyCompletionReminderSent] Email delivery failed for ${parentEmail}: provider=${emailResult.provider}, error=${emailResult.error}`);
        }
      } catch (emailErr) {
        console.error('[notifyCompletionReminderSent] Unexpected error dispatching reminder email:', emailErr);
      }
    } else {
      console.warn(`[notifyCompletionReminderSent] No parent email found for parentProfileId: ${parentProfileId}, parentUserId: ${parentUserId}`);
    }

    // 4b. Dispatch Web Push notification to Parent devices
    try {
      await sendWebPush(parentUserId, {
        title: `Complete ${childFirstName}'s registration`,
        body: messageBody.slice(0, 120) || 'You have an important registration message from Koinonia.',
        metadata: {
          url: deepLink,
          threadId
        }
      });
    } catch (pushErr) {
      console.error('[notifyCompletionReminderSent] Failed to dispatch WebPush:', pushErr);
    }

    // 4c. Dispatch WhatsApp message to Parent
    if (parentPhone) {
      try {
        const snippet = messageBody.length > 250 ? `${messageBody.substring(0, 247)}...` : messageBody;
        const waText = `Hello ${parentFirstName},\n\nWe need additional information to complete ${childFirstName}'s registration for the General Assembly Children & Teens Session:\n\n"${snippet}"\n\nPlease complete it in your Parent Portal here:\n${portalUrl}`;

        await sendWhatsApp(parentPhone, waText);
        console.log(`[notifyCompletionReminderSent] WhatsApp reminder dispatched to ${parentPhone}`);
      } catch (waErr) {
        console.error('[notifyCompletionReminderSent] Failed to dispatch WhatsApp reminder:', waErr);
      }
    }
  } catch (err) {
    console.error('[notifyCompletionReminderSent] Outbound dispatch error:', err);
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
