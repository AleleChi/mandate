import { Router, Response } from 'express';
import crypto from 'crypto';
import { queryOne, execute, transaction } from '../db';
import { hashPassword, verifyPassword, generateToken, authMiddleware, AuthenticatedRequest } from '../auth';
import { sendEmailVerificationEmail, sendPasswordResetEmail } from '../services/email';

const router = Router();

router.post('/create-account', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, fullName, phone, whatsapp } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing) {
      return res.status(400).json({ error: 'Account with this email already exists' });
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
        phone?.trim() || '',
        whatsapp?.trim() || phone?.trim() || '',
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
      const baseUrl = process.env.APP_BASE_URL;
      if (!baseUrl) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error('APP_BASE_URL environment variable is required in development.');
        } else {
          console.error('[ConfigError] APP_BASE_URL is missing in production environment');
          return res.status(500).json({ error: 'A configuration error occurred. Please try again later.' });
        }
      }

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
      if (process.env.NODE_ENV !== 'production' && !process.env.APP_BASE_URL) {
        throw e;
      }
      // Non-blocking email trigger failure
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
    const cleanEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

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
        message: 'This email is already verified. You can sign in.'
      });
    }

    const baseUrl = process.env.APP_BASE_URL;
    if (!baseUrl) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('APP_BASE_URL environment variable is required in development.');
      } else {
        console.error('[ConfigError] APP_BASE_URL is missing in production environment');
        return res.status(500).json({ error: 'A configuration error occurred. Please try again later.' });
      }
    }

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
    const cleanEmail = email.toLowerCase().trim();
    const user = await queryOne('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (user) {
      const baseUrl = process.env.APP_BASE_URL;
      if (!baseUrl) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error('APP_BASE_URL environment variable is required in development.');
        } else {
          console.error('[ConfigError] APP_BASE_URL is missing in production environment');
          return res.status(500).json({ error: 'A configuration error occurred. Please try again later.' });
        }
      }

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
    res.json({ success: true, messageId: result.messageId });
  } catch (err: any) {
    res.status(500).json({ error: 'We could not send the email right now. Please try again.' });
  }
});

router.post('/sign-in', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await queryOne('SELECT id, email, password_hash, role FROM users WHERE email = ?', [cleanEmail]);
    if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [user.id]);
    const token = generateToken(user.id);

    res.json({
      user: { id: user.id, email: user.email, role: user.role },
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
