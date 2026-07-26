import { ReportDocumentModel } from './reportDocumentModel';
import { ComprehensiveAnalytics } from '../services/reportAnalyticsService';

// Import builders
import { buildEventExecutiveReport } from './templates/eventExecutiveReport';
import { buildAttendanceDemographicsReport } from './templates/attendanceDemographicsReport';
import { buildChildSafetyIncidentReport } from './templates/childSafetyIncidentReport';
import { buildVolunteerTeamReport } from './templates/volunteerTeamReport';
import { buildAlertEscalationReport } from './templates/alertEscalationReport';
import { buildLocationCapacityReport } from './templates/locationCapacityReport';
import { buildPickupReleaseReport } from './templates/pickupReleaseReport';
import { buildOfflineResilienceReport } from './templates/offlineResilienceReport';
import { buildTrainingDrillReport } from './templates/trainingDrillReport';
import { buildCustomEventReport } from './templates/customEventReport';

export type ReportTemplateBuilder = (
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
) => ReportDocumentModel;

export const TEMPLATE_BUILDER_REGISTRY: Record<string, ReportTemplateBuilder> = {
  'event-executive-report-v1': buildEventExecutiveReport,
  'attendance-demographics-report-v1': buildAttendanceDemographicsReport,
  'child-safety-incident-report-v1': buildChildSafetyIncidentReport,
  'volunteer-team-performance-report-v1': buildVolunteerTeamReport,
  'alert-response-escalation-report-v1': buildAlertEscalationReport,
  'location-capacity-report-v1': buildLocationCapacityReport,
  'pickup-secure-release-report-v1': buildPickupReleaseReport,
  'offline-resilience-report-v1': buildOfflineResilienceReport,
  'training-drill-report-v1': buildTrainingDrillReport,
  'custom-event-report-v1': buildCustomEventReport,

  // Legacy key aliases for historical report records
  'event_executive_summary': buildEventExecutiveReport,
  'event-executive-summary': buildEventExecutiveReport,
  'attendance_demographics': buildAttendanceDemographicsReport,
  'attendance-demographics': buildAttendanceDemographicsReport,
  'child_safety_incident': buildChildSafetyIncidentReport,
  'child-safety-incident': buildChildSafetyIncidentReport,
  'volunteer_team_performance': buildVolunteerTeamReport,
  'volunteer-team-performance': buildVolunteerTeamReport,
  'alert_response_escalation': buildAlertEscalationReport,
  'alert-response-escalation': buildAlertEscalationReport,
  'location_capacity': buildLocationCapacityReport,
  'location-capacity': buildLocationCapacityReport,
  'pickup_secure_release': buildPickupReleaseReport,
  'pickup-secure-release': buildPickupReleaseReport,
  'offline_resilience': buildOfflineResilienceReport,
  'offline-resilience': buildOfflineResilienceReport,
  'training_drill': buildTrainingDrillReport,
  'training-drill': buildTrainingDrillReport,
  'custom_event': buildCustomEventReport,
  'custom-event': buildCustomEventReport
};

export function compileReportDocument(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  templateKey: string,
  privacyLevel: string,
  sections?: string[]
): ReportDocumentModel {
  const builder = TEMPLATE_BUILDER_REGISTRY[templateKey];
  if (!builder) {
    throw new Error(`Report template "${templateKey}" is not registered in the canonical registry.`);
  }

  // Fallback to all recommended sections if none specified
  const templateConfig = snapshot.template_config || {};
  const activeSections = sections && sections.length > 0 
    ? sections 
    : templateConfig.recommendedSections || ['Executive Summary', 'Operational Metrics', 'Recommended actions'];

  // Development logging requested by pipeline hardening specs:
  console.log(`REPORT TEMPLATE SELECTED: ${templateKey}`);
  console.log(`REPORT BUILDER EXECUTED: ${builder.name}`);
  console.log(`REPORT SECTIONS GENERATED: ${activeSections.join(', ')}`);

  return builder(reportId, snapshot, analytics, privacyLevel, activeSections);
}
