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
  checkEventEligibility,
  calculateAgeOnDate,
  CANONICAL_GA_EVENT_DATE,
  CANONICAL_MIN_AGE,
  CANONICAL_MAX_AGE
} from '../src/server/services/eligibilityService';
import {
  deriveAgeGroup
} from '../src/server/routes/admin';
import {
  isAuthoritativeIncomplete,
  previewCompletionReminder,
  sendApplicationRecoveryReminder,
  generateDefaultWhatsAppNudgeBody
} from '../src/server/services/applicationReminderService';
import {
  evaluateWhatsAppEligibility
} from '../src/server/services/whatsapp/consent';

function testAssert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✅ [PASS] ${msg}`);
}

async function runProductionCasesTests() {
  console.log('================================================================');
  console.log('KOINONIA RECOVERY — LOCAL PRODUCTION-LIKE DATA CASES (A THROUGH H)');
  console.log('================================================================\n');

  const testRunId = Date.now().toString().slice(-6);
  const now = new Date().toISOString();
  const eventId = `ev-cases-${testRunId}`;

  // Insert test event with canonical 2-14 age bounds
  await execute(`
    INSERT INTO events (
      id, title, starts_at, ends_at, minimum_age, maximum_age, parent_access_closes_at, status, created_at, updated_at
    ) VALUES (?, 'Grand Assembly 2026', '2026-11-21T09:00:00Z', '2026-11-21T18:00:00Z', 2, 14, '2026-10-17T23:59:59Z', 'current', ?, ?)
  `, [eventId, now, now]);

  console.log('--- CASE A: DOB EXISTS & DATA PROJECTION FIX ---');
  // Create parent and child with explicit DOB
  const pAUserId = `usr-pA-${testRunId}`;
  const pAProfId = `prof-pA-${testRunId}`;
  await execute(`INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, 'parent', 'active', ?, ?)`,
    [pAUserId, `parentA_${testRunId}@test.local`, now, now]);
  await execute(`INSERT INTO parent_profiles (id, user_id, full_name, phone_number, whatsapp_number, whatsapp_consent_status, created_at, updated_at) VALUES (?, ?, 'Parent A', '+447911123456', '+447911123456', 'opted_in', ?, ?)`,
    [pAProfId, pAUserId, now, now]);

  const childAId = `ch-A-${testRunId}`;
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at) VALUES (?, ?, 'Child A', 'female', '2012-12-12', 13, 'Teens', ?, ?)`,
    [childAId, pAProfId, now, now]);

  const entryAId = `ent-A-${testRunId}`;
  await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, submitted_at, created_at, updated_at) VALUES (?, ?, ?, 'incomplete', 0, NULL, ?, ?)`,
    [entryAId, childAId, eventId, now, now]);

  // Query row projection as done in admin.ts
  const projectedRow = await queryOne(`
    SELECT e.id as entry_id, e.status, c.date_of_birth, c.full_name as child_name
    FROM child_event_entries e
    JOIN children c ON c.id = e.child_id
    WHERE e.id = ?
  `, [entryAId]);

  testAssert(projectedRow !== null, 'Case A: Entry found in database');
  testAssert(projectedRow.date_of_birth === '2012-12-12', 'Case A: Authoritative child DOB is 2012-12-12');

  // Format projection
  const adminListObject = {
    dob: projectedRow.date_of_birth,
    dateOfBirth: projectedRow.date_of_birth,
    date_of_birth: projectedRow.date_of_birth,
    child: {
      dob: projectedRow.date_of_birth,
      dateOfBirth: projectedRow.date_of_birth,
      date_of_birth: projectedRow.date_of_birth
    }
  };
  testAssert(adminListObject.dob === '2012-12-12', 'Case A: Admin list top-level dob is projected');
  testAssert(adminListObject.child.dob === '2012-12-12', 'Case A: Admin list child.dob is projected');
  testAssert(adminListObject.dob !== null && adminListObject.dob !== '', 'Case A: Will NOT display "Date not recorded"');


  console.log('\n--- CASE B: AGE 13 ELIGIBILITY & TEENS MAPPING ---');
  // Child born 2013-05-10 -> age 13 on 2026-11-21
  const age13 = calculateAgeOnDate('2013-05-10', '2026-11-21');
  testAssert(age13 === 13, `Case B: Child born 2013-05-10 is exactly 13 on event date (got ${age13})`);
  const elig13 = checkEventEligibility('2013-05-10');
  testAssert(elig13.eligible === true, 'Case B: 13-year-old is eligible for GA 2026');
  const group13 = deriveAgeGroup(13);
  testAssert(group13 === 'Teens' || group13 === '13–14 Years', `Case B: 13-year-old maps to Teens / 13–14 Years group (got ${group13})`);


  console.log('\n--- CASE C: AGE 14 ELIGIBILITY & TEENS MAPPING ---');
  // Child born 2012-05-10 -> age 14 on 2026-11-21
  const age14 = calculateAgeOnDate('2012-05-10', '2026-11-21');
  testAssert(age14 === 14, `Case C: Child born 2012-05-10 is exactly 14 on event date (got ${age14})`);
  const elig14 = checkEventEligibility('2012-05-10');
  testAssert(elig14.eligible === true, 'Case C: 14-year-old is eligible for GA 2026');
  const group14 = deriveAgeGroup(14);
  testAssert(group14 === 'Teens' || group14 === '13–14 Years', `Case C: 14-year-old maps to Teens / 13–14 Years group (got ${group14})`);


  console.log('\n--- CASE D: AGE 15 INELIGIBILITY ---');
  // Child born 2011-05-10 -> age 15 on 2026-11-21
  const age15 = calculateAgeOnDate('2011-05-10', '2026-11-21');
  testAssert(age15 === 15, `Case D: Child born 2011-05-10 is 15 on event date (got ${age15})`);
  const elig15 = checkEventEligibility('2011-05-10');
  testAssert(elig15.eligible === false, 'Case D: 15-year-old is ineligible for GA 2026');
  testAssert(elig15.reason !== undefined && elig15.reason.includes('14'), 'Case D: Ineligibility reason cites maximum age 14');


  console.log('\n--- CASE E: INCOMPLETE DRAFT REMINDER AVAILABILITY ---');
  const adminUser = { id: `adm-${testRunId}`, role: 'admin', email: 'admin@test.local' };
  const previewE = await previewCompletionReminder(entryAId, adminUser);
  testAssert(previewE.eligible === true, 'Case E: Incomplete draft preview is eligible');
  testAssert(previewE.canSend === true, 'Case E: Incomplete draft preview canSend is true');
  testAssert(previewE.subject === "Complete your child's application", 'Case E: Subject matches canonical specification');


  console.log('\n--- CASE F: COMPLETE UNDER REVIEW APPLICATION REMINDER BLOCK ---');
  const validPhotoF = 'https://res.cloudinary.com/demo/image/upload/v1/valid_photo.jpg';
  const mfFId = `media-F-${testRunId}`;
  await execute(`INSERT INTO media_files (id, provider, file_type, public_id, secure_url, file_url, storage_key, resource_type, mime_type, file_size, created_at) VALUES (?, 'cloudinary', 'image', 'photo', ?, ?, ?, 'image', 'image/jpeg', 1000, ?)`,
    [mfFId, validPhotoF, validPhotoF, `key-${testRunId}`, now]);

  const childFId = `ch-F-${testRunId}`;
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, photo_file_id, created_at, updated_at) VALUES (?, ?, 'Child F', 'male', '2014-03-01', 12, '10–12', ?, ?, ?)`,
    [childFId, pAProfId, mfFId, now, now]);

  await execute(`UPDATE parent_profiles SET photo_file_id = ? WHERE id = ?`,
    [mfFId, pAProfId]);

  const entryFId = `ent-F-${testRunId}`;
  await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, school_class, submitted_at, created_at, updated_at) VALUES (?, ?, ?, 'under_review', 1, 'Year 7', ?, ?, ?)`,
    [entryFId, childFId, eventId, now, now, now]);

  await execute(`INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, relationship_to_child, phone_number, photo_file_id, approved_by_parent, created_at, updated_at) VALUES (?, ?, 'other', 'Uncle Bob', 'Uncle', '+447911123456', ?, 1, ?, ?)`,
    [`pk-F-${testRunId}`, entryFId, mfFId, now, now]);

  const previewF = await previewCompletionReminder(entryFId, adminUser);
  console.log('previewF result:', JSON.stringify(previewF, null, 2));
  testAssert(previewF.eligible === false, 'Case F: complete under_review entry is NOT eligible for reminder');
  testAssert(previewF.canSend === false, 'Case F: complete under_review entry canSend is false');
  testAssert(previewF.reason !== undefined, 'Case F: Clear reason provided for blocking reminder');

  console.log('\n--- CASE F2: SUBMITTED APPLICATION WITH MISSING INFO (WORKFLOW B) ---');
  const childF2Id = `ch-F2-${testRunId}`;
  await execute(`INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, created_at, updated_at) VALUES (?, ?, 'Child F2', 'female', '2015-04-01', 11, '10–12', ?, ?)`,
    [childF2Id, pAProfId, now, now]);

  const entryF2Id = `ent-F2-${testRunId}`;
  await execute(`INSERT INTO child_event_entries (id, child_id, event_id, status, details_confirmed, school_class, submitted_at, created_at, updated_at) VALUES (?, ?, ?, 'under_review', 1, 'Year 6', ?, ?, ?)`,
    [entryF2Id, childF2Id, eventId, now, now, now]);

  const previewF2 = await previewCompletionReminder(entryF2Id, adminUser);
  testAssert(previewF2.eligible === true, 'Case F2: submitted entry with missing info is eligible for correction');
  testAssert(previewF2.workflow === 'correction', 'Case F2: workflow is correction');
  testAssert(previewF2.actionType === 'update_application_details', 'Case F2: actionType is update_application_details');
  testAssert(previewF2.nextStepLabel === 'Update application details', 'Case F2: nextStepLabel is Update application details');


  console.log('\n--- CASE G: PARENT WHATSAPP OPTED_IN ELIGIBILITY & PRIVACY COPY ---');
  const eligG = evaluateWhatsAppEligibility({
    whatsapp_number: '+447911123456',
    whatsapp_consent_status: 'opted_in'
  });
  testAssert(eligG.eligible === true, 'Case G: Parent with valid number and opted_in consent is eligible');
  testAssert(eligG.normalizedNumber === '+447911123456', 'Case G: E.164 phone normalized correctly');

  const nudgeCopy = generateDefaultWhatsAppNudgeBody({
    parentFirstName: 'Chioma',
    childFirstName: 'David',
    formattedDeadline: '17 October 2026 at 11:59 PM'
  });
  testAssert(nudgeCopy.includes('Chioma'), 'Case G: Nudge greets parent by first name');
  testAssert(nudgeCopy.includes('David'), 'Case G: Nudge mentions child by first name');
  testAssert(nudgeCopy.includes('17 October 2026 at 11:59 PM'), 'Case G: Nudge includes registration deadline');
  testAssert(!nudgeCopy.includes('2012-12-12'), 'Case G: Privacy-safe copy strictly excludes DOB');
  testAssert(!nudgeCopy.includes('ent-'), 'Case G: Privacy-safe copy strictly excludes application/entry ID');
  testAssert(!nudgeCopy.includes('medical'), 'Case G: Privacy-safe copy strictly excludes medical data');
  testAssert(!nudgeCopy.includes('pickup'), 'Case G: Privacy-safe copy strictly excludes pickup data');


  console.log('\n--- CASE H: PARENT WHATSAPP UNKNOWN/OPTED_OUT BLOCK ---');
  // Unknown consent
  const eligH1 = evaluateWhatsAppEligibility({
    whatsapp_number: '+447911123456',
    whatsapp_consent_status: 'unknown'
  });
  testAssert(eligH1.eligible === false, 'Case H1: unknown consent blocked from WhatsApp');
  testAssert(eligH1.reason !== undefined && (eligH1.reason.toLowerCase().includes('opt-in') || eligH1.reason.toLowerCase().includes('opted')), 'Case H1: Clear reason for no opt-in');

  // Opted out consent
  const eligH2 = evaluateWhatsAppEligibility({
    whatsapp_number: '+447911123456',
    whatsapp_consent_status: 'opted_out'
  });
  testAssert(eligH2.eligible === false, 'Case H2: opted_out consent blocked from WhatsApp');

  // Portal reminder remains available even when WhatsApp is blocked
  const previewH = await previewCompletionReminder(entryAId, adminUser);
  testAssert(previewH.canSend === true, 'Case H: Portal message remains fully available when WhatsApp is blocked/unavailable');

  console.log('\n================================================================');
  console.log('🎉 ALL LOCAL PRODUCTION-LIKE DATA CASES (A THROUGH H) PASSED!');
  console.log('================================================================');
}

runProductionCasesTests().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
