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
  | 'EVENT_STARTING_SOON';

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
  required: number;
  gap: number;
}

export interface VolunteerNoShowSignal extends BaseEventSignal {
  signal: 'VOLUNTEER_NO_SHOW';
  userId: string;
  volunteerName: string;
  assignedLocationId: string;
  scheduledStart: string;
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
}

export interface SafetyItemOpenSignal extends BaseEventSignal {
  signal: 'SAFETY_ITEM_OPEN';
  alertId: string;
  severity: string;
  unresolvedMinutes: number;
}

export interface ReportExpiredSignal extends BaseEventSignal {
  signal: 'REPORT_EXPIRED';
  reportJobId: string;
  templateKey: string;
  expiredAt: string;
}

export interface EventStartingSoonSignal extends BaseEventSignal {
  signal: 'EVENT_STARTING_SOON';
  startsAt: string;
  hoursRemaining: number;
}

export type EventSignal =
  | LocationUnderstaffedSignal
  | VolunteerNoShowSignal
  | RegistrationClosingSoonSignal
  | VolunteerRegistrationClosingSoonSignal
  | PassNotReadySignal
  | SafetyItemOpenSignal
  | ReportExpiredSignal
  | EventStartingSoonSignal;
