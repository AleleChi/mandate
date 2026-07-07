import { Router, Response } from 'express';
import crypto from 'crypto';
import { queryOne, execute, transaction } from '../db';
import { hashPassword, verifyPassword, generateToken, authMiddleware, AuthenticatedRequest } from '../auth';
import { sendEmailVerificationEmail, sendPasswordResetEmail } from '../services/email';
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
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'No parent account was found for this email.'
      });
    }

    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
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

router.post('/sign-out', (req, res) => {
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user, profile: req.parentProfile });
});

export default router;
