import assert from 'assert';
import { compileReportDocument } from '../src/server/reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../src/server/reports/reportRenderer';
import { calculateAnalytics } from '../src/server/services/reportAnalyticsService';

console.log('================================================================');
console.log('REPORT MODULE — EDITORIAL REDESIGN VERIFICATION SUITE');
console.log('================================================================\n');

// Mock authoritative event snapshot with real Koinonia event data
const mockSnapshot = {
  event: {
    id: 'event-ga-2026',
    title: 'The General Assembly',
    starts_at: '2026-11-21T09:00:00Z',
    ends_at: '2026-11-22T17:00:00Z',
    venue: 'Grace Hall & International Conference Centre',
    theme: 'More Than Conquerors',
    scripture: 'Romans 8:37',
    registration_status: 'open'
  },
  cutoffTime: '2026-09-18T18:00:00Z',
  timezone: 'Africa/Lagos',
  childEntries: [
    { id: 'c1', status: 'checked_in', age_group: 'Ages 4 to 6' },
    { id: 'c2', status: 'checked_in', age_group: 'Ages 7 to 9' },
    { id: 'c3', status: 'inside', age_group: 'Under 4' },
    { id: 'c4', status: 'picked_up', age_group: 'Ages 10 to 12' },
    { id: 'c5', status: 'selected', age_group: 'Teens' },
    { id: 'c6', status: 'under_review', age_group: 'Ages 4 to 6' },
    { id: 'c7', status: 'waitlist', age_group: 'Ages 7 to 9' },
    { id: 'c8', status: 'not_selected', age_group: 'Under 4' }
  ],
  attendanceRecords: [
    { id: 'att1', child_event_entry_id: 'c1', action_type: 'check_in', created_at: '2026-11-21T09:15:00Z' },
    { id: 'att2', child_event_entry_id: 'c2', action_type: 'check_in', created_at: '2026-11-21T09:30:00Z' },
    { id: 'att3', child_event_entry_id: 'c3', action_type: 'check_in', created_at: '2026-11-21T10:00:00Z' },
    { id: 'att4', child_event_entry_id: 'c4', action_type: 'check_in', created_at: '2026-11-21T10:15:00Z' },
    { id: 'att5', child_event_entry_id: 'c4', action_type: 'pickup', created_at: '2026-11-21T12:00:00Z' }
  ],
  locations: [
    { id: 'loc-1', name: 'Grace Hall Primary', location_label: 'Grace Hall Primary', capacity: 150 },
    { id: 'loc-2', name: 'Toddler Care Wing', location_label: 'Toddler Care Wing', capacity: 50 }
  ],
  dutyAssignments: [
    { id: 'da-1', event_id: 'event-ga-2026', user_id: 'u-1', volunteer_profile_id: 'vp-1', volunteer_name: 'Blessing Okafor', team_key: 'childcare', preferred_team: 'Childcare', status: 'active', location_id: 'loc-1' },
    { id: 'da-2', event_id: 'event-ga-2026', user_id: 'u-2', volunteer_profile_id: 'vp-2', volunteer_name: 'Emmanuel Adeyemi', team_key: 'ushering', preferred_team: 'Ushering', status: 'active', location_id: 'loc-2' }
  ],
  rosterVolunteers: [
    { volunteer_profile_id: 'vp-1', user_id: 'u-1', full_name: 'Blessing Okafor', status: 'approved' },
    { volunteer_profile_id: 'vp-2', user_id: 'u-2', full_name: 'Emmanuel Adeyemi', status: 'approved' },
    { volunteer_profile_id: 'vp-3', user_id: 'u-3', full_name: 'Chidinma Eze', status: 'approved' }
  ],
  alerts: [
    { id: 'sa-1', category: 'medical', severity: 'normal', status: 'resolved', title: 'Asthma inhaler handed to nurse', created_at: '2026-11-21T10:00:00Z', escalation_tier: 1, response_status: 'Resolved on site' }
  ],
  safetyAlerts: [
    { id: 'sa-1', category: 'medical', severity: 'normal', status: 'resolved', title: 'Asthma inhaler handed to nurse', created_at: '2026-11-21T10:00:00Z' }
  ],
  incidentRecords: []
};

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(description: string, fn: () => Promise<void> | void) {
    try {
      fn();
      console.log(`✓ [PASS] ${description}`);
      passed++;
    } catch (err: any) {
      console.error(`✗ [FAIL] ${description}:`, err.message);
      failed++;
    }
  }

  const analytics = calculateAnalytics(mockSnapshot);

  // Test 1: Event Executive Report Compilation & Metadata
  await test('Template 1: Event Executive (management-summary) produces publication cover metadata', () => {
    const doc = compileReportDocument(
      'rep-exec-1',
      mockSnapshot,
      analytics,
      'management-summary',
      'Internal operational',
      []
    );

    assert.strictEqual(doc.coverStyle, 'charcoal', 'Flagship report should have charcoal cover style');
    assert.strictEqual(doc.eventContext.eventTitle, 'The General Assembly');
    assert.strictEqual(doc.eventContext.theme, 'More Than Conquerors');
    assert.strictEqual(doc.eventContext.scripture, 'Romans 8:37');
    assert.strictEqual(doc.eventContext.venue, 'Grace Hall & International Conference Centre');
    assert.ok(doc.sections.some(s => s.title.includes('01 Registration & selection')), 'Should contain numbered section 01');
    assert.ok(doc.sections.some(s => s.title.includes('02 Attendance & movement')), 'Should contain numbered section 02');
    assert.ok(doc.kpis.length >= 4, 'Should contain executive KPIs');
  });

  // Test 2: Registration & Selection Report
  await test('Template 2: Registration & Selection (registration-selection) produces publication layout', () => {
    const doc = compileReportDocument(
      'rep-reg-1',
      mockSnapshot,
      analytics,
      'registration-selection',
      'Internal operational',
      []
    );

    assert.strictEqual(doc.coverStyle, 'ivory', 'Domain report should have warm ivory cover');
    assert.ok(doc.sections.some(s => s.title.includes('01 Application review & selection')));
    assert.ok(doc.sections.some(s => s.title.includes('02 Registration & cohort demand')));
  });

  // Test 3: Attendance & Demographics Report
  await test('Template 3: Attendance & Demographics (attendance-movement) produces publication layout', () => {
    const doc = compileReportDocument(
      'rep-att-1',
      mockSnapshot,
      analytics,
      'attendance-movement',
      'Internal operational',
      []
    );

    assert.strictEqual(doc.coverStyle, 'ivory');
    assert.ok(doc.sections.some(s => s.title.includes('01 Age groups and attendance')));
    assert.ok(doc.sections.some(s => s.title.includes('02 Attendance status composition')));
  });

  // Test 4: Volunteer Team Report
  await test('Template 4: Volunteer Team (volunteer-coverage) produces publication layout', () => {
    const doc = compileReportDocument(
      'rep-vol-1',
      mockSnapshot,
      analytics,
      'volunteer-coverage',
      'Internal operational',
      []
    );

    assert.strictEqual(doc.coverStyle, 'ivory');
    assert.ok(doc.sections.some(s => s.title.includes('01 Volunteer team deployment')));
    assert.ok(doc.sections.some(s => s.title.includes('02 Room staffing and supervision')));
  });

  // Test 5: Child Safety Report
  await test('Template 5: Child Safety (care-safety-summary) produces restrained safeguarding layout', () => {
    const doc = compileReportDocument(
      'rep-safe-1',
      mockSnapshot,
      analytics,
      'care-safety-summary',
      'Safeguarding restricted',
      []
    );

    assert.strictEqual(doc.coverStyle, 'ivory');
    assert.ok(doc.sections.some(s => s.title.includes('01 Safety and care response log')));
    assert.ok(doc.sections.some(s => s.title.includes('02 Care and safety status distribution')));
  });

  // Test 6: Custom Event Report
  await test('Template 6: Custom Event Report (full-event-report) produces comprehensive layout', () => {
    const doc = compileReportDocument(
      'rep-full-1',
      mockSnapshot,
      analytics,
      'full-event-report',
      'Internal operational',
      []
    );

    assert.strictEqual(doc.coverStyle, 'charcoal');
    assert.strictEqual(doc.eventContext.eventTitle, 'The General Assembly');
  });

  // Test 7: PDF Rendering with Cover, Opening Page, Sections, and Back Cover
  await test('PDF Export: Generates multi-page PDF with Cover, Opening spread, and Back cover', async () => {
    const doc = compileReportDocument(
      'rep-pdf-test',
      mockSnapshot,
      analytics,
      'management-summary',
      'Internal operational',
      []
    );

    const result = await renderDocumentToPDF(doc);
    assert.ok(result.pageCount >= 3, `Expected at least 3 pages (Cover, Content, Back Cover), got ${result.pageCount}`);
    assert.ok(result.pdfBytes.byteLength > 2000, `PDF bytes should be substantial, got ${result.pdfBytes.byteLength}`);

    // Check %PDF header magic bytes
    const headerBytes = Buffer.from(result.pdfBytes.slice(0, 5)).toString();
    assert.strictEqual(headerBytes, '%PDF-', 'PDF must start with %PDF- header');
  });

  // Test 8: Technical terms & AI filler audit
  test('Language Audit: No technical jargon or AI corporate filler', () => {
    const templates = [
      'management-summary',
      'registration-selection',
      'attendance-movement',
      'volunteer-coverage',
      'care-safety-summary',
      'full-event-report'
    ];

    const forbiddenTerms = [
      'ai-generated',
      'smart reporting',
      'data intelligence',
      'automated insights',
      'operational intelligence',
      'deep dive',
      'unlock insights',
      'synthesis'
    ];

    templates.forEach(tKey => {
      const doc = compileReportDocument('test-id', mockSnapshot, analytics, tKey, 'Internal operational', []);
      const allText = JSON.stringify(doc).toLowerCase();
      forbiddenTerms.forEach(term => {
        assert.ok(!allText.includes(term), `Document "${tKey}" must not contain forbidden term "${term}"`);
      });
    });
  });

  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
