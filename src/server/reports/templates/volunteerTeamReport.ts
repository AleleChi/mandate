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
      label: 'Assigned volunteers',
      value: String(vol.assignedVolunteers ?? totalAssigned),
      sublabel: `${vol.approvedVolunteers ?? vol.totalRosterVolunteers ?? totalAssigned} approved in roster`,
      color: 'charcoal'
    },
    {
      label: 'Currently on duty',
      value: String(vol.currentlyOnDuty ?? activeOnDuty),
      sublabel: (vol.currentlyOnDuty ?? activeOnDuty) > 0 ? 'Active on site' : 'No volunteers on duty',
      color: 'charcoal'
    },
    {
      label: 'Reported during event',
      value: String(vol.reportedDuringEvent ?? activeOnDuty),
      sublabel: `${vol.checkedOut ?? 0} checked out`,
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

  // 1. "What this report shows" Narrative
  const execIncluded = selectedSections.length === 0 || 
    selectedSections.includes('Executive Summary') || 
    selectedSections.includes('Executive summary') ||
    selectedSections.includes('What this report shows') ||
    selectedSections.includes('Volunteer summary') ||
    selectedSections.includes('Volunteer coverage') ||
    selectedSections.includes('Volunteer & team coverage');

  if (execIncluded) {
    const ratioSummary = vol.ratioText !== 'Not available' 
      ? `On average, our supervision ratio was ${vol.ratioText} (${vol.ratioSublabel}).` 
      : 'Supervision ratios were not calculated because no children or on-duty volunteers were recorded.';
    
    sections.push({
      id: 'vol-summary',
      title: 'Event summary',
      type: 'narrative',
      content: {
        text: `Volunteer operations overview for "${analytics.eventTitle}". A total of ${totalAssigned} volunteers were assigned, with ${vol.reportedDuringEvent ?? activeOnDuty} having reported for duty during the event (${activeOnDuty} currently on duty). ${ratioSummary} Active volunteers cover ${staffedLocations} of ${totalLocations} designated event rooms.`
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
      title: '01 Volunteer team deployment',
      description: 'Scheduled versus on-duty volunteers across ministry teams.',
      type: 'chart',
      content: {
        charts: [
          {
            id: 'chart-vol-team-deployment',
            kind: 'horizontalBar' as const,
            title: 'Team Deployment Comparison',
            subtitle: 'Scheduled volunteers vs on-duty volunteers per team',
            labels: teamLabels,
            series: [
              { id: 's-assigned', label: 'Scheduled', values: assignedVals },
              { id: 's-onduty', label: 'On duty', values: onDutyVals }
            ],
            unit: 'count',
            valueFormat: 'integer',
            caption: 'Comparison of scheduled team members against active duty verification.',
            accessibleSummary: 'Horizontal bar chart showing scheduled and on-duty volunteers across teams.',
            emptyState: 'No volunteer team assignments recorded yet.'
          }
        ]
      }
    });
  } else {
    sections.push({
      id: 'vol-team-deployment-chart-empty',
      title: 'Volunteer team deployment',
      description: 'Scheduled versus on-duty volunteers across ministry teams.',
      type: 'chart',
      content: {
        charts: [
          {
            id: 'chart-vol-team-deployment-empty',
            kind: 'horizontalBar' as const,
            title: 'Team Deployment Comparison',
            subtitle: 'Scheduled volunteers vs on-duty volunteers per team',
            labels: [],
            series: [],
            caption: 'No team distribution recorded.',
            emptyState: 'No volunteer movement recorded yet.'
          }
        ]
      }
    });
  }

  // 3. Chart B: Room Staffing Coverage (Grouped Horizontal Bar)
  if (loads.length > 0) {
    const locLabels = loads.map(l => l.locationLabel);
    const volCounts = loads.map(l => l.volunteerCount);
    const kidCounts = loads.map(l => l.childrenCount);

    sections.push({
      id: 'vol-room-coverage-chart',
      title: '02 Room staffing and supervision',
      description: 'Volunteers on duty and children present across activity rooms.',
      type: 'chart',
      content: {
        charts: [
          {
            id: 'chart-vol-room-coverage',
            kind: 'horizontalBar' as const,
            title: 'Staffing by Event Room',
            subtitle: 'Volunteers on duty and children present per room',
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

  // 4. Chart C: Volunteer Duty Status Composition (Donut Visual)
  const notOnDuty = Math.max(0, totalAssigned - activeOnDuty);
  sections.push({
    id: 'vol-status-composition-chart',
    title: '03 Volunteer duty status distribution',
    description: 'Breakdown of scheduled volunteers currently on duty versus not arrived.',
    type: 'chart',
    content: {
      charts: [
        {
          id: 'chart-vol-status-composition',
          kind: 'donut' as const,
          title: 'Volunteer Duty Status',
          subtitle: 'Active on duty versus scheduled but not checked in',
          labels: ['Volunteers on duty', 'Scheduled but not on duty'],
          series: [
            { id: 's-duty-status', label: 'Volunteers', values: [activeOnDuty, notOnDuty] }
          ],
          unit: 'count',
          valueFormat: 'integer',
          caption: `${activeOnDuty} volunteers on duty, ${notOnDuty} scheduled but not arrived.`,
          accessibleSummary: 'Donut chart showing volunteers on duty versus not on duty.',
          emptyState: 'No volunteer duty status logs available.'
        }
      ]
    }
  });

  // 4b. Volunteer operations summary table
  sections.push({
    id: 'vol-operations-summary-table',
    title: 'Volunteer operations overview',
    description: 'Workforce deployment metrics including approved roster, event assignments, and live duty participation.',
    type: 'table',
    content: {
      headers: ['Volunteer coverage', 'Current position'],
      rows: [
        ['Approved volunteers', `${vol.approvedVolunteers ?? vol.totalRosterVolunteers ?? totalAssigned} approved in roster`],
        ['Assigned volunteers', `${vol.assignedVolunteers ?? totalAssigned} assigned to event`],
        ['Reported during event', `${vol.reportedDuringEvent ?? activeOnDuty} reported for duty`],
        ['Currently on duty', (vol.currentlyOnDuty ?? activeOnDuty) > 0 ? `${vol.currentlyOnDuty ?? activeOnDuty} active on site` : 'No volunteers on duty'],
        ['Checked out', `${vol.checkedOut ?? 0} completed duty session`],
        ['Duty locations staffed', `${staffedLocations} of ${totalLocations} designated rooms`]
      ]
    }
  });

  // 5. Room Staffing Breakdown Table
  if (loads.length > 0) {
    sections.push({
      id: 'staff-coverage-table',
      title: 'Room staffing breakdown',
      type: 'table',
      content: {
        headers: ['Room', 'Volunteers on duty', 'Children present', 'Supervision ratio', 'Coverage status'],
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

          let status = 'Covered';
          if (l.volunteerCount === 0) status = 'Staffing gap';
          else if (l.childrenCount > 0 && l.volunteerCount > 0 && (l.childrenCount / l.volunteerCount) > 15) status = 'High child load';

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

  // 6. Key Observations
  const findings: ReportFinding[] = [
    {
      id: 'vol-finding-1',
      title: 'Volunteer turnout',
      observation: totalAssigned > 0 
        ? `${activeOnDuty} volunteers checked in on duty out of ${totalAssigned} scheduled team members (${attendanceRate.toFixed(0)}% turnout).`
        : 'No volunteer staff are currently assigned to this event.',
      severity: totalAssigned > 0 ? 'info' : 'warning'
    }
  ];

  if (unstaffedRoomsCount > 0) {
    findings.push({
      id: 'vol-finding-2',
      title: 'Rooms needing coverage',
      observation: `${unstaffedRoomsCount} room(s) recorded no on-duty volunteers during the event.`,
      severity: 'warning'
    });
  }

  // 7. Action Points
  const recommendations: ReportRecommendation[] = [];
  if (unstaffedRoomsCount > 0) {
    recommendations.push({
      id: 'vol-rec-1',
      action: 'Assign floating volunteers to ensure at least one supervisor is present in each active room.',
      evidence: `${unstaffedRoomsCount} room(s) recorded 0 assigned volunteers.`,
      rationale: 'Ensures safe supervision standards for all children.',
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
      action: 'Maintain current room coverage and coordinate scheduled rest breaks.',
      evidence: 'All active venue rooms have assigned volunteer coverage.',
      rationale: 'Room supervision meets ministry standards.',
      priority: 'low',
      responsibility: 'Volunteer Coordinator'
    });
  }

  return {
    reportId,
    templateKey: 'volunteer-team-performance-report-v1',
    templateVersion: 2,
    reportTitle: `${analytics.eventTitle} — Volunteer Team Report`,
    reportDescription: 'Shows volunteer attendance, team assignments and coverage across event locations.',
    coverStyle: 'ivory',
    eventContext: {
      eventId: analytics.eventId,
      eventTitle: analytics.eventTitle,
      startsAt: analytics.startsAt,
      endsAt: snapshot?.event?.ends_at,
      venue: snapshot?.event?.venue,
      theme: snapshot?.event?.theme,
      scripture: snapshot?.event?.scripture,
      registrationStatus: snapshot?.event?.registration_status
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
      notes: 'Volunteer metrics reflect duty roster records linked to approved volunteer profiles.'
    },
    methodology: [
      'Verification of distinct volunteer attendance against assigned duty rosters.',
      'Supervision ratios are computed as children present divided by volunteers on duty in each room.'
    ],
    limitations: [
      'Supervision ratios represent room counts at the cutoff time and may change with room movement.'
    ]
  };
}
