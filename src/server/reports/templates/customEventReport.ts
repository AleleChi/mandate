import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildCustomEventReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const regTotal = analytics.registrations?.totalRegistrations ?? analytics.attendance.totalRegistrations ?? 0;
  const selTotal = analytics.registrations?.selectedTotal ?? analytics.attendance.expectedTotal ?? 0;
  const checkedInTotal = analytics.attendance.checkedInTotal ?? 0;
  const insideTotal = analytics.attendance.insideTotal ?? 0;
  const releasedTotal = analytics.attendance.releasedTotal ?? 0;
  const notArrivedTotal = analytics.attendance.notArrivedTotal ?? (selTotal > checkedInTotal ? selTotal - checkedInTotal : 0);
  const activeVolunteers = analytics.volunteers.activeOnDuty ?? 0;
  const totalApprovedVolunteers = analytics.volunteers.totalApproved ?? 0;

  const attendanceRate = selTotal > 0 ? (checkedInTotal / selTotal) * 100 : 0;
  const releaseRate = checkedInTotal > 0 ? (releasedTotal / checkedInTotal) * 100 : 0;
  const selectionRate = regTotal > 0 ? (selTotal / regTotal) * 100 : 0;

  // 1. Executive Restrained KPI Grid (6 cards)
  const kpis: ReportKPI[] = [
    {
      label: 'Registered',
      value: String(regTotal),
      sublabel: 'Total applications',
      color: 'charcoal'
    },
    {
      label: 'Selected',
      value: String(selTotal),
      sublabel: `${selectionRate.toFixed(0)}% selection rate`,
      color: 'charcoal'
    },
    {
      label: 'Checked in',
      value: String(checkedInTotal),
      sublabel: `${attendanceRate.toFixed(0)}% attendance rate`,
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
      sublabel: `${releaseRate.toFixed(0)}% of checked in`,
      color: 'charcoal'
    },
    {
      label: 'Volunteers',
      value: String(activeVolunteers),
      sublabel: `${totalApprovedVolunteers} approved`,
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  // Section 1: Narrative Overview - "What this report shows"
  const isSectionSelected = (names: string[]) => {
    if (selectedSections.length === 0) return true;
    return names.some(n => selectedSections.includes(n));
  };

  if (isSectionSelected(['Executive summary', 'Executive Summary', 'What this report shows', 'Custom summary'])) {
    sections.push({
      id: 'full-report-summary',
      title: 'What this report shows',
      type: 'narrative',
      content: {
        text: `This comprehensive event report gives ministry leadership a full operational overview for "${analytics.eventTitle}". It brings together registration intake, actual turnout, volunteer staffing, room supervision, and child care in a single, verified report.\n\nA total of ${regTotal} children registered, with ${selTotal} selected to attend. On event day, ${checkedInTotal} children checked in (${attendanceRate.toFixed(0)}% of selected children), supported by ${activeVolunteers} on-duty supervisors across active venue rooms. All figures reflect verified database records up to the reporting cutoff.`
      }
    });
  }

  // Section 2: Registration & Intake Demand
  if (isSectionSelected(['Registration & demand', 'Registration & selection', 'Registration', 'Operational Metrics']) && analytics.registrations) {
    const reg = analytics.registrations;
    sections.push({
      id: 'reg-summary-table',
      title: 'Registration & programme demand',
      description: 'Breakdown of applications received, committee reviews, and cohort selection.',
      type: 'table',
      content: {
        headers: ['Application status', 'Count', 'Share of demand'],
        rows: [
          ['Selected to attend', `${reg.selectedTotal} children`, `${regTotal > 0 ? Math.round((reg.selectedTotal / regTotal) * 100) : 0}%`],
          ['Waiting for review', `${reg.underReviewTotal} applications`, `${regTotal > 0 ? Math.round((reg.underReviewTotal / regTotal) * 100) : 0}%`],
          ['Waiting list', `${reg.waitlistTotal} children`, `${regTotal > 0 ? Math.round((reg.waitlistTotal / regTotal) * 100) : 0}%`],
          ['Not selected', `${reg.notSelectedTotal} children`, `${regTotal > 0 ? Math.round((reg.notSelectedTotal / regTotal) * 100) : 0}%`],
          ['Total applications', `${reg.totalRegistrations} children`, '100%']
        ]
      }
    });

    const regCharts = [];
    const outcomeLabels = reg.registrationOutcomes.map(o => o.label);
    const outcomeValues = reg.registrationOutcomes.map(o => o.count);

    if (outcomeLabels.length > 0 && outcomeValues.some(v => v > 0)) {
      regCharts.push({
        id: 'chart-reg-outcomes-donut',
        kind: 'donut' as const,
        title: 'Registration outcomes',
        subtitle: 'Distribution of application decisions',
        labels: outcomeLabels,
        series: [{ id: 's-reg-out', label: 'Applications', values: outcomeValues }],
        caption: 'Authoritative outcome distribution from registration intake records.',
        accessibleSummary: 'Donut chart showing registration application decisions.'
      });
    }

    const ageLabels = Object.keys(reg.registrationsByAgeGroup || {});
    const ageValues = Object.values(reg.registrationsByAgeGroup || {});
    if (ageLabels.length > 0 && ageValues.some(v => v > 0)) {
      regCharts.push({
        id: 'chart-reg-age-bars',
        kind: 'horizontalBar' as const,
        title: 'Children by age group',
        subtitle: 'Registered children across configured age cohorts',
        labels: ageLabels,
        series: [{ id: 's-reg-age', label: 'Registered', values: ageValues }],
        caption: 'Applicant demand across configured age groups.',
        accessibleSummary: 'Horizontal bar chart of registrations by age group.'
      });
    }

    if (regCharts.length > 0) {
      sections.push({
        id: 'reg-visual-charts',
        title: 'Registration & cohort distribution',
        type: 'chart',
        content: { charts: regCharts }
      });
    }
  }

  // Section 3: Attendance & Arrival Movement
  if (isSectionSelected(['Attendance & movement', 'Attendance & turnout', 'Attendance', 'Operational Metrics'])) {
    const att = analytics.attendance;
    sections.push({
      id: 'att-summary-table',
      title: 'Attendance & arrival movement',
      description: 'Turnout rates, gate check-in volume, and current room occupancy.',
      type: 'table',
      content: {
        headers: ['Movement stage', 'Count', 'Proportion'],
        rows: [
          ['Invited (selected)', `${selTotal} children`, 'Base cohort'],
          ['Children checked in', `${checkedInTotal} children`, `${attendanceRate.toFixed(0)}% attendance rate`],
          ['Children still inside', `${insideTotal} children`, `${checkedInTotal > 0 ? Math.round((insideTotal / checkedInTotal) * 100) : 0}% of checked in`],
          ['Children picked up', `${releasedTotal} children`, `${checkedInTotal > 0 ? Math.round((releasedTotal / checkedInTotal) * 100) : 0}% of checked in`],
          ['Did not arrive', `${notArrivedTotal} children`, `${selTotal > 0 ? Math.round((notArrivedTotal / selTotal) * 100) : 0}% of invited`]
        ]
      }
    });

    const attCharts = [];

    // Donut chart: Attendance status flow
    attCharts.push({
      id: 'chart-att-flow-donut',
      kind: 'donut' as const,
      title: 'Attendance status flow',
      subtitle: 'Children inside, picked up, and not arrived',
      labels: ['Children still inside', 'Children picked up', 'Did not arrive'],
      series: [{ id: 's-flow', label: 'Children', values: [insideTotal, releasedTotal, notArrivedTotal] }],
      caption: `${insideTotal} in rooms, ${releasedTotal} picked up, ${notArrivedTotal} did not arrive.`,
      accessibleSummary: 'Donut chart showing inside, picked up, and not arrived counts.'
    });

    // Grouped or single bar chart for age group turnout
    if (att.ageGroupAttendance && att.ageGroupAttendance.length > 0) {
      const ageLabels = att.ageGroupAttendance.map(a => a.ageGroup);
      const expectedVals = att.ageGroupAttendance.map(a => a.expected);
      const attendedVals = att.ageGroupAttendance.map(a => a.attended);
      attCharts.push({
        id: 'chart-att-cohort-bars',
        kind: 'bar' as const,
        title: 'Attendance by age group',
        subtitle: 'Invited vs attended children across cohorts',
        labels: ageLabels,
        series: [
          { id: 's-expected', label: 'Selected', values: expectedVals },
          { id: 's-attended', label: 'Checked in', values: attendedVals }
        ],
        caption: 'Attendance turnout compared against selected cohort size.',
        accessibleSummary: 'Grouped bar chart comparing selected vs checked in by age cohort.'
      });
    }

    // Timeline chart if arrival time data is recorded
    if (att.checkInTimeSeries && att.checkInTimeSeries.length > 1) {
      attCharts.push({
        id: 'chart-att-timeline',
        kind: 'line' as const,
        title: 'Check-in activity over time',
        subtitle: 'Arrival rate by time period',
        labels: att.checkInTimeSeries.map(t => t.hour),
        series: [{ id: 's-hourly', label: 'Check-ins', values: att.checkInTimeSeries.map(t => t.count) }],
        caption: 'Recorded arrival activity at registration desks.',
        accessibleSummary: 'Line chart showing arrival activity over time.'
      });
    }

    sections.push({
      id: 'att-visual-charts',
      title: 'Movement & arrival charts',
      type: 'chart',
      content: { charts: attCharts }
    });
  }

  // Section 4: Volunteer Staffing & Location Supervision
  if (isSectionSelected(['Volunteer coverage', 'Staffing & supervision', 'Volunteers', 'Operational Metrics'])) {
    const vol = analytics.volunteers;
    sections.push({
      id: 'vol-summary-table',
      title: 'Volunteer staffing & supervision',
      description: 'Supervisory deployment, team coverage, and volunteer-to-child ratios.',
      type: 'table',
      content: {
        headers: ['Supervision metric', 'Recorded count', 'Context'],
        rows: [
          ['Approved volunteers', `${vol.totalApproved} supervisors`, 'Approved roster'],
          ['Volunteers on duty', `${vol.activeOnDuty} active`, 'On site during event'],
          ['Teams represented', `${Object.keys(vol.volunteersByTeam || {}).length} ministry teams`, 'Active departments'],
          ['Supervision ratio', `${vol.volunteersPer100Children.toFixed(1)} per 100 children`, 'Ministry benchmark: 15:100']
        ]
      }
    });

    const volTeams = Object.keys(vol.volunteersByTeam || {});
    if (volTeams.length > 0) {
      sections.push({
        id: 'vol-deployment-charts',
        title: 'Team deployment',
        type: 'chart',
        content: {
          charts: [
            {
              id: 'chart-vol-teams-hbar',
              kind: 'horizontalBar' as const,
              title: 'Volunteers by team',
              subtitle: 'Active supervisor assignments by ministry team',
              labels: volTeams,
              series: [{ id: 's-vol-teams', label: 'Volunteers', values: volTeams.map(t => vol.volunteersByTeam[t]) }],
              caption: 'Active supervisor counts across ministry teams.',
              accessibleSummary: 'Horizontal bar chart of volunteers assigned to each team.'
            }
          ]
        }
      });
    }

    if (analytics.locations.locationLoads && analytics.locations.locationLoads.length > 0) {
      sections.push({
        id: 'location-loads-table',
        title: 'Location & room coverage',
        description: 'Room-by-room supervision coverage and child capacity.',
        type: 'table',
        content: {
          headers: ['Room / Location', 'Children', 'Volunteers', 'Supervision load'],
          rows: analytics.locations.locationLoads.map(loc => [
            loc.locationLabel,
            `${loc.childrenCount} children`,
            `${loc.volunteerCount} on duty`,
            `${loc.loadPercentage.toFixed(0)}% capacity`
          ])
        }
      });
    }
  }

  // Section 5: Child Care & Safety Summary (Aggregated ONLY)
  if (isSectionSelected(['Care & safety', 'Child safety', 'Safety & incidents', 'Operational Metrics'])) {
    const medCount = analytics.registrations?.medicalNotesCount ?? 0;
    const extraSupportCount = analytics.registrations?.extraSupportCount ?? 0;
    const totalCare = analytics.registrations?.totalCareCount ?? 0;
    const totalAlerts = analytics.alerts.totalAlerts ?? 0;
    const openAlerts = (analytics.alerts.alertsByStatus?.open ?? 0) + (analytics.alerts.alertsByStatus?.in_progress ?? 0);
    const resolvedAlerts = analytics.alerts.alertsByStatus?.resolved ?? 0;

    sections.push({
      id: 'care-safety-summary-table',
      title: 'Child care & safety overview',
      description: 'Aggregated safeguarding indicators and care awareness records. All figures are strictly anonymised.',
      type: 'table',
      content: {
        headers: ['Care & safeguarding area', 'Recorded count', 'Operational status'],
        rows: [
          ['Children with care records', `${totalCare} children`, totalCare > 0 ? 'Care protocols active' : 'None recorded'],
          ['Dietary / allergy notifications', `${medCount} entries`, medCount > 0 ? 'Kitchen awareness active' : 'None recorded'],
          ['Additional support assistance', `${extraSupportCount} entries`, extraSupportCount > 0 ? 'Assigned support teams' : 'Standard support'],
          ['Safeguarding alerts raised', `${totalAlerts} alarms`, totalAlerts === 0 ? 'All clear' : 'Logged on system'],
          ['Open / unresolved safety matters', `${openAlerts} unresolved`, openAlerts === 0 ? 'All clear' : 'Attention required'],
          ['Resolved safety matters', `${resolvedAlerts} resolved`, 'Resolved on site']
        ]
      }
    });

    if (totalAlerts > 0) {
      const sev = analytics.alerts.alertsBySeverity;
      const sevLabels = ['Normal', 'Important', 'Urgent'];
      const sevValues = [sev?.normal ?? 0, sev?.important ?? 0, sev?.urgent ?? 0];
      sections.push({
        id: 'safety-severity-charts',
        title: 'Safety matters by urgency',
        type: 'chart',
        content: {
          charts: [
            {
              id: 'chart-safety-severity-hbar',
              kind: 'horizontalBar' as const,
              title: 'Safety matters by urgency',
              subtitle: 'Urgency classification of incident alerts',
              labels: sevLabels,
              series: [{ id: 's-sev', label: 'Alerts', values: sevValues }],
              caption: 'Aggregated safety alerts categorized by urgency.',
              accessibleSummary: 'Horizontal bar chart of incident alerts by urgency.'
            }
          ]
        }
      });
    }
  }

  // Key Observations (Plain English, derived directly from actual metrics)
  const findings: ReportFinding[] = [];
  findings.push({
    id: 'obs-attendance',
    title: 'Attendance turnout',
    observation: `${checkedInTotal} of ${selTotal} selected children checked in (${attendanceRate.toFixed(1)}% attendance rate).`,
    severity: 'info',
    supportingData: 'Gate check-in records'
  });

  if (insideTotal > 0) {
    findings.push({
      id: 'obs-inside',
      title: 'Children currently inside',
      observation: `${insideTotal} children remain checked in across care rooms and have not yet been released.`,
      severity: 'info',
      supportingData: 'Room check-in records'
    });
  }

  if (activeVolunteers > 0) {
    findings.push({
      id: 'obs-supervision',
      title: 'Volunteer supervision coverage',
      observation: `${activeVolunteers} active volunteers are deployed on duty, maintaining a ratio of ${analytics.volunteers.volunteersPer100Children.toFixed(1)} volunteers per 100 children.`,
      severity: 'info',
      supportingData: 'Volunteer duty logs'
    });
  }

  const openSafetyCount = (analytics.alerts.alertsByStatus?.open ?? 0) + (analytics.alerts.alertsByStatus?.in_progress ?? 0);
  if (openSafetyCount > 0) {
    findings.push({
      id: 'obs-safety-open',
      title: 'Open safety notices',
      observation: `${openSafetyCount} safety notices remain open or in progress and require supervisor follow-up.`,
      severity: 'high',
      supportingData: 'Safety incident log'
    });
  } else {
    findings.push({
      id: 'obs-safety-clear',
      title: 'Safety status',
      observation: 'No unresolved safety concerns were recorded during this reporting window.',
      severity: 'info',
      supportingData: 'Safety incident log'
    });
  }

  // Recommended Action Points (Plain English, practical)
  const recommendations: ReportRecommendation[] = [];
  if (insideTotal > 0) {
    recommendations.push({
      id: 'rec-release-pickup',
      action: 'Confirm pickup and secure release for children remaining in care rooms.',
      evidence: `${insideTotal} children still marked as inside rooms.`,
      rationale: 'Ensures 100% reconciliation and parent collection verification before event closure.',
      priority: 'high',
      responsibility: 'Pickup & Release Lead'
    });
  }

  if (openSafetyCount > 0) {
    recommendations.push({
      id: 'rec-safety-review',
      action: 'Review and close open safety alerts with attending team leads.',
      evidence: `${openSafetyCount} alerts currently in progress or open.`,
      rationale: 'Safeguarding protocol requires prompt incident documentation and sign-off.',
      priority: 'high',
      responsibility: 'Child Safety Coordinator'
    });
  }

  if (notArrivedTotal > 0) {
    recommendations.push({
      id: 'rec-follow-up',
      action: 'Send friendly follow-up communication to families who could not attend.',
      evidence: `${notArrivedTotal} selected children did not arrive.`,
      rationale: 'Supports family care and helps plan future capacity allocations.',
      priority: 'low',
      responsibility: 'Pastoral Care Team'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'rec-standard-close',
      action: 'Proceed with standard post-event sign-off and volunteer debriefing.',
      evidence: 'All operational records fully reconciled.',
      rationale: 'Standard event closure protocol.',
      priority: 'low',
      responsibility: 'Event Director'
    });
  }

  return {
    reportId,
    templateKey: 'full-event-report',
    templateVersion: 2,
    reportTitle: `${analytics.eventTitle} — Full Event Report`,
    reportDescription: 'A comprehensive operational report covering registration intake, attendance turnout, volunteer staffing, room coverage, and child care.',
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
    intendedAudience: 'Senior Leadership, Event Operations, Department Heads',
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
      notes: 'All figures derived from authoritative event registration, attendance movement, volunteer roster, and safety logs.'
    },
    methodology: [
      'Grounded aggregation of verified database records up to the cutoff timestamp.'
    ],
    limitations: [
      'Scope reflects recorded operational scans and entries. Manual or offline activities not yet synchronized are not reflected.'
    ]
  };
}
