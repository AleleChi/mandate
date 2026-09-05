import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const dbPath = path.resolve(process.cwd(), 'data/koinonia-dev.sqlite');
const db = new Database(dbPath);

export function seedGalleryDataset(count: number) {
  console.log(`\n--- Seeding Gallery Dataset with ${count} items ---`);
  
  // Clear existing items
  db.prepare('DELETE FROM landing_gallery_items').run();
  
  if (count === 0) {
    console.log('Seeded 0 items (clean empty state).');
    return;
  }

  const insertMediaStmt = db.prepare(`
    INSERT OR REPLACE INTO media_files (
      id, owner_user_id, provider, file_type, public_id, secure_url, resource_type,
      mime_type, file_size, width, height, duration, folder, file_url, storage_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertGalleryStmt = db.prepare(`
    INSERT INTO landing_gallery_items (
      id, media_file_id, image_url, alt_text, caption, sort_order, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  
  const sampleTitles = [
    'Praise & Creative Arts Workshop',
    'Morning Devotional & Scripture Circle',
    'Teens Leadership Forum 2026',
    'Volunteer Care & Safety Briefing',
    'Joyful Music & Dance Rehearsal',
    'Assembly Welcome & Registration Check-in',
    'Bible Story Animation Theatre',
    'Outdoor Fellowship & Team Building',
    'Prayer of Dedication with Ministers',
    'Creative Science & Discovery Station',
    'Teens Acoustic Worship Night',
    'Family Blessing & Dismissal Fellowship'
  ];

  const sampleImages = [
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/social_share.jpg'
  ];

  const transaction = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const galleryId = crypto.randomUUID();
      const mediaId = crypto.randomUUID();
      const title = sampleTitles[i % sampleTitles.length] + (i >= sampleTitles.length ? ` (Cohort ${Math.floor(i / sampleTitles.length) + 1})` : '');
      const img = sampleImages[i % sampleImages.length];
      const alt = `Photograph capturing ${title.toLowerCase()} during General Assembly 2026`;

      insertMediaStmt.run(
        mediaId,
        null,
        'local',
        'gallery_media',
        `local_gallery_${i}`,
        img,
        'image',
        'image/jpeg',
        102400,
        800,
        600,
        null,
        'koinonia-children-teens/gallery',
        img,
        `local_key_${i}`,
        now
      );

      insertGalleryStmt.run(galleryId, mediaId, img, alt, title, i, 1, now, now);
    }
  });

  transaction();
  console.log(`Successfully seeded ${count} gallery items into local SQLite.`);
}

// If run directly
const arg = process.argv[2];
if (arg !== undefined) {
  const count = parseInt(arg, 10);
  seedGalleryDataset(isNaN(count) ? 12 : count);
}
