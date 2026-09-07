import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildCustomEventReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const totalRegistrations = analytics.attendance.totalRegistrations || 0;
  const selectedTotal = analytics.attendance.expectedTotal || 0;
  const checkedInTotal = analytics.attendance.checkedInTotal || 0;
  const releasedTotal = analytics.attendance.releasedTotal || 0;
  const insideTotal = analytics.attendance.insideTotal || 0;
  const activeVolunteers = analytics.volunteers.activeOnDuty || 0;
  const attendanceRate = selectedTotal > 0 ? (checkedInTotal / selectedTotal) * 100 : 0;
  const releaseRate = checkedInTotal > 0 ? (releasedTotal / checkedInTotal) * 100 : 0;

  const kpis: ReportKPI[] = [
    {
      label: 'Registered',
      value: String(totalRegistrations),
      sublabel: 'Total applications',
      color: 'charcoal'
    },
    {
      label: 'Selected',
      value: String(selectedTotal),
      sublabel: 'Admitted participants',
      color: 'charcoal'
    },
    {
      label: 'Checked in',
      value: String(checkedInTotal),
      sublabel: `${attendanceRate.toFixed(0)}% of selected`,
      color: 'charcoal'
    },
    {
      label: 'Inside now',
      value: String(insideTotal),
      sublabel: 'In care rooms',
      color: 'charcoal'
    },
    {
      label: 'Picked up',
      value: String(releasedTotal),
      sublabel: `${releaseRate.toFixed(0)}% of checked-in`,
      color: 'charcoal'
    },
    {
      label: 'Volunteers',
      value: String(activeVolunteers),
      sublabel: 'On-duty supervisors',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.length === 0 || selectedSections.includes('Executive Summary') || selectedSections.includes('Custom summary')) {
    sections.push({
      id: 'custom-summary',
      title: 'Custom event operations overview',
      type: 'narrative',
      content: {
        text: `This custom report compiles operational indicators selected by the administrator for "${analytics.eventTitle}". A total of ${totalRegistrations} children registered, with ${selectedTotal} selected to attend. On event day, ${checkedInTotal} children checked in (${attendanceRate.toFixed(1)}% of selected), supported by ${activeVolunteers} on-duty supervisors. To date, ${releasedTotal} children have been securely released, while ${insideTotal} remain under care.`
      }
    });
  }

  if (selectedSections.length === 0 || selectedSections.includes('Operational Metrics')) {
    sections.push({
      id: 'custom-ops-table',
      title: 'Operational indicators',
      type: 'table',
      content: {
        headers: ['Indicator', 'Recorded value', 'Context'],
        rows: [
          ['Total registrations', `${totalRegistrations} children`, 'Intake volume'],
          ['Selected cohort', `${selectedTotal} children`, 'Admitted participants'],
          ['Checked in', `${checkedInTotal} children`, `${attendanceRate.toFixed(1)}% attendance rate`],
          ['Secure releases', `${releasedTotal} children`, `${releaseRate.toFixed(1)}% release rate`],
          ['On-duty supervisors', `${activeVolunteers} volunteers`, 'Active supervisory staff']
        ]
      }
    });
  }

  const findings: ReportFinding[] = [
    {
      id: 'cust-finding-1',
      title: 'Attendance turnout',
      observation: `${checkedInTotal} of ${selectedTotal} selected children attended the event (${attendanceRate.toFixed(1)}%).`,
      severity: 'info'
    }
  ];

  const recommendations: ReportRecommendation[] = [];
  if (insideTotal > 0) {
    recommendations.push({
      id: 'cust-rec-1',
      action: 'Confirm release status for remaining children in care rooms.',
      evidence: `${insideTotal} children remain checked in across rooms.`,
      rationale: 'Ensures full collection verification before close.',
      priority: 'high',
      responsibility: 'Pickup Lead'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'cust-rec-none',
      action: 'No immediate follow-up identified from the available event data.',
      evidence: 'All event flow records reconciled.',
      rationale: 'Standard event closure applies.',
      priority: 'low',
      responsibility: 'Event Administrator'
    });
  }

  return {
    reportId,
    templateKey: 'custom-event-report-v1',
    templateVersion: 2,
    reportTitle: 'Custom Event Report',
    reportDescription: 'Custom compiled event summary utilizing selected sections and analytical filters.',
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
    intendedAudience: 'Super Admin, Event Admin',
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
      notes: 'Custom reports compile verified snapshot data dynamically based on user selections.'
    },
    methodology: [
      'Grounded aggregation of database records matching selected filters.'
    ],
    limitations: [
      'Scope is limited to sections and filters selected at generation time.'
    ]
  };
}
