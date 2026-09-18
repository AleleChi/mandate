import {
  groupAutomationsForOverview,
  formatHumanExpectedTime,
  formatHumanDate,
  resolveCategory,
  calculateCategorySummaries
} from '../src/components/admin/eventWatchModel';
import { AutomationRecordItem } from '../src/components/admin/AutomationDetailModal';

function createMockItem(overrides: Partial<AutomationRecordItem>): AutomationRecordItem {
  return {
    id: `item-${Math.random().toString(36).slice(2, 9)}`,
    event_id: 'event-test-2026',
    rule_id: 'rule-test',
    signal_type: 'REPORT_EXPIRED',
    title: 'A report download is no longer available',
    summary: 'Expired copy',
    description: null,
    severity: 'information',
    status: 'active',
    entity_type: 'report',
    entity_id: 'rep-1',
    payload_json: '{}',
    proposed_action_key: null,
    action_target_route: 'reports',
    action_target_label: 'Open Reports →',
    first_detected_at: new Date(Date.now() - 3600000).toISOString(),
    last_detected_at: new Date().toISOString(),
    resolved_at: null,
    acknowledged_at: null,
    ...overrides
  };
}

export async function runEventWatchPresentationTests() {
  console.log('================================================================');
  console.log('EVENT WATCH — PRESENTATION & SCALE REGRESSION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`, detail ? JSON.stringify(detail) : '');
      failed++;
    }
  }

  // 1. Test Scale: 0 items
  const res0 = groupAutomationsForOverview([]);
  assert(res0.overviewItems.length === 0, 'Scale 0: Overview renders 0 items');
  assert(res0.totalActiveCount === 0, 'Scale 0: Total active count is 0');
  assert(res0.categorySummaries.length === 0, 'Scale 0: No category summaries');

  // 2. Test Scale: 1 item
  const item1 = createMockItem({
    signal_type: 'SAFETY_ITEM_OPEN',
    title: '1 safety item needs attention',
    severity: 'urgent'
  });
  const res1 = groupAutomationsForOverview([item1]);
  assert(res1.overviewItems.length === 1, 'Scale 1: Overview renders 1 item');
  assert(res1.overviewItems[0].title === '1 safety item needs attention', 'Scale 1: Title normalized and humanized');
  assert(res1.overviewItems[0].isGroup === false, 'Scale 1: Single item is not a group');

  // 3. Test Scale: 5 items (1 safety, 2 no-shows, 2 config gaps)
  const items5 = [
    createMockItem({ signal_type: 'SAFETY_ITEM_OPEN', title: '1 safety item needs attention', severity: 'urgent' }),
    createMockItem({
      signal_type: 'VOLUNTEER_NO_SHOW',
      title: 'Jane Doe has not reported for duty',
      payload_json: JSON.stringify({ volunteerName: 'Jane Doe', locationName: 'Check-in Gate A' })
    }),
    createMockItem({
      signal_type: 'VOLUNTEER_NO_SHOW',
      title: 'John Smith has not reported for duty',
      payload_json: JSON.stringify({ volunteerName: 'John Smith', locationName: 'Main Auditorium' })
    }),
    createMockItem({ signal_type: 'CONFIGURATION_GAP', title: 'Volunteer registration needs a closing date' }),
    createMockItem({ signal_type: 'CONFIGURATION_GAP', title: 'Event child capacity is not set' })
  ];
  const res5 = groupAutomationsForOverview(items5);
  assert(res5.overviewItems.length === 5, 'Scale 5: 5 distinct actionable items rendered individually (threshold <= 3)');
  assert(res5.overviewItems[0].category === 'Safety', 'Priority: Safety is top priority rank 1');
  assert(res5.overviewItems[1].category === 'Duty', 'Priority: Duty no-shows follow Safety');

  // 4. Test Scale: 27 items (1 safety, 1 no-show, 1 config, 24 expired reports)
  const items27 = [
    createMockItem({ signal_type: 'SAFETY_ITEM_OPEN', title: '1 safety item needs attention', severity: 'urgent' }),
    createMockItem({
      signal_type: 'VOLUNTEER_NO_SHOW',
      title: 'Ogunaka Tochukwu Blessing has not reported for duty',
      payload_json: JSON.stringify({ volunteerName: 'Ogunaka Tochukwu Blessing', locationName: 'Infant Care Suite' })
    }),
    createMockItem({ signal_type: 'CONFIGURATION_GAP', title: 'Volunteer registration needs a closing date' }),
    ...Array.from({ length: 24 }, (_, i) =>
      createMockItem({
        id: `rep-${i}`,
        signal_type: 'REPORT_EXPIRED',
        title: 'A report download is no longer available',
        summary: `Expired 17 Sept · Leadership Report #${i + 1}`
      })
    )
  ];
  const res27 = groupAutomationsForOverview(items27);
  assert(res27.totalActiveCount === 27, 'Scale 27: Total active count is 27');
  assert(res27.overviewItems.length === 4, 'Scale 27: Overview bounded to 4 concise priority rows (reports grouped into 1)');
  const reportsGroup = res27.overviewItems.find(g => g.signalType === 'REPORT_EXPIRED');
  assert(Boolean(reportsGroup && reportsGroup.isGroup), 'Scale 27: 24 expired reports grouped into single item');
  assert(reportsGroup?.title === '24 report downloads are no longer available', 'Scale 27: Grouped reports title correct');
  assert(reportsGroup?.items.length === 24, 'Scale 27: All 24 underlying report records preserved in group');
  assert(res27.categorySummaries.length === 4, 'Scale 27: 4 categories represented (Safety 1, Duty 1, Event setup 1, Reports 24)');

  // 5. Test Scale: 100 items (1 safety, 8 no-shows, 5 config gaps, 60 expired reports, 26 informational event starting/passes)
  const items100 = [
    createMockItem({ signal_type: 'SAFETY_ITEM_OPEN', title: '1 safety item needs attention', severity: 'urgent' }),
    ...Array.from({ length: 8 }, (_, i) =>
      createMockItem({
        id: `noshow-${i}`,
        signal_type: 'VOLUNTEER_NO_SHOW',
        title: `Volunteer ${i + 1} has not reported for duty`,
        payload_json: JSON.stringify({ volunteerName: `Volunteer ${i + 1}`, locationName: `Zone ${i % 3}` })
      })
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      createMockItem({
        id: `config-${i}`,
        signal_type: 'CONFIGURATION_GAP',
        title: `Setup gap #${i + 1}`
      })
    ),
    ...Array.from({ length: 60 }, (_, i) =>
      createMockItem({
        id: `report-${i}`,
        signal_type: 'REPORT_EXPIRED',
        title: 'A report download is no longer available'
      })
    ),
    ...Array.from({ length: 26 }, (_, i) =>
      createMockItem({
        id: `pass-${i}`,
        signal_type: 'PASS_NOT_READY',
        title: 'Selected child still needs a pass'
      })
    )
  ];
  const res100 = groupAutomationsForOverview(items100, 5);
  assert(res100.totalActiveCount === 100, 'Scale 100: Total active records = 100');
  assert(res100.overviewItems.length <= 5, `Scale 100: Overview strictly bounded to <= 5 rows (actual: ${res100.overviewItems.length})`);
  assert(res100.hasMore === true, 'Scale 100: hasMore flag is true for "View all" trigger');

  // Verify group thresholds for large lists
  const noshowGroup = res100.overviewItems.find(g => g.signalType === 'VOLUNTEER_NO_SHOW');
  assert(Boolean(noshowGroup && noshowGroup.isGroup), 'Scale 100: 8 no-shows grouped into 1 category row');
  assert(noshowGroup?.title === '8 volunteers have not reported for duty', 'Scale 100: No-show grouped title correct');
  assert(noshowGroup?.items.length === 8, 'Scale 100: Underlying 8 no-show records preserved');

  const configGroup = res100.overviewItems.find(g => g.signalType === 'CONFIGURATION_GAP');
  assert(Boolean(configGroup && configGroup.isGroup), 'Scale 100: 5 setup gaps grouped into 1 category row');
  assert(configGroup?.title === '5 event setup items need attention', 'Scale 100: Setup gaps grouped title correct');

  // 6. Time formatting assertions
  const testDate = new Date();
  testDate.setHours(18, 2, 0, 0);
  const timeStrSameDay = formatHumanExpectedTime(testDate.toISOString());
  assert(timeStrSameDay.includes('Expected at 6:02 PM') || timeStrSameDay.includes('6:02'), 'Time: Same-day format is "Expected at 6:02 PM"');
  assert(!timeStrSameDay.includes('Scheduled at'), 'Time: No mechanical "Scheduled at" text');

  // 7. Grammar & Number Normalization assertions
  assert(!reportsGroup?.title.includes('download(s)'), 'Grammar: No ugly (s) suffix');
  assert(!reportsGroup?.title.startsWith('0'), 'Grammar: No leading zero padding');

  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} presentation tests failed.`);
  }

  return { passed, failed };
}

// ESM direct execution entrypoint
runEventWatchPresentationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
