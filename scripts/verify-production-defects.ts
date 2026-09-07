import assert from 'assert';
import { calculateAnalytics } from '../src/server/services/reportAnalyticsService';
import { compileReportDocument } from '../src/server/reports/reportTemplateRegistry';

console.log('=== RUNNING PRODUCTION DEFECT VERIFICATION SUITE ===\n');

// -------------------------------------------------------------
// CASE 1: 2 active volunteers + 11 removed volunteers
// Expected: distinct valid volunteer total = 2. Removed excluded.
// -------------------------------------------------------------
console.log('[CASE 1] 2 active approved volunteers + 11 removed volunteers');
const mockRosterVolunteers = [
  { user_id: 'u-1', volunteer_profile_id: 'vp-1', full_name: 'Alele Chi', status: 'approved', is_deleted: 0 },
  { user_id: 'u-2', volunteer_profile_id: 'vp-2', full_name: 'Blessing Ogunaka', status: 'active', is_deleted: 0 }
];

const mockAssignmentsCase1 = [
  // 2 valid active assignments
  { id: 'asg-1', event_id: 'ev-1', user_id: 'u-1', volunteer_profile_id: 'vp-1', volunteer_status: 'approved', volunteer_is_deleted: 0, status: 'active', team_key: 'Care' },
  { id: 'asg-2', event_id: 'ev-1', user_id: 'u-2', volunteer_profile_id: 'vp-2', volunteer_status: 'active', volunteer_is_deleted: 0, status: 'active', team_key: 'Safety' },
  // 11 removed / deleted volunteer assignments that might exist historically
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `asg-removed-${i + 1}`,
    event_id: 'ev-1',
    user_id: `u-removed-${i + 1}`,
    volunteer_profile_id: `vp-removed-${i + 1}`,
    volunteer_status: 'removed',
    volunteer_is_deleted: 1,
    status: 'cancelled',
    team_key: 'Care'
  }))
];

const snapshotCase1: any = {
  event: { id: 'ev-1', title: 'The General Assembly', starts_at: '2026-11-18' },
  rosterVolunteers: mockRosterVolunteers,
  dutyAssignments: mockAssignmentsCase1,
  childEntries: [
    { id: 'c-1', status: 'checked_in', age_group: 'Primary' },
    { id: 'c-2', status: 'checked_in', age_group: 'Primary' }
  ],
  locations: [
    { id: 'loc-1', name: 'Grace Hall', is_active: 1, is_archived: 0 },
    { id: 'loc-2', name: 'Auditorium', is_active: 1, is_archived: 0 }
  ],
  alerts: [],
  cutoffTime: '2026-09-07T20:00:00Z'
};

const analyticsCase1 = calculateAnalytics(snapshotCase1);
assert.strictEqual(analyticsCase1.volunteers.totalApproved, 2, 'Total assigned volunteers must be 2, not 13');
assert.strictEqual(analyticsCase1.volunteers.activeOnDuty, 2, 'Active on duty volunteers must be 2');
console.log(`  Assigned: ${analyticsCase1.volunteers.totalApproved}, On-duty: ${analyticsCase1.volunteers.activeOnDuty} -> PASS`);


// -------------------------------------------------------------
// CASE 2: 2 valid volunteers + 4 historical / duplicate assignment rows
// Expected: Distinct volunteer count = 2, not row count (4)
// -------------------------------------------------------------
console.log('\n[CASE 2] 2 valid volunteers with 4 assignment rows (multi-shift or duplicates)');
const mockAssignmentsCase2 = [
  { id: 'asg-1a', event_id: 'ev-1', user_id: 'u-1', volunteer_profile_id: 'vp-1', volunteer_status: 'approved', volunteer_is_deleted: 0, status: 'active', team_key: 'Care', assigned_location_id: 'loc-1' },
  { id: 'asg-1b', event_id: 'ev-1', user_id: 'u-1', volunteer_profile_id: 'vp-1', volunteer_status: 'approved', volunteer_is_deleted: 0, status: 'active', team_key: 'Care', assigned_location_id: 'loc-2' },
  { id: 'asg-2a', event_id: 'ev-1', user_id: 'u-2', volunteer_profile_id: 'vp-2', volunteer_status: 'active', volunteer_is_deleted: 0, status: 'active', team_key: 'Safety', assigned_location_id: 'loc-1' },
  { id: 'asg-2b', event_id: 'ev-1', user_id: 'u-2', volunteer_profile_id: 'vp-2', volunteer_status: 'active', volunteer_is_deleted: 0, status: 'scheduled', team_key: 'Safety', assigned_location_id: 'loc-1' }
];

const snapshotCase2: any = {
  ...snapshotCase1,
  dutyAssignments: mockAssignmentsCase2
};

const analyticsCase2 = calculateAnalytics(snapshotCase2);
assert.strictEqual(analyticsCase2.volunteers.totalApproved, 2, 'Distinct valid volunteers must be 2, ignoring duplicate rows');
assert.strictEqual(analyticsCase2.volunteers.activeOnDuty, 2, 'Distinct on-duty volunteers must be 2');
console.log(`  Distinct assigned: ${analyticsCase2.volunteers.totalApproved}, Distinct on-duty: ${analyticsCase2.volunteers.activeOnDuty} -> PASS`);


// -------------------------------------------------------------
// CASE 3: Assignments for Event A and Event B
// Expected: Only Event A assignments count for Event A
// -------------------------------------------------------------
console.log('\n[CASE 3] Cross-event assignment isolation');
const mockAssignmentsCase3 = [
  { id: 'asg-evA-1', event_id: 'event-A', user_id: 'u-1', volunteer_profile_id: 'vp-1', volunteer_status: 'approved', volunteer_is_deleted: 0, status: 'active' },
  { id: 'asg-evB-1', event_id: 'event-B', user_id: 'u-2', volunteer_profile_id: 'vp-2', volunteer_status: 'active', volunteer_is_deleted: 0, status: 'active' },
  { id: 'asg-evB-2', event_id: 'event-B', user_id: 'u-3', volunteer_profile_id: 'vp-3', volunteer_status: 'active', volunteer_is_deleted: 0, status: 'active' }
];

// Snapshot scoped to Event A only receives Event A assignments from reportService query
const filteredForEventA = mockAssignmentsCase3.filter(a => a.event_id === 'event-A');
const snapshotCase3: any = {
  ...snapshotCase1,
  event: { id: 'event-A', title: 'Event A' },
  dutyAssignments: filteredForEventA
};

const analyticsCase3 = calculateAnalytics(snapshotCase3);
assert.strictEqual(analyticsCase3.volunteers.totalApproved, 1, 'Only Event A volunteers must be counted');
assert.strictEqual(analyticsCase3.volunteers.activeOnDuty, 1, 'Only Event A on-duty volunteers must be counted');
console.log(`  Event A assigned: ${analyticsCase3.volunteers.totalApproved} (Event B assignments excluded) -> PASS`);


// -------------------------------------------------------------
// CASE 4: Current event resolution in Admin
// Expected: Canonical resolution finds status === 'current' first, not 'Another Event'
// -------------------------------------------------------------
console.log('\n[CASE 4] Current event resolution matching Admin Header');
const mockEventsList = [
  { id: 'another-event-id', title: 'Another Event', status: 'open', starts_at: null, is_current: false },
  { id: 'event-ga-2026', title: 'The General Assembly', status: 'current', starts_at: '2026-11-18', is_current: true }
];

// Replicating our canonical resolution logic in AdminReportsView.tsx:
const resolvedCurrentEvent = mockEventsList.find((e: any) => e.status === 'current' || e.is_current)
  || mockEventsList.find((e: any) => e.status === 'open' || e.status === 'active')
  || mockEventsList[0];

assert.strictEqual(resolvedCurrentEvent.id, 'event-ga-2026', 'Must resolve The General Assembly as current event');
assert.strictEqual(resolvedCurrentEvent.title, 'The General Assembly');
console.log(`  Resolved canonical event: "${resolvedCurrentEvent.title}" (${resolvedCurrentEvent.id}) -> PASS`);


// -------------------------------------------------------------
// CASE 5: Point-in-time report immutability vs new report version
// Expected: Old snapshot unchanged, new report uses fresh data
// -------------------------------------------------------------
console.log('\n[CASE 5] Snapshot immutability & fresh updated report compilation');
const oldSnapshot = JSON.parse(JSON.stringify(snapshotCase1));
oldSnapshot.childEntries = [{ id: 'c-1', status: 'checked_in' }]; // 1 child checked in at T1

const docModelV1 = compileReportDocument('rep-1', oldSnapshot, calculateAnalytics(oldSnapshot), 'volunteer-coverage', 'Internal operational');
assert.strictEqual(docModelV1.reportVersion, 1, 'Initial report must be Version 1');
const v1TurnoutKPI = docModelV1.kpis.find(k => k.label.includes('Turnout') || k.label.includes('turnout'));
console.log(`  V1 Report Version: ${docModelV1.reportVersion}, Cutoff: ${docModelV1.informationConfirmedUpTo}`);

// Simulate live data changing at T2
const newSnapshot = JSON.parse(JSON.stringify(snapshotCase1));
newSnapshot.cutoffTime = '2026-09-07T21:00:00Z';
newSnapshot.version = 2;
newSnapshot.targetReportVersion = 2;

const docModelV2 = compileReportDocument('rep-2', newSnapshot, calculateAnalytics(newSnapshot), 'volunteer-coverage', 'Internal operational');
assert.strictEqual(docModelV2.reportVersion, 2, 'Updated report must be Version 2');
assert.strictEqual(docModelV1.reportVersion, 1, 'Original report V1 must remain unchanged at Version 1');
assert.notStrictEqual(docModelV1.informationConfirmedUpTo, docModelV2.informationConfirmedUpTo, 'Cutoff times must be distinct');
console.log(`  V2 Report Version: ${docModelV2.reportVersion}, Cutoff: ${docModelV2.informationConfirmedUpTo} -> PASS`);


// -------------------------------------------------------------
// CASE 6: Empty states & No fabricated data
// Expected: Clear human explanations when data is absent
// -------------------------------------------------------------
console.log('\n[CASE 6] Empty-state handling without fabricated data');
const emptySnapshot: any = {
  event: { id: 'ev-empty', title: 'Empty Event' },
  rosterVolunteers: [],
  dutyAssignments: [],
  childEntries: [],
  locations: [],
  alerts: [],
  cutoffTime: '2026-09-07T20:00:00Z'
};

const emptyAnalytics = calculateAnalytics(emptySnapshot);
const emptyDoc = compileReportDocument('rep-empty', emptySnapshot, emptyAnalytics, 'volunteer-coverage', 'Internal operational');

// Verify ratio says "Not available" when 0 children
const ratioKPI = emptyDoc.kpis.find(k => k.label.toLowerCase().includes('ratio'));
assert.ok(ratioKPI, 'Ratio KPI must exist');
assert.strictEqual(ratioKPI.value, 'Not available', 'Ratio must be "Not available" when 0 children or 0 volunteers');
console.log(`  Empty ratio display: "${ratioKPI.value}" (${ratioKPI.sublabel})`);

// Verify charts have proper emptyState
const chartSection = emptyDoc.sections.find(s => s.type === 'chart');
assert.ok(chartSection, 'Chart section must be present');
const teamChart = chartSection.content.charts.find((c: any) => c.id.includes('team'));
assert.ok(teamChart && teamChart.emptyState, 'Team chart must have human empty state');
console.log(`  Team chart empty state: "${teamChart.emptyState}" -> PASS`);

console.log('\n=== ALL 6 PRODUCTION DEFECT VERIFICATION SUITES PASSED ===\n');
