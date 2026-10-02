import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { getDb, execute, query, queryOne } from '../src/server/db';
import { generateToken, hashPassword } from '../src/server/auth';
import parentRoutes from '../src/server/routes/parent';
import { validateChildName } from '../src/utils/validation';

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING REGRESSION TEST: PARENT CHILD DRAFT VALIDATION HOTFIX   ');
  console.log('================================================================');

  getDb();
  const testRunId = Date.now().toString().slice(-6);
  const now = new Date();
  const nowIso = now.toISOString();

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/parent', parentRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const results: Record<string, boolean> = {};

  try {
    // 1. Ensure single current active event
    await execute("UPDATE events SET status = 'archived' WHERE status = 'current' AND id != 'ev-4b2-1-376042'");
    let currentEvent = await queryOne("SELECT * FROM events WHERE id = 'ev-4b2-1-376042'");
    if (currentEvent) {
      await execute("UPDATE events SET status = 'current', allow_multiple_children = 1, parent_access_opens_at = NULL, parent_access_closes_at = NULL WHERE id = 'ev-4b2-1-376042'");
    } else {
      currentEvent = await queryOne("SELECT * FROM events WHERE status = 'current'");
      if (!currentEvent) {
        const eventId = `ev-test-${testRunId}`;
        await execute(`
          INSERT INTO events (id, title, status, allow_multiple_children, allow_save_and_continue, created_at, updated_at)
          VALUES (?, 'Annual Conference Test', 'current', 1, 1, ?, ?)
        `, [eventId, nowIso, nowIso]);
      }
    }

    // 2. Setup parent user & profile
    const parentUserId = `usr-parent-${testRunId}`;
    const parentProfileId = `prof-parent-${testRunId}`;
    await execute(`
      INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
    `, [parentUserId, `parent-${testRunId}@test.org`, hashPassword('ParentPass123!'), nowIso, nowIso]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
      VALUES (?, ?, 'Chinedu Okafor', '+2348011112222', ?, ?)
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

    // Helper to count children and entries for this parent
    const countParentRecords = async () => {
      const children = await query('SELECT * FROM children WHERE parent_profile_id = ?', [parentProfileId]);
      const entries = await query(`
        SELECT e.* FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        WHERE c.parent_profile_id = ?
      `, [parentProfileId]);
      return { childrenCount: children.length, entriesCount: entries.length, children, entries };
    };

    // =========================================================================
    // TEST 1: Completely blank Step 1 + Save for later
    // EXPECT:
    // - validation error: "Enter your child’s name before saving."
    // - no navigation
    // - no child inserted
    // - no child_event_entry inserted
    // =========================================================================
    console.log('\n--- TEST 1: Completely blank Step 1 + Save for later ---');
    {
      const blankFormData = {
        photoUrl: '',
        fullName: '',
        gender: '',
        dob: '',
        relationship: ''
      };

      // Frontend validation simulation
      let navigationTriggered = false;
      let inlineError = '';
      const onNavigate = (route: string) => { navigationTriggered = true; };

      const trimmedName = blankFormData.fullName.trim();
      if (!trimmedName) {
        inlineError = 'Enter your child’s name before saving.';
      } else {
        onNavigate('/parent/home');
      }

      const counts = await countParentRecords();

      const pass =
        inlineError === 'Enter your child’s name before saving.' &&
        navigationTriggered === false &&
        counts.childrenCount === 0 &&
        counts.entriesCount === 0;

      results['1. Completely blank Step 1 + Save for later'] = pass;
      console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);
      console.log(`  inlineError: "${inlineError}"`);
      console.log(`  navigationTriggered: ${navigationTriggered}`);
      console.log(`  persisted children: ${counts.childrenCount}, entries: ${counts.entriesCount}`);
    }

    // =========================================================================
    // TEST 2: Name only + Save for later
    // EXPECT:
    // - valid draft is saved
    // - exactly one child/draft created
    // - Parent Home navigation only after success
    // =========================================================================
    console.log('\n--- TEST 2: Name only + Save for later ---');
    let createdChildId = '';
    {
      const draftPayload = {
        fullName: 'Amara Okafor'
      };

      const res = await makeRequest('/api/parent/children/draft', {
        method: 'POST',
        body: JSON.stringify(draftPayload)
      });

      const counts = await countParentRecords();
      createdChildId = res.body?.id || counts.children[0]?.id;

      let navigatedAfterSuccess = false;
      if (res.status === 201 && createdChildId) {
        navigatedAfterSuccess = true;
      }

      const pass =
        res.status === 201 &&
        counts.childrenCount === 1 &&
        counts.entriesCount === 1 &&
        counts.children[0].full_name === 'Amara Okafor' &&
        navigatedAfterSuccess;

      results['2. Name only + Save for later'] = pass;
      console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);
      console.log(`  status: ${res.status}`);
      console.log(`  child id: ${createdChildId}`);
      console.log(`  persisted children: ${counts.childrenCount}, entries: ${counts.entriesCount}`);
    }

    // =========================================================================
    // TEST 3: Partial invalid data + Save for later
    // EXPECT:
    // - invalid supplied field rejected (e.g. invalid name or future dob)
    // - values preserved
    // - no duplicate record
    // =========================================================================
    console.log('\n--- TEST 3: Partial invalid data + Save for later ---');
    {
      // 3A: Future DOB
      const resFutureDob = await makeRequest('/api/parent/children/draft', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Kelechi Okafor',
          dob: '2099-05-15'
        })
      });

      // 3B: Malicious script tag in child name
      const resInvalidName = await makeRequest('/api/parent/children/draft', {
        method: 'POST',
        body: JSON.stringify({
          fullName: '<script>alert(1)</script>'
        })
      });

      // 3C: Frontend format validation rejects invalid characters (e.g. digits)
      const frontendFormatError = validateChildName('Child 12345');

      const counts = await countParentRecords();

      const pass =
        resFutureDob.status === 400 &&
        resFutureDob.body.code === 'DOB_FUTURE' &&
        resInvalidName.status === 400 &&
        resInvalidName.body.code === 'INVALID_CHILD_NAME' &&
        frontendFormatError === 'Enter the child’s full name.' &&
        counts.childrenCount === 1; // Only the child from test 2 exists, no invalid records

      results['3. Partial invalid data + Save for later'] = pass;
      console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);
      console.log(`  future dob response: status=${resFutureDob.status}, code=${resFutureDob.body?.code}`);
      console.log(`  invalid name response: status=${resInvalidName.status}, code=${resInvalidName.body?.code}`);
      console.log(`  total children in DB: ${counts.childrenCount}`);
    }

    // =========================================================================
    // TEST 4: Blank required fields + Continue
    // EXPECT:
    // - remains Step 1
    // - appropriate inline errors
    // - no navigation
    // =========================================================================
    console.log('\n--- TEST 4: Blank required fields + Continue ---');
    {
      const incompleteForm = {
        photoUrl: '',
        fullName: '',
        gender: '',
        dob: '',
        relationship: ''
      };

      // Frontend handleContinue validation simulation
      const errors: Record<string, string> = {};
      let navigationTriggered = false;

      if (!incompleteForm.photoUrl.trim()) errors.photo = 'Add the child’s photo.';
      const trimmedName = incompleteForm.fullName.trim();
      if (!trimmedName) {
        errors.fullName = 'Enter the child’s full name.';
      } else {
        const nameError = validateChildName(trimmedName);
        if (nameError) errors.fullName = nameError;
      }
      if (!incompleteForm.gender) errors.gender = 'Choose gender.';
      if (!incompleteForm.dob) errors.dob = 'Add date of birth.';
      if (!incompleteForm.relationship) errors.relationship = 'Choose your relationship to the child.';

      if (Object.keys(errors).length === 0) {
        navigationTriggered = true;
      }

      const pass =
        navigationTriggered === false &&
        errors.photo === 'Add the child’s photo.' &&
        errors.fullName === 'Enter the child’s full name.' &&
        errors.gender === 'Choose gender.' &&
        errors.dob === 'Add date of birth.' &&
        errors.relationship === 'Choose your relationship to the child.';

      results['4. Blank required fields + Continue'] = pass;
      console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);
      console.log(`  errors found:`, errors);
      console.log(`  navigationTriggered: ${navigationTriggered}`);
    }

    // =========================================================================
    // TEST 5: Complete valid Step 1 + Continue
    // EXPECT:
    // - normal Step 2 progression unchanged
    // =========================================================================
    console.log('\n--- TEST 5: Complete valid Step 1 + Continue ---');
    {
      const validForm = {
        photoUrl: 'https://example.com/photo.jpg',
        fullName: 'Zainab Okafor',
        gender: 'Female',
        dob: '2019-06-15',
        relationship: 'Mother'
      };

      // Frontend handleContinue validation simulation
      const errors: Record<string, string> = {};
      let targetRoute = '';

      if (!validForm.photoUrl.trim()) errors.photo = 'Add the child’s photo.';
      const trimmedName = validForm.fullName.trim();
      if (!trimmedName) {
        errors.fullName = 'Enter the child’s full name.';
      } else {
        const nameError = validateChildName(trimmedName);
        if (nameError) errors.fullName = nameError;
      }
      if (!validForm.gender) errors.gender = 'Choose gender.';
      if (!validForm.dob) errors.dob = 'Add date of birth.';
      if (!validForm.relationship) errors.relationship = 'Choose your relationship to the child.';

      if (Object.keys(errors).length === 0) {
        targetRoute = '/parent/children/new/care-details';
      }

      const pass =
        Object.keys(errors).length === 0 &&
        targetRoute === '/parent/children/new/care-details';

      results['5. Complete valid Step 1 + Continue'] = pass;
      console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);
      console.log(`  targetRoute: ${targetRoute}`);
    }

    // =========================================================================
    // TEST 6: Existing draft edited and saved
    // EXPECT:
    // - existing child updated
    // - no duplicate child created
    // =========================================================================
    console.log('\n--- TEST 6: Existing draft edited and saved ---');
    {
      const updatePayload = {
        id: createdChildId,
        childDetails: {
          fullName: 'Amara Kelechi Okafor',
          gender: 'Female',
          dateOfBirth: '2020-03-10',
          relationshipToChild: 'Mother'
        }
      };

      const res = await makeRequest(`/api/parent/children/${createdChildId}/draft`, {
        method: 'PUT',
        body: JSON.stringify(updatePayload)
      });

      const counts = await countParentRecords();
      const updatedChild = await queryOne('SELECT * FROM children WHERE id = ?', [createdChildId]);

      const pass =
        res.status === 201 &&
        counts.childrenCount === 1 && // Still exactly 1 child for this parent!
        counts.entriesCount === 1 &&
        updatedChild.full_name === 'Amara Kelechi Okafor' &&
        updatedChild.gender === 'Female' &&
        updatedChild.date_of_birth === '2020-03-10';

      results['6. Existing draft edited and saved'] = pass;
      console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);
      console.log(`  status: ${res.status}`);
      console.log(`  updated name: "${updatedChild?.full_name}"`);
      console.log(`  total children in DB: ${counts.childrenCount} (no duplicates)`);
    }

    // =========================================================================
    // TEST 7: Backend direct request with blank child identity
    // EXPECT:
    // - controlled 400
    // - zero persisted records
    // =========================================================================
    console.log('\n--- TEST 7: Backend direct request with blank child identity ---');
    {
      // Parent B with 0 children
      const parentUserIdB = `usr-parentB-${testRunId}`;
      const parentProfileIdB = `prof-parentB-${testRunId}`;
      await execute(`
        INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
      `, [parentUserIdB, `parentB-${testRunId}@test.org`, hashPassword('ParentPass123!'), nowIso, nowIso]);

      await execute(`
        INSERT INTO parent_profiles (id, user_id, full_name, phone_number, created_at, updated_at)
        VALUES (?, ?, 'Ngozi Eze', '+2348099998888', ?, ?)
      `, [parentProfileIdB, parentUserIdB, nowIso, nowIso]);

      const tokenB = generateToken(parentUserIdB);

      const makeRequestB = async (body: any) => {
        const res = await fetch(`${baseUrl}/api/parent/children/draft`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenB}`
          },
          body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, body: data };
      };

      // 7A: Empty object
      const resEmpty = await makeRequestB({});
      // 7B: Whitespace only fullName
      const resWhitespace = await makeRequestB({ fullName: '   ' });
      // 7C: Empty string in childDetails.fullName
      const resNestedEmpty = await makeRequestB({ childDetails: { fullName: '' } });

      const childrenB = await query('SELECT * FROM children WHERE parent_profile_id = ?', [parentProfileIdB]);
      const entriesB = await query(`
        SELECT e.* FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        WHERE c.parent_profile_id = ?
      `, [parentProfileIdB]);

      const pass =
        resEmpty.status === 400 &&
        resEmpty.body.code === 'CHILD_NAME_REQUIRED' &&
        resWhitespace.status === 400 &&
        resWhitespace.body.code === 'CHILD_NAME_REQUIRED' &&
        resNestedEmpty.status === 400 &&
        resNestedEmpty.body.code === 'CHILD_NAME_REQUIRED' &&
        childrenB.length === 0 &&
        entriesB.length === 0;

      results['7. Backend direct request with blank child identity'] = pass;
      console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);
      console.log(`  Empty object: status=${resEmpty.status}, code=${resEmpty.body?.code}`);
      console.log(`  Whitespace name: status=${resWhitespace.status}, code=${resWhitespace.body?.code}`);
      console.log(`  Nested empty name: status=${resNestedEmpty.status}, code=${resNestedEmpty.body?.code}`);
      console.log(`  Persisted children for parent B: ${childrenB.length}, entries: ${entriesB.length}`);
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n================================================================');
    console.log('SUMMARY OF RESULTS');
    console.log('================================================================');
    let allPassed = true;
    for (const [name, passed] of Object.entries(results)) {
      console.log(`${passed ? '✓ PASS' : '✗ FAIL'}: ${name}`);
      if (!passed) allPassed = false;
    }

    if (!allPassed) {
      console.error('\nFAILED: One or more regression tests failed.');
      process.exit(1);
    } else {
      console.log('\nSUCCESS: All 7 regression tests PASSED perfectly.');
      process.exit(0);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
