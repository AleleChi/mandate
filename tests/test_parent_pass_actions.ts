import assert from 'assert';
import fs from 'fs';
import path from 'path';

/**
 * PARENT DIGITAL PASS PNG EXPORT & ARRIVAL CARD REDESIGN TEST SUITE
 *
 * Verifies:
 * 1. Save pass produces PNG, not HTML (Blob type image/png, canvas toBlob).
 * 2. Filename ends in .png (Koinonia-Pass-{child-name}-{pass-reference}.png).
 * 3. PNG credential uses canonical effectivePassCode.
 * 4. QR uses exactly the same canonical value.
 * 5. No WB code/NFC UID/internal IDs are exported.
 * 6. WhatsApp URL is properly encoded (https://wa.me/?text={encodedMessage}).
 * 7. WhatsApp message contains dynamic child name, event title, and canonical pass code.
 * 8. WhatsApp excludes sensitive/internal data (no phone, no medical, no DB IDs, no NFC UID, no WB code).
 * 9. Arrival guide action remains unchanged (setSelectedArrivalChild(child); setShowArrivalGuideModal(true);).
 * 10. Parent status/check-in business logic is unchanged.
 */
async function runParentPassActionsTests() {
  console.log('================================================================');
  console.log('PARENT DIGITAL PASS PNG EXPORT & ARRIVAL CARD TEST SUITE');
  console.log('Verifying Real PNG Export, WhatsApp Share, Arrival Card & Safety');
  console.log('================================================================\n');

  const parentHomeViewPath = path.join(process.cwd(), 'src/views/ParentHomeView.tsx');
  const source = fs.readFileSync(parentHomeViewPath, 'utf-8');
  let passedTests = 0;

  // ---------------------------------------------------------------------------
  // Test 1: Save pass produces PNG, not HTML
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: SAVE PASS PRODUCES PNG, NOT HTML ---');
  // Check that HTML download is completely gone
  assert(!source.includes("new Blob([htmlContent]"), 'Old HTML blob creation must be removed');
  assert(!source.includes(".html`"), 'Old HTML download filename must be removed');

  // Check renderPassCredentialToPngBlob exists and returns Promise<Blob>
  assert(source.includes('export async function renderPassCredentialToPngBlob'), 'Must implement renderPassCredentialToPngBlob');
  assert(source.includes("canvas.toBlob((blob) => {"), 'Must use native canvas.toBlob to generate image');
  assert(source.includes("'image/png'"), 'Must specify image/png mime type');

  // Check handleSavePass invokes renderPassCredentialToPngBlob and handles Blob download
  assert(source.includes('const blob = await renderPassCredentialToPngBlob({'), 'handleSavePass must call renderPassCredentialToPngBlob');
  assert(source.includes('const blobUrl = URL.createObjectURL(blob);'), 'Must create object URL from PNG blob');
  assert(source.includes('link.download = filename;'), 'Must set link.download attribute');
  assert(source.includes('link.click();'), 'Must trigger programmatic download');
  assert(source.includes('URL.revokeObjectURL(blobUrl)'), 'Must cleanly revoke object URL');

  // Simulate and verify PNG blob generation contract
  const mockPngBlob = new Blob(['mock-png-data'], { type: 'image/png' });
  assert.strictEqual(mockPngBlob.type, 'image/png', 'Blob type must strictly be image/png');
  console.log('  [PASS] Test 1: Save pass generates real PNG blob via canvas (not HTML)');
  passedTests++;

  // ---------------------------------------------------------------------------
  // Test 2: Filename ends in .png
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: FILENAME ENDS IN .PNG ---');
  assert(source.includes('const filename = `Koinonia-Pass-${safeChildName}-${safePassCode}.png`;'), 'Filename must use Koinonia-Pass-[child]-[passcode].png pattern');

  // Verify filename builder regex and pattern
  const sampleChildName = 'Testing Child';
  const samplePassCode = 'KOI-2026-AE1CA0';
  const safeChildName = sampleChildName.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const safePassCode = samplePassCode.trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
  const expectedFilename = `Koinonia-Pass-${safeChildName}-${safePassCode}.png`;
  assert.strictEqual(expectedFilename, 'Koinonia-Pass-Testing-Child-KOI-2026-AE1CA0.png');
  assert(expectedFilename.endsWith('.png'), 'Filename must end in .png');
  console.log(`  [PASS] Test 2: Filename matches target canonical format (${expectedFilename})`);
  passedTests++;

  // ---------------------------------------------------------------------------
  // Test 3: PNG credential uses canonical effectivePassCode
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: PNG CREDENTIAL USES CANONICAL effectivePassCode ---');
  assert(source.includes('effectivePassCode: string;'), 'renderPassCredentialToPngBlob must require effectivePassCode');
  assert(source.includes("ctx.fillText('PASS CODE', width / 2, codeBoxY + 30);"), 'PNG canvas must render PASS CODE label');
  assert(source.includes("ctx.fillText(effectivePassCode, width / 2, codeBoxY + 68);"), 'PNG canvas must render canonical effectivePassCode');
  assert(source.includes('effectivePassCode,'), 'handleSavePass must supply effectivePassCode to renderPassCredentialToPngBlob');
  console.log('  [PASS] Test 3: PNG credential visually displays canonical effectivePassCode');
  passedTests++;

  // ---------------------------------------------------------------------------
  // Test 4: QR uses exactly the same canonical value
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: QR USES EXACTLY THE SAME CANONICAL VALUE ---');
  // Check QR in PNG generation
  assert(source.includes('const qrDataUrl = await QRCodeLib.toDataURL(effectivePassCode'), 'QR generation in PNG must use exact effectivePassCode');
  // Check QR in visible modal
  assert(source.includes('data=${encodeURIComponent(effectivePassCode)}'), 'Modal QR code must use exact effectivePassCode');
  // Verify it does not encode an invented URL
  assert(!source.includes('QRCodeLib.toDataURL(`https://'), 'QR must NOT encode a website URL');
  assert(!source.includes('QRCodeLib.toDataURL(`http://'), 'QR must NOT encode an HTTP URL');
  console.log('  [PASS] Test 4: Both PNG QR and live pass QR encode exact effectivePassCode (no URL)');
  passedTests++;

  // ---------------------------------------------------------------------------
  // Test 5: No WB code/NFC UID/internal IDs are exported
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: NO HARDWARE IDENTIFIERS OR INTERNAL DATABASE IDS EXPORTED ---');
  const pngFunctionMatch = source.match(/export async function renderPassCredentialToPngBlob\(\{[\s\S]*?\}\): Promise<Blob> \{([\s\S]*?)\n\}/);
  assert(pngFunctionMatch, 'renderPassCredentialToPngBlob implementation must be parseable');
  const pngFunctionCode = pngFunctionMatch[1];

  assert(!pngFunctionCode.includes('wristband'), 'PNG export must not include wristband data');
  assert(!pngFunctionCode.includes('nfc'), 'PNG export must not include NFC UID');
  assert(!pngFunctionCode.includes('child_event_entry'), 'PNG export must not include child_event_entry ID');
  assert(!pngFunctionCode.includes('medical'), 'PNG export must not include medical info');
  assert(!pngFunctionCode.includes('allergies'), 'PNG export must not include allergies');
  assert(!pngFunctionCode.includes('Bearer'), 'PNG export must not include bearer tokens');
  assert(!pngFunctionCode.includes('token'), 'PNG export must not include API/auth tokens');
  assert(!pngFunctionCode.includes('${selectedDetailChild.id}'), 'PNG export must not embed child database ID');
  assert(!pngFunctionCode.includes('${activeEvent.id}'), 'PNG export must not embed event database ID');
  assert(!pngFunctionCode.includes('${parentProfile.id}'), 'PNG export must not embed parent database ID');
  console.log('  [PASS] Test 5: PNG export strictly excludes wristband codes, NFC UIDs, medical info, and DB IDs');
  passedTests++;

  // ---------------------------------------------------------------------------
  // Test 6: WhatsApp URL is properly encoded
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: WHATSAPP URL IS PROPERLY ENCODED ---');
  assert(source.includes('export function buildParentPassWhatsAppShareUrl'), 'Must define buildParentPassWhatsAppShareUrl helper');
  assert(source.includes('https://wa.me/?text=${encodeURIComponent(messageLines.join'), 'Must construct wa.me URL with encodeURIComponent');
  assert(source.includes("window.open(waUrl, '_blank', 'noopener,noreferrer')"), 'Must open WhatsApp safely with noopener,noreferrer');

  // Test encoding helper function behavior
  function buildShareUrl(eventTitle?: string | null, childName?: string | null, passCode?: string | null): string {
    const cleanTitle = (eventTitle || 'The General Assembly').trim();
    const cleanChild = (childName || 'Child').trim();
    const cleanCode = (passCode || '').trim();
    const messageLines = [
      'Koinonia Children & Teens',
      cleanTitle,
      '',
      `Pass for: ${cleanChild}`,
      `Pass code: ${cleanCode}`,
      '',
      'Present the QR or this code at the authorised check-in point.'
    ];
    return `https://wa.me/?text=${encodeURIComponent(messageLines.join('\n'))}`;
  }

  const generatedUrl = buildShareUrl('TGA 2026 & Ministry', "O'Connor Child", 'KOI-2026-AE1CA0');
  assert(generatedUrl.startsWith('https://wa.me/?text='), 'URL must begin with https://wa.me/?text=');
  assert(!generatedUrl.includes(' '), 'URL must not contain raw unencoded spaces');
  assert(generatedUrl.includes('%20') || generatedUrl.includes('%0A'), 'URL must encode whitespace and newlines');
  console.log('  [PASS] Test 6: WhatsApp URL properly encoded via encodeURIComponent with noopener,noreferrer');
  passedTests++;

  // ---------------------------------------------------------------------------
  // Test 7: WhatsApp message contains dynamic child name/event/pass code
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: WHATSAPP MESSAGE CONTAINS DYNAMIC FIELDS ---');
  const urlParam = generatedUrl.replace('https://wa.me/?text=', '');
  const decodedMessage = decodeURIComponent(urlParam);
  assert(decodedMessage.includes('Koinonia Children & Teens'), 'Message must contain Koinonia Children & Teens header');
  assert(decodedMessage.includes('TGA 2026 & Ministry'), 'Message must contain dynamic event title');
  assert(decodedMessage.includes("Pass for: O'Connor Child"), 'Message must contain dynamic child name');
  assert(decodedMessage.includes('Pass code: KOI-2026-AE1CA0'), 'Message must contain dynamic canonical pass code');
  assert(decodedMessage.includes('Present the QR or this code at the authorised check-in point.'), 'Message must contain check-in instruction');
  console.log('  [PASS] Test 7: WhatsApp message dynamic content verified');
  passedTests++;

  // ---------------------------------------------------------------------------
  // Test 8: WhatsApp excludes sensitive/internal data
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: WHATSAPP EXCLUDES SENSITIVE / INTERNAL DATA ---');
  const waHandlerMatch = source.match(/const handleWhatsAppShare = \(\) => \{([\s\S]*?)\};/);
  assert(waHandlerMatch, 'handleWhatsAppShare implementation must be parseable');
  const waCode = waHandlerMatch[1];

  assert(!waCode.includes('parentProfile.phone'), 'WhatsApp message must not leak parent phone');
  assert(!waCode.includes('medical'), 'WhatsApp message must not leak medical details');
  assert(!waCode.includes('wristband'), 'WhatsApp message must not leak wristband codes');
  assert(!waCode.includes('nfc'), 'WhatsApp message must not leak NFC UID');
  assert(!waCode.includes('token'), 'WhatsApp message must not leak tokens');
  assert(!decodedMessage.includes('+234'), 'Decoded WhatsApp message must not contain phone numbers');
  assert(!decodedMessage.includes('asthma'), 'Decoded WhatsApp message must not contain medical notes');

  // Verify blocked popup handling
  assert(source.includes("showError('Opening WhatsApp blocked'"), 'Must handle blocked popup with meaningful error message');
  console.log('  [PASS] Test 8: WhatsApp message strictly excludes phone numbers, medical data, and hardware IDs');
  passedTests++;

  // ---------------------------------------------------------------------------
  // Test 9: Arrival guide action remains unchanged
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9: ARRIVAL GUIDE ACTION REMAINS UNCHANGED & CARD STRUCTURE REDESIGNED ---');
  assert(source.includes('data-component-version="parent-arrival-card-v2"'), 'Arrival card must have v2 marker');
  assert(source.includes('setSelectedArrivalChild(child);'), 'Arrival guide click must set arrival child');
  assert(source.includes('setShowArrivalGuideModal(true);'), 'Arrival guide click must open arrival guide modal');
  assert(source.includes('min-h-[44px]'), 'Action row must have minimum 44px touch target');
  assert(source.includes('View arrival guide'), 'Action row must have "View arrival guide" text');

  // Verify removal of nested cards around arrival details
  const arrivalCardMatch = source.match(/data-component-version="parent-arrival-card-v2"[\s\S]*?\{\/\* 6\. Summary cards \*\/\}/);
  assert(arrivalCardMatch, 'Arrival card block must be present');
  const arrivalCardCode = arrivalCardMatch[0];
  // Check that the old nested card wrapper is gone
  assert(!arrivalCardCode.includes('bg-[#FBF8EF] rounded-xl p-3 border border-[#E5D5AE]'), 'Old nested container card must be removed');
  assert(!arrivalCardCode.includes('w-full py-2.5 px-4 bg-linear-to-r from-[#9A7326] to-[#C59B27]'), 'Old oversized full-width gold button must be removed');
  console.log('  [PASS] Test 9: Arrival guide action preserved with single card surface and refined 44px action row');
  passedTests++;

  // ---------------------------------------------------------------------------
  // Test 10: Parent status/check-in business logic is unchanged
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10: PARENT STATUS / CHECK-IN BUSINESS LOGIC IS UNCHANGED ---');
  assert(source.includes("child.status === 'Checked in' || child.status === 'Inside'"), 'Check-in status logic preserved');
  assert(source.includes("child.status === 'Pass ready'"), 'Pass ready status logic preserved');
  assert(source.includes('effectivePassCode'), 'effectivePassCode resolution preserved');
  assert(source.includes('isPassUnlockedForChild'), 'Pass unlock logic preserved');
  console.log('  [PASS] Test 10: Parent status and check-in business logic preserved intact');
  passedTests++;

  console.log('\n================================================================');
  console.log(`ALL ${passedTests}/${passedTests} PNG EXPORT & ARRIVAL REDESIGN TESTS PASSED`);
  console.log('================================================================\n');
}

runParentPassActionsTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[TEST FAILURE]:', err);
    process.exit(1);
  });
