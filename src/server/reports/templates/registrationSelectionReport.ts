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
      label: 'Applications received',
      value: String(reg.totalRegistrations),
      sublabel: 'Total registrations',
      color: 'charcoal'
    },
    {
      label: 'Selected',
      value: String(reg.selectedTotal),
      sublabel: 'Invited to attend',
      color: 'charcoal'
    },
    {
      label: 'Waiting for review',
      value: String(reg.underReviewTotal),
      sublabel: 'Awaiting decision',
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
      sublabel: 'Of total applications',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  sections.push({
    id: 'reg-demand-summary',
    title: 'What this report shows',
    type: 'narrative',
    content: {
      text: `This report outlines application demand, review decisions, and age group breakdown for "${analytics.eventTitle}". It shows how many families applied, who has been selected to attend, who is on the waiting list, and which applications are still awaiting review.\n\nThe ministry received ${reg.totalRegistrations} applications. Following administrative review, ${reg.selectedTotal} children were selected (${reg.selectionRate.toFixed(0)}% selection rate), ${reg.underReviewTotal} applications are waiting for review, and ${reg.waitlistTotal} children were placed on the waiting list.`
    }
  });

  sections.push({
    id: 'reg-table',
    title: 'Application review summary',
    type: 'table',
    content: {
      headers: ['Review decision', 'Applications', 'Share of demand'],
      rows: [
        ['Selected', `${reg.selectedTotal}`, `${reg.totalRegistrations > 0 ? Math.round((reg.selectedTotal / reg.totalRegistrations) * 100) : 0}%`],
        ['Waiting for review', `${reg.underReviewTotal}`, `${reg.totalRegistrations > 0 ? Math.round((reg.underReviewTotal / reg.totalRegistrations) * 100) : 0}%`],
        ['Waiting list', `${reg.waitlistTotal}`, `${reg.totalRegistrations > 0 ? Math.round((reg.waitlistTotal / reg.totalRegistrations) * 100) : 0}%`],
        ['Not selected', `${reg.notSelectedTotal}`, `${reg.totalRegistrations > 0 ? Math.round((reg.notSelectedTotal / reg.totalRegistrations) * 100) : 0}%`]
      ]
    }
  });

  const ageLabels = Object.keys(reg.registrationsByAgeGroup || {});
  const ageValues = Object.values(reg.registrationsByAgeGroup || {});

  const charts = [];

  // Chart 1: Donut Chart - Review decisions distribution
  charts.push({
    id: 'chart-reg-outcomes',
    kind: 'donut' as const,
    title: 'Application Review Decisions',
    subtitle: 'Selected, waiting for review, waiting list, and not selected',
    labels: ['Selected', 'Waiting for review', 'Waiting list', 'Not selected'],
    series: [{
      id: 's-reg-decisions',
      label: 'Applications',
      values: [reg.selectedTotal, reg.underReviewTotal, reg.waitlistTotal, reg.notSelectedTotal]
    }],
    caption: 'Distribution of application decisions across all submissions.',
    accessibleSummary: 'Donut chart showing breakdown of application decisions.'
  });

  // Chart 2: Horizontal Bar Chart - Demand by age group
  if (ageLabels.length > 0 && ageValues.some(v => v > 0)) {
    charts.push({
      id: 'chart-reg-age',
      kind: 'horizontalBar' as const,
      title: 'Applications by Age Group',
      subtitle: 'Total applications received across age cohorts',
      labels: ageLabels,
      series: [{ id: 's-age', label: 'Applications', values: ageValues }],
      caption: 'Registration demand across configured age cohorts.',
      accessibleSummary: 'Horizontal bar chart of applications by age group.'
    });
  }

  // Chart 3: Bar Chart - Care & Support requests
  if (reg.totalCareCount > 0 || reg.medicalNotesCount > 0 || reg.extraSupportCount > 0) {
    charts.push({
      id: 'chart-reg-care',
      kind: 'bar' as const,
      title: 'Care & Support Requests',
      subtitle: 'Applications with dietary, medical, or support notices',
      labels: ['Dietary awareness', 'Medical notices', 'Additional support'],
      series: [{
        id: 's-care-flags',
        label: 'Children',
        values: [reg.totalCareCount, reg.medicalNotesCount, reg.extraSupportCount]
      }],
      caption: 'Aggregated care notices submitted during registration.',
      accessibleSummary: 'Bar chart showing care and support requests.'
    });
  }

  if (charts.length > 0) {
    sections.push({
      id: 'reg-visualizations',
      title: 'Registration and cohort breakdown',
      type: 'chart',
      content: { charts }
    });
  } else {
    sections.push({
      id: 'reg-visualizations-empty',
      title: 'Registration and cohort breakdown',
      type: 'chart',
      content: {
        charts: [{
          id: 'chart-reg-empty',
          kind: 'horizontalBar' as const,
          title: 'Registration summary',
          subtitle: 'Application review and cohort demand',
          labels: [],
          series: [],
          emptyState: 'No registration demand or cohort distribution recorded for this event.'
        }]
      }
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
      evidence: 'Current registration intake records',
      rationale: 'Administrative follow-up item identified.',
      priority: 'medium',
      responsibility: 'Registration Lead'
    }));

  return {
    reportId,
    templateKey: 'registration-selection',
    templateVersion: 2,
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
    reportVersion: snapshot.version || snapshot.report_version || 1,
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
