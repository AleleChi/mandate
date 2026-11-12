import { query, queryOne } from '../db';
import { jsPDF } from 'jspdf';
import { getCurrentEvent, getEventById, EventRow } from './eventService';
import { CANONICAL_GA_EVENT_DATE, CANONICAL_PROGRAMME_AGE_GROUPS } from './eligibilityService';
import { getChildAge, resolveReportAgeGroup } from './selectedChildrenReportService';

export interface EventAnalyticsFilters {
  eventId?: string | null;
  ageGroup?: string | null;
  volunteerId?: string | null;
  action?: string | null; // 'all' | 'check_in' | 'pickup'
  activityPage?: number;
  activityPageSize?: number;
}

export interface AgeMetricsRow {
  age: number;
  selected: number;
  checkedIn: number;
  inside: number;
  pickedUp: number;
  notArrived: number;
  attendancePct: number;
}

export interface AgeGroupMetricsRow {
  ageGroup: string;
  selected: number;
  checkedIn: number;
  inside: number;
  pickedUp: number;
  notArrived: number;
  attendancePct: number;
  exactAges: AgeMetricsRow[];
}

export interface VolunteerAnalyticsRow {
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

export interface TimelineBucket {
  bucketStartIso: string;
  label: string;
  checkIns: number;
  pickups: number;
  cumulativeCheckIns: number;
  cumulativePickups: number;
}

export interface RecentActivityItem {
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
  ageGroups: AgeGroupMetricsRow[];
  volunteers: VolunteerAnalyticsRow[];
  timeline: TimelineBucket[];
  recentActivity: RecentActivityItem[];
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

const CANONICAL_GROUP_KEYS: string[] = CANONICAL_PROGRAMME_AGE_GROUPS.map((g) => g.key);

const CANONICAL_SELECTED_STATUSES = [
  'selected',
  'pass_ready',
  'checked_in',
  'inside',
  'picked_up',
  'checked_out'
];

export function normalizeAgeGroupFilter(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') return '';
  const normalized = trimmed
    .replace(/^ages?\s+/i, '')
    .replace(/-/g, '–')
    .trim();
  for (const grp of CANONICAL_GROUP_KEYS) {
    if (grp === normalized) return grp;
  }
  if (normalized.toLowerCase() === 'other') return 'Other';
  return normalized;
}

export function normalizeActionFilter(raw?: string | null): 'all' | 'check_in' | 'pickup' {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'check_in' || val === 'checkin' || val === 'checked_in') return 'check_in';
  if (val === 'pickup' || val === 'picked_up' || val === 'check_out' || val === 'release') return 'pickup';
  return 'all';
}

function formatDutyRoleLabel(responsibilityKey?: string | null, teamKey?: string | null): string | null {
  const parts: string[] = [];
  if (responsibilityKey) {
    parts.push(
      String(responsibilityKey)
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase())
    );
  }
  if (teamKey) {
    const cleanTeam = String(teamKey)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
    if (!parts.some((p) => p.toLowerCase() === cleanTeam.toLowerCase())) {
      parts.push(cleanTeam);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatBucketLabel(ms: number, timeZone: string): string {
  const dt = new Date(ms);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(dt);
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(dt);
  }
}

function toTimestampMs(value?: string | Date | null): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function resolveEventAndCatalog(explicitEventId?: string | null): Promise<{
  targetEvent: EventRow | null;
  availableEvents: EventAnalyticsSnapshot['availableEvents'];
}> {
  const eventRows = await query<EventRow>(`
    SELECT
      id,
      title,
      status,
      starts_at,
      ends_at,
      location,
      timezone,
      created_at
    FROM events
  `);

  const statusRank = (status?: string | null) => {
    switch (String(status || '').toLowerCase()) {
      case 'current':
        return 0;
      case 'upcoming':
        return 1;
      default:
        return 2;
    }
  };

  const sortedEvents = [...(eventRows || [])].sort((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const aTime =
      toTimestampMs(a.starts_at) ??
      toTimestampMs(a.created_at) ??
      0;

    const bTime =
      toTimestampMs(b.starts_at) ??
      toTimestampMs(b.created_at) ??
      0;

    return bTime - aTime;
  });

  const availableEvents = sortedEvents.map((ev) => ({
    id: ev.id,
    title: ev.title,
    status: ev.status,
    startsAt: ev.starts_at || null,
    location: ev.location || null
  }));

  if (explicitEventId && String(explicitEventId).trim()) {
    const cleanId = String(explicitEventId).trim();
    const ev = await getEventById(cleanId);
    if (!ev) {
      const err: any = new Error(`Event not found: ${cleanId}`);
      err.statusCode = 404;
      throw err;
    }
    return { targetEvent: ev, availableEvents };
  }

  const current = await getCurrentEvent();
  return { targetEvent: current, availableEvents };
}

export async function getEventAnalyticsWatermark(eventId: string): Promise<{
  version: string;
  updatedAt: string;
}> {
  const entryAgg = await queryOne<any>(
    `SELECT
       COUNT(*) as total_count,
       MAX(updated_at) as max_updated_at,
       MAX(checked_in_at) as max_checked_in_at,
       MAX(picked_up_at) as max_picked_up_at
     FROM child_event_entries
     WHERE event_id = ?
       AND (is_deleted = 0 OR is_deleted IS NULL)`,
    [eventId]
  );

  const attAgg = await queryOne<any>(
    `SELECT
       COUNT(*) as total_count,
       MAX(ar.created_at) as max_created_at,
       MAX(ar.action_time) as max_action_time
     FROM attendance_records ar
     JOIN child_event_entries e ON e.id = ar.child_event_entry_id
     WHERE e.event_id = ?
       AND (e.is_deleted = 0 OR e.is_deleted IS NULL)`,
    [eventId]
  );

  const parts = [
    entryAgg?.total_count ?? 0,
    entryAgg?.max_updated_at ?? '',
    entryAgg?.max_checked_in_at ?? '',
    entryAgg?.max_picked_up_at ?? '',
    attAgg?.total_count ?? 0,
    attAgg?.max_created_at ?? '',
    attAgg?.max_action_time ?? ''
  ];

  const version = parts.map((v) => String(v ?? '')).join('|');
  const candidates = [
    entryAgg?.max_updated_at,
    entryAgg?.max_checked_in_at,
    entryAgg?.max_picked_up_at,
    attAgg?.max_created_at,
    attAgg?.max_action_time
  ]
    .map((v) => toTimestampMs(v))
    .filter((ms): ms is number => ms !== null);

  const latestMs = candidates.length > 0 ? Math.max(...candidates) : Date.now();
  return {
    version,
    updatedAt: new Date(latestMs).toISOString()
  };
}

export async function getEventAnalyticsSnapshot(
  rawFilters: EventAnalyticsFilters = {}
): Promise<EventAnalyticsSnapshot> {
  const ageGroupFilter = normalizeAgeGroupFilter(rawFilters.ageGroup);
  const volunteerFilter = rawFilters.volunteerId ? String(rawFilters.volunteerId).trim() : '';
  const actionFilter = normalizeActionFilter(rawFilters.action);
  const activityPage = Math.max(1, Number(rawFilters.activityPage || 1) || 1);
  const activityPageSize = Math.min(100, Math.max(1, Number(rawFilters.activityPageSize || 20) || 20));

  const { targetEvent, availableEvents } = await resolveEventAndCatalog(rawFilters.eventId);

  if (!targetEvent) {
    return {
      event: null,
      availableEvents,
      summary: {
        selected: 0,
        checkedIn: 0,
        inside: 0,
        pickedUp: 0,
        notArrived: 0,
        attendancePct: 0
      },
      ageGroups: CANONICAL_GROUP_KEYS.map((grp) => ({
        ageGroup: grp,
        selected: 0,
        checkedIn: 0,
        inside: 0,
        pickedUp: 0,
        notArrived: 0,
        attendancePct: 0,
        exactAges: []
      })),
      volunteers: [],
      timeline: [],
      recentActivity: [],
      activityPagination: {
        page: activityPage,
        pageSize: activityPageSize,
        totalRecords: 0,
        totalPages: 1
      },
      filters: {
        ageGroup: ageGroupFilter,
        volunteerId: volunteerFilter,
        action: actionFilter
      },
      updatedAt: new Date().toISOString(),
      version: 'empty'
    };
  }

  const eventId = targetEvent.id;
  const eventDate = targetEvent.starts_at || CANONICAL_GA_EVENT_DATE;
  const eventTimezone = targetEvent.timezone || 'Europe/London';
  const statusPlaceholders = CANONICAL_SELECTED_STATUSES.map(() => '?').join(', ');

  // 1. Single batch query for all selected entries & child non-sensitive metadata (no medical notes/addresses/emails)
  const entryRows = await query<any>(
    `SELECT
       e.id as entry_id,
       e.child_id,
       e.status as entry_status,
       e.checked_in_at,
       e.checked_in_by,
       e.picked_up_at,
       e.picked_up_by,
       e.updated_at as entry_updated_at,
       c.full_name as child_name,
       c.date_of_birth,
       c.calculated_age,
       c.age_group as child_stored_age_group
     FROM child_event_entries e
     JOIN children c ON c.id = e.child_id
     WHERE e.event_id = ?
       AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
       AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
       AND e.status IN (${statusPlaceholders})`,
    [eventId, ...CANONICAL_SELECTED_STATUSES]
  );

  // 2. Single batch query for supplemental gate_location & audit timestamps from attendance_records
  const attendanceRows = await query<any>(
    `SELECT
       ar.child_event_entry_id,
       ar.action_type,
       ar.action_time,
       ar.staff_user_id,
       ar.gate_location,
       ar.created_at
     FROM attendance_records ar
     JOIN child_event_entries e ON e.id = ar.child_event_entry_id
     WHERE e.event_id = ?
       AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
     ORDER BY ar.action_time DESC`,
    [eventId]
  );

  // Map latest location & supplemental timestamps per (entry_id, normalized_action)
  const checkInAuditMap = new Map<string, { location: string | null; time: string | null; staffUserId: string | null }>();
  const pickupAuditMap = new Map<string, { location: string | null; time: string | null; staffUserId: string | null }>();

  for (const ar of attendanceRows || []) {
    const type = String(ar.action_type || '').toLowerCase();
    if (type === 'check_in' || type === 'checkin') {
      if (!checkInAuditMap.has(ar.child_event_entry_id)) {
        checkInAuditMap.set(ar.child_event_entry_id, {
          location: ar.gate_location || null,
          time: ar.action_time ? String(ar.action_time) : null,
          staffUserId: ar.staff_user_id || null
        });
      }
    } else if (type === 'pickup' || type === 'pick_up' || type === 'picked_up' || type === 'check_out') {
      if (!pickupAuditMap.has(ar.child_event_entry_id)) {
        pickupAuditMap.set(ar.child_event_entry_id, {
          location: ar.gate_location || null,
          time: ar.action_time ? String(ar.action_time) : null,
          staffUserId: ar.staff_user_id || null
        });
      }
    }
  }

  // 3. Batch-load volunteer/staff profiles + active duty assignments for this event (zero N+1)
  const dutyRows = await query<any>(
    `SELECT user_id, responsibility_key, team_key, assigned_age_groups, status
     FROM event_duty_assignments
     WHERE event_id = ? AND (status IS NULL OR status != 'cancelled')`,
    [eventId]
  );

  const staffIdSet = new Set<string>();
  const dutyByUser = new Map<string, any>();
  for (const d of dutyRows || []) {
    if (d.user_id) {
      staffIdSet.add(d.user_id);
      if (!dutyByUser.has(d.user_id)) {
        dutyByUser.set(d.user_id, d);
      }
    }
  }
  for (const row of entryRows || []) {
    if (row.checked_in_by) staffIdSet.add(row.checked_in_by);
    if (row.picked_up_by) staffIdSet.add(row.picked_up_by);
  }
  for (const audit of checkInAuditMap.values()) {
    if (audit.staffUserId) staffIdSet.add(audit.staffUserId);
  }
  for (const audit of pickupAuditMap.values()) {
    if (audit.staffUserId) staffIdSet.add(audit.staffUserId);
  }

  const staffIds = Array.from(staffIdSet);
  const staffMetaMap = new Map<
    string,
    {
      name: string;
      role: string | null;
      dutyRole: string | null;
      teamKey: string | null;
      assignedAgeGroups: string | null;
    }
  >();

  for (const chunk of chunkArray(staffIds, 400)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const userRows = await query<any>(
      `SELECT
         u.id,
         u.email,
         u.role,
         vp.full_name as volunteer_full_name,
         pp.full_name as parent_full_name
       FROM users u
       LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
       LEFT JOIN parent_profiles pp ON pp.user_id = u.id
       WHERE u.id IN (${placeholders})`,
      chunk
    );
    for (const u of userRows || []) {
      const duty = dutyByUser.get(u.id);
      const displayName =
        (u.volunteer_full_name && String(u.volunteer_full_name).trim()) ||
        (u.parent_full_name && String(u.parent_full_name).trim()) ||
        (u.email && String(u.email).trim()) ||
        'Staff Member';
      staffMetaMap.set(u.id, {
        name: displayName,
        role: u.role || null,
        dutyRole: duty ? formatDutyRoleLabel(duty.responsibility_key, duty.team_key) : null,
        teamKey: duty?.team_key || null,
        assignedAgeGroups: duty?.assigned_age_groups || null
      });
    }
  }

  // Ensure every referenced ID has a fallback metadata entry
  for (const id of staffIds) {
    if (!staffMetaMap.has(id)) {
      const duty = dutyByUser.get(id);
      staffMetaMap.set(id, {
        name: 'Unknown Volunteer',
        role: null,
        dutyRole: duty ? formatDutyRoleLabel(duty.responsibility_key, duty.team_key) : null,
        teamKey: duty?.team_key || null,
        assignedAgeGroups: duty?.assigned_age_groups || null
      });
    }
  }

  // Initialize canonical age group aggregators
  const groupStatsMap = new Map<
    string,
    {
      selected: number;
      checkedIn: number;
      inside: number;
      pickedUp: number;
      notArrived: number;
      exactMap: Map<number, Omit<AgeMetricsRow, 'age' | 'attendancePct'>>;
    }
  >();

  for (const grp of CANONICAL_GROUP_KEYS) {
    groupStatsMap.set(grp, {
      selected: 0,
      checkedIn: 0,
      inside: 0,
      pickedUp: 0,
      notArrived: 0,
      exactMap: new Map()
    });
  }

  const ensureGroupBucket = (grp: string) => {
    let bucket = groupStatsMap.get(grp);
    if (!bucket) {
      bucket = {
        selected: 0,
        checkedIn: 0,
        inside: 0,
        pickedUp: 0,
        notArrived: 0,
        exactMap: new Map()
      };
      groupStatsMap.set(grp, bucket);
    }
    return bucket;
  };

  let totalSelected = 0;
  let totalCheckedIn = 0;
  let totalInside = 0;
  let totalPickedUp = 0;
  let totalNotArrived = 0;

  // Per-volunteer accumulators (respecting active ageGroup filter when set, or event-wide when empty)
  const volunteerStatsMap = new Map<
    string,
    {
      checkIns: number;
      pickups: number;
      lastActivityMs: number;
      lastActivityAt: string | null;
    }
  >();

  const bumpVolunteer = (volId: string, actionType: 'check_in' | 'pickup', timeIso: string | null) => {
    let stat = volunteerStatsMap.get(volId);
    if (!stat) {
      stat = { checkIns: 0, pickups: 0, lastActivityMs: 0, lastActivityAt: null };
      volunteerStatsMap.set(volId, stat);
    }
    if (actionType === 'check_in') stat.checkIns += 1;
    else stat.pickups += 1;

    const ms = toTimestampMs(timeIso);
    if (ms !== null && ms > stat.lastActivityMs) {
      stat.lastActivityMs = ms;
      stat.lastActivityAt = new Date(ms).toISOString();
    }
  };

  // Seed assigned volunteers (with 0 actions if they have not checked in/picked up anyone yet)
  if (!ageGroupFilter) {
    for (const d of dutyRows || []) {
      if (d.user_id && !volunteerStatsMap.has(d.user_id)) {
        volunteerStatsMap.set(d.user_id, {
          checkIns: 0,
          pickups: 0,
          lastActivityMs: 0,
          lastActivityAt: null
        });
      }
    }
  }

  // Raw activity & timeline events (filtered by ageGroupFilter; further filtered by volunteer/action after)
  const timelineRawEvents: Array<{ type: 'check_in' | 'pickup'; ms: number }> = [];
  const allActivityEvents: RecentActivityItem[] = [];

  for (const row of entryRows || []) {
    const numericAge = getChildAge(row, eventDate);
    const ageGroup = resolveReportAgeGroup(row, eventDate);
    const status = String(row.entry_status || '').toLowerCase();

    const checkInAudit = checkInAuditMap.get(row.entry_id);
    const pickupAudit = pickupAuditMap.get(row.entry_id);

    const checkInAt = row.checked_in_at
      ? String(row.checked_in_at)
      : status === 'checked_in' || status === 'inside'
        ? checkInAudit?.time || (row.entry_updated_at ? String(row.entry_updated_at) : null)
        : null;

    const pickedUpAt = row.picked_up_at
      ? String(row.picked_up_at)
      : status === 'picked_up' || status === 'checked_out'
        ? pickupAudit?.time || (row.entry_updated_at ? String(row.entry_updated_at) : null)
        : null;

    const isPickedUp = Boolean(row.picked_up_at) || status === 'picked_up' || status === 'checked_out';
    const isCheckedIn = Boolean(row.checked_in_at) || status === 'checked_in' || status === 'inside';
    const isInside = !isPickedUp && (status === 'checked_in' || status === 'inside' || (Boolean(row.checked_in_at) && !row.picked_up_at));
    const isNotArrived = !isCheckedIn && !isPickedUp;

    totalSelected += 1;
    if (isCheckedIn) totalCheckedIn += 1;
    if (isInside) totalInside += 1;
    if (isPickedUp) totalPickedUp += 1;
    if (isNotArrived) totalNotArrived += 1;

    const grpBucket = ensureGroupBucket(ageGroup);
    grpBucket.selected += 1;
    if (isCheckedIn) grpBucket.checkedIn += 1;
    if (isInside) grpBucket.inside += 1;
    if (isPickedUp) grpBucket.pickedUp += 1;
    if (isNotArrived) grpBucket.notArrived += 1;

    if (numericAge !== null) {
      let exact = grpBucket.exactMap.get(numericAge);
      if (!exact) {
        exact = { selected: 0, checkedIn: 0, inside: 0, pickedUp: 0, notArrived: 0 };
        grpBucket.exactMap.set(numericAge, exact);
      }
      exact.selected += 1;
      if (isCheckedIn) exact.checkedIn += 1;
      if (isInside) exact.inside += 1;
      if (isPickedUp) exact.pickedUp += 1;
      if (isNotArrived) exact.notArrived += 1;
    }

    // Apply ageGroup filter to operational drilldowns (timeline, volunteer breakdown, activity feed)
    const matchesAgeFilter = !ageGroupFilter || ageGroup === ageGroupFilter;
    if (!matchesAgeFilter) {
      continue;
    }

    const checkInVolunteerId = row.checked_in_by || checkInAudit?.staffUserId || null;
    const pickupVolunteerId = row.picked_up_by || pickupAudit?.staffUserId || null;

    if (isCheckedIn) {
      if (checkInVolunteerId) {
        bumpVolunteer(checkInVolunteerId, 'check_in', checkInAt);
      }
      const checkInMs = toTimestampMs(checkInAt);
      if (checkInMs !== null) {
        if ((!volunteerFilter || checkInVolunteerId === volunteerFilter) && (actionFilter === 'all' || actionFilter === 'check_in')) {
          timelineRawEvents.push({ type: 'check_in', ms: checkInMs });
        }
        allActivityEvents.push({
          id: `${row.entry_id}:check_in`,
          time: new Date(checkInMs).toISOString(),
          action: 'check_in',
          childId: row.child_id,
          childName: row.child_name || 'Child',
          age: numericAge,
          ageGroup,
          volunteerId: checkInVolunteerId,
          volunteerName: checkInVolunteerId
            ? staffMetaMap.get(checkInVolunteerId)?.name || 'Unknown Volunteer'
            : 'System',
          location: checkInAudit?.location || targetEvent.location || null
        });
      }
    }

    if (isPickedUp) {
      if (pickupVolunteerId) {
        bumpVolunteer(pickupVolunteerId, 'pickup', pickedUpAt);
      }
      const pickupMs = toTimestampMs(pickedUpAt);
      if (pickupMs !== null) {
        if ((!volunteerFilter || pickupVolunteerId === volunteerFilter) && (actionFilter === 'all' || actionFilter === 'pickup')) {
          timelineRawEvents.push({ type: 'pickup', ms: pickupMs });
        }
        allActivityEvents.push({
          id: `${row.entry_id}:pickup`,
          time: new Date(pickupMs).toISOString(),
          action: 'pickup',
          childId: row.child_id,
          childName: row.child_name || 'Child',
          age: numericAge,
          ageGroup,
          volunteerId: pickupVolunteerId,
          volunteerName: pickupVolunteerId
            ? staffMetaMap.get(pickupVolunteerId)?.name || 'Unknown Volunteer'
            : 'System',
          location: pickupAudit?.location || targetEvent.location || null
        });
      }
    }
  }

  // Finalize age groups (preserve canonical ordering; include 'Other' only if populated)
  const ageGroups: AgeGroupMetricsRow[] = [];
  const orderedKeys = [
    ...CANONICAL_GROUP_KEYS,
    ...Array.from(groupStatsMap.keys()).filter((k) => !CANONICAL_GROUP_KEYS.includes(k))
  ];
  for (const key of orderedKeys) {
    const stat = groupStatsMap.get(key);
    if (!stat) continue;
    if (!CANONICAL_GROUP_KEYS.includes(key) && stat.selected === 0) continue;

    const exactAges: AgeMetricsRow[] = Array.from(stat.exactMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([age, s]) => ({
        age,
        selected: s.selected,
        checkedIn: s.checkedIn,
        inside: s.inside,
        pickedUp: s.pickedUp,
        notArrived: s.notArrived,
        attendancePct: s.selected > 0 ? Number(((s.checkedIn / s.selected) * 100).toFixed(1)) : 0
      }));

    ageGroups.push({
      ageGroup: key,
      selected: stat.selected,
      checkedIn: stat.checkedIn,
      inside: stat.inside,
      pickedUp: stat.pickedUp,
      notArrived: stat.notArrived,
      attendancePct: stat.selected > 0 ? Number(((stat.checkedIn / stat.selected) * 100).toFixed(1)) : 0,
      exactAges
    });
  }

  // Finalize volunteer breakdown
  const volunteers: VolunteerAnalyticsRow[] = Array.from(volunteerStatsMap.entries())
    .map(([volId, stat]) => {
      const meta = staffMetaMap.get(volId);
      return {
        volunteerId: volId,
        name: meta?.name || 'Unknown Volunteer',
        role: meta?.role || null,
        dutyRole: meta?.dutyRole || null,
        teamKey: meta?.teamKey || null,
        assignedAgeGroups: meta?.assignedAgeGroups || null,
        checkIns: stat.checkIns,
        pickups: stat.pickups,
        totalActions: stat.checkIns + stat.pickups,
        lastActivityAt: stat.lastActivityAt
      };
    })
    .filter((v) => v.totalActions > 0 || v.dutyRole !== null)
    .sort((a, b) => {
      if (b.totalActions !== a.totalActions) return b.totalActions - a.totalActions;
      if (b.checkIns !== a.checkIns) return b.checkIns - a.checkIns;
      return a.name.localeCompare(b.name);
    });

  // Finalize 15-minute activity timeline
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;
  const bucketCounts = new Map<number, { checkIns: number; pickups: number }>();
  for (const evt of timelineRawEvents) {
    const bucketStart = Math.floor(evt.ms / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS;
    let b = bucketCounts.get(bucketStart);
    if (!b) {
      b = { checkIns: 0, pickups: 0 };
      bucketCounts.set(bucketStart, b);
    }
    if (evt.type === 'check_in') b.checkIns += 1;
    else b.pickups += 1;
  }

  const timeline: TimelineBucket[] = [];
  if (bucketCounts.size > 0) {
    const sortedStarts = Array.from(bucketCounts.keys()).sort((a, b) => a - b);
    const minStart = sortedStarts[0];
    const maxStart = sortedStarts[sortedStarts.length - 1];
    const spanBuckets = Math.floor((maxStart - minStart) / FIFTEEN_MIN_MS) + 1;

    let cumCheckIns = 0;
    let cumPickups = 0;

    if (spanBuckets <= 96) {
      for (let t = minStart; t <= maxStart; t += FIFTEEN_MIN_MS) {
        const b = bucketCounts.get(t) || { checkIns: 0, pickups: 0 };
        cumCheckIns += b.checkIns;
        cumPickups += b.pickups;
        timeline.push({
          bucketStartIso: new Date(t).toISOString(),
          label: formatBucketLabel(t, eventTimezone),
          checkIns: b.checkIns,
          pickups: b.pickups,
          cumulativeCheckIns: cumCheckIns,
          cumulativePickups: cumPickups
        });
      }
    } else {
      for (const t of sortedStarts) {
        const b = bucketCounts.get(t)!;
        cumCheckIns += b.checkIns;
        cumPickups += b.pickups;
        timeline.push({
          bucketStartIso: new Date(t).toISOString(),
          label: formatBucketLabel(t, eventTimezone),
          checkIns: b.checkIns,
          pickups: b.pickups,
          cumulativeCheckIns: cumCheckIns,
          cumulativePickups: cumPickups
        });
      }
    }
  }

  // Finalize filtered, newest-first recent activity + pagination
  const filteredActivity = allActivityEvents
    .filter((item) => {
      if (volunteerFilter && item.volunteerId !== volunteerFilter) return false;
      if (actionFilter !== 'all' && item.action !== actionFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const diff = Date.parse(b.time) - Date.parse(a.time);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

  const totalRecords = filteredActivity.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / activityPageSize));
  const safePage = Math.min(activityPage, totalPages);
  const startIdx = (safePage - 1) * activityPageSize;
  const recentActivity = filteredActivity.slice(startIdx, startIdx + activityPageSize);

  const watermark = await getEventAnalyticsWatermark(eventId);

  return {
    event: {
      id: targetEvent.id,
      title: targetEvent.title,
      status: targetEvent.status,
      startsAt: targetEvent.starts_at || null,
      endsAt: targetEvent.ends_at || null,
      location: targetEvent.location || null,
      timezone: eventTimezone
    },
    availableEvents,
    summary: {
      selected: totalSelected,
      checkedIn: totalCheckedIn,
      inside: totalInside,
      pickedUp: totalPickedUp,
      notArrived: totalNotArrived,
      attendancePct: totalSelected > 0 ? Number(((totalCheckedIn / totalSelected) * 100).toFixed(1)) : 0
    },
    ageGroups,
    volunteers,
    timeline,
    recentActivity,
    activityPagination: {
      page: safePage,
      pageSize: activityPageSize,
      totalRecords,
      totalPages
    },
    filters: {
      ageGroup: ageGroupFilter,
      volunteerId: volunteerFilter,
      action: actionFilter
    },
    updatedAt: watermark.updatedAt || new Date().toISOString(),
    version: watermark.version
  };
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function renderEventAnalyticsCsv(snapshot: EventAnalyticsSnapshot): string {
  const lines: string[] = [];
  lines.push('SECTION,LABEL,SELECTED,CHECKED_IN,CURRENTLY_INSIDE,PICKED_UP,NOT_ARRIVED,ATTENDANCE_PCT');
  lines.push(
    [
      'Summary',
      snapshot.event?.title || 'Event',
      snapshot.summary.selected,
      snapshot.summary.checkedIn,
      snapshot.summary.inside,
      snapshot.summary.pickedUp,
      snapshot.summary.notArrived,
      `${snapshot.summary.attendancePct}%`
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  for (const grp of snapshot.ageGroups) {
    lines.push(
      [
        'Age Group',
        `Ages ${grp.ageGroup}`,
        grp.selected,
        grp.checkedIn,
        grp.inside,
        grp.pickedUp,
        grp.notArrived,
        `${grp.attendancePct}%`
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  lines.push('');
  lines.push('VOLUNTEER_NAME,DUTY_ROLE,CHECK_INS,PICKUPS,TOTAL_ACTIONS,LAST_ACTIVITY_AT');
  for (const vol of snapshot.volunteers) {
    lines.push(
      [
        vol.name,
        vol.dutyRole || 'Unassigned',
        vol.checkIns,
        vol.pickups,
        vol.totalActions,
        vol.lastActivityAt || ''
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  lines.push('');
  lines.push('TIME,ACTION,CHILD_NAME,AGE,AGE_GROUP,VOLUNTEER_NAME,LOCATION');
  for (const act of snapshot.recentActivity) {
    lines.push(
      [
        act.time,
        act.action === 'check_in' ? 'Checked In' : 'Picked Up',
        act.childName,
        act.age ?? '',
        act.ageGroup,
        act.volunteerName,
        act.location || ''
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  return lines.join('\r\n');
}

export function renderEventAnalyticsSummaryPdf(snapshot: EventAnalyticsSnapshot): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  // Header
  doc.setFillColor(24, 24, 27);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(197, 155, 39);
  doc.setFontSize(10);
  doc.text('KOINONIA GENERAL ASSEMBLY · EVENT ANALYTICS SUMMARY', 14, 12);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(snapshot.event?.title || 'Event Analytics', 14, 21);
  doc.setFontSize(9);
  doc.setTextColor(212, 212, 216);
  doc.text(`Snapshot: ${snapshot.updatedAt}`, 14, 27);

  y = 42;
  doc.setTextColor(24, 24, 27);
  doc.setFontSize(12);
  doc.text('Live Attendance Summary', 14, y);
  y += 7;

  doc.setFontSize(10);
  const summaryLine = `Selected: ${snapshot.summary.selected}   |   Checked in: ${snapshot.summary.checkedIn}   |   Inside: ${snapshot.summary.inside}   |   Picked up: ${snapshot.summary.pickedUp}   |   Not arrived: ${snapshot.summary.notArrived}   |   Attendance: ${snapshot.summary.attendancePct}%`;
  doc.text(summaryLine, 14, y);
  y += 12;

  // Age groups table
  doc.setFontSize(12);
  doc.text('Attendance by Age Group', 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122);
  doc.text('Age Group', 14, y);
  doc.text('Selected', 55, y);
  doc.text('Checked in', 80, y);
  doc.text('Inside', 108, y);
  doc.text('Picked up', 132, y);
  doc.text('Not arrived', 158, y);
  doc.text('Attendance %', 184, y);
  y += 4;
  doc.setDrawColor(228, 228, 231);
  doc.line(14, y, 196, y);
  y += 5;

  doc.setTextColor(24, 24, 27);
  for (const grp of snapshot.ageGroups) {
    doc.text(`Ages ${grp.ageGroup}`, 14, y);
    doc.text(String(grp.selected), 55, y);
    doc.text(String(grp.checkedIn), 80, y);
    doc.text(String(grp.inside), 108, y);
    doc.text(String(grp.pickedUp), 132, y);
    doc.text(String(grp.notArrived), 158, y);
    doc.text(`${grp.attendancePct}%`, 184, y);
    y += 6;
  }

  y += 8;
  doc.setFontSize(12);
  doc.text('Volunteer Activity Summary', 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122);
  doc.text('Volunteer', 14, y);
  doc.text('Duty', 78, y);
  doc.text('Check-ins', 128, y);
  doc.text('Pickups', 155, y);
  doc.text('Total', 182, y);
  y += 4;
  doc.line(14, y, 196, y);
  y += 5;

  doc.setTextColor(24, 24, 27);
  for (const vol of snapshot.volunteers.slice(0, 28)) {
    if (y > 275) {
      doc.addPage();
      y = 18;
    }
    doc.text(String(vol.name || '').slice(0, 32), 14, y);
    doc.text(String(vol.dutyRole || 'Assigned Staff').slice(0, 24), 78, y);
    doc.text(String(vol.checkIns), 128, y);
    doc.text(String(vol.pickups), 155, y);
    doc.text(String(vol.totalActions), 182, y);
    y += 5.5;
  }

  const ab = doc.output('arraybuffer');
  return Buffer.from(ab);
}

