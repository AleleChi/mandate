import { query, queryOne } from '../../../db';
import { OperationalTool, ToolContext, ToolFilter, ToolResult } from '../types';

export const getReportsSummaryTool: OperationalTool = {
  name: 'getReportsSummary',
  description: 'Returns summary of generated operational reports for the event',
  category: 'reports',
  execute: async (context: ToolContext, _filters?: ToolFilter): Promise<ToolResult> => {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    const [totalRes, todayRes, expiredRes] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM generated_reports WHERE event_id = ?', [context.eventId]),
      queryOne('SELECT COUNT(*) as count FROM generated_reports WHERE event_id = ? AND created_at LIKE ?', [context.eventId, `${todayPrefix}%`]),
      queryOne('SELECT COUNT(*) as count FROM generated_reports WHERE event_id = ? AND expires_at IS NOT NULL AND expires_at < ?', [context.eventId, nowIso])
    ]);

    const totalReports = totalRes?.count || 0;
    const reportsGeneratedToday = todayRes?.count || 0;
    const expiredReports = expiredRes?.count || 0;

    return {
      success: true,
      authorized: true,
      toolName: 'getReportsSummary',
      data: {
        eventId: context.eventId,
        totalReports,
        reportsGeneratedToday,
        expiredReports
      }
    };
  }
};

export const listGeneratedReportsTool: OperationalTool = {
  name: 'listGeneratedReports',
  description: 'Lists generated operational reports for the current event',
  category: 'reports',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);

    const rows = await query(`
      SELECT 
        id,
        report_type,
        format,
        status,
        download_count,
        created_at,
        expires_at
      FROM generated_reports
      WHERE event_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [context.eventId, limit]);

    const countRes = await queryOne('SELECT COUNT(*) as total FROM generated_reports WHERE event_id = ?', [context.eventId]);

    return {
      success: true,
      authorized: true,
      toolName: 'listGeneratedReports',
      totalCount: countRes?.total || 0,
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listExpiredReportsTool: OperationalTool = {
  name: 'listExpiredReports',
  description: 'Lists generated reports whose download validity has expired',
  category: 'reports',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const nowIso = new Date().toISOString();

    const rows = await query(`
      SELECT 
        id,
        report_type,
        format,
        status,
        created_at,
        expires_at
      FROM generated_reports
      WHERE event_id = ? AND expires_at IS NOT NULL AND expires_at < ?
      ORDER BY expires_at DESC
      LIMIT ?
    `, [context.eventId, nowIso, limit]);

    return {
      success: true,
      authorized: true,
      toolName: 'listExpiredReports',
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const listReportsGeneratedTodayTool: OperationalTool = {
  name: 'listReportsGeneratedToday',
  description: 'Lists reports created today for the current event',
  category: 'reports',
  execute: async (context: ToolContext, filters?: ToolFilter): Promise<ToolResult> => {
    const limit = Math.min(filters?.limit || 20, 50);
    const todayPrefix = new Date().toISOString().slice(0, 10);

    const rows = await query(`
      SELECT 
        id,
        report_type,
        format,
        status,
        download_count,
        created_at
      FROM generated_reports
      WHERE event_id = ? AND created_at LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [context.eventId, `${todayPrefix}%`, limit]);

    return {
      success: true,
      authorized: true,
      toolName: 'listReportsGeneratedToday',
      displayedCount: rows.length,
      data: rows
    };
  }
};

export const reportTools: OperationalTool[] = [
  getReportsSummaryTool,
  listGeneratedReportsTool,
  listExpiredReportsTool,
  listReportsGeneratedTodayTool
];
