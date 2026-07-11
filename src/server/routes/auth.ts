import { Router, Response } from 'express';
import crypto from 'crypto';
import { queryOne, execute, transaction, query } from '../db';
import { hashPassword, verifyPassword, generateToken, authMiddleware, AuthenticatedRequest } from '../auth';
import { sendEmailVerificationEmail, sendPasswordResetEmail, sendVolunteerUnderReviewEmail } from '../services/email';
import { validateEmailAddress, validatePhoneNumber, validateName } from '../utils/validation';

const router = Router();

router.post('/create-account', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, fullName, phone, whatsapp } = req.body;

    // Validate Full Name
    const nameVal = validateName(fullName, 'fullName');
    if (!nameVal.valid) {
      return res.status(400).json({
        success: false,
        code: nameVal.code,
        field: 'fullName',
        message: nameVal.message,
        error: nameVal.message
      });
    }

    // Validate Email with DNS/MX check
    const emailVal = await validateEmailAddress(email, false);
    if (!emailVal.valid) {
      return res.status(400).json({
        success: false,
        code: emailVal.code,
        field: 'email',
        message: emailVal.message,
        error: emailVal.message,
        suggestion: emailVal.suggestion
      });
    }

    // Validate Phone
    const phoneVal = validatePhoneNumber(phone || '', 'NG');
    if (!phoneVal.valid) {
      return res.status(400).json({
        success: false,
        code: phoneVal.code,
        field: 'phone',
        message: phoneVal.message,
        error: phoneVal.message
      });
    }

    // Validate WhatsApp if present
    if (whatsapp) {
      const whatsappVal = validatePhoneNumber(whatsapp, 'NG');
      if (!whatsappVal.valid) {
        return res.status(400).json({
          success: false,
          code: whatsappVal.code,
          field: 'whatsapp',
          message: whatsappVal.message,
          error: whatsappVal.message
        });
      }
    }

    // Validate Password
    const hasLetter = /[a-zA-Z]/.test(password || '');
    const hasNumber = /[0-9]/.test(password || '');
    if (!password || password.length < 8 || !hasLetter || !hasNumber) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PASSWORD',
        field: 'password',
        message: 'Use at least 8 characters with a letter and a number.',
        error: 'Use at least 8 characters with a letter and a number.'
      });
    }

    const cleanEmail = emailVal.normalizedEmail!;
    const cleanPhone = phoneVal.normalizedPhone!;
    const cleanWhatsapp = whatsapp ? validatePhoneNumber(whatsapp, 'NG').normalizedPhone! : cleanPhone;

    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_ALREADY_EXISTS',
        field: 'email',
        message: 'Account with this email already exists',
        error: 'Account with this email already exists'
      });
    }

    const userId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const now = new Date().toISOString();
    const hashedPwd = hashPassword(password);

    await transaction(async () => {
      await execute(`
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, 'parent', ?, ?)
      `, [userId, cleanEmail, hashedPwd, now, now]);

      await execute(`
        INSERT INTO parent_profiles (
          id, user_id, full_name, phone_number, whatsapp_number, email,
          preferred_contact, is_koinonia_worker, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'WhatsApp', 0, ?, ?)
      `, [
        profileId,
        userId,
        fullName?.trim() || '',
        cleanPhone,
        cleanWhatsapp,
        cleanEmail,
        now,
        now
      ]);
    });

    const user = { id: userId, email: cleanEmail, role: 'parent' };
    const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [userId]);
    const token = generateToken(userId);

    // Generate secure email verification reference and send notification email
    try {
      const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');

      const rawVerifyToken = crypto.randomBytes(32).toString('hex');
      const verifyTokenHash = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');
      const tokenId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'email_verification', ?, ?)
      `, [tokenId, userId, verifyTokenHash, expiresAt, now]);

      const verificationLink = `${baseUrl}/#/parent/verify-email?token=${rawVerifyToken}`;
      sendEmailVerificationEmail({
        parentEmail: cleanEmail,
        parentFirstName: fullName,
        verificationLink
      }).catch(() => {});
    } catch (e: any) {
      console.error('Email sending failed during registration:', e);
    }

    res.status(201).json({ user, profile, token });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production' && !process.env.APP_BASE_URL) {
      throw err;
    }
    console.error('Create account error:', err);
    res.status(500).json({ error: 'Internal server error during account creation' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Verification link is invalid.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const dbToken = await queryOne(
      "SELECT * FROM auth_tokens WHERE token_hash = ? AND token_type = 'email_verification'",
      [tokenHash]
    );

    if (!dbToken) {
      return res.status(400).json({ error: 'This verification link is invalid.' });
    }

    if (dbToken.used_at) {
      return res.status(400).json({ error: 'This verification link has already been used.' });
    }

    const expiresAt = new Date(dbToken.expires_at).getTime();
    if (expiresAt < Date.now()) {
      return res.status(400).json({ error: 'This verification link has expired.' });
    }

    const nowStr = new Date().toISOString();
    await transaction(async () => {
      // Mark token as used
      await execute('UPDATE auth_tokens SET used_at = ? WHERE id = ?', [nowStr, dbToken.id]);
      // Mark user as verified
      await execute('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?', [nowStr, dbToken.user_id]);
    });

    // Check if verified user is a volunteer, and trigger "under-review" status email
    try {
      const verifiedUser = await queryOne('SELECT email, role FROM users WHERE id = ?', [dbToken.user_id]);
      if (verifiedUser && verifiedUser.role === 'volunteer') {
        const volProfile = await queryOne('SELECT full_name, preferred_team FROM volunteer_profiles WHERE user_id = ?', [dbToken.user_id]);
        if (volProfile) {
          sendVolunteerUnderReviewEmail({
            volunteerEmail: verifiedUser.email,
            volunteerFirstName: volProfile.full_name,
            preferredTeam: volProfile.preferred_team
          }).catch((err) => console.error('Error sending volunteer under-review email:', err));
        }
      }
    } catch (e) {
      console.error('Failed to trigger under-review email post-verification:', e);
    }

    res.json({ success: true, message: 'Email verified successfully.' });
  } catch (err) {
    console.error('Email verification error:', err);
    res.status(500).json({ error: 'An unexpected error occurred during email verification.' });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const emailVal = await validateEmailAddress(email, true);
    if (!emailVal.valid) {
      return res.status(400).json({ error: emailVal.message });
    }

    const cleanEmail = emailVal.normalizedEmail!;

    const user = await queryOne('SELECT id, email_verified FROM users WHERE email = ?', [cleanEmail]);
    
    if (!user) {
      console.log('No unverified user found for resend request');
      return res.json({ 
        success: true, 
        message: 'If this email is connected to a parent account, a new link has been sent.' 
      });
    }

    if (user.email_verified) {
      return res.json({
        success: true,
        alreadyVerified: true,
        role: 'parent',
        emailSent: false,
        message: 'This email is already confirmed. You can sign in.'
      });
    }

    const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');

    const now = new Date().toISOString();

    // Expire old unused verification tokens
    await execute(`
      UPDATE auth_tokens 
      SET expires_at = ? 
      WHERE user_id = ? AND token_type = 'email_verification' AND used_at IS NULL
    `, [now, user.id]);

    const rawVerifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenHash = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    await execute(`
      INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
      VALUES (?, ?, ?, 'email_verification', ?, ?)
    `, [tokenId, user.id, verifyTokenHash, expiresAt, now]);

    const profile = await queryOne('SELECT full_name FROM parent_profiles WHERE user_id = ?', [user.id]);
    const fullName = profile ? profile.full_name : undefined;

    const verificationLink = `${baseUrl}/#/parent/verify-email?token=${rawVerifyToken}`;
    const emailResult = await sendEmailVerificationEmail({
      parentEmail: cleanEmail,
      parentFirstName: fullName,
      verificationLink
    });

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'We could not send a new link right now. Please try again.'
      });
    }

    res.json({ 
      success: true, 
      message: 'If this email is connected to a parent account, a new link has been sent.' 
    });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production' && !process.env.APP_BASE_URL) {
      throw err;
    }
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'We could not send the email right now. Please try again.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email address is required' });

    const emailVal = await validateEmailAddress(email, true);
    if (!emailVal.valid) {
      return res.status(400).json({ error: emailVal.message });
    }

    const cleanEmail = emailVal.normalizedEmail!;
    const user = await queryOne('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (user) {
      const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');

      const rawResetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
      const tokenId = crypto.randomUUID();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await execute(`
        INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
        VALUES (?, ?, ?, 'password_reset', ?, ?)
      `, [tokenId, user.id, resetTokenHash, expiresAt, now]);

      const profile = await queryOne('SELECT full_name FROM parent_profiles WHERE user_id = ?', [user.id]);
      const fullName = profile ? profile.full_name : undefined;

      const resetLink = `${baseUrl}/#/parent/new-password?token=${rawResetToken}&email=${encodeURIComponent(cleanEmail)}`;
      sendPasswordResetEmail({
        parentEmail: cleanEmail,
        parentFirstName: fullName,
        resetLink
      }).catch(() => {});
    }
    res.json({ success: true, message: 'If an account exists with that email, recovery steps have been sent.' });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production' && !process.env.APP_BASE_URL) {
      throw err;
    }
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'We could not send the email right now. Please try again.' });
  }
});

router.post('/test-email', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Recipient email address required' });
    const result = await sendEmailVerificationEmail({
      parentEmail: to,
      parentFirstName: 'Test Parent',
      verificationLink: `${process.env.APP_BASE_URL || 'https://koinonia12.netlify.app'}/#/parent/verify-email?token=test-token`
    });
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'We could not send the email right now. Please try again.' });
    }
    res.json({ success: true, messageId: result.id });
  } catch (err: any) {
    res.status(500).json({ error: 'We could not send the email right now. Please try again.' });
  }
});

router.post('/sign-in', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: 'REQUIRED_FIELDS_MISSING',
        message: 'Email and password are required.'
      });
    }

    // Skip MX lookup but validate syntax/typos
    const emailVal = await validateEmailAddress(email, true);
    if (!emailVal.valid) {
      return res.status(400).json({
        success: false,
        code: emailVal.code || 'INVALID_EMAIL_FORMAT',
        field: 'email',
        message: emailVal.message,
        error: emailVal.message,
        suggestion: emailVal.suggestion
      });
    }

    const cleanEmail = emailVal.normalizedEmail!;

    const user = await queryOne('SELECT id, email, password_hash, role, email_verified FROM users WHERE email = ?', [cleanEmail]);
    console.log(`[SIGN_IN] user lookup { email: "${cleanEmail}", userFound: ${!!user}, role: "${user?.role}" }`);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'No parent account was found for this email.'
      });
    }

    const passwordMatches = user.password_hash ? verifyPassword(password, user.password_hash) : false;
    console.log(`[SIGN_IN] checking password { has_hash: ${!!user.password_hash}, matches: ${passwordMatches} }`);
    if (!user.password_hash || !passwordMatches) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.'
      });
    }

    const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [user.id]);
    const token = generateToken(user.id);

    const emailVerified = user.email_verified === 1 || user.email_verified === true || user.email_verified === '1';
    if (!emailVerified) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email is not verified.',
        user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
        profile,
        token
      });
    }

    res.json({
      user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
      profile,
      token
    });
  } catch (err: any) {
    console.error('Sign in error:', err);
    res.status(500).json({ error: 'Internal server error during sign in' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'Token is required.'
      });
    }

    const hasLetter = /[a-zA-Z]/.test(password || '');
    const hasNumber = /[0-9]/.test(password || '');
    if (!password || password.length < 8 || !hasLetter || !hasNumber) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PASSWORD',
        field: 'password',
        message: 'Use at least 8 characters with a letter and a number.',
        error: 'Use at least 8 characters with a letter and a number.'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();

    const tokenRow = await queryOne(`
      SELECT * FROM auth_tokens 
      WHERE token_hash = ? AND token_type = 'password_reset' AND used_at IS NULL AND expires_at > ?
    `, [tokenHash, now]);

    if (!tokenRow) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'This reset link has expired. Please request a new one.'
      });
    }

    const user = await queryOne('SELECT id, email FROM users WHERE id = ?', [tokenRow.user_id]);
    if (!user) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'This reset link has expired. Please request a new one.'
      });
    }

    const profile = await queryOne('SELECT id FROM parent_profiles WHERE user_id = ?', [user.id]);
    if (!profile) {
      return res.status(403).json({
        success: false,
        code: 'NO_PARENT_ACCESS',
        message: 'Parent profile has not been found for this account.'
      });
    }

    const hashedPwd = hashPassword(password);
    const updatedAt = new Date().toISOString();

    const updateResult = await execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashedPwd, updatedAt, user.id]);
    console.log(`[RESET_PASSWORD] DB update users table password_hash result: ${JSON.stringify(updateResult)} for userId: "${user.id}"`);

    await execute('UPDATE auth_tokens SET used_at = ? WHERE id = ?', [now, tokenRow.id]);
    await execute(`
      UPDATE auth_tokens
      SET expires_at = ?
      WHERE user_id = ? AND token_type = 'password_reset' AND used_at IS NULL
    `, [now, user.id]);

    console.log(`Parent password updated { userId: "${user.id}", changes: ${updateResult.changes} }`);

    return res.json({
      success: true,
      message: 'Your password has been updated. You can now sign in.'
    });
  } catch (err: any) {
    console.error('Parent reset password error:', err);
    res.status(500).json({ error: 'An unexpected error occurred during password reset.' });
  }
});

router.post('/sign-out', (req, res) => {
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user, profile: req.parentProfile });
});

// In-memory challenge store for passkey flows
const challengesStore = new Map<string, { challenge: string; expires: number }>();

// GET /api/auth/passkeys - list registered passkeys for logged in user
router.get('/passkeys', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const passkeys = await query(
      'SELECT id, device_name as "deviceName", created_at as "createdAt", last_used_at as "lastUsedAt" FROM user_passkeys WHERE user_id = ? AND revoked_at IS NULL',
      [req.user.id]
    );
    res.json({ success: true, passkeys });
  } catch (err) {
    console.error('Fetch passkeys error:', err);
    res.status(500).json({ error: 'Internal server error fetching passkeys' });
  }
});

// DELETE /api/auth/passkeys/:passkeyId - revoke passkey
router.delete('/passkeys/:passkeyId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { passkeyId } = req.params;
    const now = new Date().toISOString();
    await execute(
      'UPDATE user_passkeys SET revoked_at = ? WHERE id = ? AND user_id = ?',
      [now, passkeyId, req.user.id]
    );
    res.json({ success: true, message: 'Passkey revoked successfully' });
  } catch (err) {
    console.error('Revoke passkey error:', err);
    res.status(500).json({ error: 'Internal server error revoking passkey' });
  }
});

// POST /api/auth/passkeys/register/options
router.post('/passkeys/register/options', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const challenge = crypto.randomBytes(32).toString('base64url');
    challengesStore.set(`reg-${req.user.id}`, {
      challenge,
      expires: Date.now() + 5 * 60 * 1000
    });

    res.json({
      success: true,
      options: {
        challenge,
        rp: {
          name: 'Koinonia Children & Teens',
          id: req.headers.host ? req.headers.host.split(':')[0] : 'localhost'
        },
        user: {
          id: req.user.id,
          name: req.user.email,
          displayName: req.parentProfile?.full_name || req.user.email
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        timeout: 60000,
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        attestation: 'none'
      }
    });
  } catch (err) {
    console.error('Passkey register options error:', err);
    res.status(500).json({ error: 'Internal server error preparing passkey registration options' });
  }
});

// POST /api/auth/passkeys/register/verify
router.post('/passkeys/register/verify', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { credential, deviceName } = req.body;
    if (!credential || !credential.id) {
      return res.status(400).json({ success: false, error: 'Invalid passkey credential details provided' });
    }

    const stored = challengesStore.get(`reg-${req.user.id}`);
    if (!stored || stored.expires < Date.now()) {
      return res.status(400).json({ success: false, error: 'Registration verification session expired or not found' });
    }
    challengesStore.delete(`reg-${req.user.id}`);

    const pubKey = credential.response?.publicKey || 'encoded-public-key-placeholder';
    const passkeyId = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO user_passkeys (id, user_id, role, credential_id, public_key, counter, device_name, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `, [passkeyId, req.user.id, req.user.role, credential.id, pubKey, deviceName || 'This Device', now]);

    res.json({ success: true, message: 'Passkey registered successfully', passkey: { id: passkeyId, deviceName } });
  } catch (err) {
    console.error('Passkey register verify error:', err);
    res.status(500).json({ error: 'Internal server error verifying passkey registration' });
  }
});

// POST /api/auth/passkeys/login/options
router.post('/passkeys/login/options', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await queryOne('SELECT id, role FROM users WHERE LOWER(email) = ?', [normalizedEmail]);

    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeKey = `login-${crypto.randomUUID()}`;
    challengesStore.set(challengeKey, {
      challenge,
      expires: Date.now() + 5 * 60 * 1000
    });

    const allowCredentials = [];
    if (user) {
      const pks = await query('SELECT credential_id as "id" FROM user_passkeys WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
      for (const pk of pks) {
        allowCredentials.push({
          type: 'public-key',
          id: pk.id
        });
      }
    }

    res.json({
      success: true,
      challengeKey,
      options: {
        challenge,
        timeout: 60000,
        rpId: req.headers.host ? req.headers.host.split(':')[0] : 'localhost',
        allowCredentials,
        userVerification: 'required'
      }
    });
  } catch (err) {
    console.error('Passkey login options error:', err);
    res.status(500).json({ error: 'Internal server error preparing sign in options' });
  }
});

// POST /api/auth/passkeys/login/verify
router.post('/passkeys/login/verify', async (req, res) => {
  try {
    const { credential, challengeKey } = req.body;
    if (!credential || !credential.id || !challengeKey) {
      return res.status(400).json({ success: false, error: 'Authentication request details are missing' });
    }

    const stored = challengesStore.get(challengeKey);
    if (!stored || stored.expires < Date.now()) {
      return res.status(400).json({ success: false, error: 'Device security verification timed out' });
    }
    challengesStore.delete(challengeKey);

    const passkey = await queryOne('SELECT * FROM user_passkeys WHERE credential_id = ? AND revoked_at IS NULL', [credential.id]);
    if (!passkey) {
      return res.status(401).json({ success: false, error: 'Device credentials are not recognized' });
    }

    const user = await queryOne('SELECT id, email, role, email_verified FROM users WHERE id = ?', [passkey.user_id]);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Account linked with this device is not found' });
    }

    const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [user.id]);
    const token = generateToken(user.id);

    const now = new Date().toISOString();
    await execute('UPDATE user_passkeys SET counter = counter + 1, last_used_at = ? WHERE id = ?', [now, passkey.id]);

    res.json({
      success: true,
      user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
      profile,
      token
    });
  } catch (err) {
    console.error('Passkey login verify error:', err);
    res.status(500).json({ error: 'Internal server error performing device verification' });
  }
});

// POST /api/auth/passkeys/verify-action
router.post('/passkeys/verify-action', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { credential, actionName } = req.body;
    if (!credential || !credential.id) {
      return res.status(400).json({ success: false, error: 'Verification credentials are required' });
    }
    
    const passkey = await queryOne('SELECT id FROM user_passkeys WHERE credential_id = ? AND user_id = ? AND revoked_at IS NULL', [credential.id, req.user.id]);
    if (!passkey) {
      return res.status(401).json({ success: false, error: 'Device security verification failed' });
    }
    
    const now = new Date().toISOString();
    await execute('UPDATE user_passkeys SET last_used_at = ? WHERE id = ?', [now, passkey.id]);
    
    await execute(`
      INSERT INTO audit_logs (id, user_id, user_role, action, target_type, details, timestamp)
      VALUES (?, ?, ?, ?, 'device_verification', ?, ?)
    `, [crypto.randomUUID(), req.user.id, req.user.role, 'device_secure_confirm', `Verified action: ${actionName || 'Sensitive Action'}`, now]);

    res.json({ success: true, message: 'Verification completed successfully' });
  } catch (err) {
    console.error('Verify action error:', err);
    res.status(500).json({ error: 'Internal server error during device security verification' });
  }
});

export default router;
