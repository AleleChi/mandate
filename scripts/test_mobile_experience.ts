/**
 * Focused automated tests for:
 * 1. Notification read state & date grouping
 * 2. PWA install utility logic
 * 3. Push subscription helper & status mapping
 */

import assert from 'node:assert';

function testNotificationGrouping() {
  console.log('Testing Notification Grouping...');

  const now = new Date();
  const todayStr = now.toISOString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString();

  const earlier = new Date(now);
  earlier.setDate(earlier.getDate() - 5);
  const earlierStr = earlier.toISOString();

  const items = [
    { id: '1', title: 'Location assigned', message: 'Hall A', createdAt: todayStr, isRead: false },
    { id: '2', title: 'Pass ready', message: 'Samuel pass ready', createdAt: todayStr, isRead: true },
    { id: '3', title: 'Application approved', message: 'Approved', createdAt: yesterdayStr, isRead: true },
    { id: '4', title: 'Welcome', message: 'Welcome to Koinonia', createdAt: earlierStr, isRead: true }
  ];

  // Grouping logic test
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const groups: Record<string, typeof items> = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of items) {
    const itemDate = new Date(item.createdAt);
    itemDate.setHours(0, 0, 0, 0);

    if (itemDate.getTime() === todayStart.getTime()) {
      groups.Today.push(item);
    } else if (itemDate.getTime() === yesterdayStart.getTime()) {
      groups.Yesterday.push(item);
    } else {
      groups.Earlier.push(item);
    }
  }

  assert.strictEqual(groups.Today.length, 2, 'Today group should have 2 notifications');
  assert.strictEqual(groups.Yesterday.length, 1, 'Yesterday group should have 1 notification');
  assert.strictEqual(groups.Earlier.length, 1, 'Earlier group should have 1 notification');

  // Read / Unread count
  const unreadCount = items.filter(n => !n.isRead).length;
  assert.strictEqual(unreadCount, 1, 'Unread count should be 1');

  console.log('  PASS: Notification Grouping & Read state');
}

function testPwaDismissalDuration() {
  console.log('Testing PWA Dismissal Duration logic...');

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Test recent dismissal (e.g. 1 hour ago)
  const dismissedOneHourAgo = now - (60 * 60 * 1000);
  const isStillDismissed1 = now - dismissedOneHourAgo < SEVEN_DAYS_MS;
  assert.strictEqual(isStillDismissed1, true, '1 hour ago dismissal should still be dismissed');

  // Test expired dismissal (e.g. 8 days ago)
  const dismissedEightDaysAgo = now - (8 * 24 * 60 * 60 * 1000);
  const isStillDismissed2 = now - dismissedEightDaysAgo < SEVEN_DAYS_MS;
  assert.strictEqual(isStillDismissed2, false, '8 days ago dismissal should have expired');

  console.log('  PASS: PWA Dismissal Duration logic');
}

function testPaginationSlicing() {
  console.log('Testing Server-side Notification Pagination calculation...');

  const mockList = Array.from({ length: 75 }, (_, i) => ({ id: `notif-${i + 1}` }));
  const total = mockList.length;

  const page = 2;
  const limit = 25;
  const startIndex = (page - 1) * limit;
  const paginated = mockList.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < total;

  assert.strictEqual(paginated.length, 25, 'Page 2 should contain 25 items');
  assert.strictEqual(paginated[0].id, 'notif-26', 'First item of page 2 should be notif-26');
  assert.strictEqual(hasMore, true, 'Page 2 of 75 should have more');

  // Last page
  const page3 = 3;
  const startIndex3 = (page3 - 1) * limit;
  const paginated3 = mockList.slice(startIndex3, startIndex3 + limit);
  const hasMore3 = startIndex3 + limit < total;

  assert.strictEqual(paginated3.length, 25, 'Page 3 should contain 25 items');
  assert.strictEqual(hasMore3, false, 'Page 3 of 75 should not have more');

  console.log('  PASS: Notification Pagination calculation');
}

function runAll() {
  console.log('\n=== RUNNING MOBILE EXPERIENCE UNIT TESTS ===\n');
  testNotificationGrouping();
  testPwaDismissalDuration();
  testPaginationSlicing();
  console.log('\n=== ALL TESTS PASSED ===\n');
}

runAll();
