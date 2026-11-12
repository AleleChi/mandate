import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { EventAnalyticsView } from '../src/components/admin/analytics/EventAnalyticsView';
import { EventAnalyticsSnapshot } from '../src/components/admin/analytics/types';
import { createAnalyticsLiveSyncController } from '../src/components/admin/analytics/liveSyncController';

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(err?.stack || err?.message);
    process.exitCode = 1;
  }
}

const MOCK_SNAPSHOT: EventAnalyticsSnapshot = {
  event: {
    id: 'ev-live-2026',
    title: 'GA 2026 Live',
    status: 'current',
    startsAt: '2026-11-21T08:00:00Z',
    endsAt: '2026-11-21T18:00:00Z',
    location: 'Main Hall',
    timezone: 'Europe/London'
  },
  availableEvents: [
    {
      id: 'ev-live-2026',
      title: 'GA 2026 Live',
      status: 'current',
      startsAt: '2026-11-21T08:00:00Z',
      location: 'Main Hall'
    }
  ],
  summary: {
    selected: 100,
    checkedIn: 60,
    inside: 50,
    pickedUp: 10,
    notArrived: 40,
    attendancePct: 60.0
  },
  ageGroups: [
    { ageGroup: '2–3', selected: 20, checkedIn: 12, inside: 10, pickedUp: 2, notArrived: 8, attendancePct: 60.0, exactAges: [] },
    { ageGroup: '4–6', selected: 20, checkedIn: 14, inside: 12, pickedUp: 2, notArrived: 6, attendancePct: 70.0, exactAges: [] },
    { ageGroup: '7–9', selected: 20, checkedIn: 12, inside: 10, pickedUp: 2, notArrived: 8, attendancePct: 60.0, exactAges: [] },
    { ageGroup: '10–12', selected: 20, checkedIn: 12, inside: 10, pickedUp: 2, notArrived: 8, attendancePct: 60.0, exactAges: [] },
    { ageGroup: '13–14', selected: 20, checkedIn: 10, inside: 8, pickedUp: 2, notArrived: 10, attendancePct: 50.0, exactAges: [] }
  ],
  volunteers: [
    {
      volunteerId: 'v-a',
      name: 'Grace Daniels',
      role: 'volunteer',
      dutyRole: 'Check In · Welcome Team',
      teamKey: 'welcome_team',
      assignedAgeGroups: 'Ages 2-14',
      checkIns: 25,
      pickups: 5,
      totalActions: 30,
      lastActivityAt: '2026-11-21T13:15:00Z'
    },
    {
      volunteerId: 'v-b',
      name: 'Samuel Okoye',
      role: 'volunteer',
      dutyRole: 'Check In · Door Team',
      teamKey: 'door_team',
      assignedAgeGroups: 'Ages 4-6',
      checkIns: 18,
      pickups: 0,
      totalActions: 18,
      lastActivityAt: '2026-11-21T09:40:00Z'
    }
  ],
  timeline: [
    { bucketStartIso: '2026-11-21T08:00:00Z', label: '08:00', checkIns: 35, pickups: 0, cumulativeCheckIns: 35, cumulativePickups: 0 },
    { bucketStartIso: '2026-11-21T08:15:00Z', label: '08:15', checkIns: 25, pickups: 0, cumulativeCheckIns: 60, cumulativePickups: 0 },
    { bucketStartIso: '2026-11-21T13:15:00Z', label: '13:15', checkIns: 0, pickups: 10, cumulativeCheckIns: 60, cumulativePickups: 10 }
  ],
  recentActivity: [
    {
      id: 'entry-1:pickup',
      time: '2026-11-21T13:15:00Z',
      action: 'pickup',
      childId: 'c-1',
      childName: 'Daniel Okafor',
      age: 5,
      ageGroup: '4–6',
      volunteerId: 'v-a',
      volunteerName: 'Grace Daniels',
      location: 'North Gate'
    }
  ],
  activityPagination: {
    page: 1,
    pageSize: 20,
    totalRecords: 1,
    totalPages: 1
  },
  filters: {
    ageGroup: '',
    volunteerId: '',
    action: 'all'
  },
  updatedAt: '2026-11-21T13:15:00Z',
  version: 'v1'
};

console.log('\n=== EVENT ANALYTICS FRONTEND UI & LIVE SYNC SUITE ===\n');

runTest('1. Renders EventAnalyticsView metrics, age groups, volunteers & quiet operational copy', () => {
  const html = renderToString(React.createElement(EventAnalyticsView, { initialSnapshot: MOCK_SNAPSHOT }));
  assert.ok(html.includes('Event Analytics'));
  assert.ok(html.includes('Read-Only'));
  assert.ok(html.includes('100'));
  assert.ok(html.includes('60.0%'));
  assert.ok(html.includes('Ages 2–3'));
  assert.ok(html.includes('Ages 4–6'));
  assert.ok(html.includes('Ages 13–14'));
  assert.ok(html.includes('Grace Daniels'));
  assert.ok(html.includes('Samuel Okoye'));
  assert.ok(html.includes('Daniel Okafor'));
  assert.ok(html.includes('North Gate'));
  assert.equal(html.includes('ONLINE'), false, 'Should not render noisy ONLINE badge');
});

runTest('2. Renders clean empty state when no active event is available', () => {
  const emptySnapshot: EventAnalyticsSnapshot = {
    ...MOCK_SNAPSHOT,
    event: null,
    availableEvents: [],
    summary: { selected: 0, checkedIn: 0, inside: 0, pickedUp: 0, notArrived: 0, attendancePct: 0 },
    volunteers: [],
    timeline: [],
    recentActivity: []
  };
  const html = renderToString(React.createElement(EventAnalyticsView, { initialSnapshot: emptySnapshot }));
  assert.ok(html.includes('No active event available'));
});

runTest('3. SSE live sync starts 5s fallback polling ONLY while disconnected and clears on reconnect/stop', () => {
  const listeners = new Map<string, Array<(evt?: any) => void>>();
  let mockEs: any = null;
  let closed = false;
  let nextTimerId = 1;
  const activeIntervals = new Map<number, { fn: () => void; ms: number }>();
  const states: string[] = [];
  let refreshCount = 0;

  const controller = createAnalyticsLiveSyncController({
    streamUrl: 'https://api.example.com/api/admin/event-analytics/stream?token=abc',
    pollIntervalMs: 5000,
    onRefresh: () => {
      refreshCount += 1;
    },
    onStateChange: (s) => states.push(s),
    adapter: {
      createEventSource: () => {
        mockEs = {
          onopen: null,
          onerror: null,
          addEventListener: (type: string, fn: (evt?: any) => void) => {
            const arr = listeners.get(type) || [];
            arr.push(fn);
            listeners.set(type, arr);
          },
          close: () => {
            closed = true;
          }
        };
        return mockEs;
      },
      setIntervalFn: (fn, ms) => {
        const id = nextTimerId++;
        activeIntervals.set(id, { fn, ms });
        return id;
      },
      clearIntervalFn: (id) => {
        activeIntervals.delete(id);
      }
    }
  });

  controller.start();
  assert.equal(controller.getState(), 'connecting');
  assert.equal(controller.isPollingActive(), false);
  assert.equal(activeIntervals.size, 0);

  // Connected via SSE -> zero polling timers
  listeners.get('connected')?.forEach((fn) => fn());
  assert.equal(controller.getState(), 'connected');
  assert.equal(controller.isPollingActive(), false);
  assert.equal(activeIntervals.size, 0);

  // SSE update emits refresh without enabling polling
  listeners.get('analytics_update')?.forEach((fn) => fn());
  assert.equal(refreshCount, 1);
  assert.equal(activeIntervals.size, 0);

  // Disconnect triggers single 5s fallback polling interval (repeated onerror never duplicates)
  mockEs.onerror?.();
  mockEs.onerror?.();
  assert.equal(controller.getState(), 'reconnecting');
  assert.equal(controller.isPollingActive(), true);
  assert.equal(activeIntervals.size, 1);
  const pollEntry = Array.from(activeIntervals.values())[0];
  assert.equal(pollEntry.ms, 5000);

  // Simulate fallback poll firing
  pollEntry.fn();
  assert.equal(refreshCount, 2);

  // Reconnect stops fallback polling immediately
  mockEs.onopen?.();
  assert.equal(controller.getState(), 'connected');
  assert.equal(controller.isPollingActive(), false);
  assert.equal(activeIntervals.size, 0);

  // Disconnect again then unmount cleans up SSE + timer
  mockEs.onerror?.();
  assert.equal(activeIntervals.size, 1);
  controller.stop();
  assert.equal(closed, true);
  assert.equal(activeIntervals.size, 0);
});

if (!process.exitCode) {
  console.log('\nAll frontend UI & live sync tests passed.');
}

