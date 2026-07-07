import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import { sendEmail } from './email';

// Helper to format date/time in Koinonia's timezone (Africa/Lagos)
export function formatInTimezone(date: Date, timezone: string = 'Africa/Lagos'): string {
  try {
    return date.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
}

// Helper to format phone to Twilio WhatsApp standard (e.g. whatsapp:+2348031234567)
export function formatWhatsAppTo(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('whatsapp:')) {
    return cleaned;
  }
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('0')) {
      cleaned = '+234' + cleaned.substring(1);
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return `whatsapp:${cleaned}`;
}

// WhatsApp sending helper with robust Twilio Sandbox integration
export async function sendWhatsApp(to: string, message: string): Promise<{ success: boolean; error?: string; messageSid?: string }> {
  const provider = process.env.WHATSAPP_PROVIDER;
  if (provider !== 'twilio') {
    console.log(`[WhatsApp Simulated] To: ${to}\nMessage: ${message}\n-------------------`);
    return { success: true };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (!accountSid || !authToken) {
    console.error('[WhatsApp Error] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
    return { success: false, error: 'Twilio provider credentials are not fully configured in backend.' };
  }

  const formattedTo = formatWhatsAppTo(to);

  try {
    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    
    const params = new URLSearchParams();
    params.append('To', formattedTo);
    params.append('From', from);
    params.append('Body', message);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const resJson = await response.json() as any;

    if (!response.ok) {
      console.error('[WhatsApp Twilio API Error]:', JSON.stringify(resJson));
      let errMsg = resJson.message || 'Twilio WhatsApp dispatch failed';
      if (resJson.code === 21610 || errMsg.toLowerCase().includes('sandbox') || errMsg.toLowerCase().includes('opt-in') || errMsg.toLowerCase().includes('not a valid whatsapp subscriber')) {
        errMsg = `Recipient (${to}) has not joined the Twilio WhatsApp Sandbox yet. Please ask them to send the sandbox join keyword first.`;
      } else if (resJson.code === 21211 || errMsg.toLowerCase().includes('invalid')) {
        errMsg = `Invalid phone number format: ${to}. Make sure it is in international format.`;
      }
      return { success: false, error: errMsg };
    }

    if (resJson.sid) {
      console.log(`[WhatsApp Sent] Twilio Message SID: ${resJson.sid}`);
      return { success: true, messageSid: resJson.sid };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[WhatsApp Send Exception]:', err);
    return { success: false, error: err.message || 'An error occurred while connecting to Twilio.' };
  }
}

// Seeds default rules if they don't already exist for an event
export async function seedDefaultRules(eventId: string) {
  const existingRules = await query('SELECT id FROM event_notification_rules WHERE event_id = ?', [eventId]);
  if (existingRules.length > 0) return;

  const defaultRules = [
    {
      id: 'rule-check-in-opening-email',
      name: 'Check-in opening reminder (Email)',
      trigger_type: 'check_in_opening',
      trigger_offset_minutes: 30,
      channel: 'email',
      audience: 'pass_ready',
      title: 'Children and Teens check-in opens soon',
      message_template: 'Hello {parentName},\n\nCheck-in for Children and Teens opens at {time}.\n\nPlease keep {childrenNames}’s event pass ready when you arrive. Our team will check the child photo and pickup details before entry.\n\nThank you,\nKoinonia Children and Teens'
    },
    {
      id: 'rule-check-in-opened-email',
      name: 'Check-in opened (Email)',
      trigger_type: 'check_in_opened',
      trigger_offset_minutes: 0,
      channel: 'email',
      audience: 'pass_ready',
      title: 'Children and Teens check-in is open',
      message_template: 'Hello {parentName},\n\nCheck-in for Children and Teens is now open.\n\nPlease keep {childrenNames}’s event pass ready when you arrive. Our team will check the child photo and pickup details before entry.\n\nThank you,\nKoinonia Children and Teens'
    },
    {
      id: 'rule-event-starting-email',
      name: 'Event starting soon (Email)',
      trigger_type: 'event_starting',
      trigger_offset_minutes: 30,
      channel: 'email',
      audience: 'pass_ready_checked_in_inside',
      title: 'The General Assembly begins soon',
      message_template: 'Hello {parentName},\n\nThe Children and Teens section begins at {time}.\n\nIf {childrenNames} has been selected, please keep the event pass ready for entry.\n\nThank you,\nKoinonia Children and Teens'
    },
    {
      id: 'rule-pickup-reminder-email',
      name: 'Pickup reminder (Email)',
      trigger_type: 'pickup_reminder',
      trigger_offset_minutes: 30,
      channel: 'email',
      audience: 'checked_in_inside',
      title: 'Pickup reminder for Children and Teens',
      message_template: 'Hello {parentName},\n\nChildren and Teens pickup will begin soon.\n\nPlease return to the pickup point with the approved pickup person details ready. Our team will confirm the saved photo and phone details before releasing the child.\n\nThank you,\nKoinonia Children and Teens'
    },
    // In-app rules
    {
      id: 'rule-check-in-opening-inapp',
      name: 'Check-in opening reminder (In-App)',
      trigger_type: 'check_in_opening',
      trigger_offset_minutes: 30,
      channel: 'in_app',
      audience: 'pass_ready',
      title: 'Check-in opens soon',
      message_template: 'Check-in for Children and Teens opens at {time}. Please keep {childrenNames}’s pass ready.'
    },
    {
      id: 'rule-check-in-opened-inapp',
      name: 'Check-in opened (In-App)',
      trigger_type: 'check_in_opened',
      trigger_offset_minutes: 0,
      channel: 'in_app',
      audience: 'pass_ready',
      title: 'Check-in is open',
      message_template: 'Check-in is now open. Please keep {childrenNames}’s event pass ready for checking in.'
    },
    {
      id: 'rule-event-starting-inapp',
      name: 'Event starting soon (In-App)',
      trigger_type: 'event_starting',
      trigger_offset_minutes: 30,
      channel: 'in_app',
      audience: 'pass_ready_checked_in_inside',
      title: 'The General Assembly begins soon',
      message_template: 'The Children and Teens section begins at {time}. Please keep passes ready for entry.'
    },
    {
      id: 'rule-pickup-reminder-inapp',
      name: 'Pickup reminder (In-App)',
      trigger_type: 'pickup_reminder',
      trigger_offset_minutes: 30,
      channel: 'in_app',
      audience: 'checked_in_inside',
      title: 'Pickup reminder',
      message_template: 'Children and Teens pickup begins soon. Please return to the pickup point.'
    },
    // WhatsApp rules
    {
      id: 'rule-check-in-opening-whatsapp',
      name: 'Check-in opening reminder (WhatsApp)',
      trigger_type: 'check_in_opening',
      trigger_offset_minutes: 30,
      channel: 'whatsapp',
      audience: 'pass_ready',
      title: 'Check-in opens soon',
      message_template: 'Hello {parentName}, check-in for Children and Teens opens at {time}. Please keep {childrenNames}’s event pass ready.'
    },
    {
      id: 'rule-pickup-reminder-whatsapp',
      name: 'Pickup reminder (WhatsApp)',
      trigger_type: 'pickup_reminder',
      trigger_offset_minutes: 30,
      channel: 'whatsapp',
      audience: 'checked_in_inside',
      title: 'Pickup reminder',
      message_template: 'Hello {parentName}, Children and Teens pickup will begin soon. Please return to the pickup point with approved pickup person details ready.'
    }
  ];

  const now = new Date().toISOString();
  for (const rule of defaultRules) {
    await execute(`
      INSERT INTO event_notification_rules (
        id, event_id, name, trigger_type, trigger_offset_minutes, channel, audience, title, message_template, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `, [rule.id, eventId, rule.name, rule.trigger_type, rule.trigger_offset_minutes, rule.channel, rule.audience, rule.title, rule.message_template, now, now]);
  }
}

// Helpers to extract eligible children names for a parent based on rule audience
async function getEligibleChildrenNames(parentProfileId: string, eventId: string, audience: string): Promise<string[]> {
  let statuses: string[] = [];
  if (audience === 'pass_ready') {
    statuses = ['pass_ready'];
  } else if (audience === 'pass_ready_checked_in_inside') {
    statuses = ['pass_ready', 'checked_in', 'inside'];
  } else if (audience === 'checked_in_inside') {
    statuses = ['checked_in', 'inside'];
  }

  if (statuses.length === 0) return [];

  const placeHolders = statuses.map(() => '?').join(',');
  const sql = `
    SELECT c.full_name 
    FROM children c
    JOIN child_event_entries e ON e.child_id = c.id
    WHERE c.parent_profile_id = ? AND e.event_id = ? AND e.status IN (${placeHolders})
  `;
  const rows = await query(sql, [parentProfileId, eventId, ...statuses]);
  return rows.map((r: any) => r.full_name.trim().split(/\s+/)[0]);
}

// Format warm human-facing messages
export function formatMessage(template: string, parentName: string, childrenNames: string[], timeStr: string): string {
  let text = template;
  text = text.replace(/{parentName}/g, parentName);
  text = text.replace(/{time}/g, timeStr);

  if (childrenNames.length === 0) {
    text = text.replace(/{childrenNames}’s event pass/g, "your children’s event passes");
    text = text.replace(/{childrenNames}/g, "your children");
  } else {
    let namesList = '';
    if (childrenNames.length === 1) {
      namesList = childrenNames[0];
      text = text.replace(/{childrenNames}’s event pass/g, `${namesList}’s event pass`);
      text = text.replace(/{childrenNames}/g, namesList);
    } else {
      if (childrenNames.length === 2) {
        namesList = `${childrenNames[0]} and ${childrenNames[1]}`;
      } else {
        namesList = `${childrenNames.slice(0, -1).join(', ')}, and ${childrenNames[childrenNames.length - 1]}`;
      }
      text = text.replace(/{childrenNames}’s event pass/g, `${namesList}’s event passes`);
      text = text.replace(/{childrenNames}/g, namesList);
    }
  }
  return text;
}

// Synchronizes and creates notification jobs for active rules and eligible parents
export async function syncJobsForEvent(eventId: string) {
  const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) return;

  // Ensure default rules exist
  await seedDefaultRules(eventId);

  const rules = await query('SELECT * FROM event_notification_rules WHERE event_id = ? AND is_active = 1', [eventId]);
  const timezone = event.timezone || 'Africa/Lagos';

  for (const rule of rules) {
    let baseTimeStr: string | null = null;
    if (rule.trigger_type === 'check_in_opening' || rule.trigger_type === 'check_in_opened') {
      baseTimeStr = event.check_in_opens_at;
    } else if (rule.trigger_type === 'event_starting') {
      baseTimeStr = event.event_start_at;
    } else if (rule.trigger_type === 'pickup_reminder') {
      baseTimeStr = event.pickup_reminder_at || event.event_end_at;
    }

    if (!baseTimeStr) continue;

    const baseTime = new Date(baseTimeStr);
    if (isNaN(baseTime.getTime())) continue;

    // Calculate scheduled time in UTC
    const scheduledTime = new Date(baseTime.getTime() - rule.trigger_offset_minutes * 60 * 1000);
    const scheduledFor = scheduledTime.toISOString();

    // Get audience:
    let eligibleParents: any[] = [];
    if (rule.audience === 'pass_ready') {
      eligibleParents = await query(`
        SELECT DISTINCT p.id as parent_id, p.email, p.full_name, p.phone_number, p.whatsapp_number
        FROM parent_profiles p
        JOIN children c ON c.parent_profile_id = p.id
        JOIN child_event_entries e ON e.child_id = c.id
        WHERE e.event_id = ? AND e.status = 'pass_ready'
      `, [eventId]);
    } else if (rule.audience === 'pass_ready_checked_in_inside') {
      eligibleParents = await query(`
        SELECT DISTINCT p.id as parent_id, p.email, p.full_name, p.phone_number, p.whatsapp_number
        FROM parent_profiles p
        JOIN children c ON c.parent_profile_id = p.id
        JOIN child_event_entries e ON e.child_id = c.id
        WHERE e.event_id = ? AND e.status IN ('pass_ready', 'checked_in', 'inside')
      `, [eventId]);
    } else if (rule.audience === 'checked_in_inside') {
      eligibleParents = await query(`
        SELECT DISTINCT p.id as parent_id, p.email, p.full_name, p.phone_number, p.whatsapp_number
        FROM parent_profiles p
        JOIN children c ON c.parent_profile_id = p.id
        JOIN child_event_entries e ON e.child_id = c.id
        WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside')
      `, [eventId]);
    }

    for (const parent of eligibleParents) {
      // Check if job already exists (duplicate protection)
      const existingJob = await queryOne(`
        SELECT id FROM notification_jobs 
        WHERE rule_id = ? AND parent_id = ? AND scheduled_for = ?
      `, [rule.id, parent.parent_id, scheduledFor]);

      if (!existingJob) {
        const jobId = crypto.randomUUID();
        const nowStr = new Date().toISOString();
        await execute(`
          INSERT INTO notification_jobs (
            id, event_id, rule_id, parent_id, child_id, channel, scheduled_for, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, ?, ?, 'pending', ?, ?)
        `, [jobId, eventId, rule.id, parent.parent_id, rule.channel, scheduledFor, nowStr, nowStr]);
      }
    }
  }
}

// Processes all pending notification jobs whose scheduled_for <= now
export async function processPendingNotifications(eventId: string): Promise<{ processed: number; failures: number }> {
  // Sync first to catch newly registered or changed-status parents
  await syncJobsForEvent(eventId);

  const nowStr = new Date().toISOString();
  const pendingJobs = await query(`
    SELECT j.*, r.title, r.message_template, r.audience, p.email as parent_email, p.full_name as parent_full_name, p.phone_number, p.whatsapp_number, e.timezone
    FROM notification_jobs j
    JOIN event_notification_rules r ON r.id = j.rule_id
    JOIN parent_profiles p ON p.id = j.parent_id
    JOIN events e ON e.id = j.event_id
    WHERE j.event_id = ? AND j.status = 'pending' AND j.scheduled_for <= ?
  `, [eventId, nowStr]);

  let processed = 0;
  let failures = 0;

  for (const job of pendingJobs) {
    try {
      // Fetch currently eligible children names to verify they are still eligible right now
      const childrenNames = await getEligibleChildrenNames(job.parent_id, eventId, job.audience);
      
      // If no children match the eligibility criteria anymore, complete/cancel the job silently (no children to notify about)
      if (childrenNames.length === 0) {
        await execute(`
          UPDATE notification_jobs 
          SET status = 'cancelled', updated_at = ? 
          WHERE id = ?
        `, [new Date().toISOString(), job.id]);
        continue;
      }

      // Convert times to local time string of the event timezone for parent consumption
      const timezone = job.timezone || 'Africa/Lagos';
      // Use scheduled_for or base event settings to represent time in timezone
      const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
      let localTimeStr = 'the scheduled hour';
      if (event) {
        if (job.rule_id.includes('check-in-opening') || job.rule_id.includes('check-in-opened')) {
          if (event.check_in_opens_at) {
            localTimeStr = formatInTimezone(new Date(event.check_in_opens_at), timezone);
          }
        } else if (job.rule_id.includes('event-starting')) {
          if (event.event_start_at) {
            localTimeStr = formatInTimezone(new Date(event.event_start_at), timezone);
          }
        } else if (job.rule_id.includes('pickup')) {
          if (event.event_end_at) {
            localTimeStr = formatInTimezone(new Date(event.event_end_at), timezone);
          }
        }
      }

      const parentName = job.parent_full_name.trim().split(/\s+/)[0];
      const renderedMessage = formatMessage(job.message_template, parentName, childrenNames, localTimeStr);
      const renderedTitle = formatMessage(job.title, parentName, childrenNames, localTimeStr);

      let success = true;
      let failureReason = '';

      if (job.channel === 'email') {
        const emailResult = await sendEmail({
          to: job.parent_email,
          subject: renderedTitle,
          text: renderedMessage,
          html: `<div style="font-family: sans-serif; line-height: 1.6; color: #18181B;">
            ${renderedMessage.replace(/\n/g, '<br>')}
          </div>`
        });
        success = emailResult.success;
        if (!success) {
          failureReason = emailResult.error || 'Email send failed';
        }
      } else if (job.channel === 'whatsapp') {
        // Prepare structure but only activate if WhatsApp provider is configured
        const recipient = job.whatsapp_number || job.phone_number;
        if (recipient) {
          const res = await sendWhatsApp(recipient, renderedMessage);
          success = res.success;
          failureReason = res.error || '';
        } else {
          success = false;
          failureReason = 'No phone or WhatsApp number found for parent';
        }
      } else if (job.channel === 'in_app') {
        // Create parent_notifications record
        const notifId = crypto.randomUUID();
        const createdNotifStr = new Date().toISOString();
        await execute(`
          INSERT INTO parent_notifications (id, parent_id, event_id, child_id, title, message, read_at, created_at)
          VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)
        `, [notifId, job.parent_id, eventId, renderedTitle, renderedMessage, createdNotifStr]);
        success = true;
      }

      if (success) {
        await execute(`
          UPDATE notification_jobs 
          SET status = 'sent', sent_at = ?, updated_at = ? 
          WHERE id = ?
        `, [new Date().toISOString(), new Date().toISOString(), job.id]);
        processed++;
      } else {
        await execute(`
          UPDATE notification_jobs 
          SET status = 'failed', failure_reason = ?, updated_at = ? 
          WHERE id = ?
        `, [failureReason, new Date().toISOString(), job.id]);
        failures++;
      }

    } catch (err: any) {
      console.error(`[Job Error] Job ${job.id} failed:`, err);
      await execute(`
        UPDATE notification_jobs 
        SET status = 'failed', failure_reason = ?, updated_at = ? 
        WHERE id = ?
      `, [err?.message || 'Unknown processing error', new Date().toISOString(), job.id]);
      failures++;
    }
  }

  return { processed, failures };
}

// Executes an ad-hoc test notification rule directly to a selected email address
export async function executeTestNotification(params: {
  eventId: string;
  ruleType: string;
  testEmail: string;
}): Promise<{ success: boolean; message: string }> {
  const { eventId, ruleType, testEmail } = params;
  
  const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) {
    return { success: false, message: 'Event not found' };
  }

  // Find a matching rule template
  await seedDefaultRules(eventId);
  
  // Find rule matching the trigger_type/ruleType
  const rule = await queryOne(`
    SELECT * FROM event_notification_rules 
    WHERE event_id = ? AND trigger_type = ? LIMIT 1
  `, [eventId, ruleType]);

  if (!rule) {
    return { success: false, message: `No template rule found for rule type: ${ruleType}` };
  }

  // Get a test parent or just mock parent details if none exists
  const parent = await queryOne('SELECT * FROM parent_profiles WHERE email = ? LIMIT 1', [testEmail]) 
    || await queryOne('SELECT * FROM parent_profiles LIMIT 1')
    || { full_name: 'Sarah', id: 'mock-parent' };

  const parentName = parent.full_name.split(' ')[0];
  const childrenNames = ['Mary', 'Daniel']; // Mock names for test mode
  const timezone = event.timezone || 'Africa/Lagos';

  let localTimeStr = '7:00 AM';
  if (ruleType === 'check_in_opening' || ruleType === 'check_in_opened') {
    localTimeStr = event.check_in_opens_at ? formatInTimezone(new Date(event.check_in_opens_at), timezone) : '7:00 AM';
  } else if (ruleType === 'event_starting') {
    localTimeStr = event.event_start_at ? formatInTimezone(new Date(event.event_start_at), timezone) : '9:00 AM';
  } else if (ruleType === 'pickup_reminder') {
    localTimeStr = event.event_end_at ? formatInTimezone(new Date(event.event_end_at), timezone) : '7:00 PM';
  }

  const renderedMessage = formatMessage(rule.message_template, parentName, childrenNames, localTimeStr);
  const renderedTitle = formatMessage(rule.title, parentName, childrenNames, localTimeStr);

  const emailResult = await sendEmail({
    to: testEmail,
    subject: `[TEST] ${renderedTitle}`,
    text: renderedMessage,
    html: `<div style="font-family: sans-serif; line-height: 1.6; color: #18181B;">
      <p style="background-color: #FEF3C7; padding: 8px 12px; border-radius: 4px; font-weight: bold; font-size: 13px; color: #D97706; margin-bottom: 16px;">
        This is a TEST notification from Koinonia event scheduler.
      </p>
      ${renderedMessage.replace(/\n/g, '<br>')}
    </div>`
  });

  if (emailResult.success) {
    return { success: true, message: `Test email successfully sent to ${testEmail}` };
  } else {
    return { success: false, message: emailResult.error || 'Failed to send test email' };
  }
}
