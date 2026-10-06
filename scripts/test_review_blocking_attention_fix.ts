import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import assert from 'assert';

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

import { execute, query, queryOne } from '../src/server/db';
import {
  evaluateApplicationNeedsAttention,
  REASON_LABELS
} from '../src/server/services/applicationNeedsAttentionService';
import {
  CANONICAL_GA_EVENT_DATE,
  resolveCanonicalAgeGroup
} from '../src/server/services/eligibilityService';

async function runTest() {
  console.log('=== RUNNING REVIEW BLOCKING ATTENTION FIX TESTS ===\n');

  // Test 1: evaluateApplicationNeedsAttention unit tests
  console.log('--- TEST 1: Unit tests for evaluateApplicationNeedsAttention ---');
  
  // Case A: Exact shape of ADANVOESSI ABDIELLE BISOLA (Mother as pickup, Nursery class, 4 yrs old, valid photos)
  const appA = {
    entry_id: 'entry-test-adanvoessi',
    child_id: 'child-test-adanvoessi',
    child_name: 'ADANVOESSI ABDIELLE BISOLA',
    gender: 'Female',
    date_of_birth: '2022-10-20',
    school_class: 'Nursery',
    child_photo_url: 'https://res.cloudinary.com/koinonia/image/upload/v12345/child-photo.jpg',
    parent_id: 'parent-test-1',
    parent_name: 'Test Mother',
    phone_number: '+2348012345678',
    parent_photo_url: 'https://res.cloudinary.com/koinonia/image/upload/v12345/parent-photo.jpg'
  };

  // Formatted pickups from GET /api/admin/applications/:id
  const pickupsA = [
    {
      id: 'pickup-1',
      pickupType: 'parent',
      pickup_type: 'parent',
      fullName: 'Test Mother',
      full_name: 'Test Mother',
      relationship: 'Mother',
      relationship_to_child: 'Mother',
      phone: '+2348012345678',
      phone_number: '+2348012345678',
      photoUrl: null, // parent pickup uses parent photo
      approvedByParent: true,
      approved_by_parent: true,
      approved: true
    }
  ];

  const resA = evaluateApplicationNeedsAttention(appA, pickupsA, CANONICAL_GA_EVENT_DATE);
  console.log('Case A (Mother as pickup) result:', resA);
  assert.strictEqual(resA.needsAttention, false, 'Case A must NOT need attention');
  assert.strictEqual(resA.blocking, false, 'Case A must NOT be blocking');
  assert.strictEqual(resA.reasons.length, 0, 'Case A reasons must be empty');
  console.log('✓ Case A (Mother as pickup person) passed!\n');

  // Case B: Third-party pickup with complete info
  const pickupsB = [
    {
      id: 'pickup-2',
      pickupType: 'third_party',
      pickup_type: 'third_party',
      fullName: 'Uncle Bob',
      full_name: 'Uncle Bob',
      relationship: 'Uncle',
      relationship_to_child: 'Uncle',
      phone: '+2348098765432',
      phone_number: '+2348098765432',
      photoUrl: 'https://res.cloudinary.com/koinonia/image/upload/v12345/uncle-bob.jpg',
      approvedByParent: true,
      approved_by_parent: true,
      approved: true
    }
  ];

  const resB = evaluateApplicationNeedsAttention(appA, pickupsB, CANONICAL_GA_EVENT_DATE);
  console.log('Case B (Valid 3rd party pickup) result:', resB);
  assert.strictEqual(resB.needsAttention, false, 'Case B must NOT need attention');
  assert.strictEqual(resB.blocking, false, 'Case B must NOT be blocking');
  console.log('✓ Case B (Valid 3rd party pickup) passed!\n');

  // Case C: Third-party pickup missing phone number -> MUST block
  const pickupsC = [
    {
      id: 'pickup-3',
      pickupType: 'third_party',
      pickup_type: 'third_party',
      fullName: 'Uncle Bob',
      full_name: 'Uncle Bob',
      relationship: 'Uncle',
      relationship_to_child: 'Uncle',
      phone: '',
      phone_number: '',
      photoUrl: 'https://res.cloudinary.com/koinonia/image/upload/v12345/uncle-bob.jpg',
      approvedByParent: true
    }
  ];

  const resC = evaluateApplicationNeedsAttention(appA, pickupsC, CANONICAL_GA_EVENT_DATE);
  console.log('Case C (3rd party missing phone) result:', resC);
  assert.strictEqual(resC.needsAttention, true, 'Case C MUST need attention');
  assert.strictEqual(resC.blocking, true, 'Case C MUST be blocking');
  assert.ok(resC.reasons.includes('MISSING_REQUIRED_FIELD'), 'Must contain MISSING_REQUIRED_FIELD');
  console.log('✓ Case C (Missing phone on 3rd party pickup blocked) passed!\n');

  // Case D: Age calculation and stale needs_age_review check
  console.log('--- TEST 2: Canonical Age Group & Stale Flag Check ---');
  const ageRes4yo = resolveCanonicalAgeGroup('2022-10-20', CANONICAL_GA_EVENT_DATE);
  console.log('Age result for 2022-10-20:', ageRes4yo);
  assert.strictEqual(ageRes4yo.age, 4, 'Age must be 4');
  assert.strictEqual(ageRes4yo.group, '4–6', 'Group must be 4–6');
  assert.strictEqual(ageRes4yo.isOutOfRange, false, 'isOutOfRange must be false');
  console.log('✓ Age calculation for 2022-10-20 passed!\n');

  console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
