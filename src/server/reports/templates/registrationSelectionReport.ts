import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildRegistrationSelectionReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const reg = analytics.registrations || {
    totalRegistrations: analytics.attendance.totalRegistrations || 0,
    selectedTotal: analytics.attendance.expectedTotal || 0,
    underReviewTotal: 0,
    waitlistTotal: 0,
    notSelectedTotal: 0,
    selectionRate: 0,
    registrationOutcomes: [],
    registrationsByAgeGroup: [],
    medicalNotesCount: 0,
    extraSupportCount: 0,
    totalCareCount: 0
  };

  const kpis: ReportKPI[] = [
    {
      label: 'Registrations',
      value: String(reg.totalRegistrations),
      sublabel: 'Total applications received',
      color: 'charcoal'
    },
    {
      label: 'Selected',
      value: String(reg.selectedTotal),
      sublabel: 'Admitted participants',
      color: 'charcoal'
    },
    {
      label: 'Under review',
      value: String(reg.underReviewTotal),
      sublabel: 'Pending review decisions',
      color: 'charcoal'
    },
    {
      label: 'Waiting list',
      value: String(reg.waitlistTotal),
      sublabel: 'On reserve',
      color: 'charcoal'
    },
    {
      label: 'Selection rate',
      value: `${reg.selectionRate.toFixed(0)}%`,
      sublabel: 'Admitted of total demand',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  sections.push({
    id: 'reg-demand-summary',
    title: 'Registration demand & review outcomes',
    type: 'narrative',
    content: {
      text: `This report details the intake, review outcomes, and cohort distribution for "${analytics.eventTitle}". The programme received ${reg.totalRegistrations} applications. Following administrative review, ${reg.selectedTotal} children were selected (${reg.selectionRate.toFixed(0)}% selection rate), ${reg.underReviewTotal} remain under review, and ${reg.waitlistTotal} were placed on the waiting list.`
    }
  });

  sections.push({
    id: 'reg-table',
    title: 'Application resolution breakdown',
    type: 'table',
    content: {
      headers: ['Outcome status', 'Applications', 'Proportion'],
      rows: [
        ['Selected', `${reg.selectedTotal}`, `${reg.totalRegistrations > 0 ? Math.round((reg.selectedTotal / reg.totalRegistrations) * 100) : 0}%`],
        ['Awaiting review', `${reg.underReviewTotal}`, `${reg.totalRegistrations > 0 ? Math.round((reg.underReviewTotal / reg.totalRegistrations) * 100) : 0}%`],
        ['Waiting list', `${reg.waitlistTotal}`, `${reg.totalRegistrations > 0 ? Math.round((reg.waitlistTotal / reg.totalRegistrations) * 100) : 0}%`],
        ['Not selected', `${reg.notSelectedTotal}`, `${reg.totalRegistrations > 0 ? Math.round((reg.notSelectedTotal / reg.totalRegistrations) * 100) : 0}%`]
      ]
    }
  });

  const outcomeLabels = reg.registrationOutcomes.map(o => o.label);
  const outcomeValues = reg.registrationOutcomes.map(o => o.count);
  const ageLabels = Object.keys(reg.registrationsByAgeGroup || {});
  const ageValues = Object.values(reg.registrationsByAgeGroup || {});

  const charts = [];
  if (outcomeLabels.length > 0 && outcomeValues.some(v => v > 0)) {
    charts.push({
      id: 'chart-reg-outcomes',
      kind: 'horizontalBar' as const,
      title: 'Registration outcomes',
      subtitle: 'Distribution of application decisions',
      labels: outcomeLabels,
      series: [{ id: 's-reg', label: 'Applications', values: outcomeValues }],
      caption: 'Application outcomes across all submissions.',
      accessibleSummary: 'Horizontal bar chart of application review outcomes.'
    });
  }

  if (ageLabels.length > 0 && ageValues.some(v => v > 0)) {
    charts.push({
      id: 'chart-reg-age',
      kind: 'horizontalBar' as const,
      title: 'Children by age group',
      subtitle: 'Registered children across configured age cohorts',
      labels: ageLabels,
      series: [{ id: 's-age', label: 'Registered', values: ageValues }],
      caption: 'Registration demand across configured age groups.',
      accessibleSummary: 'Horizontal bar chart of registered children by age group.'
    });
  }

  if (charts.length > 0) {
    sections.push({
      id: 'reg-visualizations',
      title: 'Application & age cohort charts',
      type: 'chart',
      content: { charts }
    });
  }

  const findings: ReportFinding[] = (analytics.keyFindings || []).slice(0, 3).map((f, i) => ({
    id: `reg-finding-${i + 1}`,
    title: `Observation ${i + 1}`,
    observation: f,
    severity: 'info'
  }));

  const recommendations: ReportRecommendation[] = (analytics.managementAttention || [])
    .filter(a => a.toLowerCase().includes('review') || a.toLowerCase().includes('application') || a.toLowerCase().includes('capacity'))
    .map((rec, i) => ({
      id: `reg-rec-${i + 1}`,
      action: rec,
      evidence: 'Current intake records',
      rationale: 'Administrative follow-up item identified.',
      priority: 'medium',
      responsibility: 'Registration Lead'
    }));

  return {
    reportId,
    templateKey: 'registration-selection',
    templateVersion: 1,
    reportTitle: `${analytics.eventTitle} — Registration & Selection Report`,
    reportDescription: 'Registration demand, review outcomes, age-group distribution and selection.',
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
    intendedAudience: 'Registration Lead, Review Committee',
    reportingPeriod: {
      start: analytics.startsAt,
      end: analytics.cutoffTime
    },
    informationConfirmedUpTo: analytics.cutoffTime,
    reportVersion: 1,
    kpis,
    sections,
    findings,
    recommendations,
    managementAttention: analytics.managementAttention || [],
    dataQuality: {
      score: analytics.dataQuality.dataConfidenceScore,
      status: analytics.dataQuality.overallConfidence,
      notes: 'Authoritative data aggregation from verified database records.'
    },
    methodology: [
      'Aggregated from child event entries and review decision logs.',
      'Data minimization: Individual child and guardian identifying information excluded.'
    ],
    limitations: [
      'Figures reflect application statuses recorded at the time of report compilation.'
    ]
  };
}
