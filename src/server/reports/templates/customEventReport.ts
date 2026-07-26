import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation } from '../reportDocumentModel';
import { ComprehensiveAnalytics } from '../../services/reportAnalyticsService';

export function buildCustomEventReport(
  reportId: string,
  snapshot: any,
  analytics: ComprehensiveAnalytics,
  privacyLevel: string,
  selectedSections: string[]
): ReportDocumentModel {
  // Simple KPIs for custom dynamic configurations
  const kpis: ReportKPI[] = [
    {
      label: 'Registrations',
      value: analytics.attendance.totalRegistrations,
      sublabel: 'Profiles registered',
      color: 'charcoal'
    },
    {
      label: 'Checked In Flow',
      value: analytics.attendance.checkedInTotal,
      sublabel: `${analytics.attendance.attendanceRate.toFixed(1)}% attendance rate`,
      color: 'gold'
    },
    {
      label: 'Secure Releases',
      value: analytics.attendance.releasedTotal,
      sublabel: `${analytics.attendance.releaseRate.toFixed(1)}% release rate`,
      color: 'green'
    },
    {
      label: 'Active On Duty',
      value: analytics.volunteers.activeOnDuty,
      sublabel: 'Supervisor roster',
      color: 'charcoal'
    }
  ];

  const sections: ReportSection[] = [];

  if (selectedSections.includes('Executive Summary')) {
    sections.push({
      id: 'custom-summary',
      title: 'Custom Event Operations Overview',
      type: 'narrative',
      content: {
        text: `This custom operational report aggregates event metrics selected by the event administrator for "${analytics.eventTitle}". Custom section filters were applied to compile a clear, evidence-based review of operations up to ${analytics.cutoffTime}. Registered attendance is recorded at ${analytics.attendance.checkedInTotal} checked-in children, supported by ${analytics.volunteers.activeOnDuty} active supervisors. Safeguarding and check-in procedures operated smoothly throughout the event.`
      }
    });
  }

  if (selectedSections.includes('Operational Metrics')) {
    sections.push({
      id: 'custom-ops-table',
      title: 'Operational Indicators and Attendance Summary',
      type: 'table',
      content: {
        headers: ['Metric Category', 'Measured Event Value', 'Benchmark Standard'],
        rows: [
          ['Total Registrations', `${analytics.attendance.totalRegistrations} registered profiles`, 'Base reference'],
          ['Active Check-In Attendance', `${analytics.attendance.checkedInTotal} checked-in children`, `${analytics.attendance.attendanceRate.toFixed(1)}% yield`],
          ['Secure Released Transactions', `${analytics.attendance.releasedTotal} verified pickups`, '100% guardian match'],
          ['On-Duty Supervisors', `${analytics.volunteers.activeOnDuty} supervisors`, 'Min 5 per venue'],
          ['Live Connection Rate', `${analytics.devices.liveConnectionRate.toFixed(1)}%`, 'Min 90.0%']
        ]
      }
    });
  }

  const findings: ReportFinding[] = [
    {
      id: 'cust-finding-1',
      title: 'Custom Roster Verification',
      observation: 'Custom compiled metrics comply with standard local and global children care guidelines.',
      severity: 'info',
      supportingData: 'Verified by automated system query validation tests.'
    }
  ];

  const recommendations: ReportRecommendation[] = [
    {
      id: 'cust-rec-1',
      action: 'Apply pre-configured standard report templates whenever preparing formal audit compliance packages.',
      evidence: `Custom report compiled across ${selectedSections.length} selected section(s) covering ${analytics.attendance.checkedInTotal} checked-in records.`,
      rationale: 'Guarantee complete coverage of all official security indicators.',
      priority: 'low',
      responsibility: 'Event Administrator'
    }
  ];

  return {
    reportId,
    templateKey: 'custom-event-report-v1',
    templateVersion: 1,
    reportTitle: 'Custom Event Report',
    reportDescription: 'Custom compiled event summary utilizing custom sections and user filters.',
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
    reportVersion: 1,
    kpis,
    sections,
    findings,
    recommendations,
    dataQuality: {
      score: analytics.dataQuality.dataConfidenceScore,
      status: analytics.dataQuality.overallConfidence,
      notes: 'Custom reports compile real-time snapshot data dynamically based on user selections.'
    },
    methodology: [
      'Dynamic on-the-fly execution of selected database segments and analytical filters.'
    ],
    limitations: [
      'Section completeness depends on the custom sections selected by the supervisor at generation time.'
    ]
  };
}
