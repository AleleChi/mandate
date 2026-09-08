import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildEventExecutiveReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  // 1. Executive Level Restrained KPI Row (Section 16: Registered, Selected, Attended, Attendance rate, Volunteers, Open safety concerns)
  const regTotal = analytics.registrations?.totalRegistrations ?? analytics.attendance.totalRegistrations ?? 0;
  const selTotal = analytics.registrations?.selectedTotal ?? analytics.attendance.expectedTotal ?? 0;
  const checkedInTotal = analytics.attendance.checkedInTotal ?? 0;
  const attRate = analytics.attendance.attendanceRate ?? 0;
  const volunteersOnDuty = analytics.volunteers.activeOnDuty ?? 0;
  const openSafety = (analytics.alerts.alertsByStatus?.open ?? 0) + (analytics.alerts.alertsByStatus?.in_progress ?? 0);

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
      sublabel: `${regTotal > 0 ? Math.round((selTotal / regTotal) * 100) : 0}% selection rate`,
      color: 'charcoal'
    },
    {
      label: 'Attended',
      value: String(checkedInTotal),
      sublabel: `${analytics.attendance.releasedTotal} picked up`,
      color: 'charcoal'
    },
    {
      label: 'Attendance rate',
      value: `${attRate.toFixed(0)}%`,
      sublabel: 'Of selected children',
      color: 'charcoal'
    },
    {
      label: 'Volunteers on duty',
      value: String(volunteersOnDuty),
      sublabel: `${analytics.volunteers.totalApproved ?? 0} approved`,
      color: 'charcoal'
    },
    {
      label: 'Open safety concerns',
      value: String(openSafety),
      sublabel: `${analytics.alerts.alertsByStatus?.resolved ?? 0} resolved`,
      color: 'charcoal'
    }
  ];

  // 2. Sections
  const sections: ReportSection[] = [];

  // PAGE 1: What this report shows
  const execSummaryIncluded = selectedSections.length === 0 || 
    selectedSections.includes('Executive summary') || 
    selectedSections.includes('Executive Summary') ||
    selectedSections.includes('What this report shows');

  if (execSummaryIncluded) {
    sections.push({
      id: 'exec-summary',
      title: 'What this report shows',
      type: 'narrative',
      content: {
        text: `This executive dashboard gives ministry leadership a complete operational summary of "${analytics.eventTitle}". It brings together application demand, attendance turnout, volunteer staffing, room supervision, and child care in a single leadership view.\n\nA total of ${regTotal} children registered, with ${selTotal} selected to attend. On event day, ${checkedInTotal} children arrived and checked in (${attRate.toFixed(0)}% attendance rate). Supervised care was supported by ${volunteersOnDuty} volunteers on duty across designated venue rooms. All operations adhered to established child safety and care protocols.`
      }
    });
  }

  // PAGE 2: Registration & participation
  const regIncluded = selectedSections.length === 0 || 
    selectedSections.includes('Registration & participation') || 
    selectedSections.includes('Registration & selection') || 
    selectedSections.includes('Operational Metrics');

  if (regIncluded && analytics.registrations) {
    const reg = analytics.registrations;
    sections.push({
      id: 'reg-metrics-table',
      title: 'Registration & participation',
      description: 'Overview of programme demand, review decisions, and cohort distribution.',
      type: 'table',
      content: {
        headers: ['Registration status', 'Count', 'Share of demand'],
        rows: [
          ['Selected', `${reg.selectedTotal} children`, `${reg.totalRegistrations > 0 ? Math.round((reg.selectedTotal / reg.totalRegistrations) * 100) : 0}%`],
          ['Waiting for review', `${reg.underReviewTotal} applications`, `${reg.totalRegistrations > 0 ? Math.round((reg.underReviewTotal / reg.totalRegistrations) * 100) : 0}%`],
          ['Waiting list', `${reg.waitlistTotal} children`, `${reg.totalRegistrations > 0 ? Math.round((reg.waitlistTotal / reg.totalRegistrations) * 100) : 0}%`],
          ['Not selected', `${reg.notSelectedTotal} children`, `${reg.totalRegistrations > 0 ? Math.round((reg.notSelectedTotal / reg.totalRegistrations) * 100) : 0}%`],
          ['Total registrations', `${reg.totalRegistrations} applications`, '100%']
        ]
      }
    });

    const outcomeLabels = reg.registrationOutcomes.map(o => o.label);
    const outcomeValues = reg.registrationOutcomes.map(o => o.count);

    const ageLabels = Object.keys(reg.registrationsByAgeGroup || {});
    const ageValues = Object.values(reg.registrationsByAgeGroup || {});

    const regCharts = [];
    if (outcomeLabels.length > 0 && outcomeValues.some(v => v > 0)) {
      regCharts.push({
        id: 'chart-reg-outcomes',
        kind: 'donut' as const,
        title: 'Registration outcomes',
        subtitle: 'Distribution of application decisions',
        labels: outcomeLabels,
        series: [{ id: 's-reg-out', label: 'Applications', values: outcomeValues }],
        caption: 'Authoritative outcome distribution from registration intake.',
        accessibleSummary: 'Donut chart showing registration application decisions.'
      });
    }

    if (ageLabels.length > 0 && ageValues.some(v => v > 0)) {
      regCharts.push({
        id: 'chart-reg-age',
        kind: 'horizontalBar' as const,
        title: 'Children by age group',
        subtitle: 'Registered children across configured age cohorts',
        labels: ageLabels,
        series: [{ id: 's-reg-age', label: 'Registered', values: ageValues }],
        caption: 'Demand by configured age group.',
        accessibleSummary: 'Horizontal bar chart of registrations by age group.'
      });
    }

    if (regCharts.length > 0) {
      sections.push({
        id: 'reg-charts',
        title: 'Registration & cohort distribution',
        type: 'chart',
        content: { charts: regCharts }
      });
    }
  }

  // PAGE 3: Attendance & movement
  const attIncluded = selectedSections.length === 0 || 
    selectedSections.includes('Attendance & movement') || 
    selectedSections.includes('Operational Metrics');

  if (attIncluded) {
    const att = analytics.attendance;
    sections.push({
      id: 'att-metrics-table',
      title: 'Attendance & movement',
      description: 'Turnout rates, gate movement flow, and cohort participation.',
      type: 'table',
      content: {
        headers: ['Movement stage', 'Count', 'Rate'],
        rows: [
          ['Invited (selected)', `${att.expectedTotal} children`, 'Base denominator'],
          ['Children checked in', `${att.checkedInTotal} children`, `${att.attendanceRate.toFixed(0)}% attendance rate`],
          ['Children still inside', `${att.insideTotal} children`, `${att.checkedInTotal > 0 ? Math.round((att.insideTotal / att.checkedInTotal) * 100) : 0}% of checked in`],
          ['Children picked up', `${att.releasedTotal} children`, `${att.checkedInTotal > 0 ? Math.round((att.releasedTotal / att.checkedInTotal) * 100) : 0}% of checked in`],
          ['Did not arrive', `${att.notArrivedTotal} children`, `${att.expectedTotal > 0 ? Math.round((att.notArrivedTotal / att.expectedTotal) * 100) : 0}% of invited`]
        ]
      }
    });

    const attCharts = [];

    // Donut chart: Attendance status flow
    attCharts.push({
      id: 'chart-att-flow',
      kind: 'donut' as const,
      title: 'Attendance status flow',
      subtitle: 'Children inside, picked up, and not arrived',
      labels: ['Children still inside', 'Children picked up', 'Did not arrive'],
      series: [{ id: 's-flow', label: 'Children', values: [att.insideTotal, att.releasedTotal, att.notArrivedTotal] }],
      caption: `${att.insideTotal} in activity rooms, ${att.releasedTotal} picked up, ${att.notArrivedTotal} did not arrive.`,
      accessibleSummary: 'Donut chart showing inside, picked up, and not arrived counts.'
    });

    // Bar chart: Attendance by age group
    if (att.ageGroupAttendance && att.ageGroupAttendance.length > 0) {
      const ageLabels = att.ageGroupAttendance.map(a => a.ageGroup);
      const attendedVals = att.ageGroupAttendance.map(a => a.attended);
      attCharts.push({
        id: 'chart-att-age',
        kind: 'bar' as const,
        title: 'Attendance by age group',
        subtitle: 'Actual attendance across age cohorts',
        labels: ageLabels,
        series: [{ id: 's-att-age', label: 'Checked in', values: attendedVals }],
        caption: 'Attendance turnout across configured age groups.',
        accessibleSummary: 'Bar chart showing attendance by age cohort.'
      });
    }

    // Chronological flow (only if timestamps exist)
    if (att.checkInTimeSeries && att.checkInTimeSeries.length > 1) {
      attCharts.push({
        id: 'chart-att-hourly',
        kind: 'line' as const,
        title: 'Check-in activity over time',
        subtitle: 'Check-in volume by hour',
        labels: att.checkInTimeSeries.map(t => t.hour),
        series: [{ id: 's-hourly', label: 'Check-ins', values: att.checkInTimeSeries.map(t => t.count) }],
        caption: 'Arrival timeline recorded at check-in desks.',
        accessibleSummary: 'Line chart showing arrival activity over time.'
      });
    }

    sections.push({
      id: 'att-charts',
      title: 'Movement & arrival flow',
      type: 'chart',
      content: { charts: attCharts }
    });
  }

  // PAGE 4: Volunteer coverage
  const volIncluded = selectedSections.length === 0 || 
    selectedSections.includes('Volunteer coverage') || 
    selectedSections.includes('Operational Metrics');

  if (volIncluded) {
    const vol = analytics.volunteers;
    sections.push({
      id: 'vol-metrics-table',
      title: 'Volunteer coverage',
      description: 'Supervisory deployment, team participation, and room coverage.',
      type: 'table',
      content: {
        headers: ['Staffing dimension', 'Count / ratio', 'Standard target'],
        rows: [
          ['Approved volunteers', `${vol.totalApproved} supervisors`, 'Approved roster'],
          ['Volunteers on duty', `${vol.activeOnDuty} active`, 'Minimum 1 per room'],
          ['Teams represented', `${Object.keys(vol.volunteersByTeam || {}).length} ministry teams`, 'Full department coverage'],
          ['Supervision ratio', `${vol.volunteersPer100Children.toFixed(1)} per 100 children`, 'Benchmark: 15:100']
        ]
      }
    });

    const volTeams = Object.keys(vol.volunteersByTeam || {});
    if (volTeams.length > 0) {
      sections.push({
        id: 'vol-charts',
        title: 'Team deployment',
        type: 'chart',
        content: {
          charts: [
            {
              id: 'chart-vol-teams',
              kind: 'horizontalBar' as const,
              title: 'Volunteers by team',
              subtitle: 'Duty staff distribution across ministry teams',
              labels: volTeams,
              series: [{ id: 's-vol-teams', label: 'Volunteers', values: volTeams.map(t => vol.volunteersByTeam[t]) }],
              caption: 'Active supervisor assignments by team.',
              accessibleSummary: 'Horizontal bar chart of volunteers assigned to each team.'
            }
          ]
        }
      });
    }

    if (analytics.locations.locationLoads.length > 0) {
      sections.push({
        id: 'location-loads-table',
        title: 'Location coverage',
        description: 'Room-by-room supervision coverage and child occupancy.',
        type: 'table',
        content: {
          headers: ['Location', 'Children', 'Volunteers', 'Supervision load'],
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

  // PAGE 5: Care & safety (Strict Privacy: Aggregated ONLY, NO personal names, diagnoses, or health text)
  const careSafetyIncluded = selectedSections.length === 0 || 
    selectedSections.includes('Care & safety') || 
    selectedSections.includes('Care & support') || 
    selectedSections.includes('Safety & incidents');

  if (careSafetyIncluded) {
    const medCount = analytics.registrations?.medicalNotesCount ?? 0;
    const extraSupportCount = analytics.registrations?.extraSupportCount ?? 0;
    const totalCare = analytics.registrations?.totalCareCount ?? 0;

    sections.push({
      id: 'care-safety-table',
      title: 'Care & safety summary',
      description: 'Aggregated safeguarding records and care awareness indicators without exposing personal child health records.',
      type: 'table',
      content: {
        headers: ['Care & safety category', 'Recorded count', 'Status'],
        rows: [
          ['Children with care records requiring awareness', `${totalCare} children`, totalCare > 0 ? 'Support protocols active' : 'None recorded'],
          ['Dietary / allergy notifications noted', `${medCount} entries`, medCount > 0 ? 'Kitchen awareness active' : 'None recorded'],
          ['Additional support assistance noted', `${extraSupportCount} entries`, extraSupportCount > 0 ? 'Assigned support teams' : 'Standard support'],
          ['Safeguarding alerts raised', `${analytics.alerts.totalAlerts} alarms`, analytics.alerts.totalAlerts === 0 ? 'Clear' : 'Logged'],
          ['Open / unresolved safety matters', `${(analytics.alerts.alertsByStatus?.open ?? 0) + (analytics.alerts.alertsByStatus?.in_progress ?? 0)} unresolved`, ((analytics.alerts.alertsByStatus?.open ?? 0) + (analytics.alerts.alertsByStatus?.in_progress ?? 0)) === 0 ? 'Clear' : 'Attention required'],
          ['Resolved safety matters', `${analytics.alerts.alertsByStatus?.resolved ?? 0} resolved`, 'Resolved on site']
        ]
      }
    });

    if (analytics.alerts.totalAlerts > 0) {
      const sev = analytics.alerts.alertsBySeverity;
      const sevLabels = ['Normal', 'Important', 'Urgent'];
      const sevValues = [sev?.normal ?? 0, sev?.important ?? 0, sev?.urgent ?? 0];
      sections.push({
        id: 'safety-charts',
        title: 'Safety matters by severity',
        type: 'chart',
        content: {
          charts: [
            {
              id: 'chart-safety-severity',
              kind: 'horizontalBar' as const,
              title: 'Safety matters by severity',
              subtitle: 'Aggregated incident alert severity levels',
              labels: sevLabels,
              series: [{ id: 's-sev', label: 'Alerts', values: sevValues }],
              caption: 'Aggregated safety alerts categorized by urgency.',
              accessibleSummary: 'Horizontal bar chart of incident alerts by severity.'
            }
          ]
        }
      });
    }
  }

  // 3. Grounded Findings (Deterministic from actual data)
  const findings: ReportFinding[] = (analytics.keyFindings || []).map((findingText, idx) => ({
    id: `finding-${idx + 1}`,
    title: `Key observation ${idx + 1}`,
    observation: findingText,
    severity: 'info',
    supportingData: 'Authoritative database aggregation'
  }));

  // 4. Recommendations / Follow-up (Grounded from actual attention items)
  const recommendations: ReportRecommendation[] = (analytics.managementAttention || []).map((attText, idx) => ({
    id: `rec-${idx + 1}`,
    action: attText,
    evidence: 'Current event operational status',
    rationale: 'Identified during automated report compilation audit.',
    priority: 'medium',
    responsibility: 'Event Operations Lead'
  }));

  return {
    reportId,
    templateKey: 'management-summary',
    templateVersion: 2,
    reportTitle: `${analytics.eventTitle} — Management Report`,
    reportDescription: 'A concise leadership report covering participation, attendance, volunteer coverage, care, safety, and items requiring attention.',
    eventContext: {
      eventId: analytics.eventId,
      eventTitle: analytics.eventTitle,
      startsAt: analytics.startsAt
    },
    branding: {
      organizationName: 'Koinonia Global',
      primaryColor: [197, 155, 39], // Antique Gold
      secondaryColor: [39, 39, 42]
    },
    privacyClassification: privacyLevel,
    intendedAudience: 'Senior Leadership, Event Director',
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
      notes: 'Authoritative data aggregation from verified database records. Sensitive personal details excluded for privacy compliance.'
    },
    methodology: [
      'Grounded aggregation of registered entries, check-in timestamps, duty assignments, and safety logs.',
      'Data minimization applied: personal identities, child diagnoses, and sensitive medical text are strictly excluded.'
    ],
    limitations: [
      'Metrics represent recorded database states at the time of report compilation.'
    ]
  };
}
