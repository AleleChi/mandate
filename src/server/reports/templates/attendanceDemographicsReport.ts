import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildAttendanceDemographicsReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  // Canonical Metrics Traceable to Snapshot
  const totalRegistrations = analytics.attendance.totalRegistrations || 0;
  const selectedTotal = analytics.attendance.expectedTotal || 0;
  const checkedInTotal = analytics.attendance.checkedInTotal || 0;
  const insideTotal = analytics.attendance.insideTotal || 0;
  const releasedTotal = analytics.attendance.releasedTotal || 0;
  const notArrivedTotal = analytics.attendance.notArrivedTotal || Math.max(0, selectedTotal - checkedInTotal);
  
  // Reconciled Canonical Rates (Protected against zero denominators)
  const attendanceRate = selectedTotal > 0 ? (checkedInTotal / selectedTotal) * 100 : 0;
  const selectionRate = totalRegistrations > 0 ? (selectedTotal / totalRegistrations) * 100 : 0;
  const releaseRate = checkedInTotal > 0 ? (releasedTotal / checkedInTotal) * 100 : 0;
  const overallYieldRate = totalRegistrations > 0 ? (checkedInTotal / totalRegistrations) * 100 : 0;

  const recordsNeedingConfirmation = Array.isArray(snapshot.attendanceRecords)
    ? snapshot.attendanceRecords.filter((r: any) => !r.check_in_time || r.needs_review).length
    : 0;

  // 1. Key Figures (Plain English, non-technical, leadership focused)
  const kpis: ReportKPI[] = [
    {
      label: 'Registered',
      value: String(totalRegistrations),
      sublabel: 'Applications received',
      color: 'charcoal'
    },
    {
      label: 'Selected',
      value: String(selectedTotal),
      sublabel: `${selectionRate.toFixed(0)}% selection rate`,
      color: 'charcoal'
    },
    {
      label: 'Children checked in',
      value: String(checkedInTotal),
      sublabel: `${attendanceRate.toFixed(0)}% of selected`,
      color: 'charcoal'
    },
    {
      label: 'Children still inside',
      value: String(insideTotal),
      sublabel: 'In care rooms right now',
      color: 'charcoal'
    },
    {
      label: 'Children picked up',
      value: String(releasedTotal),
      sublabel: `${releaseRate.toFixed(0)}% of checked in`,
      color: 'charcoal'
    },
    {
      label: 'Attendance rate',
      value: `${attendanceRate.toFixed(1)}%`,
      sublabel: 'Of selected children',
      color: 'charcoal'
    }
  ];

  // 2. Report Sections
  const sections: ReportSection[] = [];

  // Section C: "What this report shows"
  const summaryIncluded = selectedSections.length === 0 ||
    selectedSections.includes('Executive Summary') ||
    selectedSections.includes('Leadership overview') ||
    selectedSections.includes('Executive summary') ||
    selectedSections.includes('What this report shows') ||
    selectedSections.includes('Attendance & movement');

  if (summaryIncluded) {
    const arrivalNarrative = analytics.attendance.peakCheckInHour && analytics.attendance.peakCheckInHour !== 'Information not available'
      ? `Arrivals peaked during the ${analytics.attendance.peakCheckInHour} window.`
      : 'Arrivals were recorded at reception check-in stations.';

    const narrativeText = `This report gives ministry leadership a clear picture of attendance, age group turnout, and child movement for "${analytics.eventTitle}". It shows how many children were invited, how many arrived on the day, how many have been picked up, and who is still in our care.\n\nA total of ${totalRegistrations} children registered, and ${selectedTotal} were selected to attend (${selectionRate.toFixed(1)}% selection rate). On event day, ${checkedInTotal} children arrived and checked in, giving an attendance rate of ${attendanceRate.toFixed(1)}% among selected children. ${arrivalNarrative} So far, ${releasedTotal} children have been safely picked up by registered parents or guardians, while ${insideTotal} children are still inside their activity rooms. ${notArrivedTotal} selected children did not arrive.`;

    sections.push({
      id: 'attendance-overview',
      title: 'What this report shows',
      description: 'Overview of attendance, participant selection, and movement flow on event day.',
      type: 'narrative',
      content: { text: narrativeText }
    });
  }

  // Section: Cohort Age Distribution & Attendance
  const demographicsIncluded = selectedSections.length === 0 ||
    selectedSections.includes('Operational Metrics') ||
    selectedSections.includes('Cohort age distribution and attendance') ||
    selectedSections.includes('Age groups') ||
    selectedSections.includes('Attendance & movement') ||
    selectedSections.includes('Participation profile');

  if (demographicsIncluded) {
    const cohortDisplayMap: { [key: string]: string } = {
      'Under 4': 'Under 4s (Nursery & Toddlers)',
      'Ages 4 to 6': 'Ages 4 to 6 (Pre-Primary)',
      'Ages 7 to 9': 'Ages 7 to 9 (Primary)',
      'Ages 10 to 12': 'Ages 10 to 12 (Pre-Teens)',
      'Teens': 'Teens (13+ Years)',
      'Unspecified': 'Unspecified Age Group'
    };

    const ageKeys = Object.keys(analytics.attendance.ageGroupDistribution || {});
    const ageRows = ageKeys.map(ag => {
      const stats = analytics.attendance.ageGroupDistribution[ag];
      const rate = stats.expected > 0 ? (stats.checkedIn / stats.expected) * 100 : 0;
      const displayLabel = cohortDisplayMap[ag] || ag;
      return [
        displayLabel,
        String(stats.registered),
        String(stats.expected),
        String(stats.checkedIn),
        `${rate.toFixed(1)}%`
      ];
    });

    sections.push({
      id: 'demographics-table',
      title: 'Age groups and attendance',
      description: 'Breakdown of registered, selected, and checked-in children across age groups.',
      type: 'table',
      content: {
        headers: ['Age group', 'Registered', 'Selected', 'Checked in', 'Attendance rate'],
        rows: ageRows.length > 0 ? ageRows : [['All age groups', String(totalRegistrations), String(selectedTotal), String(checkedInTotal), `${attendanceRate.toFixed(1)}%`]],
        caption: 'Attendance rate represents checked-in children divided by selected children in each age group.'
      }
    });

    // Chart 1: Donut Chart - Attendance Status Composition (Immediate leadership understanding)
    sections.push({
      id: 'attendance-status-composition',
      title: 'Attendance status of selected children',
      description: 'Current status of selected participants across care rooms, picked up, and not arrived.',
      type: 'chart',
      content: {
        charts: [
          {
            id: 'chart-status-composition',
            kind: 'donut',
            title: 'Attendance Status of Selected Children',
            subtitle: 'Children still inside, Children picked up, and Not arrived',
            labels: ['Children still inside', 'Children picked up', 'Did not arrive'],
            series: [
              {
                id: 's-status',
                label: 'Children',
                values: [insideTotal, releasedTotal, notArrivedTotal]
              }
            ],
            unit: 'count',
            valueFormat: 'integer',
            caption: `${insideTotal} children in activity rooms, ${releasedTotal} picked up, ${notArrivedTotal} did not arrive.`,
            accessibleSummary: 'Donut chart showing children inside rooms, picked up, and not arrived.',
            emptyState: 'No attendance records available yet.'
          }
        ]
      }
    });

    // Chart 2: Grouped Bar Chart - Attendance by Age Group (Registered vs Selected vs Attended)
    if (ageKeys.length > 0) {
      const chartLabels = ageKeys.map(k => cohortDisplayMap[k]?.replace(/\s*\(.*?\)/, '') || k);
      const regValues = ageKeys.map(k => analytics.attendance.ageGroupDistribution[k].registered);
      const selValues = ageKeys.map(k => analytics.attendance.ageGroupDistribution[k].expected);
      const checkValues = ageKeys.map(k => analytics.attendance.ageGroupDistribution[k].checkedIn);

      sections.push({
        id: 'age-cohort-chart',
        title: 'Age group participation',
        description: 'Comparing registered, selected, and checked-in children across age groups.',
        type: 'chart',
        content: {
          charts: [
            {
              id: 'chart-age-cohort-comparison',
              kind: 'bar',
              title: 'Age Group Participation',
              subtitle: 'Registered vs Selected vs Checked in by age group',
              labels: chartLabels,
              series: [
                { id: 's-registered', label: 'Registered', values: regValues },
                { id: 's-selected', label: 'Selected', values: selValues },
                { id: 's-checkedin', label: 'Checked in', values: checkValues }
              ],
              unit: 'count',
              valueFormat: 'integer',
              caption: 'Turnout comparison across configured age groups.',
              accessibleSummary: 'Bar chart showing registered, selected, and checked-in children by age group.',
              emptyState: 'No age group attendance records available yet.'
            }
          ]
        }
      });
    }

    // Chart 3: Arrival and Pickup Activity Over Time (Real timestamps only — honest empty state)
    const arrivalSeries = (analytics.attendance.checkInTimeSeries || []).filter(d => d.count > 0);
    const pickupSeries = (analytics.attendance.pickupTimeSeries || []).filter(d => d.count > 0);
    const hasTimelineData = arrivalSeries.length > 0 || pickupSeries.length > 0;

    if (hasTimelineData) {
      const allHoursSet = new Set([...arrivalSeries.map(d => d.hour), ...pickupSeries.map(d => d.hour)]);
      const journeyHours = Array.from(allHoursSet).sort();
      const arrivalValues = journeyHours.map(h => arrivalSeries.find(d => d.hour === h)?.count || 0);
      const pickupValues = journeyHours.map(h => pickupSeries.find(d => d.hour === h)?.count || 0);

      sections.push({
        id: 'arrival-pickup-timeline',
        title: 'Arrival and pickup activity',
        description: 'Movement recorded at check-in stations and pickup areas over the event.',
        type: 'chart',
        content: {
          charts: [
            {
              id: 'chart-arrival-pickup-activity',
              kind: 'bar',
              title: 'Arrival & Pickup Activity Over Time',
              subtitle: 'Hourly volume of check-in entries and completed releases',
              labels: journeyHours,
              series: [
                { id: 's-arrivals', label: 'Check-in arrivals', values: arrivalValues },
                { id: 's-pickups', label: 'Pickups completed', values: pickupValues }
              ],
              unit: 'count',
              valueFormat: 'integer',
              caption: `${checkedInTotal} arrivals and ${releasedTotal} pickups recorded in event logs.`,
              accessibleSummary: 'Bar chart showing hourly arrivals and pickups over the event timeline.',
              emptyState: 'Arrival and pickup times were not recorded in enough detail to show an hourly trend.'
            }
          ]
        }
      });
    } else {
      sections.push({
        id: 'arrival-pickup-timeline-empty',
        title: 'Arrival and pickup activity',
        description: 'Movement recorded at check-in stations and pickup areas over the event.',
        type: 'chart',
        content: {
          charts: [
            {
              id: 'chart-arrival-pickup-empty',
              kind: 'bar',
              title: 'Arrival & Pickup Activity Over Time',
              subtitle: 'Hourly volume of check-in entries and completed releases',
              labels: [],
              series: [],
              emptyState: 'No pickup activity or check-in timeline recorded yet.'
            }
          ]
        }
      });
    }

    // Chart 4: Location Distribution (Only if real location data exists)
    if (analytics.locations?.locationLoads && analytics.locations.locationLoads.length > 0) {
      const locLoads = analytics.locations.locationLoads;
      sections.push({
        id: 'location-distribution',
        title: 'Children in each room',
        description: 'Room-by-room distribution of checked-in children across designated rooms.',
        type: 'chart',
        content: {
          charts: [
            {
              id: 'chart-location-distribution',
              kind: 'horizontalBar',
              title: 'Children by Location',
              subtitle: 'Checked-in children count per room',
              labels: locLoads.map(l => l.locationLabel),
              series: [
                {
                  id: 's-loc-load',
                  label: 'Children',
                  values: locLoads.map(l => l.childrenCount)
                }
              ],
              unit: 'count',
              valueFormat: 'integer',
              caption: 'Room distribution reflects confirmed room assignments.',
              accessibleSummary: 'Horizontal bar chart showing children count per venue room.',
              emptyState: 'No room distribution records available yet.'
            }
          ]
        }
      });
    }
  }

  // 3. Key Observations (Plain English, strictly deterministic from actual numbers)
  const findings: ReportFinding[] = [];

  // Deterministic: Age group with highest turnout
  const cohortsWithExpected = (analytics.attendance.ageGroupAttendance || []).filter(a => a.expected > 0);
  if (cohortsWithExpected.length > 0) {
    const sortedByRate = [...cohortsWithExpected].sort((a, b) => b.attendanceRate - a.attendanceRate);
    const highest = sortedByRate[0];
    const lowest = sortedByRate[sortedByRate.length - 1];

    if (highest) {
      findings.push({
        id: 'finding-highest-cohort',
        title: 'Highest age group turnout',
        observation: `${highest.ageGroup} had the highest attendance rate at ${highest.attendanceRate.toFixed(1)}% (${highest.attended} attended of ${highest.expected} selected).`,
        severity: 'info'
      });
    }

    if (lowest && lowest.ageGroup !== highest?.ageGroup && lowest.attendanceRate < 100) {
      findings.push({
        id: 'finding-lowest-cohort',
        title: 'Lowest age group turnout',
        observation: `${lowest.ageGroup} recorded an attendance rate of ${lowest.attendanceRate.toFixed(1)}% (${lowest.attended} attended of ${lowest.expected} selected).`,
        severity: 'info'
      });
    }
  }

  // Deterministic: Non-arrivals
  if (notArrivedTotal > 0) {
    findings.push({
      id: 'finding-non-arrivals',
      title: 'Invited children who did not arrive',
      observation: `${notArrivedTotal} selected children did not arrive on event day (${((notArrivedTotal / (selectedTotal || 1)) * 100).toFixed(1)}% of selected).`,
      severity: 'info'
    });
  }

  // Deterministic: Peak check-in interval
  if (analytics.attendance.peakCheckInHour && analytics.attendance.peakCheckInHour !== 'Information not available') {
    findings.push({
      id: 'finding-peak-checkin',
      title: 'Peak arrival time',
      observation: `Most children arrived during the ${analytics.attendance.peakCheckInHour} window, accounting for the busiest check-in period.`,
      severity: 'info'
    });
  }

  // Deterministic: Children still inside
  if (insideTotal > 0) {
    findings.push({
      id: 'finding-inside-now',
      title: 'Children still inside',
      observation: `${insideTotal} children are currently checked in across activity rooms awaiting pickup.`,
      severity: 'follow-up required'
    });
  }

  // 4. Action Points (Explicit rule-based actions only when supported by real data)
  const recommendations: ReportRecommendation[] = [];

  // Rule 1: Outstanding pickups
  if (insideTotal > 0) {
    recommendations.push({
      id: 'action-pending-pickups',
      action: 'Confirm pickup and safe release for all children still in activity rooms.',
      evidence: `${insideTotal} children remain checked in, while ${releasedTotal} pickups are completed.`,
      rationale: 'Ensures every child is accounted for and safely handed over to registered parents before closing.',
      priority: 'high',
      responsibility: 'Pickup Lead'
    });
  }

  // Rule 2: Location overcapacity
  const overcapacityLocations = (analytics.locations?.locationLoads || []).filter(l => l.loadPercentage >= 100);
  if (overcapacityLocations.length > 0) {
    const locNames = overcapacityLocations.map(l => l.locationLabel).join(', ');
    recommendations.push({
      id: 'action-location-capacity',
      action: `Review room allocation and spacing for ${locNames} before the next event.`,
      evidence: `${overcapacityLocations.length} room(s) reached or exceeded 100% capacity during peak check-in.`,
      rationale: 'Ensures safe physical spacing and comfortable supervision ratios.',
      priority: 'high',
      responsibility: 'Venue Coordinator'
    });
  }

  // Rule 3: Attendance records needing review
  if (recordsNeedingConfirmation > 0) {
    recommendations.push({
      id: 'action-record-review',
      action: `Confirm and sign off on ${recordsNeedingConfirmation} unverified attendance records.`,
      evidence: `${recordsNeedingConfirmation} attendance records are flagged for coordinator review.`,
      rationale: 'Ensures clean and complete attendance records for ministry archives.',
      priority: 'medium',
      responsibility: 'Attendance Coordinator'
    });
  }

  // Default if no rules triggered
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'action-none',
      action: 'No immediate follow-up required from the available event data.',
      evidence: 'All check-in, pickup, and venue capacity indicators are accounted for.',
      rationale: 'Routine event closure procedures apply.',
      priority: 'low',
      responsibility: 'Operations Lead'
    });
  }

  // 5. Notes & Verification (Short, factual, plain English)
  const dataNotes: string[] = [
    `Total applications received: ${totalRegistrations}.`,
    `Selected participants: ${selectedTotal}.`,
    `Confirmed check-ins: ${checkedInTotal}.`,
    `Confirmed pickups: ${releasedTotal}.`
  ];

  if (snapshot.childrenWithMissingAge && snapshot.childrenWithMissingAge > 0) {
    dataNotes.push(`${snapshot.childrenWithMissingAge} child records have missing birth date information.`);
  }
  if (snapshot.childrenWithMissingPhone && snapshot.childrenWithMissingPhone > 0) {
    dataNotes.push(`${snapshot.childrenWithMissingPhone} records have missing parent contact numbers.`);
  }
  if (recordsNeedingConfirmation > 0) {
    dataNotes.push(`${recordsNeedingConfirmation} records are awaiting final administrative confirmation.`);
  }

  return {
    reportId,
    templateKey: 'attendance-demographics-report-v1',
    templateVersion: 2,
    reportTitle: 'Attendance and Demographics Report',
    reportDescription: 'Analysis of event registrations, participant selection, check-in yield, age cohort demographics, and movement flow.',
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
    intendedAudience: 'Ministry Leadership, Attendance Lead',
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
      notes: dataNotes.join(' ')
    },
    methodology: [
      'Attendance rate is calculated as confirmed check-ins divided by selected children.',
      'Selection rate is calculated as selected children divided by total applications received.',
      'Movement timestamps are captured at digital gate check-in and pickup points.'
    ],
    limitations: [
      'Data represents verified system records captured up to the cutoff timestamp.',
      'Physical room attendance figures reflect confirmed terminal scans.'
    ]
  };
}
