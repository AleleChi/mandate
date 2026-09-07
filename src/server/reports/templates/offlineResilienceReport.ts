import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildOfflineResilienceReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const reconciledCount = analytics.offline.confirmedQueuedCount || 0;
  const queuedActionsCount = analytics.offline.queuedActionsCount || 0;
  const disconnectionsCount = analytics.offline.totalInterruptions || 0;
  const averageSyncLatency = analytics.offline.averageOfflineDurationSeconds;

  const kpis: ReportKPI[] = [
    {
      label: 'Queued scans',
      value: String(queuedActionsCount),
      sublabel: `${reconciledCount} reconciled`,
      color: 'charcoal'
    },
    {
      label: 'Sync duration',
      value: averageSyncLatency !== null && averageSyncLatency !== undefined
        ? `${averageSyncLatency.toFixed(1)}s`
        : 'Unavailable',
      sublabel: averageSyncLatency !== null && averageSyncLatency !== undefined
        ? 'Average recorded sync latency'
        : 'Duration not recorded in database',
      color: 'charcoal'
    },
    {
      label: 'Reconciliation rate',
      value: queuedActionsCount > 0 
        ? `${((reconciledCount / queuedActionsCount) * 100).toFixed(0)}%` 
        : '100%',
      sublabel: 'Conflict resolution success rate',
      color: 'charcoal'
    },
    {
      label: 'Network interruptions',
      value: String(disconnectionsCount),
      sublabel: 'Recorded reconnection cycles',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.length === 0 || selectedSections.includes('Executive Summary') || selectedSections.includes('Resilience overview')) {
    const durationText = averageSyncLatency !== null && averageSyncLatency !== undefined
      ? `Recorded sync transmission latency averaged ${averageSyncLatency.toFixed(1)} seconds.`
      : 'Specific offline connection durations were not tracked in system records.';

    sections.push({
      id: 'resilience-summary',
      title: 'Connectivity and offline resilience overview',
      type: 'narrative',
      content: {
        text: `This report evaluates terminal connectivity, offline data buffering, and central synchronization for "${analytics.eventTitle}". On-duty devices recorded ${queuedActionsCount} transactions buffered locally during temporary connection drops, with ${reconciledCount} successfully reconciled upon reconnect. ${durationText} A total of ${disconnectionsCount} network interruption cycle(s) were logged.`
      }
    });
  }

  // Device sync summary (real records only — no dummy Terminal #12 / #14 rows)
  const deviceSyncs = snapshot.deviceSyncs || snapshot.syncRecords || [];
  if (selectedSections.length === 0 || selectedSections.includes('Safeguarding Audits & Device Readiness') || selectedSections.includes('Sync records')) {
    if (deviceSyncs.length > 0) {
      sections.push({
        id: 'resilience-table',
        title: 'Terminal synchronization log',
        type: 'table',
        content: {
          headers: ['Terminal identifier', 'Queued scans', 'Reconciled', 'Status'],
          rows: deviceSyncs.map((ds: any) => [
            ds.deviceId || ds.device_identifier || 'Terminal scanner',
            `${ds.queueSize || ds.queued_count || 0} scans`,
            `${ds.reconciledCount || ds.reconciled_count || 0} reconciled`,
            ds.status || 'Active'
          ])
        }
      });
    }
  }

  const findings: ReportFinding[] = [
    {
      id: 'res-finding-1',
      title: 'Offline transaction preservation',
      observation: `${reconciledCount} of ${queuedActionsCount || reconciledCount} buffered transactions were successfully committed to central records without data loss.`,
      severity: 'info'
    }
  ];

  if (disconnectionsCount > 5) {
    findings.push({
      id: 'res-finding-2',
      title: 'Elevated reconnect frequency',
      observation: `${disconnectionsCount} network reconnection cycles were recorded during event operations.`,
      severity: 'warning'
    });
  }

  const recommendations: ReportRecommendation[] = [];
  if (disconnectionsCount > 5) {
    recommendations.push({
      id: 'res-rec-1',
      action: 'Evaluate venue Wi-Fi access point placement and signal coverage.',
      evidence: `${disconnectionsCount} network drop cycles occurred during the event.`,
      rationale: 'Reduces terminal reconnection retries during peak check-in periods.',
      priority: 'medium',
      responsibility: 'Technical Lead'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'res-rec-none',
      action: 'No immediate follow-up identified from the available event data.',
      evidence: 'Offline data caching and server reconciliation functioned normally.',
      rationale: 'Terminal synchronisation standards maintained.',
      priority: 'low',
      responsibility: 'Technical Lead'
    });
  }

  return {
    reportId,
    templateKey: 'offline-resilience-report-v1',
    templateVersion: 2,
    reportTitle: 'Connectivity and Offline Resilience Report',
    reportDescription: 'Evaluates network interruptions, offline scan queuing, outbox sync completion, and database reconciliation.',
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
    intendedAudience: 'Super Admin, Technical Lead',
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
      notes: 'Synchronization records compiled from terminal outbox logs.'
    },
    methodology: [
      'Verification of local client database transactions and server confirmation timestamps.'
    ],
    limitations: [
      'Offline duration is tracked only when devices record explicit disconnection and reconnection timestamps.'
    ]
  };
}
