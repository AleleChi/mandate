import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getCommunicationSummaryTool: OperationalTool = {
  name: 'getCommunicationSummary',
  description: 'Returns counts of messages sent, queued notifications, and delivery failures',
  category: 'communications',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const [sentRes, queuedJobsRes, failedJobsRes, failedWaRes] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM admin_message_logs WHERE event_id = ?', [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM notification_jobs WHERE event_id = ? AND status IN ('pending', 'queued')", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM notification_jobs WHERE event_id = ? AND status = 'failed'", [context.eventId]),
      queryOne("SELECT COUNT(*) as count FROM whatsapp_delivery_logs WHERE event_id = ? AND status = 'failed'", [context.eventId])
    ]);

    const sentMessages = sentRes?.count || 0;
    const queuedMessages = queuedJobsRes?.count || 0;
    const failedMessages = (failedJobsRes?.count || 0) + (failedWaRes?.count || 0);

    return {
      success: true,
      authorized: true,
      toolName: 'getCommunicationSummary',
      data: {
        eventId: context.eventId,
        sentMessages,
        queuedMessages,
        failedMessages
      }
    };
  }
};

export const getQueuedMessagesSummaryTool: OperationalTool = {
  name: 'getQueuedMessagesSummary',
  description: 'Returns list of notification jobs currently scheduled or pending in the queue',
  category: 'communications',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);

    const rows = await query(`
      SELECT id, event_id, status, scheduled_for, created_at
      FROM notification_jobs
      WHERE event_id = ? AND status IN ('pending', 'queued')
      ORDER BY scheduled_for ASC
      LIMIT ?
    `, [context.eventId, limit]);

    return {
      success: true,
      authorized: true,
      toolName: 'getQueuedMessagesSummary',
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const getFailedMessageSummaryTool: OperationalTool = {
  name: 'getFailedMessageSummary',
  description: 'Returns details on delivery failures for event communications',
  category: 'communications',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);

    const rows = await query(`
      SELECT id, event_id, status, error_message, created_at, 'WhatsApp' as channel
      FROM whatsapp_delivery_logs
      WHERE event_id = ? AND status = 'failed'
      ORDER BY created_at DESC
      LIMIT ?
    `, [context.eventId, limit]);

    return {
      success: true,
      authorized: true,
      toolName: 'getFailedMessageSummary',
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const communicationTools: OperationalTool[] = [
  getCommunicationSummaryTool,
  getQueuedMessagesSummaryTool,
  getFailedMessageSummaryTool
];
