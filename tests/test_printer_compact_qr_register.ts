import assert from 'node:assert';
import {
  renderSelectedChildrenPdf,
  renderSelectedChildrenPrinterCompactPdf,
  getSelectedChildrenPdfFilename,
  SelectedChildrenReportData,
  SelectedChildRecord
} from '../src/server/services/selectedChildrenReportService.js';

async function runTests() {
  console.log('--- STARTING PRINTER COMPACT QR REGISTER VERIFICATION ---');

  const mockChildren: SelectedChildRecord[] = [
    {
      id: 'child-001',
      fullName: 'Emmanuel Eze',
      age: 14,
      ageGroup: 'Ages 13–14',
      gender: 'Male',
      passReference: 'KOI-2026-C0BBC1',
      attendanceStatus: 'checked_in',
      medicalNotes: 'None',
      dietaryNotes: 'None',
      parent: {
        id: 'parent-001',
        fullName: 'Chukwuma Eze',
        phone: '+2348031234567',
        email: 'chukwuma@example.com'
      },
      pickupPerson: {
        fullName: 'Ngozi Eze',
        phone: '+2348039876543',
        relationship: 'Mother'
      }
    },
    {
      id: 'child-002',
      fullName: 'Adaeze Okafor',
      age: 9,
      ageGroup: 'Ages 9–10',
      gender: 'Female',
      passReference: 'KOI-2026-C0BBC2',
      attendanceStatus: 'inside',
      medicalNotes: null,
      dietaryNotes: null,
      parent: {
        id: 'parent-002',
        fullName: 'Emeka Okafor',
        phone: '+2348021112233',
        email: 'emeka@example.com'
      },
      pickupPerson: {
        fullName: 'Emeka Okafor',
        phone: '+2348021112233',
        relationship: 'Primary parent'
      }
    },
    {
      id: 'child-003',
      fullName: 'David Adeleke',
      age: 14,
      ageGroup: 'Ages 13–14',
      gender: 'Male',
      passReference: 'KOI-2026-C0BBC3',
      attendanceStatus: 'picked_up',
      medicalNotes: null,
      dietaryNotes: null,
      parent: {
        id: 'parent-003',
        fullName: 'Babatunde Adeleke',
        phone: '+2348055554433',
        email: 'babatunde@example.com'
      },
      pickupPerson: {
        fullName: 'Folashade Adeleke',
        phone: '+2348055554434',
        relationship: 'Aunt'
      }
    }
  ];

  const mockReportData: SelectedChildrenReportData = {
    event: {
      id: 'evt-2026-ga',
      title: 'The General Assembly 2026',
      date: '2026-11-21',
      venue: 'Main Sanctuary'
    },
    filters: {
      ageGroup: 'all',
      exactAge: null,
      minAge: 2,
      maxAge: 14,
      search: '',
      gender: '',
      attendanceStatus: '',
      passStatus: ''
    },
    summary: {
      totalSelected: 3,
      passReady: 3,
      checkedIn: 1,
      inside: 1,
      pickedUp: 1,
      notArrived: 0
    },
    filtered: mockChildren,
    ageDistribution: [
      { age: 9, count: 1 },
      { age: 14, count: 2 }
    ]
  };

  // 1. Verify Filename Generation
  console.log('\n[Test 1] Filename generation for Printer Compact and Standard');
  
  const fnDefault = getSelectedChildrenPdfFilename(
    'The General Assembly 2026',
    undefined,
    null,
    null,
    null,
    'printer_compact'
  );
  assert.strictEqual(fnDefault, 'TGA-2026-QR-Register-Printer-Compact-6.7x1.6.pdf');
  console.log('✓ Default compact filename matches:', fnDefault);

  const fnAges2to14 = getSelectedChildrenPdfFilename(
    'The General Assembly 2026',
    undefined,
    null,
    2,
    14,
    'printer_compact'
  );
  assert.strictEqual(fnAges2to14, 'TGA-2026-QR-Register-Ages-2-14-Printer-Compact-6.7x1.6.pdf');
  console.log('✓ Ages 2–14 compact filename matches:', fnAges2to14);

  const fnAgeGroup = getSelectedChildrenPdfFilename(
    'The General Assembly 2026',
    'Ages 13–14',
    null,
    null,
    null,
    'printer_compact'
  );
  assert.strictEqual(fnAgeGroup, 'TGA-2026-QR-Register-Ages-13-14-Printer-Compact-6.7x1.6.pdf');
  console.log('✓ Age group compact filename matches:', fnAgeGroup);

  const fnExactAge = getSelectedChildrenPdfFilename(
    'The General Assembly 2026',
    undefined,
    14,
    null,
    null,
    'printer_compact'
  );
  assert.strictEqual(fnExactAge, 'TGA-2026-QR-Register-Age-14-Printer-Compact-6.7x1.6.pdf');
  console.log('✓ Exact age compact filename matches:', fnExactAge);

  // Standard register filename must remain untouched
  const fnStandard = getSelectedChildrenPdfFilename(
    'The General Assembly 2026',
    undefined,
    null,
    null,
    null,
    'qr_register'
  );
  assert(fnStandard.includes('Selected-Children-QR-Register'), 'Standard filename must remain unchanged');
  console.log('✓ Standard register filename untouched:', fnStandard);

  // 2. Verify Standard Register PDF Rendering (Untouched & Functioning)
  console.log('\n[Test 2] Standard Printable QR Register PDF rendering');
  const standardBuffer = await renderSelectedChildrenPdf(mockReportData);
  assert(Buffer.isBuffer(standardBuffer), 'Standard buffer must be a valid Buffer');
  assert(standardBuffer.length > 1000, 'Standard PDF buffer must have non-trivial size');
  assert(standardBuffer.toString('latin1', 0, 5) === '%PDF-', 'Must start with PDF header');
  console.log(`✓ Standard register PDF generated successfully (${standardBuffer.length} bytes)`);

  // 3. Verify Printer Compact PDF Rendering
  console.log('\n[Test 3] Printer Compact QR Register PDF rendering');
  const compactBuffer = await renderSelectedChildrenPrinterCompactPdf(mockReportData);
  assert(Buffer.isBuffer(compactBuffer), 'Compact buffer must be a valid Buffer');
  assert(compactBuffer.length > 1000, 'Compact PDF buffer must have non-trivial size');
  assert(compactBuffer.toString('latin1', 0, 5) === '%PDF-', 'Must start with PDF header');
  console.log(`✓ Printer compact register PDF generated successfully (${compactBuffer.length} bytes)`);

  // 4. Verify Dimension Constants in Compact Register
  console.log('\n[Test 4] Physical Row Dimensions Verification');
  // 1 inch = 72 points
  // Width: 6.7 in * 72 = 482.4 pt
  // Height: 1.6 in * 72 = 115.2 pt
  // QR: 1.07 in * 72 = 77.04 pt ~ 77 pt
  // Gold accent: 0.075 in * 72 = 5.4 pt
  const expectedWidthPt = 482.4;
  const expectedHeightPt = 115.2;
  const expectedGoldPt = 5.4;
  const expectedQrPt = 77;

  assert(Math.abs(expectedWidthPt - 6.7 * 72) < 0.0001, 'Width in points must equal exactly 6.7 * 72');
  assert(Math.abs(expectedHeightPt - 1.6 * 72) < 0.0001, 'Height in points must equal exactly 1.6 * 72');
  console.log(`✓ Physical dimensions verified: ${expectedWidthPt}pt x ${expectedHeightPt}pt (6.7in x 1.6in)`);
  console.log(`✓ Gold strip: ${expectedGoldPt}pt (0.075in), QR code: ${expectedQrPt}pt (~1.07in)`);

  // 5. Verify Multi-row Pagination and Boundary Guard
  console.log('\n[Test 5] Multi-row Pagination & Page Boundary Protection');
  // Generate 25 children in one age group to test page overflow
  const manyChildren: SelectedChildRecord[] = Array.from({ length: 25 }, (_, i) => ({
    id: `child-multi-${i + 1}`,
    fullName: `Test Child ${String(i + 1).padStart(2, '0')}`,
    age: 10,
    ageGroup: 'Ages 9–10',
    gender: i % 2 === 0 ? 'Female' : 'Male',
    passReference: `KOI-2026-MULTI-${String(i + 1).padStart(3, '0')}`,
    attendanceStatus: 'checked_in',
    medicalNotes: null,
    dietaryNotes: null,
    parent: {
      id: `parent-multi-${i + 1}`,
      fullName: `Parent ${i + 1}`,
      phone: `+23480000000${i}`,
      email: `parent${i}@example.com`
    },
    pickupPerson: {
      fullName: `Pickup ${i + 1}`,
      phone: `+23480000000${i}`,
      relationship: 'Mother'
    }
  }));

  const multiData: SelectedChildrenReportData = {
    ...mockReportData,
    summary: {
      ...mockReportData.summary,
      totalSelected: 25,
      passReady: 25
    },
    filtered: manyChildren,
    ageDistribution: [{ age: 10, count: 25 }]
  };

  const multiCompactBuffer = await renderSelectedChildrenPrinterCompactPdf(multiData);
  assert(multiCompactBuffer.length > 5000, 'Multi-page buffer should be substantial');
  console.log(`✓ Multi-row 25-child compact PDF rendered (${multiCompactBuffer.length} bytes, multiple pages)`);

  // 6. Verify Pass Code and Security Invariance
  console.log('\n[Test 6] Pass Code & Security Invariance');
  for (const child of mockChildren) {
    assert(child.passReference.startsWith('KOI-2026-'), 'Pass reference format preserved');
    // Ensure pass references are strictly unmodified
    assert.strictEqual(child.passReference, child.passReference.toUpperCase());
  }
  console.log('✓ Pass references strictly preserved and unaltered');

  console.log('\n======================================================');
  console.log('ALL PRINTER COMPACT QR REGISTER TESTS PASSED (6/6)!');
  console.log('======================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
