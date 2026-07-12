import { getDb, query, queryOne, execute, transaction } from '../db';
import crypto from 'crypto';

export interface TrainingProgramme {
  id: string;
  name: string;
  description: string;
  objectives: string; // JSON array
  prerequisites: string; // JSON array
  estimated_duration_minutes: number;
  status: string;
  created_at: string;
}

export interface TrainingScenario {
  id: string;
  programme_id: string | null;
  title: string;
  category: string;
  difficulty: string;
  description: string;
  expected_duration_minutes: number;
  configuration_version: number;
  status: string;
  created_at: string;
}

export interface TrainingSession {
  id: string;
  scenario_id: string;
  name: string;
  facilitator_user_id: string;
  status: string;
  simulated_event_name: string;
  simulation_speed: number;
  simulated_started_at: string | null;
  real_started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// Active training clients listeners map
export const trainingSSEListeners = new Map<string, Array<(event: any) => void>>();

export function broadcastTrainingEvent(sessionId: string, event: any) {
  const listeners = trainingSSEListeners.get(sessionId) || [];
  listeners.forEach((callback) => {
    try {
      callback(event);
    } catch (_) {}
  });
}

export async function initTrainingSchema() {
  const db = getDb();
  
  // Create tables if they do not exist
  await execute(`
    CREATE TABLE IF NOT EXISTS training_programmes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      objectives TEXT,
      prerequisites TEXT,
      estimated_duration_minutes INTEGER,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_scenarios (
      id TEXT PRIMARY KEY,
      programme_id TEXT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      description TEXT,
      expected_duration_minutes INTEGER,
      configuration_version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_scenario_objectives (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES training_scenarios(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      objective_type TEXT NOT NULL,
      responsible_role TEXT NOT NULL,
      expected_within_seconds INTEGER,
      is_critical INTEGER DEFAULT 0,
      evaluation_method TEXT DEFAULT 'automatic',
      step_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_scenario_injections (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES training_scenarios(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      scheduled_simulated_seconds INTEGER NOT NULL,
      target_role TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      expected_action TEXT,
      is_critical INTEGER DEFAULT 0,
      configuration TEXT,
      step_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_sessions (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES training_scenarios(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      facilitator_user_id TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      simulated_event_name TEXT,
      simulation_speed REAL DEFAULT 1.0,
      simulated_started_at TEXT,
      real_started_at TEXT,
      paused_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      training_role TEXT NOT NULL,
      participation_status TEXT DEFAULT 'joined',
      joined_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, user_id)
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_personas (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      persona_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      safe_profile TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_activity (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      actor_user_id TEXT,
      actor_training_role TEXT,
      action_type TEXT NOT NULL,
      safe_summary TEXT NOT NULL,
      simulated_at TEXT NOT NULL,
      real_created_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_observations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      observer_user_id TEXT NOT NULL,
      participant_user_id TEXT,
      objective_id TEXT,
      category TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'public',
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_objective_results (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      participant_user_id TEXT,
      objective_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      automated_evidence TEXT,
      facilitator_result TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, objective_id, participant_user_id)
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_debriefs (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      summary TEXT,
      strengths TEXT,
      improvement_areas TEXT,
      learning_actions TEXT,
      finalised_by TEXT,
      finalised_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS training_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Seed default training programs & scenarios if none exist
  const existingProgs = await query('SELECT count(*) as count FROM training_programmes');
  if (existingProgs[0]?.count === 0) {
    await seedDefaultTrainingData();
  }
}

async function seedDefaultTrainingData() {
  const p1Id = 'prog-vol-orientation';
  const p2Id = 'prog-emerg-safeguard';
  const p3Id = 'prog-network-drill';

  // Seed programmes
  await execute(`
    INSERT INTO training_programmes (id, name, description, objectives, prerequisites, estimated_duration_minutes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    p1Id,
    'New Volunteer Orientation',
    'Comprehensive introduction to Koinonia event operations, child registration, and check-in workflows.',
    JSON.stringify(['Understand check-in scanner', 'Detect duplicate passes', 'Assign core duty roles']),
    JSON.stringify([]),
    45,
    'active',
    new Date().toISOString(),
    new Date().toISOString()
  ]);

  await execute(`
    INSERT INTO training_programmes (id, name, description, objectives, prerequisites, estimated_duration_minutes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    p2Id,
    'Emergency & Safeguarding Drill',
    'Simulate critical event responses: missing children, safety alerts, escalation pathways, and incident reporting.',
    JSON.stringify(['Raise Urgent alert', 'Manage response ownership', 'Report accurate incidents']),
    JSON.stringify(['New Volunteer Orientation']),
    60,
    'active',
    new Date().toISOString(),
    new Date().toISOString()
  ]);

  await execute(`
    INSERT INTO training_programmes (id, name, description, objectives, prerequisites, estimated_duration_minutes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    p3Id,
    'Offline and Weak-Network Drill',
    'Practice scanning, staging, and resolving check-in reconciliation conflicts under completely offline or weak network conditions.',
    JSON.stringify(['Scan passes offline', 'Manage outbox queue', 'Reconcile offline scans']),
    JSON.stringify(['New Volunteer Orientation']),
    30,
    'active',
    new Date().toISOString(),
    new Date().toISOString()
  ]);

  // Seed Scenarios
  const s1Id = 'scen-checkin-basics';
  const s2Id = 'scen-missing-child';
  const s3Id = 'scen-offline-recovery';

  await execute(`
    INSERT INTO training_scenarios (id, programme_id, title, category, difficulty, description, expected_duration_minutes, configuration_version, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    s1Id,
    p1Id,
    'Standard Check-In & Duplicate Entry Practice',
    'Check-in',
    'Introduction',
    'Practise normal entry scanning and resolve duplicate or revoked pass attempt issues.',
    15,
    1,
    'active',
    new Date().toISOString(),
    new Date().toISOString()
  ]);

  await execute(`
    INSERT INTO training_scenarios (id, programme_id, title, category, difficulty, description, expected_duration_minutes, configuration_version, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    s2Id,
    p2Id,
    'Missing Child Alert and Team Escalation',
    'Missing Child',
    'Advanced drill',
    'Simulate a child who cannot be located in their assigned room, requiring immediate team alerts, response coordination, and incident creation.',
    30,
    1,
    'active',
    new Date().toISOString(),
    new Date().toISOString()
  ]);

  await execute(`
    INSERT INTO training_scenarios (id, programme_id, title, category, difficulty, description, expected_duration_minutes, configuration_version, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    s3Id,
    p3Id,
    'Completely Offline Check-in Reconciliation',
    'Connectivity Failure',
    'Standard drill',
    'The event network drops completely. Practice offline pass scanning, managing pending actions, and syncing once the connection returns.',
    20,
    1,
    'active',
    new Date().toISOString(),
    new Date().toISOString()
  ]);

  // Seed scenario objectives for s1Id (Check-in)
  await execute(`
    INSERT INTO training_scenario_objectives (id, scenario_id, title, description, objective_type, responsible_role, expected_within_seconds, is_critical, evaluation_method, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'obj-s1-1', s1Id, 'Scan first synthetic child pass', 'Successfully check-in Liam Smith using his pass code.', 'check_in', 'Check-in Team', 300, 1, 'automatic', 1, new Date().toISOString()
  ]);
  await execute(`
    INSERT INTO training_scenario_objectives (id, scenario_id, title, description, objective_type, responsible_role, expected_within_seconds, is_critical, evaluation_method, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'obj-s1-2', s1Id, 'Detect duplicate scan attempt', 'Handle the duplicate scan attempt injection correctly by flagging a hold.', 'duplicate_check', 'Check-in Team', 300, 1, 'automatic', 2, new Date().toISOString()
  ]);

  // Seed scenario objectives for s2Id (Missing child)
  await execute(`
    INSERT INTO training_scenario_objectives (id, scenario_id, title, description, objective_type, responsible_role, expected_within_seconds, is_critical, evaluation_method, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'obj-s2-1', s2Id, 'Acknowledge missing child alert within 60s', 'Quick response to the Urgent missing child alert.', 'alert_acknowledge', 'Room Lead', 60, 1, 'automatic', 1, new Date().toISOString()
  ]);
  await execute(`
    INSERT INTO training_scenario_objectives (id, scenario_id, title, description, objective_type, responsible_role, expected_within_seconds, is_critical, evaluation_method, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'obj-s2-2', s2Id, 'Take response ownership', 'A responder must take ownership of the safety alert.', 'response_own', 'Security', 120, 1, 'automatic', 2, new Date().toISOString()
  ]);
  await execute(`
    INSERT INTO training_scenario_objectives (id, scenario_id, title, description, objective_type, responsible_role, expected_within_seconds, is_critical, evaluation_method, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'obj-s2-3', s2Id, 'Create detailed incident record', 'Document the factual missing child recovery actions in the incident system.', 'incident_record', 'Event Admin', 600, 0, 'facilitator', 3, new Date().toISOString()
  ]);

  // Seed scenario objectives for s3Id (Offline)
  await execute(`
    INSERT INTO training_scenario_objectives (id, scenario_id, title, description, objective_type, responsible_role, expected_within_seconds, is_critical, evaluation_method, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'obj-s3-1', s3Id, 'Complete check-in offline', 'Recognise that the network is unavailable and queue the pass in the training outbox.', 'offline_check', 'Check-in Team', 300, 1, 'automatic', 1, new Date().toISOString()
  ]);
  await execute(`
    INSERT INTO training_scenario_objectives (id, scenario_id, title, description, objective_type, responsible_role, expected_within_seconds, is_critical, evaluation_method, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'obj-s3-2', s3Id, 'Reconcile outbox on reconnect', 'Successfully trigger the training outbox sync when connection simulates recovery.', 'sync_recovery', 'Check-in Team', 600, 1, 'automatic', 2, new Date().toISOString()
  ]);

  // Seed injections for s1Id (Check-in)
  await execute(`
    INSERT INTO training_scenario_injections (id, scenario_id, title, category, scheduled_simulated_seconds, target_role, visibility, expected_action, is_critical, configuration, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'inj-s1-1', s1Id, 'Simulated Child Liam Smith Arrives', 'simulated child arrives', 10, 'Check-in Team', 'public', 'Check-in Liam Smith', 1, JSON.stringify({ type: 'arrival', childName: 'Liam Smith', passCode: 'TPASS-LIAM-819' }), 1, new Date().toISOString()
  ]);
  await execute(`
    INSERT INTO training_scenario_injections (id, scenario_id, title, category, scheduled_simulated_seconds, target_role, visibility, expected_action, is_critical, configuration, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'inj-s1-2', s1Id, 'Simulated Duplicate Scan Attempt', 'simulated duplicate detection', 40, 'Check-in Team', 'public', 'Flag duplicate warning', 1, JSON.stringify({ type: 'duplicate', childName: 'Liam Smith', passCode: 'TPASS-LIAM-819' }), 2, new Date().toISOString()
  ]);

  // Seed injections for s2Id (Missing child)
  await execute(`
    INSERT INTO training_scenario_injections (id, scenario_id, title, category, scheduled_simulated_seconds, target_role, visibility, expected_action, is_critical, configuration, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'inj-s2-1', s2Id, 'Simulated Child Emma Johnson missing', 'simulated child cannot be located', 10, 'Room Lead', 'public', 'Raise safety alert', 1, JSON.stringify({ type: 'missing', childName: 'Emma Johnson', lastRoom: 'Blue Room' }), 1, new Date().toISOString()
  ]);
  await execute(`
    INSERT INTO training_scenario_injections (id, scenario_id, title, category, scheduled_simulated_seconds, target_role, visibility, expected_action, is_critical, configuration, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'inj-s2-2', s2Id, 'Backup escalation triggered', 'simulated alert remains unacknowledged', 70, 'Security', 'public', 'Escalate alerts', 1, JSON.stringify({ type: 'escalation' }), 2, new Date().toISOString()
  ]);

  // Seed injections for s3Id (Offline)
  await execute(`
    INSERT INTO training_scenario_injections (id, scenario_id, title, category, scheduled_simulated_seconds, target_role, visibility, expected_action, is_critical, configuration, step_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'inj-s3-1', s3Id, 'Complete Offline Network Simulation', 'simulated device loses connection', 15, 'Check-in Team', 'public', 'Submit to offline queue', 1, JSON.stringify({ type: 'offline' }), 1, new Date().toISOString()
  ]);
}

// Generate deterministically styled synthetic child data based on seed/session
export function generateSyntheticParticipants(sessionId: string, countType: string) {
  const list = [
    { name: 'Liam Smith', age: 7, group: 'Ages 7 to 9', pass: 'TPASS-LIAM-819', gender: 'Boy', medical: 'Peanut allergy - carries Epipen' },
    { name: 'Emma Johnson', age: 8, group: 'Ages 7 to 9', pass: 'TPASS-EMMA-223', gender: 'Girl', medical: 'Asthma inhaler in backpack' },
    { name: 'Noah Williams', age: 10, group: 'Ages 10 to 12', pass: 'TPASS-NOAH-472', gender: 'Boy', medical: '' },
    { name: 'Ava Brown', age: 11, group: 'Ages 10 to 12', pass: 'TPASS-AVA-192', gender: 'Girl', medical: 'Requires assistance during fast activities' },
    { name: 'Oliver Jones', age: 9, group: 'Ages 7 to 9', pass: 'TPASS-OLIVER-381', gender: 'Boy', medical: '' },
    { name: 'Sophia Miller', age: 6, group: 'Ages 5 to 6', pass: 'TPASS-SOPHIA-120', gender: 'Girl', medical: '' },
    { name: 'Elijah Davis', age: 12, group: 'Teens 13 to 15', pass: 'TPASS-ELIJAH-904', gender: 'Boy', medical: '' },
    { name: 'Isabella Garcia', age: 5, group: 'Ages 5 to 6', pass: 'TPASS-ISABELLA-611', gender: 'Girl', medical: '' }
  ];

  let limit = 3;
  if (countType === 'medium') limit = 5;
  if (countType === 'large' || countType === 'custom') limit = 8;

  return list.slice(0, limit).map((p) => {
    // Fictionalized clearly marked simulated profiles
    return {
      childId: 'sch-' + crypto.createHash('md5').update(sessionId + p.name).digest('hex').substring(0, 8),
      fullName: p.name + ' (Simulated)',
      gender: p.gender,
      calculatedAge: p.age,
      ageGroup: p.group,
      passCode: p.pass,
      medicalNotes: p.medical,
      guardianName: 'George ' + p.name.split(' ')[1] + ' (Simulated)',
      guardianPhone: '+234 803 123 ' + Math.floor(1000 + Math.random() * 9000),
      pickupPeople: [
        { id: 'sp-' + Math.random().toString(36).substring(2, 6), name: 'Sarah ' + p.name.split(' ')[1] + ' (Simulated)', relationship: 'Mother', phone: '+234 803 555 1234' }
      ]
    };
  });
}
