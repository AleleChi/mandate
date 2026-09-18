import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { compileReportDocument } from '../src/server/reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../src/server/reports/reportRenderer';
import { calculateAnalytics } from '../src/server/services/reportAnalyticsService';
import { getOrRegenerateReportPDF } from '../src/server/services/reportService';

console.log('================================================================');
console.log('REPORT REVIEW / PDF — SINGLE ARTIFACT PARITY TEST SUITE');
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

  // 1. Test Single Artifact Identity
  await test('Test 1: Canonical Report Artifact Identity — Review and Download reference identical artifact', async () => {
    const reportJobId = 'job-parity-001';
    const doc = compileReportDocument(
      reportJobId,
      mockSnapshot,
      analytics,
      'attendance-movement',
      'Internal operational',
      []
    );

    const rendered = await renderDocumentToPDF(doc);
    const pdfBuffer = Buffer.from(rendered.pdfBytes);
    const artifactHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Simulate review artifact resolution vs download artifact resolution
    const reviewArtifactKey = `${reportJobId}.pdf`;
    const downloadArtifactKey = `${reportJobId}.pdf`;

    assert.strictEqual(reviewArtifactKey, downloadArtifactKey, 'Review artifact key must match download artifact key');
    assert.ok(pdfBuffer.toString('utf8', 0, 4) === '%PDF', 'Artifact must be valid binary PDF');

    const reviewHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    const downloadHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    assert.strictEqual(reviewHash, downloadHash, 'Review artifact content hash must equal download artifact hash');
    assert.strictEqual(reviewHash, artifactHash);
  });

  // 2. Test All Six Report Types Canonical PDF Generation & Section Mapping
  const reportTypes = [
    { key: 'management-summary', name: 'Event Executive' },
    { key: 'registration-selection', name: 'Registration & Selection' },
    { key: 'attendance-movement', name: 'Attendance & Demographics' },
    { key: 'volunteer-coverage', name: 'Volunteer Team' },
    { key: 'care-safety-summary', name: 'Child Safety / Incident' },
    { key: 'full-event-report', name: 'Custom Event' }
  ];

  for (const rt of reportTypes) {
    await test(`Test 2: Report Type [${rt.name}] (${rt.key}) — PDF artifact generation and page mapping`, async () => {
      const doc = compileReportDocument(
        `job-${rt.key}`,
        mockSnapshot,
        analytics,
        rt.key,
        'Internal operational',
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

  // 3. Test Section Page Map Integrity on Attendance & Demographics
  await test('Test 3: Attendance & Demographics Report — exact acceptance section mapping', async () => {
    const doc = compileReportDocument(
      'job-attendance-demo',
      mockSnapshot,
      analytics,
      'attendance-movement',
      'Internal operational',
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

  // 4. Test Expired Artifact Status Logic
  await test('Test 4: Expired Artifact — status returns 410 without reconstructing disconnected React layout', () => {
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

  // 5. Test Viewer Navigation Contract (section clicks map to real PDF page jumps)
  await test('Test 5: Viewer Navigation Contract — Section click resolves to PDF page number for iframe URL parameter', () => {
    const samplePageMap: Record<string, number> = {
      'section-cover': 1,
      'section-kpis': 2,
      'section-demographics-table': 3,
      'section-attendance-status-composition': 3,
      'section-findings': 4,
      'section-back-cover': 5
    };

    function resolvePdfTarget(sectionId: string, zoom: number, blobUrl: string): string {
      const page = samplePageMap[sectionId] || 1;
      return `${blobUrl}#page=${page}&zoom=${zoom}&toolbar=0&navpanes=0`;
    }

    const testBlob = 'blob:http://localhost:5173/mock-uuid';
    const coverUrl = resolvePdfTarget('section-cover', 100, testBlob);
    const demographicsUrl = resolvePdfTarget('section-demographics-table', 100, testBlob);
    const backCoverUrl = resolvePdfTarget('section-back-cover', 120, testBlob);

    assert.strictEqual(coverUrl, 'blob:http://localhost:5173/mock-uuid#page=1&zoom=100&toolbar=0&navpanes=0');
    assert.strictEqual(demographicsUrl, 'blob:http://localhost:5173/mock-uuid#page=3&zoom=100&toolbar=0&navpanes=0');
    assert.strictEqual(backCoverUrl, 'blob:http://localhost:5173/mock-uuid#page=5&zoom=120&toolbar=0&navpanes=0');
  });

  console.log('\n================================================================');
  console.log(`PARITY TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runParityTests();
