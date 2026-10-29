import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { hashPassword, verifyPassword } from '../src/server/auth';

console.log('==================================================');
console.log('1. CONFIRM LOCAL SQLITE');
console.log('==================================================');

const dbUrl = process.env.DATABASE_URL;
if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
  console.error('STOP: DATABASE_URL points to PostgreSQL/Neon. Refusing to run on production database.');
  process.exit(1);
}

const dbPath = path.join(process.cwd(), 'data', 'koinonia-dev.sqlite');
if (!fs.existsSync(dbPath)) {
  console.error(`STOP: SQLite database file not found at ${dbPath}`);
  process.exit(1);
}

console.log('Active DB: SQLite local development');
console.log('SQLite path:', dbPath);
console.log('Production touched: NO');

// Open database with timeout for concurrent development server access
const db = new Database(dbPath, { timeout: 15000 });
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 15000');

console.log('\n==================================================');
console.log('2. RESOLVE CURRENT LOCAL EVENT');
console.log('==================================================');

let event = db.prepare("SELECT * FROM events WHERE status = 'current'").get() as any;
if (!event) {
  event = db.prepare("SELECT * FROM events WHERE id = 'event-ga-2026'").get() as any;
}
if (!event) {
  event = db.prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT 1").get() as any;
}

if (!event) {
  console.error('STOP: No local event found in database.');
  process.exit(1);
}

console.log(`Current Event: ${event.title} (ID: ${event.id}, Status: ${event.status})`);

const now = new Date().toISOString();

console.log('\n==================================================');
console.log('3. CREATE / UPSERT LOCAL PARENT ACCOUNT');
console.log('==================================================');

const parentEmail = 'parent@koinonia.local';
const parentPassword = 'KoinoniaParent2026!';
const parentPasswordHash = hashPassword(parentPassword);

let parentUser = db.prepare('SELECT * FROM users WHERE email = ?').get(parentEmail) as any;
let parentUserId: string;

if (parentUser) {
  parentUserId = parentUser.id;
  db.prepare(`
    UPDATE users
    SET password_hash = ?, role = 'parent', status = 'active', email_verified = 1, updated_at = ?
    WHERE id = ?
  `).run(parentPasswordHash, now, parentUserId);
  console.log(`Updated existing parent user: ${parentEmail} (ID: ${parentUserId})`);
} else {
  parentUserId = 'user-local-parent-2026';
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'parent', 'active', 1, ?, ?)
  `).run(parentUserId, parentEmail, parentPasswordHash, now, now);
  console.log(`Created parent user: ${parentEmail} (ID: ${parentUserId})`);
}

// Upsert parent_profile
let parentProfile = db.prepare('SELECT * FROM parent_profiles WHERE user_id = ?').get(parentUserId) as any;
let parentProfileId: string;

if (parentProfile) {
  parentProfileId = parentProfile.id;
  db.prepare(`
    UPDATE parent_profiles
    SET full_name = ?, phone_number = ?, whatsapp_number = ?, email = ?,
        home_address = ?, preferred_contact = 'WhatsApp',
        profile_completed_at = COALESCE(profile_completed_at, ?),
        country = 'Nigeria', state_region = 'Lagos', city = 'Lagos',
        updated_at = ?
    WHERE id = ?
  `).run('Grace Omikunle', '08012345678', '08012345678', parentEmail, '12 Victoria Island, Lagos', now, now, parentProfileId);
  console.log(`Updated parent profile: Grace Omikunle (ID: ${parentProfileId})`);
} else {
  parentProfileId = 'profile-local-parent-2026';
  db.prepare(`
    INSERT INTO parent_profiles (
      id, user_id, full_name, phone_number, whatsapp_number, email,
      home_address, preferred_contact, is_koinonia_worker,
      photo_file_id, profile_completed_at, country, state_region, city,
      whatsapp_consent_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'WhatsApp', 0, 'photo-parent-default', ?, 'Nigeria', 'Lagos', 'Lagos', 'opted_in', ?, ?)
  `).run(parentProfileId, parentUserId, 'Grace Omikunle', '08012345678', '08012345678', parentEmail, '12 Victoria Island, Lagos', now, now, now);
  console.log(`Created parent profile: Grace Omikunle (ID: ${parentProfileId})`);
}

console.log('\n==================================================');
console.log('4. SEED TWO CHILDREN (Daniel & Esther Omikunle)');
console.log('==================================================');

// Child 1: Daniel Omikunle (Age 8, eligible for TGA 2026)
let childDaniel = db.prepare('SELECT * FROM children WHERE parent_profile_id = ? AND full_name = ?').get(parentProfileId, 'Daniel Omikunle') as any;
let danielId: string;

if (childDaniel) {
  danielId = childDaniel.id;
  db.prepare(`
    UPDATE children
    SET gender = 'Male', date_of_birth = '2018-05-15', calculated_age = 8,
        age_group = 'Ages 7 to 9', relationship_to_child = 'Mother',
        photo_file_id = COALESCE(photo_file_id, 'photo-child-default'), updated_at = ?
    WHERE id = ?
  `).run(now, danielId);
  console.log(`Updated Child 1: Daniel Omikunle (ID: ${danielId})`);
} else {
  danielId = 'child-local-daniel-2026';
  db.prepare(`
    INSERT INTO children (
      id, parent_profile_id, full_name, gender, date_of_birth,
      calculated_age, age_group, relationship_to_child, photo_file_id,
      needs_age_review, created_at, updated_at
    ) VALUES (?, ?, 'Daniel Omikunle', 'Male', '2018-05-15', 8, 'Ages 7 to 9', 'Mother', 'photo-child-default', 0, ?, ?)
  `).run(danielId, parentProfileId, now, now);
  console.log(`Created Child 1: Daniel Omikunle (ID: ${danielId})`);
}

// Child 2: Esther Omikunle (Age 5, eligible for TGA 2026)
let childEsther = db.prepare('SELECT * FROM children WHERE parent_profile_id = ? AND full_name = ?').get(parentProfileId, 'Esther Omikunle') as any;
let estherId: string;

if (childEsther) {
  estherId = childEsther.id;
  db.prepare(`
    UPDATE children
    SET gender = 'Female', date_of_birth = '2021-03-20', calculated_age = 5,
        age_group = 'Ages 4 to 6', relationship_to_child = 'Mother',
        photo_file_id = COALESCE(photo_file_id, 'photo-child-default'), updated_at = ?
    WHERE id = ?
  `).run(now, estherId);
  console.log(`Updated Child 2: Esther Omikunle (ID: ${estherId})`);
} else {
  estherId = 'child-local-esther-2026';
  db.prepare(`
    INSERT INTO children (
      id, parent_profile_id, full_name, gender, date_of_birth,
      calculated_age, age_group, relationship_to_child, photo_file_id,
      needs_age_review, created_at, updated_at
    ) VALUES (?, ?, 'Esther Omikunle', 'Female', '2021-03-20', 5, 'Ages 4 to 6', 'Mother', 'photo-child-default', 0, ?, ?)
  `).run(estherId, parentProfileId, now, now);
  console.log(`Created Child 2: Esther Omikunle (ID: ${estherId})`);
}

// Seed current-event entry for Daniel Omikunle
let danielEntry = db.prepare('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?').get(danielId, event.id) as any;
let danielEntryId: string;

if (danielEntry) {
  danielEntryId = danielEntry.id;
  db.prepare(`
    UPDATE child_event_entries
    SET status = 'pass_ready', details_confirmed = 1, information_confirmed = 1, updated_at = ?
    WHERE id = ?
  `).run(now, danielEntryId);
} else {
  danielEntryId = 'entry-local-daniel-2026';
  db.prepare(`
    INSERT INTO child_event_entries (
      id, child_id, event_id, status, details_confirmed, information_confirmed,
      has_medical_notes, needs_extra_support, submitted_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'pass_ready', 1, 1, 0, 0, ?, ?, ?)
  `).run(danielEntryId, danielId, event.id, now, now, now);
}
console.log(`Current Event Entry (Daniel): ID ${danielEntryId} (Status: pass_ready)`);

// Seed canonical event pass for Daniel Omikunle (using the real format: KOI-2026-XXXXXX)
let danielPass = db.prepare('SELECT * FROM event_passes WHERE child_event_entry_id = ? AND status = ?').get(danielEntryId, 'active') as any;
let passRef: string;

if (danielPass) {
  passRef = danielPass.pass_reference;
  console.log(`Existing Pass for Daniel: Reference ${passRef}`);
} else {
  const passId = `pass-local-${crypto.randomBytes(6).toString('hex')}`;
  passRef = `KOI-2026-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const passHash = crypto.randomBytes(16).toString('hex');

  db.prepare(`
    INSERT INTO event_passes (
      id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(passId, danielEntryId, passRef, passHash, now, now, now);
  console.log(`Issued Real Pass for Daniel: Reference ${passRef}`);
}

// Seed current-event entry for Esther Omikunle (registered / under review for sibling testing)
let estherEntry = db.prepare('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?').get(estherId, event.id) as any;
let estherEntryId: string;

if (estherEntry) {
  estherEntryId = estherEntry.id;
  console.log(`Existing Entry for Esther: ID ${estherEntryId} (Status: ${estherEntry.status})`);
} else {
  estherEntryId = 'entry-local-esther-2026';
  db.prepare(`
    INSERT INTO child_event_entries (
      id, child_id, event_id, status, details_confirmed, information_confirmed,
      has_medical_notes, needs_extra_support, submitted_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'under_review', 1, 1, 0, 0, ?, ?, ?)
  `).run(estherEntryId, estherId, event.id, now, now, now);
  console.log(`Created Current Event Entry (Esther): ID ${estherEntryId} (Status: under_review)`);
}

console.log('\n==================================================');
console.log('5. CREATE / UPSERT LOCAL VOLUNTEER ACCOUNT');
console.log('==================================================');

const volunteerEmail = 'volunteer@koinonia.local';
const volunteerPassword = 'KoinoniaVolunteer2026!';
const volunteerPasswordHash = hashPassword(volunteerPassword);

let volunteerUser = db.prepare('SELECT * FROM users WHERE email = ?').get(volunteerEmail) as any;
let volunteerUserId: string;

if (volunteerUser) {
  volunteerUserId = volunteerUser.id;
  db.prepare(`
    UPDATE users
    SET password_hash = ?, role = 'volunteer', status = 'active', email_verified = 1, updated_at = ?
    WHERE id = ?
  `).run(volunteerPasswordHash, now, volunteerUserId);
  console.log(`Updated existing volunteer user: ${volunteerEmail} (ID: ${volunteerUserId})`);
} else {
  volunteerUserId = 'user-local-volunteer-2026';
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'volunteer', 'active', 1, ?, ?)
  `).run(volunteerUserId, volunteerEmail, volunteerPasswordHash, now, now);
  console.log(`Created volunteer user: ${volunteerEmail} (ID: ${volunteerUserId})`);
}

// Upsert volunteer_profiles
let volunteerProfile = db.prepare('SELECT * FROM volunteer_profiles WHERE user_id = ?').get(volunteerUserId) as any;
let volunteerProfileId: string;

if (volunteerProfile) {
  volunteerProfileId = volunteerProfile.id;
  db.prepare(`
    UPDATE volunteer_profiles
    SET full_name = ?, phone = ?, whatsapp = ?, preferred_team = 'Check-in & Welcome',
        status = 'approved', is_koinonia_worker = 0, serving_experience = 1, updated_at = ?
    WHERE id = ?
  `).run('Test Volunteer', '08098765432', '08098765432', now, volunteerProfileId);
  console.log(`Updated volunteer profile: Test Volunteer (ID: ${volunteerProfileId}, Status: approved)`);
} else {
  volunteerProfileId = 'profile-local-volunteer-2026';
  db.prepare(`
    INSERT INTO volunteer_profiles (
      id, user_id, photo_file_id, full_name, phone, whatsapp,
      is_koinonia_worker, department, preferred_team, serving_experience,
      note, status, whatsapp_consent_status, created_at, updated_at
    ) VALUES (?, ?, 'photo-volunteer-default', 'Test Volunteer', '08098765432', '08098765432', 0, NULL, 'Check-in & Welcome', 1, 'Local check-in volunteer test account', 'approved', 'opted_in', ?, ?)
  `).run(volunteerProfileId, volunteerUserId, now, now);
  console.log(`Created volunteer profile: Test Volunteer (ID: ${volunteerProfileId}, Status: approved)`);
}

// Assign volunteer to current event as ordinary check-in volunteer (team_key: 'check_in', responsibility_key: 'check_in_volunteer')
let existingAssignment = db.prepare('SELECT * FROM event_duty_assignments WHERE user_id = ? AND event_id = ?').get(volunteerUserId, event.id) as any;

if (existingAssignment) {
  db.prepare(`
    UPDATE event_duty_assignments
    SET team_key = 'check_in', responsibility_key = 'check_in_volunteer',
        assignment_level = 'primary', status = 'scheduled', updated_at = ?
    WHERE id = ?
  `).run(now, existingAssignment.id);
  console.log(`Updated duty assignment for volunteer: ID ${existingAssignment.id} (Team: check_in, Responsibility: check_in_volunteer)`);
} else {
  const assignmentId = 'duty-local-volunteer-2026';
  db.prepare(`
    INSERT INTO event_duty_assignments (
      id, event_id, user_id, responsibility_key, team_key,
      assignment_level, status, starts_at, ends_at, note, assigned_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'check_in_volunteer', 'check_in', 'primary', 'scheduled', ?, ?, 'Seeded ordinary check-in volunteer', ?, ?, ?)
  `).run(assignmentId, event.id, volunteerUserId, event.starts_at || now, event.ends_at || now, parentUserId, now, now);
  console.log(`Created duty assignment for volunteer: ID ${assignmentId} (Team: check_in, Responsibility: check_in_volunteer)`);
}

console.log('\n==================================================');
console.log('6. VERIFY DIRECT LOGIN ROWS');
console.log('==================================================');

const finalParent = db.prepare('SELECT id, email, role, status, email_verified, password_hash FROM users WHERE email = ?').get(parentEmail) as any;
const parentPasswordValid = verifyPassword(parentPassword, finalParent.password_hash);
console.log(`Parent User Check:`);
console.log(`  - Exists: ${Boolean(finalParent)}`);
console.log(`  - Email: ${finalParent.email}`);
console.log(`  - Role: ${finalParent.role}`);
console.log(`  - Status: ${finalParent.status}`);
console.log(`  - Verified: ${finalParent.email_verified}`);
console.log(`  - Password Validates: ${parentPasswordValid}`);

const finalChildren = db.prepare('SELECT id, full_name, calculated_age, date_of_birth FROM children WHERE parent_profile_id = ?').all(parentProfileId) as any[];
console.log(`Seeded Children (${finalChildren.length}):`);
finalChildren.forEach(c => console.log(`  - ${c.full_name} (Age: ${c.calculated_age}, DOB: ${c.date_of_birth})`));

const finalPass = db.prepare('SELECT pass_reference, status, issued_at FROM event_passes WHERE child_event_entry_id = ?').get(danielEntryId) as any;
console.log(`Daniel Pass Reference: ${finalPass?.pass_reference} (Status: ${finalPass?.status})`);

const finalVolunteer = db.prepare('SELECT id, email, role, status, email_verified, password_hash FROM users WHERE email = ?').get(volunteerEmail) as any;
const volunteerPasswordValid = verifyPassword(volunteerPassword, finalVolunteer.password_hash);
console.log(`\nVolunteer User Check:`);
console.log(`  - Exists: ${Boolean(finalVolunteer)}`);
console.log(`  - Email: ${finalVolunteer.email}`);
console.log(`  - Role: ${finalVolunteer.role}`);
console.log(`  - Status: ${finalVolunteer.status}`);
console.log(`  - Verified: ${finalVolunteer.email_verified}`);
console.log(`  - Password Validates: ${volunteerPasswordValid}`);

const finalVolProfile = db.prepare('SELECT status, full_name, preferred_team FROM volunteer_profiles WHERE user_id = ?').get(volunteerUserId) as any;
console.log(`Volunteer Profile: Status: ${finalVolProfile?.status}, Name: ${finalVolProfile?.full_name}`);

const finalDuty = db.prepare('SELECT event_id, team_key, responsibility_key, assignment_level, status FROM event_duty_assignments WHERE user_id = ? AND event_id = ?').get(volunteerUserId, event.id) as any;
console.log(`Volunteer Duty: Event: ${finalDuty?.event_id}, Team: ${finalDuty?.team_key}, Responsibility: ${finalDuty?.responsibility_key}, Level: ${finalDuty?.assignment_level}`);

db.close();
console.log('\n==================================================');
console.log('SEED COMPLETE SUCCESSFULLY');
console.log('==================================================');
