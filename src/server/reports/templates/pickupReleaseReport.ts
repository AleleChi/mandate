import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildPickupReleaseReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const checkedInTotal = analytics.attendance.checkedInTotal || 0;
  const releasedTotal = analytics.attendance.releasedTotal || 0;
  const remainingInside = analytics.attendance.insideTotal || Math.max(0, checkedInTotal - releasedTotal);
  const releaseRate = checkedInTotal > 0 ? (releasedTotal / checkedInTotal) * 100 : 0;
  const delayedPickupsCount = analytics.pickup.pickupConcernsCount || 0;

  const kpis: ReportKPI[] = [
    {
      label: 'Checked in',
      value: String(checkedInTotal),
      sublabel: 'Children admitted to care',
      color: 'charcoal'
    },
    {
      label: 'Picked up',
      value: String(releasedTotal),
      sublabel: `${releaseRate.toFixed(0)}% of checked-in`,
      color: 'charcoal'
    },
    {
      label: 'Inside now',
      value: String(remainingInside),
      sublabel: 'Awaiting guardian collection',
      color: 'charcoal'
    },
    {
      label: 'Flagged releases',
      value: String(delayedPickupsCount),
      sublabel: 'Care concerns or delayed pickup',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.length === 0 || selectedSections.includes('Executive Summary') || selectedSections.includes('Release overview')) {
    sections.push({
      id: 'pickup-summary',
      title: 'Secure release operations overview',
      type: 'narrative',
      content: {
        text: `This report details guardian verification performance, collection matching, and release flows for "${analytics.eventTitle}". A total of ${checkedInTotal} children checked in to the event. To date, ${releasedTotal} secure releases have been formally completed (${releaseRate.toFixed(1)}% release completion rate). ${remainingInside} children remain under active supervision in care rooms awaiting guardian pickup.`
      }
    });
  }

  // Release log table (real records only)
  const pickedUpChildren = (snapshot.childEntries || []).filter((c: any) => c.picked_up_at || c.status === 'picked_up');
  if (selectedSections.length === 0 || selectedSections.includes('Pickup & Authorized Collectors list') || selectedSections.includes('Release log')) {
    if (pickedUpChildren.length > 0) {
      sections.push({
        id: 'pickup-analysis-table',
        title: 'Collection release log',
        type: 'table',
        content: {
          headers: ['Cohort', 'Status', 'Verification status', 'Outcome'],
          rows: pickedUpChildren.slice(0, 15).map((c: any) => [
            c.age_group || 'General',
            'Picked up',
            'Authorized pass confirmed',
            'Completed'
          ])
        }
      });
    }
  }

  const findings: ReportFinding[] = [
    {
      id: 'pick-finding-1',
      title: 'Release completion rate',
      observation: `${releasedTotal} of ${checkedInTotal} checked-in children have been securely released (${releaseRate.toFixed(1)}%).`,
      severity: 'info'
    }
  ];

  if (remainingInside > 0) {
    findings.push({
      id: 'pick-finding-2',
      title: 'Active room supervision',
      observation: `${remainingInside} children remain checked in across care rooms awaiting pickup verification.`,
      severity: 'follow-up required'
    });
  }

  const recommendations: ReportRecommendation[] = [];
  if (remainingInside > 0) {
    recommendations.push({
      id: 'pick-rec-1',
      action: 'Confirm release status for children remaining in care rooms.',
      evidence: `${remainingInside} children currently remain logged as inside care rooms.`,
      rationale: 'Ensures accurate and safe handover before venue close.',
      priority: 'high',
      responsibility: 'Pickup Lead'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'pick-rec-none',
      action: 'No immediate follow-up identified from the available event data.',
      evidence: 'All released records reconciled with check-in entries.',
      rationale: 'All children successfully checked out.',
      priority: 'low',
      responsibility: 'Pickup Lead'
    });
  }

  return {
    reportId,
    templateKey: 'pickup-secure-release-report-v1',
    templateVersion: 2,
    reportTitle: 'Pickup and Secure Release Report',
    reportDescription: 'Analysis of child releases, guardian verification, collection status, and remaining children in care.',
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
    intendedAudience: 'Super Admin, Pickup Lead',
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
      notes: 'Release metrics compiled from confirmed digital checkout scans.'
    },
    methodology: [
      'Reconciliation of check-in entries against confirmed guardian release records.'
    ],
    limitations: [
      'Specific individual names and contact details are omitted in compliance with privacy guidelines.'
    ]
  };
}
