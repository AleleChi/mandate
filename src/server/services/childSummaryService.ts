import { queryOne } from '../db';
import { getCurrentEventId, getEventById } from './eventService';

export interface ChildSummaryStats {
  totalChildren: number;
  selected: number;
  checkedIn: number;
  inside: number;
  pickedUp: number;
  removed: number;
  needsAttention: number;
  underReview: number;
  waitingList: number;
  notSelected: number;
}

export interface ChildEventSummary {
  childId: string;
  eventId: string;
  status: string;
  checkedIn: boolean;
  inside: boolean;
  pickedUp: boolean;
  hasMedicalNotes: boolean;
  needsExtraSupport: boolean;
  needsAgeReview: boolean;
}

/**
 * Resolves event ID for child summary operations.
 * - If explicit valid eventId (or existing record with event_id/eventId) is provided, use it.
 * - Otherwise canonical getCurrentEventId() only.
 * - Never fall back to 'event-ga-2026', 'active', 'open', or 'latest'.
 */
export async function resolveChildSummaryEventId(
  eventContext?: string | { event_id?: string; eventId?: string } | null
): Promise<string | null> {
  if (typeof eventContext === 'string' && eventContext.trim().length > 0) {
    const ev = await getEventById(eventContext.trim());
    return ev ? ev.id : null;
  }
  if (eventContext && typeof eventContext === 'object') {
    const rawId = eventContext.event_id || eventContext.eventId;
    if (rawId && typeof rawId === 'string' && rawId.trim().length > 0) {
      const ev = await getEventById(rawId.trim());
      return ev ? ev.id : null;
    }
  }
  return await getCurrentEventId();
}

export async function getChildSummaryStats(
  eventContext?: string | { event_id?: string; eventId?: string } | null
): Promise<ChildSummaryStats> {
  const eventId = await resolveChildSummaryEventId(eventContext);

  if (!eventId) {
    return {
      totalChildren: 0,
      selected: 0,
      checkedIn: 0,
      inside: 0,
      pickedUp: 0,
      removed: 0,
      needsAttention: 0,
      underReview: 0,
      waitingList: 0,
      notSelected: 0
    };
  }

  const [
    totalRes,
    selectedRes,
    checkedInRes,
    insideRes,
    pickedUpRes,
    removedRes,
    needsAttentionRes,
    underReviewRes,
    waitingListRes,
    notSelectedRes
  ] = await Promise.all([
    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status != 'removed'
    `, [eventId]),

    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    `, [eventId]),

    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status IN ('checked_in', 'inside', 'picked_up')
    `, [eventId]),

    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status IN ('checked_in', 'inside')
    `, [eventId]),

    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status = 'picked_up'
    `, [eventId]),

    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 1 OR c.is_deleted = 1 OR e.status = 'removed')
    `, [eventId]),

    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND (e.has_medical_notes = 1 OR e.needs_extra_support = 1 OR c.needs_age_review = 1)
    `, [eventId]),

    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status = 'under_review'
    `, [eventId]),

    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status = 'waiting_list'
    `, [eventId]),

    queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status IN ('not_selected', 'withdrawn', 'rejected')
    `, [eventId])
  ]);

  return {
    totalChildren: totalRes?.count || 0,
    selected: selectedRes?.count || 0,
    checkedIn: checkedInRes?.count || 0,
    inside: insideRes?.count || 0,
    pickedUp: pickedUpRes?.count || 0,
    removed: removedRes?.count || 0,
    needsAttention: needsAttentionRes?.count || 0,
    underReview: underReviewRes?.count || 0,
    waitingList: waitingListRes?.count || 0,
    notSelected: notSelectedRes?.count || 0
  };
}

/**
 * Returns child operational and safety summary tied to a specific record or event context.
 * Preserves the record's stored event_id and avoids cross-event data leakage.
 */
export async function getChildSummaryForRecord(
  childId: string,
  eventContext?: string | { event_id?: string; eventId?: string } | null
): Promise<ChildEventSummary | null> {
  const eventId = await resolveChildSummaryEventId(eventContext);
  if (!eventId) return null;

  const row = await queryOne(`
    SELECT e.child_id, e.event_id, e.status, e.has_medical_notes, e.needs_extra_support, c.needs_age_review
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    WHERE e.child_id = ? AND e.event_id = ? AND (e.is_deleted = 0 OR e.is_deleted IS NULL) AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
  `, [childId, eventId]);

  if (!row) return null;

  return {
    childId: row.child_id,
    eventId: row.event_id,
    status: row.status,
    checkedIn: ['checked_in', 'inside', 'picked_up'].includes(row.status),
    inside: ['checked_in', 'inside'].includes(row.status),
    pickedUp: row.status === 'picked_up',
    hasMedicalNotes: Boolean(row.has_medical_notes),
    needsExtraSupport: Boolean(row.needs_extra_support),
    needsAgeReview: Boolean(row.needs_age_review)
  };
}

/**
 * Returns summary tied to an existing child_event_entries record.
 * Uses that record's stored event_id.
 */
export async function getChildEntrySummary(
  entry: { child_id: string; event_id: string }
): Promise<ChildEventSummary | null> {
  if (!entry || !entry.child_id || !entry.event_id) return null;
  return getChildSummaryForRecord(entry.child_id, entry.event_id);
}
