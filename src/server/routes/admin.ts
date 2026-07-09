import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';
import { authMiddleware, AuthenticatedRequest, verifyPassword, hashPassword, generateToken } from '../auth';
import { syncJobsForEvent, executeTestNotification, sendWhatsApp } from '../services/notifications';
import { sendEmail, sendVolunteerApprovedEmail } from '../services/email';

const router = Router();

// Public Auth Endpoints for Admin Access
router.post('/sign-in', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await queryOne('SELECT * FROM users WHERE email = ?', [cleanEmail]);

    if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.'
      });
    }

    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'team') {
      return res.status(403).json({
        success: false,
        code: 'ADMIN_ACCESS_REQUIRED',
        message: 'Admin Access is not enabled for this account.'
      });
    }

    const token = generateToken(user.id);
    
    // Resolve full name
    let fullName = 'Admin';
    const parentProfile = await queryOne('SELECT full_name FROM parent_profiles WHERE user_id = ?', [user.id]);
    if (parentProfile && parentProfile.full_name) {
      fullName = parentProfile.full_name;
    } else {
      const volunteerProfile = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ?', [user.id]);
      if (volunteerProfile && volunteerProfile.full_name) {
        fullName = volunteerProfile.full_name;
      }
    }

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName,
        role: user.role
      }
    });
  } catch (err: any) {
    console.error('Admin Sign-In Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await queryOne('SELECT * FROM users WHERE email = ?', [cleanEmail]);

    // Secure design pattern: Do not disclose user existence
    if (!user) {
      return res.json({
        success: true,
        message: 'If an admin account with that email exists, a password reset link has been sent.'
      });
    }

    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'team') {
      return res.status(403).json({
        success: false,
        code: 'ADMIN_ACCESS_REQUIRED',
        message: 'Admin Access is not enabled for this account.'
      });
    }

    // Generate secure reset token
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    const tokenId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await execute(`
      INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
      VALUES (?, ?, ?, 'password_reset', ?, ?)
    `, [tokenId, user.id, resetTokenHash, expiresAt, now]);

    const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');
    const resetLink = `${baseUrl}/#/admin/reset-password?token=${rawResetToken}`;

    const htmlContent = `
      <p>Hello,</p>
      <p>We received a request to reset the password for your Koinonia Admin Access.</p>
      <p>Please click the link below to create a new password:</p>
      <div style="margin: 28px 0;">
        <a href="${resetLink}" style="background-color: #C59B27; color: #FFFFFF; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-size: 15px;">
          Create new password
        </a>
      </div>
      <p>If you did not request this, you can safely ignore this email.</p>
      <p>Best regards,<br/>Koinonia Team</p>
    `;

    // Send email
    await sendEmail({
      to: cleanEmail,
      subject: 'Reset your Admin Access password',
      html: htmlContent
    }).catch(err => {
      console.error('Error sending admin reset email:', err);
    });

    return res.json({
      success: true,
      message: 'If an admin account with that email exists, a password reset link has been sent.'
    });
  } catch (err: any) {
    console.error('Admin Forgot Password Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Token and password are required.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const dbToken = await queryOne(
      "SELECT * FROM auth_tokens WHERE token_hash = ? AND token_type = 'password_reset'",
      [tokenHash]
    );

    if (!dbToken || dbToken.used_at || new Date(dbToken.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: 'This reset token is invalid or has expired.' });
    }

    const nowStr = new Date().toISOString();
    const hashedPwd = hashPassword(password);

    await transaction(async () => {
      await execute('UPDATE auth_tokens SET used_at = ? WHERE id = ?', [nowStr, dbToken.id]);
      await execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashedPwd, nowStr, dbToken.user_id]);
    });

    return res.json({ success: true, message: 'Your password has been updated.' });
  } catch (err: any) {
    console.error('Admin Reset Password Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Token and password are required.' });
    }

    // Validate Password
    const hasLetter = /[a-zA-Z]/.test(password || '');
    const hasNumber = /[0-9]/.test(password || '');
    if (password.length < 8 || !hasLetter || !hasNumber) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Choose a stronger password (at least 8 characters with a letter and a number).'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const dbToken = await queryOne(
      "SELECT * FROM auth_tokens WHERE token_hash = ? AND token_type = 'admin_invite'",
      [tokenHash]
    );

    if (!dbToken || dbToken.used_at || new Date(dbToken.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: 'This invitation link is invalid or has expired.' });
    }

    const nowStr = new Date().toISOString();
    const hashedPwd = hashPassword(password);

    await transaction(async () => {
      await execute('UPDATE auth_tokens SET used_at = ? WHERE id = ?', [nowStr, dbToken.id]);
      await execute(
        'UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?',
        [hashedPwd, nowStr, dbToken.user_id]
      );
    });

    return res.json({ success: true, message: 'Your admin account has been activated.' });
  } catch (err: any) {
    console.error('Admin Accept Invite Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'team')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  let fullName = 'Admin';
  const parentProfile = await queryOne('SELECT full_name FROM parent_profiles WHERE user_id = ?', [req.user.id]);
  if (parentProfile && parentProfile.full_name) {
    fullName = parentProfile.full_name;
  } else {
    const volunteerProfile = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ?', [req.user.id]);
    if (volunteerProfile && volunteerProfile.full_name) {
      fullName = volunteerProfile.full_name;
    }
  }
  return res.json({
    user: { ...req.user, fullName },
    profile: req.parentProfile
  });
});

// Public Landing Page Settings endpoint
router.get('/public-landing-page', async (req, res) => {
  try {
    const rows = await query('SELECT setting_key, setting_value, value_type FROM admin_landing_settings');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value || '';
    }
    return res.json({ success: true, settings });
  } catch (err: any) {
    console.error('Error fetching public landing settings:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve landing page settings' });
  }
});

// Mount auth middleware for all subsequent admin routes
router.use(authMiddleware);

// Middleware to check if user is an admin or we are in development mode
function adminCheck(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'team' || process.env.NODE_ENV !== 'production')) {
    return next();
  }
  return res.status(403).json({ error: 'Access denied. Admin role required.' });
}

router.use(adminCheck);

// POST change password for currently signed-in admin
router.post('/change-password', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required.' });
    }

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.user?.id]);
    if (!user || !user.password_hash || !verifyPassword(currentPassword, user.password_hash)) {
      return res.status(400).json({
        success: false,
        code: 'CURRENT_PASSWORD_INCORRECT',
        message: 'Current password is incorrect.'
      });
    }

    // Validate Password
    const hasLetter = /[a-zA-Z]/.test(newPassword || '');
    const hasNumber = /[0-9]/.test(newPassword || '');
    if (newPassword.length < 8 || !hasLetter || !hasNumber) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Choose a stronger password (at least 8 characters with a letter and a number).'
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        code: 'SAME_PASSWORD',
        message: 'New password cannot be the same as your current password.'
      });
    }

    const hashedPwd = hashPassword(newPassword);
    const nowStr = new Date().toISOString();

    await execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashedPwd, nowStr, req.user?.id]);

    return res.json({
      success: true,
      message: 'Your password has been updated.'
    });
  } catch (err: any) {
    console.error('Admin Change Password Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET list of admins
router.get('/admins', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admins = await query(`
      SELECT u.id, u.email, u.role, u.created_at, u.password_hash,
             COALESCE(p.full_name, v.full_name, 'Admin') as full_name
      FROM users u
      LEFT JOIN parent_profiles p ON p.user_id = u.id
      LEFT JOIN volunteer_profiles v ON v.user_id = u.id
      WHERE u.role IN ('admin', 'super_admin', 'team')
      ORDER BY u.created_at DESC
    `);
    
    // Format to clean response
    const formatted = admins.map((adm: any) => ({
      id: adm.id,
      email: adm.email,
      role: adm.role,
      fullName: adm.full_name,
      createdAt: adm.created_at,
      status: (!adm.password_hash || adm.password_hash === 'invited_pending') ? 'invited' : 'active'
    }));

    return res.json({ success: true, admins: formatted });
  } catch (err: any) {
    console.error('Error fetching admin users list:', err);
    return res.status(500).json({ error: 'Failed to fetch admin list.' });
  }
});

// POST invite other admins
router.post('/invites', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only super_admin can invite other admins
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super_admin can invite new admins.'
      });
    }

    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ success: false, error: 'Email and role are required.' });
    }

    if (role !== 'admin' && role !== 'super_admin' && role !== 'team') {
      return res.status(400).json({ success: false, error: 'Invalid admin role requested.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Check existing user
    const existingUser = await queryOne('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (existingUser) {
      if (existingUser.role === 'admin' || existingUser.role === 'super_admin' || existingUser.role === 'team') {
        return res.status(400).json({
          success: false,
          code: 'ALREADY_ADMIN',
          message: 'Account with this email already has admin access.'
        });
      } else {
        return res.status(400).json({
          success: false,
          code: 'ACCOUNT_EXISTS_CONFIRM_UPGRADE_REQUIRED',
          message: 'Account exists as a parent/volunteer. Please upgrade their role via the Users panel instead.'
        });
      }
    }

    const invitedUserId = crypto.randomUUID();
    const nowStr = new Date().toISOString();

    // Create the invited user record
    await execute(`
      INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, ?, 'invited_pending', ?, 0, ?, ?)
    `, [invitedUserId, cleanEmail, role, nowStr, nowStr]);

    // Create profile
    const profileId = crypto.randomUUID();
    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [profileId, invitedUserId, 'Invited Admin', cleanEmail, nowStr, nowStr]);

    // Generate secure invite token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours

    await execute(`
      INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
      VALUES (?, ?, ?, 'admin_invite', ?, ?)
    `, [tokenId, invitedUserId, tokenHash, expiresAt, nowStr]);

    const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');
    const inviteLink = `${baseUrl}/#/admin/accept-invite?token=${rawToken}`;

    const htmlContent = `
      <p>Hello,</p>
      <p>You have been invited to help manage Koinonia Children and Teens event review, attendance, and reports.</p>
      <p>Role assigned: <strong>${role === 'super_admin' ? 'Super Admin' : 'Admin'}</strong></p>
      <p>Please click the button below to accept this invitation and set up your password:</p>
      <div style="margin: 28px 0;">
        <a href="${inviteLink}" style="background-color: #C59B27; color: #FFFFFF; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-size: 15px;">
          Accept Invitation
        </a>
      </div>
      <p>If you were not expecting this, you can safely ignore this email.</p>
      <p>Best regards,<br/>Koinonia Children and Teens Team</p>
    `;

    // Send invite email
    await sendEmail({
      to: cleanEmail,
      subject: "You're invited to Koinonia Admin Access",
      html: htmlContent
    }).catch(err => {
      console.error('Error sending admin invitation email:', err);
    });

    return res.json({
      success: true,
      message: 'Invitation sent successfully to ' + cleanEmail
    });
  } catch (err: any) {
    console.error('Admin Invitation Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET list of child applications
router.get('/applications', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventId = 'event-ga-2026';
    // Query child applications with parent and child details
    const applications = await query(`
      SELECT 
        e.id as entry_id,
        e.child_id,
        e.status,
        e.school_class,
        e.school_name,
        e.previous_children_programme,
        e.note_to_team,
        e.has_medical_notes,
        e.medical_notes,
        e.needs_extra_support,
        e.support_notes,
        e.submitted_at,
        c.full_name as child_name,
        c.gender,
        c.date_of_birth,
        c.calculated_age,
        c.age_group,
        c.relationship_to_child,
        c.needs_age_review,
        m.secure_url as child_photo_url,
        p.id as parent_id,
        p.full_name as parent_name,
        p.phone_number,
        p.whatsapp_number,
        p.email as parent_email,
        p.is_koinonia_worker,
        p.department as parent_department,
        p.photo_file_id as parent_photo_file_id,
        pm.secure_url as parent_photo_url
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      LEFT JOIN media_files m ON m.id = c.photo_file_id
      LEFT JOIN media_files pm ON pm.id = p.photo_file_id
      WHERE e.event_id = ?
      ORDER BY e.submitted_at DESC, e.created_at DESC
    `, [eventId]);

    // Query all pickup people
    const pickupPeople = await query(`
      SELECT p.*, m.secure_url as photo_url
      FROM pickup_people p
      LEFT JOIN media_files m ON m.id = p.photo_file_id
    `);

    // Format response items
    const formatted = applications.map((app: any) => {
      const entryPickups = pickupPeople.filter((p: any) => p.child_event_entry_id === app.entry_id)
        .map((p: any) => ({
          id: p.id,
          fullName: p.full_name,
          relationship: p.relationship_to_child,
          phone: p.phone_number,
          whatsapp: p.whatsapp_number,
          photoUrl: p.photo_url,
          approved: p.approved_by_parent === 1
        }));

      return {
        id: app.entry_id,
        childId: app.child_id,
        status: app.status,
        schoolClass: app.school_class,
        schoolName: app.school_name,
        previousProgramme: app.previous_children_programme,
        noteToTeam: app.note_to_team,
        hasMedicalNotes: app.has_medical_notes === 1,
        medicalNotes: app.medical_notes,
        needsExtraSupport: app.needs_extra_support === 1,
        supportNotes: app.support_notes,
        submittedAt: app.submitted_at,
        child: {
          fullName: app.child_name,
          gender: app.gender,
          dob: app.date_of_birth,
          age: app.calculated_age,
          ageGroup: app.age_group,
          relationship: app.relationship_to_child,
          needsAgeReview: app.needs_age_review === 1,
          photoUrl: app.child_photo_url
        },
        parent: {
          id: app.parent_id,
          fullName: app.parent_name,
          phone: app.phone_number,
          whatsapp: app.whatsapp_number,
          email: app.parent_email,
          isWorker: app.is_koinonia_worker === 1,
          department: app.parent_department,
          photoUrl: app.parent_photo_url || (app.parent_photo_file_id ? (app.parent_photo_file_id.startsWith('http') || app.parent_photo_file_id.startsWith('/') ? app.parent_photo_file_id : `/api/media/files/${app.parent_photo_file_id}`) : '')
        },
        pickupPeople: entryPickups
      };
    });

    return res.json({ success: true, applications: formatted });
  } catch (err: any) {
    console.error('Error fetching applications list:', err);
    return res.status(500).json({ error: 'Failed to fetch child applications.' });
  }
});

// GET children records list with stats and filtering
router.get('/children', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'team')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const eventId = 'event-ga-2026';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const filter = typeof req.query.filter === 'string' ? req.query.filter : '';

    // 1. Fetch stats
    const totalRes = await queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ?', [eventId]);
    const selectedRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')", [eventId]);
    const checkedInRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('checked_in', 'inside', 'picked_up')", [eventId]);
    const insideRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('checked_in', 'inside')", [eventId]);
    const pickedUpRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'picked_up'", [eventId]);
    
    const needsAttentionRes = await queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.has_medical_notes = 1 OR e.needs_extra_support = 1 OR c.needs_age_review = 1)
    `, [eventId]);

    // 2. Fetch Children Records
    let queryStr = `
      SELECT 
        e.id as entry_id,
        e.child_id,
        e.status,
        e.school_class,
        e.school_name,
        e.has_medical_notes,
        e.medical_notes,
        e.needs_extra_support,
        e.support_notes,
        e.submitted_at,
        c.full_name as child_name,
        c.gender,
        c.date_of_birth,
        c.calculated_age,
        c.age_group,
        c.needs_age_review,
        m.secure_url as child_photo_url,
        p.id as parent_id,
        p.full_name as parent_name,
        p.phone_number,
        p.photo_file_id as parent_photo_file_id,
        pm.secure_url as parent_photo_url
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      LEFT JOIN media_files m ON m.id = c.photo_file_id
      LEFT JOIN media_files pm ON pm.id = p.photo_file_id
      WHERE e.event_id = ?
    `;

    const queryParams: any[] = [eventId];

    if (q) {
      queryStr += ` AND (
        c.full_name LIKE ? OR 
        p.full_name LIKE ? OR 
        p.phone_number LIKE ?
      )`;
      const searchPattern = `%${q}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    if (filter === 'inside') {
      queryStr += ` AND e.status IN ('checked_in', 'inside')`;
    } else if (filter === 'not_arrived') {
      queryStr += ` AND e.status NOT IN ('checked_in', 'inside', 'picked_up')`;
    } else if (filter === 'picked_up') {
      queryStr += ` AND e.status = 'picked_up'`;
    } else if (filter === 'medical_note') {
      queryStr += ` AND e.has_medical_notes = 1`;
    } else if (filter === 'missing_pickup_photo') {
      queryStr += ` AND EXISTS (
        SELECT 1 FROM pickup_people pp 
        WHERE pp.child_event_entry_id = e.id AND (pp.photo_file_id IS NULL OR pp.photo_file_id = '')
      )`;
    } else if (filter === 'below_event_age') {
      queryStr += ` AND c.needs_age_review = 1`;
    } else if (filter === 'special_support') {
      queryStr += ` AND e.needs_extra_support = 1`;
    }

    queryStr += ` ORDER BY c.full_name ASC`;

    const childrenRows = await query(queryStr, queryParams);

    const pickupPeople = await query(`
      SELECT p.*, m.secure_url as photo_url
      FROM pickup_people p
      LEFT JOIN media_files m ON m.id = p.photo_file_id
    `);

    const formatted = childrenRows.map((app: any) => {
      const entryPickups = pickupPeople.filter((p: any) => p.child_event_entry_id === app.entry_id)
        .map((p: any) => ({
          id: p.id,
          fullName: p.full_name,
          relationship: p.relationship_to_child,
          phone: p.phone_number,
          whatsapp: p.whatsapp_number,
          photoUrl: p.photo_url,
          approved: p.approved_by_parent === 1
        }));

      const flags: string[] = [];
      if (app.has_medical_notes === 1) flags.push('medical_notes');
      if (app.needs_extra_support === 1) flags.push('special_support');
      if (app.needs_age_review === 1) flags.push('needs_age_review');
      if (entryPickups.length === 0) {
        flags.push('missing_pickup_person');
      } else if (entryPickups.some((pp: any) => !pp.photoUrl)) {
        flags.push('missing_pickup_photo');
      }

      let entryStatus: 'checked_in' | 'not_arrived' = 'not_arrived';
      let pickupStatus: 'inside' | 'picked_up' | 'not_picked_up' = 'not_picked_up';

      if (app.status === 'checked_in' || app.status === 'inside') {
        entryStatus = 'checked_in';
        pickupStatus = 'inside';
      } else if (app.status === 'picked_up') {
        entryStatus = 'checked_in';
        pickupStatus = 'picked_up';
      }

      return {
        id: app.entry_id,
        applicationId: app.entry_id,
        fullName: app.child_name,
        photoUrl: app.child_photo_url,
        ageLabel: `${app.calculated_age}y`,
        gender: app.gender,
        ageGroup: app.age_group,
        parentName: app.parent_name,
        parentPhone: app.phone_number,
        pickupPersonName: entryPickups[0]?.fullName || null,
        pickupPersonPhotoUrl: entryPickups[0]?.photoUrl || null,
        reviewStatus: app.status,
        entryStatus,
        pickupStatus,
        flags
      };
    });

    return res.json({
      success: true,
      stats: {
        totalChildren: totalRes?.count || 0,
        selected: selectedRes?.count || 0,
        checkedIn: checkedInRes?.count || 0,
        inside: insideRes?.count || 0,
        pickedUp: pickedUpRes?.count || 0,
        needsAttention: needsAttentionRes?.count || 0
      },
      children: formatted,
      total: formatted.length,
      nextCursor: null
    });
  } catch (err: any) {
    console.error('Error in /api/admin/children:', err);
    return res.status(500).json({ error: 'Failed to fetch children records.' });
  }
});

// GET attendance with stats and filtering
router.get('/attendance', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'team')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const eventId = 'event-ga-2026';
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const formatTime = (isoString?: string) => {
      if (!isoString) return 'No activity';
      try {
        const d = new Date(isoString);
        let hours = d.getHours();
        const minutes = d.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        const minutesStr = minutes < 10 ? '0' + minutes : minutes;
        return `${hours}:${minutesStr} ${ampm}`;
      } catch (e) {
        return 'No activity';
      }
    };

    // 1. Fetch stats
    const totalRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')", [eventId]);
    const checkedInRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('checked_in', 'inside', 'picked_up')", [eventId]);
    const insideRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('checked_in', 'inside')", [eventId]);
    const pickedUpRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'picked_up'", [eventId]);
    const notArrivedRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready')", [eventId]);
    const needsAttentionRes = await queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.has_medical_notes = 1 OR e.needs_extra_support = 1 OR c.needs_age_review = 1)
    `, [eventId]);

    // 2. Query matching records for rows
    let queryStr = `
      SELECT 
        e.id as entry_id,
        e.child_id,
        e.status,
        e.has_medical_notes,
        e.medical_notes,
        e.needs_extra_support,
        e.support_notes,
        e.checked_in_at,
        e.picked_up_at,
        c.full_name as child_name,
        c.age_group,
        c.needs_age_review,
        p.full_name as parent_name,
        p.phone_number as parent_phone
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    `;

    const queryParams: any[] = [eventId];

    if (q) {
      queryStr += ` AND (
        c.full_name LIKE ? OR 
        p.full_name LIKE ? OR 
        p.phone_number LIKE ?
      )`;
      const searchPattern = `%${q}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    if (status === 'inside') {
      queryStr += " AND e.status IN ('checked_in', 'inside')";
    } else if (status === 'picked_up') {
      queryStr += " AND e.status = 'picked_up'";
    } else if (status === 'not_arrived') {
      queryStr += " AND e.status IN ('selected', 'pass_ready')";
    } else if (status === 'needs_attention') {
      queryStr += " AND (e.has_medical_notes = 1 OR e.needs_extra_support = 1 OR c.needs_age_review = 1)";
    }

    queryStr += ` ORDER BY c.full_name ASC`;

    const childrenRows = await query(queryStr, queryParams);

    const rows = childrenRows.map((app: any) => {
      let rowStatus: 'checked_in' | 'picked_up' | 'not_arrived' | 'needs_attention' = 'not_arrived';
      let rowLocation: 'inside' | 'picked_up' | 'not_arrived' | null = 'not_arrived';

      if (app.status === 'checked_in' || app.status === 'inside') {
        rowStatus = 'checked_in';
        rowLocation = 'inside';
      } else if (app.status === 'picked_up') {
        rowStatus = 'picked_up';
        rowLocation = 'picked_up';
      } else {
        const needsAttention = app.has_medical_notes === 1 || app.needs_extra_support === 1 || app.needs_age_review === 1;
        if (needsAttention) {
          rowStatus = 'needs_attention';
        } else {
          rowStatus = 'not_arrived';
        }
        rowLocation = 'not_arrived';
      }

      let notesSummary = 'No care note';
      if (app.has_medical_notes === 1 && app.medical_notes) {
        notesSummary = app.medical_notes;
      } else if (app.needs_extra_support === 1 && app.support_notes) {
        notesSummary = app.support_notes;
      }

      const lastActAt = app.picked_up_at || app.checked_in_at || null;
      const lastActLabel = lastActAt ? formatTime(lastActAt) : 'No activity';

      return {
        id: app.entry_id,
        childId: app.child_id,
        applicationId: app.entry_id,
        childName: app.child_name,
        ageGroup: app.age_group,
        parentName: app.parent_name,
        parentPhone: app.parent_phone,
        status: rowStatus,
        location: rowLocation,
        notes: notesSummary,
        lastActivityAt: lastActAt,
        lastActivityLabel: lastActLabel
      };
    });

    // 3. Compute Age Group statistical breakdown from database
    const allEntriesForAgeGroups = await query(`
      SELECT 
        e.status,
        c.age_group
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
    `, [eventId]);

    const standardGroups = ['Below 1', 'Ages 1-3', 'Ages 4-6', 'Ages 7-9', 'Ages 10-12'];
    const ageGroupsMap = new Map<string, any>();
    for (const group of standardGroups) {
      ageGroupsMap.set(group, {
        ageGroup: group,
        expected: 0,
        checkedIn: 0,
        inside: 0,
        pickedUp: 0,
        notArrived: 0
      });
    }

    for (const entry of allEntriesForAgeGroups) {
      const group = entry.age_group || 'Other';
      if (!ageGroupsMap.has(group)) {
        ageGroupsMap.set(group, {
          ageGroup: group,
          expected: 0,
          checkedIn: 0,
          inside: 0,
          pickedUp: 0,
          notArrived: 0
        });
      }
      const statsObj = ageGroupsMap.get(group);
      statsObj.expected++;
      if (entry.status === 'checked_in' || entry.status === 'inside') {
        statsObj.checkedIn++;
        statsObj.inside++;
      } else if (entry.status === 'picked_up') {
        statsObj.checkedIn++;
        statsObj.pickedUp++;
      } else {
        statsObj.notArrived++;
      }
    }
    const ageGroups = Array.from(ageGroupsMap.values());

    // 4. Fetch Recent Scans logs (max 10)
    const recentScansRows = await query(`
      SELECT 
        e.id as entry_id,
        e.status,
        e.checked_in_at,
        e.picked_up_at,
        c.full_name as child_name,
        e.has_medical_notes,
        e.needs_extra_support,
        c.needs_age_review
      FROM child_event_entries e
      JOIN children c ON e.child_id = c.id
      WHERE e.event_id = ? AND (e.checked_in_at IS NOT NULL OR e.picked_up_at IS NOT NULL)
      ORDER BY COALESCE(e.picked_up_at, e.checked_in_at) DESC
      LIMIT 10
    `, [eventId]);

    const recentScans = recentScansRows.map((r: any) => {
      const isPickup = r.status === 'picked_up' && r.picked_up_at;
      const timeLabel = formatTime(isPickup ? r.picked_up_at : r.checked_in_at);
      const flagged = r.has_medical_notes === 1 || r.needs_extra_support === 1 || r.needs_age_review === 1;
      return {
        id: `${r.entry_id}-${isPickup ? 'pickup' : 'checkin'}`,
        childName: r.child_name,
        type: isPickup ? 'pickup' : 'check_in',
        timeLabel,
        flagged
      };
    });

    // 5. Fetch Team Activity logs (max 10)
    const teamActivityRows = await query(`
      SELECT 
        e.id as entry_id,
        c.full_name as child_name,
        e.status,
        e.checked_in_at,
        e.picked_up_at,
        COALESCE(vp.full_name, u.email, 'Event Worker') as team_member_name
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN users u ON (e.status = 'picked_up' AND e.picked_up_by = u.id) OR (e.status != 'picked_up' AND e.checked_in_by = u.id)
      LEFT JOIN volunteer_profiles vp ON u.id = vp.user_id
      WHERE e.event_id = ? AND (e.checked_in_by IS NOT NULL OR e.picked_up_by IS NOT NULL)
      ORDER BY COALESCE(e.picked_up_at, e.checked_in_at) DESC
      LIMIT 10
    `, [eventId]);

    const teamActivity = teamActivityRows.map((r: any) => {
      const isPickup = r.status === 'picked_up' && r.picked_up_at;
      const timeLabel = formatTime(isPickup ? r.picked_up_at : r.checked_in_at);
      return {
        id: r.entry_id,
        teamMemberName: r.team_member_name,
        childName: r.child_name,
        action: isPickup ? 'picked up' : 'checked in',
        timeLabel
      };
    });

    return res.json({
      success: true,
      stats: {
        expected: totalRes?.count || 0,
        checkedIn: checkedInRes?.count || 0,
        inside: insideRes?.count || 0,
        pickedUp: pickedUpRes?.count || 0,
        notArrived: notArrivedRes?.count || 0,
        needsAttention: needsAttentionRes?.count || 0
      },
      rows,
      ageGroups,
      recentScans,
      teamActivity,
      total: rows.length,
      nextCursor: null
    });
  } catch (err: any) {
    console.error('Error in /api/admin/attendance:', err);
    return res.status(500).json({ error: 'Failed to fetch attendance records.' });
  }
});

// GET a single child application detail by ID
router.get('/applications/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const app = await queryOne(`
      SELECT 
        e.id as entry_id,
        e.child_id,
        e.status,
        e.school_class,
        e.school_name,
        e.previous_children_programme,
        e.note_to_team,
        e.has_medical_notes,
        e.medical_notes,
        e.needs_extra_support,
        e.support_notes,
        e.submitted_at,
        e.reviewed_at,
        e.updated_at,
        c.full_name as child_name,
        c.gender,
        c.date_of_birth,
        c.calculated_age,
        c.age_group,
        c.relationship_to_child,
        c.needs_age_review,
        m.secure_url as child_photo_url,
        p.id as parent_id,
        p.full_name as parent_name,
        p.phone_number,
        p.whatsapp_number,
        p.email as parent_email,
        p.is_koinonia_worker,
        p.department as parent_department,
        p.home_address as parent_address,
        p.photo_file_id as parent_photo_file_id,
        pm.secure_url as parent_photo_url
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      LEFT JOIN media_files m ON m.id = c.photo_file_id
      LEFT JOIN media_files pm ON pm.id = p.photo_file_id
      WHERE e.id = ?
    `, [id]);

    if (!app) {
      return res.status(404).json({ success: false, error: 'Application entry not found.' });
    }

    // Query pickup people for this specific entry
    const pickups = await query(`
      SELECT p.*, m.secure_url as photo_url
      FROM pickup_people p
      LEFT JOIN media_files m ON m.id = p.photo_file_id
      WHERE p.child_event_entry_id = ?
    `, [id]);

    const formattedPickups = pickups.map((p: any) => ({
      id: p.id,
      fullName: p.full_name,
      relationship: p.relationship_to_child,
      phone: p.phone_number,
      whatsapp: p.whatsapp_number,
      photoUrl: p.photo_url,
      approved: p.approved_by_parent === 1
    }));

    const history = [];
    if (app.submitted_at) {
      history.push({
        id: 'submitted',
        action: 'Application submitted',
        by: app.parent_name || 'Parent',
        timestamp: app.submitted_at,
        note: app.note_to_team || null,
        status: 'under_review'
      });
    }
    if (app.reviewed_at) {
      history.push({
        id: 'reviewed',
        action: `Decision: ${app.status}`,
        by: 'Administrator',
        timestamp: app.reviewed_at,
        note: app.note_to_team || null,
        status: app.status
      });
    }

    const applicationDetails = {
      id: app.entry_id,
      childId: app.child_id,
      status: app.status,
      schoolClass: app.school_class,
      schoolName: app.school_name,
      previousProgramme: app.previous_children_programme,
      noteToTeam: app.note_to_team,
      hasMedicalNotes: app.has_medical_notes === 1,
      medicalNotes: app.medical_notes,
      needsExtraSupport: app.needs_extra_support === 1,
      supportNotes: app.support_notes,
      submittedAt: app.submitted_at,
      reviewedAt: app.reviewed_at,
      child: {
        fullName: app.child_name,
        gender: app.gender,
        dob: app.date_of_birth,
        age: app.calculated_age,
        ageGroup: app.age_group,
        relationship: app.relationship_to_child,
        needsAgeReview: app.needs_age_review === 1,
        photoUrl: app.child_photo_url
      },
      parent: {
        id: app.parent_id,
        fullName: app.parent_name,
        phone: app.phone_number,
        whatsapp: app.whatsapp_number,
        email: app.parent_email,
        isWorker: app.is_koinonia_worker === 1,
        department: app.parent_department,
        address: app.parent_address,
        photoUrl: app.parent_photo_url || (app.parent_photo_file_id ? (app.parent_photo_file_id.startsWith('http') || app.parent_photo_file_id.startsWith('/') ? app.parent_photo_file_id : `/api/media/files/${app.parent_photo_file_id}`) : '')
      },
      pickupPeople: formattedPickups,
      history
    };

    return res.json({ success: true, application: applicationDetails });
  } catch (err: any) {
    console.error('Error fetching application details:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch application details.' });
  }
});

// POST review child application decision
router.post('/applications/:id/review', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, noteToTeam, sendNotification } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required.' });
    }

    const validStatuses = ['under_review', 'selected', 'not_selected', 'waiting_list', 'pass_ready', 'checked_in', 'picked_up'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid review status.' });
    }

    const app = await queryOne(`
      SELECT e.*, c.full_name as child_name, p.full_name as parent_name, p.email as parent_email, p.phone_number as parent_phone, p.id as parent_profile_id
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.id = ?
    `, [id]);

    if (!app) {
      return res.status(404).json({ success: false, error: 'Application entry not found.' });
    }

    const now = new Date().toISOString();
    let finalStatus = status;

    if (status === 'selected') {
      const childRow = await queryOne('SELECT photo_file_id FROM children WHERE id = ?', [app.child_id]);
      if (childRow && childRow.photo_file_id && childRow.photo_file_id.trim() !== '') {
        // Required pass data exists (valid photo) -> Promote status to 'pass_ready'
        finalStatus = 'pass_ready';
      }
    }

    // Update status and team notes in database
    await execute(`
      UPDATE child_event_entries 
      SET status = ?, note_to_team = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `, [finalStatus, noteToTeam || app.note_to_team, now, now, id]);

    // Auto-generate event pass if status is pass_ready
    if (finalStatus === 'pass_ready') {
      const pass = await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [id]);
      if (!pass) {
        const passId = crypto.randomUUID();
        const passRef = `KOI-2026-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const passHash = crypto.randomBytes(16).toString('hex');
        
        await execute(`
          INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
        `, [passId, id, passRef, passHash, now, now, now]);
      }
    }

    // Process notification if requested
    if (sendNotification) {
      let subject = 'Koinonia Application Review Update';
      let message = '';
      
      const pName = app.parent_name?.split(' ')[0] || 'Parent';
      const cName = app.child_name || 'your child';

      if (finalStatus === 'pass_ready') {
        subject = 'Koinonia Event Pass Ready!';
        message = `Hello ${pName},\n\nWe are delighted to inform you that ${cName} has been selected to attend the upcoming Koinonia Children and Teens Event!\n\nYour secure event pass is now ready in your portal. Please log in to download it and keep it handy during check-in.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      } else if (finalStatus === 'selected') {
        subject = 'Koinonia Application Selected!';
        message = `Hello ${pName},\n\nWe are delighted to inform you that ${cName} has been selected to attend the upcoming Koinonia Children and Teens Event!\n\nOur team is finalizing your event details. Your secure event pass will be generated shortly and will be available in your portal.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      } else if (finalStatus === 'waiting_list') {
        subject = 'Koinonia Application Waitlist Update';
        message = `Hello ${pName},\n\nThank you for registering ${cName} for the upcoming Koinonia Children and Teens Event.\n\nDue to venue capacity and safety limits, ${cName} has been placed on our waiting list. We will review seating limits regularly and will notify you immediately if a pass becomes available.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      } else if (status === 'not_selected') {
        subject = 'Koinonia Application Status';
        message = `Hello ${pName},\n\nThank you for registering ${cName} for Koinonia Children and Teens.\n\nDue to high registration volumes and room capacity limits, we are unable to accommodate ${cName} for this upcoming session. We look forward to welcoming your family to future events.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      } else {
        subject = 'Koinonia Application Update Needed';
        message = `Hello ${pName},\n\nOur administrative team has reviewed ${cName}'s application. We kindly ask you to log in to your portal and update the details as requested so we can complete our review.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      }

      // 1. Send transactional email
      if (app.parent_email) {
        await sendEmail({
          to: app.parent_email,
          subject,
          text: message,
          html: `<div style="font-family: sans-serif; line-height: 1.6; color: #18181B; max-width: 600px; margin: 0 auto; border: 1px solid #EAE8E1; padding: 24px; border-radius: 12px; background-color: #FAF9F6;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-family: serif; font-size: 20px; font-weight: bold; color: #18181B; letter-spacing: 2px;">KOINONIA</span>
              <div style="width: 40px; height: 2px; background-color: #C59B27; margin: 8px auto 0;"></div>
            </div>
            <p>${message.replace(/\n/g, '<br>')}</p>
            <hr style="border: 0; border-top: 1px solid #EAE8E1; margin: 24px 0;">
            <p style="font-size: 11px; color: #71717A; text-align: center;">This is an official administrative update regarding your Koinonia Children and Teens event registration.</p>
          </div>`
        }).catch(err => console.error('Failed to send review email notification:', err));
      }

      // 2. Dispatch WhatsApp if phone is available
      if (app.parent_phone) {
        await sendWhatsApp(app.parent_phone, message).catch(err => console.error('Failed to send review WhatsApp notification:', err));
      }

      // 3. Create In-App Notification
      const notifId = `notif-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO notifications (
          id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id, created_at, priority, channel
        ) VALUES (?, ?, ?, 'info', 'parent', 'individual', ?, ?, ?, ?, 'normal', 'in-app')
      `, [notifId, subject, message, app.event_id, app.child_id, app.parent_profile_id, now]);

      const pNotifId = `pnotif-${crypto.randomUUID()}`;
      await execute(`
        INSERT INTO parent_notifications (id, parent_id, event_id, child_id, title, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [pNotifId, app.parent_profile_id, app.event_id, app.child_id, subject, message, now]);
    }

    return res.json({ success: true, message: 'Application review submitted successfully.' });
  } catch (err: any) {
    console.error('Error submitting application review:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit application review.' });
  }
});

// POST reopen child application review (admin revoke selection/pass)
router.post('/applications/:id/reopen-review', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const app = await queryOne(`
      SELECT e.*, c.full_name as child_name, p.full_name as parent_name, p.email as parent_email, p.phone_number as parent_phone, p.id as parent_profile_id
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.id = ?
    `, [id]);

    if (!app) {
      return res.status(404).json({ success: false, error: 'Application entry not found.' });
    }

    // Validate child check-in status: cannot reopen if checked in or picked up
    if (['checked_in', 'inside', 'picked_up', 'checked_out'].includes(app.status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'This child has already checked in or been picked up. Review cannot be reopened.' 
      });
    }

    const now = new Date().toISOString();

    // Update child_event_entries status, reviewed_at to NULL, and append reason to note_to_team as audit trail
    let auditNote = app.note_to_team || '';
    if (reason && reason.trim()) {
      const formattedReason = `\n\n[Review reopened on ${new Date().toLocaleDateString()} for reason: ${reason}]`;
      auditNote = auditNote ? `${auditNote}${formattedReason}` : formattedReason;
    }

    await execute(`
      UPDATE child_event_entries 
      SET status = 'review_reopened', note_to_team = ?, reviewed_at = NULL, updated_at = ?
      WHERE id = ?
    `, [auditNote, now, id]);

    // Revoke any generated event pass
    await execute(`
      UPDATE event_passes
      SET status = 'revoked', revoked_at = ?, updated_at = ?
      WHERE child_event_entry_id = ?
    `, [now, now, id]);

    // Send gentle, comforting parent notification
    const pName = app.parent_name?.split(' ')[0] || 'Parent';
    const cFirstName = app.child_name ? app.child_name.split(' ')[0] : 'your child';
    
    const subject = 'Koinonia Application Update';
    const message = `The event team has reopened the review for ${cFirstName}. We will share an update when a new decision is made.`;

    // 1. Send transactional email
    if (app.parent_email) {
      await sendEmail({
        to: app.parent_email,
        subject,
        text: message,
        html: `<div style="font-family: sans-serif; line-height: 1.6; color: #18181B; max-width: 600px; margin: 0 auto; border: 1px solid #EAE8E1; padding: 24px; border-radius: 12px; background-color: #FAF9F6;">
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-family: serif; font-size: 20px; font-weight: bold; color: #18181B; letter-spacing: 2px;">KOINONIA</span>
            <div style="width: 40px; height: 2px; background-color: #C59B27; margin: 8px auto 0;"></div>
          </div>
          <p>Hello ${pName},</p>
          <p>${message}</p>
          <hr style="border: 0; border-top: 1px solid #EAE8E1; margin: 24px 0;">
          <p style="font-size: 11px; color: #71717A; text-align: center;">This is an official administrative update regarding your Koinonia Children and Teens event registration.</p>
        </div>`
      }).catch(err => console.error('Failed to send revoke email notification:', err));
    }

    // 2. Dispatch WhatsApp if phone is available
    if (app.parent_phone) {
      await sendWhatsApp(app.parent_phone, `Hello ${pName}, ${message}`).catch(err => console.error('Failed to send revoke WhatsApp notification:', err));
    }

    // 3. Create In-App Notification
    const notifId = `notif-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO notifications (
        id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id, created_at, priority, channel
      ) VALUES (?, ?, ?, 'info', 'parent', 'individual', ?, ?, ?, ?, 'normal', 'in-app')
    `, [notifId, subject, `Hello ${pName},\n\n${message}`, app.event_id, app.child_id, app.parent_profile_id, now]);

    const pNotifId = `pnotif-${crypto.randomUUID()}`;
    await execute(`
      INSERT INTO parent_notifications (id, parent_id, event_id, child_id, title, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [pNotifId, app.parent_profile_id, app.event_id, app.child_id, subject, `Hello ${pName},\n\n${message}`, now]);

    return res.json({ success: true, message: 'Application review reopened successfully.' });
  } catch (err: any) {
    console.error('Error reopening application review:', err);
    return res.status(500).json({ success: false, error: 'Failed to reopen application review.' });
  }
});

// POST bulk review applications
router.post('/applications/bulk-review', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationIds, decision, note } = req.body;
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Application IDs must be a non-empty array.' });
    }
    const validDecisions = ['selected', 'waiting_list', 'not_selected', 'under_review'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ success: false, error: 'Invalid bulk decision.' });
    }
    const now = new Date().toISOString();

    for (const id of applicationIds) {
      const app = await queryOne(`
        SELECT e.*, c.full_name as child_name, p.full_name as parent_name, p.email as parent_email, p.phone_number as parent_phone, p.id as parent_profile_id
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.id = ?
      `, [id]);

      if (!app) continue;

      let finalDecision = decision;

      if (decision === 'selected') {
        const childRow = await queryOne('SELECT photo_file_id FROM children WHERE id = ?', [app.child_id]);
        if (childRow && childRow.photo_file_id && childRow.photo_file_id.trim() !== '') {
          // Required pass data exists (valid photo) -> Promote to 'pass_ready'
          finalDecision = 'pass_ready';
        }
      }

      // Update status
      await execute(`
        UPDATE child_event_entries 
        SET status = ?, note_to_team = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `, [finalDecision, note || app.note_to_team, now, now, id]);

      // If pass_ready, auto-generate pass
      if (finalDecision === 'pass_ready') {
        const pass = await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [id]);
        if (!pass) {
          const passId = crypto.randomUUID();
          const passRef = `KOI-2026-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
          const passHash = crypto.randomBytes(16).toString('hex');

          await execute(`
            INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
          `, [passId, id, passRef, passHash, now, now, now]);
        }
      }

      // Notifications (Only if not under_review)
      if (decision !== 'under_review') {
        let subject = 'Koinonia Application Review Update';
        let message = '';
        const pName = app.parent_name?.split(' ')[0] || 'Parent';
        const cName = app.child_name || 'your child';

        if (finalDecision === 'pass_ready') {
          subject = 'Koinonia Event Pass Ready!';
          message = `Hello ${pName},\n\nWe are delighted to inform you that ${cName} has been selected to attend the upcoming Koinonia Children and Teens Event!\n\nYour secure event pass is now ready in your portal. Please log in to download it and keep it handy during check-in.\n\nWarm regards,\nKoinonia Children and Teens Team`;
        } else if (finalDecision === 'selected') {
          subject = 'Koinonia Application Selected!';
          message = `Hello ${pName},\n\nWe are delighted to inform you that ${cName} has been selected to attend the upcoming Koinonia Children and Teens Event!\n\nOur team is finalizing your event details. Your secure event pass will be generated shortly and will be available in your portal.\n\nWarm regards,\nKoinonia Children and Teens Team`;
        } else if (finalDecision === 'waiting_list') {
          subject = 'Koinonia Application Waitlist Update';
          message = `Hello ${pName},\n\nThank you for registering ${cName} for the upcoming Koinonia Children and Teens Event.\n\nDue to venue capacity and safety limits, ${cName} has been placed on our waiting list. We will review seating limits regularly and will notify you immediately if a pass becomes available.\n\nWarm regards,\nKoinonia Children and Teens Team`;
        } else if (decision === 'not_selected') {
          subject = 'Koinonia Application Status';
          message = `Hello ${pName},\n\nThank you for registering ${cName} for Koinonia Children and Teens.\n\nDue to high registration volumes and room capacity limits, we are unable to accommodate ${cName} for this upcoming session. We look forward to welcoming your family to future events.\n\nWarm regards,\nKoinonia Children and Teens Team`;
        }

        if (app.parent_email) {
          await sendEmail({
            to: app.parent_email,
            subject,
            text: message,
            html: `<div style="font-family: sans-serif; line-height: 1.6; color: #18181B; max-width: 600px; margin: 0 auto; border: 1px solid #EAE8E1; padding: 24px; border-radius: 12px; background-color: #FAF9F6;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-family: serif; font-size: 20px; font-weight: bold; color: #18181B; letter-spacing: 2px;">KOINONIA</span>
                <div style="width: 40px; height: 2px; background-color: #C59B27; margin: 8px auto 0;"></div>
              </div>
              <p>${message.replace(/\n/g, '<br>')}</p>
              <hr style="border: 0; border-top: 1px solid #EAE8E1; margin: 24px 0;">
              <p style="font-size: 11px; color: #71717A; text-align: center;">This is an official administrative update regarding your Koinonia Children and Teens event registration.</p>
            </div>`
          }).catch(err => console.error('Failed to send bulk review email notification:', err));
        }

        if (app.parent_phone) {
          await sendWhatsApp(app.parent_phone, message).catch(err => console.error('Failed to send bulk review WhatsApp notification:', err));
        }

        const notifId = `notif-${crypto.randomUUID()}`;
        await execute(`
          INSERT INTO notifications (
            id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id, created_at, priority, channel
          ) VALUES (?, ?, ?, 'info', 'parent', 'individual', ?, ?, ?, ?, 'normal', 'in-app')
        `, [notifId, subject, message, app.event_id, app.child_id, app.parent_profile_id, now]);

        const pNotifId = `pnotif-${crypto.randomUUID()}`;
        await execute(`
          INSERT INTO parent_notifications (id, parent_id, event_id, child_id, title, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [pNotifId, app.parent_profile_id, app.event_id, app.child_id, subject, message, now]);
      }
    }

    return res.json({ success: true, message: `Successfully updated ${applicationIds.length} applications.` });
  } catch (err: any) {
    console.error('Error in bulk review:', err);
    return res.status(500).json({ success: false, error: 'Failed to process bulk review.' });
  }
});

// PUT update status of an application
router.put('/applications/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, noteToTeam } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    const validStatuses = ['incomplete', 'under_review', 'selected', 'not_selected', 'waiting_list', 'pass_ready', 'checked_in', 'picked_up'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [id]);
    if (!entry) {
      return res.status(404).json({ error: 'Application entry not found.' });
    }

    const now = new Date().toISOString();
    let finalStatus = status;

    if (status === 'selected') {
      const childRow = await queryOne('SELECT photo_file_id FROM children WHERE id = ?', [entry.child_id]);
      if (childRow && childRow.photo_file_id && childRow.photo_file_id.trim() !== '') {
        // Required pass data exists (valid photo) -> Promote to 'pass_ready'
        finalStatus = 'pass_ready';
      }
    }

    // Update status in database
    if (noteToTeam !== undefined) {
      await execute(`
        UPDATE child_event_entries 
        SET status = ?, note_to_team = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `, [finalStatus, noteToTeam, now, now, id]);
    } else {
      await execute(`
        UPDATE child_event_entries 
        SET status = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `, [finalStatus, now, now, id]);
    }

    // Auto-generate pass if status is pass_ready and pass doesn't exist
    if (finalStatus === 'pass_ready') {
      const pass = await queryOne('SELECT * FROM event_passes WHERE child_event_entry_id = ?', [id]);
      if (!pass) {
        const passId = crypto.randomUUID();
        const passRef = `KOI-2026-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const passHash = crypto.randomBytes(16).toString('hex');
        
        await execute(`
          INSERT INTO event_passes (id, child_event_entry_id, pass_reference, pass_hash, status, issued_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
        `, [passId, id, passRef, passHash, now, now, now]);
      }
    }

    return res.json({ success: true, message: 'Application status updated successfully.' });
  } catch (err: any) {
    console.error('Error updating application status:', err);
    return res.status(500).json({ error: 'Failed to update application status.' });
  }
});

// GET admin overview dashboard metrics
router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventId = 'event-ga-2026';
    const totalChildrenRes = await queryOne('SELECT COUNT(*) as count FROM children');
    const underReviewRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'under_review'", [eventId]);
    const approvedRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready')", [eventId]);
    const totalParentsRes = await queryOne('SELECT COUNT(*) as count FROM parent_profiles');
    const totalVolunteersRes = await queryOne('SELECT COUNT(*) as count FROM volunteer_profiles');
    const pendingVolunteersRes = await queryOne("SELECT COUNT(*) as count FROM volunteer_profiles WHERE status = 'pending_review'");
    const checkedInRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'checked_in'", [eventId]);
    const pickedUpRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'picked_up'", [eventId]);

    // Format admin user info
    let fullName = 'Admin User';
    const parentProfile = await queryOne('SELECT full_name FROM parent_profiles WHERE user_id = ?', [req.user?.id]);
    if (parentProfile && parentProfile.full_name) {
      fullName = parentProfile.full_name;
    } else {
      const volunteerProfile = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ?', [req.user?.id]);
      if (volunteerProfile && volunteerProfile.full_name) {
        fullName = volunteerProfile.full_name;
      }
    }
    const roleTitle = req.user?.role === 'super_admin' ? 'Global Director' : req.user?.role === 'admin' ? 'Senior Director' : 'Ministry Admin';

    // Fetch active event details
    const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
    const formatEventDate = (startsAt: string, endsAt: string) => {
      if (!startsAt) return '22 Nov 2025';
      try {
        const s = new Date(startsAt);
        const e = endsAt ? new Date(endsAt) : s;
        const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
        if (s.toDateString() === e.toDateString()) {
          return s.toLocaleDateString('en-US', options);
        }
        return `${s.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} - ${e.toLocaleDateString('en-US', options)}`;
      } catch {
        return startsAt;
      }
    };

    const dateLabel = event ? formatEventDate(event.starts_at, event.ends_at) : '22 Nov 2025';
    const timeLabel = (event?.daily_start_time && event?.daily_end_time)
      ? `${event.daily_start_time} to ${event.daily_end_time}`
      : '9:00 AM to 7:00 PM';

    // Fetch demographics and calculate counts dynamically from the DB
    const childrenData = await query(`
      SELECT c.gender, c.age_group, e.status
      FROM children c
      LEFT JOIN child_event_entries e ON c.id = e.child_id AND e.event_id = ?
    `, [eventId]);

    const ageGroupsList = [
      { ageGroup: 'Under 1 year', displayLabel: 'Below 1' },
      { ageGroup: 'Ages 1 to 3', displayLabel: 'Ages 1 to 3' },
      { ageGroup: 'Ages 4 to 6', displayLabel: 'Ages 4 to 6' },
      { ageGroup: 'Ages 7 to 9', displayLabel: 'Ages 7 to 9' },
      { ageGroup: 'Ages 10 to 12', displayLabel: 'Ages 10 to 12' },
      { ageGroup: 'Teens', displayLabel: 'Teens' }
    ];

    const demographics = ageGroupsList.map(g => {
      const matching = (childrenData || []).filter((c: any) => c.age_group === g.ageGroup);
      const boys = matching.filter((c: any) => String(c.gender).toLowerCase() === 'boy' || String(c.gender).toLowerCase() === 'male').length;
      const girls = matching.filter((c: any) => String(c.gender).toLowerCase() === 'girl' || String(c.gender).toLowerCase() === 'female').length;
      const underReview = matching.filter((c: any) => c.status === 'under_review').length;
      const selected = matching.filter((c: any) => c.status === 'selected' || c.status === 'pass_ready').length;
      const checkedIn = matching.filter((c: any) => c.status === 'checked_in').length;
      return {
        ageGroup: g.displayLabel,
        boys,
        girls,
        total: boys + girls,
        underReview,
        selected,
        checkedIn
      };
    });

    // Calculate Needs Attention items
    // 1. Below event age
    const belowAgeCountRes = await queryOne("SELECT COUNT(*) as count FROM children WHERE age_group = 'Under 1 year'");
    const belowAgeCount = belowAgeCountRes?.count || 0;

    // 2. Medical notes
    const medicalNotesCountRes = await queryOne(`
      SELECT COUNT(*) as count FROM child_event_entries 
      WHERE event_id = ? AND (has_medical_notes = 1 OR (medical_notes IS NOT NULL AND medical_notes != ''))
    `, [eventId]);
    const medicalNotesCount = medicalNotesCountRes?.count || 0;

    // 3. Missing pickup photo
    const missingPickupPhotoCountRes = await queryOne(`
      SELECT COUNT(*) as count FROM children WHERE photo_file_id IS NULL OR photo_file_id = ''
    `);
    const missingPickupPhotoCount = missingPickupPhotoCountRes?.count || 0;

    // 4. Special support
    const specialSupportCountRes = await queryOne(`
      SELECT COUNT(*) as count FROM child_event_entries 
      WHERE event_id = ? AND (needs_extra_support = 1 OR (support_notes IS NOT NULL AND support_notes != ''))
    `, [eventId]);
    const specialSupportCount = specialSupportCountRes?.count || 0;

    // 5. Duplicate phone number
    const duplicatePhoneCountRes = await queryOne(`
      SELECT COUNT(*) as count FROM (
        SELECT phone_number FROM parent_profiles 
        WHERE phone_number IS NOT NULL AND phone_number != '' 
        GROUP BY phone_number HAVING COUNT(*) > 1
      ) as dup
    `);
    const duplicatePhoneCount = duplicatePhoneCountRes?.count || 0;

    const needsAttentionItems = [
      { id: 'below_age', label: 'Below event age', count: belowAgeCount },
      { id: 'medical', label: 'Medical notes', count: medicalNotesCount },
      { id: 'missing_pickup', label: 'Missing pickup photo', count: missingPickupPhotoCount },
      { id: 'special_support', label: 'Special support', count: specialSupportCount },
      { id: 'duplicate_phone', label: 'Duplicate phone number', count: duplicatePhoneCount }
    ];

    const needsAttentionTotal = needsAttentionItems.reduce((acc, item) => acc + item.count, 0);

    // Calculate Review Progress metrics
    const selCountRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'picked_up')", [eventId]);
    const selectedCount = selCountRes?.count || 0;

    const revCountRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'under_review'", [eventId]);
    const underReviewCount = revCountRes?.count || 0;

    const rejCountRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('not_selected', 'rejected', 'withdrawn')", [eventId]);
    const notSelectedCount = rejCountRes?.count || 0;

    // Calculate Today's Attendance metrics
    const expectedAttendance = selectedCount;
    const checkedInCount = checkedInRes?.count || 0;
    const pickedUpCount = pickedUpRes?.count || 0;
    const stillInsideCount = Math.max(0, checkedInCount - pickedUpCount);
    const notArrivedCount = Math.max(0, expectedAttendance - checkedInCount);

    // Fetch dynamic Recent Activity (real actions)
    const recentActivityRows = await query(`
      SELECT c.full_name as name, e.status, e.updated_at
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ?
      ORDER BY e.updated_at DESC
      LIMIT 4
    `, [eventId]);

    const formatRelativeTime = (isoString: string) => {
      try {
        const d = new Date(isoString);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / (60 * 1000));
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) {
          return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        return 'Yesterday, ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      } catch {
        return 'Recently';
      }
    };

    const recentActivity = (recentActivityRows || []).map((row: any, index: number) => {
      let actionText = 'updated';
      if (row.status === 'checked_in') actionText = 'checked in';
      else if (row.status === 'picked_up') actionText = 'picked up';
      else if (row.status === 'selected') actionText = 'selected for admission';
      else if (row.status === 'under_review') actionText = 'submitted details for review';
      else if (row.status === 'not_selected') actionText = 'marked as not selected';
      
      return {
        id: `activity-${index}`,
        name: row.name,
        text: `${row.name} ${actionText}`,
        time: formatRelativeTime(row.updated_at)
      };
    });

    // Backwards compatible submissions
    const recentSubmissions = (recentActivityRows || []).map((row: any) => ({
      id: row.id || Math.random().toString(),
      name: row.name,
      age_group: row.age_group || 'Children',
      age: row.age || 0,
      status: row.status,
      submitted_at: row.updated_at
    }));

    return res.json({
      success: true,
      admin: {
        id: req.user?.id || 'admin-id',
        fullName,
        roleTitle,
        photoUrl: null
      },
      event: {
        id: eventId,
        name: event?.section_name || 'The General Assembly',
        section: event?.title || 'Children and Teens',
        dateLabel,
        timeLabel,
        status: event?.status || 'active',
        registrationStatus: event?.status === 'open' ? 'open' : 'closed'
      },
      metrics: {
        totalChildren: totalChildrenRes?.count || 0,
        totalParents: totalParentsRes?.count || 0,
        underReview: underReviewCount,
        selected: selectedCount,
        checkedIn: checkedInCount,
        pickedUp: pickedUpCount
      },
      demographics,
      needsAttention: {
        total: needsAttentionTotal,
        items: needsAttentionItems
      },
      reviewProgress: {
        selected: selectedCount,
        underReview: underReviewCount,
        notSelected: notSelectedCount
      },
      attendance: {
        expected: expectedAttendance,
        checkedIn: checkedInCount,
        stillInside: stillInsideCount,
        pickedUp: pickedUpCount,
        notArrived: notArrivedCount
      },
      recentActivity,
      // Backwards compatibility fallbacks
      stats: {
        totalChildren: totalChildrenRes?.count || 0,
        underReview: underReviewCount,
        approved: approvedRes?.count || 0,
        totalParents: totalParentsRes?.count || 0,
        totalVolunteers: totalVolunteersRes?.count || 0,
        pendingVolunteers: pendingVolunteersRes?.count || 0,
        checkedIn: checkedInCount
      },
      recentSubmissions
    });
  } catch (err: any) {
    console.error('Error in overview API:', err);
    return res.status(500).json({ error: 'Failed to fetch admin overview stats.' });
  }
});

// GET event details including scheduler fields and age groups
router.get('/events/:eventId', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const ageGroups = await query('SELECT * FROM event_age_groups WHERE event_id = ? ORDER BY sort_order ASC', [eventId]);

  res.json({
    // flat fields for backward compatibility
    id: event.id,
    title: event.title,
    sectionName: event.section_name,
    theme: event.theme,
    scripture: event.scripture,
    location: event.location,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    dailyStartTime: event.daily_start_time,
    dailyEndTime: event.daily_end_time,
    eventStartAt: event.event_start_at || '',
    eventEndAt: event.event_end_at || '',
    checkInOpensAt: event.check_in_opens_at || '',
    checkInClosesAt: event.check_in_closes_at || '',
    pickupStartsAt: event.pickup_starts_at || '',
    pickupReminderAt: event.pickup_reminder_at || '',
    timezone: event.timezone || 'Africa/Lagos',
    status: event.status,

    // nested objects for structured events client
    success: true,
    event: {
      id: event.id,
      title: event.title,
      sectionName: event.section_name,
      theme: event.theme,
      scripture: event.scripture,
      location: event.location,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      dailyStartTime: event.daily_start_time,
      dailyEndTime: event.daily_end_time,
      eventStartAt: event.event_start_at || '',
      eventEndAt: event.event_end_at || '',
      checkInOpensAt: event.check_in_opens_at || '',
      checkInClosesAt: event.check_in_closes_at || '',
      pickupStartsAt: event.pickup_starts_at || '',
      pickupReminderAt: event.pickup_reminder_at || '',
      timezone: event.timezone || 'Africa/Lagos',
      status: event.status,
      parentAccessOpensAt: event.parent_access_opens_at,
      parentAccessClosesAt: event.parent_access_closes_at,
      parentsCanCreateAccount: event.parents_can_create_account === 1,
      allowMultipleChildren: event.allow_multiple_children === 1,
      allowSaveAndContinue: event.allow_save_and_continue === 1,
      allowEditAfterSubmission: event.allow_edit_after_submission === 1,
      description: event.description
    },
    ageGroups: ageGroups.map((g: any) => ({
      id: g.id,
      label: g.label,
      minAge: g.min_age,
      maxAge: g.max_age,
      capacity: g.capacity,
      manualReview: g.manual_review === 1 || g.manual_review === true,
      sortOrder: g.sort_order
    }))
  });
});

// UPDATE event details (saves ISO-8601 strings and triggers rule syncing)
router.put('/events/:eventId', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const {
    eventStartAt,
    eventEndAt,
    checkInOpensAt,
    checkInClosesAt,
    pickupStartsAt,
    pickupReminderAt,
    timezone
  } = req.body;

  const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const updatedTimezone = timezone || 'Africa/Lagos';

  await execute(`
    UPDATE events SET
      event_start_at = ?,
      event_end_at = ?,
      check_in_opens_at = ?,
      check_in_closes_at = ?,
      pickup_starts_at = ?,
      pickup_reminder_at = ?,
      timezone = ?,
      updated_at = ?
    WHERE id = ?
  `, [
    eventStartAt || null,
    eventEndAt || null,
    checkInOpensAt || null,
    checkInClosesAt || null,
    pickupStartsAt || null,
    pickupReminderAt || null,
    updatedTimezone,
    new Date().toISOString(),
    eventId
  ]);

  // Sync notification jobs immediately when times are updated
  try {
    await syncJobsForEvent(eventId);
  } catch (err: any) {
    console.error('[Admin API] Error syncing jobs after event update:', err);
  }

  res.json({
    success: true,
    message: 'Event notification settings updated successfully and jobs have been synchronized.'
  });
});

// GET all events
router.get('/events', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const statusFilter = req.query.status as string;
    let sql = 'SELECT * FROM events';
    const params: any[] = [];
    if (statusFilter) {
      sql += ' WHERE status = ?';
      params.push(statusFilter);
    }
    sql += ' ORDER BY starts_at DESC, created_at DESC';
    const events = await query(sql, params);

    const enrichedEvents = [];
    for (const event of events) {
      // Get capacities sum
      const capRes = await queryOne('SELECT SUM(capacity) as total_capacity FROM event_age_groups WHERE event_id = ?', [event.id]);
      const totalCapacity = capRes?.total_capacity || 0;

      // Get applications count
      const appsRes = await queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ?', [event.id]);
      const applicationsCount = appsRes?.count || 0;

      // Get pass ready / selected count
      const selectedRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'picked_up')", [event.id]);
      const selectedCount = selectedRes?.count || 0;

      enrichedEvents.push({
        id: event.id,
        title: event.title,
        sectionName: event.section_name,
        location: event.location,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        dailyStartTime: event.daily_start_time,
        dailyEndTime: event.daily_end_time,
        status: event.status,
        timezone: event.timezone || 'Africa/Lagos',
        parentAccessOpensAt: event.parent_access_opens_at,
        parentAccessClosesAt: event.parent_access_closes_at,
        parentsCanCreateAccount: event.parents_can_create_account === 1 || event.parents_can_create_account === true,
        allowMultipleChildren: event.allow_multiple_children === 1 || event.allow_multiple_children === true,
        allowSaveAndContinue: event.allow_save_and_continue === 1 || event.allow_save_and_continue === true,
        allowEditAfterSubmission: event.allow_edit_after_submission === 1 || event.allow_edit_after_submission === true,
        description: event.description,
        totalCapacity,
        applicationsCount,
        selectedCount
      });
    }

    res.json({ success: true, events: enrichedEvents });
  } catch (err: any) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events.' });
  }
});

// CREATE a new event with its age groups
router.post('/events', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title,
      sectionName,
      location,
      startsAt,
      endsAt,
      dailyStartTime,
      dailyEndTime,
      description,
      parentAccessOpensAt,
      parentAccessClosesAt,
      parentsCanCreateAccount,
      allowMultipleChildren,
      allowSaveAndContinue,
      allowEditAfterSubmission,
      status = 'draft',
      ageGroups = []
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Event name is required.' });
    }
    if (title.length > 120) {
      return res.status(400).json({ error: 'Event name cannot exceed 120 characters.' });
    }
    if (!sectionName) {
      return res.status(400).json({ error: 'Event group (section) is required.' });
    }
    if (!location) {
      return res.status(400).json({ error: 'Venue is required.' });
    }
    if (location.length > 120) {
      return res.status(400).json({ error: 'Venue name cannot exceed 120 characters.' });
    }
    if (!startsAt) {
      return res.status(400).json({ error: 'Event date is required.' });
    }
    if (!dailyStartTime) {
      return res.status(400).json({ error: 'Start time is required.' });
    }
    if (!dailyEndTime) {
      return res.status(400).json({ error: 'End time is required.' });
    }

    const eventId = 'event-' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO events (
        id, title, section_name, location, starts_at, ends_at,
        daily_start_time, daily_end_time, description, status,
        parent_access_opens_at, parent_access_closes_at,
        parents_can_create_account, allow_multiple_children,
        allow_save_and_continue, allow_edit_after_submission,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      eventId,
      title,
      sectionName,
      location,
      startsAt,
      endsAt || startsAt,
      dailyStartTime,
      dailyEndTime,
      description || '',
      status,
      parentAccessOpensAt || null,
      parentAccessClosesAt || null,
      parentsCanCreateAccount ? 1 : 0,
      allowMultipleChildren ? 1 : 0,
      allowSaveAndContinue ? 1 : 0,
      allowEditAfterSubmission ? 1 : 0,
      now,
      now
    ]);

    if (ageGroups && Array.isArray(ageGroups)) {
      let sortOrder = 0;
      for (const group of ageGroups) {
        const groupId = 'group-' + Math.random().toString(36).substring(2, 11);
        await execute(`
          INSERT INTO event_age_groups (
            id, event_id, label, min_age, max_age, capacity, manual_review, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          groupId,
          eventId,
          group.label,
          parseInt(group.minAge) || 0,
          parseInt(group.maxAge) || 0,
          parseInt(group.capacity) || 0,
          group.manualReview ? 1 : 0,
          sortOrder++,
          now,
          now
        ]);
      }
    }

    res.json({ success: true, eventId, message: 'Event created successfully.' });
  } catch (err: any) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Failed to create event.' });
  }
});

// UPDATE event details (PATCH style for full/partial editing, handles age group sync)
router.patch('/events/:eventId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;
    const {
      title,
      sectionName,
      location,
      startsAt,
      endsAt,
      dailyStartTime,
      dailyEndTime,
      description,
      parentAccessOpensAt,
      parentAccessClosesAt,
      parentsCanCreateAccount,
      allowMultipleChildren,
      allowSaveAndContinue,
      allowEditAfterSubmission,
      status,
      ageGroups
    } = req.body;

    const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    if (title !== undefined) {
      if (!title) return res.status(400).json({ error: 'Event name is required.' });
      if (title.length > 120) return res.status(400).json({ error: 'Event name cannot exceed 120 characters.' });
    }
    if (sectionName !== undefined && !sectionName) {
      return res.status(400).json({ error: 'Event section name is required.' });
    }
    if (location !== undefined) {
      if (!location) return res.status(400).json({ error: 'Venue is required.' });
      if (location.length > 120) return res.status(400).json({ error: 'Venue name cannot exceed 120 characters.' });
    }

    const now = new Date().toISOString();

    await execute(`
      UPDATE events SET
        title = COALESCE(?, title),
        section_name = COALESCE(?, section_name),
        location = COALESCE(?, location),
        starts_at = COALESCE(?, starts_at),
        ends_at = COALESCE(?, ends_at),
        daily_start_time = COALESCE(?, daily_start_time),
        daily_end_time = COALESCE(?, daily_end_time),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        parent_access_opens_at = ?,
        parent_access_closes_at = ?,
        parents_can_create_account = COALESCE(?, parents_can_create_account),
        allow_multiple_children = COALESCE(?, allow_multiple_children),
        allow_save_and_continue = COALESCE(?, allow_save_and_continue),
        allow_edit_after_submission = COALESCE(?, allow_edit_after_submission),
        updated_at = ?
      WHERE id = ?
    `, [
      title || null,
      sectionName || null,
      location || null,
      startsAt || null,
      endsAt || null,
      dailyStartTime || null,
      dailyEndTime || null,
      description !== undefined ? description : null,
      status || null,
      parentAccessOpensAt !== undefined ? parentAccessOpensAt : event.parent_access_opens_at,
      parentAccessClosesAt !== undefined ? parentAccessClosesAt : event.parent_access_closes_at,
      parentsCanCreateAccount !== undefined ? (parentsCanCreateAccount ? 1 : 0) : null,
      allowMultipleChildren !== undefined ? (allowMultipleChildren ? 1 : 0) : null,
      allowSaveAndContinue !== undefined ? (allowSaveAndContinue ? 1 : 0) : null,
      allowEditAfterSubmission !== undefined ? (allowEditAfterSubmission ? 1 : 0) : null,
      now,
      eventId
    ]);

    if (ageGroups && Array.isArray(ageGroups)) {
      await execute('DELETE FROM event_age_groups WHERE event_id = ?', [eventId]);

      let sortOrder = 0;
      for (const group of ageGroups) {
        const groupId = 'group-' + Math.random().toString(36).substring(2, 11);
        await execute(`
          INSERT INTO event_age_groups (
            id, event_id, label, min_age, max_age, capacity, manual_review, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          groupId,
          eventId,
          group.label,
          parseInt(group.minAge) || 0,
          parseInt(group.maxAge) || 0,
          parseInt(group.capacity) || 0,
          group.manualReview ? 1 : 0,
          sortOrder++,
          now,
          now
        ]);
      }
    }

    res.json({ success: true, message: 'Event updated successfully.' });
  } catch (err: any) {
    console.error('Error updating event:', err);
    res.status(500).json({ error: 'Failed to update event.' });
  }
});

// PUBLISH event
router.post('/events/:eventId/publish', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;
    await execute("UPDATE events SET status = 'upcoming', updated_at = ? WHERE id = ?", [new Date().toISOString(), eventId]);
    res.json({ success: true, message: 'Event published successfully.' });
  } catch (err: any) {
    console.error('Error publishing event:', err);
    res.status(500).json({ error: 'Failed to publish event.' });
  }
});

// ARCHIVE event
router.post('/events/:eventId/archive', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;
    const now = new Date().toISOString();
    await execute("UPDATE events SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?", [now, now, eventId]);
    res.json({ success: true, message: 'Event archived successfully.' });
  } catch (err: any) {
    console.error('Error archiving event:', err);
    res.status(500).json({ error: 'Failed to archive event.' });
  }
});

// SET CURRENT ACTIVE event
router.post('/events/:eventId/set-current', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;
    const now = new Date().toISOString();
    await execute("UPDATE events SET status = 'upcoming', updated_at = ? WHERE status = 'current'", [now]);
    await execute("UPDATE events SET status = 'current', updated_at = ? WHERE id = ?", [now, eventId]);
    res.json({ success: true, message: 'Event is now set as the active current event.' });
  } catch (err: any) {
    console.error('Error setting current event:', err);
    res.status(500).json({ error: 'Failed to set current event.' });
  }
});

// Safe report query helpers to prevent any route crashing
async function safeReportQueryOne(sql: string, params: any[] = []): Promise<any> {
  try {
    return await queryOne(sql, params);
  } catch (err) {
    console.error('[safeReportQueryOne Error]:', err);
    return null;
  }
}

async function safeReportQuery(sql: string, params: any[] = []): Promise<any[]> {
  try {
    return await query(sql, params);
  } catch (err) {
    console.error('[safeReportQuery Error]:', err);
    return [];
  }
}

// GET reports endpoint
router.get('/reports', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'team')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const queryOne = safeReportQueryOne;
    const query = safeReportQuery;

    const eventId = 'event-ga-2026';
    let reportType = typeof req.query.reportType === 'string' ? req.query.reportType.trim().toLowerCase() : 'end_of_event';
    if (reportType === 'pre_event' || reportType === 'pre-event') {
      reportType = 'pre_event';
    } else if (reportType === 'live_event' || reportType === 'live-event') {
      reportType = 'live_event';
    } else if (reportType === 'end_of_event' || reportType === 'end-of-event') {
      reportType = 'end_of_event';
    } else {
      reportType = 'end_of_event';
    }

    // 1. Get Event
    const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
    const eventName = event?.section_name || 'The General Assembly';
    const eventSection = event?.title || 'Children and Teens';
    const dateRangeLabel = event?.starts_at && event?.ends_at 
      ? `${event.starts_at} - ${event.ends_at}` 
      : 'Oct 12 - Oct 14, 2023';

    // Fetch demographics and calculate counts dynamically from the DB
    const childrenData = await query(`
      SELECT c.gender, c.age_group, e.status, e.has_medical_notes, e.needs_extra_support, c.needs_age_review
      FROM children c
      LEFT JOIN child_event_entries e ON c.id = e.child_id AND e.event_id = ?
    `, [eventId]);

    const ageGroupsList = [
      { ageGroup: 'Under 1 year', displayLabel: 'Below 1' },
      { ageGroup: 'Ages 1 to 3', displayLabel: 'Ages 1 to 3' },
      { ageGroup: 'Ages 4 to 6', displayLabel: 'Ages 4 to 6' },
      { ageGroup: 'Ages 7 to 9', displayLabel: 'Ages 7 to 9' },
      { ageGroup: 'Ages 10 to 12', displayLabel: 'Ages 10 to 12' },
      { ageGroup: 'Teens', displayLabel: 'Teens' }
    ];

    // Care & Attention items
    const medicalNotesRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND has_medical_notes = 1", [eventId]);
    const extraSupportRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND needs_extra_support = 1", [eventId]);

    const missingPickupPhotoRes = await queryOne(`
      SELECT COUNT(DISTINCT e.id) as count 
      FROM child_event_entries e
      LEFT JOIN pickup_people p ON p.child_event_entry_id = e.id
      WHERE e.event_id = ? AND (p.id IS NULL OR p.photo_file_id IS NULL OR p.photo_file_id = '')
    `, [eventId]);

    const manualReviewRes = await queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND c.needs_age_review = 1
    `, [eventId]);

    const careNotesRes = await queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries 
      WHERE event_id = ? AND (has_medical_notes = 1 OR needs_extra_support = 1)
    `, [eventId]);

    // Segment Notes
    const notesRow = await queryOne('SELECT notes FROM admin_report_notes WHERE event_id = ? AND report_type = ?', [eventId, reportType]);
    const notes = notesRow?.notes || '';

    // Core variables
    const totalRegisteredRes = await queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ?', [eventId]);
    const totalRegistered = totalRegisteredRes?.count || 0;

    const parentAccountsRes = await queryOne(`
      SELECT COUNT(DISTINCT c.parent_profile_id) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ?
    `, [eventId]);
    const parentAccounts = parentAccountsRes?.count || 0;

    const selectedRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')", [eventId]);
    const selected = selectedRes?.count || 0;

    const checkedInRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('checked_in', 'inside', 'picked_up')", [eventId]);
    const checkedIn = checkedInRes?.count || 0;

    const absentRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready')", [eventId]);
    const absent = absentRes?.count || 0;

    const pickedUpRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'picked_up'", [eventId]);
    const pickedUp = pickedUpRes?.count || 0;

    const stillInsideRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('checked_in', 'inside')", [eventId]);
    const stillInside = stillInsideRes?.count || 0;

    const needsAttentionRes = await queryOne(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      WHERE e.event_id = ? AND (e.has_medical_notes = 1 OR e.needs_extra_support = 1 OR c.needs_age_review = 1)
    `, [eventId]);
    const needsAttention = needsAttentionRes?.count || 0;

    const careNotesPresent = careNotesRes?.count || 0;

    if (reportType === 'pre_event') {
      const underReviewRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'under_review'", [eventId]);
      const underReview = underReviewRes?.count || 0;

      const waitingListRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'waiting_list'", [eventId]);
      const waitingList = waitingListRes?.count || 0;

      const notSelectedRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('not_selected', 'withdrawn', 'rejected')", [eventId]);
      const notSelected = notSelectedRes?.count || 0;

      const preSelectedRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready')", [eventId]);
      const preSelected = preSelectedRes?.count || 0;

      const withPickupRes = await queryOne(`
        SELECT COUNT(DISTINCT child_event_entry_id) as count 
        FROM pickup_people 
        WHERE child_event_entry_id IN (SELECT id FROM child_event_entries WHERE event_id = ?)
      `, [eventId]);
      const withPickupCount = withPickupRes?.count || 0;

      const missingContactRes = await queryOne(`
        SELECT COUNT(DISTINCT p.id) as count 
        FROM parent_profiles p 
        JOIN children c ON p.id = c.parent_profile_id 
        JOIN child_event_entries e ON e.child_id = c.id 
        WHERE e.event_id = ? AND (p.phone_number IS NULL OR p.phone_number = '' OR p.email IS NULL OR p.email = '')
      `, [eventId]);
      const missingContact = missingContactRes?.count || 0;

      const duplicatePhoneRes = await queryOne(`
        SELECT COUNT(*) as count FROM (
          SELECT p.phone_number
          FROM child_event_entries e 
          JOIN children c ON c.id = e.child_id 
          JOIN parent_profiles p ON p.id = c.parent_profile_id 
          WHERE e.event_id = ? 
          GROUP BY p.phone_number 
          HAVING COUNT(*) > 1
        ) as dup_phones
      `, [eventId]);
      const duplicatePhone = duplicatePhoneRes?.count || 0;

      const ageGroupSummary = ageGroupsList.map(g => {
        const matching = (childrenData || []).filter((c: any) => c.age_group === g.ageGroup);
        const registered = matching.length;
        const selectedCount = matching.filter((c: any) => ['selected', 'pass_ready', 'checked_in', 'inside', 'picked_up'].includes(c.status)).length;
        const underReviewCount = matching.filter((c: any) => c.status === 'under_review').length;
        const needsAttentionCount = matching.filter((c: any) => c.has_medical_notes === 1 || c.needs_extra_support === 1 || c.needs_age_review === 1).length;
        return {
          ageGroup: g.displayLabel,
          registered,
          selected: selectedCount,
          underReview: underReviewCount,
          needsAttention: needsAttentionCount
        };
      });

      return res.json({
        success: true,
        reportType: 'pre_event',
        event: {
          id: eventId,
          name: eventName,
          section: eventSection,
          dateRangeLabel: dateRangeLabel
        },
        metrics: {
          totalRegistered,
          underReview,
          selected: preSelected,
          waitingList,
          notSelected,
          needsAttention,
          missingPickupPhoto: missingPickupPhotoRes?.count || 0,
          careNotesPresent
        },
        sections: {
          reviewReadiness: [
            { label: "Under review", value: underReview, desc: "Applications pending director review" },
            { label: "Selected", value: preSelected, desc: "Children admitted to the event" },
            { label: "Waiting list", value: waitingList, desc: "Applications on hold due to capacity limits" },
            { label: "Not selected", value: notSelected, desc: "Applications declined or withdrawn" },
            { label: "Needs attention", value: needsAttention, desc: "Applications flagged for manual care review" }
          ],
          childReadiness: [
            { label: "Missing pickup photo", value: missingPickupPhotoRes?.count || 0, desc: "Children without registered guardian photos" },
            { label: "Medical notes", value: medicalNotesRes?.count || 0, desc: "Children with declared health conditions" },
            { label: "Extra support", value: extraSupportRes?.count || 0, desc: "Children requiring learning or physical support" },
            { label: "Below event age", value: manualReviewRes?.count || 0, desc: "Children younger than event minimum age threshold" },
            { label: "Duplicate phone number", value: duplicatePhone, desc: "Registrations sharing identical parent contacts" }
          ],
          ageGroupSummary,
          parentPickupReadiness: [
            { label: "Parent accounts", value: parentAccounts, desc: "Total registered parent user profiles" },
            { label: "Children with pickup person", value: withPickupCount, desc: "Children with at least one authorized pickup contact" },
            { label: "Missing pickup photo", value: missingPickupPhotoRes?.count || 0, desc: "Children with pickup person registered but missing photos" },
            { label: "Missing contact detail", value: missingContact, desc: "Parents missing email or mobile numbers" }
          ]
        },
        careAttention: [
          { key: "medical_notes", label: "Medical notes", count: medicalNotesRes?.count || 0 },
          { key: "extra_support", label: "Extra support", count: extraSupportRes?.count || 0 },
          { key: "missing_pickup_photo", label: "Missing pickup photo", count: missingPickupPhotoRes?.count || 0 },
          { key: "manual_review", label: "Manual review", count: manualReviewRes?.count || 0 }
        ],
        notes,
        exports: {
          readinessSummary: true,
          selectedChildren: true,
          careNotes: true,
          missingPickupPhotos: true
        }
      });
    }

    if (reportType === 'live_event') {
      const expected = selected;
      const inside = stillInside;
      const notArrived = absent;

      const pickupIssueRes = await queryOne(`
        SELECT COUNT(*) as count 
        FROM child_event_entries e 
        LEFT JOIN pickup_people p ON p.child_event_entry_id = e.id 
        WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside') AND (p.id IS NULL OR p.approved_by_parent = 0)
      `, [eventId]);
      const pickupIssueCount = pickupIssueRes?.count || 0;

      const attendanceByAgeGroup = ageGroupsList.map(g => {
        const matching = (childrenData || []).filter((c: any) => c.age_group === g.ageGroup);
        const exp = matching.filter((c: any) => ['selected', 'pass_ready', 'checked_in', 'inside', 'picked_up'].includes(c.status)).length;
        const chk = matching.filter((c: any) => ['checked_in', 'inside', 'picked_up'].includes(c.status)).length;
        const ins = matching.filter((c: any) => ['checked_in', 'inside'].includes(c.status)).length;
        const pku = matching.filter((c: any) => c.status === 'picked_up').length;
        const nta = matching.filter((c: any) => ['selected', 'pass_ready'].includes(c.status)).length;
        return {
          ageGroup: g.displayLabel,
          expected: exp,
          checkedIn: chk,
          inside: ins,
          pickedUp: pku,
          notArrived: nta
        };
      });

      // Recent scans
      const recentScansRows = await query(`
        SELECT c.id as child_id, c.full_name as child_name, c.age_group, e.status, e.updated_at
        FROM child_event_entries e
        JOIN children c ON e.child_id = c.id
        WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside', 'picked_up')
        ORDER BY e.updated_at DESC
        LIMIT 5
      `, [eventId]);

      const recentScans = (recentScansRows || []).map((r: any) => ({
        childId: r.child_id,
        childName: r.child_name,
        ageGroup: r.age_group,
        status: r.status,
        timestamp: r.updated_at
      }));

      // Team activity
      const teamActivityRows = await query(`
        SELECT full_name, preferred_team as team, status 
        FROM volunteer_profiles 
        WHERE status = 'approved' 
        LIMIT 5
      `);
      const teamActivity = (teamActivityRows || []).map((t: any) => ({
        fullName: t.full_name,
        team: t.team || 'General',
        status: t.status
      }));

      return res.json({
        success: true,
        reportType: 'live_event',
        event: {
          id: eventId,
          name: eventName,
          section: eventSection,
          dateRangeLabel: dateRangeLabel
        },
        metrics: {
          expected,
          checkedIn,
          inside,
          pickedUp,
          notArrived,
          needsAttention
        },
        sections: {
          liveAttendanceOutcome: [
            { label: "Expected", value: expected, percentage: 100 },
            { label: "Checked In", value: checkedIn, percentage: expected > 0 ? Math.round((checkedIn / expected) * 100) : 0 },
            { label: "Inside", value: inside, percentage: expected > 0 ? Math.round((inside / expected) * 100) : 0 },
            { label: "Picked Up", value: pickedUp, percentage: expected > 0 ? Math.round((pickedUp / expected) * 100) : 0 },
            { label: "Not arrived", value: notArrived, percentage: expected > 0 ? Math.round((notArrived / expected) * 100) : 0 }
          ],
          attendanceByAgeGroup,
          currentAttentionList: [
            { label: "Medical note", value: medicalNotesRes?.count || 0, desc: "Children inside with health alerts" },
            { label: "Extra support", value: extraSupportRes?.count || 0, desc: "Children inside requiring physical/learning assistance" },
            { label: "Missing pickup photo", value: missingPickupPhotoRes?.count || 0, desc: "Children checked in without guardian photos" },
            { label: "Manual review", value: manualReviewRes?.count || 0, desc: "Children marked for age verification review" },
            { label: "Pickup issue", value: pickupIssueCount, desc: "Children checked in with pending guardian confirmation" }
          ],
          recentScans,
          teamActivity
        },
        careAttention: [
          { key: "medical_notes", label: "Medical notes", count: medicalNotesRes?.count || 0 },
          { key: "extra_support", label: "Extra support", count: extraSupportRes?.count || 0 },
          { key: "missing_pickup_photo", label: "Missing pickup photo", count: missingPickupPhotoRes?.count || 0 },
          { key: "manual_review", label: "Manual review", count: manualReviewRes?.count || 0 }
        ],
        notes,
        exports: {
          liveAttendance: true,
          childrenInside: true,
          notArrived: true,
          pickupList: true,
          needsAttention: true
        }
      });
    }

    // Default: end_of_event Report
    return res.json({
      success: true,
      reportType: 'end_of_event',
      event: {
        id: eventId,
        name: eventName,
        section: eventSection,
        dateRangeLabel: dateRangeLabel
      },
      metrics: {
        totalRegistered,
        parentAccounts,
        selected,
        checkedIn,
        absent,
        pickedUp,
        stillInside,
        needsAttention,
        careNotesPresent
      },
      attendanceOutcome: [
        { label: "Selected", value: selected },
        { label: "Checked In", value: checkedIn },
        { label: "Absent", value: absent },
        { label: "Picked Up", value: pickedUp }
      ],
      eventSummary: [
        { label: "Registered children", value: totalRegistered, desc: "All child applications/records for current event" },
        { label: "Parent accounts", value: parentAccounts, desc: "Total parental user profiles" },
        { label: "Selected", value: selected, desc: "Children admitted/selected for current event" },
        { label: "Checked in", value: checkedIn, desc: "Total child check-ins recorded" },
        { label: "Absent", value: absent, desc: "Admitted children who have not checked in" },
        { label: "Picked up", value: pickedUp, desc: "Admitted children picked up by guardians" },
        { label: "Still inside", value: stillInside, desc: "Admitted children currently remaining inside" },
        { label: "Needs attention", value: needsAttention, desc: "Children flagged for care, medical, or age review" },
        { label: "Care notes present", value: careNotesPresent, desc: "Children with active medical or special support notes" }
      ],
      careAttention: [
        { key: "medical_notes", label: "Medical notes", count: medicalNotesRes?.count || 0 },
        { key: "extra_support", label: "Extra support", count: extraSupportRes?.count || 0 },
        { key: "missing_pickup_photo", label: "Missing pickup photo", count: missingPickupPhotoRes?.count || 0 },
        { key: "manual_review", label: "Manual review", count: manualReviewRes?.count || 0 }
      ],
      notes,
      exports: {
        eventReport: true,
        excelSummary: false,
        selectedChildren: true,
        attendance: true,
        absentChildren: true,
        careNotes: true,
        pickupList: true
      }
    });

  } catch (err: any) {
    console.error('Error fetching admin reports:', err);
    return res.status(500).json({ error: 'Failed to fetch report metrics.' });
  }
});

// POST reports notes endpoint
router.post('/reports/notes', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'team')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { eventId, reportType, notes } = req.body;
    if (!eventId || !reportType) {
      return res.status(400).json({ error: 'eventId and reportType are required.' });
    }

    const now = new Date().toISOString();
    const existing = await queryOne('SELECT id FROM admin_report_notes WHERE event_id = ? AND report_type = ?', [eventId, reportType]);
    if (existing) {
      await execute('UPDATE admin_report_notes SET notes = ?, updated_at = ? WHERE event_id = ? AND report_type = ?', [notes || '', now, eventId, reportType]);
    } else {
      const id = `arn-${Math.random().toString(36).substr(2, 9)}`;
      await execute('INSERT INTO admin_report_notes (id, event_id, report_type, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, eventId, reportType, notes || '', now, now]);
    }

    return res.json({ success: true, message: 'Report notes saved successfully.' });
  } catch (err: any) {
    console.error('Error saving report notes:', err);
    return res.status(500).json({ error: 'Failed to save report notes.' });
  }
});

// GET reports export endpoint
router.get('/reports/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'team')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const eventId = 'event-ga-2026';
    const type = typeof req.query.type === 'string' ? req.query.type : 'attendance';
    const format = typeof req.query.format === 'string' ? req.query.format : 'csv';

    if (format !== 'csv') {
      return res.status(400).json({ error: 'Unsupported format. Only CSV export is implemented at this time.' });
    }

    function escapeCSV(val: any) {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str}"`;
      }
      return str;
    }

    let csvContent = '';
    let filename = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`;

    if (type === 'event_summary') {
      const totalRegisteredRes = await queryOne('SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ?', [eventId]);
      const totalRegistered = totalRegisteredRes?.count || 0;

      const parentAccountsRes = await queryOne(`
        SELECT COUNT(DISTINCT c.parent_profile_id) as count 
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        WHERE e.event_id = ?
      `, [eventId]);
      const parentAccounts = parentAccountsRes?.count || 0;

      const selectedRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')", [eventId]);
      const selected = selectedRes?.count || 0;

      const checkedInRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('checked_in', 'inside', 'picked_up')", [eventId]);
      const checkedIn = checkedInRes?.count || 0;

      const absentRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('selected', 'pass_ready')", [eventId]);
      const absent = absentRes?.count || 0;

      const pickedUpRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status = 'picked_up'", [eventId]);
      const pickedUp = pickedUpRes?.count || 0;

      const stillInsideRes = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE event_id = ? AND status IN ('checked_in', 'inside')", [eventId]);
      const stillInside = stillInsideRes?.count || 0;

      const needsAttentionRes = await queryOne(`
        SELECT COUNT(*) as count 
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        WHERE e.event_id = ? AND (e.has_medical_notes = 1 OR e.needs_extra_support = 1 OR c.needs_age_review = 1)
      `, [eventId]);
      const needsAttention = needsAttentionRes?.count || 0;

      const careNotesRes = await queryOne(`
        SELECT COUNT(*) as count 
        FROM child_event_entries 
        WHERE event_id = ? AND (has_medical_notes = 1 OR needs_extra_support = 1)
      `, [eventId]);
      const careNotesPresent = careNotesRes?.count || 0;

      csvContent += 'Metric,Count,Description\n';
      csvContent += `Registered children,${totalRegistered},All child applications/records for current event\n`;
      csvContent += `Parent accounts,${parentAccounts},Total parental user profiles\n`;
      csvContent += `Selected,${selected},Children admitted/selected for current event\n`;
      csvContent += `Checked in,${checkedIn},Total child check-ins recorded\n`;
      csvContent += `Absent,${absent},Admitted children who have not checked in\n`;
      csvContent += `Picked up,${pickedUp},Admitted children picked up by guardians\n`;
      csvContent += `Still inside,${stillInside},Admitted children currently remaining inside\n`;
      csvContent += `Needs attention,${needsAttention},Children flagged for care, medical, or age review\n`;
      csvContent += `Care notes present,${careNotesPresent},Children with active medical or special support notes\n`;

    } else if (type === 'attendance') {
      const rows = await query(`
        SELECT 
          e.id as entry_id,
          e.status,
          e.has_medical_notes,
          e.medical_notes,
          e.needs_extra_support,
          e.support_notes,
          e.checked_in_at,
          e.picked_up_at,
          c.full_name as child_name,
          c.age_group,
          p.full_name as parent_name,
          p.phone_number as parent_phone
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
        ORDER BY c.full_name ASC
      `, [eventId]);

      csvContent += 'Entry ID,Child Name,Age Group,Parent Name,Parent Phone,Status,Checked In At,Picked Up At,Notes\n';
      for (const r of rows) {
        let careNote = '';
        if (r.has_medical_notes && r.medical_notes) careNote = r.medical_notes;
        else if (r.needs_extra_support && r.support_notes) careNote = r.support_notes;

        csvContent += `${escapeCSV(r.entry_id)},${escapeCSV(r.child_name)},${escapeCSV(r.age_group)},${escapeCSV(r.parent_name)},${escapeCSV(r.parent_phone)},${escapeCSV(r.status)},${escapeCSV(r.checked_in_at)},${escapeCSV(r.picked_up_at)},${escapeCSV(careNote)}\n`;
      }

    } else if (type === 'absent') {
      const rows = await query(`
        SELECT 
          e.id as entry_id,
          e.status,
          c.full_name as child_name,
          c.age_group,
          p.full_name as parent_name,
          p.phone_number as parent_phone
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready')
        ORDER BY c.full_name ASC
      `, [eventId]);

      csvContent += 'Entry ID,Child Name,Age Group,Parent Name,Parent Phone,Status\n';
      for (const r of rows) {
        csvContent += `${escapeCSV(r.entry_id)},${escapeCSV(r.child_name)},${escapeCSV(r.age_group)},${escapeCSV(r.parent_name)},${escapeCSV(r.parent_phone)},${escapeCSV(r.status)}\n`;
      }

    } else if (type === 'care_notes') {
      const rows = await query(`
        SELECT 
          c.full_name as child_name,
          c.age_group,
          p.full_name as parent_name,
          p.phone_number as parent_phone,
          e.medical_notes,
          e.support_notes
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ? AND (e.has_medical_notes = 1 OR e.needs_extra_support = 1)
        ORDER BY c.full_name ASC
      `, [eventId]);

      csvContent += 'Child Name,Age Group,Parent Name,Parent Phone,Medical Notes,Support Notes\n';
      for (const r of rows) {
        csvContent += `${escapeCSV(r.child_name)},${escapeCSV(r.age_group)},${escapeCSV(r.parent_name)},${escapeCSV(r.parent_phone)},${escapeCSV(r.medical_notes)},${escapeCSV(r.support_notes)}\n`;
      }

    } else if (type === 'pickup_list') {
      const rows = await query(`
        SELECT 
          c.full_name as child_name,
          p.full_name as parent_name,
          p.phone_number as parent_phone,
          pp.full_name as pickup_name,
          pp.relationship_to_child as pickup_relation,
          pp.phone_number as pickup_phone,
          e.status
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        LEFT JOIN pickup_people pp ON pp.child_event_entry_id = e.id
        WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside', 'picked_up')
        ORDER BY c.full_name ASC
      `, [eventId]);

      csvContent += 'Child Name,Parent Name,Parent Phone,Pickup Contact,Relationship,Pickup Phone,Status\n';
      for (const r of rows) {
        csvContent += `${escapeCSV(r.child_name)},${escapeCSV(r.parent_name)},${escapeCSV(r.parent_phone)},${escapeCSV(r.pickup_name)},${escapeCSV(r.pickup_relation)},${escapeCSV(r.pickup_phone)},${escapeCSV(r.status)}\n`;
      }

    } else if (type === 'selected_children') {
      const rows = await query(`
        SELECT 
          e.id as entry_id,
          e.status,
          c.full_name as child_name,
          c.age_group,
          p.full_name as parent_name,
          p.phone_number as parent_phone
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
        ORDER BY c.full_name ASC
      `, [eventId]);

      csvContent += 'Entry ID,Child Name,Age Group,Parent Name,Parent Phone,Status\n';
      for (const r of rows) {
        csvContent += `${escapeCSV(r.entry_id)},${escapeCSV(r.child_name)},${escapeCSV(r.age_group)},${escapeCSV(r.parent_name)},${escapeCSV(r.parent_phone)},${escapeCSV(r.status)}\n`;
      }

    } else if (type === 'missing_pickup_photos') {
      const rows = await query(`
        SELECT 
          e.id as entry_id,
          c.full_name as child_name,
          c.age_group,
          p.full_name as parent_name,
          p.phone_number as parent_phone
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        LEFT JOIN pickup_people pp ON pp.child_event_entry_id = e.id
        WHERE e.event_id = ? AND (pp.id IS NULL OR pp.photo_file_id IS NULL OR pp.photo_file_id = '')
        ORDER BY c.full_name ASC
      `, [eventId]);

      csvContent += 'Entry ID,Child Name,Age Group,Parent Name,Parent Phone,Status\n';
      for (const r of rows) {
        csvContent += `${escapeCSV(r.entry_id)},${escapeCSV(r.child_name)},${escapeCSV(r.age_group)},${escapeCSV(r.parent_name)},${escapeCSV(r.parent_phone)},${escapeCSV(r.status)}\n`;
      }

    } else if (type === 'children_inside') {
      const rows = await query(`
        SELECT 
          e.id as entry_id,
          c.full_name as child_name,
          c.age_group,
          p.full_name as parent_name,
          p.phone_number as parent_phone,
          e.checked_in_at
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside')
        ORDER BY c.full_name ASC
      `, [eventId]);

      csvContent += 'Entry ID,Child Name,Age Group,Parent Name,Parent Phone,Checked In At\n';
      for (const r of rows) {
        csvContent += `${escapeCSV(r.entry_id)},${escapeCSV(r.child_name)},${escapeCSV(r.age_group)},${escapeCSV(r.parent_name)},${escapeCSV(r.parent_phone)},${escapeCSV(r.checked_in_at)}\n`;
      }

    } else if (type === 'not_arrived') {
      const rows = await query(`
        SELECT 
          e.id as entry_id,
          c.full_name as child_name,
          c.age_group,
          p.full_name as parent_name,
          p.phone_number as parent_phone
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready')
        ORDER BY c.full_name ASC
      `, [eventId]);

      csvContent += 'Entry ID,Child Name,Age Group,Parent Name,Parent Phone\n';
      for (const r of rows) {
        csvContent += `${escapeCSV(r.entry_id)},${escapeCSV(r.child_name)},${escapeCSV(r.age_group)},${escapeCSV(r.parent_name)},${escapeCSV(r.parent_phone)}\n`;
      }

    } else if (type === 'needs_attention') {
      const rows = await query(`
        SELECT 
          e.id as entry_id,
          c.full_name as child_name,
          c.age_group,
          p.full_name as parent_name,
          p.phone_number as parent_phone,
          e.has_medical_notes,
          e.medical_notes,
          e.needs_extra_support,
          e.support_notes,
          c.needs_age_review
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ? AND (e.has_medical_notes = 1 OR e.needs_extra_support = 1 OR c.needs_age_review = 1)
        ORDER BY c.full_name ASC
      `, [eventId]);

      csvContent += 'Entry ID,Child Name,Age Group,Parent Name,Parent Phone,Medical Alert,Support Alert,Age Review Alert\n';
      for (const r of rows) {
        csvContent += `${escapeCSV(r.entry_id)},${escapeCSV(r.child_name)},${escapeCSV(r.age_group)},${escapeCSV(r.parent_name)},${escapeCSV(r.parent_phone)},${r.has_medical_notes ? 'YES' : 'NO'},${r.needs_extra_support ? 'YES' : 'NO'},${r.needs_age_review ? 'YES' : 'NO'}\n`;
      }

    } else {
      return res.status(400).json({ error: 'Invalid export type requested.' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);

  } catch (err: any) {
    console.error('Error generating CSV export:', err);
    return res.status(500).json({ error: 'Failed to generate export file.' });
  }
});

// GET all notification rules for an event
router.get('/events/:eventId/rules', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const rules = await query('SELECT * FROM event_notification_rules WHERE event_id = ? ORDER BY created_at ASC', [eventId]);
  res.json(rules);
});

// GET all notification jobs for an event (including sending history)
router.get('/events/:eventId/jobs', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const jobs = await query(`
    SELECT j.*, r.name as rule_name, r.channel, p.full_name as parent_name, p.email as parent_email
    FROM notification_jobs j
    LEFT JOIN event_notification_rules r ON r.id = j.rule_id
    LEFT JOIN parent_profiles p ON p.id = j.parent_id
    WHERE j.event_id = ?
    ORDER BY j.scheduled_for ASC, j.created_at DESC
  `, [eventId]);
  res.json(jobs);
});

// POST test notification rule directly to a selected email address
router.post('/events/:eventId/notifications/test', async (req: AuthenticatedRequest, res: Response) => {
  const { eventId } = req.params;
  const { ruleType, testEmail } = req.body;

  if (!ruleType || !testEmail) {
    return res.status(400).json({ error: 'Missing ruleType or testEmail in payload.' });
  }

  const result = await executeTestNotification({
    eventId,
    ruleType,
    testEmail
  });

  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(500).json({ error: result.message });
  }
});

// POST manual notification
router.post('/notifications', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const creatorId = req.user?.id;
    const {
      title,
      message,
      type = 'info',
      audienceRole = 'parent',
      audienceScope = 'all',
      eventId = 'event-ga-2026',
      childId,
      parentId,
      priority = 'normal',
      channel = 'in-app',
      visibleToEventTeam = false,
      metadata
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const crypto = require('crypto');
    const notificationId = `notif-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    await execute(`
      INSERT INTO notifications (
        id, title, message, type, audience_role, audience_scope, event_id, child_id, parent_id,
        created_by_user_id, visible_to_event_team, created_at, priority, channel, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      notificationId,
      title,
      message,
      type,
      audienceRole,
      audienceScope,
      eventId || null,
      childId || null,
      parentId || null,
      creatorId,
      visibleToEventTeam ? 1 : 0,
      createdAt,
      priority,
      channel,
      metadata ? JSON.stringify(metadata) : null
    ]);

    // Backward compatibility with parent_notifications
    if (audienceRole === 'parent' || parentId) {
      const parentsToNotify: any[] = [];
      if (parentId) {
        parentsToNotify.push({ id: parentId });
      } else {
        const allParents = await query('SELECT id FROM parent_profiles');
        parentsToNotify.push(...allParents);
      }

      for (const parent of parentsToNotify) {
        const parentNotifId = `pnotif-${crypto.randomUUID()}`;
        await execute(`
          INSERT INTO parent_notifications (id, parent_id, event_id, child_id, title, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          parentNotifId,
          parent.id,
          eventId || null,
          childId || null,
          title,
          message,
          createdAt
        ]);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notificationId
    });
  } catch (err: any) {
    console.error('Error creating admin notification:', err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// POST test broadcast notification
router.post('/notifications/test', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const crypto = require('crypto');
    const notificationId = `testnotif-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    await execute(`
      INSERT INTO notifications (
        id, title, message, type, audience_role, audience_scope, created_at, priority, channel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      notificationId,
      'System Test Notification',
      'This is a test notification generated by the administrator to verify the routing pipeline.',
      'info',
      'all',
      'broadcast',
      createdAt,
      'high',
      'in-app'
    ]);

    res.json({
      success: true,
      message: 'Test notification broadcasted successfully',
      notificationId
    });
  } catch (err: any) {
    console.error('Error creating test notification:', err);
    res.status(500).json({ error: 'Failed to dispatch test notification' });
  }
});

// POST test whatsapp message
router.post('/notifications/test-whatsapp', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Recipient phone number ("to") and "message" are required.' });
    }

    const provider = process.env.WHATSAPP_PROVIDER || 'twilio';
    console.log(`[WhatsApp Test Endpoint] Dispatching via provider: ${provider} to: ${to}`);

    const result = await sendWhatsApp(to, message);

    if (result.success) {
      return res.json({
        success: true,
        message: 'WhatsApp message accepted by provider.',
        provider,
        messageSid: result.messageSid || 'simulated-sid'
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to send WhatsApp message via Twilio.',
        provider
      });
    }
  } catch (err: any) {
    console.error('Error in test-whatsapp endpoint:', err);
    res.status(500).json({ error: err.message || 'Failed to process WhatsApp test request.' });
  }
});

// GET messages dashboard data
router.get('/messages', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const eventId = 'event-ga-2026';

    // 1. Fetch message metrics from our manual admin message logs
    const logs = await query('SELECT status, channel, recipients_count FROM admin_message_logs');
    let messagesSent = 0;
    let whatsappSent = 0;
    let emailSent = 0;
    let failed = 0;
    let pending = 0;

    for (const log of logs) {
      const count = Number(log.recipients_count || 0);
      if (log.status === 'sent') {
        messagesSent += count;
        if (log.channel === 'whatsapp' || log.channel === 'both') {
          whatsappSent += count;
        }
        if (log.channel === 'email' || log.channel === 'both') {
          emailSent += count;
        }
      } else if (log.status === 'failed') {
        failed += count;
      } else if (log.status === 'pending') {
        pending += count;
      }
    }

    // 2. Fetch real counts for recipient groups based on actual children/parents
    const countAllRes = await queryOne(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ?
    `, [eventId]);

    const countSelectedRes = await queryOne(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND e.status IN ('selected', 'pass_ready')
    `, [eventId]);

    const countReviewRes = await queryOne(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND e.status = 'under_review'
    `, [eventId]);

    const countWaitingRes = await queryOne(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND e.status = 'waiting_list'
    `, [eventId]);

    const countNotSelectedRes = await queryOne(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND e.status = 'not_selected'
    `, [eventId]);

    const countPassReadyRes = await queryOne(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      WHERE e.event_id = ? AND e.status = 'pass_ready'
    `, [eventId]);

    const recipientGroups = [
      { key: 'all_parents', label: 'All parents', count: Number(countAllRes?.count || 0) },
      { key: 'selected_children', label: 'Selected children', count: Number(countSelectedRes?.count || 0) },
      { key: 'under_review', label: 'Under review', count: Number(countReviewRes?.count || 0) },
      { key: 'waiting_list', label: 'Waiting list', count: Number(countWaitingRes?.count || 0) },
      { key: 'not_selected', label: 'Not selected', count: Number(countNotSelectedRes?.count || 0) },
      { key: 'pass_ready', label: 'Pass ready', count: Number(countPassReadyRes?.count || 0) }
    ];

    const messageTypes = [
      { key: 'pass_ready', label: 'Pass ready' },
      { key: 'review_update', label: 'Review update' },
      { key: 'waiting_list_update', label: 'Waiting list update' },
      { key: 'pickup_reminder', label: 'Pickup reminder' },
      { key: 'general_announcement', label: 'General announcement' }
    ];

    // 3. Fetch recent message activity log
    const recentActivity = await query(`
      SELECT id, recipient_group as recipientGroup, message_type as messageType, channel, subject, body, recipients_count as recipientsCount, status, created_at as createdAt
      FROM admin_message_logs
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // 4. Fetch latest saved draft
    const latestDraft = await queryOne(`
      SELECT recipient_group as recipientGroup, message_type as messageType, channel, subject, body
      FROM admin_message_drafts
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    const emailProvider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
    let emailEnabled = false;
    if (emailProvider === 'resend') {
      emailEnabled = !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM_ADDRESS;
    } else {
      emailEnabled = !!process.env.SMTP_USER && !!process.env.SMTP_PASS && !!process.env.SMTP_HOST && !!process.env.MAIL_FROM_ADDRESS;
    }

    const whatsappProvider = (process.env.WHATSAPP_PROVIDER || 'twilio').toLowerCase();
    let whatsappEnabled = false;
    if (whatsappProvider === 'twilio') {
      whatsappEnabled = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
    }

    const settings = await queryOne(`
      SELECT sender_name as senderName, reply_to_email as replyToEmail
      FROM admin_message_settings
      WHERE id = 'primary_settings'
    `);

    const providerStatus = {
      emailEnabled,
      whatsappEnabled,
      emailProvider: emailProvider === 'resend' ? 'resend' : emailProvider === 'smtp' ? 'smtp' : null,
      whatsappProvider: whatsappProvider === 'twilio' ? 'twilio' : null,
      senderName: settings?.senderName || process.env.MAIL_FROM_NAME || 'Koinonia Global',
      fromEmail: process.env.MAIL_FROM_ADDRESS || null,
      replyToEmail: settings?.replyToEmail || process.env.MAIL_FROM_ADDRESS || null
    };

    res.json({
      success: true,
      stats: {
        messagesSent,
        whatsappSent,
        emailSent,
        failed,
        pending
      },
      recipientGroups,
      messageTypes,
      recentActivity: recentActivity || [],
      latestDraft: latestDraft || null,
      emailEnabled,
      whatsappEnabled,
      providerStatus
    });
  } catch (err: any) {
    console.error('Error fetching admin messages dashboard:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve message details' });
  }
});

// GET messages settings
router.get('/messages/settings', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const emailProvider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
    let emailEnabled = false;
    if (emailProvider === 'resend') {
      emailEnabled = !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM_ADDRESS;
    } else {
      emailEnabled = !!process.env.SMTP_USER && !!process.env.SMTP_PASS && !!process.env.SMTP_HOST && !!process.env.MAIL_FROM_ADDRESS;
    }

    const whatsappProvider = (process.env.WHATSAPP_PROVIDER || 'twilio').toLowerCase();
    let whatsappEnabled = false;
    if (whatsappProvider === 'twilio') {
      whatsappEnabled = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
    }

    const settings = await queryOne(`
      SELECT sender_name as senderName, reply_to_email as replyToEmail
      FROM admin_message_settings
      WHERE id = 'primary_settings'
    `);

    res.json({
      success: true,
      senderName: settings?.senderName || process.env.MAIL_FROM_NAME || 'Koinonia Global',
      fromEmail: process.env.MAIL_FROM_ADDRESS || null,
      replyToEmail: settings?.replyToEmail || process.env.MAIL_FROM_ADDRESS || null,
      emailEnabled,
      whatsappEnabled,
      emailProvider: emailProvider === 'resend' ? 'resend' : emailProvider === 'smtp' ? 'smtp' : null,
      whatsappProvider: whatsappProvider === 'twilio' ? 'twilio' : null
    });
  } catch (err: any) {
    console.error('Error fetching admin messages settings:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve sender settings.' });
  }
});

// POST messages settings
router.post('/messages/settings', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { senderName, replyToEmail } = req.body;
    if (!senderName || !replyToEmail) {
      return res.status(400).json({ success: false, error: 'Sender name and Reply-to email are required.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(replyToEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid reply-to email address.' });
    }

    const id = 'primary_settings';
    const now = new Date().toISOString();
    await execute('DELETE FROM admin_message_settings WHERE id = ?', [id]);
    await execute(
      'INSERT INTO admin_message_settings (id, sender_name, reply_to_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, senderName, replyToEmail, now, now]
    );

    res.json({ success: true, message: 'Sender settings updated successfully.' });
  } catch (err: any) {
    console.error('Error updating admin messages settings:', err);
    res.status(500).json({ success: false, error: 'Failed to update sender settings.' });
  }
});

// GET general settings
router.get('/general-settings', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    let settings = await queryOne(`
      SELECT parent_registration_enabled as parentRegistrationEnabled,
             parent_login_enabled as parentLoginEnabled,
             required_child_photo as requiredChildPhoto,
             required_parent_photo as requiredParentPhoto,
             required_medical_notes as requiredMedicalNotes,
             required_pickup_person as requiredPickupPerson
      FROM admin_general_settings
      WHERE id = 'primary_general_settings'
    `);

    if (!settings) {
      settings = {
        parentRegistrationEnabled: 1,
        parentLoginEnabled: 1,
        requiredChildPhoto: 1,
        requiredParentPhoto: 1,
        requiredMedicalNotes: 0,
        requiredPickupPerson: 1
      };
    }

    return res.json({ success: true, settings });
  } catch (err: any) {
    console.error('Error fetching admin general settings:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve general settings.' });
  }
});

// POST general settings
router.post('/general-settings', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const {
      parentRegistrationEnabled,
      parentLoginEnabled,
      requiredChildPhoto,
      requiredParentPhoto,
      requiredMedicalNotes,
      requiredPickupPerson
    } = req.body;

    const id = 'primary_general_settings';
    const now = new Date().toISOString();

    const existing = await queryOne('SELECT id FROM admin_general_settings WHERE id = ?', [id]);
    if (existing) {
      await execute(`
        UPDATE admin_general_settings
        SET parent_registration_enabled = ?,
            parent_login_enabled = ?,
            required_child_photo = ?,
            required_parent_photo = ?,
            required_medical_notes = ?,
            required_pickup_person = ?,
            updated_at = ?
        WHERE id = ?
      `, [
        parentRegistrationEnabled ? 1 : 0,
        parentLoginEnabled ? 1 : 0,
        requiredChildPhoto ? 1 : 0,
        requiredParentPhoto ? 1 : 0,
        requiredMedicalNotes ? 1 : 0,
        requiredPickupPerson ? 1 : 0,
        now,
        id
      ]);
    } else {
      await execute(`
        INSERT INTO admin_general_settings (
          id, parent_registration_enabled, parent_login_enabled, required_child_photo, required_parent_photo,
          required_medical_notes, required_pickup_person, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        parentRegistrationEnabled ? 1 : 0,
        parentLoginEnabled ? 1 : 0,
        requiredChildPhoto ? 1 : 0,
        requiredParentPhoto ? 1 : 0,
        requiredMedicalNotes ? 1 : 0,
        requiredPickupPerson ? 1 : 0,
        now,
        now
      ]);
    }

    return res.json({ success: true, message: 'General settings updated successfully.' });
  } catch (err: any) {
    console.error('Error updating admin general settings:', err);
    return res.status(500).json({ success: false, error: 'Failed to update general settings.' });
  }
});

// GET admin landing settings
router.get('/landing-settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await query('SELECT setting_key, setting_value, value_type FROM admin_landing_settings');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value || '';
    }
    return res.json({ success: true, settings });
  } catch (err: any) {
    console.error('Error fetching admin landing settings:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve landing settings.' });
  }
});

// POST admin landing settings
router.post('/landing-settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Settings object is required.' });
    }

    const now = new Date().toISOString();
    const allowedKeys = [
      'site_logo', 'heroMain', 'heroUpper', 'heroRight', 'heroVideo',
      'passAvatar', 'workerAvatar', 'safetySection',
      'galleryArrival', 'galleryCheckIn', 'galleryActivities', 'galleryTeaching',
      'galleryCareTeam', 'galleryPickup', 'galleryParentUpdates', 'galleryEventMoments', 'galleryEventVideo'
    ];

    for (const [key, value] of Object.entries(settings)) {
      if (!allowedKeys.includes(key)) {
        return res.status(400).json({ success: false, error: `Invalid landing setting key: ${key}` });
      }

      if (value !== null && typeof value !== 'string') {
        return res.status(400).json({ success: false, error: `Setting value for ${key} must be a string.` });
      }

      const valueType = (key === 'heroVideo' || key === 'galleryEventVideo') ? 'video' : 'image';

      const existing = await queryOne('SELECT setting_key FROM admin_landing_settings WHERE setting_key = ?', [key]);
      if (existing) {
        await execute(
          'UPDATE admin_landing_settings SET setting_value = ?, value_type = ?, updated_at = ? WHERE setting_key = ?',
          [value || '', valueType, now, key]
        );
      } else {
        await execute(
          'INSERT INTO admin_landing_settings (setting_key, setting_value, value_type, updated_at) VALUES (?, ?, ?, ?)',
          [key, value || '', valueType, now]
        );
      }
    }

    return res.json({ success: true, message: 'Landing settings updated successfully.' });
  } catch (err: any) {
    console.error('Error updating admin landing settings:', err);
    return res.status(500).json({ success: false, error: 'Failed to update landing settings.' });
  }
});

// POST edit team role
router.post('/team/edit-role', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only Super Administrators can change team member roles.'
      });
    }

    const { userId, role } = req.body;
    if (!userId || !role) {
      return res.status(400).json({ success: false, error: 'User ID and role are required.' });
    }

    if (role !== 'admin' && role !== 'super_admin' && role !== 'team' && role !== 'volunteer') {
      return res.status(400).json({ success: false, error: 'Invalid team role.' });
    }

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const now = new Date().toISOString();
    await execute('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, now, userId]);

    return res.json({ success: true, message: 'Team member role updated successfully.' });
  } catch (err: any) {
    console.error('Error updating team member role:', err);
    return res.status(500).json({ success: false, error: 'Failed to update team member role.' });
  }
});

// POST message preview
router.post('/messages/preview', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { recipientGroup, messageType, channel, subject, body } = req.body;
    if (!body) {
      return res.status(400).json({ success: false, error: 'Message body is required for preview.' });
    }

    const eventId = 'event-ga-2026';

    // Build the query based on the selected recipientGroup
    let groupCondition = '';
    if (recipientGroup === 'selected_children') {
      groupCondition = "e.status IN ('selected', 'pass_ready')";
    } else if (recipientGroup === 'under_review') {
      groupCondition = "e.status = 'under_review'";
    } else if (recipientGroup === 'waiting_list') {
      groupCondition = "e.status = 'waiting_list'";
    } else if (recipientGroup === 'not_selected') {
      groupCondition = "e.status = 'not_selected'";
    } else if (recipientGroup === 'pass_ready') {
      groupCondition = "e.status = 'pass_ready'";
    }

    let sampleParent = null;
    if (groupCondition) {
      sampleParent = await queryOne(`
        SELECT p.full_name as parent_name, c.full_name as child_name, e.id as entry_id
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ? AND ${groupCondition}
        LIMIT 1
      `, [eventId]);
    } else {
      sampleParent = await queryOne(`
        SELECT p.full_name as parent_name, c.full_name as child_name, e.id as entry_id
        FROM child_event_entries e
        JOIN children c ON c.id = e.child_id
        JOIN parent_profiles p ON p.id = c.parent_profile_id
        WHERE e.event_id = ?
        LIMIT 1
      `, [eventId]);
    }

    const parentName = sampleParent?.parent_name || 'Sarah';
    const childName = sampleParent?.child_name || 'Mary';
    const entryId = sampleParent?.entry_id || 'sample-entry-123';

    // Safely replace templates
    const renderedBody = body
      .replace(/{Parent name}/g, parentName)
      .replace(/{Child name}/g, childName)
      .replace(/{Event name}/g, 'The General Assembly')
      .replace(/{Pass link}/g, `https://koinonia.org/pass/${entryId}`)
      .replace(/{Review link}/g, 'https://koinonia.org/parent/status')
      .replace(/{Pickup time}/g, '4:00 PM')
      .replace(/{Support contact}/g, '+234 803 123 4567');

    const renderedSubject = (subject || '')
      .replace(/{Parent name}/g, parentName)
      .replace(/{Child name}/g, childName)
      .replace(/{Event name}/g, 'The General Assembly');

    res.json({
      success: true,
      preview: {
        subject: renderedSubject,
        body: renderedBody
      }
    });
  } catch (err: any) {
    console.error('Error generating preview:', err);
    res.status(500).json({ success: false, error: 'Failed to render preview.' });
  }
});

// POST save draft
router.post('/messages/drafts', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { recipientGroup, messageType, channel, subject, body } = req.body;
    if (!recipientGroup || !messageType || !channel || !body) {
      return res.status(400).json({ success: false, error: 'Recipient group, message type, channel, and message body are required.' });
    }

    const id = 'primary_draft';
    const now = new Date().toISOString();

    await execute('DELETE FROM admin_message_drafts WHERE id = ?', [id]);
    await execute(
      'INSERT INTO admin_message_drafts (id, recipient_group, message_type, channel, subject, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, recipientGroup, messageType, channel, subject || '', body, now, now]
    );

    res.json({ success: true, message: 'Draft saved successfully.' });
  } catch (err: any) {
    console.error('Error saving message draft:', err);
    res.status(500).json({ success: false, error: 'Failed to save message draft.' });
  }
});

// POST send message
router.post('/messages/send', async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const { recipientGroup, messageType, channel, subject, body, confirmed } = req.body;
    if (!confirmed) {
      return res.status(400).json({ success: false, error: 'Send request must be explicitly confirmed.' });
    }
    if (!recipientGroup || !messageType || !channel || !body) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    // Honest provider configuration check before sending
    const emailProvider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
    let emailEnabled = false;
    if (emailProvider === 'resend') {
      emailEnabled = !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM_ADDRESS;
    } else {
      emailEnabled = !!process.env.SMTP_USER && !!process.env.SMTP_PASS && !!process.env.SMTP_HOST && !!process.env.MAIL_FROM_ADDRESS;
    }

    const whatsappProvider = (process.env.WHATSAPP_PROVIDER || 'twilio').toLowerCase();
    let whatsappEnabled = false;
    if (whatsappProvider === 'twilio') {
      whatsappEnabled = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
    }

    if ((channel === 'email' || channel === 'both') && !emailEnabled) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_UNCONFIGURED',
        message: 'The email delivery channel is currently disabled because the provider credentials are not configured.'
      });
    }

    if ((channel === 'whatsapp' || channel === 'both') && !whatsappEnabled) {
      return res.status(400).json({
        success: false,
        code: 'WHATSAPP_UNCONFIGURED',
        message: 'The WhatsApp delivery channel is currently disabled because the Twilio credentials are not configured.'
      });
    }

    const eventId = 'event-ga-2026';

    // 1. Resolve recipients query
    let queryStr = `
      SELECT p.id as parent_id, p.full_name as parent_name, p.phone_number, u.email, c.full_name as child_name, e.id as entry_id
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      JOIN parent_profiles p ON p.id = c.parent_profile_id
      JOIN users u ON u.id = p.user_id
      WHERE e.event_id = ?
    `;
    const params: any[] = [eventId];

    if (recipientGroup === 'selected_children') {
      queryStr += " AND e.status IN ('selected', 'pass_ready')";
    } else if (recipientGroup === 'under_review') {
      queryStr += " AND e.status = 'under_review'";
    } else if (recipientGroup === 'waiting_list') {
      queryStr += " AND e.status = 'waiting_list'";
    } else if (recipientGroup === 'not_selected') {
      queryStr += " AND e.status = 'not_selected'";
    } else if (recipientGroup === 'pass_ready') {
      queryStr += " AND e.status = 'pass_ready'";
    }

    const rows = await query(queryStr, params);
    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'NO_RECIPIENTS',
        message: 'No recipients match this group.'
      });
    }

    // 2. Check tokens to decide on deduplication
    const hasChildTokens = body.includes('{Child name}') || body.includes('{Pass link}');
    const messagesToSend: Array<{
      parentName: string;
      email: string;
      phone: string;
      subject: string;
      body: string;
    }> = [];

    if (hasChildTokens) {
      for (const row of rows) {
        const renderedBody = body
          .replace(/{Parent name}/g, row.parent_name || '')
          .replace(/{Child name}/g, row.child_name || '')
          .replace(/{Event name}/g, 'The General Assembly')
          .replace(/{Pass link}/g, `https://koinonia.org/pass/${row.entry_id || 'sample'}`)
          .replace(/{Review link}/g, 'https://koinonia.org/parent/status')
          .replace(/{Pickup time}/g, '4:00 PM')
          .replace(/{Support contact}/g, '+234 803 123 4567');
        
        const renderedSubject = (subject || '')
          .replace(/{Parent name}/g, row.parent_name || '')
          .replace(/{Child name}/g, row.child_name || '')
          .replace(/{Event name}/g, 'The General Assembly');

        messagesToSend.push({
          parentName: row.parent_name,
          email: row.email,
          phone: row.phone_number,
          subject: renderedSubject,
          body: renderedBody
        });
      }
    } else {
      const parentMap = new Map<string, any>();
      for (const row of rows) {
        parentMap.set(row.parent_id, row);
      }
      for (const [parentId, parentRow] of parentMap.entries()) {
        const renderedBody = body
          .replace(/{Parent name}/g, parentRow.parent_name || '')
          .replace(/{Event name}/g, 'The General Assembly')
          .replace(/{Review link}/g, 'https://koinonia.org/parent/status')
          .replace(/{Pickup time}/g, '4:00 PM')
          .replace(/{Support contact}/g, '+234 803 123 4567');

        const renderedSubject = (subject || '')
          .replace(/{Parent name}/g, parentRow.parent_name || '')
          .replace(/{Event name}/g, 'The General Assembly');

        messagesToSend.push({
          parentName: parentRow.parent_name,
          email: parentRow.email,
          phone: parentRow.phone_number,
          subject: renderedSubject,
          body: renderedBody
        });
      }
    }

    // Load custom sender settings if present
    const settings = await queryOne(`
      SELECT sender_name as senderName, reply_to_email as replyToEmail
      FROM admin_message_settings
      WHERE id = 'primary_settings'
    `);
    const customFromName = settings?.senderName || undefined;
    const customReplyTo = settings?.replyToEmail || undefined;

    // 3. Dispatch messages to providers
    let sentCount = 0;
    let failedCount = 0;

    for (const msg of messagesToSend) {
      let emailSuccess = true;
      let whatsappSuccess = true;

      if (channel === 'email' || channel === 'both') {
        if (msg.email) {
          try {
            const res = await sendEmail({
              to: msg.email,
              subject: msg.subject,
              text: msg.body,
              html: `<p>${msg.body.replace(/\n/g, '<br>')}</p>`,
              fromName: customFromName,
              replyTo: customReplyTo
            });
            if (!res.success) emailSuccess = false;
          } catch (err) {
            console.error('[Admin sendEmail failed]:', err);
            emailSuccess = false;
          }
        } else {
          emailSuccess = false;
        }
      }

      if (channel === 'whatsapp' || channel === 'both') {
        if (msg.phone) {
          try {
            const res = await sendWhatsApp(msg.phone, msg.body);
            if (!res.success) whatsappSuccess = false;
          } catch (err) {
            console.error('[Admin sendWhatsApp failed]:', err);
            whatsappSuccess = false;
          }
        } else {
          whatsappSuccess = false;
        }
      }

      const msgSuccess = (channel === 'both') ? (emailSuccess && whatsappSuccess) : (channel === 'email' ? emailSuccess : whatsappSuccess);
      if (msgSuccess) {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    // 4. Log sending outcome in our manual database table
    const logId = crypto.randomUUID();
    const logNow = new Date().toISOString();
    const logStatus = failedCount === 0 ? 'sent' : (sentCount > 0 ? 'sent' : 'failed');

    await execute(
      'INSERT INTO admin_message_logs (id, recipient_group, message_type, channel, subject, body, recipients_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [logId, recipientGroup, messageType, channel, subject || '', body, messagesToSend.length, logStatus, logNow]
    );

    res.json({
      success: true,
      summary: {
        requested: messagesToSend.length,
        sent: sentCount,
        pending: 0,
        failed: failedCount
      },
      message: 'Message sending has completed.'
    });
  } catch (err: any) {
    console.error('Error dispatching admin messages:', err);
    res.status(500).json({
      success: false,
      code: 'MESSAGE_SEND_FAILED',
      message: 'We could not send this message right now.'
    });
  }
});

// GET /api/admin/volunteers - Get all volunteer applications and profiles
router.get('/volunteers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin', 'team'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const team = typeof req.query.team === 'string' ? req.query.team : '';

    let queryStr = `
      SELECT 
        v.*,
        u.email,
        u.role,
        u.email_verified,
        m.secure_url as photo_url,
        (SELECT email FROM users WHERE id = v.deleted_by) as deleted_by_email,
        (SELECT email FROM users WHERE id = v.restored_by) as restored_by_email
      FROM volunteer_profiles v
      JOIN users u ON u.id = v.user_id
      LEFT JOIN media_files m ON m.id = v.photo_file_id
      WHERE 1=1
    `;
    const queryParams: any[] = [];

    if (q) {
      queryStr += ` AND (v.full_name LIKE ? OR u.email LIKE ? OR v.phone LIKE ?)`;
      const searchPattern = `%${q}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    if (status === 'removed') {
      queryStr += ` AND v.is_deleted = 1`;
    } else {
      queryStr += ` AND (v.is_deleted = 0 OR v.is_deleted IS NULL)`;
      if (status) {
        queryStr += ` AND v.status = ?`;
        queryParams.push(status);
      }
    }

    if (team) {
      queryStr += ` AND v.preferred_team = ?`;
      queryParams.push(team);
    }

    queryStr += ` ORDER BY v.created_at DESC`;

    const rows = await query(queryStr, queryParams);
    const formatted = rows.map((v: any) => ({
      id: v.id,
      userId: v.user_id,
      fullName: v.full_name,
      phone: v.phone,
      whatsapp: v.whatsapp,
      isKoinoniaWorker: v.is_koinonia_worker === 1,
      department: v.department,
      preferredTeam: v.preferred_team,
      servingExperience: v.serving_experience,
      note: v.note,
      status: v.status,
      photoFileId: v.photo_file_id,
      photoUrl: v.photo_url || (v.photo_file_id ? (v.photo_file_id.startsWith('http') || v.photo_file_id.startsWith('/') ? v.photo_file_id : `/api/media/files/${v.photo_file_id}`) : ''),
      createdAt: v.created_at,
      updatedAt: v.updated_at,
      email: v.email,
      role: v.role,
      emailVerified: v.email_verified === 1 || v.email_verified === true || v.email_verified === '1',
      isDeleted: v.is_deleted === 1,
      deletedAt: v.deleted_at,
      deletedBy: v.deleted_by,
      deletedByEmail: v.deleted_by_email,
      deleteReason: v.delete_reason,
      restoredAt: v.restored_at,
      restoredBy: v.restored_by,
      restoredByEmail: v.restored_by_email
    }));

    return res.json({ success: true, volunteers: formatted });
  } catch (err: any) {
    console.error('Error fetching admin volunteers:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch volunteers' });
  }
});

// POST /api/admin/volunteers/:id/remove - Soft-delete/archive a volunteer profile
router.post('/volunteers/:id/remove', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const volunteerId = req.params.id;
    const { reason } = req.body;
    const now = new Date().toISOString();

    const volunteer = await queryOne('SELECT * FROM volunteer_profiles WHERE id = ?', [volunteerId]);
    if (!volunteer) {
      return res.status(404).json({ success: false, error: 'Volunteer profile not found' });
    }

    await execute(`
      UPDATE volunteer_profiles 
      SET is_deleted = 1, deleted_at = ?, deleted_by = ?, delete_reason = ?
      WHERE id = ?
    `, [now, req.user.id, reason || 'No reason specified', volunteerId]);

    return res.json({ success: true, message: 'Volunteer archived successfully' });
  } catch (err: any) {
    console.error('Error removing volunteer:', err);
    return res.status(500).json({ success: false, error: 'Failed to remove volunteer' });
  }
});

// POST /api/admin/volunteers/:id/restore - Restore an archived volunteer profile
router.post('/volunteers/:id/restore', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const volunteerId = req.params.id;
    const now = new Date().toISOString();

    const volunteer = await queryOne('SELECT * FROM volunteer_profiles WHERE id = ?', [volunteerId]);
    if (!volunteer) {
      return res.status(404).json({ success: false, error: 'Volunteer profile not found' });
    }

    await execute(`
      UPDATE volunteer_profiles 
      SET is_deleted = 0, restored_at = ?, restored_by = ?
      WHERE id = ?
    `, [now, req.user.id, volunteerId]);

    return res.json({ success: true, message: 'Volunteer restored successfully' });
  } catch (err: any) {
    console.error('Error restoring volunteer:', err);
    return res.status(500).json({ success: false, error: 'Failed to restore volunteer' });
  }
});

// GET /api/admin/volunteers/:id - Get detailed profile of a volunteer
router.get('/volunteers/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin', 'team'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const id = req.params.id;
    const v = await queryOne(`
      SELECT 
        v.*,
        u.email,
        u.role,
        u.email_verified,
        m.secure_url as photo_url
      FROM volunteer_profiles v
      JOIN users u ON u.id = v.user_id
      LEFT JOIN media_files m ON m.id = v.photo_file_id
      WHERE v.id = ?
    `, [id]);

    if (!v) {
      return res.status(404).json({ success: false, error: 'Volunteer not found' });
    }

    const formatted = {
      id: v.id,
      userId: v.user_id,
      fullName: v.full_name,
      phone: v.phone,
      whatsapp: v.whatsapp,
      isKoinoniaWorker: v.is_koinonia_worker === 1,
      department: v.department,
      preferredTeam: v.preferred_team,
      servingExperience: v.serving_experience,
      note: v.note,
      status: v.status,
      photoFileId: v.photo_file_id,
      photoUrl: v.photo_url || (v.photo_file_id ? (v.photo_file_id.startsWith('http') || v.photo_file_id.startsWith('/') ? v.photo_file_id : `/api/media/files/${v.photo_file_id}`) : ''),
      createdAt: v.created_at,
      updatedAt: v.updated_at,
      email: v.email,
      role: v.role,
      emailVerified: v.email_verified === 1 || v.email_verified === true || v.email_verified === '1'
    };

    return res.json({ success: true, volunteer: formatted });
  } catch (err: any) {
    console.error('Error fetching volunteer details:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch volunteer details' });
  }
});

// POST /api/admin/volunteers/:id/review - Approve or reject a volunteer application
router.post('/volunteers/:id/review', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin', 'team'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const id = req.params.id;
    const { status, team, note } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const v = await queryOne('SELECT v.*, u.email FROM volunteer_profiles v JOIN users u ON u.id = v.user_id WHERE v.id = ?', [id]);
    if (!v) {
      return res.status(404).json({ success: false, error: 'Volunteer profile not found' });
    }

    const nowStr = new Date().toISOString();
    const finalTeam = team || v.preferred_team;

    await execute(`
      UPDATE volunteer_profiles 
      SET status = ?, preferred_team = ?, note = COALESCE(?, note), approved_by_user_id = ?, approved_at = ?, updated_at = ?
      WHERE id = ?
    `, [status, finalTeam, note, req.user.id, status === 'approved' ? nowStr : null, nowStr, id]);

    if (status === 'approved') {
      const user = await queryOne('SELECT * FROM users WHERE id = ?', [v.user_id]);
      if (user && (user.role === 'parent' || user.role === 'user')) {
        await execute("UPDATE users SET role = 'volunteer', updated_at = ? WHERE id = ?", [nowStr, v.user_id]);
      }
      
      const baseUrl = process.env.APP_BASE_URL || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');
      const loginLink = `${baseUrl}/#/volunteer/sign-in`;
      
      await sendVolunteerApprovedEmail({
        volunteerEmail: v.email,
        volunteerFirstName: v.full_name,
        preferredTeam: finalTeam,
        loginLink: loginLink
      }).catch((e) => {
        console.error('Failed to send volunteer approval email:', e);
      });
    } else {
      await sendEmail({
        to: v.email,
        subject: 'Update on your volunteer application',
        html: `
          <div style="font-family: sans-serif; line-height: 1.6; color: #18181B; max-width: 600px; margin: 0 auto; border: 1px solid #EAE8E1; padding: 24px; border-radius: 12px; background-color: #FAF9F6;">
            <p>Hello ${v.full_name},</p>
            <p>Thank you for choosing to serve Koinonia Children and Teens. At this time, we are unable to accept your volunteer application for the upcoming event.</p>
            <p>We appreciate your heart and interest. We will keep your profile in our database and notify you for future opportunities.</p>
            <p>Best regards,<br>Koinonia Children and Teens Team</p>
          </div>
        `
      }).catch((e) => {
         console.error('Failed to send volunteer rejection email:', e);
      });
    }

    return res.json({ success: true, message: `Volunteer application ${status} successfully.` });
  } catch (err: any) {
    console.error('Error reviewing volunteer application:', err);
    return res.status(500).json({ success: false, error: 'Failed to process review' });
  }
});

// GET /api/admin/parents - Get all parents and metrics
router.get('/parents', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin', 'team'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'active';

    let queryStr = `
      SELECT 
        p.*,
        u.email as user_email,
        u.role as user_role,
        m.secure_url as photo_url,
        (SELECT COUNT(*) FROM children c WHERE c.parent_profile_id = p.id) as children_count,
        (SELECT email FROM users WHERE id = p.deleted_by) as deleted_by_email,
        (SELECT email FROM users WHERE id = p.restored_by) as restored_by_email
      FROM parent_profiles p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN media_files m ON m.id = p.photo_file_id
      WHERE 1=1
    `;
    const queryParams: any[] = [];

    if (status === 'removed') {
      queryStr += ` AND p.is_deleted = 1`;
    } else if (status === 'all') {
      // Show all
    } else {
      // Default to 'active'
      queryStr += ` AND (p.is_deleted = 0 OR p.is_deleted IS NULL)`;
    }

    if (q) {
      queryStr += ` AND (p.full_name LIKE ? OR u.email LIKE ? OR p.phone_number LIKE ? OR p.city LIKE ?)`;
      const searchPattern = `%${q}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    queryStr += ` ORDER BY p.created_at DESC`;

    const rows = await query(queryStr, queryParams);
    const formatted = rows.map((p: any) => ({
      id: p.id,
      userId: p.user_id,
      fullName: p.full_name,
      phone: p.phone_number,
      whatsapp: p.whatsapp_number,
      email: p.email || p.user_email,
      homeAddress: p.home_address,
      preferredContact: p.preferred_contact,
      isKoinoniaWorker: p.is_koinonia_worker === 1,
      department: p.department,
      photoFileId: p.photo_file_id,
      photoUrl: p.photo_url || (p.photo_file_id ? (p.photo_file_id.startsWith('http') || p.photo_file_id.startsWith('/') ? p.photo_file_id : `/api/media/files/${p.photo_file_id}`) : ''),
      country: p.country,
      stateRegion: p.state_region,
      city: p.city,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      userRole: p.user_role,
      childrenCount: Number(p.children_count || 0),
      isDeleted: p.is_deleted === 1,
      deletedAt: p.deleted_at,
      deletedBy: p.deleted_by,
      deletedByEmail: p.deleted_by_email,
      deleteReason: p.delete_reason,
      restoredAt: p.restored_at,
      restoredBy: p.restored_by,
      restoredByEmail: p.restored_by_email
    }));

    return res.json({ success: true, parents: formatted });
  } catch (err: any) {
    console.error('Error fetching admin parents list:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch parents list' });
  }
});

// POST /api/admin/parents/:id/remove - Soft-delete/archive a parent profile
router.post('/parents/:id/remove', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const parentId = req.params.id;
    const { reason } = req.body;
    const now = new Date().toISOString();

    const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [parentId]);
    if (!parent) {
      return res.status(404).json({ success: false, error: 'Parent profile not found' });
    }

    await execute(`
      UPDATE parent_profiles 
      SET is_deleted = 1, deleted_at = ?, deleted_by = ?, delete_reason = ?
      WHERE id = ?
    `, [now, req.user.id, reason || 'No reason specified', parentId]);

    return res.json({ success: true, message: 'Parent archived successfully' });
  } catch (err: any) {
    console.error('Error removing parent:', err);
    return res.status(500).json({ success: false, error: 'Failed to remove parent' });
  }
});

// POST /api/admin/parents/:id/restore - Restore an archived parent profile
router.post('/parents/:id/restore', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const parentId = req.params.id;
    const now = new Date().toISOString();

    const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [parentId]);
    if (!parent) {
      return res.status(404).json({ success: false, error: 'Parent profile not found' });
    }

    await execute(`
      UPDATE parent_profiles 
      SET is_deleted = 0, restored_at = ?, restored_by = ?
      WHERE id = ?
    `, [now, req.user.id, parentId]);

    return res.json({ success: true, message: 'Parent restored successfully' });
  } catch (err: any) {
    console.error('Error restoring parent:', err);
    return res.status(500).json({ success: false, error: 'Failed to restore parent' });
  }
});

// GET /api/admin/parents/:id - Get parent details, children, event summary, attention and admin notes
router.get('/parents/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin', 'team'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const id = req.params.id;
    const p = await queryOne(`
      SELECT 
        p.*,
        u.email as user_email,
        u.role as user_role,
        u.email_verified as user_email_verified,
        m.secure_url as photo_url,
        (SELECT email FROM users WHERE id = p.deleted_by) as deleted_by_email,
        (SELECT email FROM users WHERE id = p.restored_by) as restored_by_email
      FROM parent_profiles p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN media_files m ON m.id = p.photo_file_id
      WHERE p.id = ?
    `, [id]);

    if (!p) {
      return res.status(404).json({ success: false, error: 'Parent profile not found' });
    }

    const kids = await query(`
      SELECT 
        c.*,
        m.secure_url as photo_url,
        e.id as child_event_entry_id,
        e.status as entry_status,
        e.submitted_at as entry_submitted_at,
        e.has_medical_notes,
        e.needs_extra_support,
        e.checked_in_at,
        e.picked_up_at
      FROM children c
      LEFT JOIN media_files m ON m.id = c.photo_file_id
      LEFT JOIN child_event_entries e ON e.child_id = c.id AND e.event_id = 'event-ga-2026'
      WHERE c.parent_profile_id = ?
      ORDER BY c.full_name ASC
    `, [id]);

    const linkedChildren = kids.map((c: any) => {
      const careFlags: string[] = [];
      if (c.has_medical_notes === 1) careFlags.push('medical_issue');
      if (c.needs_extra_support === 1) careFlags.push('needs_support');
      if (c.needs_age_review === 1) careFlags.push('age_review');

      let pickupStatus = 'not_arrived';
      if (c.picked_up_at) {
        pickupStatus = 'picked_up';
      } else if (c.checked_in_at) {
        pickupStatus = 'checked_in';
      } else if (c.entry_status === 'selected' || c.entry_status === 'pass_ready') {
        pickupStatus = 'expected';
      }

      return {
        id: c.id,
        applicationId: c.child_event_entry_id || null,
        fullName: c.full_name,
        ageLabel: `${c.calculated_age || 0} years`,
        gender: c.gender,
        ageGroup: c.age_group || 'Not Assigned',
        photoUrl: c.photo_url || (c.photo_file_id ? (c.photo_file_id.startsWith('http') || c.photo_file_id.startsWith('/') ? c.photo_file_id : `/api/media/files/${c.photo_file_id}`) : null),
        reviewStatus: c.entry_status || 'not_registered',
        entryStatus: c.entry_status || 'not_registered',
        pickupStatus,
        careFlags
      };
    });

    // Event Summary calculation based on active children in event-ga-2026
    const childrenAdded = kids.length;
    const selected = kids.filter((c: any) => c.entry_status === 'selected' || c.entry_status === 'pass_ready').length;
    const underReview = kids.filter((c: any) => c.entry_status === 'under_review').length;
    const passReady = kids.filter((c: any) => c.entry_status === 'pass_ready').length;
    const checkedIn = kids.filter((c: any) => c.checked_in_at).length;
    const pickedUp = kids.filter((c: any) => c.picked_up_at).length;

    const eventSummary = {
      childrenAdded,
      selected,
      underReview,
      passReady,
      checkedIn,
      pickedUp
    };

    // Attention validation checks
    const attentionItems: string[] = [];
    if (!p.phone_number) {
      attentionItems.push('Missing contact phone number');
    }
    if (!p.photo_file_id) {
      attentionItems.push('Parent profile photo not uploaded');
    }
    kids.forEach((c: any) => {
      if (c.needs_age_review === 1) {
        attentionItems.push(`Child ${c.full_name} age is flagged for review`);
      }
      if (c.has_medical_notes === 1) {
        attentionItems.push(`Child ${c.full_name} has registered medical notes`);
      }
      if (!c.photo_file_id) {
        attentionItems.push(`Child ${c.full_name} is missing a profile photo`);
      }
    });

    const attention = {
      hasIssue: attentionItems.length > 0,
      message: attentionItems.length > 0 ? 'Needs attention' : 'No parent issue found',
      items: attentionItems
    };

    // Get Admin Notes
    const notesRows = await query(`
      SELECT n.*, u.email as admin_email
      FROM admin_parent_notes n
      LEFT JOIN users u ON u.id = n.admin_user_id
      WHERE n.parent_id = ?
      ORDER BY n.created_at DESC
    `, [id]);

    const adminNotes = notesRows.map((n: any) => ({
      id: n.id,
      author: n.admin_name || n.admin_email || 'Admin Team',
      note: n.note,
      createdAt: n.created_at
    }));

    const locationParts = [];
    if (p.city) locationParts.push(p.city);
    if (p.state_region) locationParts.push(p.state_region);
    if (p.country) locationParts.push(p.country);

    const formattedParent = {
      id: p.id,
      userId: p.user_id,
      fullName: p.full_name,
      email: p.email || p.user_email,
      phone: p.phone_number,
      whatsapp: p.whatsapp_number,
      homeAddress: p.home_address,
      location: locationParts.join(', ') || 'Not Specified',
      preferredContact: p.preferred_contact || 'phone',
      isKoinoniaWorker: p.is_koinonia_worker === 1,
      department: p.department || '',
      photoUrl: p.photo_url || (p.photo_file_id ? (p.photo_file_id.startsWith('http') || p.photo_file_id.startsWith('/') ? p.photo_file_id : `/api/media/files/${p.photo_file_id}`) : null),
      photoFileId: p.photo_file_id || null,
      emailVerified: p.user_email_verified === 1,
      accountStatus: p.user_email_verified === 1 ? 'verified' : 'pending',
      createdAt: p.created_at,
      isDeleted: p.is_deleted === 1,
      deletedAt: p.deleted_at,
      deletedBy: p.deleted_by,
      deletedByEmail: p.deleted_by_email,
      deleteReason: p.delete_reason,
      restoredAt: p.restored_at,
      restoredBy: p.restored_by,
      restoredByEmail: p.restored_by_email
    };

    return res.json({
      success: true,
      parent: formattedParent,
      linkedChildren,
      eventSummary,
      attention,
      adminNotes
    });
  } catch (err: any) {
    console.error('Error fetching admin parent details:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch parent details' });
  }
});

// POST /api/admin/parents/:id/notes - Add an admin note
router.post('/parents/:id/notes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin', 'team'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const id = req.params.id;
    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, error: 'Note content cannot be empty' });
    }

    const parent = await queryOne('SELECT id FROM parent_profiles WHERE id = ?', [id]);
    if (!parent) {
      return res.status(404).json({ success: false, error: 'Parent profile not found' });
    }

    const noteId = 'note-' + Math.random().toString(36).substring(2, 11);
    const nowStr = new Date().toISOString();
    const adminEmail = req.user.email;
    const adminName = (req.user as any).fullName || adminEmail.split('@')[0];

    await execute(`
      INSERT INTO admin_parent_notes (id, parent_id, admin_user_id, admin_name, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      noteId,
      id,
      req.user.id,
      adminName,
      note.trim(),
      nowStr,
      nowStr
    ]);

    return res.json({
      success: true,
      message: 'Note saved successfully',
      note: {
        id: noteId,
        author: adminName,
        note: note.trim(),
        createdAt: nowStr
      }
    });
  } catch (err: any) {
    console.error('Error saving admin parent note:', err);
    return res.status(500).json({ success: false, error: 'Failed to save admin note' });
  }
});

// PUT /api/admin/parents/:id - Edit parent details
router.put('/parents/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin', 'team'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const id = req.params.id;
    const { fullName, phone, whatsapp, homeAddress, preferredContact, isKoinoniaWorker, department, country, stateRegion, city } = req.body;

    const p = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [id]);
    if (!p) {
      return res.status(404).json({ success: false, error: 'Parent profile not found' });
    }

    const nowStr = new Date().toISOString();
    await execute(`
      UPDATE parent_profiles
      SET 
        full_name = COALESCE(?, full_name),
        phone_number = COALESCE(?, phone_number),
        whatsapp_number = COALESCE(?, whatsapp_number),
        home_address = COALESCE(?, home_address),
        preferred_contact = COALESCE(?, preferred_contact),
        is_koinonia_worker = COALESCE(?, is_koinonia_worker),
        department = COALESCE(?, department),
        country = COALESCE(?, country),
        state_region = COALESCE(?, state_region),
        city = COALESCE(?, city),
        updated_at = ?
      WHERE id = ?
    `, [
      fullName || null, 
      phone || null, 
      whatsapp || null, 
      homeAddress || null, 
      preferredContact || null,
      isKoinoniaWorker !== undefined ? (isKoinoniaWorker ? 1 : 0) : null,
      department || null, 
      country || null, 
      stateRegion || null, 
      city || null, 
      nowStr, 
      id
    ]);

    return res.json({ success: true, message: 'Parent profile updated successfully' });
  } catch (err: any) {
    console.error('Error updating admin parent profile:', err);
    return res.status(500).json({ success: false, error: 'Failed to update parent profile' });
  }
});

// GET /api/admin/reports/volunteer-parent-stats - Custom reports sub-endpoint
router.get('/reports/volunteer-parent-stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'super_admin', 'team'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const totalParents = await queryOne('SELECT COUNT(*) as count FROM parent_profiles');
    const totalVolunteers = await queryOne('SELECT COUNT(*) as count FROM volunteer_profiles');
    const approvedVolunteers = await queryOne("SELECT COUNT(*) as count FROM volunteer_profiles WHERE status = 'approved'");
    const pendingVolunteers = await queryOne("SELECT COUNT(*) as count FROM volunteer_profiles WHERE status = 'pending_review'");
    const rejectedVolunteers = await queryOne("SELECT COUNT(*) as count FROM volunteer_profiles WHERE status = 'rejected'");

    const volunteersByTeamRows = await query(`
      SELECT preferred_team as team, COUNT(*) as count 
      FROM volunteer_profiles 
      WHERE status = 'approved'
      GROUP BY preferred_team
    `);
    const volunteersByTeam = volunteersByTeamRows.map((r: any) => ({
      team: r.team || 'Unassigned',
      count: r.count
    }));

    return res.json({
      success: true,
      stats: {
        totalParents: totalParents?.count || 0,
        totalVolunteers: totalVolunteers?.count || 0,
        approvedVolunteers: approvedVolunteers?.count || 0,
        pendingVolunteers: pendingVolunteers?.count || 0,
        rejectedVolunteers: rejectedVolunteers?.count || 0,
        volunteersByTeam
      }
    });
  } catch (err: any) {
    console.error('Error fetching volunteer and parent reports stats:', err);
    return res.status(500).json({ success: false, error: 'Failed to load custom stats.' });
  }
});

export default router;
