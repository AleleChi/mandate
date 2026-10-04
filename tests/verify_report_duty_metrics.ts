import { calculateAnalytics } from '../src/server/services/reportAnalyticsService';

async function runTests() {
  console.log('================================================================');
  console.log('REPORT DUTY METRICS — CANONICAL DATA AND PRESENCE TESTS');
  console.log('================================================================\n');

  const testEventId = 'event-duty-test-2026';

  // Base snapshot fixture
  const baseSnapshot = {
    event: {
      id: testEventId,
      title: 'Duty Metric Test Assembly',
      starts_at: '2026-11-20',
      ends_at: '2026-11-21'
    },
    locations: [
      { id: 'loc-hall-a', name: 'Main Sanctuary', is_active: 1, event_id: testEventId },
      { id: 'loc-hall-b', name: 'Toddler Room', is_active: 1, event_id: testEventId }
    ],
    rosterVolunteers: [
      { user_id: 'usr-vol-1', status: 'approved' },
      { user_id: 'usr-vol-2', status: 'approved' },
      { user_id: 'usr-vol-3', status: 'approved' }
    ],
    childEntries: [],
    attendanceRecords: []
  };

  // 1. assigned + no presence
  // currently on duty = 0, reported during event = 0
  {
    const snapshot1 = {
      ...baseSnapshot,
      dutyAssignments: [
        {
          id: 'asg-1',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          assignment_status: 'scheduled',
          volunteer_status: 'approved',
          assigned_location_id: 'loc-hall-a'
        }
      ],
      dutyPresence: []
    };
    const analytics1 = calculateAnalytics(snapshot1);
    const vol1 = analytics1.volunteers;
    if (vol1.currentlyOnDuty !== 0 || vol1.reportedDuringEvent !== 0) {
      throw new Error(`Test 1 Failed: Expected currentlyOnDuty=0 and reportedDuringEvent=0, got currentlyOnDuty=${vol1.currentlyOnDuty}, reportedDuringEvent=${vol1.reportedDuringEvent}`);
    }
    console.log('✓ [PASS] Test 1: Assigned with no presence -> currentlyOnDuty = 0, reportedDuringEvent = 0');
  }

  // 2. assigned + active presence
  // currently on duty = 1, reported during event = 1
  {
    const snapshot2 = {
      ...baseSnapshot,
      dutyAssignments: [
        {
          id: 'asg-1',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          assignment_status: 'on_duty',
          volunteer_status: 'approved',
          assigned_location_id: 'loc-hall-a'
        }
      ],
      dutyPresence: [
        {
          id: 'pres-1',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          event_location_id: 'loc-hall-a',
          started_at: '2026-11-20T09:00:00Z',
          ended_at: null
        }
      ]
    };
    const analytics2 = calculateAnalytics(snapshot2);
    const vol2 = analytics2.volunteers;
    if (vol2.currentlyOnDuty !== 1 || vol2.reportedDuringEvent !== 1) {
      throw new Error(`Test 2 Failed: Expected currentlyOnDuty=1 and reportedDuringEvent=1, got currentlyOnDuty=${vol2.currentlyOnDuty}, reportedDuringEvent=${vol2.reportedDuringEvent}`);
    }
    console.log('✓ [PASS] Test 2: Assigned with active presence -> currentlyOnDuty = 1, reportedDuringEvent = 1');
  }

  // 3. assigned + ended presence
  // currently on duty = 0, reported during event = 1, checked out = 1
  {
    const snapshot3 = {
      ...baseSnapshot,
      dutyAssignments: [
        {
          id: 'asg-1',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          assignment_status: 'available',
          volunteer_status: 'approved',
          assigned_location_id: 'loc-hall-a'
        }
      ],
      dutyPresence: [
        {
          id: 'pres-1',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          event_location_id: 'loc-hall-a',
          started_at: '2026-11-20T09:00:00Z',
          ended_at: '2026-11-20T12:00:00Z'
        }
      ]
    };
    const analytics3 = calculateAnalytics(snapshot3);
    const vol3 = analytics3.volunteers;
    if (vol3.currentlyOnDuty !== 0 || vol3.reportedDuringEvent !== 1 || vol3.checkedOut !== 1) {
      throw new Error(`Test 3 Failed: Expected currentlyOnDuty=0, reportedDuringEvent=1, checkedOut=1; got currentlyOnDuty=${vol3.currentlyOnDuty}, reportedDuringEvent=${vol3.reportedDuringEvent}, checkedOut=${vol3.checkedOut}`);
    }
    console.log('✓ [PASS] Test 3: Assigned with ended presence -> currentlyOnDuty = 0, reportedDuringEvent = 1, checkedOut = 1');
  }

  // 4. old-event presence excluded
  {
    const snapshot4 = {
      ...baseSnapshot,
      dutyAssignments: [
        {
          id: 'asg-1',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          assignment_status: 'scheduled',
          volunteer_status: 'approved',
          assigned_location_id: 'loc-hall-a'
        }
      ],
      dutyPresence: [
        {
          id: 'pres-old-1',
          event_id: 'event-old-2025',
          user_id: 'usr-vol-1',
          event_location_id: 'loc-hall-a',
          started_at: '2025-11-20T09:00:00Z',
          ended_at: null
        }
      ]
    };
    const analytics4 = calculateAnalytics(snapshot4);
    const vol4 = analytics4.volunteers;
    if (vol4.currentlyOnDuty !== 0 || vol4.reportedDuringEvent !== 0) {
      throw new Error(`Test 4 Failed: Expected foreign event presence to be excluded, got currentlyOnDuty=${vol4.currentlyOnDuty}, reportedDuringEvent=${vol4.reportedDuringEvent}`);
    }
    console.log('✓ [PASS] Test 4: Foreign event presence strictly excluded -> currentlyOnDuty = 0, reportedDuringEvent = 0');
  }

  // 5. duplicate presence rows for same volunteer -> distinct volunteer count correct
  {
    const snapshot5 = {
      ...baseSnapshot,
      dutyAssignments: [
        {
          id: 'asg-1',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          assignment_status: 'on_duty',
          volunteer_status: 'approved',
          assigned_location_id: 'loc-hall-a'
        }
      ],
      dutyPresence: [
        {
          id: 'pres-1a',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          event_location_id: 'loc-hall-a',
          started_at: '2026-11-20T08:00:00Z',
          ended_at: '2026-11-20T10:00:00Z'
        },
        {
          id: 'pres-1b',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          event_location_id: 'loc-hall-a',
          started_at: '2026-11-20T10:30:00Z',
          ended_at: null
        },
        {
          id: 'pres-1c',
          event_id: testEventId,
          user_id: 'usr-vol-1',
          event_location_id: 'loc-hall-b',
          started_at: '2026-11-20T11:00:00Z',
          ended_at: null
        }
      ]
    };
    const analytics5 = calculateAnalytics(snapshot5);
    const vol5 = analytics5.volunteers;
    if (vol5.currentlyOnDuty !== 1 || vol5.reportedDuringEvent !== 1 || vol5.checkedOut !== 0) {
      throw new Error(`Test 5 Failed: Expected 1 distinct active on-duty volunteer, got currentlyOnDuty=${vol5.currentlyOnDuty}, reportedDuringEvent=${vol5.reportedDuringEvent}, checkedOut=${vol5.checkedOut}`);
    }
    console.log('✓ [PASS] Test 5: Multiple presence rows for same volunteer deduplicated to 1 distinct on-duty volunteer');
  }

  console.log('\n================================================================');
  console.log('DUTY METRICS TEST SUITE COMPLETED: ALL 5 CHECKS PASSED');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
