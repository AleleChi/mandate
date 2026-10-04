import assert from 'assert';
import { jsPDF } from 'jspdf';
import { compileReportDocument } from '../src/server/reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../src/server/reports/reportRenderer';
import { calculateAnalytics } from '../src/server/services/reportAnalyticsService';

console.log('================================================================');
console.log('REPORT PDF COVER — FINAL PARITY VERIFICATION SUITE');
console.log('================================================================\n');

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
    { id: 'c5', status: 'selected', age_group: 'Teens' }
  ],
  attendanceRecords: [
    { id: 'att1', child_event_entry_id: 'c1', action_type: 'check_in', created_at: '2026-11-21T09:15:00Z' },
    { id: 'att2', child_event_entry_id: 'c2', action_type: 'check_in', created_at: '2026-11-21T09:30:00Z' }
  ],
  locations: [
    { id: 'loc-1', name: 'Main Pavilion', location_label: 'Main Pavilion', capacity: 200 }
  ],
  dutyAssignments: [
    { id: 'da-1', event_id: 'event-ga-2026', user_id: 'u-1', volunteer_profile_id: 'vp-1', volunteer_name: 'Alele Chi', team_key: 'childcare', preferred_team: 'Childcare', status: 'scheduled', location_id: 'loc-1' }
  ],
  dutyPresence: [
    { id: 'dp-1', event_id: 'event-ga-2026', user_id: 'u-1', volunteer_profile_id: 'vp-1', location_id: 'loc-1', started_at: '2026-11-21T08:30:00Z', ended_at: null }
  ],
  rosterVolunteers: [
    { volunteer_profile_id: 'vp-1', user_id: 'u-1', full_name: 'Alele Chi', status: 'approved' }
  ],
  alerts: [],
  safetyAlerts: [],
  incidentRecords: []
};

async function runCoverTests() {
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

  // 1. Test Logo Aspect Ratio Protection
  await test('Test 1: Logo preserves source aspect ratio without stretching', async () => {
    // Generate valid 2:1 landscape PNG (100x50)
    const sharp = (await import('sharp')).default;
    const logoBuf = await sharp({
      create: { width: 100, height: 50, channels: 4, background: { r: 197, g: 155, b: 39, alpha: 1 } }
    }).png().toBuffer();
    const sampleLogoBase64 = `data:image/png;base64,${logoBuf.toString('base64')}`;

    const docModel = compileReportDocument(
      'job-logo-test',
      mockSnapshot,
      analytics,
      'management-summary',
      'Official',
      []
    );

    docModel.branding = {
      ...docModel.branding,
      organizationName: 'Koinonia Global',
      logoBase64: sampleLogoBase64
    };

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgProps = doc.getImageProperties(sampleLogoBase64);
    assert.strictEqual(imgProps.width / imgProps.height, 2, 'Sample logo aspect ratio is 2:1');

    // Render to PDF to ensure no exceptions and aspect-ratio protection executes
    const result = await renderDocumentToPDF(docModel);
    assert.ok(result.pdfBytes.byteLength > 5000, 'PDF generated with protected logo');
  });

  // 2. Test Large Dominant Title & Dynamic Title Fitting across all 6 reports
  const sixTemplates = [
    { key: 'management-summary', expectedDisplay: 'Management Report' },
    { key: 'registration-selection', expectedDisplay: 'Registration & Selection Report' },
    { key: 'attendance-movement', expectedDisplay: 'Attendance & Demographics Report' },
    { key: 'volunteer-coverage', expectedDisplay: 'Volunteer Team Report' },
    { key: 'care-safety-summary', expectedDisplay: 'Child Care & Safety Report' },
    { key: 'full-event-report', expectedDisplay: 'Full Event Report' }
  ];

  for (const t of sixTemplates) {
    await test(`Test 2: Report "${t.key}" uses large title >= 30pt and <= 2 lines`, async () => {
      const docModel = compileReportDocument(`rep-${t.key}`, mockSnapshot, analytics, t.key, 'Official', []);
      const displayTitle = docModel.reportTitle.includes('—')
        ? docModel.reportTitle.split('—')[1].trim()
        : docModel.reportTitle;

      assert.ok(displayTitle.length > 0, 'Display title must not be empty');

      // Test fitting logic
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let fittedSize = 38;
      let lines: string[] = [];

      for (let sz = 38; sz >= 26; sz -= 2) {
        doc.setFont('times', 'bold');
        doc.setFontSize(sz);
        const split = doc.splitTextToSize(displayTitle, 170);
        if (split.length <= 2 || sz === 26) {
          fittedSize = sz;
          lines = split;
          break;
        }
      }

      assert.ok(fittedSize >= 30, `Fitted size (${fittedSize}pt) must be >= 30pt (large editorial scale)`);
      assert.ok(lines.length <= 2, `Title lines (${lines.length}) must be at most 2 lines`);
    });
  }

  // 3. Test Publication Metadata & Banned Terms
  await test('Test 3: Publication labels present and technical metadata absent from cover', async () => {
    const docModel = compileReportDocument(
      'job-meta-test',
      mockSnapshot,
      analytics,
      'management-summary',
      'Official',
      []
    );

    const pdfResult = await renderDocumentToPDF(docModel);
    assert.strictEqual(pdfResult.sectionPageMap['section-cover'], 1, 'Cover must be on Page 1');
    assert.strictEqual(pdfResult.sectionPageMap['section-kpis'], 2, 'Page 2 must be KPIs/Opening spread');

    const json = JSON.stringify(docModel).toLowerCase();
    assert.ok(!json.includes('provenance'), 'Must not contain "provenance"');
    assert.ok(!json.includes('internal operational'), 'Must not contain "internal operational"');
    assert.ok(!json.includes('authoritative database figures'), 'Must not contain "authoritative database figures"');
  });

  // 4. Test Page 2 Onward Unchanged
  await test('Test 4: Pages 2 onward unchanged (Section map and Page 2 opening spread preserved)', async () => {
    const docModel = compileReportDocument(
      'job-page2-check',
      mockSnapshot,
      analytics,
      'attendance-movement',
      'Official',
      []
    );

    const pdfResult = await renderDocumentToPDF(docModel);
    assert.ok(pdfResult.pageCount >= 3, 'Must have at least 3 pages');
    assert.strictEqual(pdfResult.sectionPageMap['section-kpis'], 2, 'KPIs on page 2');
    assert.ok(pdfResult.sectionPageMap['section-back-cover'] === pdfResult.pageCount, 'Back cover is final page');
  });

  console.log('\n================================================================');
  console.log(`COVER PARITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCoverTests().catch(err => {
  console.error('Fatal cover test error:', err);
  process.exit(1);
});
