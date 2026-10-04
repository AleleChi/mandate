import dotenv from 'dotenv';
import crypto from 'crypto';
import { getDb, execute, queryOne } from '../src/server/db';
import { hashPassword } from '../src/server/auth';

dotenv.config();

async function bootstrap() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    console.error('Error: ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD env vars are required.');
    process.exit(1);
  }

  const cleanEmail = email.trim().toLowerCase();
  
  try {
    // Initialize DB connection
    getDb();

    // Check if user already exists
    const existingUser = await queryOne('SELECT id, role FROM users WHERE email = ?', [cleanEmail]);
    const now = new Date().toISOString();
    const hashedPassword = hashPassword(password);

    if (existingUser) {
      console.log(`User ${cleanEmail} already exists. Updating to super_admin and updating password...`);
      await execute(
        'UPDATE users SET password_hash = ?, role = ?, email_verified = 1, updated_at = ? WHERE id = ?',
        [hashedPassword, 'super_admin', now, existingUser.id]
      );
      
      // Ensure we have a profile to resolve name
      const profile = await queryOne('SELECT id FROM parent_profiles WHERE user_id = ?', [existingUser.id]);
      if (!profile) {
        const profileId = crypto.randomUUID();
        await execute(`
          INSERT INTO parent_profiles (
            id, user_id, full_name, email, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [profileId, existingUser.id, 'Super Admin', cleanEmail, now, now]);
      }
    } else {
      console.log(`User ${cleanEmail} does not exist. Creating new super_admin account...`);
      const userId = crypto.randomUUID();
      await execute(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `, [userId, cleanEmail, hashedPassword, 'super_admin', now, now]);

      const profileId = crypto.randomUUID();
      await execute(`
        INSERT INTO parent_profiles (
          id, user_id, full_name, email, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [profileId, userId, 'Super Admin', cleanEmail, now, now]);
    }

    console.log('Admin bootstrap completed for masked email: ' + cleanEmail.replace(/^(.)(.*)(@.*)$/, '$1***$3'));
    process.exit(0);
  } catch (err) {
    console.error('Failed to bootstrap admin user:', err);
    process.exit(1);
  }
}

bootstrap();
