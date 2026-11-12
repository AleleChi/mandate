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
  role: string | null;
  dutyRole: string | null;
  teamKey: string | null;
  assignedAgeGroups: string | null;
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
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(dt);
  } catch {
    return dt.toISOString().slice(11, 19);
  }
}

