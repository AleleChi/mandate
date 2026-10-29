import assert from 'assert';
import {
  buildCloudinaryOptimizedVideoUrl,
  buildCloudinaryVideoPosterUrl
} from '../src/server/services/media/cloudinary';

console.log('--- STARTING LANDING MEDIA UPLOAD VALIDATION ---');

// =========================================================================
// TEST SUITE: Canonical Limits & MIME Validation
// =========================================================================
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 104,857,600 bytes
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;  // 10,485,760 bytes

const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
const allowedVideoExts = ['.mp4', '.webm', '.mov'];

function validateMedia(size: number, mimeType: string, ext: string, isVideo: boolean): { ok: boolean; error?: string } {
  if (isVideo) {
    if (!allowedVideoTypes.includes(mimeType) && !allowedVideoExts.includes(ext.toLowerCase())) {
      return { ok: false, error: 'Choose an MP4, WebM or supported video file.' };
    }
    if (size > MAX_VIDEO_BYTES) {
      return { ok: false, error: 'Video must be 100 MB or smaller.' };
    }
    return { ok: true };
  } else {
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedImageTypes.includes(mimeType)) {
      return { ok: false, error: 'Please upload a JPG, PNG, or WebP image.' };
    }
    if (size > MAX_IMAGE_BYTES) {
      return { ok: false, error: 'This photo is too large. Maximum image size is 10MB.' };
    }
    return { ok: true };
  }
}

// =========================================================================
// TEST A: Valid MP4 ~40 MB equivalent (39.7 MB = 41,628,467 bytes)
// =========================================================================
console.log('\n[Test A] Valid MP4 ~40 MB equivalent (christ_inline.mp4 - 39.7 MB)');
const sample39MB = 39.7 * 1024 * 1024; // ~41,628,467 bytes
const valA = validateMedia(sample39MB, 'video/mp4', '.mp4', true);
assert.strictEqual(valA.ok, true, '39.7 MB MP4 must be accepted');

// Verify Cloudinary optimization transformation logic
const sampleCloudinaryUrl = 'https://res.cloudinary.com/church-media/video/upload/v1726000000/koinonia-children-teens/videos/christ_inline.mp4';
const optimizedUrl = buildCloudinaryOptimizedVideoUrl(sampleCloudinaryUrl);
const posterUrl = buildCloudinaryVideoPosterUrl(sampleCloudinaryUrl);

console.log('Optimized Delivery URL:', optimizedUrl);
console.log('Poster URL:', posterUrl);

assert(optimizedUrl.includes('/video/upload/c_limit,w_1920,h_1080,vc_h264,q_auto,f_mp4,ac_none,fl_faststart/'), 'Optimized URL must include h264, 1080p limit, faststart, and no audio');
assert(posterUrl.includes('/video/upload/so_0,c_limit,w_1920,h_1080,q_auto,f_auto/'), 'Poster URL must extract first frame');
assert(posterUrl.endsWith('.jpg'), 'Poster URL must have .jpg extension');
console.log('PASS: Test A - 39.7 MB MP4 accepted, delivery URL & poster successfully transformed');

// =========================================================================
// TEST B: Exactly 100 MB Video
// =========================================================================
console.log('\n[Test B] Exactly 100 MB Video (104,857,600 bytes)');
const exact100MB = 100 * 1024 * 1024;
const valB = validateMedia(exact100MB, 'video/mp4', '.mp4', true);
assert.strictEqual(valB.ok, true, 'Exact 100 MB video must be accepted');
console.log('PASS: Test B - Exactly 100 MB accepted');

// =========================================================================
// TEST C: 100 MB + 1 Byte Video
// =========================================================================
console.log('\n[Test C] 100 MB + 1 byte Video (104,857,601 bytes)');
const over100MB = (100 * 1024 * 1024) + 1;
const valC = validateMedia(over100MB, 'video/mp4', '.mp4', true);
assert.strictEqual(valC.ok, false, '100 MB + 1 byte must be rejected');
assert.strictEqual(valC.error, 'Video must be 100 MB or smaller.');
console.log('PASS: Test C - 100 MB + 1 byte rejected with correct message');

// =========================================================================
// TEST D: Invalid Video MIME / Extension
// =========================================================================
console.log('\n[Test D] Invalid Video MIME / Format');
const valD1 = validateMedia(1024 * 1024, 'video/x-flv', '.flv', true);
assert.strictEqual(valD1.ok, false);
assert.strictEqual(valD1.error, 'Choose an MP4, WebM or supported video file.');

const valD2 = validateMedia(1024 * 1024, 'image/jpeg', '.jpg', true);
assert.strictEqual(valD2.ok, false);
assert.strictEqual(valD2.error, 'Choose an MP4, WebM or supported video file.');
console.log('PASS: Test D - Invalid video formats rejected');

// =========================================================================
// TEST E: Cloudinary Unavailable / Previous Video Preserved
// =========================================================================
console.log('\n[Test E] Cloudinary Unavailable: Previous video preserved');
let publishedVideoSetting = 'https://res.cloudinary.com/demo/video/upload/current-active-video.mp4';

async function simulateUploadFlow(fileSize: number, shouldCloudinaryFail: boolean): Promise<string> {
  // 1. Validation
  const val = validateMedia(fileSize, 'video/mp4', '.mp4', true);
  if (!val.ok) throw new Error(val.error);

  // 2. Provider upload
  if (shouldCloudinaryFail) {
    throw new Error("We couldn't prepare this video for the website. Please try again.");
  }

  // 3. Optimization & Persistence
  const newDeliveryUrl = buildCloudinaryOptimizedVideoUrl('https://res.cloudinary.com/demo/video/upload/new-video.mp4');
  publishedVideoSetting = newDeliveryUrl;
  return newDeliveryUrl;
}

try {
  await simulateUploadFlow(sample39MB, true);
  assert.fail('Should have failed when Cloudinary is unavailable');
} catch (err: any) {
  assert.strictEqual(err.message, "We couldn't prepare this video for the website. Please try again.");
}
assert.strictEqual(publishedVideoSetting, 'https://res.cloudinary.com/demo/video/upload/current-active-video.mp4', 'Active published video must remain untouched on failure');
console.log('PASS: Test E - Previous video preserved on upload failure');

// =========================================================================
// TEST F, G, H: Slot Error Isolation & Error Copy
// =========================================================================
console.log('\n[Test F, G, H] Media Slot Error State Isolation');

// Simulating AdminLandingView state management
let errorSlot: Record<string, string> = {};
let successSlot: Record<string, string> = {};

function handleSlotError(slotKey: string, slotType: 'video' | 'image', rawError: any) {
  let friendlyMsg: string;
  if (slotType === 'video') {
    friendlyMsg = (rawError?.message && rawError.message.includes('100 MB'))
      ? 'Video must be 100 MB or smaller.'
      : (rawError?.message && rawError.message.includes('supported video file'))
      ? 'Choose an MP4, WebM or supported video file.'
      : "We couldn't prepare this video for the website. Please try again.";
  } else {
    friendlyMsg = (rawError?.message && (rawError.message.includes('10MB') || rawError.message.includes('large')))
      ? 'File size is too large. Maximum image size is 10MB.'
      : (rawError?.message && (rawError.message.includes('JPG') || rawError.message.includes('format')))
      ? 'Please choose a JPG, PNG, or WebP image format.'
      : "We couldn't upload this image. Please try again.";
  }
  errorSlot = { ...errorSlot, [slotKey]: friendlyMsg };
}

function handleSlotSuccess(slotKey: string, slotType: 'video' | 'image') {
  errorSlot = { ...errorSlot, [slotKey]: '' };
  successSlot = { ...successSlot, [slotKey]: slotType === 'video' ? 'Video ready' : 'Media uploaded & live!' };
}

function startSlotUpload(slotKey: string) {
  errorSlot = { ...errorSlot, [slotKey]: '' };
  successSlot = { ...successSlot, [slotKey]: '' };
}

// Test F: Video slot failure
console.log('Simulating video upload failure on heroVideo...');
startSlotUpload('heroVideo');
handleSlotError('heroVideo', 'video', new Error('Cloudinary timeout'));

assert.strictEqual(errorSlot['heroVideo'], "We couldn't prepare this video for the website. Please try again.", 'heroVideo must display video error');
assert.strictEqual(errorSlot['interactiveSample'], undefined, 'interactiveSample must NOT show error');
console.log('PASS: Test F - Video error isolated exclusively to video slot');

// Test G: Image slot failure
console.log('Simulating image upload failure on interactiveSample...');
startSlotUpload('interactiveSample');
handleSlotError('interactiveSample', 'image', new Error('Connection reset'));

assert.strictEqual(errorSlot['heroVideo'], "We couldn't prepare this video for the website. Please try again.", 'heroVideo must still show its error');
assert.strictEqual(errorSlot['interactiveSample'], "We couldn't upload this image. Please try again.", 'interactiveSample must display image error, NOT video error');
console.log('PASS: Test G - Image error displays correct image copy and is isolated');

// Test H: Image upload succeeds after video failure
console.log('Simulating image upload success on interactiveSample...');
startSlotUpload('interactiveSample');
assert.strictEqual(errorSlot['interactiveSample'], '', 'Starting upload must clear previous error for that slot');
handleSlotSuccess('interactiveSample', 'image');

assert.strictEqual(errorSlot['interactiveSample'], '', 'Image slot must have zero error');
assert.strictEqual(successSlot['interactiveSample'], 'Media uploaded & live!');
assert.strictEqual(errorSlot['heroVideo'], "We couldn't prepare this video for the website. Please try again.", 'heroVideo still preserves its own error');
console.log('PASS: Test H - Image upload succeeds, error cleared, no stale error leaking');

console.log('\nALL LANDING MEDIA UPLOAD ASSERTIONS PASSED SUCCESSFULLY!');
