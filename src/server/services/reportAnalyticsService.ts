import { parse } from 'path';

// Helper to parse dates safely
export function parseDate(val: any): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// Age Cohort Normalisation helper to eliminate duplicate group labels
export function normalizeAgeGroupLabel(raw: string | undefined | null): string {
  if (!raw) return 'Unspecified';
  const str = String(raw).trim();
  const lower = str.toLowerCase().replace(/\s+/g, ' ');

  if (
    lower.includes('under 4') ||
    lower.includes('nursery') ||
    lower.includes('toddler') ||
    lower.includes('0-3') ||
    lower.includes('0–3') ||
    lower.includes('0 to 3') ||
    lower.includes('0 - 3')
  ) {
    return 'Under 4';
  }
  if (
    lower.includes('4-6') ||
    lower.includes('4–6') ||
    lower.includes('4 to 6') ||
    lower.includes('4 - 6') ||
    lower.includes('pre-primary') ||
    lower.includes('kg') ||
    lower.includes('ages 4')
  ) {
    return 'Ages 4 to 6';
  }
  if (
    lower.includes('7-9') ||
    lower.includes('7–9') ||
    lower.includes('7 to 9') ||
    lower.includes('7 - 9') ||
    lower.includes('primary') ||
    lower.includes('ages 7')
  ) {
    return 'Ages 7 to 9';
  }
  if (
    lower.includes('10-12') ||
    lower.includes('10–12') ||
    lower.includes('10 to 12') ||
    lower.includes('10 - 12') ||
    lower.includes('pre-teens') ||
    lower.includes('pre teens') ||
    lower.includes('ages 10')
  ) {
    return 'Ages 10 to 12';
  }
  if (
    lower.includes('13') ||
    lower.includes('teen') ||
    lower.includes('teens') ||
    lower.includes('jss') ||
    lower.includes('sss')
  ) {
    return 'Teens';
  }
  return str;
}

// Median helper
export function getMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Percentile helper
export function getPercentile(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Helper to format duration beautifully
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ${remainingSeconds > 0 ? remainingSeconds + ' second' + (remainingSeconds > 1 ? 's' : '') : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes > 0 ? remainingMinutes + ' minute' + (remainingMinutes > 1 ? 's' : '') : ''}`;
}

export interface RegistrationAnalytics {
  totalRegistrations: number;
  selectedTotal: number;
  underReviewTotal: number;
  waitlistTotal: number;
  notSelectedTotal: number;
  selectionRate: number;
  registrationOutcomes: { label: string; count: number }[];
  registrationsByAgeGroup: { [key: string]: number };
  medicalNotesCount: number;
  extraSupportCount: number;
  totalCareCount: number;
}

export interface AttendanceAnalytics {
  totalRegistrations: number;
  expectedTotal: number;
  checkedInTotal: number;
  insideTotal: number;
  releasedTotal: number;
  notArrivedTotal: number;
  attendanceRate: number;
  releaseRate: number;
  pendingRelease: number;
  peakCheckInHour: string;
  peakPickupHour: string;
  checkInTimeSeries: { hour: string; count: number }[];
  pickupTimeSeries: { hour: string; count: number }[];
  ageGroupDistribution: { [key: string]: { registered: number; expected: number; checkedIn: number; released: number } };
  ageGroupAttendance: { ageGroup: string; expected: number; attended: number; attendanceRate: number }[];
  genderDistribution: { [key: string]: number };
}

export interface VolunteerAnalytics {
  /** Currently-valid distinct volunteers assigned to the selected event */
  totalApproved: number;
  /** Currently-valid distinct volunteers on duty for the selected event */
  activeOnDuty: number;
  /** Turnout percentage of assigned volunteers who are on duty */
  participationRate: number;
  /** Distinct assigned volunteers by responsibility */
  volunteersByResponsibility: { [key: string]: number };
  /** Distinct assigned volunteers by team */
  volunteersByTeam: { [key: string]: number };
  /** Legacy ratio metric */
  volunteersPer100Children: number;
  /** Human-readable ratio string (e.g. "1 : 12" or "Not available") */
  ratioText: string;
  /** Human-readable ratio sublabel (e.g. "1 volunteer per 12 children") */
  ratioSublabel: string;
  /** Number of event locations with no active volunteers */
  coverageGaps: number;
  /** Total approved volunteers currently active in the ministry directory */
  totalRosterVolunteers: number;
  /** Structured team deployment for charts: team, assigned, onDuty */
  teamDeployment: { team: string; assigned: number; onDuty: number }[];
  /** Breakdown by volunteer duty status */
  dutyStatusComposition: { status: string; count: number }[];
  /** Distinct assigned volunteers by location ID */
  volunteersByLocation: { [locationId: string]: number };
  /** Locations with at least one active volunteer */
  staffedLocationsCount: number;
  /** Total relevant event locations */
  totalLocationsCount: number;
  /** Room coverage percentage */
  roomCoverageScore: number;
}

export interface DeviceReadinessAnalytics {
  totalDevices: number;
  readyDevices: number;
  limitedDevices: number;
  needsAttentionDevices: number;
  readinessRate: number;
  soundUnlockRate: number;
  webPushReadinessRate: number;
  liveConnectionRate: number;
}

export interface LocationAnalytics {
  totalLocations: number;
  fullyCoveredLocations: number;
  limitedCoveredLocations: number;
  uncoveredLocations: number;
  locationLoads: { locationLabel: string; childrenCount: number; volunteerCount: number; loadPercentage: number }[];
}

export interface AlertAnalytics {
  totalAlerts: number;
  alertsBySeverity: { normal: number; important: number; urgent: number };
  alertsByCategory: { [key: string]: number };
  alertsByStatus: { open: number; in_progress: number; resolved: number; reopened: number };
  medianAcknowledgementTimeSeconds: number | null;
  percentile75AcknowledgementTimeSeconds: number | null;
  percentile90AcknowledgementTimeSeconds: number | null;
  medianResolutionTimeSeconds: number | null;
  alertsPer100Children: number;
  targetAcknowledgementRate: number; // % within 45s
  targetResolutionRate: number; // % within 5m
}

export interface IncidentAnalytics {
  totalIncidents: number;
  incidentsByCategory: { [key: string]: number };
  incidentsByStatus: { [key: string]: number };
  totalFollowUps: number;
  completedFollowUps: number;
  followUpCompletionRate: number;
  overdueFollowUps: number;
}

export interface EscalationAnalytics {
  totalEscalations: number;
  escalationRate: number; // % of alerts escalated
  maxEscalationLevelReached: number;
  escalatedAlertsCount: number;
}

export interface PickupAnalytics {
  totalReleases: number;
  releaseRate: number;
  verificationByMethod: { [key: string]: number };
  pickupConcernsCount: number;
  verificationFailuresCount: number;
  escalationsToLeadCount: number;
}

export interface OfflineAnalytics {
  totalInterruptions: number;
  affectedDevicesCount: number;
  /** Null when actual offline duration data is not recorded in the database. */
  totalOfflineDurationSeconds: number | null;
  /** Null when actual offline duration data is not recorded in the database. */
  averageOfflineDurationSeconds: number | null;
  queuedActionsCount: number;
  confirmedQueuedCount: number;
  conflictQueuedCount: number;
  failedQueuedCount: number;
}

export interface TrainingAnalytics {
  programmeName: string;
  scenarioTitle: string;
  sessionDurationSeconds: number;
  participantsCount: number;
  objectivesCount: number;
  objectivesCompletedCount: number;
  objectivesGuidedCount: number;
  objectivesPartialCount: number;
  objectivesNeedsPracticeCount: number;
  medianAckTimeSeconds: number | null;
  medianResolutionTimeSeconds: number | null;
}

export interface DataQualityReport {
  overallConfidence: 'High confidence' | 'Moderate confidence' | 'Limited information';
  recordsComplete: number;
  recordsIncomplete: number;
  missingLocationCount: number;
  missingTimestampsCount: number;
  unresolvedCheckInCount: number;
  dataConfidenceScore: number; // 0-100
}

export interface GroundedInsight {
  type: 'strength' | 'weakness' | 'neutral' | 'recommendation';
  category: string;
  finding: string;
  supportingData: string;
  recommendation: string;
}

export interface EventComparisonReport {
  isComparable: boolean;
  comparisonMessage?: string;
  comparisonEventTitle?: string;
  startsAt?: string;
  attendanceDiffPercentagePoints?: number;
  alertsDiffPer100Children?: number;
  volunteersDiffCount?: number;
  readinessDiffPercentagePoints?: number;
}

export interface ComprehensiveAnalytics {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  cutoffTime: string;
  timezone: string;
  registrations: RegistrationAnalytics;
  attendance: AttendanceAnalytics;
  volunteers: VolunteerAnalytics;
  devices: DeviceReadinessAnalytics;
  locations: LocationAnalytics;
  alerts: AlertAnalytics;
  incidents: IncidentAnalytics;
  escalations: EscalationAnalytics;
  pickup: PickupAnalytics;
  offline: OfflineAnalytics;
  training?: TrainingAnalytics;
  dataQuality: DataQualityReport;
  insights: GroundedInsight[];
  keyFindings?: string[];
  managementAttention?: string[];
  comparison?: EventComparisonReport;
}

export function calculateAnalytics(snapshot: any): ComprehensiveAnalytics {
  const cutoffTime = snapshot.cutoffTime || new Date().toISOString();
  const timezone = snapshot.timezone || 'Africa/Lagos';

  if (snapshot.session) {
    // RUN TRAINING SCENARIO DRILL ANALYTICS
    return calculateTrainingAnalyticsForSnapshot(snapshot, cutoffTime, timezone);
  }

  // RUN PRODUCTION EVENT OPERATIONAL ANALYTICS
  const eventId = snapshot.event?.id || 'event-ga-2026';
  const eventTitle = snapshot.event?.title || 'The General Assembly';
  const startsAt = snapshot.event?.starts_at || '2026-11-18';

  // 1. Registrations & Selection
  const childEntries = snapshot.childEntries || [];
  const totalRegistrations = childEntries.length;
  const selectedStatuses = ['selected', 'pass_ready', 'checked_in', 'inside', 'picked_up'];
  const selectedEntries = childEntries.filter((c: any) => selectedStatuses.includes(c.status));
  const selectedTotal = selectedEntries.length;
  const underReviewEntries = childEntries.filter((c: any) => c.status === 'under_review' || c.status === 'pending_review');
  const underReviewTotal = underReviewEntries.length;
  const waitlistEntries = childEntries.filter((c: any) => c.status === 'waiting_list' || c.status === 'waitlist');
  const waitlistTotal = waitlistEntries.length;
  const notSelectedEntries = childEntries.filter((c: any) => c.status === 'not_selected' || c.status === 'rejected');
  const notSelectedTotal = notSelectedEntries.length;
  const selectionRate = totalRegistrations > 0 ? (selectedTotal / totalRegistrations) * 100 : 0;

  const registrationOutcomes = [
    { label: 'Selected', count: selectedTotal },
    { label: 'Awaiting review', count: underReviewTotal },
    { label: 'Waiting list', count: waitlistTotal },
    { label: 'Not selected', count: notSelectedTotal }
  ];

  const registrationsByAgeGroup: { [key: string]: number } = {};
  let medicalNotesCount = 0;
  let extraSupportCount = 0;
  let totalCareCount = 0;

  childEntries.forEach((c: any) => {
    const ag = normalizeAgeGroupLabel(c.age_group);
    registrationsByAgeGroup[ag] = (registrationsByAgeGroup[ag] || 0) + 1;
    if (c.has_medical_notes === 1 || c.has_medical_notes === true) medicalNotesCount++;
    if (c.needs_extra_support === 1 || c.needs_extra_support === true) extraSupportCount++;
    if (c.has_medical_notes === 1 || c.needs_extra_support === 1 || c.needs_age_review === 1) totalCareCount++;
  });

  const registrations: RegistrationAnalytics = {
    totalRegistrations,
    selectedTotal,
    underReviewTotal,
    waitlistTotal,
    notSelectedTotal,
    selectionRate,
    registrationOutcomes,
    registrationsByAgeGroup,
    medicalNotesCount,
    extraSupportCount,
    totalCareCount
  };

  // 2. Attendance & Child Flow
  const expectedTotal = selectedTotal;
  const checkedInEntries = childEntries.filter((c: any) => 
    ['checked_in', 'inside', 'picked_up'].includes(c.status) || !!c.checked_in_at
  );
  const checkedInTotal = checkedInEntries.length;
  const releasedEntries = childEntries.filter((c: any) => 
    c.status === 'picked_up' || !!c.picked_up_at
  );
  const releasedTotal = releasedEntries.length;
  const insideEntries = childEntries.filter((c: any) => 
    c.status === 'inside' || (c.status === 'checked_in' && !c.picked_up_at) || (!!c.checked_in_at && !c.picked_up_at)
  );
  const insideTotal = insideEntries.length;
  const notArrivedTotal = Math.max(0, expectedTotal - checkedInTotal);
  const attendanceRate = expectedTotal > 0 ? (checkedInTotal / expectedTotal) * 100 : 0;
  const releaseRate = checkedInTotal > 0 ? (releasedTotal / checkedInTotal) * 100 : 0;
  const pendingRelease = insideTotal;

  // Time Series
  const checkInHourMap: { [key: string]: number } = {};
  const pickupHourMap: { [key: string]: number } = {};

  checkedInEntries.forEach((c: any) => {
    const d = parseDate(c.checked_in_at);
    if (d) {
      const hourStr = d.getUTCHours().toString().padStart(2, '0') + ':00';
      checkInHourMap[hourStr] = (checkInHourMap[hourStr] || 0) + 1;
    }
  });

  releasedEntries.forEach((c: any) => {
    const d = parseDate(c.picked_up_at);
    if (d) {
      const hourStr = d.getUTCHours().toString().padStart(2, '0') + ':00';
      pickupHourMap[hourStr] = (pickupHourMap[hourStr] || 0) + 1;
    }
  });

  const checkInTimeSeries = Object.keys(checkInHourMap).sort().map(hour => ({ hour, count: checkInHourMap[hour] }));
  const pickupTimeSeries = Object.keys(pickupHourMap).sort().map(hour => ({ hour, count: pickupHourMap[hour] }));

  let peakCheckInHour = 'Information not available';
  let maxCheckInVal = 0;
  checkInTimeSeries.forEach(t => {
    if (t.count > maxCheckInVal) {
      maxCheckInVal = t.count;
      peakCheckInHour = `${t.hour}–${(parseInt(t.hour) + 1).toString().padStart(2, '0')}:00`;
    }
  });

  let peakPickupHour = 'Information not available';
  let maxPickupVal = 0;
  pickupTimeSeries.forEach(t => {
    if (t.count > maxPickupVal) {
      maxPickupVal = t.count;
      peakPickupHour = `${t.hour}–${(parseInt(t.hour) + 1).toString().padStart(2, '0')}:00`;
    }
  });

  // Age Group & Gender distributions using canonical age-cohort normalisation
  const ageGroupDistribution: { [key: string]: { registered: number; expected: number; checkedIn: number; released: number } } = {};
  const genderDistribution: { [key: string]: number } = {};

  childEntries.forEach((c: any) => {
    const ag = normalizeAgeGroupLabel(c.age_group);
    if (!ageGroupDistribution[ag]) {
      ageGroupDistribution[ag] = { registered: 0, expected: 0, checkedIn: 0, released: 0 };
    }
    ageGroupDistribution[ag].registered++;
    if (selectedStatuses.includes(c.status)) ageGroupDistribution[ag].expected++;
    if (['checked_in', 'inside', 'picked_up'].includes(c.status) || c.checked_in_at) ageGroupDistribution[ag].checkedIn++;
    if (c.status === 'picked_up' || c.picked_up_at) ageGroupDistribution[ag].released++;

    const gen = c.gender || 'Unknown';
    genderDistribution[gen] = (genderDistribution[gen] || 0) + 1;
  });

  const ageGroupAttendance = Object.keys(ageGroupDistribution).map((ag) => {
    const d = ageGroupDistribution[ag];
    return {
      ageGroup: ag,
      expected: d.expected,
      attended: d.checkedIn,
      attendanceRate: d.expected > 0 ? (d.checkedIn / d.expected) * 100 : 0
    };
  });

  const attendance: AttendanceAnalytics = {
    totalRegistrations,
    expectedTotal,
    checkedInTotal,
    insideTotal,
    releasedTotal,
    notArrivedTotal,
    attendanceRate,
    releaseRate,
    pendingRelease,
    peakCheckInHour,
    peakPickupHour,
    checkInTimeSeries,
    pickupTimeSeries,
    ageGroupDistribution,
    ageGroupAttendance,
    genderDistribution
  };

  // 2. Volunteers & Teams
  const rawAssignments = snapshot.dutyAssignments || [];
  const rosterVolunteers = snapshot.rosterVolunteers || [];
  const totalRosterVolunteers = rosterVolunteers.length;

  // Filter assignments strictly according to business rules:
  // 1. Volunteer profile exists and is active/approved
  // 2. Linked user exists
  // 3. Volunteer is not soft-deleted (deleted_at is null, is_deleted is 0)
  // 4. Volunteer is not removed (status !== 'removed')
  // 5. Assignment belongs to this event
  // 6. Assignment is not removed, cancelled, or inactive
  // 7. Orphaned assignments never count
  const validAssignments = rawAssignments.filter((a: any) => {
    // Check event ID
    if (a.event_id && a.event_id !== eventId) return false;

    // Check assignment status
    const asgStatus = (a.assignment_status || a.status || '').toLowerCase();
    if (['cancelled', 'removed', 'inactive'].includes(asgStatus)) return false;

    // Check volunteer profile validity
    if (a.volunteer_profile_id === null || a.volunteer_profile_id === undefined) {
      // Cross-reference with active approved roster if available
      const inRoster = rosterVolunteers.find((rv: any) => rv.user_id === a.user_id);
      if (!inRoster) return false;
    }

    if (a.volunteer_is_deleted === 1 || a.volunteer_is_deleted === true || a.volunteer_deleted_at) {
      return false;
    }

    const volStatus = (a.volunteer_status || '').toLowerCase();
    if (volStatus && !['approved', 'active'].includes(volStatus)) {
      return false;
    }

    return true;
  });

  // "Volunteers assigned" = distinct currently-valid volunteers assigned to the selected event
  const assignedUserIds = new Set<string>(validAssignments.map((a: any) => a.user_id));
  const totalApproved = assignedUserIds.size;

  // "Volunteers on duty" = distinct currently-valid volunteers with an active/on-duty assignment for the selected event
  const onDutyAssignments = validAssignments.filter((a: any) => {
    const s = (a.assignment_status || a.status || '').toLowerCase();
    return s === 'active' || s === 'on_duty' || s === 'checked_in';
  });
  const onDutyUserIds = new Set<string>(onDutyAssignments.map((a: any) => a.user_id));
  const activeOnDuty = onDutyUserIds.size;

  const participationRate = totalApproved > 0 ? (activeOnDuty / totalApproved) * 100 : 0;

  // Volunteers by responsibility (distinct users per responsibility)
  const volunteersByResponsibility: { [key: string]: number } = {};
  const respUserSets: { [key: string]: Set<string> } = {};
  validAssignments.forEach((a: any) => {
    const resp = a.responsibility_key || 'Room Operator';
    if (!respUserSets[resp]) respUserSets[resp] = new Set();
    respUserSets[resp].add(a.user_id);
  });
  Object.keys(respUserSets).forEach(k => {
    volunteersByResponsibility[k] = respUserSets[k].size;
  });

  // Volunteers by team (distinct users per team)
  const volunteersByTeam: { [key: string]: number } = {};
  const teamMap: { [team: string]: { assignedSet: Set<string>; onDutySet: Set<string> } } = {};
  validAssignments.forEach((a: any) => {
    const team = a.team_key || a.preferred_team || 'Children Ministry';
    if (!teamMap[team]) {
      teamMap[team] = { assignedSet: new Set(), onDutySet: new Set() };
    }
    teamMap[team].assignedSet.add(a.user_id);
    const s = (a.assignment_status || a.status || '').toLowerCase();
    if (s === 'active' || s === 'on_duty' || s === 'checked_in') {
      teamMap[team].onDutySet.add(a.user_id);
    }
  });
  Object.keys(teamMap).forEach(k => {
    volunteersByTeam[k] = teamMap[k].assignedSet.size;
  });

  const teamDeployment = Object.keys(teamMap).map(team => ({
    team,
    assigned: teamMap[team].assignedSet.size,
    onDuty: teamMap[team].onDutySet.size
  }));

  // Duty status composition (distinct users per status)
  const statusSets: { [status: string]: Set<string> } = {
    'On duty': new Set(),
    'Scheduled': new Set(),
    'On break': new Set(),
    'Unavailable': new Set()
  };

  validAssignments.forEach((a: any) => {
    const s = (a.assignment_status || a.status || '').toLowerCase();
    if (s === 'active' || s === 'on_duty' || s === 'checked_in') {
      statusSets['On duty'].add(a.user_id);
    } else if (s === 'scheduled' || s === 'assigned' || s === 'confirmed') {
      statusSets['Scheduled'].add(a.user_id);
    } else if (s === 'on_break' || s === 'break') {
      statusSets['On break'].add(a.user_id);
    } else if (s === 'temporarily_unavailable' || s === 'unavailable') {
      statusSets['Unavailable'].add(a.user_id);
    }
  });

  const dutyStatusComposition = Object.entries(statusSets)
    .filter(([_, set]) => set.size > 0)
    .map(([status, set]) => ({ status, count: set.size }));

  // Human-readable ratio calculation
  const volunteersPer100Children = checkedInTotal > 0 ? Number(((activeOnDuty / checkedInTotal) * 100).toFixed(1)) : 0;
  
  let ratioText = 'Not available';
  let ratioSublabel = 'No children checked in';
  if (checkedInTotal > 0 && activeOnDuty > 0) {
    const childrenPerVol = Number((checkedInTotal / activeOnDuty).toFixed(1));
    if (childrenPerVol >= 1) {
      const formatted = childrenPerVol % 1 === 0 ? childrenPerVol.toFixed(0) : childrenPerVol.toFixed(1);
      ratioText = `1 : ${formatted}`;
      ratioSublabel = `1 volunteer per ${formatted} children`;
    } else {
      const volPerChild = Number((activeOnDuty / checkedInTotal).toFixed(1));
      ratioText = `${volPerChild} : 1`;
      ratioSublabel = `${volPerChild} volunteers per child`;
    }
  } else if (checkedInTotal > 0 && activeOnDuty === 0) {
    ratioText = 'Not available';
    ratioSublabel = 'No volunteers on duty';
  }

  // Location staffing: Only active non-archived event locations
  const locationsList = (snapshot.locations || []).filter((loc: any) => 
    (!loc.event_id || loc.event_id === eventId) && 
    (loc.is_active === 1 || loc.is_active === true || loc.is_active === undefined) && 
    !loc.archived_at
  );
  const totalLocationsCount = locationsList.length;

  // Distinct valid on-duty volunteers per location
  const volunteersByLocation: { [locationId: string]: number } = {};
  const locUserSets: { [locationId: string]: Set<string> } = {};
  onDutyAssignments.forEach((a: any) => {
    const locId = a.location_id || a.assigned_location_id;
    if (locId) {
      if (!locUserSets[locId]) locUserSets[locId] = new Set();
      locUserSets[locId].add(a.user_id);
    }
  });

  locationsList.forEach((loc: any) => {
    volunteersByLocation[loc.id] = locUserSets[loc.id]?.size || 0;
  });

  const staffedLocationsCount = locationsList.filter((loc: any) => (volunteersByLocation[loc.id] || 0) >= 1).length;
  const roomCoverageScore = totalLocationsCount > 0 ? Math.round((staffedLocationsCount / totalLocationsCount) * 100) : 0;
  const coverageGaps = Math.max(0, totalLocationsCount - staffedLocationsCount);

  const volunteers: VolunteerAnalytics = {
    totalApproved,
    activeOnDuty,
    participationRate,
    volunteersByResponsibility,
    volunteersByTeam,
    volunteersPer100Children,
    ratioText,
    ratioSublabel,
    coverageGaps,
    totalRosterVolunteers,
    teamDeployment,
    dutyStatusComposition,
    volunteersByLocation,
    staffedLocationsCount,
    totalLocationsCount,
    roomCoverageScore
  };

  // 3. Device Readiness
  const readinessLogs = snapshot.deviceReadiness || [];
  const dutyDevices = snapshot.dutyDevices || [];
  const totalDevices = dutyDevices.length || readinessLogs.length;

  const readyDevices = dutyDevices.filter((d: any) => d.readiness_status === 'ready').length || readinessLogs.filter((d: any) => d.readiness_status === 'ready').length;
  const limitedDevices = dutyDevices.filter((d: any) => d.readiness_status === 'limited').length || readinessLogs.filter((d: any) => d.readiness_status === 'limited').length;
  const needsAttentionDevices = Math.max(0, totalDevices - readyDevices - limitedDevices);
  const readinessRate = totalDevices > 0 ? (readyDevices / totalDevices) * 100 : 0;

  // Sound, push, voice readiness
  let soundUnlockCount = 0;
  let pushReadyCount = 0;
  let liveConnectedCount = dutyDevices.filter((d: any) => d.live_connection_status === 'connected').length;

  readinessLogs.forEach((log: any) => {
    if (log.sound_ready === 1 || log.sound_ready === true) soundUnlockCount++;
    if (log.push_ready === 1 || log.push_ready === true) pushReadyCount++;
  });

  const logCount = readinessLogs.length || 1;
  const soundUnlockRate = (soundUnlockCount / logCount) * 100;
  const webPushReadinessRate = (pushReadyCount / logCount) * 100;
  const liveConnectionRate = totalDevices > 0 ? (liveConnectedCount / totalDevices) * 100 : 0;

  const devices: DeviceReadinessAnalytics = {
    totalDevices,
    readyDevices,
    limitedDevices,
    needsAttentionDevices,
    readinessRate,
    soundUnlockRate,
    webPushReadinessRate,
    liveConnectionRate
  };

  // 4. Locations & Capacity Loading
  const totalLocations = locationsList.length;
  let totalAssignedKidsAcrossRooms = 0;

  const locationLoads = locationsList.map((loc: any) => {
    const volCount = volunteersByLocation[loc.id] || 0;
    
    // Age groups associated with this location
    const ageGroupsInLoc = snapshot.ageGroups?.filter((ag: any) => ag.location_id === loc.id) || [];
    const normalizedLocAgLabels = ageGroupsInLoc.map((ag: any) => normalizeAgeGroupLabel(ag.label || ag.age_group || ag.name));

    // Match checked in kids directly by location_id/room_id OR by normalized age group
    const checkedInKidsInLoc = checkedInEntries.filter((c: any) => {
      if (c.location_id === loc.id || c.check_in_location_id === loc.id || c.room_id === loc.id || c.assigned_room_id === loc.id) {
        return true;
      }
      const childNormAg = normalizeAgeGroupLabel(c.age_group);
      return normalizedLocAgLabels.includes(childNormAg);
    }).length;

    totalAssignedKidsAcrossRooms += checkedInKidsInLoc;

    const plannedCap = loc.capacity || 40;
    const loadPercentage = plannedCap > 0 ? (checkedInKidsInLoc / plannedCap) * 100 : 0;

    return {
      locationLabel: loc.name || loc.label || 'Room',
      childrenCount: checkedInKidsInLoc,
      volunteerCount: volCount,
      loadPercentage
    };
  });

  // Reconcile: If checkedInTotal > 0 and locationLoads has entries with 0 children due to age group missing location_id,
  // distribute checkedInTotal across available locations or add Main Assembly room if needed
  const unassignedKids = Math.max(0, checkedInTotal - totalAssignedKidsAcrossRooms);
  if (unassignedKids > 0 && locationLoads.length > 0) {
    // If locationLoads has rooms, assign unassigned kids to the main room or first room
    const mainRoom = locationLoads.find(l => l.locationLabel.toLowerCase().includes('grace') || l.locationLabel.toLowerCase().includes('main') || l.locationLabel.toLowerCase().includes('hall')) || locationLoads[0];
    if (mainRoom) {
      mainRoom.childrenCount += unassignedKids;
      const plannedCap = 40;
      mainRoom.loadPercentage = (mainRoom.childrenCount / plannedCap) * 100;
    }
  }

  const fullyCoveredLocations = locationLoads.filter(l => l.volunteerCount >= 2).length;
  const limitedCoveredLocations = locationLoads.filter(l => l.volunteerCount === 1).length;
  const uncoveredLocations = locationLoads.filter(l => l.volunteerCount === 0).length;

  const locations: LocationAnalytics = {
    totalLocations,
    fullyCoveredLocations,
    limitedCoveredLocations,
    uncoveredLocations,
    locationLoads
  };

  // 5. Safety Alerts & Response Time
  const safetyAlerts = snapshot.safetyAlerts || [];
  const totalAlerts = safetyAlerts.length;

  const alertsBySeverity = { normal: 0, important: 0, urgent: 0 };
  const alertsByCategory: { [key: string]: number } = {};
  const alertsByStatus = { open: 0, in_progress: 0, resolved: 0, reopened: 0 };

  const ackDurations: number[] = [];
  const resDurations: number[] = [];

  let targetAckCount = 0;
  let targetResCount = 0;

  safetyAlerts.forEach((a: any) => {
    const sev = (a.severity || 'normal').toLowerCase() as 'normal' | 'important' | 'urgent';
    if (sev in alertsBySeverity) {
      alertsBySeverity[sev]++;
    } else {
      alertsBySeverity.normal++;
    }

    const cat = a.category || 'General';
    alertsByCategory[cat] = (alertsByCategory[cat] || 0) + 1;

    const stat = (a.status || 'open').toLowerCase() as 'open' | 'in_progress' | 'resolved' | 'reopened';
    if (stat in alertsByStatus) {
      alertsByStatus[stat]++;
    } else {
      alertsByStatus.open++;
    }

    // Response timings
    const created = parseDate(a.created_at);
    if (created) {
      if (a.acknowledged_at) {
        const ack = parseDate(a.acknowledged_at);
        if (ack) {
          const diff = (ack.getTime() - created.getTime()) / 1000;
          if (diff >= 0) {
            ackDurations.push(diff);
            if (diff <= 45) targetAckCount++;
          }
        }
      }
      if (a.resolved_at) {
        const res = parseDate(a.resolved_at);
        if (res) {
          const diff = (res.getTime() - created.getTime()) / 1000;
          if (diff >= 0) {
            resDurations.push(diff);
            if (diff <= 300) targetResCount++;
          }
        }
      }
    }
  });

  const medianAcknowledgementTimeSeconds = getMedian(ackDurations);
  const percentile75AcknowledgementTimeSeconds = getPercentile(ackDurations, 75);
  const percentile90AcknowledgementTimeSeconds = getPercentile(ackDurations, 90);
  const medianResolutionTimeSeconds = getMedian(resDurations);
  const alertsPer100Children = checkedInTotal > 0 ? (totalAlerts / checkedInTotal) * 100 : 0;

  const targetAcknowledgementRate = ackDurations.length > 0 ? (targetAckCount / ackDurations.length) * 100 : 100;
  const targetResolutionRate = resDurations.length > 0 ? (targetResCount / resDurations.length) * 100 : 100;

  const alerts: AlertAnalytics = {
    totalAlerts,
    alertsBySeverity,
    alertsByCategory,
    alertsByStatus,
    medianAcknowledgementTimeSeconds,
    percentile75AcknowledgementTimeSeconds,
    percentile90AcknowledgementTimeSeconds,
    medianResolutionTimeSeconds,
    alertsPer100Children,
    targetAcknowledgementRate,
    targetResolutionRate
  };

  // 6. Incidents and Follow-ups
  const incidentRecords = snapshot.incidentRecords || [];
  const totalIncidents = incidentRecords.length;
  const incidentsByCategory: { [key: string]: number } = {};
  const incidentsByStatus: { [key: string]: number } = {};

  let totalFollowUps = 0;
  let completedFollowUps = 0;
  let overdueFollowUps = 0;

  incidentRecords.forEach((inc: any) => {
    const cat = inc.category || 'General';
    incidentsByCategory[cat] = (incidentsByCategory[cat] || 0) + 1;

    const stat = inc.status || 'draft';
    incidentsByStatus[stat] = (incidentsByStatus[stat] || 0) + 1;

    // Follow-ups parsed from text or structured_data
    if (inc.follow_up_actions) {
      try {
        const parsed = JSON.parse(inc.follow_up_actions);
        if (Array.isArray(parsed)) {
          totalFollowUps += parsed.length;
          parsed.forEach((f: any) => {
            if (f.completed || f.status === 'completed' || f.status === 'closed') {
              completedFollowUps++;
            } else if (f.due_date && new Date(f.due_date) < new Date()) {
              overdueFollowUps++;
            }
          });
        } else {
          totalFollowUps++;
          if (inc.status === 'closed') completedFollowUps++;
        }
      } catch {
        totalFollowUps++;
        if (inc.status === 'closed') completedFollowUps++;
      }
    }
  });

  const followUpCompletionRate = totalFollowUps > 0 ? (completedFollowUps / totalFollowUps) * 100 : 100;

  const incidents: IncidentAnalytics = {
    totalIncidents,
    incidentsByCategory,
    incidentsByStatus,
    totalFollowUps,
    completedFollowUps,
    followUpCompletionRate,
    overdueFollowUps
  };

  // 7. Escalations
  // Let's analyze safety_alert_recipients and updates to find escalations.
  // We can count alerts that were reassigned or had reopened status, or alerts with high response updates.
  const escalatedAlerts = safetyAlerts.filter((a: any) => a.owner_assigned_at || a.reopened_at || a.severity === 'urgent');
  const escalatedAlertsCount = escalatedAlerts.length;
  const escalationRate = totalAlerts > 0 ? (escalatedAlertsCount / totalAlerts) * 100 : 0;
  const maxEscalationLevelReached = escalatedAlertsCount > 10 ? 3 : (escalatedAlertsCount > 2 ? 2 : 1);

  const escalations: EscalationAnalytics = {
    totalEscalations: escalatedAlertsCount,
    escalationRate,
    maxEscalationLevelReached,
    escalatedAlertsCount
  };

  // 8. Pickup
  const pickupPeople = snapshot.pickupRecords || [];
  const totalReleases = releasedTotal;
  const verificationByMethod: { [key: string]: number } = {};
  let pickupConcernsCount = 0;
  let verificationFailuresCount = 0;
  let escalationsToLeadCount = 0;

  pickupPeople.forEach((p: any) => {
    const meth = p.verification_method || 'Passcode';
    verificationByMethod[meth] = (verificationByMethod[meth] || 0) + 1;
    if (p.has_concerns === 1 || p.has_concerns === true) pickupConcernsCount++;
    if (p.verification_status === 'failed') verificationFailuresCount++;
    if (p.escalated_to_lead === 1 || p.escalated_to_lead === true) escalationsToLeadCount++;
  });

  const pickup: PickupAnalytics = {
    totalReleases,
    releaseRate,
    verificationByMethod,
    pickupConcernsCount,
    verificationFailuresCount,
    escalationsToLeadCount
  };

  // 9. Offline Resilience
  const syncRecords = snapshot.syncRecords || [];
  const failedSyncRecords = syncRecords.filter((s: any) => s.status === 'failed' || s.error_summary?.includes('timeout'));
  const totalInterruptions = failedSyncRecords.length > 0 ? failedSyncRecords.length : (syncRecords.length > 0 ? 1 : 0);
  const affectedDevicesCount = new Set(syncRecords.map((s: any) => s.device_identifier).filter(Boolean)).size;

  // Offline duration: only use actual recorded values from the database.
  // We do NOT estimate or extrapolate. If the field is absent, report null.
  let totalOfflineDurationSecondsRaw = 0;
  let hasActualDurationData = false;
  syncRecords.forEach((s: any) => {
    const dur = s.offline_duration_seconds ?? s.duration_seconds ?? null;
    if (dur !== null && dur !== undefined && Number.isFinite(Number(dur))) {
      totalOfflineDurationSecondsRaw += Number(dur);
      hasActualDurationData = true;
    }
  });
  const totalOfflineDurationSeconds: number | null = hasActualDurationData ? totalOfflineDurationSecondsRaw : null;
  const averageOfflineDurationSeconds: number | null =
    hasActualDurationData && syncRecords.length > 0
      ? totalOfflineDurationSecondsRaw / syncRecords.length
      : null;

  let queuedActionsCount = 0;
  let confirmedQueuedCount = 0;
  let conflictQueuedCount = 0;
  let failedQueuedCount = 0;

  syncRecords.forEach((s: any) => {
    queuedActionsCount += (s.record_count || 0);
    if (s.status === 'success' || s.status === 'completed') {
      confirmedQueuedCount += (s.record_count || 0);
    } else if (s.status === 'conflict') {
      conflictQueuedCount += (s.record_count || 0);
    } else {
      failedQueuedCount += (s.record_count || 0);
    }
  });

  const offline: OfflineAnalytics = {
    totalInterruptions,
    affectedDevicesCount,
    totalOfflineDurationSeconds,
    averageOfflineDurationSeconds,
    queuedActionsCount,
    confirmedQueuedCount,
    conflictQueuedCount,
    failedQueuedCount
  };

  // 10. Data Quality Report
  let missingLocationCount = 0;
  let missingTimestampsCount = 0;
  let unresolvedCheckInCount = 0;

  childEntries.forEach((c: any) => {
    if (!c.checked_in_at && c.status === 'checked_in') unresolvedCheckInCount++;
    if (c.checked_in_at && !c.checked_in_by) missingTimestampsCount++;
  });

  safetyAlerts.forEach((a: any) => {
    if (!a.location_label) missingLocationCount++;
    if (a.status === 'resolved' && !a.resolved_at) missingTimestampsCount++;
  });

  const totalPossibleChecks = childEntries.length + safetyAlerts.length * 2 + 1;
  const totalDataGaps = missingLocationCount + missingTimestampsCount + unresolvedCheckInCount;
  const dataConfidenceScore = Math.max(0, Math.min(100, Math.round(((totalPossibleChecks - totalDataGaps) / totalPossibleChecks) * 100)));

  let overallConfidence: 'High confidence' | 'Moderate confidence' | 'Limited information' = 'High confidence';
  if (dataConfidenceScore < 60) {
    overallConfidence = 'Limited information';
  } else if (dataConfidenceScore < 85) {
    overallConfidence = 'Moderate confidence';
  }

  const dataQuality: DataQualityReport = {
    overallConfidence,
    recordsComplete: childEntries.length - unresolvedCheckInCount,
    recordsIncomplete: unresolvedCheckInCount,
    missingLocationCount,
    missingTimestampsCount,
    unresolvedCheckInCount,
    dataConfidenceScore
  };

  // 11. Grounded written insights and recommendations based ONLY on facts
  const insights: GroundedInsight[] = [];

  // Finding 1: Attendance
  if (attendanceRate > 0) {
    insights.push({
      type: 'strength',
      category: 'Attendance',
      finding: `${attendanceRate.toFixed(1)}% of selected children attended the event.`,
      supportingData: `${checkedInTotal} of ${expectedTotal} selected children checked in (${totalRegistrations} total registrations).`,
      recommendation: 'Maintain the existing digital gate check-in workflows for future events.'
    });
  }

  // Finding 2: Alerts response
  if (totalAlerts > 0 && medianAcknowledgementTimeSeconds !== null) {
    const isAckTargetMet = medianAcknowledgementTimeSeconds <= 45;
    insights.push({
      type: isAckTargetMet ? 'strength' : 'weakness',
      category: 'Safety Response',
      finding: `The median alert acknowledgement time was recorded at ${formatDuration(medianAcknowledgementTimeSeconds)}.`,
      supportingData: `${totalAlerts} safety requests raised. Target is under 45 seconds.`,
      recommendation: isAckTargetMet 
        ? 'Acknowledge speed is within high-reliability limits. Continue current alert escalation assignments.'
        : 'Reinforce push notification sound-unlock readiness checks on volunteer devices prior to future events.'
    });
  }

  // Finding 3: Device readiness
  if (totalDevices > 0) {
    const isReadinessHigh = readinessRate >= 90;
    insights.push({
      type: isReadinessHigh ? 'strength' : 'weakness',
      category: 'Device Readiness',
      finding: `Device readiness rate stands at ${readinessRate.toFixed(1)}%.`,
      supportingData: `${readyDevices} out of ${totalDevices} duty devices verified fully active.`,
      recommendation: isReadinessHigh
        ? 'Excellent operational device compliance. Monitor live socket connections regularly.'
        : 'Ensure active device diagnostics (Sound Unlock, Web Push permissions) are completed at volunteer check-in.'
    });
  }

  // Finding 4: Coverage Gaps
  if (coverageGaps > 0) {
    insights.push({
      type: 'weakness',
      category: 'Location Coverage',
      finding: `${coverageGaps} locations experienced volunteer coverage gaps during the event.`,
      supportingData: `${locations.uncoveredLocations} rooms operated without designated on-duty response staff.`,
      recommendation: 'Re-align shift schedules to guarantee at least one primary volunteer responder is active in each room.'
    });
  }

  // 12. Comparison with previous event
  let comparison: EventComparisonReport | undefined = undefined;
  if (snapshot.comparisonData) {
    const prev = snapshot.comparisonData;
    const prevExpected = prev.expectedTotal ?? prev.selectedTotal ?? prev.totalRegistrations ?? 0;
    const prevAttendanceRate = prevExpected > 0 ? (prev.checkedInTotal / prevExpected) * 100 : 0;
    const attendanceDiffPercentagePoints = attendanceRate - prevAttendanceRate;
    const prevAlertsRate = (prev.checkedInTotal || 0) > 0 ? (prev.totalAlerts / prev.checkedInTotal) * 100 : 0;
    const alertsDiffPer100Children = alertsPer100Children - prevAlertsRate;
    const volunteersDiffCount = activeOnDuty - (prev.totalVolunteers || 0);
    const readinessDiffPercentagePoints = prev.readinessRate !== undefined ? readinessRate - prev.readinessRate : 0;

    comparison = {
      isComparable: true,
      comparisonEventTitle: prev.title,
      startsAt: prev.startsAt,
      attendanceDiffPercentagePoints,
      alertsDiffPer100Children,
      volunteersDiffCount,
      readinessDiffPercentagePoints
    };
  } else {
    comparison = {
      isComparable: false,
      comparisonMessage: 'No comparable event database snapshot is configured in system records.'
    };
  }

  // 13. Deterministic Key Findings
  let largestAgeGroup = 'All age cohorts';
  let maxCohortCount = 0;
  Object.keys(ageGroupDistribution).forEach((ag) => {
    if (ageGroupDistribution[ag].checkedIn > maxCohortCount) {
      maxCohortCount = ageGroupDistribution[ag].checkedIn;
      largestAgeGroup = `Children aged ${ag}`;
    }
  });

  const keyFindings: string[] = [];
  if (expectedTotal > 0) {
    keyFindings.push(`${checkedInTotal} of ${expectedTotal} selected children attended the event.`);
  } else if (totalRegistrations > 0) {
    keyFindings.push(`${totalRegistrations} children registered for this event.`);
  }
  if (releasedTotal > 0) {
    keyFindings.push(`${releasedTotal} child${releasedTotal > 1 ? 'ren' : ''} had been picked up at the time this report was created.`);
  }
  if (maxCohortCount > 0) {
    keyFindings.push(`${largestAgeGroup} represented the largest participating age group.`);
  }
  const openSafetyCount = alertsByStatus.open + alertsByStatus.in_progress + alertsByStatus.reopened;
  if (openSafetyCount === 0) {
    keyFindings.push('No unresolved safety concerns were recorded.');
  } else {
    keyFindings.push(`${openSafetyCount} safety concern${openSafetyCount > 1 ? 's' : ''} remained open.`);
  }
  if (underReviewTotal > 0) {
    keyFindings.push(`${underReviewTotal} registration${underReviewTotal > 1 ? 's' : ''} remained under review.`);
  }

  // 14. Deterministic Management Attention Items
  const managementAttention: string[] = [];
  if (notArrivedTotal > 0) {
    managementAttention.push(`${notArrivedTotal} child${notArrivedTotal > 1 ? 'ren were' : ' was'} expected but had not arrived.`);
  }
  if (underReviewTotal > 0) {
    managementAttention.push(`${underReviewTotal} registration${underReviewTotal > 1 ? 's' : ''} remained awaiting review.`);
  }
  if (openSafetyCount > 0) {
    managementAttention.push(`${openSafetyCount} safety matter${openSafetyCount > 1 ? 's' : ''} remained unresolved.`);
  }
  if (coverageGaps > 0) {
    managementAttention.push(`${coverageGaps} location${coverageGaps > 1 ? 's' : ''} had insufficient volunteer coverage.`);
  }
  if (managementAttention.length === 0) {
    managementAttention.push('No items require management attention.');
  }

  return {
    eventId,
    eventTitle,
    startsAt,
    cutoffTime,
    timezone,
    registrations,
    attendance,
    volunteers,
    devices,
    locations,
    alerts,
    incidents,
    escalations,
    pickup,
    offline,
    dataQuality,
    insights,
    keyFindings,
    managementAttention,
    comparison
  };
}

function calculateTrainingAnalyticsForSnapshot(snapshot: any, cutoffTime: string, timezone: string): ComprehensiveAnalytics {
  const session = snapshot.session;
  const scenario = snapshot.scenario;
  const results = snapshot.results || [];
  const participants = snapshot.participants || [];
  const observations = snapshot.observations || [];
  const activities = snapshot.activities || [];

  const objectivesCount = snapshot.objectives?.length || 0;
  const objectivesCompletedCount = results.filter((r: any) => r.status === 'Completed').length;
  const objectivesGuidedCount = results.filter((r: any) => r.status === 'Completed with guidance').length;
  const objectivesPartialCount = results.filter((r: any) => r.status === 'Partially completed').length;
  const objectivesNeedsPracticeCount = results.filter((r: any) => r.status === 'Needs further practice' || r.status === 'Failed').length;

  // Timings: use actual recorded values only — no multipliers or extrapolation.
  const ackTimes: number[] = [];
  const resTimes: number[] = [];
  results.forEach((r: any) => {
    if (r.time_to_acknowledge !== null && r.time_to_acknowledge !== undefined && Number.isFinite(Number(r.time_to_acknowledge))) {
      ackTimes.push(Number(r.time_to_acknowledge));
    }
    if (r.time_to_resolve !== null && r.time_to_resolve !== undefined && Number.isFinite(Number(r.time_to_resolve))) {
      resTimes.push(Number(r.time_to_resolve));
    }
  });

  const training: TrainingAnalytics = {
    programmeName: 'Koinonia Safeguarding Drill Programme',
    scenarioTitle: scenario?.title || 'Emergency Evacuation & Hold',
    sessionDurationSeconds: session.session_duration_seconds || 1200,
    participantsCount: participants.length,
    objectivesCount,
    objectivesCompletedCount,
    objectivesGuidedCount,
    objectivesPartialCount,
    objectivesNeedsPracticeCount,
    medianAckTimeSeconds: getMedian(ackTimes),
    medianResolutionTimeSeconds: getMedian(resTimes)
  };

  const registrations: RegistrationAnalytics = {
    totalRegistrations: participants.length,
    selectedTotal: participants.length,
    underReviewTotal: 0,
    waitlistTotal: 0,
    notSelectedTotal: 0,
    selectionRate: 100,
    registrationOutcomes: [{ label: 'Selected', count: participants.length }],
    registrationsByAgeGroup: {},
    medicalNotesCount: 0,
    extraSupportCount: 0,
    totalCareCount: 0
  };

  // Safe mock attendance for training sessions
  const attendance: AttendanceAnalytics = {
    totalRegistrations: participants.length,
    expectedTotal: participants.length,
    checkedInTotal: participants.length,
    insideTotal: 0,
    releasedTotal: participants.length,
    notArrivedTotal: 0,
    attendanceRate: 100,
    releaseRate: 100,
    pendingRelease: 0,
    peakCheckInHour: 'Drill window',
    peakPickupHour: 'Drill window',
    checkInTimeSeries: [],
    pickupTimeSeries: [],
    ageGroupDistribution: {},
    ageGroupAttendance: [],
    genderDistribution: {}
  };

  const volunteers: VolunteerAnalytics = {
    totalApproved: participants.length,
    activeOnDuty: participants.length,
    participationRate: 100,
    volunteersByResponsibility: {},
    volunteersByTeam: {},
    volunteersPer100Children: 100,
    coverageGaps: 0,
    ratioText: 'Not available',
    ratioSublabel: 'Training scenario session',
    totalRosterVolunteers: participants.length,
    teamDeployment: [],
    dutyStatusComposition: [{ status: 'On duty', count: participants.length }],
    volunteersByLocation: {},
    staffedLocationsCount: 0,
    totalLocationsCount: 0,
    roomCoverageScore: 100
  };

  const devices: DeviceReadinessAnalytics = {
    totalDevices: participants.length,
    readyDevices: participants.length,
    limitedDevices: 0,
    needsAttentionDevices: 0,
    readinessRate: 100,
    soundUnlockRate: 100,
    webPushReadinessRate: 100,
    liveConnectionRate: 100
  };

  const locations: LocationAnalytics = {
    totalLocations: 1,
    fullyCoveredLocations: 1,
    limitedCoveredLocations: 0,
    uncoveredLocations: 0,
    locationLoads: []
  };

  const alerts: AlertAnalytics = {
    totalAlerts: results.length,
    alertsBySeverity: { normal: results.length, important: 0, urgent: 0 },
    alertsByCategory: {},
    alertsByStatus: { open: 0, in_progress: 0, resolved: results.length, reopened: 0 },
    medianAcknowledgementTimeSeconds: training.medianAckTimeSeconds,
    percentile75AcknowledgementTimeSeconds: getPercentile(ackTimes, 75),
    percentile90AcknowledgementTimeSeconds: getPercentile(ackTimes, 90),
    medianResolutionTimeSeconds: training.medianResolutionTimeSeconds,
    alertsPer100Children: 100,
    targetAcknowledgementRate: 100,
    targetResolutionRate: 100
  };

  const incidents: IncidentAnalytics = {
    totalIncidents: 0,
    incidentsByCategory: {},
    incidentsByStatus: {},
    totalFollowUps: 0,
    completedFollowUps: 0,
    followUpCompletionRate: 100,
    overdueFollowUps: 0
  };

  const escalations: EscalationAnalytics = {
    totalEscalations: 0,
    escalationRate: 0,
    maxEscalationLevelReached: 1,
    escalatedAlertsCount: 0
  };

  const pickup: PickupAnalytics = {
    totalReleases: 0,
    releaseRate: 100,
    verificationByMethod: {},
    pickupConcernsCount: 0,
    verificationFailuresCount: 0,
    escalationsToLeadCount: 0
  };

  const offline: OfflineAnalytics = {
    totalInterruptions: 0,
    affectedDevicesCount: 0,
    totalOfflineDurationSeconds: 0,
    averageOfflineDurationSeconds: 0,
    queuedActionsCount: 0,
    confirmedQueuedCount: 0,
    conflictQueuedCount: 0,
    failedQueuedCount: 0
  };

  const dataQuality: DataQualityReport = {
    overallConfidence: 'High confidence',
    recordsComplete: results.length,
    recordsIncomplete: 0,
    missingLocationCount: 0,
    missingTimestampsCount: 0,
    unresolvedCheckInCount: 0,
    dataConfidenceScore: 100
  };

  const insights: GroundedInsight[] = [
    {
      type: 'strength',
      category: 'Drill Completion',
      finding: `${objectivesCompletedCount} of ${objectivesCount} drill objectives were successfully met.`,
      supportingData: `Simulated scenario drill: ${training.scenarioTitle}`,
      recommendation: 'Ensure standard response checklist is maintained for physical emergencies.'
    }
  ];

  return {
    eventId: session.id,
    eventTitle: session.simulated_event_name || 'Simulated Drill Session',
    startsAt: cutoffTime.slice(0, 10),
    cutoffTime,
    timezone,
    registrations,
    attendance,
    volunteers,
    devices,
    locations,
    alerts,
    incidents,
    escalations,
    pickup,
    offline,
    training,
    dataQuality,
    insights
  };
}
