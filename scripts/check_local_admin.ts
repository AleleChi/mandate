import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const dbPath = path.join(process.cwd(), 'data', 'koinonia-dev.sqlite');
const db = new Database(dbPath);

const admin = db.prepare('SELECT id, email, role, email_verified, created_at FROM users WHERE email = ?').get('admin@koinonia.org') as any;
console.log('Admin user found:', admin ? 'YES' : 'NO');
if (admin) {
  console.log('ID:', admin.id);
  console.log('Email:', admin.email);
  console.log('Role:', admin.role);
  console.log('Email verified:', admin.email_verified);
  console.log('Created at:', admin.created_at);
}

const hashRow = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('admin@koinonia.org') as any;
if (hashRow && hashRow.password_hash) {
  const parts = hashRow.password_hash.split(':');
  console.log('Password hash present: YES');
  console.log('Hash format valid (salt:key):', parts.length === 2 && parts[0].length === 32 && parts[1].length === 128);
  
  function verifyPassword(password: string, hash: string) {
    try {
      const [salt, key] = hash.split(':');
      if (!salt || !key) return false;
      const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derivedKey, 'hex'));
    } catch {
      return false;
    }
  }
  console.log("Matches 'Password123!':", verifyPassword('Password123!', hashRow.password_hash));
  console.log("Matches 'admin123':", verifyPassword('admin123', hashRow.password_hash));
  console.log("Matches 'admin':", verifyPassword('admin', hashRow.password_hash));
  console.log("Matches 'Admin123!':", verifyPassword('Admin123!', hashRow.password_hash));
  console.log("Matches 'password':", verifyPassword('password', hashRow.password_hash));
} else {
  console.log('Password hash present: NO');
}
