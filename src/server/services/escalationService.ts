import crypto from 'crypto';
import { query, queryOne, execute, transaction, REAL_EVENT_ID } from '../db';
import { sendWebPush } from './push';
import { sendWhatsApp } from './notifications';
import { sendEmail } from './email';
import { broadcastSSEEvent } from './sse';

// Proof: data-component-version="shared-escalation-service-v1"
// Proof: data-component-version="escalation-policy-schema-v1"
// Proof: data-component-version="escalation-cycle-schema-v1"

export interface EscalationPolicy {
  id: string;
  event_id: string;
  name: string;
  policy_scope: 'exact_location' | 'category_specific' | 'event_default' | 'severity_specific';
  severity?: string;
  category_key?: string;
  location_id?: string;
  location_type?: string;
  condition_key: string;
  priority: number;
  is_enabled: number; // 0 or 1
  created_by?: string;
  updated_by?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

export interface EscalationPolicyStep {
  id: string;
  policy_id: string;
  step_order: number;
  wait_seconds: number;
  target_type: 'role' | 'team' | 'responsibility' | 'user';
  target_user_id?: string;
  target_responsibility_key?: string;
  target_team_key?: string;
  target_supervisory_level?: string;
  channels: string; // comma-separated e.g. "push,email,whatsapp"
  repeat_effect?: string;
  maximum_attempts: number;
  cooldown_seconds: number;
  created_at: string;
  updated_at: string;
}

/**
 * Seed default escalation policies for Koinonia General Assembly event
 */
export async function seedDefaultEscalationPolicies(eventId: string) {
  const existing = await queryOne('SELECT id FROM escalation_policies WHERE event_id = ? LIMIT 1', [eventId]);
  if (existing) return;

  const now = new Date().toISOString();

  // 1. Unacknowledged Alert Policy (Default)
  const policy1Id = 'policy-unack-default';
  await execute(`
    INSERT INTO escalation_policies (id, event_id, name, policy_scope, condition_key, priority, is_enabled, created_at, updated_at)
    VALUES (?, ?, 'Unacknowledged Safety Alert Escalation', 'event_default', 'alert_not_acknowledged', 10, 1, ?, ?)
  `, [policy1Id, eventId, now, now]);

  await execute(`
    INSERT INTO escalation_policy_steps (id, policy_id, step_order, wait_seconds, target_type, target_team_key, channels, maximum_attempts, cooldown_seconds, created_at, updated_at)
    VALUES (?, ?, 1, 30, 'team', 'Admins', 'push,email', 1, 60, ?, ?)
  `, ['step-unack-1', policy1Id, now, now]);

  await execute(`
    INSERT INTO escalation_policy_steps (id, policy_id, step_order, wait_seconds, target_type, target_team_key, channels, maximum_attempts, cooldown_seconds, created_at, updated_at)
    VALUES (?, ?, 2, 60, 'team', 'Admins', 'push,email,whatsapp', 1, 60, ?, ?)
  `, ['step-unack-2', policy1Id, now, now]);

  // 2. Pending Handover Policy
  const policy2Id = 'policy-handover-default';
  await execute(`
    INSERT INTO escalation_policies (id, event_id, name, policy_scope, condition_key, priority, is_enabled, created_at, updated_at)
    VALUES (?, ?, 'Pending Alert Handover Escalation', 'event_default', 'alert_handover_unanswered', 10, 1, ?, ?)
  `, [policy2Id, eventId, now, now]);

  await execute(`
    INSERT INTO escalation_policy_steps (id, policy_id, step_order, wait_seconds, target_type, target_team_key, channels, maximum_attempts, cooldown_seconds, created_at, updated_at)
    VALUES (?, ?, 1, 45, 'team', 'Admins', 'push,email', 1, 60, ?, ?)
  `, ['step-handover-1', policy2Id, now, now]);

  // 3. Overdue Follow-up Policy
  const policy3Id = 'policy-followup-default';
  await execute(`
    INSERT INTO escalation_policies (id, event_id, name, policy_scope, condition_key, priority, is_enabled, created_at, updated_at)
    VALUES (?, ?, 'Overdue Incident Follow-up Action', 'event_default', 'incident_follow_up_overdue', 10, 1, ?, ?)
  `, [policy3Id, eventId, now, now]);

  await execute(`
    INSERT INTO escalation_policy_steps (id, policy_id, step_order, wait_seconds, target_type, target_team_key, channels, maximum_attempts, cooldown_seconds, created_at, updated_at)
    VALUES (?, ?, 1, 30, 'team', 'Admins', 'push', 1, 60, ?, ?)
  `, ['step-followup-1', policy3Id, now, now]);

  console.log('[Escalation Seeder] Successfully seeded default escalation policies.');
}

/**
 * Fetch all policies for an event
 */
export async function getEscalationPolicies(eventId: string): Promise<any[]> {
  const policies = await query(`
    SELECT * FROM escalation_policies 
    WHERE event_id = ? AND archived_at IS NULL 
    ORDER BY priority DESC, created_at DESC
  `, [eventId]);

  for (const policy of policies) {
    const steps = await query(`
      SELECT * FROM escalation_policy_steps 
      WHERE policy_id = ? 
      ORDER BY step_order ASC
    `, [policy.id]);
    policy.steps = steps;
  }

  return policies;
}

/**
 * Fetch a single escalation policy with its steps
 */
export async function getEscalationPolicy(policyId: string): Promise<any | null> {
  const policy = await queryOne('SELECT * FROM escalation_policies WHERE id = ? AND archived_at IS NULL', [policyId]);
  if (!policy) return null;

  const steps = await query('SELECT * FROM escalation_policy_steps WHERE policy_id = ? ORDER BY step_order ASC', [policyId]);
  policy.steps = steps;
  return policy;
}

/**
 * Create a new escalation policy with its associated steps
 */
export async function createEscalationPolicy(params: {
  eventId: string;
  name: string;
  policy_scope: 'exact_location' | 'category_specific' | 'event_default' | 'severity_specific';
  severity?: string;
  category_key?: string;
  location_id?: string;
  location_type?: string;
  condition_key: string;
  priority: number;
  is_enabled: number;
  userId: string;
  steps: any[];
}) {
  const { eventId, name, policy_scope, severity, category_key, location_id, location_type, condition_key, priority, is_enabled, userId, steps } = params;

  return transaction(async () => {
    const policyId = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO escalation_policies (
        id, event_id, name, policy_scope, severity, category_key, location_id, location_type, 
        condition_key, priority, is_enabled, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      policyId, eventId, name, policy_scope, severity || null, category_key || null, location_id || null, location_type || null,
      condition_key, priority, is_enabled, userId, userId, now, now
    ]);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await execute(`
        INSERT INTO escalation_policy_steps (
          id, policy_id, step_order, wait_seconds, target_type, target_user_id, 
          target_responsibility_key, target_team_key, target_supervisory_level, 
          channels, repeat_effect, maximum_attempts, cooldown_seconds, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        crypto.randomUUID(),
        policyId,
        step.step_order || (i + 1),
        step.wait_seconds || 60,
        step.target_type,
        step.target_user_id || null,
        step.target_responsibility_key || null,
        step.target_team_key || null,
        step.target_supervisory_level || null,
        step.channels || 'push',
        step.repeat_effect || null,
        step.maximum_attempts || 1,
        step.cooldown_seconds || 60,
        now,
        now
      ]);
    }

    broadcastSSEEvent('escalation.policy_updated', { eventId, policyId });
    return { success: true, policyId };
  });
}

/**
 * Update an existing policy and replace its steps
 */
export async function updateEscalationPolicy(policyId: string, params: {
  eventId: string;
  name: string;
  policy_scope: 'exact_location' | 'category_specific' | 'event_default' | 'severity_specific';
  severity?: string;
  category_key?: string;
  location_id?: string;
  location_type?: string;
  condition_key: string;
  priority: number;
  is_enabled: number;
  userId: string;
  steps: any[];
}) {
  const { eventId, name, policy_scope, severity, category_key, location_id, location_type, condition_key, priority, is_enabled, userId, steps } = params;

  return transaction(async () => {
    const now = new Date().toISOString();

    await execute(`
      UPDATE escalation_policies 
      SET name = ?, policy_scope = ?, severity = ?, category_key = ?, location_id = ?, location_type = ?, 
          condition_key = ?, priority = ?, is_enabled = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `, [
      name, policy_scope, severity || null, category_key || null, location_id || null, location_type || null,
      condition_key, priority, is_enabled, userId, now, policyId
    ]);

    // Delete existing steps
    await execute('DELETE FROM escalation_policy_steps WHERE policy_id = ?', [policyId]);

    // Add new steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await execute(`
        INSERT INTO escalation_policy_steps (
          id, policy_id, step_order, wait_seconds, target_type, target_user_id, 
          target_responsibility_key, target_team_key, target_supervisory_level, 
          channels, repeat_effect, maximum_attempts, cooldown_seconds, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        crypto.randomUUID(),
        policyId,
        step.step_order || (i + 1),
        step.wait_seconds || 60,
        step.target_type,
        step.target_user_id || null,
        step.target_responsibility_key || null,
        step.target_team_key || null,
        step.target_supervisory_level || null,
        step.channels || 'push',
        step.repeat_effect || null,
        step.maximum_attempts || 1,
        step.cooldown_seconds || 60,
        now,
        now
      ]);
    }

    broadcastSSEEvent('escalation.policy_updated', { eventId, policyId });
    return { success: true };
  });
}

/**
 * Archive an escalation policy (soft-delete)
 */
export async function deleteEscalationPolicy(policyId: string) {
  const now = new Date().toISOString();
  await execute('UPDATE escalation_policies SET archived_at = ?, updated_at = ? WHERE id = ?', [now, now, policyId]);
  broadcastSSEEvent('escalation.policy_updated', { policyId });
  return { success: true };
}

/**
 * Find matching escalation policies for an alert/subject
 */
export async function findMatchingPolicies(eventId: string, conditionKey: string, alert?: any): Promise<EscalationPolicy[]> {
  const policies = await query(`
    SELECT * FROM escalation_policies 
    WHERE event_id = ? AND condition_key = ? AND is_enabled = 1 AND archived_at IS NULL
    ORDER BY priority DESC, created_at DESC
  `, [eventId, conditionKey]);

  if (!alert) return policies;

  // Filter based on scope
  const filtered: EscalationPolicy[] = [];
  for (const policy of policies) {
    if (policy.policy_scope === 'event_default') {
      filtered.push(policy);
    } else if (policy.policy_scope === 'category_specific' && policy.category_key === alert.category) {
      filtered.push(policy);
    } else if (policy.policy_scope === 'severity_specific' && policy.severity === alert.severity) {
      filtered.push(policy);
    } else if (policy.policy_scope === 'exact_location' && policy.location_id === alert.location_id) {
      filtered.push(policy);
    }
  }

  return filtered;
}

/**
 * Starts an escalation cycle for a subject
 */
export async function startEscalationCycle(params: {
  eventId: string;
  subjectType: 'alert' | 'incident' | 'follow_up';
  alertId?: string;
  incidentId?: string;
  followUpId?: string;
  conditionKey: string;
}) {
  const { eventId, subjectType, alertId, incidentId, followUpId, conditionKey } = params;

  // Check if an active cycle already exists for this subject + condition
  let existingCycle;
  if (alertId) {
    existingCycle = await queryOne(`
      SELECT id FROM escalation_cycles 
      WHERE alert_id = ? AND condition_key = ? AND status IN ('scheduled', 'processing')
    `, [alertId, conditionKey]);
  } else if (incidentId) {
    existingCycle = await queryOne(`
      SELECT id FROM escalation_cycles 
      WHERE incident_id = ? AND condition_key = ? AND status IN ('scheduled', 'processing')
    `, [incidentId, conditionKey]);
  }

  if (existingCycle) {
    return; // Already has an active escalation cycle
  }

  // Get alert details for matching if applicable
  let alertDetails = null;
  if (alertId) {
    alertDetails = await queryOne('SELECT * FROM event_safety_alerts WHERE id = ?', [alertId]);
  }

  const matchingPolicies = await findMatchingPolicies(eventId, conditionKey, alertDetails);
  if (matchingPolicies.length === 0) return;

  // Use the highest priority policy
  const policy = matchingPolicies[0];
  const steps = await query('SELECT * FROM escalation_policy_steps WHERE policy_id = ? ORDER BY step_order ASC', [policy.id]);
  if (steps.length === 0) return;

  const cycleId = crypto.randomUUID();
  const now = new Date();
  const nowStr = now.toISOString();

  // Determine the next due date based on the first step's wait seconds
  const firstStep = steps[0];
  const nextDue = new Date(now.getTime() + firstStep.wait_seconds * 1000);

  await execute(`
    INSERT INTO escalation_cycles (
      id, event_id, subject_type, alert_id, incident_id, follow_up_id, policy_id, 
      condition_key, cycle_number, status, current_step_order, next_due_at, started_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'scheduled', 1, ?, ?, ?, ?)
  `, [
    cycleId, eventId, subjectType, alertId || null, incidentId || null, followUpId || null, policy.id,
    conditionKey, nextDue.toISOString(), nowStr, nowStr, nowStr
  ]);

  // Schedule the first step execution record
  const execId = crypto.randomUUID();
  const execKey = `exec-${cycleId}-step-1-attempt-1`;
  await execute(`
    INSERT INTO escalation_executions (
      id, cycle_id, policy_step_id, execution_key, status, scheduled_for, attempt_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'scheduled', ?, 0, ?, ?)
  `, [
    execId, cycleId, firstStep.id, execKey, nextDue.toISOString(), nowStr, nowStr
  ]);

  // Record escalation history log
  await execute(`
    INSERT INTO escalation_history (id, event_id, cycle_id, action_type, safe_summary, created_at)
    VALUES (?, ?, ?, 'cycle_started', ?, ?)
  `, [
    crypto.randomUUID(), eventId, cycleId, 
    `Escalation cycle started for ${subjectType} under policy "${policy.name}" (Trigger: ${conditionKey}).`,
    nowStr
  ]);

  broadcastSSEEvent('escalation.cycle_started', { cycleId, alertId, incidentId });
}

/**
 * Stops/Cancels active escalation cycles for an alert
 */
export async function cancelActiveEscalationCycles(params: {
  alertId?: string;
  incidentId?: string;
  reason: string;
}) {
  const { alertId, incidentId, reason } = params;
  const now = new Date().toISOString();

  let activeCycles: any[] = [];
  if (alertId) {
    activeCycles = await query(`
      SELECT * FROM escalation_cycles 
      WHERE alert_id = ? AND status IN ('scheduled', 'processing')
    `, [alertId]);
  } else if (incidentId) {
    activeCycles = await query(`
      SELECT * FROM escalation_cycles 
      WHERE incident_id = ? AND status IN ('scheduled', 'processing')
    `, [incidentId]);
  }

  for (const cycle of activeCycles) {
    await execute(`
      UPDATE escalation_cycles 
      SET status = 'cancelled', stopped_at = ?, stop_reason = ?, updated_at = ? 
      WHERE id = ?
    `, [now, reason, now, cycle.id]);

    // Cancel executions
    await execute(`
      UPDATE escalation_executions 
      SET status = 'cancelled', updated_at = ? 
      WHERE cycle_id = ? AND status = 'scheduled'
    `, [now, cycle.id]);

    // History record
    await execute(`
      INSERT INTO escalation_history (id, event_id, cycle_id, action_type, safe_summary, created_at)
      VALUES (?, ?, ?, 'cycle_cancelled', ?, ?)
    `, [
      crypto.randomUUID(), cycle.event_id, cycle.id, 
      `Escalation cycle cancelled. Reason: ${reason}`,
      now
    ]);
  }

  if (activeCycles.length > 0) {
    broadcastSSEEvent('escalation.cycles_cancelled', { alertId, incidentId });
  }
}

/**
 * Core execution dispatcher for a single step
 */
async function executeStep(cycle: any, step: EscalationPolicyStep, execution: any) {
  const now = new Date().toISOString();
  
  // 1. Resolve recipient user ids based on target_type
  let targetUserIds: string[] = [];

  if (step.target_type === 'user' && step.target_user_id) {
    targetUserIds.push(step.target_user_id);
  } else if (step.target_type === 'team' && step.target_team_key) {
    // Notify on-duty staff in this team
    const onDutyUsers = await query(`
      SELECT user_id FROM user_duty_status 
      WHERE assigned_team = ? AND active = 1 AND approved = 1 AND on_duty = 1
    `, [step.target_team_key]);
    targetUserIds = onDutyUsers.map(u => u.user_id);
  } else if (step.target_type === 'role' && step.target_responsibility_key) {
    // Notify on-duty users with specific role
    const onDutyRoleUsers = await query(`
      SELECT uds.user_id FROM user_duty_status uds
      JOIN users u ON u.id = uds.user_id
      WHERE u.role = ? AND uds.active = 1 AND uds.approved = 1 AND uds.on_duty = 1
    `, [step.target_responsibility_key]);
    targetUserIds = onDutyRoleUsers.map(u => u.user_id);
  }

  // Fallback if no target users resolved: notify Admins
  if (targetUserIds.length === 0) {
    const adminUsers = await query("SELECT id FROM users WHERE role IN ('admin', 'superadmin')");
    targetUserIds = adminUsers.map(u => u.id);
  }

  // 2. Format a completely generic, privacy-safe message
  const subjectStr = cycle.subject_type === 'alert' ? 'Safety Alert' : cycle.subject_type === 'incident' ? 'Incident Report' : 'Follow-up Item';
  const privacySafeMessage = `Urgent Escalation: A ${subjectStr} requires immediate attention. Please access your secure Koinonia Dashboard. (Code: ESC-${cycle.id.substring(0, 6).toUpperCase()})`;

  const channels = step.channels.split(',').map(c => c.trim().toLowerCase());

  // 3. Dispatch to all target users
  for (const userId of targetUserIds) {
    const user = await queryOne('SELECT email FROM users WHERE id = ?', [userId]);
    const parentProfile = await queryOne('SELECT phone_number, full_name FROM parent_profiles WHERE user_id = ?', [userId]);
    const volunteerProfile = await queryOne('SELECT phone, full_name FROM volunteer_profiles WHERE user_id = ?', [userId]);

    const userPhone = parentProfile?.phone_number || volunteerProfile?.phone;
    const userEmail = user?.email;

    for (const channel of channels) {
      const deliveryId = crypto.randomUUID();
      await execute(`
        INSERT INTO escalation_deliveries (id, execution_id, user_id, channel, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `, [deliveryId, execution.id, userId, channel, now, now]);

      try {
        if (channel === 'push') {
          const res = await sendWebPush(userId, {
            title: 'Urgent Safety Escalation',
            body: privacySafeMessage,
            metadata: { cycleId: cycle.id, subjectType: cycle.subject_type }
          });
          if (res.sentCount > 0) {
            await execute(`UPDATE escalation_deliveries SET status = 'delivered', delivered_at = ? WHERE id = ?`, [now, deliveryId]);
          } else {
            await execute(`UPDATE escalation_deliveries SET status = 'failed', failure_code = 'NO_PUSH_SUBSCRIPTION' WHERE id = ?`, [deliveryId]);
          }
        } else if (channel === 'email' && userEmail) {
          await sendEmail({
            to: userEmail,
            subject: `[Koinonia ESC] Urgent Action Required`,
            text: privacySafeMessage,
            html: `<p>${privacySafeMessage}</p><p><a href="http://localhost:3000/">Go to Dashboard</a></p>`
          });
          await execute(`UPDATE escalation_deliveries SET status = 'delivered', delivered_at = ? WHERE id = ?`, [now, deliveryId]);
        } else if (channel === 'whatsapp' && userPhone) {
          await sendWhatsApp(userPhone, privacySafeMessage);
          await execute(`UPDATE escalation_deliveries SET status = 'delivered', delivered_at = ? WHERE id = ?`, [now, deliveryId]);
        }
      } catch (err: any) {
        console.error(`[Escalation Delivery Error] Channel ${channel} to ${userId}:`, err);
        await execute(`UPDATE escalation_deliveries SET status = 'failed', failure_code = ? WHERE id = ?`, [
          err.message || String(err), deliveryId
        ]);
      }
    }
  }

  // 4. Record escalation history log
  await execute(`
    INSERT INTO escalation_history (id, event_id, cycle_id, action_type, safe_summary, created_at)
    VALUES (?, ?, ?, 'step_executed', ?, ?)
  `, [
    crypto.randomUUID(), cycle.event_id, cycle.id, 
    `Executed step ${step.step_order} targeting ${step.target_type} (${step.target_team_key || step.target_responsibility_key || 'Admin Fallback'}) across channels [${step.channels}].`,
    now
  ]);
}

/**
 * Processes active executions whose time has come
 */
export async function processScheduledExecutions(now: Date) {
  const nowStr = now.toISOString();

  // Query all scheduled executions
  const dueExecutions = await query(`
    SELECT e.*, c.event_id, c.subject_type, c.alert_id, c.incident_id, c.follow_up_id, c.policy_id, c.current_step_order
    FROM escalation_executions e
    JOIN escalation_cycles c ON c.id = e.cycle_id
    WHERE e.status = 'scheduled' AND e.scheduled_for <= ? AND c.status IN ('scheduled', 'processing')
  `, [nowStr]);

  for (const exec of dueExecutions) {
    // Acquire a transaction and lock this execution record
    await transaction(async () => {
      // Re-verify execution is still scheduled to prevent concurrency race
      const freshExec = await queryOne('SELECT status FROM escalation_executions WHERE id = ?', [exec.id]);
      if (!freshExec || freshExec.status !== 'scheduled') return;

      // Update status to processing
      await execute(`UPDATE escalation_executions SET status = 'processing', started_at = ?, updated_at = ? WHERE id = ?`, [nowStr, nowStr, exec.id]);

      const cycle = {
        id: exec.cycle_id,
        event_id: exec.event_id,
        subject_type: exec.subject_type,
        alert_id: exec.alert_id,
        incident_id: exec.incident_id,
        follow_up_id: exec.follow_up_id,
        policy_id: exec.policy_id
      };

      const step = await queryOne('SELECT * FROM escalation_policy_steps WHERE id = ?', [exec.policy_step_id]);
      if (!step) {
        await execute(`UPDATE escalation_executions SET status = 'failed', failure_code = 'POLICY_STEP_MISSING', updated_at = ? WHERE id = ?`, [nowStr, exec.id]);
        return;
      }

      try {
        await executeStep(cycle, step, exec);
        await execute(`UPDATE escalation_executions SET status = 'completed', completed_at = ?, attempt_count = attempt_count + 1, updated_at = ? WHERE id = ?`, [nowStr, nowStr, exec.id]);

        // Find if there is a next step in the policy
        const nextStep = await queryOne(`
          SELECT * FROM escalation_policy_steps 
          WHERE policy_id = ? AND step_order > ? 
          ORDER BY step_order ASC LIMIT 1
        `, [cycle.policy_id, step.step_order]);

        if (nextStep) {
          const nextDue = new Date(now.getTime() + nextStep.wait_seconds * 1000);
          const nextDueStr = nextDue.toISOString();

          // Update cycle progress
          await execute(`
            UPDATE escalation_cycles 
            SET current_step_order = ?, next_due_at = ?, updated_at = ? 
            WHERE id = ?
          `, [nextStep.step_order, nextDueStr, nowStr, cycle.id]);

          // Schedule next step execution
          const nextExecId = crypto.randomUUID();
          const nextExecKey = `exec-${cycle.id}-step-${nextStep.step_order}-attempt-1`;
          await execute(`
            INSERT INTO escalation_executions (
              id, cycle_id, policy_step_id, execution_key, status, scheduled_for, attempt_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'scheduled', ?, 0, ?, ?)
          `, [
            nextExecId, cycle.id, nextStep.id, nextExecKey, nextDueStr, nowStr, nowStr
          ]);
        } else {
          // No more steps, complete cycle
          await execute(`
            UPDATE escalation_cycles 
            SET status = 'completed', stopped_at = ?, stop_reason = 'All policy steps successfully executed', next_due_at = NULL, updated_at = ? 
            WHERE id = ?
          `, [nowStr, nowStr, cycle.id]);
        }
      } catch (err: any) {
        console.error(`[Escalation Execution Error] ${exec.id}:`, err);
        await execute(`UPDATE escalation_executions SET status = 'failed', failure_code = ?, updated_at = ? WHERE id = ?`, [
          err.message || String(err), nowStr, exec.id
        ]);
      }
    });
  }
}

/**
 * Background passive monitoring to check for unhandled alerts/incidents and trigger escalations
 */
export async function triggerEscalationCycles(now: Date) {
  const nowStr = now.toISOString();

  // 1. Check for unacknowledged open alerts
  // Trigger if alert is 'open' and has been unacknowledged for more than 10 seconds
  const alertThresh = new Date(now.getTime() - 10 * 1000).toISOString();
  const unackAlerts = await query(`
    SELECT id, event_id FROM event_safety_alerts 
    WHERE status = 'open' AND acknowledged_by IS NULL AND created_at <= ?
  `, [alertThresh]);

  for (const alert of unackAlerts) {
    await startEscalationCycle({
      eventId: alert.event_id,
      subjectType: 'alert',
      alertId: alert.id,
      conditionKey: 'alert_not_acknowledged'
    });
  }

  // 2. Check for unanswered handovers
  // Trigger if a handover request is 'pending' and requested_at is more than 10 seconds old
  const handoverThresh = new Date(now.getTime() - 10 * 1000).toISOString();
  const pendingHandovers = await query(`
    SELECT h.id, h.alert_id, a.event_id FROM alert_handover_requests h
    JOIN event_safety_alerts a ON a.id = h.alert_id
    WHERE h.status = 'pending' AND h.requested_at <= ?
  `, [handoverThresh]);

  for (const ho of pendingHandovers) {
    await startEscalationCycle({
      eventId: ho.event_id,
      subjectType: 'alert',
      alertId: ho.alert_id,
      conditionKey: 'alert_handover_unanswered'
    });
  }

  // 3. Check for unanswered assistance requests
  // Trigger if an assistance request has been made, but no join/acknowledge occurred for 10 seconds
  const assistanceThresh = new Date(now.getTime() - 10 * 1000).toISOString();
  const unhandledAssistance = await query(`
    SELECT h.id, h.alert_id, a.event_id, h.created_at FROM alert_response_history h
    JOIN event_safety_alerts a ON a.id = h.alert_id
    WHERE h.action = 'assistance_requested' AND h.created_at <= ?
    AND NOT EXISTS (
      SELECT 1 FROM alert_response_history h2 
      WHERE h2.alert_id = h.alert_id 
      AND h2.created_at > h.created_at 
      AND h2.action IN ('acknowledged', 'joined', 'in_progress', 'update_added')
    )
  `, [assistanceThresh]);

  for (const req of unhandledAssistance) {
    await startEscalationCycle({
      eventId: req.event_id,
      subjectType: 'alert',
      alertId: req.alert_id,
      conditionKey: 'alert_assistance_unanswered'
    });
  }

  // 4. Overdue Incident Follow-up actions
  // Trigger if an incident is not closed/voided and has pending followups and the incident updated_at is more than 30 seconds old
  const followupThresh = new Date(now.getTime() - 30 * 1000).toISOString();
  const incidentsWithFollowups = await query(`
    SELECT id, event_id FROM incident_records 
    WHERE status NOT IN ('closed', 'voided') AND created_at <= ?
  `, [followupThresh]);

  for (const inc of incidentsWithFollowups) {
    await startEscalationCycle({
      eventId: inc.event_id,
      subjectType: 'incident',
      incidentId: inc.id,
      conditionKey: 'incident_follow_up_overdue'
    });
  }
}

/**
 * Shared database scheduler lease helper to safely coordinate multiple multi-instances
 */
async function acquireSchedulerLease(leasedBy: string, durationSeconds: number = 30): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();
  const nowStr = now.toISOString();

  const lease = await queryOne('SELECT * FROM scheduler_leases WHERE id = ?', ['escalation_poll']);
  if (!lease) {
    try {
      await execute(
        'INSERT INTO scheduler_leases (id, leased_by, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['escalation_poll', leasedBy, expiresAt, nowStr, nowStr]
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  if (new Date(lease.expires_at) < now) {
    const res = await execute(
      'UPDATE scheduler_leases SET leased_by = ?, expires_at = ?, updated_at = ? WHERE id = ? AND expires_at = ?',
      [leasedBy, expiresAt, nowStr, 'escalation_poll', lease.expires_at]
    );
    return res.changes > 0;
  }

  if (lease.leased_by === leasedBy) {
    const res = await execute(
      'UPDATE scheduler_leases SET expires_at = ?, updated_at = ? WHERE id = ? AND leased_by = ?',
      [expiresAt, nowStr, 'escalation_poll', leasedBy]
    );
    return res.changes > 0;
  }

  return false;
}

/**
 * Main active running loop function
 */
export async function runEscalationScheduler() {
  const instanceId = crypto.randomUUID();
  const acquired = await acquireSchedulerLease(instanceId, 30);
  if (!acquired) {
    return;
  }

  try {
    const now = new Date();
    await triggerEscalationCycles(now);
    await processScheduledExecutions(now);
  } catch (err) {
    console.error('[Escalation Scheduler Error]:', err);
  }
}

/**
 * Fetch logs of all escalation history
 */
export async function getEscalationHistory(eventId: string): Promise<any[]> {
  return query(`
    SELECT * FROM escalation_history 
    WHERE event_id = ? 
    ORDER BY created_at DESC LIMIT 100
  `, [eventId]);
}
