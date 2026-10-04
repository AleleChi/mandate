import { queryOne, execute } from '../src/server/db';
import { hashPassword, verifyPassword } from '../src/server/auth';
import crypto from 'crypto';

async function testResetFlow() {
  console.log('Testing Reset Flow...');
  
  // 1. Create a dummy parent user
  const email = 'test_parent_reset@example.com';
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  
  const userId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const initialPass = 'InitialPassword123!';
  const initialHash = hashPassword(initialPass);
  
  await execute('DELETE FROM users WHERE email = ?', [email]);
  
  await execute(`
    INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'parent', 1, ?, ?)
  `, [userId, email, initialHash, now, now]);
  
  await execute(`
    INSERT INTO parent_profiles (id, user_id, full_name, email, created_at, updated_at)
    VALUES (?, ?, 'Reset Test Parent', ?, ?, ?)
  `, [profileId, userId, email, now, now]);
  
  await execute(`
    INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
    VALUES (?, ?, ?, 'password_reset', ?, ?)
  `, [crypto.randomUUID(), userId, tokenHash, now, now]);

  console.log('Initial user created. Checking login with initial password...');
  const userRow1 = await queryOne('SELECT id, password_hash FROM users WHERE email = ?', [email]);
  if (!userRow1) throw new Error('User not found in DB!');
  
  const isMatch1 = verifyPassword(initialPass, userRow1.password_hash);
  console.log('Initial password match:', isMatch1);
  
  // Now simulate reset password
  const newPass = 'NewPasswordSecure123!';
  const hashedNewPwd = hashPassword(newPass);
  
  console.log('Updating password to:', newPass);
  console.log('New Hash:', hashedNewPwd);
  
  await execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashedNewPwd, now, userId]);
  
  const userRow2 = await queryOne('SELECT id, password_hash FROM users WHERE email = ?', [email]);
  if (!userRow2) throw new Error('User not found after update!');
  
  const isMatch2 = verifyPassword(newPass, userRow2.password_hash);
  console.log('New password match:', isMatch2);
  
  console.log('Double checking check with old password...');
  const isOldMatch = verifyPassword(initialPass, userRow2.password_hash);
  console.log('Old password match:', isOldMatch);
}

testResetFlow().catch(console.error);
