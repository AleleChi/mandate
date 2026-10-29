import Database from 'better-sqlite3';
import path from 'path';
import { hashPassword } from '../src/server/auth';

const dbPath = path.join(process.cwd(), 'data', 'koinonia-dev.sqlite');
const db = new Database(dbPath, { timeout: 10000 });
db.pragma('journal_mode = WAL');

console.log('==================================================');
console.log('1. IDENTIFY THE LOCAL DATABASE');
console.log('==================================================');

console.log('LOCAL DB:', dbPath);

// Check current local admin accounts
const existingOrgAdmin = db.prepare('SELECT id, email, role, status, email_verified, created_at FROM users WHERE email = ?').get('admin@koinonia.org') as any;
const existingLocalAdmin = db.prepare('SELECT id, email, role, status, email_verified, created_at FROM users WHERE email = ?').get('admin@koinonia.local') as any;

console.log('LOCAL ADMIN (admin@koinonia.org) EXISTS:', existingOrgAdmin ? 'YES' : 'NO');
if (existingOrgAdmin) {
  console.log('  email:', existingOrgAdmin.email);
  console.log('  role:', existingOrgAdmin.role);
  console.log('  status:', existingOrgAdmin.status);
  console.log('  email_verified:', existingOrgAdmin.email_verified);
}

console.log('LOCAL ADMIN (admin@koinonia.local) EXISTS:', existingLocalAdmin ? 'YES' : 'NO');
if (existingLocalAdmin) {
  console.log('  email:', existingLocalAdmin.email);
  console.log('  role:', existingLocalAdmin.role);
  console.log('  status:', existingLocalAdmin.status);
  console.log('  email_verified:', existingLocalAdmin.email_verified);
}

console.log('\n==================================================');
console.log('2. RESTORE/CREATE LOCAL DEV ADMIN (admin@koinonia.local)');
console.log('==================================================');

// Temporary testing password
const tempLocalPassword = 'KoinoniaDevAdmin2026!';
const hashedPassword = hashPassword(tempLocalPassword);
const now = new Date().toISOString();

if (existingLocalAdmin) {
  db.prepare(`
    UPDATE users 
    SET password_hash = ?, role = 'super_admin', status = 'active', email_verified = 1, updated_at = ?
    WHERE email = 'admin@koinonia.local'
  `).run(hashedPassword, now);
  console.log('Updated existing admin@koinonia.local with fresh password hash.');
} else {
  const localAdminId = 'admin-user-id-local';
  const localProfileId = 'admin-profile-id-local';

  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
    VALUES (?, 'admin@koinonia.local', ?, 'super_admin', 'active', 1, ?, ?)
  `).run(localAdminId, hashedPassword, now, now);

  const existingProfile = db.prepare('SELECT id FROM parent_profiles WHERE user_id = ?').get(localAdminId);
  if (!existingProfile) {
    db.prepare(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, whatsapp_number, home_address, preferred_contact, is_koinonia_worker, country, state_region, city, photo_file_id, profile_completed_at, created_at, updated_at)
      VALUES (?, ?, 'Local Dev Admin', 'admin@koinonia.local', '+2348000000001', '+2348000000001', 'Koinonia Local Dev HQ', 'WhatsApp', 0, 'Nigeria', 'FCT', 'Abuja', 'photo-parent-default', ?, ?, ?)
    `).run(localProfileId, localAdminId, now, now, now);
  }

  const existingDuty = db.prepare('SELECT id FROM user_duty_status WHERE user_id = ?').get(localAdminId);
  if (!existingDuty) {
    db.prepare(`
      INSERT INTO user_duty_status (id, user_id, active, approved, on_duty, alert_enabled, assigned_event_id, assigned_team, created_at, updated_at)
      VALUES (?, ?, 1, 1, 1, 1, 'event-ga-2026', 'Admins', ?, ?)
    `).run('duty-admin-local', localAdminId, now, now);
  }

  console.log('Created dedicated local admin: admin@koinonia.local');
}

// Also update admin@koinonia.org to the same temporary password so either works seamlessly
if (existingOrgAdmin) {
  db.prepare(`
    UPDATE users 
    SET password_hash = ?, status = 'active', email_verified = 1, updated_at = ?
    WHERE email = 'admin@koinonia.org'
  `).run(hashedPassword, now);
  console.log('Also updated admin@koinonia.org with the temporary password.');
}

// Verify both records in DB
const checkLocal = db.prepare('SELECT id, email, role, status, email_verified FROM users WHERE email = ?').get('admin@koinonia.local') as any;
console.log('\nVerification from DB:');
console.log('LOCAL DB:', dbPath);
console.log('LOCAL ADMIN EXISTS:', checkLocal ? 'YES' : 'NO');
console.log('LOCAL ADMIN EMAIL:', checkLocal?.email);
console.log('LOCAL ADMIN ROLE:', checkLocal?.role);
console.log('LOCAL ADMIN ACTIVE:', (checkLocal?.status === 'active' || checkLocal?.email_verified === 1) ? 'YES' : 'NO');

db.close();
console.log('\nDatabase setup complete and connection closed successfully.');
