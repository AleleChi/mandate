import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildLocationCapacityReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const loads = analytics.locations.locationLoads || [];
  const overcapacityCount = loads.filter(l => l.loadPercentage >= 100).length;
  const unstaffedRoomsCount = loads.filter(l => l.volunteerCount === 0).length;
  const totalLocations = analytics.locations.totalLocations || loads.length || 0;
  const checkedInTotal = analytics.attendance.checkedInTotal || 0;

  const maxLoad = loads.length > 0 ? Math.max(...loads.map(l => l.loadPercentage)) : 0;

  const kpis: ReportKPI[] = [
    {
      label: 'Active locations',
      value: String(totalLocations),
      sublabel: `${loads.length} rooms occupied`,
      color: 'charcoal'
    },
    {
      label: 'Checked in',
      value: String(checkedInTotal),
      sublabel: 'Distributed across rooms',
      color: 'charcoal'
    },
    {
      label: 'Peak occupancy',
      value: loads.length > 0 ? `${maxLoad.toFixed(0)}%` : 'Unavailable',
      sublabel: 'Highest room occupancy level',
      color: 'charcoal'
    },
    {
      label: 'Rooms over capacity',
      value: String(overcapacityCount),
      sublabel: 'Rooms exceeding nominal limit',
      color: overcapacityCount > 0 ? 'charcoal' : 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.length === 0 || selectedSections.includes('Executive Summary') || selectedSections.includes('Capacity overview')) {
    sections.push({
      id: 'capacity-summary',
      title: 'Location capacity overview',
      type: 'narrative',
      content: {
        text: `This report evaluates room capacity utilisation and attendance distribution across ${totalLocations} venue locations for "${analytics.eventTitle}". A total of ${checkedInTotal} children checked in across care rooms. Room audits indicate that ${overcapacityCount} room(s) reached or exceeded their nominal capacity threshold during peak attendance, with the highest individual room load measured at ${loads.length > 0 ? maxLoad.toFixed(1) + '%' : 'N/A'}.`
      }
    });
  }

  if (selectedSections.length === 0 || selectedSections.includes('Operational Metrics') || selectedSections.includes('Room loading')) {
    if (loads.length > 0) {
      sections.push({
        id: 'capacity-loading-table',
        title: 'Room occupancy and supervision breakdown',
        type: 'table',
        content: {
          headers: ['Room', 'Children', 'Volunteers', 'Room load'],
          rows: loads.map(l => [
            l.locationLabel,
            `${l.childrenCount} children`,
            `${l.volunteerCount} volunteers`,
            `${l.loadPercentage.toFixed(1)}%`
          ])
        }
      });
    }
  }

  const findings: ReportFinding[] = [];
  if (overcapacityCount > 0) {
    findings.push({
      id: 'cap-finding-1',
      title: 'Capacity threshold exceeded',
      observation: `${overcapacityCount} room(s) exceeded nominal capacity limits during the event.`,
      severity: 'warning'
    });
  } else {
    findings.push({
      id: 'cap-finding-1',
      title: 'Normal occupancy levels',
      observation: 'All care rooms operated within established maximum occupancy thresholds.',
      severity: 'info'
    });
  }

  const recommendations: ReportRecommendation[] = [];
  if (overcapacityCount > 0) {
    const overLoaded = loads.filter(l => l.loadPercentage >= 100).map(l => l.locationLabel).join(', ');
    recommendations.push({
      id: 'cap-rec-1',
      action: `Review room capacity and intake allocation for ${overLoaded} before the next event.`,
      evidence: `${overcapacityCount} room(s) exceeded planned limits.`,
      rationale: 'Prevents overcrowding and preserves emergency egress lanes.',
      priority: 'high',
      responsibility: 'Venue Coordinator'
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'cap-rec-none',
      action: 'No immediate follow-up identified from the available event data.',
      evidence: 'All room loads were within planned capacity.',
      rationale: 'Standard venue allocations remain valid.',
      priority: 'low',
      responsibility: 'Venue Coordinator'
    });
  }

  return {
    reportId,
    templateKey: 'location-capacity-report-v1',
    templateVersion: 2,
    reportTitle: 'Location and Capacity Report',
    reportDescription: 'Evaluates location loading factors, room assignment vs. physical check-in counts, and capacity warning distributions.',
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
    intendedAudience: 'Super Admin, Location Supervisor',
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
      notes: 'Occupancy scores calculated from verified room assignment and check-in scans.'
    },
    methodology: [
      'Real-time capacity calculations comparing checked-in child records with room limits.'
    ],
    limitations: [
      'Room capacities reflect configured room metadata.'
    ]
  };
}
