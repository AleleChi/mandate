import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildChildSafetyIncidentReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const openAlerts = analytics.alerts.alertsByStatus?.open || 0;
  const inProgressAlerts = analytics.alerts.alertsByStatus?.in_progress || 0;
  const resolvedAlerts = analytics.alerts.alertsByStatus?.resolved || 0;
  const totalAlerts = analytics.alerts.totalAlerts || 0;
  const totalEscalated = analytics.escalations.escalatedAlertsCount || 0;
  const maxTier = analytics.escalations.maxEscalationLevelReached || 0;
  const medianAck = analytics.alerts.medianAcknowledgementTimeSeconds;
  const careTotal = analytics.registrations?.totalCareCount || 0;
  const medCount = analytics.registrations?.medicalNotesCount || 0;
  const supCount = analytics.registrations?.extraSupportCount || 0;

  const kpis: ReportKPI[] = [
    {
      label: 'Safety notices',
      value: String(totalAlerts),
      sublabel: `${resolvedAlerts} resolved`,
      color: 'charcoal'
    },
    {
      label: 'Open concerns',
      value: String(openAlerts + inProgressAlerts),
      sublabel: `${openAlerts} open, ${inProgressAlerts} in progress`,
      color: 'charcoal'
    },
    {
      label: 'Care records',
      value: String(careTotal),
      sublabel: 'Special care noted',
      color: 'charcoal'
    },
    {
      label: 'Dietary & medical',
      value: String(medCount),
      sublabel: 'Kitchen/allergy awareness',
      color: 'charcoal'
    },
    {
      label: 'Support requests',
      value: String(supCount),
      sublabel: 'Assigned helpers',
      color: 'charcoal'
    },
    {
      label: 'Escalations',
      value: String(totalEscalated),
      sublabel: maxTier > 0 ? `Max Tier ${maxTier}` : 'None recorded',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.length === 0 || 
      selectedSections.includes('Executive Summary') || 
      selectedSections.includes('Executive summary') ||
      selectedSections.includes('What this report shows') ||
      selectedSections.includes('Safety overview') ||
      selectedSections.includes('Care & safety') ||
      selectedSections.includes('Care & safety summary')) {
    const timingText = medianAck !== null && medianAck !== undefined
      ? `On average, our team acknowledged safety notifications in a median of ${medianAck.toFixed(0)} seconds.`
      : 'No response timing was recorded or no alerts were triggered.';

    sections.push({
      id: 'safety-overview',
      title: 'What this report shows',
      type: 'narrative',
      content: {
        text: `This safeguarding report summarizes care notices, medical alerts, and safety items recorded for "${analytics.eventTitle}". All child identity references, medical details, and incident records are processed with strict confidentiality to protect children and families.\n\nDuring the event, a total of ${totalAlerts} safety notices were logged, of which ${resolvedAlerts} were resolved and ${openAlerts + inProgressAlerts} remain active. ${timingText} A total of ${totalEscalated} item(s) were escalated to senior coordinators.`
      }
    });
  }

  // Incident log table (real records only)
  const alertRecords = snapshot.alerts || [];
  if (selectedSections.length === 0 || selectedSections.includes('Critical Incident Logs & Escalations') || selectedSections.includes('Incidents')) {
    if (alertRecords.length > 0) {
      sections.push({
        id: 'incident-timeline-table',
        title: 'Safety and care response log',
        type: 'table',
        content: {
          headers: ['Category', 'Escalation tier', 'Status', 'Response status'],
          rows: alertRecords.map((al: any) => [
            al.category || al.alertType || 'General care notice',
            al.escalation_level ? `Tier ${al.escalation_level}` : 'Standard',
            al.status || 'Logged',
            al.acknowledged_at ? 'Acknowledged' : 'Pending'
          ]),
          caption: 'Anonymized response records captured during the event.'
        }
      });
    }
  }

  // Care & Safety Visualizations
  const careCharts = [];

  // Chart 1: Donut Chart - Alert resolution status
  if (totalAlerts > 0) {
    careCharts.push({
      id: 'chart-alert-status',
      kind: 'donut' as const,
      title: 'Safety Notices by Status',
      subtitle: 'Resolved versus active safeguarding concerns',
      labels: ['Resolved', 'In progress', 'Open'],
      series: [{
        id: 's-alert-status',
        label: 'Notices',
        values: [resolvedAlerts, inProgressAlerts, openAlerts]
      }],
      caption: `${resolvedAlerts} of ${totalAlerts} safety matters closed.`,
      accessibleSummary: 'Donut chart of safety notices by status.'
    });
  }

  // Chart 2: Care awareness indicators (aggregated non-identifying)
  if (careTotal > 0 || medCount > 0 || supCount > 0) {
    careCharts.push({
      id: 'chart-care-indicators',
      kind: 'horizontalBar' as const,
      title: 'Care & Support Notices by Category',
      subtitle: 'Aggregated care indicators submitted by parents',
      labels: ['Dietary & allergy awareness', 'Medical notices', 'Additional support requested'],
      series: [{
        id: 's-care-flags',
        label: 'Children',
        values: [careTotal, medCount, supCount]
      }],
      caption: 'Aggregated care indicators requiring coordinator attention.',
      accessibleSummary: 'Horizontal bar chart showing care flags across categories.'
    });
  }

  // Chart 3: Severity distribution (where supported)
  const sevMap = analytics.alerts.alertsBySeverity || {};
  const sevKeys = Object.keys(sevMap);
  if (sevKeys.length > 0 && sevKeys.some(k => sevMap[k] > 0)) {
    careCharts.push({
      id: 'chart-alert-severity',
      kind: 'bar' as const,
      title: 'Safety Concerns by Urgency',
      subtitle: 'Distribution of recorded items by urgency level',
      labels: sevKeys.map(k => k.charAt(0).toUpperCase() + k.slice(1)),
      series: [{
        id: 's-alert-sev',
        label: 'Concerns',
        values: sevKeys.map(k => sevMap[k])
      }],
      caption: 'Urgency classification of logged safeguarding matters.',
      accessibleSummary: 'Bar chart of safety concerns by urgency.'
    });
  }

  if (careCharts.length > 0) {
    sections.push({
      id: 'care-safety-charts',
      title: 'Care and safety visual summary',
      type: 'chart',
      content: { charts: careCharts }
    });
  } else {
    sections.push({
      id: 'care-safety-charts-empty',
      title: 'Care and safety visual summary',
      type: 'chart',
      content: {
        charts: [{
          id: 'chart-care-safety-empty',
          kind: 'horizontalBar' as const,
          title: 'Care & safety summary',
          subtitle: 'Care indicator overview',
          labels: [],
          series: [],
          emptyState: 'No safety incidents or emergency alarms were recorded for this event.'
        }]
      }
    });
  }

  const findings: ReportFinding[] = [];
  if (totalAlerts === 0) {
    findings.push({
      id: 'safe-finding-clean',
      title: 'Zero safety alerts',
      observation: 'No safety incidents or emergency alarms were triggered during the event.',
      severity: 'info'
    });
  } else {
    findings.push({
      id: 'safe-finding-resolution',
      title: 'Notice resolution',
      observation: `${resolvedAlerts} of ${totalAlerts} logged safety notices were successfully addressed and resolved.`,
      severity: openAlerts > 0 ? 'warning' : 'info'
    });
  }

  if (totalEscalated > 0) {
    findings.push({
      id: 'safe-finding-escalation',
      title: 'Escalations required',
      observation: `${totalEscalated} notice(s) required coordinator escalation, reaching maximum Tier ${maxTier}.`,
      severity: 'warning'
    });
  }

  const recommendations: ReportRecommendation[] = [];
  if (openAlerts + inProgressAlerts > 0) {
    recommendations.push({
      id: 'safe-rec-open',
      action: 'Follow up on all unresolved care concerns with the Safeguarding Lead before event close.',
      evidence: `${openAlerts + inProgressAlerts} safety notice(s) remain open or in progress.`,
      rationale: 'All open concerns must be followed up and documented.',
      priority: 'high',
      responsibility: 'Safeguarding Lead'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'safe-rec-none',
      action: 'No immediate follow-up required from the available event data.',
      evidence: 'No unresolved safety concerns recorded in event logs.',
      rationale: 'All safety protocols satisfied.',
      priority: 'low',
      responsibility: 'Safeguarding Lead'
    });
  }

  return {
    reportId,
    templateKey: 'child-safety-incident-report-v1',
    templateVersion: 2,
    reportTitle: 'Child Care and Safety Report',
    reportDescription: 'Review of care notices, medical alerts, and safety follow-up for the event.',
    eventContext: {
      eventId: analytics.eventId,
      eventTitle: analytics.eventTitle,
      startsAt: analytics.startsAt
    },
    branding: {
      organizationName: 'Koinonia Global',
      primaryColor: [197, 155, 39],
      secondaryColor: [39, 39, 42]
    },
    privacyClassification: privacyLevel,
    intendedAudience: 'Super Admin, Safeguarding Lead',
    reportingPeriod: {
      start: analytics.startsAt,
      end: analytics.cutoffTime
    },
    informationConfirmedUpTo: analytics.cutoffTime,
    reportVersion: snapshot.version || snapshot.report_version || 1,
    kpis,
    sections,
    findings,
    recommendations,
    dataQuality: {
      score: analytics.dataQuality.dataConfidenceScore,
      status: analytics.dataQuality.overallConfidence,
      notes: 'Anonymized alert metrics audited against server logs. Safeguarding confidentiality active.'
    },
    methodology: [
      'Safety notice timestamps are compiled from verified event log entries.'
    ],
    limitations: [
      'Specific child names and medical details are withheld to protect children and families.'
    ]
  };
}
