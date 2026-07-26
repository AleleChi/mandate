import { queryOne } from '../db';

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

export async function getChildSummaryStats(eventId: string = 'event-ga-2026'): Promise<ChildSummaryStats> {
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
