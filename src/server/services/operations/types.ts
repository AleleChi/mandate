export interface ToolActor {
  id: string;
  role: string;
  email?: string;
}

export interface ToolContext {
  eventId: string;
  actor: ToolActor;
}

export interface ToolFilter {
  status?: string;
  ageGroup?: string;
  locationId?: string;
  locationName?: string;
  volunteerId?: string;
  parentId?: string;
  childId?: string;
  childName?: string;
  timeframe?: string; // e.g., 'last_hour', 'today', 'last_24h'
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  search?: string;
}

export interface ToolResult<T = any> {
  success: boolean;
  authorized: boolean;
  toolName: string;
  data?: T;
  totalCount?: number;
  displayedCount?: number;
  error?: string;
}

export type ToolCategory =
  | 'event'
  | 'registrations'
  | 'children'
  | 'parents'
  | 'attendance'
  | 'volunteers'
  | 'duty'
  | 'passes'
  | 'safety'
  | 'reports'
  | 'communications'
  | 'system';

export interface OperationalTool {
  name: string;
  description: string;
  category: ToolCategory;
  requiredRoles?: string[];
  execute: (context: ToolContext, filters?: ToolFilter) => Promise<ToolResult>;
}

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
  totalCount?: number;
  displayedCount?: number;
}

export interface BreakdownItem {
  label: string;
  primary: string | number;
  secondary?: string | number;
  meta?: string;
}

export interface DeepLinkItem {
  label: string;
  route?: string;
  tab?: string;
}

import type { ActionPreview } from './actions/types';

export interface GroundedQueryResult {
  answer: string;
  grounded: boolean;
  intent: string;
  provenance?: {
    source: string;
    updatedAt: string;
  };
  table?: TableData;
  breakdown?: {
    title?: string;
    items: BreakdownItem[];
  };
  deepLinks?: DeepLinkItem[];
  data?: any;
  suggestedQuestions?: string[];
  clarification?: boolean;
  actionAttempt?: boolean;
  actionPreview?: ActionPreview;
}
