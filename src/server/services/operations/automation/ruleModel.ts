import { ActionKey } from '../actions/types';
import { EventSignalType } from './signals';

/**
 * Deterministic Automation Rules — Phase 3B Event Automation Engine
 * 
 * STRICT ARCHITECTURAL CONSTRAINTS:
 * 1. Safe default: Detection is ON, automatic write execution is strictly OFF (NO_AUTONOMOUS_EXECUTION = true).
 * 2. NO silent parent/volunteer communications.
 * 3. Proposes existing Phase 3A confirmed actions for explicit Admin review.
 * 4. Human-led safety: Mandatory safety controls cannot be disabled.
 */

export const NO_AUTONOMOUS_EXECUTION = true;

export type AutomationSeverity = 'information' | 'attention' | 'urgent';

export interface ProposedAutomationAction {
  actionKey: ActionKey;
  targetScope: 'location' | 'volunteer' | 'event' | 'report' | 'system';
  requiresHumanConfirmation: boolean;
  label: string;
}

export interface AutomationRuleDefinition {
  id: string;
  ruleKey: string;
  name: string;
  description: string;
  triggerSignal: EventSignalType;
  defaultSeverity: AutomationSeverity;
  proposedAction?: ProposedAutomationAction;
  actionTargetRoute: string;
  actionTargetLabel: string;
  isEnabled: boolean;
  isMandatory?: boolean; // If true, Admin cannot disable (e.g. safety items)
  defaultCooldownMinutes: number;
}

export const PHASE3B_AUTOMATION_RULES: AutomationRuleDefinition[] = [
  {
    id: 'rule_registration_closing_soon',
    ruleKey: 'REGISTRATION_CLOSING',
    name: 'Registration closing reminder',
    description: 'Alerts when parent registration is closing within 24 hours.',
    triggerSignal: 'REGISTRATION_CLOSING_SOON',
    defaultSeverity: 'attention',
    actionTargetRoute: 'events',
    actionTargetLabel: 'Edit event →',
    isEnabled: true,
    defaultCooldownMinutes: 120
  },
  {
    id: 'rule_volunteer_registration_closing_soon',
    ruleKey: 'VOLUNTEER_REGISTRATION_CLOSING',
    name: 'Volunteer registration closing reminder',
    description: 'Alerts when volunteer registration is closing within 24 hours.',
    triggerSignal: 'VOLUNTEER_REGISTRATION_CLOSING_SOON',
    defaultSeverity: 'attention',
    actionTargetRoute: 'events',
    actionTargetLabel: 'Edit event →',
    isEnabled: true,
    defaultCooldownMinutes: 120
  },
  {
    id: 'rule_location_understaffed',
    ruleKey: 'LOCATION_UNDERSTAFFED',
    name: 'Duty coverage alerts',
    description: 'Alerts when a physical duty location has fewer assigned volunteers than required.',
    triggerSignal: 'LOCATION_UNDERSTAFFED',
    defaultSeverity: 'attention',
    proposedAction: {
      actionKey: 'CREATE_ADMIN_OPERATIONS_ALERT',
      targetScope: 'location',
      requiresHumanConfirmation: true,
      label: 'Review Admin alert →'
    },
    actionTargetRoute: 'duty',
    actionTargetLabel: 'Event Duty →',
    isEnabled: true,
    defaultCooldownMinutes: 60
  },
  {
    id: 'rule_volunteer_no_show',
    ruleKey: 'VOLUNTEER_NO_SHOW',
    name: 'Volunteer no-show detection',
    description: 'Detects assigned volunteers who have not reported for duty after their scheduled time.',
    triggerSignal: 'VOLUNTEER_NO_SHOW',
    defaultSeverity: 'attention',
    proposedAction: {
      actionKey: 'SEND_DUTY_REMINDERS',
      targetScope: 'volunteer',
      requiresHumanConfirmation: true,
      label: 'Review reminder →'
    },
    actionTargetRoute: 'duty',
    actionTargetLabel: 'Event Duty →',
    isEnabled: true,
    defaultCooldownMinutes: 60
  },
  {
    id: 'rule_pass_not_ready',
    ruleKey: 'PASS_READINESS',
    name: 'Pass readiness',
    description: 'Alerts when selected children are missing active digital event passes.',
    triggerSignal: 'PASS_NOT_READY',
    defaultSeverity: 'attention',
    actionTargetRoute: 'children',
    actionTargetLabel: 'Children Registry →',
    isEnabled: true,
    defaultCooldownMinutes: 60
  },
  {
    id: 'rule_report_expired',
    ruleKey: 'REPORT_EXPIRY',
    name: 'Report expiry',
    description: 'Alerts when a generated event report download link has expired.',
    triggerSignal: 'REPORT_EXPIRED',
    defaultSeverity: 'information',
    proposedAction: {
      actionKey: 'REGENERATE_REPORT',
      targetScope: 'report',
      requiresHumanConfirmation: true,
      label: 'Regenerate report →'
    },
    actionTargetRoute: 'reports',
    actionTargetLabel: 'Reports →',
    isEnabled: true,
    defaultCooldownMinutes: 120
  },
  {
    id: 'rule_event_starting_soon',
    ruleKey: 'EVENT_STARTING',
    name: 'Event start countdown',
    description: 'Alerts when the canonical current event starts within 24 hours.',
    triggerSignal: 'EVENT_STARTING_SOON',
    defaultSeverity: 'information',
    actionTargetRoute: 'events',
    actionTargetLabel: 'View event →',
    isEnabled: true,
    defaultCooldownMinutes: 180
  },
  {
    id: 'rule_safety_item_open',
    ruleKey: 'SAFETY_ITEM_OPEN',
    name: 'Open safety notices',
    description: 'Surfaces unresolved care alerts, incident records, or escalation cycles.',
    triggerSignal: 'SAFETY_ITEM_OPEN',
    defaultSeverity: 'urgent',
    actionTargetRoute: 'incidents',
    actionTargetLabel: 'Review safety →',
    isEnabled: true,
    isMandatory: true, // Mandatory safety control
    defaultCooldownMinutes: 30
  },
  {
    id: 'rule_configuration_gap',
    ruleKey: 'CONFIGURATION_GAP',
    name: 'Event configuration completeness',
    description: 'Alerts when critical event configurations (locations, age groups, capacity) are missing.',
    triggerSignal: 'CONFIGURATION_GAP',
    defaultSeverity: 'attention',
    actionTargetRoute: 'events',
    actionTargetLabel: 'Edit event →',
    isEnabled: true,
    defaultCooldownMinutes: 120
  },
  {
    id: 'rule_child_attendance_state_mismatch',
    ruleKey: 'CHILD_ATTENDANCE_STATE_MISMATCH',
    name: 'Child attendance status review',
    description: 'Surfaces children with conflicting attendance, check-in, or pickup states for Admin review.',
    triggerSignal: 'CHILD_ATTENDANCE_STATE_MISMATCH',
    defaultSeverity: 'attention',
    actionTargetRoute: 'children',
    actionTargetLabel: 'Review child →',
    isEnabled: true,
    defaultCooldownMinutes: 60
  },
  {
    id: 'rule_duty_presence_mismatch',
    ruleKey: 'DUTY_PRESENCE_MISMATCH',
    name: 'Duty presence status review',
    description: 'Surfaces assigned volunteers with conflicting active duty presence for Admin review.',
    triggerSignal: 'DUTY_PRESENCE_MISMATCH',
    defaultSeverity: 'attention',
    actionTargetRoute: 'duty',
    actionTargetLabel: 'View duty →',
    isEnabled: true,
    defaultCooldownMinutes: 60
  }
];

export function getRuleBySignal(signalType: EventSignalType): AutomationRuleDefinition | undefined {
  return PHASE3B_AUTOMATION_RULES.find(r => r.triggerSignal === signalType);
}

export function getRuleById(ruleId: string): AutomationRuleDefinition | undefined {
  return PHASE3B_AUTOMATION_RULES.find(r => r.id === ruleId || r.ruleKey === ruleId);
}
