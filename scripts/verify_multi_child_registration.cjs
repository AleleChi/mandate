const Database = require('better-sqlite3');
const crypto = require('crypto');

console.log('=== MULTI-CHILD REGISTRATION & NOTIFICATION VERIFICATION ===');

const db = new Database(':memory:');

db.exec(`
  CREATE TABLE parent_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    full_name TEXT,
    email TEXT
  );

  CREATE TABLE children (
    id TEXT PRIMARY KEY,
    parent_profile_id TEXT,
    full_name TEXT,
    gender TEXT,
    date_of_birth TEXT,
    calculated_age INT,
    age_group TEXT,
    relationship_to_child TEXT,
    photo_file_id TEXT,
    needs_age_review INT DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE child_event_entries (
    id TEXT PRIMARY KEY,
    child_id TEXT,
    event_id TEXT,
    status TEXT,
    school_class TEXT,
    school_name TEXT,
    previous_children_programme TEXT,
    note_to_team TEXT,
    has_medical_notes INT DEFAULT 0,
    medical_notes TEXT,
    needs_extra_support INT DEFAULT 0,
    support_notes TEXT,
    information_confirmed INT DEFAULT 0,
    details_confirmed INT DEFAULT 0,
    submitted_at TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE pickup_people (
    id TEXT PRIMARY KEY,
    child_event_entry_id TEXT,
    pickup_type TEXT,
    full_name TEXT,
    relationship_to_child TEXT,
    phone_number TEXT,
    whatsapp_number TEXT,
    photo_file_id TEXT,
    approved_by_parent INT DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    title TEXT,
    message TEXT,
    type TEXT,
    audience_role TEXT,
    audience_scope TEXT,
    event_id TEXT,
    child_id TEXT,
    parent_id TEXT,
    created_by_user_id TEXT,
    created_at TEXT,
    priority TEXT,
    channel TEXT,
    metadata_json TEXT,
    visible_to_event_team INT DEFAULT 0
  );

  CREATE TABLE parent_notifications (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    event_id TEXT,
    child_id TEXT,
    title TEXT,
    message TEXT,
    read_at TEXT,
    created_at TEXT
  );

  CREATE TABLE notification_reads (
    id TEXT PRIMARY KEY,
    notification_id TEXT,
    user_id TEXT,
    read_at TEXT,
    created_at TEXT
  );
`);

const REAL_EVENT_ID = 'event-real-2026';
const parentId = 'parent-uuid-001';
const userId = 'user-uuid-001';

db.prepare(`
  INSERT INTO parent_profiles (id, user_id, full_name, email)
  VALUES (?, ?, ?, ?)
`).run(parentId, userId, 'Keenam Family', 'parent@example.com');

// Helper to simulate registration + submit endpoint
function registerAndSubmitChild(childId, fullName, schoolClass, schoolNameOption) {
  const now = new Date().toISOString();

  // Step 1: Save Draft (Child)
  db.prepare(`
    INSERT INTO children (id, parent_profile_id, full_name, gender, date_of_birth, calculated_age, age_group, relationship_to_child, created_at, updated_at)
    VALUES (?, ?, ?, 'Male', '2018-05-10', 8, 'Ages 7 to 9', 'Parent', ?, ?)
  `).run(childId, parentId, fullName, now, now);

  // Step 2: Save Draft (Entry) - school_name is optional/omitted
  const entryId = `entry-${childId}`;
  db.prepare(`
    INSERT INTO child_event_entries (id, child_id, event_id, status, school_class, school_name, previous_children_programme, note_to_team, created_at, updated_at)
    VALUES (?, ?, ?, 'incomplete', ?, ?, 'No', '', ?, ?)
  `).run(entryId, childId, REAL_EVENT_ID, schoolClass, schoolNameOption || null, now, now);

  // Step 3: Save Draft (Pickup)
  db.prepare(`
    INSERT INTO pickup_people (id, child_event_entry_id, pickup_type, full_name, phone_number, created_at, updated_at)
    VALUES (?, ?, 'parent', 'Keenam Parent', '08012345678', ?, ?)
  `).run(`pickup-${childId}`, entryId, now, now);

  // Step 4: Submit Endpoint logic
  db.prepare(`
    UPDATE child_event_entries SET
      status = 'under_review',
      details_confirmed = 1,
      submitted_at = COALESCE(submitted_at, ?),
      updated_at = ?
    WHERE id = ?
  `).run(now, now, entryId);

  // 1. Parent confirmation notifications
  const parentNotifId = `pnotif-${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO parent_notifications (id, parent_id, event_id, child_id, title, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    parentNotifId,
    parentId,
    REAL_EVENT_ID,
    childId,
    'Application submitted',
    `${fullName}'s application has been received.`,
    now
  );

  const parentGeneralNotifId = `notif-${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO notifications (id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id, created_by_user_id, created_at, priority, channel, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parentGeneralNotifId,
    'Application submitted',
    `${fullName}'s application has been received.`,
    'application_submitted',
    'parent',
    'individual',
    REAL_EVENT_ID,
    childId,
    parentId,
    userId,
    now,
    'normal',
    'in-app',
    JSON.stringify({ childId, applicationId: entryId, type: 'application_submitted' })
  );

  // 2. Admin operational notification (parent_id is null so it never leaks to parent view)
  const adminNotifId = `notif-${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO notifications (id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id, created_by_user_id, created_at, priority, channel, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    adminNotifId,
    'New child application',
    `New application submitted for ${fullName}.`,
    'new_application',
    'admin',
    'all',
    REAL_EVENT_ID,
    childId,
    null,
    userId,
    now,
    'normal',
    'in-app',
    JSON.stringify({ childId, applicationId: entryId, type: 'new_application' })
  );
}

// Simulate parent GET /api/notifications logic
function getNotificationsForParent(pId) {
  const children = db.prepare('SELECT id FROM children WHERE parent_profile_id = ?').all(pId);
  const childIds = children.map(c => c.id);

  let queryStr = `
    SELECT * FROM notifications 
    WHERE (
      (parent_id IS NULL AND child_id IS NULL AND (audience_role IN ('parent', 'all') OR audience_role IS NULL))
  `;
  const params = [];

  if (pId) {
    queryStr += ` OR (parent_id = ? AND (audience_role IN ('parent', 'all') OR audience_role IS NULL OR title = 'New child application'))`;
    params.push(pId);
  }

  if (childIds.length > 0) {
    const placeholders = childIds.map(() => '?').join(',');
    queryStr += ` OR (child_id IN (${placeholders}) AND (audience_role IN ('parent', 'all') OR audience_role IS NULL OR title = 'New child application'))`;
    params.push(...childIds);
  }

  queryStr += ` ) ORDER BY created_at DESC`;
  const rawNotifs = db.prepare(queryStr).all(...params);

  const mappedGeneral = rawNotifs.map((n) => {
    let title = n.title;
    let message = n.message;
    if (title === 'New child application' || title?.toLowerCase() === 'new child application') {
      title = 'Application submitted';
    }
    if (message && /^New application submitted for\s+/i.test(message)) {
      message = message.replace(/^New application submitted for\s+([^.]+)\.?/i, "$1's application has been received.");
    }
    return {
      id: `notifications:${n.id}`,
      rawId: n.id,
      source: 'notifications',
      title,
      message,
      type: n.type || 'info',
      audience_role: 'parent',
      audience_scope: n.audience_scope,
      event_id: n.event_id,
      child_id: n.child_id,
      parent_id: n.parent_id,
      created_by_user_id: n.created_by_user_id,
      created_at: n.created_at,
      read_at: null
    };
  });

  const parentNotifs = db.prepare(
    'SELECT * FROM parent_notifications WHERE parent_id = ? ORDER BY created_at DESC'
  ).all(pId);

  const mappedParentNotifs = parentNotifs.map((pn) => ({
    id: `parent_notifications:${pn.id}`,
    rawId: pn.id,
    source: 'parent_notifications',
    title: pn.title,
    message: pn.message,
    type: 'info',
    audience_role: 'parent',
    audience_scope: 'individual',
    event_id: pn.event_id,
    child_id: pn.child_id,
    parent_id: pn.parent_id,
    created_by_user_id: null,
    created_at: pn.created_at,
    read_at: pn.read_at
  }));

  const merged = [...mappedGeneral, ...mappedParentNotifs].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const seenKeys = new Set();
  const deduplicated = [];
  for (const item of merged) {
    const key = `${item.title.trim().toLowerCase()}|${item.message.trim().toLowerCase()}|${item.child_id || item.rawId || ''}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduplicated.push(item);
    } else {
      if (item.source === 'parent_notifications') {
        const idx = deduplicated.findIndex(d => 
          d.title.trim().toLowerCase() === item.title.trim().toLowerCase() &&
          d.message.trim().toLowerCase() === item.message.trim().toLowerCase() &&
          (d.child_id || d.rawId || '') === (item.child_id || item.rawId || '')
        );
        if (idx !== -1 && deduplicated[idx].source === 'notifications') {
          deduplicated[idx] = item;
        }
      }
    }
  }

  return deduplicated;
}

// 1. Register Child A
console.log('\n--- 1. Registering Child A (Reign Keenam) ---');
registerAndSubmitChild('child-001', 'Reign Keenam', 'Primary 4', null);

let parentNotifs = getNotificationsForParent(parentId);
console.log('Notifications count after Child A:', parentNotifs.length);
console.log('Notifications:', parentNotifs.map(n => ({ title: n.title, message: n.message, child_id: n.child_id })));
if (parentNotifs.length !== 1 || parentNotifs[0].title !== 'Application submitted') {
  console.error('FAILED on Child A notification!');
  process.exit(1);
}

// 2. Register Child B
console.log('\n--- 2. Registering Child B (Kezia Keenam) ---');
registerAndSubmitChild('child-002', 'Kezia Keenam', 'Primary 2', null);

parentNotifs = getNotificationsForParent(parentId);
console.log('Notifications count after Child B:', parentNotifs.length);
console.log('Notifications:', parentNotifs.map(n => ({ title: n.title, message: n.message, child_id: n.child_id })));
if (parentNotifs.length !== 2) {
  console.error('FAILED! Expected 2 notifications, got:', parentNotifs.length);
  process.exit(1);
}
const childIdsRepresented = new Set(parentNotifs.map(n => n.child_id));
if (!childIdsRepresented.has('child-001') || !childIdsRepresented.has('child-002')) {
  console.error('FAILED! Child IDs not correctly represented:', Array.from(childIdsRepresented));
  process.exit(1);
}

// 3. Register Child C separately
console.log('\n--- 3. Registering Child C (Elijah Keenam) ---');
registerAndSubmitChild('child-003', 'Elijah Keenam', 'JSS 1', null);

parentNotifs = getNotificationsForParent(parentId);
console.log('Notifications count after Child C:', parentNotifs.length);
console.log('Notifications:', parentNotifs.map(n => ({ title: n.title, message: n.message, child_id: n.child_id })));
if (parentNotifs.length !== 3) {
  console.error('FAILED! Expected 3 notifications, got:', parentNotifs.length);
  process.exit(1);
}

// 4. Verify Admin notifications exist with proper admin copy
const adminNotifs = db.prepare(`
  SELECT * FROM notifications WHERE audience_role = 'admin' ORDER BY created_at ASC
`).all();
console.log('\n--- 4. Admin notifications count:', adminNotifs.length);
console.log('Admin notifications:', adminNotifs.map(n => ({ title: n.title, message: n.message, parent_id: n.parent_id })));
if (adminNotifs.length !== 3 || adminNotifs[0].title !== 'New child application' || adminNotifs[0].parent_id !== null) {
  console.error('FAILED! Admin notifications mismatch!');
  process.exit(1);
}

// 5. Verify database child records & classes & school_name nullability
const entries = db.prepare('SELECT child_id, school_class, school_name, status FROM child_event_entries').all();
console.log('\n--- 5. Database child event entries:', entries);
if (entries.length !== 3 || entries.some(e => !e.school_class || e.status !== 'under_review')) {
  console.error('FAILED! Entries data mismatch!');
  process.exit(1);
}

// 6. Test legacy historical row backward compatibility
console.log('\n--- 6. Testing legacy production notification backward compatibility ---');
db.prepare(`
  INSERT INTO notifications (id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id, created_by_user_id, created_at, priority, channel, metadata_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'legacy-notif-001',
  'New child application',
  'New application submitted for Historic Child.',
  'new_application',
  'admin',
  'all',
  REAL_EVENT_ID,
  'child-historic',
  parentId,
  userId,
  new Date(Date.now() - 3600000).toISOString(),
  'normal',
  'in-app',
  JSON.stringify({ childId: 'child-historic' })
);

const notifsWithLegacy = getNotificationsForParent(parentId);
const legacyMapped = notifsWithLegacy.find(n => n.child_id === 'child-historic');
console.log('Legacy notification mapped for parent:', legacyMapped);
if (!legacyMapped || legacyMapped.title !== 'Application submitted' || !legacyMapped.message.includes("Historic Child's application has been received.")) {
  console.error('FAILED on legacy mapping!');
  process.exit(1);
}

console.log('\nALL 6 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
