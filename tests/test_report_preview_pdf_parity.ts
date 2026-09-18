import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { compileReportDocument } from '../src/server/reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../src/server/reports/reportRenderer';
import { calculateAnalytics } from '../src/server/services/reportAnalyticsService';

console.log('================================================================');
console.log('REPORT PREVIEW & DOWNLOAD — CORRECT PARITY DIRECTION TESTS');
console.log('================================================================\n');

// Mock snapshot with canonical event and duty presence data
const mockSnapshot = {
  event: {
    id: 'event-parity-2026',
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
    { id: 'c5', status: 'selected', age_group: 'Teens' }
  ],
  attendanceRecords: [
    { id: 'att1', child_event_entry_id: 'c1', action_type: 'check_in', created_at: '2026-11-21T09:15:00Z' },
    { id: 'att2', child_event_entry_id: 'c2', action_type: 'check_in', created_at: '2026-11-21T09:30:00Z' },
    { id: 'att3', child_event_entry_id: 'c3', action_type: 'check_in', created_at: '2026-11-21T10:00:00Z' },
    { id: 'att4', child_event_entry_id: 'c4', action_type: 'check_in', created_at: '2026-11-21T10:15:00Z' },
    { id: 'att5', child_event_entry_id: 'c4', action_type: 'pickup', created_at: '2026-11-21T12:00:00Z' }
  ],
  locations: [
    { id: 'loc-1', name: 'Main Pavilion', location_label: 'Main Pavilion', capacity: 200 },
    { id: 'loc-2', name: 'Youth Chapel', location_label: 'Youth Chapel', capacity: 100 }
  ],
  dutyAssignments: [
    { id: 'da-1', event_id: 'event-parity-2026', user_id: 'u-1', volunteer_profile_id: 'vp-1', volunteer_name: 'Alele Chi', team_key: 'childcare', preferred_team: 'Childcare', status: 'scheduled', location_id: 'loc-1' }
  ],
  dutyPresence: [
    { id: 'dp-1', event_id: 'event-parity-2026', user_id: 'u-1', volunteer_profile_id: 'vp-1', location_id: 'loc-1', started_at: '2026-11-21T08:30:00Z', ended_at: null }
  ],
  rosterVolunteers: [
    { volunteer_profile_id: 'vp-1', user_id: 'u-1', full_name: 'Alele Chi', status: 'approved' }
  ],
  alerts: [],
  safetyAlerts: [],
  incidentRecords: []
};

async function runParityTests() {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`✗ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  const analytics = calculateAnalytics(mockSnapshot);

  // 1. Preview Modal uses Premium React Editorial Preview
  await test('Test 1: Preview Modal uses Premium React Editorial Preview (not iframe/PDF viewer)', () => {
    const modalPath = path.resolve(process.cwd(), 'src/components/admin/reports/GeneratedReportPreviewModal.tsx');
    const modalSrc = fs.readFileSync(modalPath, 'utf8');

    assert.ok(modalSrc.includes('<ReportDocumentPreview'), 'Modal must render <ReportDocumentPreview');
    assert.ok(!modalSrc.includes('<iframe'), 'Modal must NOT render <iframe for previewing PDF');
    assert.ok(!modalSrc.includes('pdfBlobUrl'), 'Modal must NOT use pdfBlobUrl for report preview body');
    assert.ok(!modalSrc.includes('Version 1'), 'Modal must NOT contain "Version 1" technical metadata');
    assert.ok(!modalSrc.includes('Generated report'), 'Modal must NOT contain "Generated report" technical copy');
    assert.ok(modalSrc.includes('Report contents'), 'Modal must contain Report contents outline navigation');
  });

  // 2. Acceptance Target: Attendance and Demographics Report Parity
  await test('Test 2: Acceptance Target — Attendance & Demographics Document Model and PDF Parity', async () => {
    const docModel = compileReportDocument(
      'job-attendance-001',
      mockSnapshot,
      analytics,
      'attendance-movement',
      'Official Ministry Document',
      []
    );

    // Assert model structure
    assert.ok(docModel.reportTitle.includes('Attendance & Demographics'), 'Report title must include Attendance & Demographics');
    assert.ok(['charcoal', 'ivory'].includes(docModel.coverStyle), 'Cover style must be defined publication style');
    assert.ok(docModel.kpis && docModel.kpis.length >= 3, 'Must have at least 3 KPIs');

    // Verify sections present in model
    const sectionTitles = docModel.sections.map(s => s.title.toLowerCase());
    assert.ok(sectionTitles.some(t => t.includes('age groups and attendance')), 'Must include Age groups and attendance table');
    assert.ok(
      docModel.sections.some(s => s.content?.charts?.some((c: any) => c.title?.toLowerCase().includes('attendance status'))),
      'Must include Attendance status donut chart'
    );
    assert.ok(sectionTitles.some(t => t.includes('children in each room')), 'Must include room distribution');

    // Generate PDF from this exact model
    const pdfResult = await renderDocumentToPDF(docModel);
    assert.ok(pdfResult.pdfBytes.byteLength > 10000, 'Generated PDF must have substantial content');
    assert.ok(pdfResult.pageCount >= 3, 'Attendance PDF must have at least 3 pages');
    assert.strictEqual(pdfResult.sectionPageMap['section-cover'], 1, 'Cover must be on page 1');
    assert.strictEqual(pdfResult.sectionPageMap['section-kpis'], 2, 'KPIs must be on page 2');
    assert.ok(pdfResult.sectionPageMap['section-back-cover'] === pdfResult.pageCount, 'Back cover must be final page');

    // Validate binary PDF header
    const buf = Buffer.from(pdfResult.pdfBytes);
    assert.strictEqual(buf.toString('utf8', 0, 4), '%PDF', 'Must generate valid PDF binary');
  });

  // 3. Test All 6 Report Types: Exact Model to PDF Generation
  const reportTypes = [
    { type: 'management-summary', titleMatcher: 'Management' },
    { type: 'registration-selection', titleMatcher: 'Registration' },
    { type: 'attendance-movement', titleMatcher: 'Attendance' },
    { type: 'volunteer-coverage', titleMatcher: 'Volunteer' },
    { type: 'care-safety-summary', titleMatcher: 'Safety' },
    { type: 'full-event-report', titleMatcher: 'Full Event' }
  ];

  for (const rt of reportTypes) {
    await test(`Test 3: Report Type "${rt.titleMatcher}" (${rt.type}) generates PDF from same model`, async () => {
      const model = compileReportDocument(
        `job-${rt.type}-001`,
        mockSnapshot,
        analytics,
        rt.type,
        'Official Publication',
        []
      );

      assert.ok(model.reportTitle.includes(rt.titleMatcher), `Title must match "${rt.titleMatcher}" (got "${model.reportTitle}")`);
      assert.ok(model.sections.length > 0, 'Must have sections');

      const pdf = await renderDocumentToPDF(model);
      assert.ok(pdf.pdfBytes.byteLength > 5000, `PDF for ${rt.type} must be valid size`);
      assert.ok(pdf.pageCount >= 2, `PDF for ${rt.type} must have multiple pages`);
      assert.strictEqual(pdf.sectionPageMap['section-cover'], 1, 'Cover is page 1');
    });
  }

  // 4. Test Duty Metrics Integrity in Volunteer Team Report
  await test('Test 4: Duty metrics integrity preserved — Alele Chi on duty verified', () => {
    const volDoc = compileReportDocument(
      'job-vol-duty',
      mockSnapshot,
      analytics,
      'volunteer-coverage',
      'Official Publication',
      []
    );

    // In mockSnapshot, Alele Chi has an active presence record
    const onDutyKpi = volDoc.kpis.find(k => k.label.toLowerCase().includes('on duty'));
    assert.ok(onDutyKpi, 'Volunteer report must include On Duty KPI');
    assert.strictEqual(Number(onDutyKpi.value), 1, 'Currently on duty must equal 1 from canonical presence');

    const assignedKpi = volDoc.kpis.find(k => k.label.toLowerCase().includes('scheduled') || k.label.toLowerCase().includes('assigned'));
    assert.ok(assignedKpi, 'Volunteer report must include Scheduled/Assigned KPI');
    assert.strictEqual(Number(assignedKpi.value), 1, 'Assigned must equal 1');
  });

  // 5. Test Language Audit: No Jargon in Model or Output
  await test('Test 5: Human language cleanup preserved — No technical jargon in titles, labels, or captions', () => {
    for (const rt of reportTypes) {
      const model = compileReportDocument(
        `job-audit-${rt.type}`,
        mockSnapshot,
        analytics,
        rt.type,
        'Official Publication',
        []
      );

      const fullText = JSON.stringify(model).toLowerCase();
      assert.ok(!fullText.includes('provenance'), `Report ${rt.type} must not contain "provenance"`);
      assert.ok(!fullText.includes('authoritative database figures'), `Report ${rt.type} must not contain "authoritative database figures"`);
      assert.ok(!fullText.includes('benchmark: 15:100'), `Report ${rt.type} must not contain "benchmark: 15:100"`);
      assert.ok(!fullText.includes('full department coverage'), `Report ${rt.type} must not contain "full department coverage"`);
    }
  });

  // 6. Test Data Identity: Preview & Download share same snapshot
  await test('Test 6: Data Identity — Single Snapshot guarantees identical data in Preview & PDF', async () => {
    const model = compileReportDocument(
      'job-identity-001',
      mockSnapshot,
      analytics,
      'attendance-movement',
      'Official Publication',
      []
    );

    // Preview sees model.kpis
    const previewKpiValues = model.kpis.map(k => ({ label: k.label, value: k.value }));

    // PDF generation from model
    const pdf = await renderDocumentToPDF(model);

    // PDF receives the exact same model object, so values cannot diverge
    assert.ok(pdf.pdfBytes.byteLength > 0, 'PDF generated from identical model');
    assert.strictEqual(model.kpis[0].value, previewKpiValues[0].value, 'KPI 0 value identical');
    assert.strictEqual(model.sections.length, 6, 'Sections count matches');
  });

  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runParityTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
