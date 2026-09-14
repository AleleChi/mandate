import { query, queryOne, execute, transaction } from '../db';

export interface EventRow {
  id: string;
  title: string;
  section_name?: string;
  location?: string;
  starts_at?: string;
  ends_at?: string;
  daily_start_time?: string;
  daily_end_time?: string;
  description?: string;
  status: string;
  timezone?: string;
  parent_access_opens_at?: string;
  parent_access_closes_at?: string;
  parents_can_create_account?: number | boolean;
  allow_multiple_children?: number | boolean;
  allow_save_and_continue?: number | boolean;
  allow_edit_after_submission?: number | boolean;
  created_at?: string;
  updated_at?: string;
  archived_at?: string;
}

export interface SetCurrentEventResult {
  success: boolean;
  currentEvent: {
    id: string;
    title: string;
    status: string;
  };
  previousEventId: string | null;
}

/**
 * Canonical resolver for the current active event.
 * Server-authoritative: returns the single event where status = 'current'.
 * STRICT: NO fallback to 'open', 'active', latest date, or hardcoded constants.
 * If no event has status = 'current', returns null cleanly.
 */
export async function getCurrentEvent(): Promise<EventRow | null> {
  const rows = await query<EventRow>(
    "SELECT * FROM events WHERE status = 'current'"
  );
  if (!rows || rows.length === 0) {
    return null;
  }
  if (rows.length > 1) {
    console.error(
      `[eventService:CRITICAL] Multiple events (${rows.length}) found with status = 'current'! IDs: ${rows.map(r => r.id).join(', ')}`
    );
  }
  return rows[0];
}

/**
 * Returns the ID of the current active event, or null if none is designated.
 */
export async function getCurrentEventId(): Promise<string | null> {
  const event = await getCurrentEvent();
  return event ? event.id : null;
}

/**
 * Retrieves an event by its unique ID.
 * Kept distinct from getCurrentEvent() to separate view context from active lifecycle state.
 */
export async function getEventById(eventId: string): Promise<EventRow | null> {
  return queryOne<EventRow>('SELECT * FROM events WHERE id = ?', [eventId]);
}

/**
 * Atomically makes the specified event the single current active event.
 * Executes inside a single database transaction:
 * 1. Confirms target event exists.
 * 2. Deactivates existing lifecycle aliases ('current', 'open', 'active') on all other events,
 *    demoting them to 'upcoming' (preserving draft and archived/closed events).
 * 3. Sets target event status = 'current'.
 * 4. Verifies that exactly one event has status = 'current'.
 * 5. On failure, rolls back all changes.
 */
export async function setCurrentEvent(targetEventId: string): Promise<SetCurrentEventResult> {
  return transaction(async () => {
    // 1. Confirm target event exists
    const targetEvent = await queryOne<EventRow>('SELECT * FROM events WHERE id = ?', [targetEventId]);
    if (!targetEvent) {
      const err: any = new Error(`Event not found: ${targetEventId}`);
      err.statusCode = 404;
      throw err;
    }

    // Capture previous current event if any
    const previousCurrent = await queryOne<{ id: string }>(
      "SELECT id FROM events WHERE status = 'current' AND id != ?",
      [targetEventId]
    );

    const now = new Date().toISOString();

    // 2. Change existing lifecycle aliases ('current', 'open', 'active') to 'upcoming' for all non-target events.
    // Preserves draft and archived/closed events.
    await execute(`
      UPDATE events 
      SET status = 'upcoming', updated_at = ? 
      WHERE id != ? AND status IN ('current', 'open', 'active')
    `, [now, targetEventId]);

    // 3. Set target event: status = 'current'
    await execute(`
      UPDATE events 
      SET status = 'current', updated_at = ? 
      WHERE id = ?
    `, [now, targetEventId]);

    // 4. Verify there is exactly one current event
    const currentRows = await query<EventRow>("SELECT id, title, status FROM events WHERE status = 'current'");
    if (currentRows.length !== 1 || currentRows[0].id !== targetEventId) {
      throw new Error(
        `Atomic switch integrity failure: expected exactly 1 current event (${targetEventId}), but found ${currentRows.length}`
      );
    }

    return {
      success: true,
      currentEvent: {
        id: currentRows[0].id,
        title: currentRows[0].title,
        status: 'current'
      },
      previousEventId: previousCurrent?.id || null
    };
  });
}
