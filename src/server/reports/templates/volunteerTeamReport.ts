import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildVolunteerTeamReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const totalLocations = analytics.locations.totalLocations || 0;
  const loads = analytics.locations.locationLoads || [];
  const unstaffedRoomsCount = loads.filter(l => l.volunteerCount === 0).length;
  const highRatioRoomsCount = loads.filter(l => l.volunteerCount > 0 && (l.childrenCount / l.volunteerCount) > 15).length;
  const fullyCoveredLocations = analytics.locations.fullyCoveredLocations || Math.max(0, totalLocations - unstaffedRoomsCount);
  const coverageScore = totalLocations > 0 ? Math.round((fullyCoveredLocations / totalLocations) * 100) : 100;

  const totalAssigned = analytics.volunteers.totalApproved || analytics.volunteers.activeOnDuty || 0;
  const activeOnDuty = analytics.volunteers.activeOnDuty || 0;
  const attendanceRate = totalAssigned > 0 ? (activeOnDuty / totalAssigned) * 100 : 0;
  const volunteerRatio = analytics.volunteers.volunteersPer100Children || 0;

  const kpis: ReportKPI[] = [
    {
      label: 'Volunteers assigned',
      value: String(totalAssigned),
      sublabel: 'Approved on roster',
      color: 'charcoal'
    },
    {
      label: 'Volunteers on duty',
      value: String(activeOnDuty),
      sublabel: 'Active check-in verification',
      color: 'charcoal'
    },
    {
      label: 'Volunteer turnout',
      value: `${attendanceRate.toFixed(0)}%`,
      sublabel: `${activeOnDuty} of ${totalAssigned} checked in`,
      color: 'charcoal'
    },
    {
      label: 'Ratio',
      value: `${volunteerRatio.toFixed(1)}:100`,
      sublabel: 'Supervisors per 100 children',
      color: 'charcoal'
    },
    {
      label: 'Room coverage',
      value: `${coverageScore}%`,
      sublabel: `${fullyCoveredLocations} of ${totalLocations} rooms staffed`,
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.length === 0 || selectedSections.includes('Executive Summary') || selectedSections.includes('Volunteer summary')) {
    sections.push({
      id: 'vol-summary',
      title: 'Volunteer workforce overview',
      type: 'narrative',
      content: {
        text: `This report evaluates the deployment, location coverage, and duty participation of volunteer staff during "${analytics.eventTitle}". A total of ${totalAssigned} volunteers were approved for this event, with ${activeOnDuty} on duty (${attendanceRate.toFixed(1)}% volunteer attendance rate). The volunteer-to-child ratio averaged ${volunteerRatio.toFixed(1)} supervisors per 100 children across designated rooms.`
      }
    });
  }

  if (selectedSections.length === 0 || selectedSections.includes('Operational Metrics') || selectedSections.includes('Room coverage')) {
    if (loads.length > 0) {
      sections.push({
        id: 'staff-coverage-table',
        title: 'Room staffing breakdown',
        type: 'table',
        content: {
          headers: ['Room', 'Volunteers', 'Children', 'Ratio', 'Status'],
          rows: loads.map(l => {
            const ratioVal = l.volunteerCount > 0 ? (l.childrenCount / l.volunteerCount).toFixed(1) + ':1' : 'Unstaffed';
            let status = 'Staffed';
            if (l.volunteerCount === 0) status = 'Staffing gap';
            else if (l.childrenCount / l.volunteerCount > 15) status = 'High ratio';

            return [
              l.locationLabel,
              String(l.volunteerCount),
              String(l.childrenCount),
              ratioVal,
              status
            ];
          })
        }
      });
    }
  }

  const findings: ReportFinding[] = [
    {
      id: 'vol-finding-1',
      title: 'Volunteer deployment',
      observation: `${activeOnDuty} volunteers checked in on duty out of ${totalAssigned} approved team members (${attendanceRate.toFixed(1)}%).`,
      severity: 'info'
    }
  ];

  if (unstaffedRoomsCount > 0) {
    findings.push({
      id: 'vol-finding-2',
      title: 'Room staffing gaps',
      observation: `${unstaffedRoomsCount} room(s) operated without dedicated on-duty volunteers during the event.`,
      severity: 'warning'
    });
  }

  const recommendations: ReportRecommendation[] = [];
  if (unstaffedRoomsCount > 0) {
    recommendations.push({
      id: 'vol-rec-1',
      action: 'Reassign floating volunteers to ensure at least one supervisor is assigned per active room.',
      evidence: `${unstaffedRoomsCount} room(s) recorded 0 assigned volunteers.`,
      rationale: 'Satisfies mandatory child supervision coverage standards.',
      priority: 'high',
      responsibility: 'Volunteer Coordinator'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'vol-rec-none',
      action: 'No immediate follow-up identified from the available event data.',
      evidence: 'All active venue locations had assigned volunteer supervisors.',
      rationale: 'Supervisory coverage met operational targets.',
      priority: 'low',
      responsibility: 'Volunteer Coordinator'
    });
  }

  return {
    reportId,
    templateKey: 'volunteer-team-performance-report-v1',
    templateVersion: 2,
    reportTitle: 'Volunteer Coverage and Team Report',
    reportDescription: 'Evaluates volunteer deployment, check-in turnout, venue room coverage, and child-to-supervisor ratios.',
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
    intendedAudience: 'Super Admin, Volunteer Coordinator',
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
      notes: 'Volunteer metrics reflect actual check-in records from duty rosters.'
    },
    methodology: [
      'Verification of volunteer attendance against assigned duty rosters.'
    ],
    limitations: [
      'Ratios represent snapshot room counts and may vary with floating supervisor movement.'
    ]
  };
}
