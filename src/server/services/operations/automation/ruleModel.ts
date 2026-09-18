import { ActionKey } from '../actions/types';
import { EventSignalType } from './signals';

/**
 * Automation Rule Representation (Phase 3B Design Only)
 * 
 * STRICT ARCHITECTURAL CONSTRAINT:
 * In Phase 3A, autonomous execution is completely disabled (NO_AUTONOMOUS_EXECUTION = true).
 * Automation rules require future explicit enablement after confirmed actions are proven stable.
 */

export const NO_AUTONOMOUS_EXECUTION = true;

export type RuleConditionOperator =
  | 'gte'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt';

export interface RuleCondition {
  field: string;
  operator: RuleConditionOperator;
  value: any;
}

export interface ProposedAutomationAction {
  actionKey: ActionKey;
  targetScope: 'location' | 'volunteer' | 'event' | 'system';
  requiresHumanConfirmation: boolean;
}

export interface AutomationRuleDefinition {
  id: string;
  name: string;
  description: string;
  triggerSignal: EventSignalType;
  conditions: RuleCondition[];
  proposedAction: ProposedAutomationAction;
  isEnabled: boolean;
  cooldownMinutes: number;
}

/**
 * Example design specification for Phase 3B:
 * 
 * When: LOCATION_UNDERSTAFFED
 * Condition: gap >= 2
 * Then: CREATE_ADMIN_OPERATIONS_ALERT
 */
export const EXAMPLE_PHASE3B_RULES: AutomationRuleDefinition[] = [
  {
    id: 'rule_understaffed_location_alert',
    name: 'Understaffed Location Alert',
    description: 'Creates an operational alert when a duty post is short of volunteers by 2 or more.',
    triggerSignal: 'LOCATION_UNDERSTAFFED',
    conditions: [
      { field: 'gap', operator: 'gte', value: 2 }
    ],
    proposedAction: {
      actionKey: 'CREATE_ADMIN_OPERATIONS_ALERT',
      targetScope: 'location',
      requiresHumanConfirmation: true
    },
    isEnabled: false, // strictly disabled in Phase 3A
    cooldownMinutes: 30
  },
  {
    id: 'rule_volunteer_no_show_reminder',
    name: 'Volunteer Duty Check-in Reminder',
    description: 'Proposes sending WhatsApp reminders when scheduled volunteers are late.',
    triggerSignal: 'VOLUNTEER_NO_SHOW',
    conditions: [
      { field: 'minutesLate', operator: 'gte', value: 15 }
    ],
    proposedAction: {
      actionKey: 'SEND_DUTY_REMINDERS',
      targetScope: 'volunteer',
      requiresHumanConfirmation: true
    },
    isEnabled: false, // strictly disabled in Phase 3A
    cooldownMinutes: 60
  }
];
