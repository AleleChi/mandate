import { ToolActor, ToolContext } from '../types';

export type ActionKey =
  | 'SEND_DUTY_REMINDERS'
  | 'REGENERATE_REPORT'
  | 'CREATE_ADMIN_OPERATIONS_ALERT';

export interface ActionRecipient {
  id: string;
  name: string;
  locationName?: string;
  responsibility?: string;
  channel: 'whatsapp' | 'none';
  eligible: boolean;
  ineligibilityReason?: string;
  phone?: string;
}

export interface ActionPreviewItem {
  label: string;
  value: string | number;
  secondary?: string;
  meta?: string;
}

export interface ActionPreview {
  actionKey: ActionKey;
  title: string;
  description: string;
  affectedCount: number;
  recipients?: ActionRecipient[];
  items?: ActionPreviewItem[];
  warnings?: string[];
  confirmLabel: string;
  cancelLabel: string;
  confirmationToken: string;
  expiresAt: string;
}

export interface StoredConfirmationToken {
  id: string;
  adminUserId: string;
  adminRole: string;
  actionKey: ActionKey;
  eventId: string;
  resolvedTargets: any;
  parameters: any;
  createdAt: string;
  expiresAt: string;
  executedAt: string | null;
  status: 'pending' | 'executed' | 'cancelled' | 'expired';
}

export interface ActionExecutionResult {
  success: boolean;
  actionKey: ActionKey;
  title: string;
  message: string;
  affectedCount: number;
  deepLink?: { label: string; route?: string; tab?: string };
  updatedAt: string;
  error?: string;
}

export interface OperationsActionDefinition {
  actionKey: ActionKey;
  humanLabel: string;
  requiredRoles: string[];
  preparePreview: (
    context: ToolContext,
    params?: any
  ) => Promise<{
    answer: string;
    preview: ActionPreview;
  }>;
  revalidate: (
    token: StoredConfirmationToken,
    context: ToolContext
  ) => Promise<{
    valid: boolean;
    reason?: string;
    currentTargets?: any;
  }>;
  execute: (
    token: StoredConfirmationToken,
    context: ToolContext
  ) => Promise<ActionExecutionResult>;
}
