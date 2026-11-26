import assert from 'assert';
import { calculateAnalytics, formatWATTime, getWATHourLabel, normalizeDbTimestampToUtcIso } from '../src/server/services/reportAnalyticsService';
import { compileReportDocument } from '../src/server/reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../src/server/reports/reportRenderer';
import { validateReportDocumentModel } from '../src/server/reports/reportDocumentModel';

const BANNED_AI_PHRASES = [
  'paints a compelling picture',
  'remarkable testament',
  'leveraging insights',
  'transformative journey',
  'robust ecosystem',
  'unprecedented success',
  'seamless experience',
  'data-driven narrative'
];

function buildSyntheticSnapshot(authorizedForAppendix: boolean) {
  const eventId = 'event-synthetic-ga-2026';
  // Deliberately include:
  // - Cohort 2-3 (born 2023-06-01 -> age 3 on 2026-11-21), picked up
  // - Cohort 4-6 (born 2022-11-01 -> age 4 on 2026-11-21 even if stored age_group says 'Ages 1 to 3'!), checked in & still inside
  // - Cohort 7-9 (born 2018-05-10 -> age 8), selected not arrived (pass_ready) with NO checked_in_at despite stale attendance row
  // - Cohort 10-12 (born 2015-03-04 -> age 11), picked up without recorded gate_location
  // - Cohort 13-14 (born 2012-08-20 -> age 14), checked in with lowercase 'male'
  // - Unspecified gender under_review (non-selected)
  const rawEntries = [
    {
      id: 'entry-1',
      child_id: 'c-1',
      child_name: 'Amaka Okafor',
      date_of_birth: '2023-06-01',
      age_group: '2–3',
      gender: 'Female',
      status: 'picked_up',
      checked_in_at: normalizeDbTimestampToUtcIso('2026-11-21 07:15:00.000'), // 08:15 WAT
      picked_up_at: normalizeDbTimestampToUtcIso('2026-11-21 12:30:00.000'),  // 13:30 WAT
      check_in_location: 'Infant Care Suite',
      has_medical_notes: 1,
      needs_extra_support: 0
    },
    {
      id: 'entry-2',
      child_id: 'c-2',
      child_name: 'Tobi Adeyemi',
      date_of_birth: '2022-11-01', // Turned 4 before 2026-11-21!
      age_group: 'Ages 1 to 3',   // Deliberate stale stored label
      gender: 'Male',
      status: 'checked_in',
      checked_in_at: normalizeDbTimestampToUtcIso('2026-11-21 08:05:00.000'), // 09:05 WAT
      picked_up_at: null,
      check_in_location: 'Grace Hall Primary',
      has_medical_notes: 0,
      needs_extra_support: 1
    },
    {
      id: 'entry-3',
      child_id: 'c-3',
      child_name: 'Chidi Eze',
      date_of_birth: '2018-05-10',
      age_group: '7–9',
      gender: 'Male',
      status: 'pass_ready',
      checked_in_at: null,
      picked_up_at: null,
      check_in_location: null,
      has_medical_notes: 0,
      needs_extra_support: 0
    },
    {
      id: 'entry-4',
      child_id: 'c-4',
      child_name: 'Zainab Bello',
      date_of_birth: '2015-03-04',
      age_group: '10–12',
      gender: 'Female',
      status: 'picked_up',
      checked_in_at: normalizeDbTimestampToUtcIso('2026-11-21 07:45:00.000'), // 08:45 WAT
      picked_up_at: normalizeDbTimestampToUtcIso('2026-11-21 13:10:00.000'),  // 14:10 WAT
      check_in_location: null, // Unrecorded location must NOT fall into Grace Hall
      has_medical_notes: 0,
      needs_extra_support: 0
    },
    {
      id: 'entry-5',
      child_id: 'c-5',
      child_name: 'Daniel Musa',
      date_of_birth: '2012-08-20',
      age_group: 'Teens',
      gender: 'male', // Lowercase gender check
      status: 'checked_in',
      checked_in_at: normalizeDbTimestampToUtcIso('2026-11-21 07:50:00.000'), // 08:50 WAT
      picked_up_at: null,
      check_in_location: 'Main Auditorium Pavilion',
      has_medical_notes: 0,
      needs_extra_support: 0
    },
    {
      id: 'entry-6',
      child_id: 'c-6',
      child_name: 'Sample Pending Child',
      date_of_birth: '2019-09-12',
      age_group: '7–9',
      gender: '', // Unspecified
      status: 'under_review',
      checked_in_at: null,
      picked_up_at: null,
      check_in_location: null,
      has_medical_notes: 0,
      needs_extra_support: 0
    }
  ];

  // Add 1 duplicate check_in row for entry-2 in attendanceRecords (must NOT double count)
  const attendanceRecords = [
    { id: 'ar-1', child_event_entry_id: 'entry-1', action_type: 'check_in', gate_location: 'Infant Care Suite', action_time: '2026-11-21T07:15:00.000Z' },
    { id: 'ar-2a', child_event_entry_id: 'entry-2', action_type: 'check_in', gate_location: 'Grace Hall Primary', action_time: '2026-11-21T08:05:00.000Z' },
    { id: 'ar-2b', child_event_entry_id: 'entry-2', action_type: 'check_in', gate_location: 'Grace Hall Primary', action_time: '2026-11-21T08:05:05.000Z' },
    { id: 'ar-5', child_event_entry_id: 'entry-5', action_type: 'check_in', gate_location: 'Main Auditorium Pavilion', action_time: '2026-11-21T07:50:00.000Z' }
  ];

  const childEntries = authorizedForAppendix
    ? rawEntries
    : rawEntries.map((c) => ({
        ...c,
        child_name: `Child Ref-${c.id.slice(0, 6).toUpperCase()}`,
        date_of_birth: 'REDACTED'
      }));

  return {
    event: {
      id: eventId,
      title: 'Synthetic General Assembly Test 2026',
      starts_at: '2026-11-21',
      ends_at: '2026-11-22',
      daily_start_time: '08:00',
      daily_end_time: '13:00',
      location: 'Hillside Test Centre, Abuja',
      theme: 'More Than Conquerors'
    },
    locations: [
      { id: 'loc-grace', name: 'Grace Hall Primary', age_group_key: 'Ages 4 to 6', capacity: 40, is_active: 1 },
      { id: 'loc-nursery', name: 'Infant Care Suite', age_group_key: 'Ages 1 to 3', capacity: 20, is_active: 1 },
      { id: 'loc-main', name: 'Main Auditorium Pavilion', age_group_key: 'Ages 7 to 9', capacity: 100, is_active: 1 },
      { id: 'loc-teens', name: 'Teens Upper Chapel', age_group_key: 'Teens', capacity: 50, is_active: 1 }
    ],
    dutyAssignments: [
      { id: 'da-1', event_id: eventId, user_id: 'vol-1', assignment_status: 'on_duty', volunteer_status: 'approved', location_id: 'loc-grace', assigned_age_groups: '["4–6","7–9"]' },
      { id: 'da-2', event_id: eventId, user_id: 'vol-2', assignment_status: 'scheduled', volunteer_status: 'approved', location_id: 'loc-main', assigned_age_groups: '["13–14"]' }
    ],
    rosterVolunteers: [
      { user_id: 'vol-1', full_name: 'Vol One', status: 'approved' },
      { user_id: 'vol-2', full_name: 'Vol Two', status: 'approved' },
      { user_id: 'vol-3', full_name: 'Vol Unassigned', status: 'approved' }
    ],
    dutyPresence: [
      { id: 'pr-1', event_id: eventId, user_id: 'vol-1', event_location_id: 'loc-grace', started_at: '2026-11-21T06:45:00.000Z', ended_at: null }
    ],
    attendanceRecords,
    childEntries,
    safetyAlerts: [
      { id: 'al-1', severity: 'urgent', category: 'medical_support', title: 'Drill Alert', status: 'resolved', created_at: '2026-11-14T10:00:00.000Z', resolved_at: '2026-11-14T10:05:00.000Z' }
    ],
    incidentRecords: [],
    syncRecords: [],
    deviceReadiness: [],
    dutyDevices: [],
    pickupRecords: [],
    cutoffTime: '2026-11-21T16:30:00.000Z',
    timezone: 'Africa/Lagos',
    fullEventData: {
      authorizedForAppendix,
      actorRole: authorizedForAppendix ? 'admin' : 'team',
      entryLifecycleCounts: { totalActiveEntries: 8, incompleteDrafts: 2, otherDrafts: 0, registeredNonDraft: 6 },
      attendanceAnomalies: { staleAttendanceRecordsCount: 1, checkedInWithLocationCount: 3 },
      careSummary: {
        totalRegistered: 6,
        withCareConcerns: 2,
        allergyMentions: 1,
        otherMedicalNotes: 0,
        supportRequested: 1,
        bothMedicalAndSupport: 0,
        requiresClarification: 0,
        careNotesInsideOrCheckedIn: 1,
        careNotesPickedUp: 1,
        careNotesNotArrived: 0,
        noConcernReported: 4
      }
    }
  };
}

async function runTests() {
  console.log('=== VERIFYING CHILDREN & TEENS FULL EVENT REPORT ===');

  // 1. WAT timezone helper verification regardless of process OS timezone
  const iso = normalizeDbTimestampToUtcIso('2026-11-21 07:00:59.474');
  assert.strictEqual(iso, '2026-11-21T07:00:59.474Z', 'Postgres naive timestamp must normalize to UTC');
  assert.strictEqual(getWATHourLabel(iso), '08:00', '07:00 UTC must map to 08:00 WAT');
  assert.strictEqual(formatWATTime(iso), '08:00 WAT', '07:00:59 UTC must display 08:00 WAT');
  console.log('✓ [PASS] UTC-to-WAT timestamp normalization');

  // 2. Analytics engine WAT time-series & location reconciliation check
  const adminSnap = buildSyntheticSnapshot(true);
  const analytics = calculateAnalytics(adminSnap);
  assert.strictEqual(analytics.attendance.checkedInTotal, 4, 'Must deduplicate attendance check-ins');
  assert.strictEqual(analytics.attendance.releasedTotal, 2);
  assert.strictEqual(analytics.attendance.insideTotal, 2);
  assert.strictEqual(analytics.attendance.notArrivedTotal, 1);
  assert.strictEqual(analytics.attendance.peakCheckInHour, '08:00–09:00 WAT', 'Peak arrival must use WAT hour');
  assert.strictEqual(analytics.attendance.peakPickupHour, '13:00–14:00 WAT', 'Peak pickup must use WAT hour');
  const unrecordedLoc = analytics.locations.locationLoads.find((l) => l.locationLabel === 'Location not recorded');
  assert.ok(unrecordedLoc && unrecordedLoc.childrenCount === 1, 'Missing check-in location must report honestly as Location not recorded');
  const graceLoc = analytics.locations.locationLoads.find((l) => l.locationLabel === 'Grace Hall Primary');
  assert.strictEqual(graceLoc?.childrenCount, 1, 'Grace Hall must NOT receive unrecorded location children');
  console.log('✓ [PASS] Analytics engine WAT hours & honest location attribution');

  // 3. Full Event Report model compilation + validation + reconciliation (Admin role)
  const compiledAdmin = compileReportDocument(
    'test-rep-admin',
    adminSnap,
    analytics,
    'children-teens-full-event-report',
    'Internal operational',
    []
  );
  const validAdmin = validateReportDocumentModel(compiledAdmin);
  assert.strictEqual(validAdmin.valid, true, `Validation failed: ${validAdmin.errors.join(', ')}`);
  assert.strictEqual(compiledAdmin.templateKey, 'children-teens-full-event-report');

  // Verify zero banned AI phrases
  const adminJson = JSON.stringify(compiledAdmin).toLowerCase();
  for (const phrase of BANNED_AI_PHRASES) {
    assert.strictEqual(adminJson.includes(phrase), false, `Found banned phrase: ${phrase}`);
  }

  // Verify 5 canonical cohorts reconcile strictly & DOB overrode stale stored age_group for c-2 (Ages 4–6)
  const ageTable = compiledAdmin.sections.find((s) => s.id === 'sec-age-group-table');
  assert.ok(ageTable && ageTable.type === 'table');
  const age46Row = ageTable.content.rows.find((r: any[]) => r[0] === 'Ages 4–6');
  assert.strictEqual(age46Row?.[7], '1', 'c-2 born 2022-11-01 must count in Ages 4–6 rather than stale stored Ages 1 to 3');
  const ageTotalRow = ageTable.content.rows[ageTable.content.rows.length - 1];
  assert.deepStrictEqual([ageTotalRow[1], ageTotalRow[2], ageTotalRow[7], ageTotalRow[8], ageTotalRow[9]], ['6', '5', '4', '2', '1']);

  // Verify Gender table reconciles Male + Female + Unspecified = 6 reg, 5 sel, 4 CI
  const genderTable = compiledAdmin.sections.find((s) => s.id === 'sec-gender-table');
  assert.ok(genderTable && genderTable.type === 'table');
  const genderTotal = genderTable.content.rows[genderTable.content.rows.length - 1];
  assert.deepStrictEqual([genderTotal[1], genderTotal[2], genderTotal[4], genderTotal[6], genderTotal[7]], ['6', '5', '4', '2', '2']);
  const maleRow = genderTable.content.rows.find((r: any[]) => r[0] === 'Male');
  assert.strictEqual(maleRow?.[4], '2', 'Lowercase male must normalize into Male checked-in count (c-2 + c-5 = 2)');

  // Verify Appendix present for authorised admin & excludes medical text/phones
  assert.ok(compiledAdmin.appendix && compiledAdmin.appendix.length === 1, 'Authorised admin must receive appendix');
  assert.strictEqual(compiledAdmin.appendix![0].rows.length, 6, 'Appendix must have 6 deduplicated registered entries');
  assert.strictEqual(adminJson.includes('0803'), false);
  console.log('✓ [PASS] Children & Teens full report document model, cohorts, gender, & admin appendix');

  // 4. Low-privilege (team) role appendix gating check
  const teamSnap = buildSyntheticSnapshot(false);
  const compiledTeam = compileReportDocument(
    'test-rep-team',
    teamSnap,
    calculateAnalytics(teamSnap),
    'children-teens-full-event-report',
    'Internal operational',
    []
  );
  assert.strictEqual(compiledTeam.appendix, undefined, 'Low-privilege team role must NOT receive individual appendix');
  assert.ok(!JSON.stringify(compiledTeam).includes('Amaka Okafor'), 'Child names must not appear when unauthorized');
  console.log('✓ [PASS] Restricted appendix properly withheld for non-authorized role');

  // 5. Real PDF generation check
  const pdfAdmin = await renderDocumentToPDF(compiledAdmin);
  const headerStr = Buffer.from(pdfAdmin.pdfBytes).toString('utf8', 0, 5);
  assert.strictEqual(headerStr, '%PDF-', 'Rendered output must be valid PDF bytes');
  assert.ok(pdfAdmin.pageCount >= 6, `Expected multi-page report including appendix, got ${pdfAdmin.pageCount}`);
  assert.ok(pdfAdmin.sectionPageMap['appendix'], 'sectionPageMap must record appendix page');

  const pdfTeam = await renderDocumentToPDF(compiledTeam);
  assert.ok(pdfTeam.pageCount < pdfAdmin.pageCount || !pdfTeam.sectionPageMap['appendix'], 'Team PDF must omit appendix page');
  console.log(`✓ [PASS] PDF generation validated (Admin pages: ${pdfAdmin.pageCount}, Team pages: ${pdfTeam.pageCount})`);

  // 6. Existing report templates still compile without regression
  for (const key of ['management-summary', 'full-event-report', 'attendance-movement', 'volunteer-coverage', 'care-safety-summary']) {
    const existingDoc = compileReportDocument(`compat-${key}`, adminSnap, analytics, key, 'Internal operational', []);
    const val = validateReportDocumentModel(existingDoc);
    assert.strictEqual(val.valid, true, `Existing template ${key} failed validation`);
  }
  console.log('✓ [PASS] Existing report templates preserved without regression');
  console.log('\nALL FULL EVENT REPORT TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
