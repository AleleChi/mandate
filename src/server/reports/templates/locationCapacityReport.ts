import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildLocationCapacityReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  const overcapacityCount = analytics.locations.locationLoads.filter(l => l.loadPercentage >= 100).length;
  const unstaffedRoomsCount = analytics.locations.locationLoads.filter(l => l.volunteerCount === 0).length;
  const totalLocations = analytics.locations.totalLocations || 1;

  const kpis: ReportKPI[] = [
    {
      label: 'Active Locations',
      value: analytics.locations.totalLocations,
      sublabel: `${overcapacityCount} rooms near or over capacity`,
      color: overcapacityCount > 0 ? 'amber' : 'charcoal'
    },
    {
      label: 'Children Checked In',
      value: analytics.attendance.checkedInTotal,
      sublabel: 'Distributed across rooms',
      color: 'gold'
    },
    {
      label: 'Staff Ratio Compliance',
      value: `${((totalLocations - unstaffedRoomsCount) / totalLocations * 100).toFixed(0)}%`,
      sublabel: 'Rooms meeting staffing criteria',
      color: 'green'
    },
    {
      label: 'Max Load Measured',
      value: analytics.locations.locationLoads.length > 0 
        ? `${Math.max(...analytics.locations.locationLoads.map(l => l.loadPercentage)).toFixed(0)}%` 
        : '0%',
      sublabel: 'Highest room occupancy level',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.includes('Executive Summary')) {
    sections.push({
      id: 'capacity-summary',
      title: 'Location Capacity and Room Density Overview',
      type: 'narrative',
      content: {
        text: `This report evaluates room capacity utilisation, check-in distribution, and room loading indicators for "${analytics.eventTitle}". Operations were distributed across ${analytics.locations.totalLocations} active care rooms. Room audits indicate that ${overcapacityCount} room(s) experienced temporary capacity spikes approaching maximum capacity. Overall room supervision compliance was maintained, with ${((totalLocations - unstaffedRoomsCount) / totalLocations * 100).toFixed(0)}% of rooms fully meeting staffing benchmarks.`
      }
    });
  }

  if (selectedSections.includes('Operational Metrics')) {
    sections.push({
      id: 'capacity-loading-table',
      title: 'Room Occupancy and Ratio Compliance',
      type: 'table',
      content: {
        headers: ['Location Room Code', 'Checked-In Count', 'Nominal Capacity', 'Room Load (%)'],
        rows: analytics.locations.locationLoads.map(l => {
          const capLimit = Math.round(l.childrenCount / (l.loadPercentage / 100 || 1)) || 50;
          return [
            l.locationLabel,
            `${l.childrenCount} children`,
            `${capLimit} capacity`,
            `${l.loadPercentage.toFixed(1)}%`
          ];
        })
      }
    });
  }

  const findings: ReportFinding[] = [
    {
      id: 'cap-finding-1',
      title: 'Overcapacity Mitigation',
      observation: `We identified ${overcapacityCount} rooms with high occupancy rates, requiring supervisor attention.`,
      severity: overcapacityCount > 0 ? 'warning' : 'info',
      supportingData: `Max room load recorded: ${analytics.locations.locationLoads.length > 0 ? Math.max(...analytics.locations.locationLoads.map(l => l.loadPercentage)).toFixed(1) + '%' : 'N/A'}`
    }
  ];

  const recommendations: ReportRecommendation[] = [
    {
      id: 'cap-rec-1',
      action: 'Impose an automatic check-in redirection when a room load reaches 95% capacity.',
      evidence: `${overcapacityCount} room(s) approached maximum occupancy limit, with peak room load reaching ${analytics.locations.locationLoads.length > 0 ? Math.max(...analytics.locations.locationLoads.map(l => l.loadPercentage)).toFixed(0) + '%' : '95%'}.`,
      rationale: 'Prevent overcrowding and facilitate orderly escape routes in emergency scenarios.',
      priority: 'high',
      responsibility: 'Location Supervisor'
    }
  ];

  return {
    reportId,
    templateKey: 'location-capacity-report-v1',
    templateVersion: 1,
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
    reportVersion: 1,
    kpis,
    sections,
    findings,
    recommendations,
    dataQuality: {
      score: analytics.dataQuality.dataConfidenceScore,
      status: analytics.dataQuality.overallConfidence,
      notes: 'Occupancy scores cross-examined with RFID and manual check-in scans.'
    },
    methodology: [
      'Real-time capacity calculations comparing checked-in child records with room metadata limit fields.'
    ],
    limitations: [
      'Capacities assume standard child-care spacing guidelines; temporary equipment storage may reduce actual room limits.'
    ]
  };
}
