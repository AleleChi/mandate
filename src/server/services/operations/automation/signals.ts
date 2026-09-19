/**
 * Deterministic Event Signal Definitions for Operations Automation (Foundation)
 * 
 * NOTE: Phase 3A defines structured factual signals only.
 * Strictly NO autonomous execution is enabled in Phase 3A.
 */

export type EventSignalType =
  | 'REGISTRATION_CLOSING_SOON'
  | 'VOLUNTEER_REGISTRATION_CLOSING_SOON'
  | 'LOCATION_UNDERSTAFFED'
  | 'VOLUNTEER_NO_SHOW'
  | 'PASS_NOT_READY'
  | 'SAFETY_ITEM_OPEN'
  | 'REPORT_EXPIRED'
  | 'EVENT_STARTING_SOON'
  | 'CONFIGURATION_GAP'
  | 'CHILD_ATTENDANCE_STATE_MISMATCH'
  | 'DUTY_PRESENCE_MISMATCH';

export interface BaseEventSignal {
  signal: EventSignalType;
  eventId: string;
  detectedAt: string;
}

export interface LocationUnderstaffedSignal extends BaseEventSignal {
  signal: 'LOCATION_UNDERSTAFFED';
  locationId: string;
  locationName: string;
  assigned: number;
  assignedCount: number;
  required: number;
  requiredCount: number;
  gap: number;
}

export interface VolunteerNoShowSignal extends BaseEventSignal {
  signal: 'VOLUNTEER_NO_SHOW';
  userId: string;
  volunteerName: string;
  assignedLocationId: string;
  locationName: string;
  scheduledStart: string | null;
  hasReliableReportingTime: boolean;
  minutesLate: number;
}

export interface RegistrationClosingSoonSignal extends BaseEventSignal {
  signal: 'REGISTRATION_CLOSING_SOON';
  closesAt: string;
  hoursRemaining: number;
  currentRegistrations: number;
}

export interface VolunteerRegistrationClosingSoonSignal extends BaseEventSignal {
  signal: 'VOLUNTEER_REGISTRATION_CLOSING_SOON';
  closesAt: string;
  hoursRemaining: number;
  currentApproved: number;
}

export interface PassNotReadySignal extends BaseEventSignal {
  signal: 'PASS_NOT_READY';
  selectedCount: number;
  missingPassCount: number;
  withoutPassCount: number;
}

export interface SafetyItemOpenSignal extends BaseEventSignal {
  signal: 'SAFETY_ITEM_OPEN';
  alertId?: string;
  openAlertsCount: number;
  openIncidentsCount: number;
  activeEscalationsCount: number;
  totalOpenNotices: number;
  severity: 'urgent' | 'attention';
  unresolvedMinutes?: number;
}

export interface ReportExpiredSignal extends BaseEventSignal {
  signal: 'REPORT_EXPIRED';
  reportJobId?: string;
  reportId: string;
  reportType: string;
  templateKey?: string;
  expiredAt: string;
}

export interface EventStartingSoonSignal extends BaseEventSignal {
  signal: 'EVENT_STARTING_SOON';
  startsAt: string;
  hoursRemaining: number;
}

export interface ConfigurationGapSignal extends BaseEventSignal {
  signal: 'CONFIGURATION_GAP';
  gapType: 'no_locations' | 'no_age_groups' | 'missing_capacity' | 'location_missing_capacity' | 'missing_volunteer_registration_deadline';
  title: string;
  details: string;
}

export interface ChildAttendanceStateMismatchSignal extends BaseEventSignal {
  signal: 'CHILD_ATTENDANCE_STATE_MISMATCH';
  mismatchedCount: number;
  childNames: string[];
}

export interface DutyPresenceMismatchSignal extends BaseEventSignal {
  signal: 'DUTY_PRESENCE_MISMATCH';
  conflictingCount: number;
  userIds: string[];
}

export type EventSignal =
  | LocationUnderstaffedSignal
  | VolunteerNoShowSignal
  | RegistrationClosingSoonSignal
  | VolunteerRegistrationClosingSoonSignal
  | PassNotReadySignal
  | SafetyItemOpenSignal
  | ReportExpiredSignal
  | EventStartingSoonSignal
  | ConfigurationGapSignal
  | ChildAttendanceStateMismatchSignal
  | DutyPresenceMismatchSignal;
