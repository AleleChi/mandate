import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation, ReportChartSpec } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildVolunteerTeamReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const vol = analytics.volunteers;
  const totalAssigned = vol.totalApproved || 0;
  const activeOnDuty = vol.activeOnDuty || 0;
  const attendanceRate = vol.participationRate || 0;
  const totalLocations = vol.totalLocationsCount || analytics.locations.totalLocations || 0;
  const staffedLocations = vol.staffedLocationsCount || 0;
  const coverageScore = vol.roomCoverageScore !== undefined ? vol.roomCoverageScore : (totalLocations > 0 ? Math.round((staffedLocations / totalLocations) * 100) : 0);
  const loads = analytics.locations.locationLoads || [];
  const unstaffedRoomsCount = loads.filter(l => l.volunteerCount === 0).length;

  const kpis: ReportKPI[] = [
    {
      label: 'Volunteers assigned',
      value: String(totalAssigned),
      sublabel: vol.totalRosterVolunteers > 0 ? `${vol.totalRosterVolunteers} in active directory` : 'Assigned to event',
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
      value: totalAssigned > 0 ? `${attendanceRate.toFixed(0)}%` : '0%',
      sublabel: `${activeOnDuty} of ${totalAssigned} active on duty`,
      color: 'charcoal'
    },
    {
      label: 'Supervision ratio',
      value: vol.ratioText || (activeOnDuty > 0 && analytics.attendance.checkedInTotal > 0 ? `1 : ${(analytics.attendance.checkedInTotal / activeOnDuty).toFixed(0)}` : 'Not available'),
      sublabel: vol.ratioSublabel || (activeOnDuty > 0 ? 'Volunteers per child' : 'No volunteers on duty'),
      color: 'charcoal'
    },
    {
      label: 'Room coverage',
      value: totalLocations > 0 ? `${coverageScore}%` : 'Not available',
      sublabel: totalLocations > 0 ? `${staffedLocations} of ${totalLocations} rooms staffed` : 'No rooms configured',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  // 1. Executive Summary Narrative
  const execIncluded = selectedSections.length === 0 || 
    selectedSections.includes('Executive Summary') || 
    selectedSections.includes('Executive summary') ||
    selectedSections.includes('Volunteer summary') ||
    selectedSections.includes('Volunteer coverage') ||
    selectedSections.includes('Volunteer & team coverage');

  if (execIncluded) {
    const ratioSummary = vol.ratioText !== 'Not available' 
      ? `The overall supervision ratio averaged ${vol.ratioText} (${vol.ratioSublabel}).` 
      : 'No active supervision ratio could be computed as check-in or duty records were not recorded.';
    
    sections.push({
      id: 'vol-summary',
      title: 'Volunteer workforce overview',
      type: 'narrative',
      content: {
        text: `Shows volunteer attendance, team assignments and coverage across event locations during "${analytics.eventTitle}". A total of ${totalAssigned} distinct volunteers are assigned to this event, with ${activeOnDuty} currently on duty (${attendanceRate.toFixed(0)}% turnout). ${ratioSummary} Designated event venues have ${staffedLocations} of ${totalLocations} rooms staffed.`
      }
    });
  }

  // 2. Chart A: Team Deployment (Grouped Horizontal Bar)
  const teamDeployment = vol.teamDeployment || [];
  if (teamDeployment.length > 0) {
    const teamLabels = teamDeployment.map(t => t.team);
    const assignedVals = teamDeployment.map(t => t.assigned);
    const onDutyVals = teamDeployment.map(t => t.onDuty);

    sections.push({
      id: 'vol-team-deployment-chart',
      title: 'Volunteer team deployment',
      description: 'Assigned versus on-duty staffing across ministry teams.',
      type: 'chart',
      content: {
        charts: [
          {
            id: 'chart-vol-team-deployment',
            kind: 'horizontalBar' as const,
            title: 'Team Deployment Comparison',
            subtitle: 'Assigned volunteers vs on-duty volunteers per team',
            labels: teamLabels,
            series: [
              { id: 's-assigned', label: 'Assigned', values: assignedVals },
              { id: 's-onduty', label: 'On duty', values: onDutyVals }
            ],
            unit: 'count',
            valueFormat: 'integer',
            caption: 'Comparison of scheduled team members versus active duty verification.',
            accessibleSummary: 'Horizontal bar chart showing assigned and on-duty volunteers across teams.',
            emptyState: 'No recorded team distribution is available for this event.'
          }
        ]
      }
    });
  } else {
    sections.push({
      id: 'vol-team-deployment-chart-empty',
      title: 'Volunteer team deployment',
      description: 'Assigned versus on-duty staffing across ministry teams.',
      type: 'chart',
      content: {
        charts: [
          {
            id: 'chart-vol-team-deployment-empty',
            kind: 'horizontalBar' as const,
            title: 'Team Deployment Comparison',
            subtitle: 'Assigned volunteers vs on-duty volunteers per team',
            labels: [],
            series: [],
            caption: 'No team distribution recorded.',
            emptyState: 'No recorded team distribution is available for this event.'
          }
        ]
      }
    });
  }

  // 3. Chart B: Room Staffing Coverage
  if (loads.length > 0) {
    const locLabels = loads.map(l => l.locationLabel);
    const volCounts = loads.map(l => l.volunteerCount);
    const kidCounts = loads.map(l => l.childrenCount);

    sections.push({
      id: 'vol-room-coverage-chart',
      title: 'Venue room staffing',
      description: 'Supervisory coverage and children present across event locations.',
      type: 'chart',
      content: {
        charts: [
          {
            id: 'chart-vol-room-coverage',
            kind: 'horizontalBar' as const,
            title: 'Staffing by Event Location',
            subtitle: 'On-duty volunteers and children present per venue room',
            labels: locLabels,
            series: [
              { id: 's-vols', label: 'Volunteers on duty', values: volCounts },
              { id: 's-kids', label: 'Children present', values: kidCounts }
            ],
            unit: 'count',
            valueFormat: 'integer',
            caption: 'Supervisory staffing distribution across designated event areas.',
            accessibleSummary: 'Horizontal bar chart of volunteers and children by venue room.',
            emptyState: 'No room staffing assignments recorded for this event.'
          }
        ]
      }
    });
  }

  // 4. Chart C: Volunteer Duty Status Composition (if statuses exist)
  const dutyStatus = vol.dutyStatusComposition || [];
  if (dutyStatus.length > 0) {
    sections.push({
      id: 'vol-status-composition-chart',
      title: 'Volunteer duty status breakdown',
      description: 'Current operational duty status of assigned volunteers.',
      type: 'chart',
      content: {
        charts: [
          {
            id: 'chart-vol-status-composition',
            kind: 'horizontalBar' as const,
            title: 'Duty Status Composition',
            subtitle: 'On duty, scheduled, on break, and unavailable members',
            labels: dutyStatus.map(d => d.status),
            series: [
              { id: 's-status-count', label: 'Volunteers', values: dutyStatus.map(d => d.count) }
            ],
            unit: 'count',
            valueFormat: 'integer',
            caption: 'Snapshot of active workforce duty states.',
            accessibleSummary: 'Chart showing breakdown of volunteers by operational duty status.',
            emptyState: 'No volunteer duty status logs available.'
          }
        ]
      }
    });
  }

  // 5. Room Staffing Breakdown Table
  if (loads.length > 0) {
    sections.push({
      id: 'staff-coverage-table',
      title: 'Room staffing breakdown',
      type: 'table',
      content: {
        headers: ['Room', 'Volunteers', 'Children', 'Ratio', 'Status'],
        rows: loads.map(l => {
          let ratioVal = 'Not available';
          if (l.volunteerCount > 0 && l.childrenCount > 0) {
            const r = (l.childrenCount / l.volunteerCount).toFixed(0);
            ratioVal = `1 : ${r}`;
          } else if (l.volunteerCount > 0 && l.childrenCount === 0) {
            ratioVal = 'No children';
          } else if (l.volunteerCount === 0 && l.childrenCount > 0) {
            ratioVal = 'Unstaffed';
          }

          let status = 'Staffed';
          if (l.volunteerCount === 0) status = 'Staffing gap';
          else if (l.childrenCount > 0 && l.volunteerCount > 0 && (l.childrenCount / l.volunteerCount) > 15) status = 'High ratio';

          return [
            l.locationLabel,
            String(l.volunteerCount),
            String(l.childrenCount),
            ratioVal,
            status
          ];
        }),
        caption: 'Room supervision breakdown across designated event areas.'
      }
    });
  }

  // 6. Findings
  const findings: ReportFinding[] = [
    {
      id: 'vol-finding-1',
      title: 'Volunteer deployment',
      observation: totalAssigned > 0 
        ? `${activeOnDuty} volunteers checked in on duty out of ${totalAssigned} assigned team members (${attendanceRate.toFixed(0)}% turnout).`
        : 'No volunteer staff are currently assigned to this event.',
      severity: totalAssigned > 0 ? 'info' : 'warning'
    }
  ];

  if (unstaffedRoomsCount > 0) {
    findings.push({
      id: 'vol-finding-2',
      title: 'Room staffing gaps',
      observation: `${unstaffedRoomsCount} room(s) recorded no on-duty volunteers during the event.`,
      severity: 'warning'
    });
  }

  // 7. Follow-up Actions
  const recommendations: ReportRecommendation[] = [];
  if (unstaffedRoomsCount > 0) {
    recommendations.push({
      id: 'vol-rec-1',
      action: 'Reassign floating volunteers to ensure at least one supervisor is present in each active room.',
      evidence: `${unstaffedRoomsCount} room(s) recorded 0 assigned volunteers.`,
      rationale: 'Satisfies mandatory child supervision coverage standards.',
      priority: 'high',
      responsibility: 'Volunteer Coordinator'
    });
  }
  if (totalAssigned === 0) {
    recommendations.push({
      id: 'vol-rec-assign',
      action: 'Assign approved volunteers from the ministry roster to event locations.',
      evidence: '0 volunteers currently assigned to event duty roster.',
      rationale: 'Ensures required adult supervision prior to child check-in.',
      priority: 'high',
      responsibility: 'Volunteer Coordinator'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'vol-rec-none',
      action: 'Maintain existing room coverage and coordinate scheduled break rotations.',
      evidence: 'All active venue locations have assigned supervisory coverage.',
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
    reportDescription: 'Shows volunteer attendance, team assignments and coverage across event locations.',
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
    reportVersion: snapshot.version || snapshot.report_version || 1,
    kpis,
    sections,
    findings,
    recommendations,
    dataQuality: {
      score: analytics.dataQuality.dataConfidenceScore,
      status: analytics.dataQuality.overallConfidence,
      notes: 'Volunteer metrics reflect validated duty roster records linked to approved volunteer profiles.'
    },
    methodology: [
      'Verification of distinct volunteer attendance against assigned duty rosters.',
      'Exclusion of unapproved, removed, or orphaned assignment records.'
    ],
    limitations: [
      'Supervision ratios represent snapshot room counts and may vary with supervisor movement.'
    ]
  };
}
