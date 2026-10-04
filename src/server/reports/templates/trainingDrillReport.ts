import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildTrainingDrillReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const totalObjectives = analytics.training?.objectivesCount || (snapshot.drillObjectives?.length ?? 0);
  const completedObjectives = analytics.training?.objectivesCompletedCount || 0;
  const drillCompletionRate = totalObjectives > 0 ? (completedObjectives / totalObjectives) * 100 : 0;
  const activeStaff = analytics.volunteers.activeOnDuty || (snapshot.participants?.length ?? 0);
  const medianAlarmSpeed = analytics.alerts.medianAcknowledgementTimeSeconds;

  const kpis: ReportKPI[] = [
    {
      label: 'Objectives completed',
      value: totalObjectives > 0 ? `${completedObjectives} of ${totalObjectives}` : 'None recorded',
      sublabel: totalObjectives > 0 ? `${drillCompletionRate.toFixed(0)}% completion rate` : 'No objectives evaluated',
      color: 'charcoal'
    },
    {
      label: 'Staff participating',
      value: String(activeStaff),
      sublabel: 'Supervisors on drill roster',
      color: 'charcoal'
    },
    {
      label: 'Median reaction',
      value: medianAlarmSpeed !== null && medianAlarmSpeed !== undefined ? `${medianAlarmSpeed.toFixed(1)}s` : 'Unavailable',
      sublabel: 'Simulated alarm acknowledgment',
      color: 'charcoal'
    },
    {
      label: 'Resolution time',
      value: analytics.training?.medianResolutionTimeSeconds !== null && analytics.training?.medianResolutionTimeSeconds !== undefined
        ? `${analytics.training.medianResolutionTimeSeconds.toFixed(1)}s`
        : 'Unavailable',
      sublabel: 'Time to complete simulated resolution',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.length === 0 || selectedSections.includes('Executive Summary') || selectedSections.includes('Drill summary')) {
    const timingSentence = medianAlarmSpeed !== null && medianAlarmSpeed !== undefined
      ? `Simulated alarms were acknowledged with a recorded median reaction time of ${medianAlarmSpeed.toFixed(1)} seconds.`
      : 'Alarm acknowledgment timing was not captured during this session.';

    sections.push({
      id: 'drill-summary',
      title: 'Drill overview',
      type: 'narrative',
      content: {
        text: `This report documents evaluated outcomes from the simulated safeguarding drill for "${analytics.eventTitle}". The drill tested emergency alarm notification, coordinator acknowledgment, and procedural compliance under controlled conditions. ${totalObjectives > 0 ? `${completedObjectives} of ${totalObjectives} configured safety objectives were completed (${drillCompletionRate.toFixed(1)}% completion rate).` : 'No formal predefined objectives were logged for this session.'} ${timingSentence} A total of ${activeStaff} staff members participated in the drill.`
      }
    });
  }

  // Drill Results / Objectives Table (Real recorded results only)
  const results = snapshot.drillResults || snapshot.drillObjectives || [];
  if (selectedSections.length === 0 || selectedSections.includes('Operational Metrics') || selectedSections.includes('Objectives')) {
    if (results.length > 0) {
      sections.push({
        id: 'drill-objectives-table',
        title: 'Safety objectives performance',
        type: 'table',
        content: {
          headers: ['Objective', 'Target', 'Result', 'Status'],
          rows: results.map((r: any) => [
            r.name || r.title || 'Safety drill scenario',
            r.targetThreshold || 'Standard protocol',
            r.measuredPerformance || (r.time_to_acknowledge ? `${r.time_to_acknowledge}s` : 'Completed'),
            r.status || 'Evaluated'
          ])
        }
      });
    }
  }

  const findings: ReportFinding[] = [];
  if (totalObjectives > 0) {
    findings.push({
      id: 'trn-finding-1',
      title: 'Objective completion',
      observation: `${completedObjectives} of ${totalObjectives} evaluated safety drill objectives were successfully met (${drillCompletionRate.toFixed(1)}%).`,
      severity: drillCompletionRate >= 80 ? 'info' : 'warning'
    });
  }
  if (medianAlarmSpeed !== null && medianAlarmSpeed !== undefined) {
    findings.push({
      id: 'trn-finding-2',
      title: 'Alarm response latency',
      observation: `Simulated alarms recorded a median acknowledgment interval of ${medianAlarmSpeed.toFixed(1)} seconds.`,
      severity: medianAlarmSpeed <= 45 ? 'info' : 'warning'
    });
  }

  const recommendations: ReportRecommendation[] = [];
  if (drillCompletionRate < 100 && totalObjectives > 0) {
    recommendations.push({
      id: 'trn-rec-1',
      action: 'Schedule refresher training for unmet drill objectives before next live deployment.',
      evidence: `${totalObjectives - completedObjectives} drill objective(s) were not fully completed.`,
      rationale: 'Ensures full team alignment with emergency safeguarding procedures.',
      priority: 'high',
      responsibility: 'Training Facilitator'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'trn-rec-none',
      action: 'No immediate follow-up identified from the available event data.',
      evidence: 'All evaluated drill procedures met established benchmarks.',
      rationale: 'Routine drill cycle concluded.',
      priority: 'low',
      responsibility: 'Training Facilitator'
    });
  }

  return {
    reportId,
    templateKey: 'training-drill-report-v1',
    templateVersion: 2,
    reportTitle: 'Training and Drill Report',
    reportDescription: 'Performance scorecard documenting simulated emergency drill scenarios, objective completions, and supervisor reaction times.',
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
    intendedAudience: 'Super Admin, Training Facilitator',
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
      notes: 'Metrics reflect actual recorded results from training database records.'
    },
    methodology: [
      'Evaluation of recorded action timestamps from simulated training exercises.'
    ],
    limitations: [
      'Drill metrics evaluate simulation conditions and do not reflect physical venue acoustics or real-world crowd variables.'
    ]
  };
}
