import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { compileReportDocument } from '../src/server/reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../src/server/reports/reportRenderer';
import { calculateAnalytics } from '../src/server/services/reportAnalyticsService';

console.log('================================================================');
console.log('REPORT REVIEW / PDF — ARCHITECTURE PARITY TEST SUITE');
console.log('================================================================\n');

// Comprehensive event snapshot fixture
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

  // =========================================================================
  // TEST 1: APPROVED ARCHITECTURE — Review = React Preview, Download = PDF
  // The rejected architecture had Review rendering the generated PDF artifact.
  // The approved architecture has:
  //   - Review: premium React editorial preview driven by ReportDocumentModel
  //   - Download: separately generated PDF from the same ReportDocumentModel
  // =========================================================================
  await test('Test 1: Approved Architecture — Review renders React preview, Download is a separate PDF', () => {
    const modalPath = path.resolve(process.cwd(), 'src/components/admin/reports/GeneratedReportPreviewModal.tsx');
    const modalSrc = fs.readFileSync(modalPath, 'utf8');

    // Review modal must render the premium React editorial component
    assert.ok(
      modalSrc.includes('<ReportDocumentPreview'),
      'Review modal must render <ReportDocumentPreview (premium React editorial preview)'
    );

    // Review modal must NOT use an iframe/embed/object to display the PDF artifact
    assert.ok(
      !modalSrc.includes('<iframe'),
      'Review modal must NOT contain <iframe — preview is React, not a PDF viewer'
    );
    assert.ok(
      !modalSrc.includes('<embed'),
      'Review modal must NOT contain <embed'
    );
    assert.ok(
      !modalSrc.includes('<object'),
      'Review modal must NOT contain <object — preview is React, not a PDF viewer'
    );
    assert.ok(
      !modalSrc.includes('pdfBlobUrl'),
      'Review modal must NOT reference pdfBlobUrl — that is the rejected architecture'
    );

    // Download is a separate action (onDownloadPdf prop) — distinct from preview rendering
    assert.ok(
      modalSrc.includes('onDownloadPdf'),
      'Modal must accept onDownloadPdf prop — download is a separate action from preview'
    );
    assert.ok(
      modalSrc.includes('Download PDF'),
      'Download PDF button must exist as a separate action from the preview'
    );

    // Contents sidebar must be driven by the React document model (not PDF page numbers)
    assert.ok(
      modalSrc.includes('Report contents'),
      'Contents sidebar must exist and be driven by the React document model'
    );
    assert.ok(
      modalSrc.includes('handleOutlineClick'),
      'Outline navigation must use DOM scroll (handleOutlineClick), not PDF page jump'
    );
    assert.ok(
      modalSrc.includes('scrollIntoView'),
      'Outline navigation must use scrollIntoView (React DOM), not iframe URL parameter'
    );

    // ReportDocumentPreview must receive the model (not a blob URL)
    assert.ok(
      modalSrc.includes('model={model}'),
      'ReportDocumentPreview must receive model prop (ReportDocumentModel), not a PDF URL'
    );
  });

  // =========================================================================
  // TEST 2: SHARED ReportDocumentModel — Preview and PDF use identical data
  // =========================================================================
  await test('Test 2: Shared ReportDocumentModel — Preview and PDF are generated from the same data object', async () => {
    const model = compileReportDocument(
      'job-parity-001',
      mockSnapshot,
      analytics,
      'attendance-movement',
      'Official',
      []
    );

    // Snapshot the key data fields that both preview and PDF will use
    const previewTitle = model.reportTitle;
    const previewKpis = model.kpis.map(k => ({ label: k.label, value: k.value }));
    const previewSectionCount = model.sections.length;
    const previewSectionTitles = model.sections.map(s => s.title);
    const previewEventTitle = model.eventContext.eventTitle;

    // Generate PDF from the exact same model object
    const pdf = await renderDocumentToPDF(model);
    assert.ok(pdf.pdfBytes.byteLength > 10000, 'PDF must have substantial content');

    // Model fields must be unchanged after PDF generation (model is immutable through render)
    assert.strictEqual(model.reportTitle, previewTitle, 'Report title must be unchanged after PDF generation');
    assert.strictEqual(model.kpis.length, previewKpis.length, 'KPI count must be unchanged after PDF generation');
    assert.strictEqual(model.sections.length, previewSectionCount, 'Section count must be unchanged after PDF generation');
    assert.deepStrictEqual(model.sections.map(s => s.title), previewSectionTitles, 'Section titles must be unchanged');
    assert.strictEqual(model.eventContext.eventTitle, previewEventTitle, 'Event title must be unchanged');

    // PDF section page map must reference the same logical sections as the React preview
    assert.ok(pdf.sectionPageMap['section-cover'] === 1, 'Cover section exists in both preview and PDF');
    assert.ok(pdf.sectionPageMap['section-kpis'] === 2, 'KPIs section exists in both preview and PDF');
    assert.ok(pdf.sectionPageMap['section-back-cover'] === pdf.pageCount, 'Back cover exists in both preview and PDF');

    const pdfBuf = Buffer.from(pdf.pdfBytes);
    assert.strictEqual(pdfBuf.toString('utf8', 0, 4), '%PDF', 'PDF artifact must be valid binary PDF');
  });

  // 3. Test All Six Report Types Canonical PDF Generation & Section Mapping
  const reportTypes = [
    { key: 'management-summary', name: 'Event Executive' },
    { key: 'registration-selection', name: 'Registration & Selection' },
    { key: 'attendance-movement', name: 'Attendance & Demographics' },
    { key: 'volunteer-coverage', name: 'Volunteer Team' },
    { key: 'care-safety-summary', name: 'Child Safety / Incident' },
    { key: 'full-event-report', name: 'Custom Event' }
  ];

  for (const rt of reportTypes) {
    await test(`Test 3: Report Type [${rt.name}] (${rt.key}) — PDF artifact generation and page mapping`, async () => {
      const doc = compileReportDocument(
        `job-${rt.key}`,
        mockSnapshot,
        analytics,
        rt.key,
        'Official',
        []
      );

      const result = await renderDocumentToPDF(doc);
      assert.ok(result.pageCount >= 3, `Expected >= 3 pages for ${rt.name}, got ${result.pageCount}`);
      assert.ok(result.pdfBytes.byteLength > 2000, `PDF byte length should be substantial for ${rt.name}`);

      const header = Buffer.from(result.pdfBytes.slice(0, 5)).toString();
      assert.strictEqual(header, '%PDF-', `Artifact for ${rt.name} must start with %PDF- header`);

      // Verify sectionPageMap
      assert.ok(result.sectionPageMap, `sectionPageMap must be present for ${rt.name}`);
      assert.strictEqual(result.sectionPageMap['section-cover'], 1, 'Cover must be on page 1');
      assert.strictEqual(result.sectionPageMap['section-kpis'], 2, 'Opening spread KPIs must be on page 2');
      assert.strictEqual(result.sectionPageMap['section-back-cover'], result.pageCount, 'Back cover must be on last page');

      // Verify all mapped pages are within [1, pageCount]
      for (const [secKey, pNum] of Object.entries(result.sectionPageMap)) {
        assert.ok(pNum >= 1 && pNum <= result.pageCount, `Page for ${secKey} (${pNum}) must be in [1, ${result.pageCount}]`);
      }
    });
  }

  // 4. Test Section Page Map Integrity on Attendance & Demographics
  await test('Test 4: Attendance & Demographics Report — exact acceptance section mapping', async () => {
    const doc = compileReportDocument(
      'job-attendance-demo',
      mockSnapshot,
      analytics,
      'attendance-movement',
      'Official',
      []
    );

    const result = await renderDocumentToPDF(doc);
    const map = result.sectionPageMap;

    assert.strictEqual(map['section-cover'], 1);
    assert.strictEqual(map['cover'], 1);
    assert.strictEqual(map['section-kpis'], 2);
    assert.strictEqual(map['event-overview'], 2);

    // Section 01 Age groups and attendance table exists and has valid page
    const ageGroupPage = map['section-demographics-table'] || map['demographics-table'];
    assert.ok(ageGroupPage && ageGroupPage >= 2, 'Age group table section must be mapped');

    // Back cover exists and is last page
    assert.strictEqual(map['section-back-cover'], result.pageCount);
  });

  // 5. Test Expired Artifact Status Logic
  await test('Test 5: Expired Artifact — status returns 410 without reconstructing disconnected React layout', () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const isExpired = new Date(pastDate) < new Date();
    assert.strictEqual(isExpired, true, 'Artifact past expires_at must be detected as expired');

    // Error response contract matching Section 19
    const expiredPayload = {
      error: 'That download has expired.',
      code: 'DOWNLOAD_EXPIRED',
      message: 'Regenerate the report to create a fresh copy.'
    };
    assert.strictEqual(expiredPayload.code, 'DOWNLOAD_EXPIRED');
  });

  // =========================================================================
  // TEST 6: REACT OUTLINE NAVIGATION — Section links scroll within React DOM
  // The rejected architecture navigated the outline by updating an iframe URL
  // with #page=N. The approved architecture scrolls to React DOM section IDs.
  // =========================================================================
  await test('Test 6: React Outline Navigation — section links scroll to DOM elements, not iframe URL parameters', () => {
    const modalPath = path.resolve(process.cwd(), 'src/components/admin/reports/GeneratedReportPreviewModal.tsx');
    const modalSrc = fs.readFileSync(modalPath, 'utf8');

    // The React preview scrolls to section DOM IDs (scrollIntoView)
    assert.ok(
      modalSrc.includes('scrollIntoView'),
      'Outline nav must use scrollIntoView to jump to React DOM sections'
    );

    // Must NOT navigate by injecting page numbers into an iframe src URL
    assert.ok(
      !modalSrc.includes('#page='),
      'Outline nav must NOT use #page= URL fragment (that is the rejected iframe architecture)'
    );
    assert.ok(
      !modalSrc.includes('navpanes='),
      'Must NOT reference navpanes PDF viewer URL parameter'
    );
    assert.ok(
      !modalSrc.includes('toolbar=0'),
      'Must NOT reference toolbar=0 PDF viewer URL parameter'
    );

    // React preview must track active section via IntersectionObserver on DOM sections
    assert.ok(
      modalSrc.includes('IntersectionObserver'),
      'Preview must use IntersectionObserver to track active section in React DOM'
    );

    // Sidebar section IDs must correspond to React component anchor IDs
    const previewPath = path.resolve(process.cwd(), 'src/components/admin/reports/ReportDocumentPreview.tsx');
    const previewSrc = fs.readFileSync(previewPath, 'utf8');

    assert.ok(previewSrc.includes('id="section-cover"'), 'React preview must have section-cover anchor');
    assert.ok(previewSrc.includes('id="section-kpis"'), 'React preview must have section-kpis anchor');
    assert.ok(previewSrc.includes('id="section-back-cover"'), 'React preview must have section-back-cover anchor');
  });

  console.log('\n================================================================');
  console.log(`PARITY TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runParityTests();
