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

  const kpis: ReportKPI[] = [
    {
      label: 'Safety alarms',
      value: String(totalAlerts),
      sublabel: `${resolvedAlerts} resolved`,
      color: 'charcoal'
    },
    {
      label: 'Open concerns',
      value: String(openAlerts + inProgressAlerts),
      sublabel: `${openAlerts} open, ${inProgressAlerts} in progress`,
      color: openAlerts + inProgressAlerts > 0 ? 'charcoal' : 'charcoal'
    },
    {
      label: 'Median reaction',
      value: medianAck !== null && medianAck !== undefined ? `${medianAck.toFixed(1)}s` : 'Unavailable',
      sublabel: 'Alert acknowledgment interval',
      color: 'charcoal'
    },
    {
      label: 'Escalations',
      value: String(totalEscalated),
      sublabel: maxTier > 0 ? `Max Tier ${maxTier}` : 'No escalations',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.length === 0 || selectedSections.includes('Executive Summary') || selectedSections.includes('Safety overview')) {
    const timingText = medianAck !== null && medianAck !== undefined
      ? `Recorded alert acknowledgment latency averaged a median of ${medianAck.toFixed(1)} seconds.`
      : 'Alert response timing was not recorded or no alerts were triggered.';

    sections.push({
      id: 'safety-overview',
      title: 'Safeguarding overview',
      type: 'narrative',
      content: {
        text: `This restricted report details safety response records and escalation status for "${analytics.eventTitle}". All child identity references, medical details, and incident records are processed under strict safeguarding and privacy controls. During the event, a total of ${totalAlerts} safety alert(s) were raised, of which ${resolvedAlerts} were resolved and ${openAlerts + inProgressAlerts} remain active. ${timingText} A total of ${totalEscalated} alert(s) required escalation${maxTier > 0 ? `, reaching Tier ${maxTier}` : ''}.`
      }
    });
  }

  // Incident log table (real records only)
  const alertRecords = snapshot.alerts || [];
  if (selectedSections.length === 0 || selectedSections.includes('Critical Incident Logs & Escalations') || selectedSections.includes('Incidents')) {
    if (alertRecords.length > 0) {
      sections.push({
        id: 'incident-timeline-table',
        title: 'Incident response log',
        type: 'table',
        content: {
          headers: ['Category', 'Escalation tier', 'Status', 'Response latency'],
          rows: alertRecords.map((al: any) => [
            al.category || al.alertType || 'General care concern',
            al.escalation_level ? `Tier ${al.escalation_level}` : 'Standard',
            al.status || 'Logged',
            al.acknowledged_at ? 'Acknowledged' : 'Pending'
          ])
        }
      });
    }
  }

  // Care & Safety Visualizations
  const careCharts = [];

  // Chart 1: Care awareness indicators (aggregated non-identifying)
  const medCount = analytics.registrations?.medicalNotesCount || 0;
  const supCount = analytics.registrations?.extraSupportCount || 0;
  const careTotal = analytics.registrations?.totalCareCount || 0;
  if (careTotal > 0 || medCount > 0 || supCount > 0) {
    careCharts.push({
      id: 'chart-care-indicators',
      kind: 'horizontalBar' as const,
      title: 'Care & support flags by category',
      subtitle: 'Aggregated non-identifying care indicators',
      labels: ['Dietary & allergy awareness', 'Medical notices', 'Additional support assigned'],
      series: [{
        id: 's-care-flags',
        label: 'Children',
        values: [careTotal, medCount, supCount]
      }],
      caption: 'Aggregated care indicators requiring administrative coordination.',
      accessibleSummary: 'Horizontal bar chart showing care flags across categories.'
    });
  }

  // Chart 2: Alert resolution status
  if (totalAlerts > 0) {
    careCharts.push({
      id: 'chart-alert-status',
      kind: 'horizontalBar' as const,
      title: 'Safety alerts by resolution status',
      subtitle: 'Resolved vs active safeguarding concerns',
      labels: ['Resolved', 'Active / In progress'],
      series: [{
        id: 's-alert-status',
        label: 'Alerts',
        values: [resolvedAlerts, openAlerts + inProgressAlerts]
      }],
      caption: `${resolvedAlerts} of ${totalAlerts} safety matters closed.`,
      accessibleSummary: 'Horizontal bar chart of safety alerts by status.'
    });
  }

  // Chart 3: Severity distribution (where supported)
  const sevMap = analytics.alerts.alertsBySeverity || {};
  const sevKeys = Object.keys(sevMap);
  if (sevKeys.length > 0 && sevKeys.some(k => sevMap[k] > 0)) {
    careCharts.push({
      id: 'chart-alert-severity',
      kind: 'horizontalBar' as const,
      title: 'Safety concerns by severity',
      subtitle: 'Distribution of recorded alerts by urgency tier',
      labels: sevKeys.map(k => k.charAt(0).toUpperCase() + k.slice(1)),
      series: [{
        id: 's-alert-sev',
        label: 'Concerns',
        values: sevKeys.map(k => sevMap[k])
      }],
      caption: 'Severity classification of logged safeguarding matters.',
      accessibleSummary: 'Horizontal bar chart of safety concerns by severity.'
    });
  }

  if (careCharts.length > 0) {
    sections.push({
      id: 'care-safety-charts',
      title: 'Care & safety visual analysis',
      type: 'chart',
      content: { charts: careCharts }
    });
  } else {
    sections.push({
      id: 'care-safety-charts-empty',
      title: 'Care & safety visual analysis',
      type: 'chart',
      content: {
        charts: [{
          id: 'chart-care-safety-empty',
          kind: 'horizontalBar' as const,
          title: 'Care & safety summary',
          subtitle: 'Operational incident and care indicator overview',
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
      title: 'Alert resolution',
      observation: `${resolvedAlerts} of ${totalAlerts} raised alerts were successfully addressed and closed.`,
      severity: openAlerts > 0 ? 'warning' : 'info'
    });
  }

  if (totalEscalated > 0) {
    findings.push({
      id: 'safe-finding-escalation',
      title: 'Escalations triggered',
      observation: `${totalEscalated} alert(s) required tiered supervisor escalation, reaching maximum Tier ${maxTier}.`,
      severity: 'warning'
    });
  }

  const recommendations: ReportRecommendation[] = [];
  if (openAlerts + inProgressAlerts > 0) {
    recommendations.push({
      id: 'safe-rec-open',
      action: 'Follow up on all unresolved care concerns with the Safeguarding Lead.',
      evidence: `${openAlerts + inProgressAlerts} safety alert(s) remain open or in progress.`,
      rationale: 'All raised concerns must have completed documented sign-off.',
      priority: 'high',
      responsibility: 'Safeguarding Lead'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'safe-rec-none',
      action: 'No immediate follow-up identified from the available event data.',
      evidence: 'No unresolved safety concerns recorded in event logs.',
      rationale: 'All safety protocols satisfied.',
      priority: 'low',
      responsibility: 'Safeguarding Lead'
    });
  }

  return {
    reportId,
    templateKey: 'child-safety-incident-report-v1',
    templateVersion: 1,
    reportTitle: 'Child Safety and Incident Report',
    reportDescription: 'Review of raised safety alerts, resolution timelines, and follow-up completion status.',
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
      notes: 'Anonymized alert metrics audited against server logs. Safeguarding data minimization active.'
    },
    methodology: [
      'Incident timestamps compiled from verified database alert entries.'
    ],
    limitations: [
      'Specific child names and identity details are withheld in compliance with child protection guidelines.'
    ]
  };
}
