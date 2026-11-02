import { query, queryOne, execute } from '../db';
import { extractFirstName, formatSelectedChildNames, buildMergeInfo, validateMergeInfo } from './whatsapp/personalization';
import { resolveParentWhatsAppCandidate } from '../utils/phone';
import { getWhatsAppProvider } from './whatsapp';
import { logWhatsAppDelivery } from './whatsapp/worker';

/**
 * Authoritative qualifying child event entry statuses for the Selected Parents audience.
 * A child in any of these statuses qualifies their parent for the Parents Channel invitation.
 */
export const QUALIFYING_CHILD_STATUSES = [
  'selected',
  'pass_ready',
  'checked_in',
  'inside',
  'picked_up',
  'checked_out'
] as const;

/**
 * Non-qualifying statuses that do NOT qualify a parent.
 */
export const NON_QUALIFYING_CHILD_STATUSES = [
  'under_review',
  'review_reopened',
  'waiting_list',
  'not_selected',
  'withdrawn',
  'draft',
  'incomplete'
] as const;

export type QualifyingChildStatus = typeof QUALIFYING_CHILD_STATUSES[number];

export interface AudienceChildDetail {
  id: string;
  fullName: string;
  firstName: string;
  status: string;
  ageGroup: string | null;
  isSelected: boolean;
  dateOfBirth?: string | null;
  calculatedAge?: number | null;
}

export interface SelectedParentRecord {
  parentId: string;
  userId: string;
  fullName: string;
  firstName: string;
  phoneNumber: string | null;
  whatsappNumber: string | null;
  email: string | null;
  whatsappConsentStatus: 'opted_in' | 'opted_out' | 'unknown';
  whatsappAvailability: 'available' | 'opted_out' | 'invalid_number';
  normalizedWhatsAppNumber: string | null;
  totalRegisteredChildren: number;
  selectedChildrenCount: number;
  selectedRatioText: string; // e.g. "2 of 3 selected"
  selectedChildNames: string; // e.g. "Daniel and Sarah"
  children: AudienceChildDetail[];
  invitationStatus: 'not_sent' | 'sent' | 'failed';
  sentAt: string | null;
  attemptedAt: string | null;
  failureReason: string | null;
  providerMessageId: string | null;
  emailChannelAccessSent?: boolean;
  emailChannelSentAt?: string | null;
}

export interface SelectedParentsAudienceResult {
  eventId: string;
  eventTitle: string;
  templateConfigured: boolean;
  templateKeyOrAlias: string | null;
  summary: {
    totalEligibleParents: number;
    totalSelectedChildren: number;
    invitationsNotSent: number;
    invitationsSent: number;
    invitationsFailed: number;
    whatsappAvailable: number;
    whatsappUnavailable: number;
  };
  parents: SelectedParentRecord[];
}

export interface SendResultDetail {
  parentId: string;
  parentName: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  messageId?: string;
}

export interface SendChannelInvitationsResult {
  success: boolean;
  templateConfigured: boolean;
  totalRequested: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  details: SendResultDetail[];
  error?: string;
}

/**
 * Checks whether the Zoho WhatsApp template for selected parents channel invitations
 * is configured with an approved template key / alias.
 */
export function isChannelTemplateConfigured(): boolean {
  const key = (
    process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL ||
    process.env.ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL ||
    ''
  ).trim();
  return Boolean(key);
}

/**
 * Returns the configured template key / alias, or null if not yet approved/configured.
 */
export function getChannelTemplateKey(): string | null {
  const key = (
    process.env.ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL ||
    process.env.ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL ||
    ''
  ).trim();
  return key || null;
}

/**
 * Formats child first names into English list string (e.g. "Daniel, Sarah and Michael").
 */
export { formatSelectedChildNames };

/**
 * Retrieves the event-aware audience of parents whose children have been selected
 * for the currently active event.
 * Deduplicates logically by parent_id + event_id (one record per parent).
 */
export async function getSelectedParentsAudience(
  eventId: string,
  options?: {
    search?: string;
    status?: string; // 'all' | 'not_sent' | 'sent' | 'failed'
    whatsappStatus?: string; // 'all' | 'available' | 'unavailable'
  }
): Promise<SelectedParentsAudienceResult> {
  const event = await queryOne<{ id: string; title: string }>(
    `SELECT id, title FROM events WHERE id = ?`,
    [eventId]
  );
  const eventTitle = event ? event.title : 'Current Event';

  // Query all parent-child registrations for this event
  const rows = await query<any>(
    `SELECT 
       p.id AS parent_id,
       p.full_name,
       p.phone_number,
       p.whatsapp_number,
       p.whatsapp_consent_status,
       p.country_iso,
       p.whatsapp_country_iso,
       u.id AS user_id,
       u.email,
       c.id AS child_id,
       c.full_name AS child_name,
       c.age_group AS child_age_group,
       c.date_of_birth AS child_dob,
       c.calculated_age AS child_calculated_age,
       cee.id AS entry_id,
       cee.status AS child_status,
       pci.id AS invitation_id,
       pci.status AS invitation_status,
       pci.sent_at AS invitation_sent_at,
       pci.attempted_at AS invitation_attempted_at,
       pci.failure_reason AS invitation_failure_reason,
       pci.provider_message_id AS invitation_provider_message_id,
       pci_email.status AS email_channel_status,
       pci_email.sent_at AS email_channel_sent_at
     FROM parent_profiles p
     JOIN users u ON u.id = p.user_id
     JOIN children c ON c.parent_profile_id = p.id
     JOIN child_event_entries cee ON cee.child_id = c.id AND cee.event_id = ? AND COALESCE(cee.is_deleted, 0) = 0
     LEFT JOIN parent_channel_invitations pci 
       ON pci.parent_id = p.id 
       AND pci.event_id = ? 
       AND pci.communication_purpose = 'parents_channel_invitation'
       AND pci.channel = 'whatsapp'
     LEFT JOIN parent_channel_invitations pci_email
       ON pci_email.parent_id = p.id
       AND pci_email.event_id = ?
       AND pci_email.communication_purpose = 'parents_channel_invitation'
       AND pci_email.channel = 'email'
     ORDER BY p.full_name ASC, c.date_of_birth ASC, c.created_at ASC, c.id ASC`,
    [eventId, eventId, eventId]
  );

  // Group by parent_id
  const parentMap = new Map<string, {
    parent: any;
    children: AudienceChildDetail[];
    invitation: any;
  }>();

  for (const row of rows) {
    if (!parentMap.has(row.parent_id)) {
      parentMap.set(row.parent_id, {
        parent: {
          id: row.parent_id,
          userId: row.user_id,
          fullName: row.full_name || 'Parent',
          firstName: extractFirstName(row.full_name),
          phoneNumber: row.phone_number,
          whatsappNumber: row.whatsapp_number,
          email: row.email,
          countryIso: row.country_iso || row.whatsapp_country_iso || 'NG',
          whatsappConsentStatus: row.whatsapp_consent_status || 'unknown'
        },
        children: [],
        invitation: {
          status: row.invitation_status || 'not_sent',
          sentAt: row.invitation_sent_at || null,
          attemptedAt: row.invitation_attempted_at || null,
          failureReason: row.invitation_failure_reason || null,
          providerMessageId: row.invitation_provider_message_id || null,
          emailChannelAccessSent: row.email_channel_status === 'sent',
          emailChannelSentAt: row.email_channel_sent_at || null
        }
      });
    }

    const group = parentMap.get(row.parent_id)!;
    const isSelected = QUALIFYING_CHILD_STATUSES.includes(row.child_status);
    group.children.push({
      id: row.child_id,
      fullName: row.child_name || 'Child',
      firstName: extractFirstName(row.child_name),
      status: row.child_status,
      ageGroup: row.child_age_group || null,
      isSelected,
      dateOfBirth: row.child_dob || null,
      calculatedAge: row.child_calculated_age !== null && row.child_calculated_age !== undefined ? Number(row.child_calculated_age) : null
    });
  }

  // Filter parents: ONLY qualify if at least 1 child is in a qualifying state!
  const allEligibleRecords: SelectedParentRecord[] = [];

  for (const group of parentMap.values()) {
    const selectedChildren = group.children.filter(c => c.isSelected);
    if (selectedChildren.length === 0) {
      // Disqualified: no children selected for this event
      continue;
    }

    const selectedChildNames = formatSelectedChildNames(selectedChildren.map(c => c.firstName));
    const totalRegistered = group.children.length;
    const selectedCount = selectedChildren.length;
    const selectedRatioText = `${selectedCount} of ${totalRegistered} selected`;

    // WhatsApp availability evaluation
    const candidate = resolveParentWhatsAppCandidate(
      {
        phone_number: group.parent.phoneNumber,
        whatsapp_number: group.parent.whatsappNumber,
        country_iso: group.parent.countryIso
      },
      true
    );

    let whatsappAvailability: 'available' | 'opted_out' | 'invalid_number' = 'available';
    if (group.parent.whatsappConsentStatus === 'opted_out') {
      whatsappAvailability = 'opted_out';
    } else if (!candidate.normalizedNumber) {
      whatsappAvailability = 'invalid_number';
    }

    allEligibleRecords.push({
      parentId: group.parent.id,
      userId: group.parent.userId,
      fullName: group.parent.fullName,
      firstName: group.parent.firstName,
      phoneNumber: group.parent.phoneNumber,
      whatsappNumber: group.parent.whatsappNumber,
      email: group.parent.email,
      whatsappConsentStatus: group.parent.whatsappConsentStatus,
      whatsappAvailability,
      normalizedWhatsAppNumber: candidate.normalizedNumber,
      totalRegisteredChildren: totalRegistered,
      selectedChildrenCount: selectedCount,
      selectedRatioText,
      selectedChildNames,
      children: group.children,
      invitationStatus: group.invitation.status === 'sent'
        ? 'sent'
        : group.invitation.status === 'failed'
          ? 'failed'
          : 'not_sent',
      sentAt: group.invitation.sentAt,
      attemptedAt: group.invitation.attemptedAt,
      failureReason: group.invitation.failureReason,
      providerMessageId: group.invitation.providerMessageId,
      emailChannelAccessSent: group.invitation.emailChannelAccessSent,
      emailChannelSentAt: group.invitation.emailChannelSentAt
    });
  }

  // Global summary metrics across all eligible parents
  const totalSelectedChildren = allEligibleRecords.reduce((sum, p) => sum + p.selectedChildrenCount, 0);
  const summary = {
    totalEligibleParents: allEligibleRecords.length,
    totalSelectedChildren,
    invitationsNotSent: allEligibleRecords.filter(p => p.invitationStatus === 'not_sent').length,
    invitationsSent: allEligibleRecords.filter(p => p.invitationStatus === 'sent').length,
    invitationsFailed: allEligibleRecords.filter(p => p.invitationStatus === 'failed').length,
    whatsappAvailable: allEligibleRecords.filter(p => p.whatsappAvailability === 'available').length,
    whatsappUnavailable: allEligibleRecords.filter(p => p.whatsappAvailability !== 'available').length
  };

  // Apply filters if provided
  let filtered = allEligibleRecords;

  if (options?.status && options.status !== 'all') {
    filtered = filtered.filter(p => p.invitationStatus === options.status);
  }

  if (options?.whatsappStatus && options.whatsappStatus !== 'all') {
    if (options.whatsappStatus === 'available') {
      filtered = filtered.filter(p => p.whatsappAvailability === 'available');
    } else if (options.whatsappStatus === 'unavailable') {
      filtered = filtered.filter(p => p.whatsappAvailability !== 'available');
    }
  }

  if (options?.search && options.search.trim()) {
    const q = options.search.trim().toLowerCase();
    filtered = filtered.filter(p =>
      p.fullName.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.phoneNumber && p.phoneNumber.toLowerCase().includes(q)) ||
      (p.whatsappNumber && p.whatsappNumber.toLowerCase().includes(q)) ||
      p.selectedChildNames.toLowerCase().includes(q) ||
      p.children.some(c => c.fullName.toLowerCase().includes(q))
    );
  }

  return {
    eventId,
    eventTitle,
    templateConfigured: isChannelTemplateConfigured(),
    templateKeyOrAlias: getChannelTemplateKey(),
    summary,
    parents: filtered
  };
}

/**
 * Records successful channel invitation delivery for a parent and event.
 * Handles cross-workflow deduplication (e.g. from pass_ready_v2 or dedicated channel template).
 */
export async function recordChannelInvitationSent(params: {
  parentId: string;
  eventId: string;
  channel?: 'whatsapp' | 'email';
  templateKey?: string | null;
  templateAlias?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  initiatingAdminUserId?: string | null;
  selectedChildNames?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const channel = params.channel || 'whatsapp';
  const id = `pci-${channel}-${params.eventId}-${params.parentId}`;

  await execute(
    `INSERT INTO parent_channel_invitations (
       id, parent_id, event_id, communication_purpose, channel,
       template_key, template_alias, provider, provider_message_id,
       status, failure_reason, initiating_admin_user_id, selected_child_names,
       attempted_at, sent_at, created_at, updated_at
     ) VALUES (?, ?, ?, 'parents_channel_invitation', ?, ?, ?, ?, ?, 'sent', NULL, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(parent_id, event_id, communication_purpose, channel) DO UPDATE SET
       status = 'sent',
       template_key = COALESCE(excluded.template_key, parent_channel_invitations.template_key),
       template_alias = COALESCE(excluded.template_alias, parent_channel_invitations.template_alias),
       provider = COALESCE(excluded.provider, parent_channel_invitations.provider),
       provider_message_id = COALESCE(excluded.provider_message_id, parent_channel_invitations.provider_message_id),
       failure_reason = NULL,
       initiating_admin_user_id = COALESCE(excluded.initiating_admin_user_id, parent_channel_invitations.initiating_admin_user_id),
       selected_child_names = COALESCE(excluded.selected_child_names, parent_channel_invitations.selected_child_names),
       attempted_at = excluded.attempted_at,
       sent_at = excluded.sent_at,
       updated_at = excluded.updated_at`,
    [
      id,
      params.parentId,
      params.eventId,
      channel,
      params.templateKey || null,
      params.templateAlias || (channel === 'whatsapp' ? 'koinonia_selected_parent_channel' : 'email_selection_pass_ready'),
      params.provider || (channel === 'whatsapp' ? 'zoho' : 'smtp'),
      params.providerMessageId || null,
      params.initiatingAdminUserId || null,
      params.selectedChildNames || null,
      now,
      now,
      now,
      now
    ]
  );
}

/**
 * Dispatches dedicated WhatsApp Parents Channel invitations for selected parents.
 * Performs rigorous server-side validation against current live database state.
 */
export async function sendSelectedParentsChannelInvitations(params: {
  eventId: string;
  parentIds: string[];
  adminUserId: string;
  resend?: boolean;
}): Promise<SendChannelInvitationsResult> {
  const { eventId, parentIds, adminUserId, resend = false } = params;

  const templateConfigured = isChannelTemplateConfigured();
  const templateKey = getChannelTemplateKey();

  if (!templateConfigured) {
    return {
      success: false,
      templateConfigured: false,
      totalRequested: parentIds.length,
      sentCount: 0,
      skippedCount: parentIds.length,
      failedCount: 0,
      error: 'WhatsApp template pending approval',
      details: parentIds.map(id => ({
        parentId: id,
        parentName: 'Parent',
        status: 'skipped',
        reason: 'WhatsApp template pending approval'
      }))
    };
  }

  const event = await queryOne<{ id: string; title: string }>(
    `SELECT id, title FROM events WHERE id = ?`,
    [eventId]
  );
  const eventTitle = event?.title || 'Koinonia General Assembly Children\'s Session 2026';

  const provider = getWhatsAppProvider();
  // Approved template koinonia_selected_parent_channel_v2 embeds the direct WhatsApp Channel link directly in message body.
  // Static destination: https://whatsapp.com/channel/0029VbE5UslCHDykcFlf3y0U

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const details: SendResultDetail[] = [];

  for (const parentId of parentIds) {
    // 1. Fetch live parent record
    const parent = await queryOne<any>(
      `SELECT p.id, p.user_id, p.full_name, p.phone_number, p.whatsapp_number, p.whatsapp_consent_status, p.country_iso, u.email
       FROM parent_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`,
      [parentId]
    );

    if (!parent) {
      skippedCount++;
      details.push({
        parentId,
        parentName: 'Unknown',
        status: 'skipped',
        reason: 'Parent record not found'
      });
      continue;
    }

    const parentName = parent.full_name || 'Parent';

    // 2. Fetch live qualifying children for this event
    const children = await query<any>(
      `SELECT c.id, c.full_name, cee.status
       FROM children c
       JOIN child_event_entries cee ON cee.child_id = c.id AND cee.event_id = ? AND COALESCE(cee.is_deleted, 0) = 0
       WHERE c.parent_profile_id = ?
       ORDER BY c.date_of_birth ASC, c.created_at ASC, c.id ASC`,
      [eventId, parentId]
    );

    const qualifyingChildren = children.filter(c => QUALIFYING_CHILD_STATUSES.includes(c.status));

    if (qualifyingChildren.length === 0) {
      skippedCount++;
      details.push({
        parentId,
        parentName,
        status: 'skipped',
        reason: 'No qualifying selected child'
      });
      continue;
    }

    // 3. Check existing invitation delivery state
    const existingInvitation = await queryOne<any>(
      `SELECT status, sent_at FROM parent_channel_invitations
       WHERE parent_id = ? AND event_id = ? AND communication_purpose = 'parents_channel_invitation'`,
      [parentId, eventId]
    );

    if (existingInvitation?.status === 'sent' && !resend) {
      skippedCount++;
      details.push({
        parentId,
        parentName,
        status: 'skipped',
        reason: 'Already sent'
      });
      continue;
    }

    // 4. WhatsApp consent verification
    if (parent.whatsapp_consent_status === 'opted_out') {
      skippedCount++;
      details.push({
        parentId,
        parentName,
        status: 'skipped',
        reason: 'WhatsApp not opted in'
      });
      continue;
    }

    // 5. WhatsApp destination number normalization
    const candidate = resolveParentWhatsAppCandidate(
      {
        phone_number: parent.phone_number,
        whatsapp_number: parent.whatsapp_number,
        country_iso: parent.country_iso || 'NG'
      },
      true
    );

    if (!candidate.normalizedNumber) {
      failedCount++;
      details.push({
        parentId,
        parentName,
        status: 'failed',
        reason: 'Invalid WhatsApp number'
      });
      continue;
    }

    // 6. Personalization merge information
    const parentFirstName = extractFirstName(parent.full_name);
    const selectedChildNames = formatSelectedChildNames(
      qualifyingChildren.map(c => extractFirstName(c.full_name))
    );

    if (!parentFirstName) {
      failedCount++;
      details.push({
        parentId,
        parentName,
        status: 'failed',
        reason: 'Missing parent name'
      });
      continue;
    }

    if (!selectedChildNames) {
      failedCount++;
      details.push({
        parentId,
        parentName,
        status: 'failed',
        reason: 'Missing selected-child names'
      });
      continue;
    }

    const mergeInfo = buildMergeInfo({
      parentFirstName,
      parentFullName: parent.full_name,
      selectedChildNames,
      eventName: eventTitle
    });

    const validation = validateMergeInfo(
      ['parent_first_name', 'selected_child_names'],
      mergeInfo
    );

    if (!validation.valid) {
      failedCount++;
      details.push({
        parentId,
        parentName,
        status: 'failed',
        reason: validation.error || 'Personalization validation failed'
      });
      continue;
    }

    // 7. Dispatch message
    const now = new Date().toISOString();
    const idempotencyKey = `pci:${eventId}:${parentId}:${Date.now()}`;
    const messageBody = `Hi ${parentFirstName}, selection has been confirmed for ${selectedChildNames} for the Koinonia General Assembly Children's Session 2026.\n\nPlease follow the official Parents Channel for important Children's Session updates, including arrival, check-in and pickup information:\n\nhttps://whatsapp.com/channel/0029VbE5UslCHDykcFlf3y0U\n\nThis channel is for registered parents and guardians of selected children only. Please do not share this link with others.`;

    try {
      const sendResult = await provider.sendSessionMessage({
        to: candidate.normalizedNumber,
        body: messageBody,
        intent: 'selected_parent_channel',
        templateKey: templateKey || undefined,
        mergeInfo,
        idempotencyKey
      });

      if (sendResult.success) {
        sentCount++;
        const messageId = sendResult.messageId || `msg-${Date.now()}`;
        details.push({
          parentId,
          parentName,
          status: 'sent',
          messageId
        });

        // Record invitation as sent
        await recordChannelInvitationSent({
          parentId,
          eventId,
          templateKey,
          templateAlias: 'selected-parent-channel-v2',
          provider: provider.name,
          providerMessageId: messageId,
          initiatingAdminUserId: adminUserId,
          selectedChildNames
        });

        // Record in delivery logs
        await logWhatsAppDelivery({
          campaignId: `channel_invitation_${eventId}`,
          parentProfileId: parentId,
          userId: parent.user_id,
          recipientPhone: candidate.normalizedNumber,
          provider: provider.name,
          providerMessageId: messageId,
          templateName: templateKey || 'koinonia_selected_parent_channel_v2',
          status: sendResult.status === 'queued' ? 'queued' : 'sent',
          sentAt: now
        });
      } else {
        failedCount++;
        const errMsg = sendResult.error || 'Provider rejected request';
        details.push({
          parentId,
          parentName,
          status: 'failed',
          reason: errMsg
        });

        // Record failure in parent_channel_invitations
        const pciId = `pci-whatsapp-${eventId}-${parentId}`;
        await execute(
          `INSERT INTO parent_channel_invitations (
             id, parent_id, event_id, communication_purpose, channel,
             template_key, template_alias, provider, provider_message_id,
             status, failure_reason, initiating_admin_user_id, selected_child_names,
             attempted_at, sent_at, created_at, updated_at
           ) VALUES (?, ?, ?, 'parents_channel_invitation', 'whatsapp', ?, ?, ?, NULL, 'failed', ?, ?, ?, ?, NULL, ?, ?)
           ON CONFLICT(parent_id, event_id, communication_purpose, channel) DO UPDATE SET
             status = 'failed',
             template_key = COALESCE(excluded.template_key, parent_channel_invitations.template_key),
             template_alias = COALESCE(excluded.template_alias, parent_channel_invitations.template_alias),
             provider = COALESCE(excluded.provider, parent_channel_invitations.provider),
             failure_reason = excluded.failure_reason,
             initiating_admin_user_id = COALESCE(excluded.initiating_admin_user_id, parent_channel_invitations.initiating_admin_user_id),
             selected_child_names = COALESCE(excluded.selected_child_names, parent_channel_invitations.selected_child_names),
             attempted_at = excluded.attempted_at,
             updated_at = excluded.updated_at`,
          [
            pciId,
            parentId,
            eventId,
            templateKey || null,
            'koinonia_selected_parent_channel',
            provider.name,
            errMsg,
            adminUserId,
            selectedChildNames,
            now,
            now,
            now
          ]
        );
      }
    } catch (sendErr: any) {
      failedCount++;
      const errMsg = sendErr?.message || 'Unexpected dispatch error';
      details.push({
        parentId,
        parentName,
        status: 'failed',
        reason: errMsg
      });
    }
  }

  // 8. Record audit log entry
  try {
    const auditId = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    await execute(
      `INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        auditId,
        adminUserId,
        'admin',
        'send_selected_parents_channel_invitations',
        'event',
        eventId,
        JSON.stringify({
          eventId,
          eventTitle,
          totalRequested: parentIds.length,
          sentCount,
          skippedCount,
          failedCount,
          resendRequested: resend,
          timestamp: new Date().toISOString()
        }),
        new Date().toISOString()
      ]
    );
  } catch (auditErr) {
    console.warn('[SelectedParentsChannel] Failed to write audit log:', auditErr);
  }

  return {
    success: true,
    templateConfigured: true,
    totalRequested: parentIds.length,
    sentCount,
    skippedCount,
    failedCount,
    details
  };
}
