import { ToolActor, ToolContext } from '../types';
import { createOperationsAlertAction } from './createOperationsAlertAction';
import { sendDutyRemindersAction } from './dutyRemindersAction';
import { regenerateReportAction } from './regenerateReportAction';
import { actionTokenManager } from './tokenManager';
import {
  ActionExecutionResult,
  ActionKey,
  ActionPreview,
  OperationsActionDefinition
} from './types';

export * from './types';
export * from './tokenManager';

export class OperationsActionRegistry {
  private actions: Map<ActionKey, OperationsActionDefinition> = new Map();

  constructor() {
    this.registerAction(sendDutyRemindersAction);
    this.registerAction(regenerateReportAction);
    this.registerAction(createOperationsAlertAction);
  }

  public registerAction(action: OperationsActionDefinition): void {
    this.actions.set(action.actionKey, action);
  }

  public getAction(actionKey: ActionKey): OperationsActionDefinition | undefined {
    return this.actions.get(actionKey);
  }

  /**
   * Generates an action preview with a secure confirmation token.
   * DOES NOT execute the action.
   */
  public async prepareActionPreview(
    actionKey: ActionKey,
    context: ToolContext,
    params?: any
  ): Promise<{ answer: string; preview?: ActionPreview }> {
    const action = this.actions.get(actionKey);
    if (!action) {
      throw new Error('Unsupported action key.');
    }

    // Role check at preview preparation time
    const userRole = context.actor.role || 'volunteer';
    if (!action.requiredRoles.includes(userRole)) {
      return {
        answer: "You don't have permission to perform that action.",
        preview: {
          actionKey,
          title: action.humanLabel,
          description: "You don't have permission to perform that action.",
          affectedCount: 0,
          confirmLabel: 'Confirm',
          cancelLabel: 'Cancel',
          confirmationToken: '',
          expiresAt: new Date().toISOString()
        }
      };
    }

    return await action.preparePreview(context, params);
  }

  /**
   * Confirms and executes an approved action with revalidation and idempotency checks.
   */
  public async confirmAction(
    confirmationToken: string,
    actor: ToolActor,
    eventId: string
  ): Promise<ActionExecutionResult> {
    if (!confirmationToken || typeof confirmationToken !== 'string') {
      return {
        success: false,
        actionKey: 'SEND_DUTY_REMINDERS',
        title: 'Action Failed',
        message: 'A valid confirmation token is required.',
        affectedCount: 0,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: 'A valid confirmation token is required.'
      };
    }

    // 1. Token validation (expiry, single-use, admin-binding, event-binding)
    const tokenCheck = actionTokenManager.validateTokenForExecution(confirmationToken, actor, eventId);
    if (!tokenCheck.valid || !tokenCheck.token) {
      return {
        success: false,
        actionKey: 'SEND_DUTY_REMINDERS',
        title: 'Action Failed',
        message: tokenCheck.error || "We couldn't complete that action. Please try again.",
        affectedCount: 0,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: tokenCheck.error
      };
    }

    const token = tokenCheck.token;
    const action = this.actions.get(token.actionKey);
    if (!action) {
      return {
        success: false,
        actionKey: token.actionKey,
        title: 'Action Failed',
        message: "We couldn't find that action definition.",
        affectedCount: 0,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: 'Action definition not found.'
      };
    }

    // 2. Strict authorization re-check AT EXECUTION TIME (Requirement #6)
    const currentRole = actor.role || 'volunteer';
    if (!action.requiredRoles.includes(currentRole)) {
      return {
        success: false,
        actionKey: token.actionKey,
        title: 'Permission Denied',
        message: "You don't have permission to complete this action.",
        affectedCount: 0,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: 'Forbidden'
      };
    }

    const context: ToolContext = { eventId, actor };

    // 3. Concurrency / Stale data revalidation (Requirement #15)
    const reval = await action.revalidate(token, context);
    if (!reval.valid) {
      return {
        success: false,
        actionKey: token.actionKey,
        title: 'Data Changed',
        message: reval.reason || 'The event data changed. Review the action again before continuing.',
        affectedCount: 0,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: reval.reason
      };
    }

    // 4. Mark token executed BEFORE execution to guarantee strict single-use idempotency
    actionTokenManager.markExecuted(token.id);

    // 5. Execute action and record audit log
    try {
      return await action.execute(token, context);
    } catch (err: any) {
      console.error(`[OperationsActionRegistry] Execution error for ${token.actionKey}:`, err);
      return {
        success: false,
        actionKey: token.actionKey,
        title: 'Action Failed',
        message: "We couldn't complete that action right now. Please try again.",
        affectedCount: 0,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: 'Execution failed.'
      };
    }
  }

  /**
   * Cancels a pending action confirmation.
   */
  public cancelAction(
    confirmationToken: string,
    actor: ToolActor
  ): { success: boolean; message: string; error?: string } {
    const res = actionTokenManager.markCancelled(confirmationToken, actor);
    if (!res.success) {
      return {
        success: false,
        message: res.error || "We couldn't cancel the action.",
        error: res.error
      };
    }
    return {
      success: true,
      message: 'Action cancelled.'
    };
  }
}

export const operationsActionRegistry = new OperationsActionRegistry();
