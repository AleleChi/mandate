import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'koinonia-dev.sqlite');
const db = new Database(dbPath);
const rows = db.prepare('SELECT * FROM app_media_settings').all();
console.log('ROWS:', rows);
const mediaFiles = db.prepare('SELECT id, provider, secure_url, file_url FROM media_files LIMIT 10').all();
console.log('MEDIA FILES:', mediaFiles);
db.close();
