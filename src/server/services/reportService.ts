import { getDb, query, queryOne, execute, transaction } from '../db';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import { calculateAnalytics, formatDuration } from './reportAnalyticsService';
import { compileReportDocument } from '../reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../reports/reportRenderer';

const dbUrl = process.env.DATABASE_URL;
const isPostgres = !!(dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')));

export const REPORT_TEMPLATES = [
  {
    key: 'event-executive-report-v1',
    name: 'Event Executive Report',
    description: 'A concise leadership report covering attendance, safety activity, volunteer coverage, location readiness and the main actions arising from the event.',
    privacy_classification: 'Internal operational',
    privacyClassification: 'Internal operational',
    category: 'Leadership',
    categoryBadge: 'Leadership',
    reportDomain: 'Leadership',
    audience: 'Leadership, Event Director',
    includes: [
      'Executive summary of event metrics',
      'Attendance overview and arrival flow',
      'Safety alerts and incident response',
      'Volunteer team coverage ratios',
      'Venue capacity and location readiness',
      'Key findings and recommended actions'
    ],
    bestUsedFor: 'Post-event leadership review and operational planning',
    recommendedSections: ['Executive Summary', 'Operational Metrics', 'Recommended actions'],
    supportedSections: ['Executive Summary', 'Operational Metrics', 'Recommended actions', 'Critical Incident Logs & Escalations'],
    defaultSections: ['Executive Summary', 'Operational Metrics', 'Recommended actions'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['production-event'],
    allowedActions: ['preview', 'generate']
  },
  {
    key: 'attendance-demographics-report-v1',
    name: 'Attendance and Demographics Report',
    description: 'Understand registrations, attendance rates, age-group participation, arrival patterns, secure release activity and areas requiring follow-up.',
    privacy_classification: 'Internal operational',
    privacyClassification: 'Internal operational',
    category: 'Attendance',
    categoryBadge: 'Attendance',
    reportDomain: 'Attendance',
    audience: 'Attendance Lead, Event Supervisors',
    includes: [
      'Attendance rates and total registrations',
      'Age-group cohort breakdown',
      'Peak arrival and check-in hours',
      'Checkout and secure release patterns',
      'Location registration comparisons',
      'Follow-up items and data confidence'
    ],
    bestUsedFor: 'Analyzing attendance trends, age dynamics, and check-in efficiency',
    recommendedSections: ['Operational Metrics', 'Child Profiles & Demographic Details'],
    supportedSections: ['Executive Summary', 'Operational Metrics', 'Child Profiles & Demographic Details'],
    defaultSections: ['Operational Metrics', 'Child Profiles & Demographic Details'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['production-event'],
    allowedActions: ['preview', 'generate']
  },
  {
    key: 'child-safety-incident-report-v1',
    name: 'Child Safety and Incident Report',
    description: 'Review safety concerns, incident response, outstanding follow-up and safeguarding actions requiring leadership attention.',
    privacy_classification: 'Safeguarding restricted',
    privacyClassification: 'Safeguarding restricted',
    category: 'Safety',
    categoryBadge: 'Safety',
    reportDomain: 'Safeguarding',
    audience: 'Safeguarding Lead, Executive Leadership',
    includes: [
      'Safety alert summary and severity breakdown',
      'Average response and resolution times',
      'Coordinator escalation history',
      'Medical and dietary alert logs',
      'Safeguarding policy compliance audits',
      'Action plan for outstanding follow-ups'
    ],
    bestUsedFor: 'Safeguarding audits, incident reviews, and policy compliance',
    recommendedSections: ['Executive Summary', 'Critical Incident Logs & Escalations', 'Safeguarding Audits & Device Readiness'],
    supportedSections: ['Executive Summary', 'Critical Incident Logs & Escalations', 'Safeguarding Audits & Device Readiness'],
    defaultSections: ['Executive Summary', 'Critical Incident Logs & Escalations', 'Safeguarding Audits & Device Readiness'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['production-event'],
    allowedActions: ['preview', 'generate']
  },
  {
    key: 'volunteer-team-performance-report-v1',
    name: 'Volunteer Team Performance Report',
    description: 'Review volunteer attendance, duty assignments, team coverage ratios and operational support across event locations.',
    privacy_classification: 'Internal operational',
    privacyClassification: 'Internal operational',
    category: 'People',
    categoryBadge: 'People',
    reportDomain: 'People',
    audience: 'Volunteer Coordinator, Team Leads',
    includes: [
      'Volunteer attendance and duty log',
      'Staff-to-child coverage ratios',
      'Location assignment distribution',
      'Shift timing and handover efficiency',
      'Device readiness and team support',
      'Rostering recommendations for future events'
    ],
    bestUsedFor: 'Evaluating team deployment, coverage ratios, and volunteer planning',
    recommendedSections: ['Operational Metrics', 'Safeguarding Audits & Device Readiness', 'Recommended actions'],
    supportedSections: ['Executive Summary', 'Operational Metrics', 'Safeguarding Audits & Device Readiness', 'Recommended actions'],
    defaultSections: ['Operational Metrics', 'Safeguarding Audits & Device Readiness', 'Recommended actions'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['production-event'],
    allowedActions: ['preview', 'generate']
  },
  {
    key: 'alert-response-escalation-report-v1',
    name: 'Alert Response and Escalation Report',
    description: 'Analyze safety alerts, response times, escalation levels and coordinator coverage during active event hours.',
    privacy_classification: 'Safeguarding restricted',
    privacyClassification: 'Safeguarding restricted',
    category: 'Operations',
    categoryBadge: 'Operations',
    reportDomain: 'Operations',
    audience: 'Safeguarding Lead, Safety Team',
    includes: [
      'Emergency alarm timeline and categories',
      'Median response and acknowledgment speed',
      'Escalation levels reached during active hours',
      'Coordinator handover efficiency',
      'Communication device coverage',
      'Protocol recommendations for response teams'
    ],
    bestUsedFor: 'Reviewing emergency responsiveness and escalation protocols',
    recommendedSections: ['Executive Summary', 'Critical Incident Logs & Escalations'],
    supportedSections: ['Executive Summary', 'Critical Incident Logs & Escalations', 'Recommended actions'],
    defaultSections: ['Executive Summary', 'Critical Incident Logs & Escalations'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['production-event'],
    allowedActions: ['preview', 'generate']
  },
  {
    key: 'location-capacity-report-v1',
    name: 'Location and Capacity Report',
    description: 'Monitor room occupancy, venue capacity limits, age-group distribution and space utilization across all rooms.',
    privacy_classification: 'Internal operational',
    privacyClassification: 'Internal operational',
    category: 'Operations',
    categoryBadge: 'Operations',
    reportDomain: 'Operations',
    audience: 'Location Supervisor, Venue Manager',
    includes: [
      'Room occupancy vs maximum capacity',
      'Peak attendance hours per location',
      'Staffing ratios across venue spaces',
      'Spillover and overflow room usage',
      'Age-group room allocations',
      'Capacity planning recommendations'
    ],
    bestUsedFor: 'Venue space planning, room allocations, and safety density management',
    recommendedSections: ['Operational Metrics', 'Recommended actions'],
    supportedSections: ['Executive Summary', 'Operational Metrics', 'Recommended actions'],
    defaultSections: ['Operational Metrics', 'Recommended actions'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['production-event'],
    allowedActions: ['preview', 'generate']
  },
  {
    key: 'pickup-secure-release-report-v1',
    name: 'Pickup and Secure Release Report',
    description: 'Track child checkouts, authorized collector verifications, pickup timing patterns and secure release compliance.',
    privacy_classification: 'Safeguarding restricted',
    privacyClassification: 'Safeguarding restricted',
    category: 'Safety',
    categoryBadge: 'Safety',
    reportDomain: 'Safety',
    audience: 'Pickup Lead, Safeguarding Team',
    includes: [
      'Successful checkout verification rates',
      'Authorized collector matching log',
      'Peak departure hours and queue flow',
      'Delayed checkout and exception logs',
      'Verification method compliance',
      'Dismissal recommendations for teams'
    ],
    bestUsedFor: 'Verifying secure dismissal workflows and collector authorization compliance',
    recommendedSections: ['Executive Summary', 'Pickup & Authorized Collectors list'],
    supportedSections: ['Executive Summary', 'Pickup & Authorized Collectors list', 'Critical Incident Logs & Escalations'],
    defaultSections: ['Executive Summary', 'Pickup & Authorized Collectors list'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['production-event'],
    allowedActions: ['preview', 'generate']
  },
  {
    key: 'offline-resilience-report-v1',
    name: 'Offline Resilience Report',
    description: 'Evaluate system connectivity, local device queue performance, offline check-in activity and data sync reliability.',
    privacy_classification: 'Internal operational',
    privacyClassification: 'Internal operational',
    category: 'Operations',
    categoryBadge: 'Operations',
    reportDomain: 'Operations',
    audience: 'IT Coordinator, Event Admin',
    includes: [
      'Network connection stability log',
      'Offline check-in scan volume',
      'Data sync speed and queue resolution',
      'Device hardware status checks',
      'Conflict resolution summary',
      'IT infrastructure recommendations'
    ],
    bestUsedFor: 'Checking system reliability, offline scanning data integrity, and technical readiness',
    recommendedSections: ['Operational Metrics', 'Safeguarding Audits & Device Readiness'],
    supportedSections: ['Executive Summary', 'Operational Metrics', 'Safeguarding Audits & Device Readiness'],
    defaultSections: ['Operational Metrics', 'Safeguarding Audits & Device Readiness'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['production-event'],
    allowedActions: ['preview', 'generate']
  },
  {
    key: 'training-drill-report-v1',
    name: 'Training Drill Report',
    description: 'Review emergency drill execution, team response speeds, procedural checklists and staff training outcomes.',
    privacy_classification: 'Training use',
    privacyClassification: 'Training use',
    category: 'Training',
    categoryBadge: 'Training',
    reportDomain: 'Training',
    audience: 'Training Facilitator, Safety Team',
    includes: [
      'Drill scenario overview and objectives',
      'Team evacuation and response times',
      'Safety checklist completion scores',
      'Coordinator feedback and observations',
      'Equipment and alert performance',
      'Training improvements for upcoming events'
    ],
    bestUsedFor: 'Assessing team readiness, drill scorecards, and safety procedure exercises',
    recommendedSections: ['Executive Summary', 'Operational Metrics', 'Recommended actions'],
    supportedSections: ['Executive Summary', 'Operational Metrics', 'Recommended actions'],
    defaultSections: ['Executive Summary', 'Operational Metrics', 'Recommended actions'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['training-session'],
    allowedActions: ['preview', 'generate']
  },
  {
    key: 'custom-event-report-v1',
    name: 'Custom Event Report',
    description: 'Create a custom report by selecting specific data sections, privacy classifications and event filters for tailored analysis.',
    privacy_classification: 'Internal operational',
    privacyClassification: 'Internal operational',
    category: 'Custom',
    categoryBadge: 'Custom',
    reportDomain: 'Custom',
    audience: 'Event Admin, Executive Leadership',
    includes: [
      'User-selected report sections',
      'Custom age group and location filters',
      'Tailored privacy classification',
      'Specific event or session scope',
      'Filtered attendance and incident data',
      'Customized summary and recommendations'
    ],
    bestUsedFor: 'Tailored analysis, specialized requests, and committee reporting',
    recommendedSections: ['Executive Summary', 'Operational Metrics', 'Recommended actions'],
    supportedSections: ['Executive Summary', 'Operational Metrics', 'Child Profiles & Demographic Details', 'Critical Incident Logs & Escalations', 'Safeguarding Audits & Device Readiness', 'Medical Allergies & Specific Diet logs', 'Pickup & Authorized Collectors list', 'Recommended actions'],
    defaultSections: ['Executive Summary', 'Operational Metrics', 'Recommended actions'],
    availableFilters: { ageGroup: 'All', location: 'All' },
    permittedEventTypes: ['production-event'],
    allowedActions: ['preview', 'generate']
  }
];

export async function initReportSchema() {
  const tsType = isPostgres ? 'TIMESTAMP' : 'TEXT';
  const textType = isPostgres ? 'VARCHAR(255)' : 'TEXT';

  await execute(`
    CREATE TABLE IF NOT EXISTS report_snapshots (
      id VARCHAR(64) PRIMARY KEY,
      event_id VARCHAR(64),
      training_session_id VARCHAR(64),
      template_key ${textType} NOT NULL,
      template_version INTEGER DEFAULT 1,
      data_schema_version INTEGER DEFAULT 1,
      source_cutoff_at ${tsType} NOT NULL,
      event_timezone ${textType} DEFAULT 'Africa/Lagos',
      privacy_classification ${textType} NOT NULL,
      access_profile ${textType} NOT NULL,
      snapshot_data TEXT NOT NULL,
      snapshot_hash VARCHAR(64) NOT NULL,
      created_by VARCHAR(64),
      created_at ${tsType} NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS report_jobs (
      id VARCHAR(64) PRIMARY KEY,
      event_id VARCHAR(64),
      training_session_id VARCHAR(64),
      requested_by VARCHAR(64) NOT NULL,
      template_key ${textType} NOT NULL,
      report_name ${textType} NOT NULL,
      status ${textType} NOT NULL DEFAULT 'queued',
      priority INTEGER DEFAULT 5,
      access_profile ${textType} NOT NULL,
      privacy_classification ${textType} NOT NULL,
      filter_configuration TEXT,
      section_configuration TEXT,
      snapshot_id VARCHAR(64),
      attempt_count INTEGER DEFAULT 0,
      next_attempt_at ${tsType},
      started_at ${tsType},
      completed_at ${tsType},
      expires_at ${tsType},
      archived_at ${tsType},
      error_code ${textType},
      created_at ${tsType} NOT NULL,
      updated_at ${tsType} NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS generated_reports (
      id VARCHAR(64) PRIMARY KEY,
      report_job_id VARCHAR(64) NOT NULL,
      snapshot_id VARCHAR(64) NOT NULL,
      report_version INTEGER DEFAULT 1,
      generator_version ${textType} NOT NULL,
      storage_key ${textType} UNIQUE NOT NULL,
      file_size INTEGER NOT NULL,
      file_hash VARCHAR(64) NOT NULL,
      page_count INTEGER NOT NULL,
      document_model_json TEXT,
      document_hash VARCHAR(64),
      generated_at ${tsType} NOT NULL,
      expires_at ${tsType},
      archived_at ${tsType},
      created_at ${tsType} NOT NULL
    );
  `);

  // Safely add missing columns for existing SQLite/PostgreSQL databases
  try {
    await execute(`ALTER TABLE generated_reports ADD COLUMN document_model_json TEXT`);
  } catch (_) {}
  try {
    await execute(`ALTER TABLE generated_reports ADD COLUMN document_hash VARCHAR(64)`);
  } catch (_) {}
  try {
    await execute(`ALTER TABLE report_jobs ADD COLUMN idempotency_key VARCHAR(128)`);
  } catch (_) {}

  await execute(`
    CREATE TABLE IF NOT EXISTS report_history (
      id VARCHAR(64) PRIMARY KEY,
      report_job_id VARCHAR(64),
      generated_report_id VARCHAR(64),
      actor_user_id VARCHAR(64),
      action_type ${textType} NOT NULL,
      safe_summary TEXT NOT NULL,
      created_at ${tsType} NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS report_download_tokens (
      id VARCHAR(64) PRIMARY KEY,
      generated_report_id VARCHAR(64) NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expires_at ${tsType} NOT NULL,
      created_at ${tsType} NOT NULL
    );
  `);
}

// Data aggregation layer - compiles event/training data and applies filters
export async function compileReportSnapshot(
  eventId: string | null,
  trainingSessionId: string | null,
  templateKey: string,
  userId: string,
  role: string,
  privacyLevel: string,
  filters: any = {}
): Promise<any> {
  const cutoffTime = new Date().toISOString();
  const targetTimezone = filters?.timezone || 'Africa/Lagos';

  if (trainingSessionId) {
    const session = await queryOne('SELECT * FROM training_sessions WHERE id = ?', [trainingSessionId]);
    if (!session) throw new Error('Training session not found.');

    const scenario = await queryOne('SELECT * FROM training_scenarios WHERE id = ?', [session.scenario_id]);
    const objectives = await query('SELECT * FROM training_scenario_objectives WHERE scenario_id = ? ORDER BY step_order ASC', [session.scenario_id]);
    const results = await query('SELECT * FROM training_objective_results WHERE session_id = ?', [trainingSessionId]);
    const participants = await query('SELECT tp.*, u.email FROM training_participants tp JOIN users u ON tp.user_id = u.id WHERE tp.session_id = ?', [trainingSessionId]);
    const observations = await query('SELECT * FROM training_observations WHERE session_id = ?', [trainingSessionId]);
    const activities = await query('SELECT * FROM training_activity WHERE session_id = ? ORDER BY real_created_at ASC', [trainingSessionId]);
    const debrief = await queryOne('SELECT * FROM training_debriefs WHERE session_id = ?', [trainingSessionId]);

    return {
      session,
      scenario,
      objectives,
      results,
      participants,
      observations,
      activities,
      debrief,
      cutoffTime,
      timezone: targetTimezone,
      filters
    };
  } else {
    const targetEventId = eventId || 'event-ga-2026';
    const event = await queryOne('SELECT * FROM events WHERE id = ?', [targetEventId]);
    if (!event) throw new Error('Production event not found.');

    const attendanceRecords = await query('SELECT * FROM attendance_records WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)', [targetEventId]);
    const syncRecords = await query('SELECT * FROM offline_sync_records WHERE event_id = ?', [targetEventId]);
    let locations = await query('SELECT * FROM event_locations WHERE event_id = ?', [targetEventId]);
    const deviceReadiness = await query('SELECT * FROM device_readiness_logs WHERE event_id = ?', [targetEventId]);
    const dutyDevices = await query('SELECT * FROM event_duty_devices WHERE event_id = ?', [targetEventId]);
    const dutyAssignments = await query('SELECT * FROM event_duty_assignments WHERE event_id = ?', [targetEventId]);
    const incidentRecords = await query('SELECT * FROM incident_records WHERE event_id = ?', [targetEventId]);
    const ageGroups = await query('SELECT * FROM event_age_groups WHERE event_id = ?', [targetEventId]);

    // Apply location filter if specified
    if (filters?.location && filters.location !== 'All') {
      locations = locations.filter((loc: any) => loc.name === filters.location || loc.id === filters.location || loc.location_label === filters.location);
    }

    const compEvent = await queryOne("SELECT * FROM events WHERE id != ? ORDER BY created_at DESC LIMIT 1", [targetEventId]);
    let comparisonData: any = null;
    if (compEvent) {
      const compChildEntries = await query('SELECT count(*) as count, count(checked_in_at) as checked_in, count(picked_up_at) as picked_up FROM child_event_entries WHERE event_id = ?', [compEvent.id]);
      const compAlerts = await query('SELECT count(*) as count FROM event_safety_alerts WHERE event_id = ?', [compEvent.id]);
      const compDuty = await query('SELECT count(*) as count FROM event_duty_assignments WHERE event_id = ?', [compEvent.id]);
      const compIncidents = await query('SELECT count(*) as count FROM incident_records WHERE event_id = ?', [compEvent.id]);
      const compSync = await query('SELECT count(*) as count FROM offline_sync_records WHERE event_id = ?', [compEvent.id]);
      const compDev = await query('SELECT count(*) as count FROM device_readiness_logs WHERE event_id = ?', [compEvent.id]);

      comparisonData = {
        eventId: compEvent.id,
        title: compEvent.title,
        startsAt: compEvent.starts_at,
        totalRegistrations: Number(compChildEntries[0]?.count || 0),
        checkedInTotal: Number(compChildEntries[0]?.checked_in || 0),
        pickedUpTotal: Number(compChildEntries[0]?.picked_up || 0),
        totalAlerts: Number(compAlerts[0]?.count || 0),
        totalVolunteers: Number(compDuty[0]?.count || 0),
        totalIncidents: Number(compIncidents[0]?.count || 0),
        totalSync: Number(compSync[0]?.count || 0),
        totalDev: Number(compDev[0]?.count || 0)
      };
    }

    const isConfidential = privacyLevel === 'Confidential' || privacyLevel === 'Safeguarding restricted';
    const hasSensitiveAccess = ['super_admin', 'admin', 'safeguarding_lead', 'pickup_lead'].includes(role);

    let rawEntries = await query(`
      SELECT cee.*, c.full_name as child_name, c.date_of_birth, c.gender, c.age_group
      FROM child_event_entries cee
      JOIN children c ON cee.child_id = c.id
      WHERE cee.event_id = ?
    `, [targetEventId]);

    // Apply ageGroup filter if specified
    if (filters?.ageGroup && filters.ageGroup !== 'All') {
      rawEntries = rawEntries.filter((c: any) => c.age_group === filters.ageGroup || (c.age_group && c.age_group.toLowerCase().includes(filters.ageGroup.toLowerCase())));
    }

    let rawAlerts = await query('SELECT * FROM event_safety_alerts WHERE event_id = ?', [targetEventId]);
    if (filters?.location && filters.location !== 'All') {
      rawAlerts = rawAlerts.filter((a: any) => a.location_label === filters.location);
    }

    let childEntries: any[] = [];
    let safetyAlerts: any[] = [];
    let pickupRecords: any[] = [];

    if (isConfidential && hasSensitiveAccess) {
      childEntries = rawEntries;
      safetyAlerts = rawAlerts;
      pickupRecords = await query('SELECT * FROM pickup_people WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)', [targetEventId]);
    } else {
      childEntries = rawEntries.map((c: any) => ({
        id: c.id,
        status: c.status,
        age_group: c.age_group,
        gender: c.gender,
        has_medical_notes: c.has_medical_notes ? 1 : 0,
        needs_extra_support: c.needs_extra_support ? 1 : 0,
        checked_in_at: c.checked_in_at,
        picked_up_at: c.picked_up_at,
        child_name: `Child Ref-${c.id.slice(0, 6).toUpperCase()}`,
        date_of_birth: 'REDACTED',
        medical_notes: c.has_medical_notes ? 'CONFIDENTIAL MEDICAL NOTES STAGED' : '',
        support_notes: c.needs_extra_support ? 'CONFIDENTIAL SUPPORT NOTES STAGED' : ''
      }));

      safetyAlerts = rawAlerts.map((a: any) => ({
        id: a.id,
        severity: a.severity,
        category: a.category,
        title: a.title,
        status: a.status,
        location_label: a.location_label,
        created_at: a.created_at,
        acknowledged_at: a.acknowledged_at,
        resolved_at: a.resolved_at,
        message: 'CONFIDENTIAL ALERTS NARRATIVE STAGED',
        child_id: null
      }));

      pickupRecords = [];
    }

    return {
      event,
      attendanceRecords,
      syncRecords,
      locations,
      deviceReadiness,
      dutyDevices,
      dutyAssignments,
      childEntries,
      safetyAlerts,
      pickupRecords,
      incidentRecords,
      ageGroups,
      comparisonData,
      cutoffTime,
      timezone: targetTimezone,
      filters
    };
  }
}

export async function getValidatedBrandLogo(): Promise<{
  available: boolean;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | null;
  previewUrl: string | null;
  pdfData: string | null;
  altText: string;
}> {
  try {
    const setting = await queryOne(
      "SELECT setting_value FROM admin_landing_settings WHERE setting_key = 'site_logo'"
    );
    if (!setting || !setting.setting_value) {
      console.log('[Report Branding] logo unavailable');
      return { available: false, mimeType: null, previewUrl: null, pdfData: null, altText: 'Koinonia Global' };
    }
    console.log('[Report Branding] logo setting found');

    const settingValue = setting.setting_value;
    let fileId: string | null = null;
    const match = settingValue.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) fileId = match[0];

    let mediaUrl: string | null = null;
    let mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | null = null;

    if (fileId) {
      const media = await queryOne('SELECT * FROM media_files WHERE id = ?', [fileId]);
      if (media) {
        console.log('[Report Branding] media record found');
        mediaUrl = media.secure_url || media.file_url || null;
        if (media.mime_type === 'image/png') mimeType = 'image/png';
        else if (media.mime_type === 'image/jpeg' || media.mime_type === 'image/jpg') mimeType = 'image/jpeg';
        else if (media.mime_type === 'image/webp') mimeType = 'image/webp';
      }
    }

    if (!mediaUrl && (settingValue.startsWith('http://') || settingValue.startsWith('https://') || settingValue.startsWith('data:image/'))) {
      mediaUrl = settingValue;
    }

    if (!mediaUrl) {
      console.log('[Report Branding] logo unavailable');
      return { available: false, mimeType: null, previewUrl: null, pdfData: null, altText: 'Koinonia Global' };
    }

    // Security checks: reject unsafe schemes, text/html, file://, traversal
    if (
      mediaUrl.toLowerCase().startsWith('javascript:') ||
      mediaUrl.toLowerCase().startsWith('file:') ||
      mediaUrl.toLowerCase().startsWith('data:text/html') ||
      mediaUrl.includes('..')
    ) {
      console.warn('[Report Branding] Unsafe logo URL rejected:', mediaUrl);
      console.log('[Report Branding] logo unavailable');
      return { available: false, mimeType: null, previewUrl: null, pdfData: null, altText: 'Koinonia Global' };
    }

    if (mediaUrl.startsWith('data:image/')) {
      const headerMime = mediaUrl.match(/^data:(image\/[a-z]+);base64,/)?.[1];
      if (headerMime === 'image/png') mimeType = 'image/png';
      else if (headerMime === 'image/jpeg') mimeType = 'image/jpeg';
      else if (headerMime === 'image/webp') mimeType = 'image/webp';

      if (!mimeType) {
        console.log('[Report Branding] logo unavailable');
        return { available: false, mimeType: null, previewUrl: null, pdfData: null, altText: 'Koinonia Global' };
      }

      console.log('[Report Branding] asset loaded');
      console.log('[Report Branding] Preview logo resolved');
      console.log('[Report Branding] PDF logo embedded');
      return {
        available: true,
        mimeType,
        previewUrl: mediaUrl,
        pdfData: mediaUrl,
        altText: 'Koinonia Global'
      };
    }

    // Fetch remote image bytes for PDF rendering
    const res = await fetch(mediaUrl);
    if (!res.ok) {
      console.log('[Report Branding] logo unavailable');
      return { available: false, mimeType: null, previewUrl: null, pdfData: null, altText: 'Koinonia Global' };
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('image/png')) mimeType = 'image/png';
    else if (contentType.includes('image/jpeg')) mimeType = 'image/jpeg';
    else if (contentType.includes('image/webp')) mimeType = 'image/webp';
    else if (!mimeType) mimeType = 'image/png';

    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > 5 * 1024 * 1024) {
      console.log('[Report Branding] logo unavailable');
      return { available: false, mimeType: null, previewUrl: null, pdfData: null, altText: 'Koinonia Global' };
    }

    console.log('[Report Branding] asset loaded');

    const base64Str = Buffer.from(arrayBuf).toString('base64');
    const pdfData = `data:${mimeType};base64,${base64Str}`;

    console.log('[Report Branding] Preview logo resolved');
    console.log('[Report Branding] PDF logo embedded');

    return {
      available: true,
      mimeType,
      previewUrl: mediaUrl,
      pdfData,
      altText: 'Koinonia Global'
    };
  } catch (err) {
    console.error('[Report Branding] Error loading brand logo:', err);
    console.log('[Report Branding] logo unavailable');
    return { available: false, mimeType: null, previewUrl: null, pdfData: null, altText: 'Koinonia Global' };
  }
}

// Request a new report job - NON-BLOCKING
export async function requestReportJob(
  eventId: string | null,
  trainingSessionId: string | null,
  templateKey: string,
  userId: string,
  role: string,
  privacyLevel: string,
  sections: string[],
  filters: any = {},
  idempotencyKey?: string
): Promise<string> {
  if (idempotencyKey) {
    const existingJob = await queryOne('SELECT id FROM report_jobs WHERE filter_configuration LIKE ? AND template_key = ? AND status != \'cancelled\'', [`%${idempotencyKey}%`, templateKey]);
    if (existingJob) {
      return existingJob.id;
    }
  }

  const jobId = 'job-' + crypto.randomUUID();
  const template = REPORT_TEMPLATES.find(t => t.key === templateKey);
  const now = new Date().toISOString();
  const templateNameStr = template?.name || 'Report';
  const reportName = `Koinonia_${templateNameStr.replace(/\s+/g, '_')}_${now.slice(0, 10)}`;
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  // Insert queued job immediately without compiling snapshot synchronously
  await execute(`
    INSERT INTO report_jobs (id, event_id, training_session_id, requested_by, template_key, report_name, status, priority, access_profile, privacy_classification, filter_configuration, section_configuration, snapshot_id, attempt_count, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'queued', 5, ?, ?, ?, ?, NULL, 0, ?, ?, ?)
  `, [
    jobId,
    eventId,
    trainingSessionId,
    userId,
    templateKey,
    reportName,
    role,
    privacyLevel,
    JSON.stringify({ ...filters, idempotencyKey }),
    JSON.stringify(sections),
    expiresAt,
    now,
    now
  ]);

  console.log(`[Reports] job created - Job ID: ${jobId}, Template: ${templateKey}`);

  await execute(`
    INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
    VALUES (?, ?, ?, 'requested', ?, ?)
  `, ['hist-' + crypto.randomUUID(), jobId, userId, `Report job requested for template: ${templateKey}`, now]);

  processQueuedReportJobs().catch(err => {
    console.error('Error running report processing worker:', err);
  });

  return jobId;
}

const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'data', 'reports');
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

let isWorkerRunning = false;

export async function processQueuedReportJobs() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  try {
    while (true) {
      const now = new Date().toISOString();
      const pendingJob = await queryOne(`
        SELECT * FROM report_jobs 
        WHERE status = 'queued' 
           OR (status = 'generating' AND started_at < ?) 
        ORDER BY priority DESC, created_at ASC 
        LIMIT 1
      `, [new Date(Date.now() - 300 * 1000).toISOString()]);

      if (!pendingJob) {
        break;
      }

      const claimResult = await execute(`
        UPDATE report_jobs 
        SET status = 'generating', started_at = ?, attempt_count = attempt_count + 1, updated_at = ?
        WHERE id = ? AND status IN ('queued', 'generating')
      `, [now, now, pendingJob.id]);

      if (claimResult.changes === 0) {
        continue;
      }

      try {
        console.log(`[Reports] snapshot started - Job ID: ${pendingJob.id}`);

        let snapshotId = pendingJob.snapshot_id;
        let snapshotData: any = null;

        if (snapshotId) {
          const snapshotRow = await queryOne('SELECT * FROM report_snapshots WHERE id = ?', [snapshotId]);
          if (snapshotRow) {
            snapshotData = JSON.parse(snapshotRow.snapshot_data);
          }
        }

        if (!snapshotData) {
          const filters = JSON.parse(pendingJob.filter_configuration || '{}');
          snapshotData = await compileReportSnapshot(
            pendingJob.event_id,
            pendingJob.training_session_id,
            pendingJob.template_key,
            pendingJob.requested_by,
            pendingJob.access_profile,
            pendingJob.privacy_classification,
            filters
          );

          snapshotId = 'snap-' + crypto.randomUUID();
          const snapshotDataStr = JSON.stringify(snapshotData);
          const snapshotHash = crypto.createHash('sha256').update(snapshotDataStr).digest('hex');

          await execute(`
            INSERT INTO report_snapshots (id, event_id, training_session_id, template_key, source_cutoff_at, privacy_classification, access_profile, snapshot_data, snapshot_hash, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            snapshotId,
            pendingJob.event_id,
            pendingJob.training_session_id,
            pendingJob.template_key,
            snapshotData.cutoffTime || now,
            pendingJob.privacy_classification,
            pendingJob.access_profile,
            snapshotDataStr,
            snapshotHash,
            pendingJob.requested_by,
            now
          ]);

          await execute('UPDATE report_jobs SET snapshot_id = ? WHERE id = ?', [snapshotId, pendingJob.id]);
        }

        console.log(`[Reports] snapshot complete - Job ID: ${pendingJob.id}`);
        const analytics = calculateAnalytics(snapshotData);
        console.log(`[Reports] analytics complete - Job ID: ${pendingJob.id}`);
        console.log(`[Reports] document compiled - Job ID: ${pendingJob.id}`);
        console.log(`[Reports] PDF rendering started - Job ID: ${pendingJob.id}`);

        const sections = JSON.parse(pendingJob.section_configuration || '[]');
        const logoInfo = await getValidatedBrandLogo();
        const docModel = compileReportDocument(
          pendingJob.id,
          snapshotData,
          analytics,
          pendingJob.template_key,
          pendingJob.privacy_classification,
          sections
        );

        if (logoInfo.available) {
          docModel.branding = {
            ...docModel.branding,
            organizationName: 'Koinonia Global',
            logoUrl: logoInfo.previewUrl || logoInfo.pdfData || undefined,
            logoBase64: logoInfo.pdfData || undefined
          };
        }

        const docModelJson = JSON.stringify(docModel);
        const docHash = crypto.createHash('sha256').update(docModelJson).digest('hex');

        const { pdfBytes, pageCount } = await renderPDFReport(
          pendingJob.template_key,
          pendingJob.report_name,
          pendingJob.privacy_classification,
          snapshotData,
          sections
        );

        console.log(`[Reports] PDF rendering complete - Job ID: ${pendingJob.id}`);

        const fileHash = crypto.createHash('sha256').update(Buffer.from(pdfBytes)).digest('hex');
        const storageKey = `${pendingJob.id}.pdf`;
        const tmpPath = path.join(LOCAL_STORAGE_DIR, `${pendingJob.id}.pdf.tmp`);
        const finalPath = path.join(LOCAL_STORAGE_DIR, storageKey);

        fs.writeFileSync(tmpPath, Buffer.from(pdfBytes));
        const fileSize = pdfBytes.byteLength;

        // Check if job was cancelled while generating
        const currentJob = await queryOne('SELECT status FROM report_jobs WHERE id = ?', [pendingJob.id]);
        if (currentJob?.status === 'cancelled') {
          if (fs.existsSync(tmpPath)) {
            try { fs.unlinkSync(tmpPath); } catch (_) {}
          }
          console.log(`[Reports] Job ${pendingJob.id} was cancelled during generation. Preserving cancelled status.`);
          continue;
        }

        // Atomically rename tmp file to final file
        fs.renameSync(tmpPath, finalPath);

        await transaction(async () => {
          const updateRes = await execute(`
            UPDATE report_jobs 
            SET status = 'ready', completed_at = ?, updated_at = ? 
            WHERE id = ? AND status = 'generating'
          `, [now, now, pendingJob.id]);

          if (updateRes.changes === 0) {
            console.log(`[Reports] Job ${pendingJob.id} status was not generating. Preserving status.`);
            return;
          }

          const existingGen = await queryOne('SELECT id, report_version FROM generated_reports WHERE report_job_id = ?', [pendingJob.id]);
          if (existingGen) {
            const nextVersion = (existingGen.report_version || 1) + 1;
            await execute(`
              UPDATE generated_reports 
              SET storage_key = ?, file_size = ?, file_hash = ?, page_count = ?, report_version = ?, document_model_json = ?, document_hash = ?, generated_at = ?, expires_at = ?
              WHERE report_job_id = ?
            `, [
              storageKey,
              fileSize,
              fileHash,
              pageCount,
              nextVersion,
              docModelJson,
              docHash,
              now,
              pendingJob.expires_at,
              pendingJob.id
            ]);
          } else {
            await execute(`
              INSERT INTO generated_reports (id, report_job_id, snapshot_id, report_version, generator_version, storage_key, file_size, file_hash, page_count, document_model_json, document_hash, generated_at, expires_at, created_at)
              VALUES (?, ?, ?, 1, 'jsPDF-v1', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              'rep-' + crypto.randomUUID(),
              pendingJob.id,
              snapshotId,
              storageKey,
              fileSize,
              fileHash,
              pageCount,
              docModelJson,
              docHash,
              now,
              pendingJob.expires_at,
              now
            ]);
          }

          await execute(`
            INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
            VALUES (?, ?, NULL, 'completed', ?, ?)
          `, ['hist-' + crypto.randomUUID(), pendingJob.id, `Report generated successfully. Size: ${(fileSize / 1024).toFixed(1)} KB`, now]);
        });

        console.log(`[Reports] report ready - Job ID: ${pendingJob.id}`);

      } catch (jobErr: any) {
        console.error(`[Reports] report failed - Job ID: ${pendingJob.id}, Error:`, jobErr);
        const failNow = new Date().toISOString();

        await execute(`
          UPDATE report_jobs 
          SET status = 'failed', error_code = ?, updated_at = ? 
          WHERE id = ?
        `, [jobErr?.message || 'Report rendering failed.', failNow, pendingJob.id]);

        await execute(`
          INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
          VALUES (?, ?, NULL, 'failed', ?, ?)
        `, ['hist-' + crypto.randomUUID(), pendingJob.id, `Generation failed: ${jobErr?.message || 'Unknown render failure'}`, failNow]);
      }
    }
  } finally {
    isWorkerRunning = false;
  }
}

async function renderPDFReport(
  templateKey: string,
  reportName: string,
  privacyClassification: string,
  snapshot: any,
  sections: string[]
): Promise<{ pdfBytes: ArrayBuffer; pageCount: number }> {
  const analytics = calculateAnalytics(snapshot);

  const model = compileReportDocument(
    'rep-doc-' + crypto.randomUUID(),
    snapshot,
    analytics,
    templateKey,
    privacyClassification,
    sections
  );

  const logoInfo = await getValidatedBrandLogo();
  if (logoInfo.available) {
    model.branding = {
      ...model.branding,
      organizationName: 'Koinonia Global',
      logoUrl: logoInfo.previewUrl || logoInfo.pdfData || undefined,
      logoBase64: logoInfo.pdfData || undefined
    };
  }

  return renderDocumentToPDF(model);
}

export function needsModelUpgrade(docModel: any): boolean {
  if (!docModel) return true;
  if (!docModel.templateVersion || docModel.templateVersion < 2) return true;
  if (!docModel.branding?.logoUrl && !docModel.branding?.logoBase64) return true;
  const jsonStr = JSON.stringify(docModel);
  const deprecatedTerms = [
    'Report document renderer v4 active',
    'Supporting Evidence:',
    'Generated Snapshot',
    'Executive Overview',
    'Operational Overview & KPIs',
    'Grounded Findings',
    'Key Grounded Findings',
    'Actionable Recommendations',
    'Data Quality & Audit',
    'Data Confidence & Synchronization Audit',
    'Line chart representation',
    'Bar chart representation',
    'Overall Registry Confidence Status',
    'cleanup job'
  ];
  return deprecatedTerms.some(term => jsonStr.includes(term));
}

export async function upgradeReportRecord(reportJobId: string): Promise<any | null> {
  const job = await queryOne('SELECT * FROM report_jobs WHERE id = ?', [reportJobId]);
  if (!job || !job.snapshot_id) return null;

  const snapshotRow = await queryOne('SELECT * FROM report_snapshots WHERE id = ?', [job.snapshot_id]);
  if (!snapshotRow || !snapshotRow.snapshot_data) return null;

  // 1. Load original snapshot data
  const snapshotData = JSON.parse(snapshotRow.snapshot_data);

  // 2. Rebuild document model from original snapshot
  const analytics = calculateAnalytics(snapshotData);
  const sections = job.section_configuration ? JSON.parse(job.section_configuration) : [];
  const newModel = compileReportDocument(
    job.id,
    snapshotData,
    analytics,
    job.template_key,
    job.privacy_classification,
    sections
  );

  const logoInfo = await getValidatedBrandLogo();
  if (logoInfo.available) {
    newModel.branding = {
      ...newModel.branding,
      organizationName: 'Koinonia Global',
      logoUrl: logoInfo.previewUrl || logoInfo.pdfData || undefined,
      logoBase64: logoInfo.pdfData || undefined
    };
  }

  const docModelJson = JSON.stringify(newModel);
  const docHash = crypto.createHash('sha256').update(docModelJson).digest('hex');

  // 3. Render replacement PDF from same model
  const { pdfBytes, pageCount } = await renderDocumentToPDF(newModel);
  const fileHash = crypto.createHash('sha256').update(Buffer.from(pdfBytes)).digest('hex');
  const fileSize = pdfBytes.byteLength;

  if (fileSize === 0 || pageCount === 0 || Buffer.from(pdfBytes).toString('utf8', 0, 4) !== '%PDF') {
    throw new Error(`Generated PDF for job ${job.id} failed sanity validation.`);
  }

  // 4. Write PDF to disk atomically
  const REPORTS_DIR = path.join(process.cwd(), 'data', 'reports');
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  const relativeKey = `${job.id}.pdf`;
  const finalPath = path.join(REPORTS_DIR, relativeKey);
  const tempPath = path.join(REPORTS_DIR, `${job.id}.pdf.tmp`);
  
  fs.writeFileSync(tempPath, Buffer.from(pdfBytes));
  
  // Verify temp file
  if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size !== fileSize) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw new Error(`Temporary PDF file verification failed for job ${job.id}.`);
  }

  // Atomic rename
  fs.renameSync(tempPath, finalPath);

  // 5. Update generated_reports in DB with relative storage_key
  const genReport = await queryOne('SELECT id, report_version FROM generated_reports WHERE report_job_id = ?', [job.id]);
  const now = new Date().toISOString();
  const nextVersion = genReport ? (genReport.report_version || 1) + 1 : 1;

  if (genReport) {
    await execute(`
      UPDATE generated_reports
      SET storage_key = ?, file_size = ?, file_hash = ?, page_count = ?, report_version = ?, document_model_json = ?, document_hash = ?, generated_at = ?
      WHERE report_job_id = ?
    `, [relativeKey, fileSize, fileHash, pageCount, nextVersion, docModelJson, docHash, now, job.id]);
  } else {
    await execute(`
      INSERT INTO generated_reports (id, report_job_id, snapshot_id, report_version, generator_version, storage_key, file_size, file_hash, page_count, document_model_json, document_hash, generated_at, created_at)
      VALUES (?, ?, ?, ?, 'jsPDF-v2', ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['rep-' + crypto.randomUUID(), job.id, job.snapshot_id, nextVersion, relativeKey, fileSize, fileHash, pageCount, docModelJson, docHash, now, now]);
  }

  // 6. Record upgrade history entry
  await execute(`
    INSERT INTO report_history (id, report_job_id, actor_user_id, action_type, safe_summary, created_at)
    VALUES (?, ?, 'system-upgrade', 'report_model_upgraded', 'Upgraded report document model to latest template version with human-operational wording.', ?)
  `, ['hist-' + crypto.randomUUID(), job.id, now]);

  return newModel;
}

export async function upgradeAllStoredReports(): Promise<number> {
  try {
    const reports = await query('SELECT gr.report_job_id, gr.document_model_json FROM generated_reports gr');
    let count = 0;
    for (const r of reports) {
      let docModel: any = null;
      try {
        docModel = r.document_model_json ? JSON.parse(r.document_model_json) : null;
      } catch (e) {
        docModel = null;
      }
      if (needsModelUpgrade(docModel)) {
        console.log(`[Report Upgrade] Upgrading stored report model for job ${r.report_job_id}...`);
        await upgradeReportRecord(r.report_job_id);
        count++;
      }
    }
    console.log(`[Report Upgrade] Upgrade check complete. ${count} reports upgraded.`);
    return count;
  } catch (err) {
    console.error('[Report Upgrade Error]', err);
    return 0;
  }
}

