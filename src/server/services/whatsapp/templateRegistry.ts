/**
 * Centralized Zoho CPaaS WhatsApp Template Registry
 * 
 * Provides a single source of truth mapping internal notification events / intents
 * to approved Zoho templates, expected placeholder variables, and environment configuration.
 */

import { parseTemplateValue, ResolvedZohoTemplate } from './zohoProvider';

export type TemplateCategory = 'parent' | 'child_parent' | 'volunteer' | 'system' | 'general';

export interface ZohoTemplateDefinition {
  intent: string;
  defaultAlias: string;
  envVarKeys: string[];
  category: TemplateCategory;
  requiredMergeFields: string[];
  description: string;
  supportsHeaderImage?: boolean;
}

/**
 * Standard registry mapping notification intents to approved Zoho templates.
 */
export const ZOHO_TEMPLATE_REGISTRY: Record<string, ZohoTemplateDefinition> = {
  // 1. Registration Acknowledgement
  registration_ack: {
    intent: 'registration_ack',
    defaultAlias: 'koinonia_registration_ack',
    envVarKeys: ['ZOHO_WA_TEMPLATE_REGISTRATION_ACK', 'ZOHO_WA_TEMPLATE_KOINONIA_REGISTRATION_ACK'],
    category: 'parent',
    requiredMergeFields: ['first_name'],
    description: 'Sent upon initial parent registration'
  },
  registration_acknowledgement: {
    intent: 'registration_acknowledgement',
    defaultAlias: 'koinonia_registration_ack',
    envVarKeys: ['ZOHO_WA_TEMPLATE_REGISTRATION_ACK', 'ZOHO_WA_TEMPLATE_KOINONIA_REGISTRATION_ACK'],
    category: 'parent',
    requiredMergeFields: ['first_name'],
    description: 'Sent upon initial parent registration (alias)'
  },

  // 2. Application Submitted / Under Review
  child_under_review: {
    intent: 'child_under_review',
    defaultAlias: 'koinonia_child_under_review',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_UNDER_REVIEW', 'ZOHO_WA_TEMPLATE_CHILD_UNDER_REVIEW'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Notification to parent that application has been received and is under review'
  },
  under_review: {
    intent: 'under_review',
    defaultAlias: 'koinonia_child_under_review',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_UNDER_REVIEW', 'ZOHO_WA_TEMPLATE_CHILD_UNDER_REVIEW'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Notification to parent that application is under review (alias)'
  },

  // 3. Child Approved / Selected
  child_approved: {
    intent: 'child_approved',
    defaultAlias: 'koinonia_child_approved',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_APPROVED', 'ZOHO_WA_TEMPLATE_REVIEW_DECISION'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Notification to parent that child application has been approved / selected'
  },
  review_decision: {
    intent: 'review_decision',
    defaultAlias: 'koinonia_child_approved',
    envVarKeys: ['ZOHO_WA_TEMPLATE_REVIEW_DECISION', 'ZOHO_WA_TEMPLATE_KOINONIA_CHILD_APPROVED'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Notification of review outcome'
  },

  // 4. Child Not Selected
  child_not_selected: {
    intent: 'child_not_selected',
    defaultAlias: 'koinonia_child_not_selected',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_NOT_SELECTED', 'ZOHO_WA_TEMPLATE_CHILD_NOT_SELECTED'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Notification to parent that child was not selected'
  },
  not_selected: {
    intent: 'not_selected',
    defaultAlias: 'koinonia_child_not_selected',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_NOT_SELECTED', 'ZOHO_WA_TEMPLATE_CHILD_NOT_SELECTED'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Notification of not selected status (alias)'
  },

  // 5. Child Waitlisted
  child_waitlisted: {
    intent: 'child_waitlisted',
    defaultAlias: 'koinonia_child_waitlisted',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_WAITLISTED', 'ZOHO_WA_TEMPLATE_CHILD_WAITLISTED'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Notification to parent that child has been placed on waiting list'
  },
  waiting_list: {
    intent: 'waiting_list',
    defaultAlias: 'koinonia_child_waitlisted',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_WAITLISTED', 'ZOHO_WA_TEMPLATE_CHILD_WAITLISTED'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Notification of waiting list status (alias)'
  },

  // 6. Pass Ready (v1 - existing production template)
  pass_ready: {
    intent: 'pass_ready',
    defaultAlias: 'koinonia_pass_ready',
    envVarKeys: [
      'ZOHO_WA_TEMPLATE_KOINONIA_PASS_READY_V2',
      'ZOHO_WA_TEMPLATE_PASS_READY_V2',
      'ZOHO_WA_TEMPLATE_KOINONIA_PASS_READY',
      'ZOHO_WA_TEMPLATE_PASS_READY'
    ],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Notification to parent that event pass is ready for download / display',
    supportsHeaderImage: true
  },

  // 7. Pass Ready v2 (new proposed approved template)
  pass_ready_v2: {
    intent: 'pass_ready_v2',
    defaultAlias: 'koinonia_pass_ready_v2',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_PASS_READY_V2', 'ZOHO_WA_TEMPLATE_PASS_READY_V2'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Pass ready v2 template with Channel CTA link support',
    supportsHeaderImage: true
  },

  // 8. Completion Reminder / Return to Draft
  completion_reminder: {
    intent: 'completion_reminder',
    defaultAlias: 'koinonia_application_incomplete',
    envVarKeys: [
      'ZOHO_WA_TEMPLATE_COMPLETION_REMINDER',
      'ZOHO_WA_TEMPLATE_KOINONIA_APPLICATION_INCOMPLETE',
      'ZOHO_WA_TEMPLATE_RETURN_TO_DRAFT'
    ],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Reminder to complete application before registration deadline'
  },
  return_to_draft: {
    intent: 'return_to_draft',
    defaultAlias: 'koinonia_application_incomplete',
    envVarKeys: [
      'ZOHO_WA_TEMPLATE_RETURN_TO_DRAFT',
      'ZOHO_WA_TEMPLATE_KOINONIA_APPLICATION_INCOMPLETE',
      'ZOHO_WA_TEMPLATE_COMPLETION_REMINDER'
    ],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Action required notice when application is unlocked for parent correction'
  },

  // 9. Event Check-in Opening / Reminder
  checkin_opening: {
    intent: 'checkin_opening',
    defaultAlias: 'koinonia_checkin_reminder',
    envVarKeys: ['ZOHO_WA_TEMPLATE_CHECKIN_OPENING', 'ZOHO_WA_TEMPLATE_KOINONIA_CHECKIN_REMINDER'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Event day arrival reminder and pass ready notice'
  },
  checkin_reminder: {
    intent: 'checkin_reminder',
    defaultAlias: 'koinonia_checkin_reminder',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHECKIN_REMINDER', 'ZOHO_WA_TEMPLATE_CHECKIN_OPENING'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Event day arrival reminder and pass ready notice (alias)'
  },

  // 10. Pickup Reminder
  pickup_reminder: {
    intent: 'pickup_reminder',
    defaultAlias: 'koinonia_pickup_reminder',
    envVarKeys: ['ZOHO_WA_TEMPLATE_PICKUP_REMINDER'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Event day pickup readiness reminder'
  },

  // 11. Volunteer Duty Reminder
  duty_reminder: {
    intent: 'duty_reminder',
    defaultAlias: 'koinonia_duty_reminder',
    envVarKeys: ['ZOHO_WA_TEMPLATE_DUTY_REMINDER'],
    category: 'volunteer',
    requiredMergeFields: ['volunteer_first_name'],
    description: 'Volunteer schedule and duty location reminder'
  },

  // 12. Inquiry Reply (to parent)
  inquiry_reply: {
    intent: 'inquiry_reply',
    defaultAlias: 'koinonia_inquiry_reply',
    envVarKeys: ['ZOHO_WA_TEMPLATE_INQUIRY_REPLY'],
    category: 'parent',
    requiredMergeFields: ['parent_first_name'],
    description: 'Response from administrative team to parent message'
  },

  // 13. Volunteer Reply
  volunteer_reply: {
    intent: 'volunteer_reply',
    defaultAlias: 'koinonia_volunteer_reply',
    envVarKeys: ['ZOHO_WA_TEMPLATE_VOLUNTEER_REPLY'],
    category: 'volunteer',
    requiredMergeFields: ['volunteer_first_name'],
    description: 'Response from administrative team to volunteer message'
  },

  // 14. Broadcasts
  broadcast: {
    intent: 'broadcast',
    defaultAlias: 'koinonia_broadcast',
    envVarKeys: ['ZOHO_WA_TEMPLATE_BROADCAST', 'ZOHO_WA_DEFAULT_TEMPLATE'],
    category: 'general',
    requiredMergeFields: ['first_name'],
    description: 'Administrative broadcast announcement'
  },
  manual_broadcast: {
    intent: 'manual_broadcast',
    defaultAlias: 'koinonia_broadcast',
    envVarKeys: ['ZOHO_WA_TEMPLATE_BROADCAST', 'ZOHO_WA_DEFAULT_TEMPLATE'],
    category: 'general',
    requiredMergeFields: ['first_name'],
    description: 'Manual administrative broadcast announcement'
  },

  // 15. System / Test
  super_admin_test: {
    intent: 'super_admin_test',
    defaultAlias: 'koinonia_test',
    envVarKeys: ['ZOHO_WA_TEMPLATE_TEST', 'ZOHO_WA_DEFAULT_TEMPLATE'],
    category: 'system',
    requiredMergeFields: ['first_name'],
    description: 'Controlled administrator test dispatch'
  },
  test: {
    intent: 'test',
    defaultAlias: 'koinonia_test',
    envVarKeys: ['ZOHO_WA_TEMPLATE_TEST', 'ZOHO_WA_DEFAULT_TEMPLATE'],
    category: 'system',
    requiredMergeFields: ['first_name'],
    description: 'Controlled test dispatch (alias)'
  },

  // 16. Selected Parents Channel Invitation
  selected_parent_channel: {
    intent: 'selected_parent_channel',
    defaultAlias: 'selected-parent-channel-v2',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL', 'ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL'],
    category: 'parent',
    requiredMergeFields: ['parent_first_name', 'selected_child_names'],
    description: 'WhatsApp Parents Channel invitation linking directly to official WhatsApp Channel in approved template body'
  },
  selected_parents_channel: {
    intent: 'selected_parent_channel',
    defaultAlias: 'selected-parent-channel-v2',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL', 'ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL'],
    category: 'parent',
    requiredMergeFields: ['parent_first_name', 'selected_child_names'],
    description: 'WhatsApp Parents Channel invitation linking directly to official WhatsApp Channel in approved template body (alias)'
  },
  koinonia_selected_parent_channel_v2: {
    intent: 'selected_parent_channel',
    defaultAlias: 'selected-parent-channel-v2',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL', 'ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL'],
    category: 'parent',
    requiredMergeFields: ['parent_first_name', 'selected_child_names'],
    description: 'Approved v2 WhatsApp Parents Channel invitation with direct channel URL in body'
  },
  selected_parent_channel_v2: {
    intent: 'selected_parent_channel',
    defaultAlias: 'selected-parent-channel-v2',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL', 'ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL'],
    category: 'parent',
    requiredMergeFields: ['parent_first_name', 'selected_child_names'],
    description: 'Approved v2 WhatsApp Parents Channel invitation with direct channel URL in body (alias)'
  },

  // 17. Post-Attendance Check-in Confirmation
  child_checked_in: {
    intent: 'child_checked_in',
    defaultAlias: 'koinonia_child_checked_in',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_CHECKED_IN', 'ZOHO_WA_TEMPLATE_CHILD_CHECKED_IN'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name', 'checkin_time'],
    description: 'Automated WhatsApp confirmation to parent upon child check-in'
  },
  koinonia_child_checked_in: {
    intent: 'child_checked_in',
    defaultAlias: 'koinonia_child_checked_in',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_CHECKED_IN', 'ZOHO_WA_TEMPLATE_CHILD_CHECKED_IN'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name', 'checkin_time'],
    description: 'Direct alias for koinonia_child_checked_in'
  },

  // 18. Post-Attendance Pickup / Checkout Confirmation
  child_picked_up: {
    intent: 'child_picked_up',
    defaultAlias: 'koinonia_child_picked_up',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_PICKED_UP', 'ZOHO_WA_TEMPLATE_CHILD_PICKED_UP'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name', 'pickup_time'],
    description: 'Automated WhatsApp confirmation to parent upon child pickup/checkout'
  },
  koinonia_child_picked_up: {
    intent: 'child_picked_up',
    defaultAlias: 'koinonia_child_picked_up',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_PICKED_UP', 'ZOHO_WA_TEMPLATE_CHILD_PICKED_UP'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name', 'pickup_time'],
    description: 'Direct alias for koinonia_child_picked_up'
  },

  // Direct template alias aliases for convenience
  koinonia_registration_ack: {
    intent: 'registration_ack',
    defaultAlias: 'koinonia_registration_ack',
    envVarKeys: ['ZOHO_WA_TEMPLATE_REGISTRATION_ACK', 'ZOHO_WA_TEMPLATE_KOINONIA_REGISTRATION_ACK'],
    category: 'parent',
    requiredMergeFields: ['first_name'],
    description: 'Direct alias for koinonia_registration_ack'
  },
  koinonia_child_under_review: {
    intent: 'child_under_review',
    defaultAlias: 'koinonia_child_under_review',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_UNDER_REVIEW', 'ZOHO_WA_TEMPLATE_CHILD_UNDER_REVIEW'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Direct alias for koinonia_child_under_review'
  },
  koinonia_child_approved: {
    intent: 'child_approved',
    defaultAlias: 'koinonia_child_approved',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_APPROVED', 'ZOHO_WA_TEMPLATE_REVIEW_DECISION'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Direct alias for koinonia_child_approved'
  },
  koinonia_child_not_selected: {
    intent: 'child_not_selected',
    defaultAlias: 'koinonia_child_not_selected',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_NOT_SELECTED', 'ZOHO_WA_TEMPLATE_CHILD_NOT_SELECTED'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Direct alias for koinonia_child_not_selected'
  },
  koinonia_child_waitlisted: {
    intent: 'child_waitlisted',
    defaultAlias: 'koinonia_child_waitlisted',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHILD_WAITLISTED', 'ZOHO_WA_TEMPLATE_CHILD_WAITLISTED'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Direct alias for koinonia_child_waitlisted'
  },
  koinonia_pass_ready: {
    intent: 'pass_ready',
    defaultAlias: 'koinonia_pass_ready',
    envVarKeys: [
      'ZOHO_WA_TEMPLATE_KOINONIA_PASS_READY_V2',
      'ZOHO_WA_TEMPLATE_PASS_READY_V2',
      'ZOHO_WA_TEMPLATE_KOINONIA_PASS_READY',
      'ZOHO_WA_TEMPLATE_PASS_READY'
    ],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Direct alias for koinonia_pass_ready',
    supportsHeaderImage: true
  },
  koinonia_pass_ready_v2: {
    intent: 'pass_ready_v2',
    defaultAlias: 'koinonia_pass_ready_v2',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_PASS_READY_V2', 'ZOHO_WA_TEMPLATE_PASS_READY_V2'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Direct alias for koinonia_pass_ready_v2',
    supportsHeaderImage: true
  },
  koinonia_application_incomplete: {
    intent: 'completion_reminder',
    defaultAlias: 'koinonia_application_incomplete',
    envVarKeys: [
      'ZOHO_WA_TEMPLATE_COMPLETION_REMINDER',
      'ZOHO_WA_TEMPLATE_KOINONIA_APPLICATION_INCOMPLETE',
      'ZOHO_WA_TEMPLATE_RETURN_TO_DRAFT'
    ],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Direct alias for koinonia_application_incomplete'
  },
  koinonia_checkin_reminder: {
    intent: 'checkin_reminder',
    defaultAlias: 'koinonia_checkin_reminder',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_CHECKIN_REMINDER', 'ZOHO_WA_TEMPLATE_CHECKIN_OPENING'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Direct alias for koinonia_checkin_reminder'
  },
  koinonia_pickup_reminder: {
    intent: 'pickup_reminder',
    defaultAlias: 'koinonia_pickup_reminder',
    envVarKeys: ['ZOHO_WA_TEMPLATE_PICKUP_REMINDER'],
    category: 'child_parent',
    requiredMergeFields: ['parent_first_name', 'child_first_name'],
    description: 'Direct alias for koinonia_pickup_reminder'
  },
  koinonia_duty_reminder: {
    intent: 'duty_reminder',
    defaultAlias: 'koinonia_duty_reminder',
    envVarKeys: ['ZOHO_WA_TEMPLATE_DUTY_REMINDER'],
    category: 'volunteer',
    requiredMergeFields: ['volunteer_first_name'],
    description: 'Direct alias for koinonia_duty_reminder'
  },
  koinonia_inquiry_reply: {
    intent: 'inquiry_reply',
    defaultAlias: 'koinonia_inquiry_reply',
    envVarKeys: ['ZOHO_WA_TEMPLATE_INQUIRY_REPLY'],
    category: 'parent',
    requiredMergeFields: ['parent_first_name'],
    description: 'Direct alias for koinonia_inquiry_reply'
  },
  koinonia_volunteer_reply: {
    intent: 'volunteer_reply',
    defaultAlias: 'koinonia_volunteer_reply',
    envVarKeys: ['ZOHO_WA_TEMPLATE_VOLUNTEER_REPLY'],
    category: 'volunteer',
    requiredMergeFields: ['volunteer_first_name'],
    description: 'Direct alias for koinonia_volunteer_reply'
  },
  koinonia_broadcast: {
    intent: 'broadcast',
    defaultAlias: 'koinonia_broadcast',
    envVarKeys: ['ZOHO_WA_TEMPLATE_BROADCAST', 'ZOHO_WA_DEFAULT_TEMPLATE'],
    category: 'general',
    requiredMergeFields: ['first_name'],
    description: 'Direct alias for koinonia_broadcast'
  },
  koinonia_test: {
    intent: 'test',
    defaultAlias: 'koinonia_test',
    envVarKeys: ['ZOHO_WA_TEMPLATE_TEST', 'ZOHO_WA_DEFAULT_TEMPLATE'],
    category: 'system',
    requiredMergeFields: ['first_name'],
    description: 'Direct alias for koinonia_test'
  },
  koinonia_selected_parent_channel: {
    intent: 'selected_parent_channel',
    defaultAlias: 'koinonia_selected_parent_channel',
    envVarKeys: ['ZOHO_WA_TEMPLATE_KOINONIA_SELECTED_PARENT_CHANNEL', 'ZOHO_WA_TEMPLATE_SELECTED_PARENT_CHANNEL'],
    category: 'parent',
    requiredMergeFields: ['parent_first_name', 'selected_child_names'],
    description: 'Direct alias for koinonia_selected_parent_channel'
  }
};

/**
 * Returns the template definition for a given intent or name.
 */
export function getTemplateDefinition(intentOrName?: string): ZohoTemplateDefinition | null {
  if (!intentOrName) return null;
  const clean = intentOrName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return ZOHO_TEMPLATE_REGISTRY[clean] || null;
}

/**
 * Gets required merge placeholder keys for a given intent or template name.
 */
export function getRequiredMergeFieldsForIntent(intentOrName?: string): string[] {
  const def = getTemplateDefinition(intentOrName);
  if (def) {
    return def.requiredMergeFields;
  }
  // If unrecognized intent or raw template name, infer from common naming conventions
  const clean = (intentOrName || '').toLowerCase();
  if (!clean) return [];
  if (clean.includes('duty') || clean.includes('volunteer')) {
    return ['volunteer_first_name'];
  }
  if (clean.includes('selected_parent') || clean.includes('channel_invitation')) {
    return ['parent_first_name', 'selected_child_names'];
  }
  if (clean.includes('checkin') || clean.includes('checked_in')) {
    return ['parent_first_name', 'child_first_name', 'checkin_time'];
  }
  if (clean.includes('pickup') || clean.includes('picked_up')) {
    return ['parent_first_name', 'child_first_name', 'pickup_time'];
  }
  if (
    clean.includes('pass') ||
    clean.includes('child') ||
    clean.includes('under_review') ||
    clean.includes('waitlist')
  ) {
    return ['parent_first_name', 'child_first_name'];
  }
  return [];
}
