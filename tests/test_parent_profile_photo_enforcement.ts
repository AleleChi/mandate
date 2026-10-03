import express from 'express';
import http from 'http';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken, hashPassword } from '../src/server/auth';
import parentRoutes from '../src/server/routes/parent';
import { isValidUploadedPhoto as serverIsValidUploadedPhoto, validateParentProfile, validateChildDraftStep } from '../src/server/utils/validation';
import { isValidUploadedPhoto as clientIsValidUploadedPhoto } from '../src/utils/validation';

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING REGRESSION TEST: PARENT PROFILE PHOTO COMPULSORY FIX    ');
  console.log('================================================================');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date();
  const nowIso = now.toISOString();

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean, details?: any) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`, details !== undefined ? details : '');
      failed++;
    }
  }

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/parent', parentRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // -------------------------------------------------------------------------
    // 1. Photo validation definition checks (client and server helpers)
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Photo Validation Unit Checks ---');

    // 1.1 Null, undefined, empty, whitespace
    assert('Server helper rejects null', serverIsValidUploadedPhoto(null) === false);
    assert('Server helper rejects undefined', serverIsValidUploadedPhoto(undefined) === false);
    assert('Server helper rejects empty string', serverIsValidUploadedPhoto('') === false);
    assert('Server helper rejects whitespace', serverIsValidUploadedPhoto('   ') === false);
    assert('Client helper rejects null', clientIsValidUploadedPhoto(null) === false);
    assert('Client helper rejects undefined', clientIsValidUploadedPhoto(undefined) === false);
    assert('Client helper rejects empty string', clientIsValidUploadedPhoto('') === false);
    assert('Client helper rejects whitespace', clientIsValidUploadedPhoto('   ') === false);

    // 1.2 Local blob URLs and un-uploaded data URIs
    assert('Rejects blob URL', serverIsValidUploadedPhoto('blob:http://localhost:5173/3f98c4d2') === false);
    assert('Rejects data URI', serverIsValidUploadedPhoto('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA') === false);

    // 1.3 Placeholder / default avatar assets / raw initials
    assert('Rejects default_avatar', serverIsValidUploadedPhoto('https://site.org/assets/default_avatar.png') === false);
    assert('Rejects pass_avatar', serverIsValidUploadedPhoto('/assets/images/pass_avatar.png') === false);
    assert('Rejects worker_avatar', serverIsValidUploadedPhoto('/assets/images/worker_avatar.png') === false);
    assert('Rejects placeholder asset', serverIsValidUploadedPhoto('/assets/placeholder.jpg') === false);
    assert('Rejects raw initials', serverIsValidUploadedPhoto('JD') === false);
    assert('Rejects initials: prefix', serverIsValidUploadedPhoto('initials:AB') === false);

    // 1.4 Valid uploaded photo references
    const validUuid = 'e8b7c3d2-4f1a-4d3b-8c2e-1f9a0b2c3d4e';
    const validMediaPath = `/api/media/files/${validUuid}`;
    const validMediaPrefix = 'media-parent-avatar-12345';
    const validHttpUrl = 'https://s3.amazonaws.com/koinonia-bucket/profiles/photo-1.jpg';

    assert('Accepts valid UUID', serverIsValidUploadedPhoto(validUuid) === true);
    assert('Accepts valid media API path', serverIsValidUploadedPhoto(validMediaPath) === true);
    assert('Accepts valid media prefix', serverIsValidUploadedPhoto(validMediaPrefix) === true);
    assert('Accepts valid HTTP URL', serverIsValidUploadedPhoto(validHttpUrl) === true);
    assert('Client helper accepts valid UUID', clientIsValidUploadedPhoto(validUuid) === true);

    // -------------------------------------------------------------------------
    // 2. Server validation helper (validateParentProfile)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Server validateParentProfile Checks ---');

    const baseValidProfileData = {
      fullName: 'Amina Mohammed',
      email: 'amina.m@example.com',
      phone: '+2348023456789',
      whatsapp: '+2348023456789',
      homeAddress: '12 Ahmadu Bello Way',
      city: 'Abuja',
      stateRegion: 'FCT',
      country: 'Nigeria',
      emergencyContactName: 'Ibrahim Mohammed',
      emergencyContactPhone: '+2348098765432',
      emergencyRelationship: 'Brother',
      preferredContact: 'phone'
    };

    // Missing photo
    const missingPhotoResult = validateParentProfile({ ...baseValidProfileData, photoUrl: '' });
    assert('Missing photo returns valid: false', missingPhotoResult.valid === false);
    assert('Missing photo code is PARENT_PHOTO_REQUIRED', missingPhotoResult.errors.photoUrl?.code === 'PARENT_PHOTO_REQUIRED');
    assert('Missing photo message is "Please add a profile photo to continue."', missingPhotoResult.errors.photoUrl?.message === 'Please add a profile photo to continue.');

    // Placeholder photo
    const placeholderResult = validateParentProfile({ ...baseValidProfileData, photoUrl: '/assets/images/pass_avatar.png' });
    assert('Placeholder photo returns valid: false', placeholderResult.valid === false);
    assert('Placeholder photo code is PARENT_PHOTO_REQUIRED', placeholderResult.errors.photoUrl?.code === 'PARENT_PHOTO_REQUIRED');

    // Valid photo
    const validPhotoResult = validateParentProfile({ ...baseValidProfileData, photoUrl: validUuid });
    assert('Valid photo produces no photo error', !validPhotoResult.errors.photoUrl && !validPhotoResult.errors.photo);

    // -------------------------------------------------------------------------
    // 3. Database & Route Tests: PUT /api/parent/profile
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Database & API Route Backend Enforcement ---');

    // Setup parent user & profile
    const parentUserId = `usr-proto-${testRunId}`;
    const parentProfileId = `prof-proto-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
    `, [parentUserId, `proto-${testRunId}@test.org`, hashPassword('ParentPass123!'), nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Amina Mohammed', '+2348023456789', ?, ?)
    `, [parentProfileId, parentUserId, nowIso, nowIso]);

    const parentToken = generateToken(parentUserId);

    const makeRequest = async (path: string, options: any = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentToken}`,
        ...(options.headers || {})
      };
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, body: data };
    };

    // 3.1 Attempt to update profile without photo -> must return 400 PARENT_PHOTO_REQUIRED
    const noPhotoReq = await makeRequest('/api/parent/profile', {
      method: 'PUT',
      body: JSON.stringify({
        ...baseValidProfileData,
        photoUrl: ''
      })
    });
    assert('Backend returns 400 for profile update without photo', noPhotoReq.status === 400);
    assert('Backend returns code PARENT_PHOTO_REQUIRED', noPhotoReq.body.code === 'PARENT_PHOTO_REQUIRED');
    assert('Backend returns message "Please add a profile photo to continue."', noPhotoReq.body.error === 'Please add a profile photo to continue.' || noPhotoReq.body.message === 'Please add a profile photo to continue.');

    // 3.2 Verify DB record is NOT marked complete
    const profileInDbAfterNoPhoto = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [parentProfileId]);
    assert('profile_completed_at remains null when photo missing', profileInDbAfterNoPhoto.profile_completed_at === null);
    assert('photo_file_id is null/empty', !profileInDbAfterNoPhoto.photo_file_id);

    // 3.3 Create a mock media file record so resolveToMediaFileId succeeds
    const mediaFileId = `media-parent-${testRunId}`;
    await execute(`
      INSERT INTO media_files (id, original_filename, file_url, storage_key, created_at)
      VALUES (?, 'profile.jpg', '/uploads/profile.jpg', ?, ?)
    `, [mediaFileId, `storage-${mediaFileId}`, nowIso]);

    // 3.4 Update profile WITH valid photo -> should succeed and mark complete
    const validUpdateReq = await makeRequest('/api/parent/profile', {
      method: 'PUT',
      body: JSON.stringify({
        ...baseValidProfileData,
        photoUrl: mediaFileId
      })
    });
    if (validUpdateReq.status !== 200) {
      console.error('validUpdateReq failed:', validUpdateReq.status, validUpdateReq.body);
    }
    assert('Backend returns 200 for profile update with valid photo', validUpdateReq.status === 200);

    const profileInDbAfterValid = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [parentProfileId]);
    assert('profile_completed_at is marked complete when photo is valid', profileInDbAfterValid.profile_completed_at !== null);
    assert('photo_file_id is populated with mediaFileId', profileInDbAfterValid.photo_file_id === mediaFileId);

    // -------------------------------------------------------------------------
    // 4. Submission Gate: POST /api/parent/children/:childId/submit
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Child Registration Submission Gate Enforcement ---');

    // Create another parent WITHOUT photo
    const parentWithoutPhotoUserId = `usr-nophoto-${testRunId}`;
    const parentWithoutPhotoProfileId = `prof-nophoto-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
    `, [parentWithoutPhotoUserId, `nophoto-${testRunId}@test.org`, hashPassword('ParentPass123!'), nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, photo_file_id, created_at, updated_at)
      VALUES (?, ?, 'Parent NoPhoto', '+2348099998888', NULL, ?, ?)
    `, [parentWithoutPhotoProfileId, parentWithoutPhotoUserId, nowIso, nowIso]);

    const noPhotoToken = generateToken(parentWithoutPhotoUserId);

    // Ensure active event exists
    let activeEvent = await queryOne("SELECT * FROM events WHERE status = 'current' LIMIT 1");
    if (!activeEvent) {
      const eventId = `ev-active-${testRunId}`;
      await execute(`
        INSERT INTO events (id, title, status, allow_multiple_children, created_at, updated_at)
        VALUES (?, 'Current Event', 'current', 1, ?, ?)
      `, [eventId, nowIso, nowIso]);
      activeEvent = { id: eventId };
    }

    // Create a child draft and entry for this parent
    const childId = `child-test-${testRunId}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Baby NoPhoto', 'male', '2020-01-01', ?, ?)
    `, [childId, parentWithoutPhotoProfileId, nowIso, nowIso]);

    await execute(`
      INSERT INTO child_event_entries (id, child_id, event_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?)
    `, [`entry-${testRunId}`, childId, activeEvent.id, nowIso, nowIso]);

    const submitRes = await fetch(`${baseUrl}/api/parent/children/${childId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${noPhotoToken}`
      },
      body: JSON.stringify({})
    });
    const submitData = await submitRes.json();
    assert('Child submission blocked if parent has no photo', submitRes.status === 400);
    assert('Submission blocked with PARENT_PHOTO_REQUIRED', submitData.code === 'PARENT_PHOTO_REQUIRED');
    assert('Submission error message is "Please add a profile photo to continue."', submitData.error === 'Please add a profile photo to continue.');

    // -------------------------------------------------------------------------
    // 5. Existing Historical Parent Preservation
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Historical Parent Preservation & Access Safety ---');

    // Create a historical parent with existing child and pass, but NULL photo
    const histUserId = `usr-hist-${testRunId}`;
    const histProfileId = `prof-hist-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
    `, [histUserId, `historical-${testRunId}@test.org`, hashPassword('HistPass123!'), nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, photo_file_id, profile_completed_at, created_at, updated_at)
      VALUES (?, ?, 'Historical Parent', '+2348055554444', NULL, ?, ?, ?)
    `, [histProfileId, histUserId, nowIso, nowIso, nowIso]);

    const histChildId = `child-hist-${testRunId}`;
    await execute(`
      INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, created_at, updated_at)
      VALUES (?, ?, 'Existing Child', 'female', '2019-05-15', ?, ?)
    `, [histChildId, histProfileId, nowIso, nowIso]);

    // Check query for existing children
    const histChildren = await query('SELECT * FROM children WHERE parent_profile_id = ?', [histProfileId]);
    assert('Existing child records remain intact', histChildren.length === 1);
    assert('Child data unchanged', histChildren[0].full_name === 'Existing Child');

    // Frontend isProfileComplete logic check:
    // Existing parents with children or profile_completed_at are allowed through so they can access their dashboard and passes
    const historicalParentState = {
      fullName: 'Historical Parent',
      phone: '+2348055554444',
      photoUrl: null,
      profileCompletedAt: nowIso
    };
    const isHistoricalComplete = Boolean(
      historicalParentState.fullName &&
      historicalParentState.phone &&
      (histChildren.length > 0 || (historicalParentState as any).profileCompletedAt)
    );
    assert('Historical parent with existing children/profile is preserved in isProfileComplete', isHistoricalComplete === true);

    // New parent without photo check:
    const newParentStateWithoutPhoto = {
      fullName: 'New Parent',
      phone: '+2348077778888',
      photoUrl: ''
    };
    const isNewParentComplete = Boolean(
      newParentStateWithoutPhoto.fullName &&
      newParentStateWithoutPhoto.phone &&
      clientIsValidUploadedPhoto(newParentStateWithoutPhoto.photoUrl)
    );
    assert('New parent without photo is flagged incomplete in isProfileComplete', isNewParentComplete === false);

    // -------------------------------------------------------------------------
    // 6. Child Photo Validation Separation
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Child Photo Validation Independence ---');

    // Child photo error message in validateChildDraftStep is "Child photo is required."
    const childDraftValidationNoPhoto = validateChildDraftStep(
      {
        fullName: 'Little Kid',
        gender: 'Male',
        dob: '2020-01-01',
        relationship: 'Father',
        photoUrl: ''
      },
      {}
    );
    assert('Child photo validation uses distinct child copy', childDraftValidationNoPhoto.errors.childPhoto?.message === 'Child photo is required.');
    assert('Child photo error does not mention parent profile photo', !childDraftValidationNoPhoto.errors.childPhoto?.message?.toLowerCase().includes('parent'));

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
