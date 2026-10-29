import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import { hashPassword, verifyPassword } from '../src/server/auth';

const dbPath = path.join(process.cwd(), 'data', 'koinonia-dev.sqlite');
const db = new Database(dbPath, { timeout: 15000 });
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 15000');

console.log('==================================================');
console.log('1. IDENTIFY THE LOCAL DATABASE');
console.log('==================================================');

const localDbExists = true;
console.log('LOCAL DB:', dbPath);

// Check current local admin accounts
const existingOrgAdmin = db.prepare('SELECT id, email, role, status, email_verified, created_at FROM users WHERE email = ?').get('admin@koinonia.org') as any;
const existingLocalAdmin = db.prepare('SELECT id, email, role, status, email_verified, created_at FROM users WHERE email = ?').get('admin@koinonia.local') as any;

const primaryAdmin = existingLocalAdmin || existingOrgAdmin;

console.log('LOCAL ADMIN EXISTS:', primaryAdmin ? 'YES' : 'NO');
console.log('LOCAL ADMIN EMAIL:', primaryAdmin?.email || 'N/A');
console.log('LOCAL ADMIN ROLE:', primaryAdmin?.role || 'N/A');
console.log('LOCAL ADMIN ACTIVE:', (primaryAdmin?.status === 'active' || primaryAdmin?.email_verified === 1) ? 'YES' : 'NO');

console.log('\n==================================================');
console.log('2. RESTORE/CREATE LOCAL DEV ADMIN (admin@koinonia.local)');
console.log('==================================================');

// Dedicated local dev password
const tempLocalPassword = 'KoinoniaDevAdmin2026!';
const hashedPassword = hashPassword(tempLocalPassword);
const now = new Date().toISOString();

if (existingLocalAdmin) {
  db.prepare(`
    UPDATE users 
    SET password_hash = ?, status = 'active', email_verified = 1, updated_at = ?
    WHERE email = 'admin@koinonia.local'
  `).run(hashedPassword, now);
  console.log('Updated existing admin@koinonia.local password.');
} else {
  const localAdminId = 'admin-user-id-local';
  const localProfileId = 'admin-profile-id-local';

  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
    VALUES (?, 'admin@koinonia.local', ?, 'super_admin', 'active', 1, ?, ?)
  `).run(localAdminId, hashedPassword, now, now);

  // Parent profile for full name resolution
  const existingProfile = db.prepare('SELECT id FROM parent_profiles WHERE user_id = ?').get(localAdminId);
  if (!existingProfile) {
    db.prepare(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, phone_number, whatsapp_number, home_address, preferred_contact, is_koinonia_worker, country, state_region, city, photo_file_id, profile_completed_at, created_at, updated_at)
      VALUES (?, ?, 'Local Dev Admin', 'admin@koinonia.local', '+2348000000001', '+2348000000001', 'Koinonia Local Dev HQ', 'WhatsApp', 0, 'Nigeria', 'FCT', 'Abuja', 'photo-parent-default', ?, ?, ?)
    `).run(localProfileId, localAdminId, now, now, now);
  }

  // Duty status for admin coordination views
  const existingDuty = db.prepare('SELECT id FROM user_duty_status WHERE user_id = ?').get(localAdminId);
  if (!existingDuty) {
    db.prepare(`
      INSERT INTO user_duty_status (id, user_id, active, approved, on_duty, alert_enabled, assigned_event_id, assigned_team, created_at, updated_at)
      VALUES (?, ?, 1, 1, 1, 1, 'event-ga-2026', 'Admins', ?, ?)
    `).run('duty-admin-local', localAdminId, now, now);
  }

  console.log('Created new dedicated local admin: admin@koinonia.local');
}

// Also update admin@koinonia.org to the same temporary password so either works seamlessly
if (existingOrgAdmin) {
  db.prepare(`
    UPDATE users 
    SET password_hash = ?, status = 'active', email_verified = 1, updated_at = ?
    WHERE email = 'admin@koinonia.org'
  `).run(hashedPassword, now);
  console.log('Also synced admin@koinonia.org in local SQLite with temporary password.');
}

db.close();

console.log('\n==================================================');
console.log('3. RUN END-TO-END HTTP AUTH VERIFICATION');
console.log('==================================================');

function makeRequest(
  path: string,
  method: string = 'POST',
  body?: any,
  token?: string
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(data));
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path,
        method,
        headers,
        timeout: 10000,
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode || 0, body: JSON.parse(resBody) });
          } catch {
            resolve({ statusCode: res.statusCode || 0, body: resBody });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function verifyAuthFlow() {
  // Test A: Wrong password rejected
  console.log('\nTesting: Wrong password rejection...');
  const wrongRes = await makeRequest('/api/admin/sign-in', 'POST', {
    email: 'admin@koinonia.local',
    password: 'WrongPassword999!',
  });
  const wrongRejected = wrongRes.statusCode === 401 && wrongRes.body?.code === 'INVALID_CREDENTIALS';
  console.log('  wrong password rejected:', wrongRejected ? 'PASS' : 'FAIL', `(Status: ${wrongRes.statusCode})`);

  // Test B: Correct password accepted
  console.log('Testing: Correct password acceptance...');
  const loginRes = await makeRequest('/api/admin/sign-in', 'POST', {
    email: 'admin@koinonia.local',
    password: tempLocalPassword,
  });
  const correctAccepted = loginRes.statusCode === 200 && loginRes.body?.success === true && Boolean(loginRes.body?.token);
  console.log('  correct password accepted:', correctAccepted ? 'PASS' : 'FAIL', `(Role: ${loginRes.body?.user?.role})`);

  const token = loginRes.body?.token;

  // Test C: Admin dashboard accessible
  console.log('Testing: Admin dashboard accessible (/api/admin/me & /api/me/access)...');
  const meRes = await makeRequest('/api/admin/me', 'GET', undefined, token);
  const meAccessRes = await makeRequest('/api/me/access', 'GET', undefined, token);
  const dashboardAccessible = meRes.statusCode === 200 && meAccessRes.statusCode === 200;
  console.log('  Admin dashboard accessible:', dashboardAccessible ? 'PASS' : 'FAIL', `(Name: ${meRes.body?.profile?.full_name || meRes.body?.user?.fullName})`);

  // Test D: Session persists
  console.log('Testing: Session persists with token...');
  const persistCheck = await makeRequest('/api/me/access', 'GET', undefined, token);
  const sessionPersists = persistCheck.statusCode === 200 && persistCheck.body?.user?.role === 'super_admin';
  console.log('  session persists:', sessionPersists ? 'PASS' : 'FAIL');

  // Test E: Logout
  console.log('Testing: Logout (/api/auth/sign-out)...');
  const logoutRes = await makeRequest('/api/auth/sign-out', 'POST', undefined, token);
  const logoutPass = logoutRes.statusCode === 200;
  console.log('  logout:', logoutPass ? 'PASS' : 'FAIL');

  // Test F: Login again
  console.log('Testing: Login again after logout...');
  const reLoginRes = await makeRequest('/api/admin/sign-in', 'POST', {
    email: 'admin@koinonia.local',
    password: tempLocalPassword,
  });
  const reLoginPass = reLoginRes.statusCode === 200 && reLoginRes.body?.success === true;
  console.log('  login again:', reLoginPass ? 'PASS' : 'FAIL');

  // Also test admin@koinonia.org login to ensure zero regressions
  console.log('\nTesting: admin@koinonia.org login verification...');
  const orgLoginRes = await makeRequest('/api/admin/sign-in', 'POST', {
    email: 'admin@koinonia.org',
    password: tempLocalPassword,
  });
  const orgLoginPass = orgLoginRes.statusCode === 200 && orgLoginRes.body?.success === true;
  console.log('  admin@koinonia.org login:', orgLoginPass ? 'PASS' : 'FAIL');

  console.log('\n==================================================');
  console.log('VERIFICATION RESULTS SUMMARY:');
  console.log('- wrong password rejected:', wrongRejected ? 'PASS' : 'FAIL');
  console.log('- correct password accepted:', correctAccepted ? 'PASS' : 'FAIL');
  console.log('- Admin dashboard accessible:', dashboardAccessible ? 'PASS' : 'FAIL');
  console.log('- session persists:', sessionPersists ? 'PASS' : 'FAIL');
  console.log('- logout:', logoutPass ? 'PASS' : 'FAIL');
  console.log('- login again:', reLoginPass ? 'PASS' : 'FAIL');
  console.log('==================================================');
}

verifyAuthFlow().catch((err) => {
  console.error('Fatal error during auth verification:', err);
  process.exit(1);
});
