import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildAlertEscalationReport(
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
  const ackRate = totalAlerts > 0 ? (resolvedAlerts / totalAlerts) * 100 : 100;

  const kpis: ReportKPI[] = [
    {
      label: 'Total alerts',
      value: String(totalAlerts),
      sublabel: `${resolvedAlerts} resolved`,
      color: 'charcoal'
    },
    {
      label: 'Median response',
      value: medianAck !== null && medianAck !== undefined ? `${medianAck.toFixed(1)}s` : 'Unavailable',
      sublabel: 'Time to acknowledge alert',
      color: 'charcoal'
    },
    {
      label: 'Escalations',
      value: String(totalEscalated),
      sublabel: maxTier > 0 ? `Max Tier ${maxTier}` : 'No escalations',
      color: 'charcoal'
    },
    {
      label: 'Resolution rate',
      value: `${ackRate.toFixed(0)}%`,
      sublabel: `${resolvedAlerts} of ${totalAlerts} closed`,
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.length === 0 || selectedSections.includes('Executive Summary') || selectedSections.includes('Alert summary')) {
    const timingSentence = medianAck !== null && medianAck !== undefined
      ? `Median response latency was measured at ${medianAck.toFixed(1)} seconds.`
      : 'Response latency was not recorded or no alerts occurred.';

    sections.push({
      id: 'escalation-summary',
      title: 'Alert response and escalation overview',
      type: 'narrative',
      content: {
        text: `This safeguarding audit reviews response times and escalation chains for "${analytics.eventTitle}". Response staff handled ${totalAlerts} safety alerts, with ${resolvedAlerts} resolved (${ackRate.toFixed(1)}% resolution rate). ${timingSentence} A total of ${totalEscalated} alert(s) escalated to senior roles.`
      }
    });
  }

  // Alert escalation log (real records only)
  const alerts = snapshot.alerts || [];
  if (selectedSections.length === 0 || selectedSections.includes('Critical Incident Logs & Escalations') || selectedSections.includes('Alerts log')) {
    if (alerts.length > 0) {
      sections.push({
        id: 'escalation-timeline-table',
        title: 'Alert escalation log',
        type: 'table',
        content: {
          headers: ['Category', 'Tier', 'Status', 'Logged at'],
          rows: alerts.map((al: any) => [
            al.category || al.alertType || 'Care concern',
            al.escalation_level ? `Tier ${al.escalation_level}` : 'Standard',
            al.status || 'Active',
            al.created_at ? new Date(al.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Logged'
          ])
        }
      });
    }
  }

  const findings: ReportFinding[] = [];
  if (totalAlerts === 0) {
    findings.push({
      id: 'esc-finding-none',
      title: 'Zero alerts triggered',
      observation: 'No safety alarms or emergency alerts were activated during this event period.',
      severity: 'info'
    });
  } else if (medianAck !== null && medianAck !== undefined) {
    findings.push({
      id: 'esc-finding-timing',
      title: 'Response latency',
      observation: `Emergency alerts recorded a median acknowledgment latency of ${medianAck.toFixed(1)} seconds.`,
      severity: medianAck <= 45 ? 'info' : 'warning'
    });
  }

  const recommendations: ReportRecommendation[] = [];
  if (openAlerts + inProgressAlerts > 0) {
    recommendations.push({
      id: 'esc-rec-open',
      action: 'Complete review of all outstanding active safety alerts.',
      evidence: `${openAlerts + inProgressAlerts} alert(s) remain open or in progress.`,
      rationale: 'Every raised alert requires formal closure sign-off.',
      priority: 'high',
      responsibility: 'Safeguarding Lead'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'esc-rec-none',
      action: 'No immediate follow-up identified from the available event data.',
      evidence: 'All raised alerts resolved or no alerts triggered.',
      rationale: 'Alert management standards satisfied.',
      priority: 'low',
      responsibility: 'Safeguarding Lead'
    });
  }

  return {
    reportId,
    templateKey: 'alert-response-escalation-report-v1',
    templateVersion: 2,
    reportTitle: 'Alert Response and Escalation Report',
    reportDescription: 'Timeline of safety alerts, median response intervals, and escalation tier records.',
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
    reportVersion: 2,
    kpis,
    sections,
    findings,
    recommendations,
    dataQuality: {
      score: analytics.dataQuality.dataConfidenceScore,
      status: analytics.dataQuality.overallConfidence,
      notes: 'Alert metrics compiled from verified event database logs.'
    },
    methodology: [
      'Measurement of alert creation and acknowledgment timestamps.'
    ],
    limitations: [
      'Latencies reflect digital terminal interaction timestamps.'
    ]
  };
}
