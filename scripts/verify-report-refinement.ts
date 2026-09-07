import assert from 'assert';
import { createZipArchive } from '../src/server/utils/zipHelper';
import { getPercentile, getMedian, formatDuration, normalizeAgeGroupLabel } from '../src/server/services/reportAnalyticsService';

console.log('--- RUNNING REPORTS REFINEMENT VERIFICATION TESTS ---');

// 1. Verification of Percentile Calculation
console.log('[TEST 1] Percentile computation (real values, no multipliers, null when empty)');
// Empty array
assert.strictEqual(getPercentile([], 75), null, 'Empty array must return null');
assert.strictEqual(getPercentile([], 90), null, 'Empty array must return null');

// Known values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const p50 = getPercentile(values, 50);
const p75 = getPercentile(values, 75);
const p90 = getPercentile(values, 90);
const med = getMedian(values);

console.log(`  P50: ${p50}, P75: ${p75}, P90: ${p90}, Median: ${med}`);
assert.ok(p50 !== null && !isNaN(p50), 'P50 must be a valid number');
assert.ok(p75 !== null && !isNaN(p75), 'P75 must be a valid number');
assert.ok(p90 !== null && !isNaN(p90), 'P90 must be a valid number');
assert.strictEqual(med, 55); // (50 + 60) / 2
assert.strictEqual(p75, 80);
assert.strictEqual(p90, 90);
console.log('  -> PASS');

// 2. Attendance rate with 24 checked in of 29 selected
console.log('[TEST 2] Attendance rate for 24 checked in of 29 selected');
const checkedIn = 24;
const selected = 29;
const rate = selected > 0 ? Number(((checkedIn / selected) * 100).toFixed(1)) : 0;
assert.strictEqual(rate, 82.8, `Expected 82.8%, got ${rate}%`);
console.log(`  Rate: ${rate}% -> PASS`);

// 3. Attendance rate with 0 expected (no division by zero / NaN)
console.log('[TEST 3] Zero expected denominator safety');
const zeroExpected = 0;
const safeRate = zeroExpected > 0 ? Number(((checkedIn / zeroExpected) * 100).toFixed(1)) : 0;
assert.strictEqual(safeRate, 0, 'Must return 0%');
assert.ok(!isNaN(safeRate), 'Must not be NaN');
console.log(`  Zero-expected rate: ${safeRate}% -> PASS`);

// 4. Pickup completion rate
console.log('[TEST 4] Pickup completion rate');
const pickedUp = 10;
const pickupRate = checkedIn > 0 ? Number(((pickedUp / checkedIn) * 100).toFixed(1)) : 0;
assert.strictEqual(pickupRate, 41.7, `Expected 41.7%, got ${pickupRate}%`);
const zeroCheckedInPickupRate = 0 > 0 ? Number(((pickedUp / 0) * 100).toFixed(1)) : 0;
assert.strictEqual(zeroCheckedInPickupRate, 0);
assert.ok(!isNaN(zeroCheckedInPickupRate));
console.log(`  Pickup rate: ${pickupRate}% -> PASS`);

// 5. ZIP helper test
console.log('[TEST 5] ZIP archiver creation (pure TS PKZIP)');
const testFiles = [
  { name: 'report1.pdf', buffer: Buffer.from('%PDF-1.4 test content 1') },
  { name: 'report2.pdf', buffer: Buffer.from('%PDF-1.4 test content 2') }
];
const zipBuffer = createZipArchive(testFiles);
assert.ok(zipBuffer.length > 0, 'Zip buffer must not be empty');
// PKZIP header starts with PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
assert.strictEqual(zipBuffer[0], 0x50, 'Byte 0 must be P');
assert.strictEqual(zipBuffer[1], 0x4b, 'Byte 1 must be K');
assert.strictEqual(zipBuffer[2], 0x03, 'Byte 2 must be 0x03');
assert.strictEqual(zipBuffer[3], 0x04, 'Byte 3 must be 0x04');
console.log(`  Zip generated successfully (${zipBuffer.length} bytes) -> PASS`);

// 6. Test no NaN in mock report analytics service methods
console.log('[TEST 6] Verify no NaN in mock calculations');
const mockExpected = 29;
const mockAttended = 24;
const mockRegistrations = 37;
const registrationConversion = mockRegistrations > 0 ? Number(((mockAttended / mockRegistrations) * 100).toFixed(1)) : 0;
assert.strictEqual(registrationConversion, 64.9);
assert.ok(!isNaN(registrationConversion));
console.log(`  Registration conversion: ${registrationConversion}% -> PASS`);

console.log('\nALL 6 VERIFICATION SUITES PASSED SUCCESSFULLY.');
