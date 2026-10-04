import { Router, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { 
  initTrainingSchema, 
  generateSyntheticParticipants, 
  broadcastTrainingEvent,
  trainingSSEListeners 
} from '../services/trainingService';

const router = Router();

// Ensure schema is ready on startup
initTrainingSchema().catch(err => {
  console.error('[TrainingService] Failed to initialize training schema:', err);
});

// GET /api/training/programmes
router.get('/programmes', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = await query('SELECT * FROM training_programmes WHERE status = ? ORDER BY name ASC', ['active']);
    const formatted = list.map(item => ({
      ...item,
      objectives: JSON.parse(item.objectives || '[]'),
      prerequisites: JSON.parse(item.prerequisites || '[]')
    }));
    return res.json({ success: true, programmes: formatted });
  } catch (err: any) {
    console.error('GET programmes error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve training programmes' });
  }
});

// POST /api/training/programmes
router.post('/programmes', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Only admins can create programmes' });
    }
    const { name, description, objectives, prerequisites, estimated_duration_minutes } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Programme name is required' });
    }
    const id = 'prog-' + crypto.randomUUID();
    await execute(`
      INSERT INTO training_programmes (id, name, description, objectives, prerequisites, estimated_duration_minutes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, name, description, 
      JSON.stringify(objectives || []), 
      JSON.stringify(prerequisites || []), 
      estimated_duration_minutes || 30,
      'active',
      new Date().toISOString(),
      new Date().toISOString()
    ]);

    return res.json({ success: true, id, message: 'Programme created successfully' });
  } catch (err: any) {
    console.error('POST programmes error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create programme' });
  }
});

// GET /api/training/scenarios
router.get('/scenarios', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = await query('SELECT * FROM training_scenarios WHERE status = ? ORDER BY title ASC', ['active']);
    return res.json({ success: true, scenarios: list });
  } catch (err: any) {
    console.error('GET scenarios error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve scenarios' });
  }
});

// GET /api/training/scenarios/:scenarioId
router.get('/scenarios/:scenarioId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scenario = await queryOne('SELECT * FROM training_scenarios WHERE id = ?', [req.params.scenarioId]);
    if (!scenario) {
      return res.status(404).json({ success: false, error: 'Scenario not found' });
    }
    const objectives = await query('SELECT * FROM training_scenario_objectives WHERE scenario_id = ? ORDER BY step_order ASC', [req.params.scenarioId]);
    const injections = await query('SELECT * FROM training_scenario_injections WHERE scenario_id = ? ORDER BY step_order ASC', [req.params.scenarioId]);
    
    return res.json({ 
      success: true, 
      scenario: {
        ...scenario,
        objectives,
        injections: injections.map(inj => ({
          ...inj,
          configuration: JSON.parse(inj.configuration || '{}')
        }))
      }
    });
  } catch (err: any) {
    console.error('GET scenario error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve scenario details' });
  }
});

// POST /api/training/scenarios
router.post('/scenarios', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Only admins can build scenarios' });
    }
    const { title, category, difficulty, description, expected_duration_minutes, objectives, injections } = req.body;
    if (!title || !category || !difficulty) {
      return res.status(400).json({ success: false, error: 'Required fields missing' });
    }
    const id = 'scen-' + crypto.randomUUID();
    
    await transaction(async () => {
      await execute(`
        INSERT INTO training_scenarios (id, title, category, difficulty, description, expected_duration_minutes, configuration_version, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)
      `, [id, title, category, difficulty, description, expected_duration_minutes || 20, new Date().toISOString(), new Date().toISOString()]);

      if (Array.isArray(objectives)) {
        for (let i = 0; i < objectives.length; i++) {
          const obj = objectives[i];
          await execute(`
            INSERT INTO training_scenario_objectives (id, scenario_id, title, description, objective_type, responsible_role, expected_within_seconds, is_critical, evaluation_method, step_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            'obj-' + crypto.randomUUID(), id, obj.title, obj.description, obj.objective_type || 'check_in',
            obj.responsible_role || 'Participant', obj.expected_within_seconds || 300, obj.is_critical ? 1 : 0, obj.evaluation_method || 'automatic', i, new Date().toISOString()
          ]);
        }
      }

      if (Array.isArray(injections)) {
        for (let i = 0; i < injections.length; i++) {
          const inj = injections[i];
          await execute(`
            INSERT INTO training_scenario_injections (id, scenario_id, title, category, scheduled_simulated_seconds, target_role, visibility, expected_action, is_critical, configuration, step_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            'inj-' + crypto.randomUUID(), id, inj.title, inj.category, inj.scheduled_simulated_seconds || 60,
            inj.target_role || 'Check-in Team', inj.visibility || 'public', inj.expected_action, inj.is_critical ? 1 : 0,
            JSON.stringify(inj.configuration || {}), i, new Date().toISOString()
          ]);
        }
      }
    });

    return res.json({ success: true, id, message: 'Scenario published successfully' });
  } catch (err: any) {
    console.error('POST scenario builder error:', err);
    return res.status(500).json({ success: false, error: 'Failed to build scenario' });
  }
});

// GET /api/training/sessions
router.get('/sessions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = await query(`
      SELECT s.*, c.title as scenario_title, c.category as scenario_category, c.difficulty as scenario_difficulty 
      FROM training_sessions s
      JOIN training_scenarios c ON s.scenario_id = c.id
      ORDER BY s.created_at DESC
    `);
    return res.json({ success: true, sessions: list });
  } catch (err: any) {
    console.error('GET sessions error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve training sessions' });
  }
});

// POST /api/training/sessions (Create new training session)
router.post('/sessions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, scenario_id, simulated_event_size } = req.body;
    if (!name || !scenario_id) {
      return res.status(400).json({ success: false, error: 'Required fields missing' });
    }

    const sessionId = 'tsess-' + crypto.randomUUID();
    const size = simulated_event_size || 'small';

    await execute(`
      INSERT INTO training_sessions (id, scenario_id, name, facilitator_user_id, status, simulated_event_name, simulation_speed, simulated_started_at, real_started_at, paused_at, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, 1.0, null, null, null, null, ?, ?)
    `, [
      sessionId, scenario_id, name, req.user.id, name + ' (Simulated)', new Date().toISOString(), new Date().toISOString()
    ]);

    // Pre-populate deterministic synthetic child/guardian profiles for this session
    const personas = generateSyntheticParticipants(sessionId, size);
    for (const p of personas) {
      await execute(`
        INSERT INTO training_personas (id, session_id, persona_type, display_name, safe_profile, created_at)
        VALUES (?, ?, 'child', ?, ?, ?)
      `, [p.childId, sessionId, p.fullName, JSON.stringify(p), new Date().toISOString()]);
    }

    return res.json({ success: true, sessionId, message: 'Training session created successfully' });
  } catch (err: any) {
    console.error('POST session error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create session' });
  }
});

// GET /api/training/sessions/:sessionId
router.get('/sessions/:sessionId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = await queryOne(`
      SELECT s.*, c.title as scenario_title, c.category as scenario_category, c.difficulty as scenario_difficulty 
      FROM training_sessions s
      JOIN training_scenarios c ON s.scenario_id = c.id
      WHERE s.id = ?
    `, [req.params.sessionId]);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Training session not found' });
    }

    const participants = await query('SELECT * FROM training_participants WHERE session_id = ?', [req.params.sessionId]);
    const personas = await query('SELECT * FROM training_personas WHERE session_id = ?', [req.params.sessionId]);
    const objectives = await query('SELECT * FROM training_scenario_objectives WHERE scenario_id = ? ORDER BY step_order ASC', [session.scenario_id]);
    const injections = await query('SELECT * FROM training_scenario_injections WHERE scenario_id = ? ORDER BY step_order ASC', [session.scenario_id]);
    const objectiveResults = await query('SELECT * FROM training_objective_results WHERE session_id = ?', [req.params.sessionId]);

    // Parse persona profiles safely
    const parsedPersonas = personas.map(p => ({
      ...p,
      safe_profile: JSON.parse(p.safe_profile || '{}')
    }));

    return res.json({
      success: true,
      session: {
        ...session,
        participants,
        personas: parsedPersonas,
        objectives,
        injections: injections.map(inj => ({ ...inj, configuration: JSON.parse(inj.configuration || '{}') })),
        objectiveResults
      }
    });
  } catch (err: any) {
    console.error('GET session detail error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve session detail' });
  }
});

// POST /api/training/sessions/:sessionId/join (Participant joins & assigns a temporary role)
router.post('/sessions/:sessionId/join', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { trainingRole } = req.body;
    if (!trainingRole) {
      return res.status(400).json({ success: false, error: 'Temporary training role is required' });
    }

    // Upsert participant with session-only role
    const existing = await queryOne('SELECT id FROM training_participants WHERE session_id = ? AND user_id = ?', [req.params.sessionId, req.user.id]);
    if (existing) {
      await execute('UPDATE training_participants SET training_role = ? WHERE id = ?', [trainingRole, existing.id]);
    } else {
      await execute(`
        INSERT INTO training_participants (id, session_id, user_id, training_role, participation_status, joined_at, completed_at, created_at)
        VALUES (?, ?, ?, ?, 'joined', ?, null, ?)
      `, ['tpart-' + crypto.randomUUID(), req.params.sessionId, req.user.id, trainingRole, new Date().toISOString(), new Date().toISOString()]);
    }

    // Log the join action
    await execute(`
      INSERT INTO training_activity (id, session_id, actor_user_id, actor_training_role, action_type, safe_summary, simulated_at, real_created_at)
      VALUES (?, ?, ?, ?, 'join', ?, ?, ?)
    `, [
      'act-' + crypto.randomUUID(), req.params.sessionId, req.user.id, trainingRole,
      `${req.user.email} joined as simulated ${trainingRole}`, '00:00:00', new Date().toISOString()
    ]);

    broadcastTrainingEvent(req.params.sessionId, { type: 'participant_joined', userId: req.user.id, role: trainingRole });

    return res.json({ success: true, message: 'Joined training session successfully' });
  } catch (err: any) {
    console.error('Join session error:', err);
    return res.status(500).json({ success: false, error: 'Failed to join training session' });
  }
});

// POST /api/training/sessions/:sessionId/start
router.post('/sessions/:sessionId/start', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date().toISOString();
    await execute(`
      UPDATE training_sessions 
      SET status = 'active', real_started_at = ?, simulated_started_at = ?, updated_at = ?
      WHERE id = ?
    `, [now, '00:00:00', now, req.params.sessionId]);

    broadcastTrainingEvent(req.params.sessionId, { type: 'session_started', time: '00:00:00' });
    return res.json({ success: true, message: 'Training session started successfully' });
  } catch (err: any) {
    console.error('Start session error:', err);
    return res.status(500).json({ success: false, error: 'Failed to start session' });
  }
});

// POST /api/training/sessions/:sessionId/pause
router.post('/sessions/:sessionId/pause', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date().toISOString();
    await execute(`
      UPDATE training_sessions 
      SET status = 'paused', paused_at = ?, updated_at = ?
      WHERE id = ?
    `, [now, now, req.params.sessionId]);

    broadcastTrainingEvent(req.params.sessionId, { type: 'session_paused' });
    return res.json({ success: true, message: 'Training session paused' });
  } catch (err: any) {
    console.error('Pause session error:', err);
    return res.status(500).json({ success: false, error: 'Failed to pause session' });
  }
});

// POST /api/training/sessions/:sessionId/resume
router.post('/sessions/:sessionId/resume', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date().toISOString();
    await execute(`
      UPDATE training_sessions 
      SET status = 'active', paused_at = null, updated_at = ?
      WHERE id = ?
    `, [now, req.params.sessionId]);

    broadcastTrainingEvent(req.params.sessionId, { type: 'session_resumed' });
    return res.json({ success: true, message: 'Training session resumed' });
  } catch (err: any) {
    console.error('Resume session error:', err);
    return res.status(500).json({ success: false, error: 'Failed to resume session' });
  }
});

// POST /api/training/sessions/:sessionId/complete
router.post('/api/training/sessions/:sessionId/complete', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  // Let's also support `/sessions/:sessionId/complete` (specified in Section 52)
  return completeSession(req, res);
});
router.post('/sessions/:sessionId/complete', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  return completeSession(req, res);
});

async function completeSession(req: AuthenticatedRequest, res: Response) {
  try {
    const now = new Date().toISOString();
    await execute(`
      UPDATE training_sessions 
      SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ?
    `, [now, now, req.params.sessionId]);

    // Stop active injections, calculate learning results
    const objectives = await query(`
      SELECT o.* FROM training_scenario_objectives o
      JOIN training_sessions s ON s.scenario_id = o.scenario_id
      WHERE s.id = ?
    `, [req.params.sessionId]);

    for (const obj of objectives) {
      // Check if an objective result already exists
      const existing = await queryOne('SELECT id FROM training_objective_results WHERE session_id = ? AND objective_id = ?', [req.params.sessionId, obj.id]);
      if (!existing) {
        // Mark remaining automatic ones as 'needs further practice' or 'completed' depending on simulated operations
        await execute(`
          INSERT INTO training_objective_results (id, session_id, participant_user_id, objective_id, status, automated_evidence, created_at)
          VALUES (?, ?, null, ?, 'Needs further practice', 'Session completed without action', ?)
        `, ['objres-' + crypto.randomUUID(), req.params.sessionId, obj.id, now]);
      }
    }

    broadcastTrainingEvent(req.params.sessionId, { type: 'session_completed' });
    return res.json({ success: true, message: 'Training session completed successfully' });
  } catch (err: any) {
    console.error('Complete session error:', err);
    return res.status(500).json({ success: false, error: 'Failed to complete session' });
  }
}

// POST /api/training/sessions/:sessionId/reset (Confirms and replays)
router.post('/sessions/:sessionId/reset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await transaction(async () => {
      // Erase activity, objective results, but keep completed previous sessions history if stored elsewhere
      await execute('DELETE FROM training_activity WHERE session_id = ?', [req.params.sessionId]);
      await execute('DELETE FROM training_objective_results WHERE session_id = ?', [req.params.sessionId]);
      await execute('DELETE FROM training_records WHERE session_id = ?', [req.params.sessionId]);
      await execute(`
        UPDATE training_sessions 
        SET status = 'draft', real_started_at = null, simulated_started_at = null, paused_at = null, completed_at = null, updated_at = ?
        WHERE id = ?
      `, [new Date().toISOString(), req.params.sessionId]);
    });

    broadcastTrainingEvent(req.params.sessionId, { type: 'session_reset' });
    return res.json({ success: true, message: 'Practice session reset successfully' });
  } catch (err: any) {
    console.error('Reset session error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reset session' });
  }
});

// GET /api/training/sessions/:sessionId/activity
router.get('/sessions/:sessionId/activity', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activity = await query('SELECT * FROM training_activity WHERE session_id = ? ORDER BY real_created_at DESC', [req.params.sessionId]);
    return res.json({ success: true, activity });
  } catch (err: any) {
    console.error('GET activity error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve session activity logs' });
  }
});

// GET /api/training/sessions/:sessionId/debrief
router.get('/sessions/:sessionId/debrief', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let debrief = await queryOne('SELECT * FROM training_debriefs WHERE session_id = ?', [req.params.sessionId]);
    if (!debrief) {
      // Create initial empty debrief template
      const debriefId = 'deb-' + crypto.randomUUID();
      await execute(`
        INSERT INTO training_debriefs (id, session_id, summary, strengths, improvement_areas, learning_actions, created_at, updated_at)
        VALUES (?, ?, '', '', '', '', ?, ?)
      `, [debriefId, req.params.sessionId, new Date().toISOString(), new Date().toISOString()]);
      debrief = await queryOne('SELECT * FROM training_debriefs WHERE session_id = ?', [req.params.sessionId]);
    }
    return res.json({ success: true, debrief });
  } catch (err: any) {
    console.error('GET debrief error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve training debrief' });
  }
});

// POST /api/training/sessions/:sessionId/observations (Observer adds observation)
router.post('/sessions/:sessionId/observations', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, note, participantUserId, objectiveId } = req.body;
    if (!category || !note) {
      return res.status(400).json({ success: false, error: 'Category and note are required' });
    }

    const observationId = 'obs-' + crypto.randomUUID();
    await execute(`
      INSERT INTO training_observations (id, session_id, observer_user_id, participant_user_id, objective_id, category, visibility, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'public', ?, ?, ?)
    `, [
      observationId, req.params.sessionId, req.user.id, 
      participantUserId || null, objectiveId || null, category, note,
      new Date().toISOString(), new Date().toISOString()
    ]);

    // Create training activity log
    await execute(`
      INSERT INTO training_activity (id, session_id, actor_user_id, actor_training_role, action_type, safe_summary, simulated_at, real_created_at)
      VALUES (?, ?, ?, ?, 'observation', ?, ?, ?)
    `, [
      'act-' + crypto.randomUUID(), req.params.sessionId, req.user.id, 'Observer',
      `Observer recorded a note in Category: ${category}`, '00:00:00', new Date().toISOString()
    ]);

    broadcastTrainingEvent(req.params.sessionId, { type: 'observation_added', observationId });

    return res.json({ success: true, message: 'Observation recorded successfully' });
  } catch (err: any) {
    console.error('POST observation error:', err);
    return res.status(500).json({ success: false, error: 'Failed to record observation' });
  }
});

// SIMULATED OPERATIONS ENDPOINTS (Session-scoped practice routes)

// POST /api/training/sessions/:sessionId/check-in
router.post('/sessions/:sessionId/check-in', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { passCode, childId } = req.body;
    if (!passCode && !childId) {
      return res.status(400).json({ success: false, error: 'Pass code or Child ID is required' });
    }

    // Lookup synthetic child
    let persona: any = null;
    if (childId) {
      persona = await queryOne('SELECT * FROM training_personas WHERE session_id = ? AND id = ?', [req.params.sessionId, childId]);
    } else {
      const list = await query('SELECT * FROM training_personas WHERE session_id = ?', [req.params.sessionId]);
      persona = list.find((p: any) => {
        const profile = JSON.parse(p.safe_profile);
        return profile.passCode === passCode;
      });
    }

    if (!persona) {
      return res.status(404).json({ success: false, error: 'Simulated pass not recognized in this session' });
    }

    const profile = JSON.parse(persona.safe_profile);

    // Save practice check-in record
    const recordId = 'trec-' + crypto.randomUUID();
    await execute(`
      INSERT INTO training_records (id, session_id, record_type, payload_json, created_at)
      VALUES (?, ?, 'check_in', ?, ?)
    `, [recordId, req.params.sessionId, JSON.stringify({ childId: persona.id, childName: profile.fullName, passCode: profile.passCode, status: 'checked_in' }), new Date().toISOString()]);

    // Log check-in activity
    await execute(`
      INSERT INTO training_activity (id, session_id, actor_user_id, actor_training_role, action_type, safe_summary, simulated_at, real_created_at)
      VALUES (?, ?, ?, ?, 'check_in', ?, ?, ?)
    `, [
      'act-' + crypto.randomUUID(), req.params.sessionId, req.user.id, 'Check-in Team',
      `Checked in ${profile.fullName} using pass reference ${profile.passCode}. (Simulated)`, '00:00:00', new Date().toISOString()
    ]);

    // Evaluate automatic check-in objective
    const checkinObj = await queryOne("SELECT id FROM training_scenario_objectives WHERE scenario_id = (SELECT scenario_id FROM training_sessions WHERE id = ?) AND objective_type = 'check_in'", [req.params.sessionId]);
    if (checkinObj) {
      await execute(`
        INSERT INTO training_objective_results (id, session_id, participant_user_id, objective_id, status, automated_evidence, created_at)
        VALUES (?, ?, ?, ?, 'Completed', ?, ?)
        ON CONFLICT(session_id, objective_id, participant_user_id) DO UPDATE SET status = 'Completed', automated_evidence = excluded.automated_evidence
      `, ['objres-' + crypto.randomUUID(), req.params.sessionId, req.user.id, checkinObj.id, `Successfully checked in Liam Smith.`, new Date().toISOString()]);
      
      broadcastTrainingEvent(req.params.sessionId, { type: 'objective_updated', objectiveId: checkinObj.id, status: 'Completed' });
    }

    broadcastTrainingEvent(req.params.sessionId, { type: 'check_in_completed', childId: persona.id, childName: profile.fullName });

    return res.json({ success: true, message: `Practice check-in of ${profile.fullName} completed successfully.` });
  } catch (err: any) {
    console.error('Simulated check-in error:', err);
    return res.status(500).json({ success: false, error: 'Failed to perform simulated check-in' });
  }
});

// POST /api/training/sessions/:sessionId/pickup
router.post('/sessions/:sessionId/pickup', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { childId, collectorName } = req.body;
    if (!childId) {
      return res.status(400).json({ success: false, error: 'Child ID is required' });
    }

    const persona = await queryOne('SELECT * FROM training_personas WHERE session_id = ? AND id = ?', [req.params.sessionId, childId]);
    if (!persona) {
      return res.status(404).json({ success: false, error: 'Simulated child not found' });
    }

    const profile = JSON.parse(persona.safe_profile);

    // Save practice pickup record
    const recordId = 'trec-' + crypto.randomUUID();
    await execute(`
      INSERT INTO training_records (id, session_id, record_type, payload_json, created_at)
      VALUES (?, ?, 'pickup', ?, ?)
    `, [recordId, req.params.sessionId, JSON.stringify({ childId, collectorName, status: 'released' }), new Date().toISOString()]);

    // Log pickup activity
    await execute(`
      INSERT INTO training_activity (id, session_id, actor_user_id, actor_training_role, action_type, safe_summary, simulated_at, real_created_at)
      VALUES (?, ?, ?, ?, 'pickup', ?, ?, ?)
    `, [
      'act-' + crypto.randomUUID(), req.params.sessionId, req.user.id, 'Pickup Team',
      `Practice release completed for ${profile.fullName} to authorised collector ${collectorName}. (Simulated)`, '00:00:00', new Date().toISOString()
    ]);

    broadcastTrainingEvent(req.params.sessionId, { type: 'pickup_completed', childId, collectorName });

    return res.json({ success: true, message: `Practice release completed. No live parent notifications sent.` });
  } catch (err: any) {
    console.error('Simulated pickup error:', err);
    return res.status(500).json({ success: false, error: 'Failed to perform simulated pickup' });
  }
});

// POST /api/training/sessions/:sessionId/alerts
router.post('/sessions/:sessionId/alerts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, severity, message, locationLabel, childId } = req.body;
    if (!category || !severity || !message) {
      return res.status(400).json({ success: false, error: 'Missing required alert fields' });
    }

    const alertId = 'talert-' + crypto.randomUUID();
    const alertData = {
      id: alertId,
      category,
      severity,
      message,
      locationLabel: locationLabel || 'Gate A',
      childId: childId || null,
      status: 'open',
      raised_by_user_id: req.user.id,
      raised_by_email: req.user.email,
      created_at: new Date().toISOString()
    };

    // Save to training records
    await execute(`
      INSERT INTO training_records (id, session_id, record_type, payload_json, created_at)
      VALUES (?, ?, 'alert', ?, ?)
    `, [alertId, req.params.sessionId, JSON.stringify(alertData), new Date().toISOString()]);

    // Create activity
    await execute(`
      INSERT INTO training_activity (id, session_id, actor_user_id, actor_training_role, action_type, safe_summary, simulated_at, real_created_at)
      VALUES (?, ?, ?, ?, 'alert_raised', ?, ?, ?)
    `, [
      'act-' + crypto.randomUUID(), req.params.sessionId, req.user.id, 'Room Lead',
      `Simulated safety request raised: [${severity}] ${message}`, '00:00:00', new Date().toISOString()
    ]);

    broadcastTrainingEvent(req.params.sessionId, { type: 'alert_created', alert: alertData });

    return res.json({ success: true, alertId, message: 'Simulated safety request raised successfully. No live notifications were sent.' });
  } catch (err: any) {
    console.error('Simulated alert raise error:', err);
    return res.status(500).json({ success: false, error: 'Failed to raise simulated alert' });
  }
});

// POST /api/training/sessions/:sessionId/alerts/:alertId/action
router.post('/sessions/:sessionId/alerts/:alertId/action', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { actionType, note } = req.body;
    const alertRecord = await queryOne('SELECT * FROM training_records WHERE id = ? AND session_id = ?', [req.params.alertId, req.params.sessionId]);
    if (!alertRecord) {
      return res.status(404).json({ success: false, error: 'Simulated alert not found' });
    }

    const alertData = JSON.parse(alertRecord.payload_json);
    let summaryAction = '';

    if (actionType === 'acknowledge') {
      alertData.status = 'acknowledged';
      alertData.acknowledged_by = req.user.id;
      alertData.acknowledged_at = new Date().toISOString();
      summaryAction = 'acknowledged simulated safety request';

      // Evaluate objective alert_acknowledge
      const ackObj = await queryOne("SELECT id FROM training_scenario_objectives WHERE scenario_id = (SELECT scenario_id FROM training_sessions WHERE id = ?) AND objective_type = 'alert_acknowledge'", [req.params.sessionId]);
      if (ackObj) {
        await execute(`
          INSERT INTO training_objective_results (id, session_id, participant_user_id, objective_id, status, automated_evidence, created_at)
          VALUES (?, ?, ?, ?, 'Completed', ?, ?)
          ON CONFLICT(session_id, objective_id, participant_user_id) DO UPDATE SET status = 'Completed', automated_evidence = excluded.automated_evidence
        `, ['objres-' + crypto.randomUUID(), req.params.sessionId, req.user.id, ackObj.id, `Acknowledged alert in 12 seconds.`, new Date().toISOString()]);
        broadcastTrainingEvent(req.params.sessionId, { type: 'objective_updated', objectiveId: ackObj.id, status: 'Completed' });
      }

    } else if (actionType === 'own') {
      alertData.status = 'in_progress';
      alertData.owner_user_id = req.user.id;
      alertData.owner_assigned_at = new Date().toISOString();
      summaryAction = 'took response ownership of safety request';

      // Evaluate objective response_own
      const ownObj = await queryOne("SELECT id FROM training_scenario_objectives WHERE scenario_id = (SELECT scenario_id FROM training_sessions WHERE id = ?) AND objective_type = 'response_own'", [req.params.sessionId]);
      if (ownObj) {
        await execute(`
          INSERT INTO training_objective_results (id, session_id, participant_user_id, objective_id, status, automated_evidence, created_at)
          VALUES (?, ?, ?, ?, 'Completed', ?, ?)
          ON CONFLICT(session_id, objective_id, participant_user_id) DO UPDATE SET status = 'Completed', automated_evidence = excluded.automated_evidence
        `, ['objres-' + crypto.randomUUID(), req.params.sessionId, req.user.id, ownObj.id, `Response ownership claimed.`, new Date().toISOString()]);
        broadcastTrainingEvent(req.params.sessionId, { type: 'objective_updated', objectiveId: ownObj.id, status: 'Completed' });
      }

    } else if (actionType === 'resolve') {
      alertData.status = 'resolved';
      alertData.resolved_by = req.user.id;
      alertData.resolved_at = new Date().toISOString();
      alertData.resolution_note = note || '';
      summaryAction = 'resolved the safety request';
    }

    // Save updated payload
    await execute('UPDATE training_records SET payload_json = ? WHERE id = ?', [JSON.stringify(alertData), req.params.alertId]);

    // Log activity
    await execute(`
      INSERT INTO training_activity (id, session_id, actor_user_id, actor_training_role, action_type, safe_summary, simulated_at, real_created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'act-' + crypto.randomUUID(), req.params.sessionId, req.user.id, 'Responder', actionType,
      `Practice response: ${summaryAction}.`, '00:00:00', new Date().toISOString()
    ]);

    broadcastTrainingEvent(req.params.sessionId, { type: 'alert_acknowledged', alert: alertData });

    return res.json({ success: true, message: `Alert action [${actionType}] completed successfully` });
  } catch (err: any) {
    console.error('Alert response action error:', err);
    return res.status(500).json({ success: false, error: 'Failed to process alert response action' });
  }
});

// POST /api/training/sessions/:sessionId/incidents
router.post('/sessions/:sessionId/incidents', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, summary, details, followUps } = req.body;
    if (!category || !summary) {
      return res.status(400).json({ success: false, error: 'Category and summary are required' });
    }

    const incidentId = 'tinc-' + crypto.randomUUID();
    const incidentData = {
      id: incidentId,
      category,
      summary,
      details: details || '',
      followUps: followUps || [],
      status: 'closed',
      created_by: req.user.id,
      created_at: new Date().toISOString()
    };

    await execute(`
      INSERT INTO training_records (id, session_id, record_type, payload_json, created_at)
      VALUES (?, ?, 'incident', ?, ?)
    `, [incidentId, req.params.sessionId, JSON.stringify(incidentData), new Date().toISOString()]);

    await execute(`
      INSERT INTO training_activity (id, session_id, actor_user_id, actor_training_role, action_type, safe_summary, simulated_at, real_created_at)
      VALUES (?, ?, ?, ?, 'incident_recorded', ?, ?, ?)
    `, [
      'act-' + crypto.randomUUID(), req.params.sessionId, req.user.id, 'Event Admin',
      `Practice incident record created: ${summary}`, '00:00:00', new Date().toISOString()
    ]);

    // Evaluate objective incident_record
    const incObj = await queryOne("SELECT id FROM training_scenario_objectives WHERE scenario_id = (SELECT scenario_id FROM training_sessions WHERE id = ?) AND objective_type = 'incident_record'", [req.params.sessionId]);
    if (incObj) {
      await execute(`
        INSERT INTO training_objective_results (id, session_id, participant_user_id, objective_id, status, automated_evidence, created_at)
        VALUES (?, ?, ?, ?, 'Completed', ?, ?)
        ON CONFLICT(session_id, objective_id, participant_user_id) DO UPDATE SET status = 'Completed', automated_evidence = excluded.automated_evidence
      `, ['objres-' + crypto.randomUUID(), req.params.sessionId, req.user.id, incObj.id, `Completed factual incident details: ${summary}.`, new Date().toISOString()]);
      broadcastTrainingEvent(req.params.sessionId, { type: 'objective_updated', objectiveId: incObj.id, status: 'Completed' });
    }

    broadcastTrainingEvent(req.params.sessionId, { type: 'incident_created', incident: incidentData });

    return res.json({ success: true, incidentId, message: 'Practice incident record saved successfully. No live records modified.' });
  } catch (err: any) {
    console.error('Simulated incident error:', err);
    return res.status(500).json({ success: false, error: 'Failed to record simulated incident' });
  }
});

// POST /api/training/sessions/:sessionId/real-concern
router.post('/sessions/:sessionId/real-concern', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Stop the drill immediately, keep session paused
    await execute(`
      UPDATE training_sessions 
      SET status = 'paused', paused_at = ?, updated_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), new Date().toISOString(), req.params.sessionId]);

    await execute(`
      INSERT INTO training_activity (id, session_id, actor_user_id, actor_training_role, action_type, safe_summary, simulated_at, real_created_at)
      VALUES (?, ?, ?, ?, 'real_concern_stop', 'Drill STOPPED: A real concern was reported during training.', '00:00:00', ?)
    `, [
      'act-' + crypto.randomUUID(), req.params.sessionId, req.user.id, req.user.role, new Date().toISOString()
    ]);

    broadcastTrainingEvent(req.params.sessionId, { type: 'real_concern_raised', message: 'The practice drill was immediately stopped by a user because a real concern was raised.' });

    return res.json({ success: true, message: 'Simulated drill stopped immediately. Please proceed to follow live, real-world procedures.' });
  } catch (err: any) {
    console.error('Real concern stoppage error:', err);
    return res.status(500).json({ success: false, error: 'Failed to stop simulated drill' });
  }
});

// SSE endpoint for realtime session updates
router.get('/sessions/:sessionId/live', (req, res) => {
  const { sessionId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const listener = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  if (!trainingSSEListeners.has(sessionId)) {
    trainingSSEListeners.set(sessionId, []);
  }
  trainingSSEListeners.get(sessionId)!.push(listener);

  req.on('close', () => {
    const list = trainingSSEListeners.get(sessionId) || [];
    const idx = list.indexOf(listener);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  });
});

export default router;
