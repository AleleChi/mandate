import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

const dbUrl = process.env.DATABASE_URL;
let engine = 'SQLite';
let host = 'localhost (Local File)';
let dbName = 'data/koinonia-dev.sqlite';
const env = process.env.NODE_ENV || 'development';

if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
  try {
    const parsed = new URL(dbUrl);
    engine = 'PostgreSQL';
    host = parsed.hostname;
    dbName = parsed.pathname.replace(/^\//, '');
  } catch (e) {
    engine = 'PostgreSQL';
    host = 'Unknown (Failed to parse URL)';
    dbName = 'Unknown';
  }
}

console.log('Database engine detected:', engine);
console.log('Database host/domain:', host);
console.log('Database name:', dbName);
console.log('Environment:', env);
