import { query, queryOne, execute } from '../src/server/db';
import { getCurrentEvent } from '../src/server/services/eventService';

async function runReviewStatsReconciliationTests() {
  console.log('================================================================');
  console.log('KOINONIA REVIEW STATISTICS DB RECONCILIATION TEST SUITE');
  console.log('================================================================\n');

  const currentEvent = await getCurrentEvent();
  if (!currentEvent) {
    throw new Error('No active current event found!');
  }
  const eventId = currentEvent.id;
  console.log(`Current Event: ${currentEvent.title} (ID: ${eventId})\n`);

  // 1. Direct DB queries exactly matching the admin.ts endpoint
  const statSentReview = (await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries
    WHERE event_id = ? AND status = 'under_review' AND (is_deleted = 0 OR is_deleted IS NULL)
  `, [eventId]))?.count || 0;

  const statSelected = (await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries
    WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up') AND (is_deleted = 0 OR is_deleted IS NULL)
  `, [eventId]))?.count || 0;

  const statWaitingList = (await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries
    WHERE event_id = ? AND status = 'waiting_list' AND (is_deleted = 0 OR is_deleted IS NULL)
  `, [eventId]))?.count || 0;

  const statNotSelected = (await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries
    WHERE event_id = ? AND status = 'not_selected' AND (is_deleted = 0 OR is_deleted IS NULL)
  `, [eventId]))?.count || 0;

  const statRemoved = (await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries
    WHERE event_id = ? AND (is_deleted = 1 OR status = 'removed')
  `, [eventId]))?.count || 0;

  const statIncomplete = (await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries
    WHERE event_id = ? AND status IN ('incomplete', 'draft') AND submitted_at IS NULL AND (details_confirmed = 0 OR details_confirmed IS NULL) AND (is_deleted = 0 OR is_deleted IS NULL) AND status != 'removed'
  `, [eventId]))?.count || 0;

  const statTotal = (await queryOne(`
    SELECT COUNT(*) as count
    FROM child_event_entries
    WHERE event_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND status != 'removed'
  `, [eventId]))?.count || 0;

  const statNeedsAttention = (await queryOne(`
    SELECT COUNT(DISTINCT e.id) as count
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    JOIN parent_profiles p ON p.id = c.parent_profile_id
    WHERE e.event_id = ?
      AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
      AND e.status != 'removed'
      AND (
        c.date_of_birth IS NULL OR c.date_of_birth = '' OR c.needs_age_review = 1
        OR CAST(strftime('%Y', '2026-11-21') AS INTEGER) - CAST(strftime('%Y', c.date_of_birth) AS INTEGER) - (CASE WHEN strftime('%m-%d', '2026-11-21') < strftime('%m-%d', c.date_of_birth) THEN 1 ELSE 0 END) < 2
        OR CAST(strftime('%Y', '2026-11-21') AS INTEGER) - CAST(strftime('%Y', c.date_of_birth) AS INTEGER) - (CASE WHEN strftime('%m-%d', '2026-11-21') < strftime('%m-%d', c.date_of_birth) THEN 1 ELSE 0 END) > 14
        OR NOT EXISTS (SELECT 1 FROM pickup_people pp WHERE pp.child_event_entry_id = e.id)
        OR EXISTS (SELECT 1 FROM pickup_people pp WHERE pp.child_event_entry_id = e.id AND (pp.photo_file_id IS NULL OR pp.photo_file_id = '' OR NOT EXISTS (SELECT 1 FROM media_files m WHERE m.id = pp.photo_file_id AND m.secure_url IS NOT NULL AND m.secure_url != '' AND m.secure_url NOT LIKE 'blob:%' AND m.secure_url NOT LIKE 'data:%' AND m.secure_url NOT LIKE '%placeholder%' AND m.secure_url NOT LIKE '%default_avatar%')))
        OR (c.photo_file_id IS NULL OR c.photo_file_id = '' OR NOT EXISTS (SELECT 1 FROM media_files cm WHERE cm.id = c.photo_file_id AND cm.secure_url IS NOT NULL AND cm.secure_url != '' AND cm.secure_url NOT LIKE 'blob:%' AND cm.secure_url NOT LIKE 'data:%' AND cm.secure_url NOT LIKE '%placeholder%' AND cm.secure_url NOT LIKE '%default_avatar%'))
        OR (p.photo_file_id IS NULL OR p.photo_file_id = '' OR NOT EXISTS (SELECT 1 FROM media_files pm WHERE pm.id = p.photo_file_id AND pm.secure_url IS NOT NULL AND pm.secure_url != '' AND pm.secure_url NOT LIKE 'blob:%' AND pm.secure_url NOT LIKE 'data:%' AND pm.secure_url NOT LIKE '%placeholder%' AND pm.secure_url NOT LIKE '%default_avatar%'))
      )
  `, [eventId]))?.count || 0;

  console.log('--- DIRECT DB COUNTS FOR REVIEW ---');
  console.log(`TOTAL:             ${statTotal}`);
  console.log(`INCOMPLETE DRAFTS: ${statIncomplete}`);
  console.log(`AWAITING REVIEW:   ${statSentReview}`);
  console.log(`SELECTED:          ${statSelected}`);
  console.log(`WAITING LIST:      ${statWaitingList}`);
  console.log(`NOT SELECTED:      ${statNotSelected}`);
  console.log(`REMOVED:           ${statRemoved}`);
  console.log(`NEEDS ATTENTION:   ${statNeedsAttention} (orthogonal flag)`);

  // 2. Lifecycle Mutually-Exclusive Sum Check
  const sumLifecycle = statIncomplete + statSentReview + statSelected + statWaitingList + statNotSelected;
  console.log(`\nLifecycle Sum (${statIncomplete} + ${statSentReview} + ${statSelected} + ${statWaitingList} + ${statNotSelected}) = ${sumLifecycle}`);
  console.log(`Reconciles with TOTAL (${statTotal}): ${sumLifecycle === statTotal ? 'YES' : 'NO'}`);

  if (sumLifecycle !== statTotal) {
    throw new Error(`MUTUALLY EXCLUSIVE LIFECYCLE MISMATCH: Sum of states (${sumLifecycle}) does not equal total active applications (${statTotal})`);
  }

  console.log('\n================================================================');
  console.log('🎉 ALL REVIEW STATISTICS RECONCILIATION CHECKS PASSED (100%)');
  console.log('================================================================');
}

runReviewStatsReconciliationTests().catch(err => {
  console.error('\n❌ REVIEW STATS RECONCILIATION TEST FAILURE:', err);
  process.exit(1);
});
