export interface AnalyticsExactAgeRow {
  age: number;
  selected: number;
  checkedIn: number;
  inside: number;
  pickedUp: number;
  notArrived: number;
  attendancePct: number;
}

export interface AnalyticsAgeGroupRow {
  ageGroup: string;
  selected: number;
  checkedIn: number;
  inside: number;
  pickedUp: number;
  notArrived: number;
  attendancePct: number;
  exactAges: AnalyticsExactAgeRow[];
}

export interface AnalyticsVolunteerRow {
  volunteerId: string;
  name: string;
  email?: string | null;
  role: string | null;
  dutyRole: string | null;
  teamKey: string | null;
  assignedAgeGroups: string | null;
  assignmentId?: string | null;
  assignmentLocation?: string | null;
  assignmentStartsAt?: string | null;
  assignmentEndsAt?: string | null;
  hasUser?: boolean;
  hasVolunteerProfile?: boolean;
  hasDutyAssignment?: boolean;
  hasActivity?: boolean;
  profileState?: 'complete' | 'profile_missing' | 'no_profile';
  checkIns: number;
  pickups: number;
  totalActions: number;
  lastActivityAt: string | null;
}

export interface AnalyticsTimelineBucket {
  bucketStartIso: string;
  label: string;
  checkIns: number;
  pickups: number;
  cumulativeCheckIns: number;
  cumulativePickups: number;
}

export interface AnalyticsActivityItem {
  id: string;
  time: string;
  action: 'check_in' | 'pickup';
  childId: string;
  childName: string;
  age: number | null;
  ageGroup: string;
  volunteerId: string | null;
  volunteerName: string;
  location: string | null;
}

export interface EventAnalyticsSnapshot {
  event: {
    id: string;
    title: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
    location: string | null;
    timezone: string;
  } | null;
  availableEvents: Array<{
    id: string;
    title: string;
    status: string;
    startsAt: string | null;
    location: string | null;
  }>;
  summary: {
    selected: number;
    checkedIn: number;
    inside: number;
    pickedUp: number;
    notArrived: number;
    attendancePct: number;
  };
  ageGroups: AnalyticsAgeGroupRow[];
  volunteers: AnalyticsVolunteerRow[];
  timeline: AnalyticsTimelineBucket[];
  recentActivity: AnalyticsActivityItem[];
  activityPagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
  filters: {
    ageGroup: string;
    volunteerId: string;
    action: 'all' | 'check_in' | 'pickup';
  };
  updatedAt: string;
  version: string;
}

export function formatAnalyticsTime(iso?: string | null, timeZone?: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'Africa/Lagos',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(dt);
  } catch {
    return dt.toISOString().slice(11, 16);
  }
}

export function formatAnalyticsDateRange(startsAt?: string | null, endsAt?: string | null, timeZone?: string): string {
  if (!startsAt) return '';
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const tz = timeZone || 'Africa/Lagos';
  const startFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(start);
  if (!endsAt) return startFmt;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return startFmt;
  const endFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(end);
  if (startFmt === endFmt) return startFmt;

  const startDay = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric' }).format(start);
  const startMonthYear = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short', year: 'numeric' }).format(start);
  const endDay = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric' }).format(end);
  const endMonthYear = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short', year: 'numeric' }).format(end);
  if (startMonthYear === endMonthYear) {
    return `${startDay}–${endDay} ${startMonthYear}`;
  }
  return `${startFmt} – ${endFmt}`;
}
