import { Router, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { query, queryOne, execute, transaction, REAL_EVENT_ID } from '../db';
import { hashPassword, verifyPassword, generateToken, authMiddleware, AuthenticatedRequest } from '../auth';
import { sendEmail, sendVolunteerVerificationEmail, sendVolunteerPasswordResetEmail } from '../services/email';
import { validateEmailAddress, validatePhoneNumber, validateName } from '../utils/validation';
import { uploadMedia } from '../services/media/cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper to wrap email template
function wrapVolunteerEmailTemplate(title: string, bodyHtml: string, actionButton?: { label: string; url: string }): string {
  const buttonHtml = actionButton ? `
    <div style="margin: 28px 0;">
      <a href="${actionButton.url}" style="background-color: #C59B27; color: #18181B; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-size: 15px;">
        ${actionButton.label}
      </a>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF8F4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181B; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #FAF8F4; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="540" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border: 1px solid #EAE8E1; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <!-- Top Accent Bar (Thin Antique Gold) -->
          <tr>
            <td style="background-color: #C59B27; height: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px 16px 32px; border-bottom: 1px solid #FAF8F4;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #18181B; letter-spacing: -0.01em;">
                Koinonia Children and Teens
              </h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 28px 32px; font-size: 15px; line-height: 1.6; color: #27272A;">
              ${bodyHtml}
              ${buttonHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #FAFAFA; border-top: 1px solid #EAE8E1; font-size: 12px; color: #71717A; text-align: center;">
              Koinonia Children and Teens &bull; Volunteer Access
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Helper to resolve photo ref to media file ID
function resolveToMediaFileId(photoRef: string | null | undefined): string | null {
  if (!photoRef) return null;
  if (photoRef.startsWith('blob:') || photoRef.startsWith('data:')) {
    return null;
  }
  if (photoRef.includes('/api/media/files/')) {
    const match = photoRef.match(/\/api\/media\/files\/([a-zA-Z0-9-]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return photoRef;
}

// 1. CREATE ACCOUNT
router.post('/create-account', upload.single('photo'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      fullName,
      email,
      password,
      phone,
      whatsapp,
      isKoinoniaWorker,
      department,
      preferredTeam,
      servingExperience,
      note,
      photoFileId
    } = req.body;

    let resolvedPhotoId: string | null = null;

    if (req.file) {
      // Process multer uploaded file
      const buffer = req.file.buffer;
      const mimeType = req.file.mimetype;

      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedImageTypes.includes(mimeType)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_IMAGE_TYPE',
          message: 'Please upload a JPG, PNG, or WebP image.'
        });
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (buffer.length > maxSize) {
        return res.status(400).json({
          success: false,
          code: 'IMAGE_TOO_LARGE',
          message: 'This photo is too large. Maximum image size is 10MB.'
        });
      }

      // Upload to Cloudinary using services/media/cloudinary
      const uploadResult = await uploadMedia(buffer, {
        purpose: 'volunteer_profile_photo',
        mimeType
      });

      resolvedPhotoId = crypto.randomUUID();
      const folder = uploadResult.publicId.includes('/')
        ? uploadResult.publicId.substring(0, uploadResult.publicId.lastIndexOf('/'))
        : 'koinonia-children-teens';

      await execute(`
        INSERT INTO media_files (
          id, owner_user_id, provider, file_type, public_id, secure_url, resource_type,
          mime_type, file_size, width, height, duration, folder, file_url, storage_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        resolvedPhotoId,
        null, // will be updated with owner_user_id in transaction
        uploadResult.provider,
        'volunteer_profile_photo',
        uploadResult.publicId,
        uploadResult.secureUrl,
        uploadResult.resourceType || 'image',
        mimeType,
        buffer.length,
        uploadResult.width || null,
        uploadResult.height || null,
        uploadResult.duration || null,
        folder,
        uploadResult.secureUrl,
        uploadResult.publicId,
        new Date().toISOString()
      ]);
    } else {
      // Reject blob: and data: photo refs
      if (photoFileId && (photoFileId.startsWith('blob:') || photoFileId.startsWith('data:'))) {
        return res.status(400).json({
          success: false,
          code: 'PHOTO_UPLOAD_REQUIRED',
          message: 'A valid saved profile photo is strictly required to register a volunteer account.'
        });
      }

      resolvedPhotoId = resolveToMediaFileId(photoFileId);
    }

    if (!resolvedPhotoId) {
      return res.status(400).json({
        success: false,
        code: 'PHOTO_UPLOAD_REQUIRED',
        message: 'A valid saved profile photo is strictly required to register a volunteer account.'
      });
    }

    // Require a real media ID before inserting
    const mediaExists = await queryOne('SELECT id FROM media_files WHERE id = ?', [resolvedPhotoId]);
    if (!mediaExists) {
      return res.status(400).json({
        success: false,
        code: 'PHOTO_UPLOAD_REQUIRED',
        message: 'A valid saved profile photo is strictly required to register a volunteer account.'
      });
    }

    // Parse booleans correctly from multipart strings if needed
    const isKoinoniaWorkerBool = (isKoinoniaWorker === true || isKoinoniaWorker === 'true' || isKoinoniaWorker === 1 || isKoinoniaWorker === '1');
    const servingExperienceBool = (servingExperience === true || servingExperience === 'true' || servingExperience === 1 || servingExperience === '1');

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

    // Validate Email
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
    let cleanWhatsapp = phoneVal.normalizedPhone!;
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
      cleanWhatsapp = whatsappVal.normalizedPhone!;
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
    const volunteerProfileId = crypto.randomUUID();
    const now = new Date().toISOString();
    const hashedPwd = hashPassword(password);

    await transaction(async () => {
      await execute(`
        INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'volunteer', 0, ?, ?)
      `, [userId, cleanEmail, hashedPwd, now, now]);

      await execute(`
        INSERT INTO volunteer_profiles (
          id, user_id, photo_file_id, full_name, phone, whatsapp,
          is_koinonia_worker, department, preferred_team, serving_experience,
          note, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)
      `, [
        volunteerProfileId,
        userId,
        resolvedPhotoId,
        fullName.trim(),
        cleanPhone,
        cleanWhatsapp,
        isKoinoniaWorkerBool ? 1 : 0,
        department || null,
        preferredTeam,
        servingExperienceBool ? 1 : 0,
        note || null,
        now,
        now
      ]);

      // Attach pending media row to the new user
      await execute(`
        UPDATE media_files SET owner_user_id = ? WHERE id = ?
      `, [userId, resolvedPhotoId]);
    });

    const user = { id: userId, email: cleanEmail, role: 'volunteer', email_verified: 0 };
    const profile = await queryOne('SELECT * FROM volunteer_profiles WHERE id = ?', [volunteerProfileId]);
    const token = generateToken(userId);

    console.log(`Volunteer account created { userId: "${userId}" }`);

    let emailSent = false;
    let emailMessage = '';

    // Send email verification link
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

      console.log(`Volunteer verification token created { userId: "${userId}" }`);

      const verificationLink = `${baseUrl}/#/volunteer/verify-email?token=${rawVerifyToken}`;
      console.log(`Volunteer verification email send started { userId: "${userId}" }`);

      const emailResult = await sendVolunteerVerificationEmail({
        volunteerEmail: cleanEmail,
        volunteerFirstName: fullName,
        verificationLink
      });

      if (emailResult.success) {
        emailSent = true;
        console.log(`Volunteer verification email sent { userId: "${userId}", providerId: "${emailResult.id || 'Unknown'}" }`);
      } else {
        emailSent = false;
        emailMessage = 'Volunteer Access was created, but we could not send the confirmation email automatically. Use resend on the next screen.';
        console.error(`Volunteer verification email failed { userId: "${userId}", reason: "${emailResult.error || 'Unknown'}" }`);
      }
    } catch (e: any) {
      emailSent = false;
      emailMessage = 'Volunteer Access was created, but we could not send the confirmation email automatically. Use resend on the next screen.';
      console.error(`Volunteer verification email failed { userId: "${userId}", reason: "${e?.message || e}" }`);
    }

    if (emailSent) {
      res.status(201).json({
        success: true,
        user,
        profile,
        token,
        emailSent,
        message: 'Volunteer Access created. Please check your email to confirm your address.'
      });
    } else {
      res.status(201).json({
        success: true,
        user,
        profile,
        token,
        emailSent,
        emailMessage
      });
    }
  } catch (err) {
    console.error('Volunteer create account error:', err);
    res.status(500).json({ error: 'Internal server error during volunteer registration' });
  }
});

// 2. SIGN IN
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
    const maskedEmail = maskEmail(cleanEmail);

    // 1. Volunteer sign-in started fields: - maskedEmail
    console.log(`Volunteer sign-in started { maskedEmail: "${maskedEmail}" }`);

    // 2. Look up user by email.
    const user = await queryOne('SELECT id, email, password_hash, role, email_verified FROM users WHERE email = ?', [cleanEmail]);

    if (!user) {
      // 2. Volunteer sign-in user lookup fields:
      console.log(`Volunteer sign-in user lookup { userFound: false, userId: null, role: null, emailVerified: false }`);
      // 5. Volunteer sign-in final result fields:
      console.log(`Volunteer sign-in final result { outcome: "invalid_credentials" }`);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.'
      });
    }

    const emailVerified = user.email_verified === 1 || user.email_verified === true || user.email_verified === '1';

    // 2. Volunteer sign-in user lookup fields:
    console.log(`Volunteer sign-in user lookup { userFound: true, userId: "${user.id}", role: "${user.role}", emailVerified: ${emailVerified} }`);

    // 4. Compare password using the same verifyPassword helper parent uses.
    const passwordMatches = user.password_hash ? verifyPassword(password, user.password_hash) : false;
    // 4. Volunteer sign-in password result fields:
    console.log(`Volunteer sign-in password result { passwordMatches: ${passwordMatches} }`);

    if (!passwordMatches) {
      // 5. Volunteer sign-in final result fields:
      console.log(`Volunteer sign-in final result { outcome: "invalid_credentials" }`);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.'
      });
    }

    // 6. Look up volunteer_profiles by user_id.
    const profile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [user.id]);
    const hasVolunteerProfile = !!profile;
    const volunteerStatus = profile ? (profile.status || 'none') : 'none';

    // 3. Volunteer sign-in profile lookup fields:
    console.log(`Volunteer sign-in profile lookup { hasVolunteerProfile: ${hasVolunteerProfile}, volunteerStatus: "${volunteerStatus}" }`);

    if (!profile) {
      // 5. Volunteer sign-in final result fields:
      console.log(`Volunteer sign-in final result { outcome: "no_volunteer_access" }`);
      return res.status(403).json({
        success: false,
        code: 'NO_VOLUNTEER_ACCESS',
        message: 'Volunteer Access has not been requested for this email.'
      });
    }

    // 8. If users.email_verified is false: return 403 EMAIL_NOT_VERIFIED with email.
    if (!emailVerified) {
      // 5. Volunteer sign-in final result fields:
      console.log(`Volunteer sign-in final result { outcome: "email_not_verified" }`);
      const token = generateToken(user.id);
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email is not verified.',
        user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
        profile,
        token
      });
    }

    const token = generateToken(user.id);

    // 9. If volunteerProfile.status === "pending_review": return success with token, user, volunteerProfile, nextRoute: "/volunteer/pending-review".
    if (volunteerStatus === 'pending_review') {
      // 5. Volunteer sign-in final result fields:
      console.log(`Volunteer sign-in final result { outcome: "pending_review" }`);
      return res.json({
        success: true,
        user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
        profile,
        token,
        nextRoute: '/volunteer/pending-review'
      });
    }

    // 10. If volunteerProfile.status === "active": return success with token, user, volunteerProfile, nextRoute: "/volunteer/event".
    if (volunteerStatus === 'active') {
      // 5. Volunteer sign-in final result fields:
      console.log(`Volunteer sign-in final result { outcome: "active" }`);
      return res.json({
        success: true,
        user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
        profile,
        token,
        nextRoute: '/volunteer/event'
      });
    }

    // 11. If rejected or suspended: return a controlled success/status response that routes to "/volunteer/pending-review" or existing branded status screen.
    if (volunteerStatus === 'rejected') {
      // 5. Volunteer sign-in final result fields:
      console.log(`Volunteer sign-in final result { outcome: "rejected" }`);
      return res.json({
        success: true,
        user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
        profile,
        token,
        nextRoute: '/volunteer/pending-review'
      });
    }

    if (volunteerStatus === 'suspended') {
      // 5. Volunteer sign-in final result fields:
      console.log(`Volunteer sign-in final result { outcome: "suspended" }`);
      return res.json({
        success: true,
        user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
        profile,
        token,
        nextRoute: '/volunteer/pending-review'
      });
    }

    // Default outcome fallback
    console.log(`Volunteer sign-in final result { outcome: "${volunteerStatus}" }`);
    res.json({
      success: true,
      user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
      profile,
      token,
      nextRoute: '/volunteer/pending-review'
    });
  } catch (err) {
    console.error('Volunteer sign in error:', err);
    res.status(500).json({ error: 'Internal server error during volunteer sign in' });
  }
});

// Helper to mask email for safe logging
function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return 'invalid-email';
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

// 2.5. RESEND VERIFICATION
router.post('/resend-verification', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Enter a valid email address to continue.'
      });
    }

    const emailVal = await validateEmailAddress(email, true);
    if (!emailVal.valid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Enter a valid email address to continue.'
      });
    }

    const cleanEmail = emailVal.normalizedEmail!;
    const maskedEmail = maskEmail(cleanEmail);

    // 1. Volunteer resend requested fields: - maskedEmail
    console.log(`Volunteer resend requested { maskedEmail: "${maskedEmail}" }`);

    const user = await queryOne('SELECT id, email, role, email_verified FROM users WHERE email = ?', [cleanEmail]);
    if (!user) {
      // 2. Volunteer resend account state fields: - userFound: false
      console.log(`Volunteer resend account state { userFound: false, hasVolunteerProfile: false, emailVerified: false, volunteerStatus: "none" }`);
      return res.json({
        success: true,
        generic: true,
        emailSent: false,
        message: 'If this email is connected to Volunteer Access, a confirmation link will be sent.'
      });
    }

    const profile = await queryOne('SELECT id, full_name, status FROM volunteer_profiles WHERE user_id = ?', [user.id]);
    if (!profile) {
      // 2. Volunteer resend account state fields: - hasVolunteerProfile: false
      console.log(`Volunteer resend account state { userFound: true, hasVolunteerProfile: false, emailVerified: false, volunteerStatus: "none" }`);
      return res.json({
        success: true,
        generic: true,
        emailSent: false,
        message: 'If this email is connected to Volunteer Access, a confirmation link will be sent.'
      });
    }

    const emailVerified = user.email_verified === 1 || user.email_verified === true || user.email_verified === '1';
    const volunteerStatus = profile.status || 'none';

    // 2. Volunteer resend account state fields: - emailVerified, volunteerStatus
    console.log(`Volunteer resend account state { userFound: true, hasVolunteerProfile: true, emailVerified: ${emailVerified}, volunteerStatus: "${volunteerStatus}" }`);

    if (emailVerified) {
      return res.json({
        success: true,
        alreadyVerified: true,
        emailSent: false,
        message: 'This email is already confirmed. You can sign in.'
      });
    }

    // Enforce cooldown (60 seconds)
    const lastToken = await queryOne(`
      SELECT created_at FROM auth_tokens 
      WHERE user_id = ? AND token_type = 'email_verification' 
      ORDER BY created_at DESC LIMIT 1
    `, [user.id]);
    if (lastToken) {
      const elapsedMs = Date.now() - new Date(lastToken.created_at).getTime();
      const cooldownMs = 60 * 1000;
      if (elapsedMs < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        console.log(`Volunteer resend rejected due to cooldown { userId: "${user.id}", email: "${maskedEmail}", retryAfterSeconds: ${retryAfterSeconds} }`);
        return res.status(429).json({
          success: false,
          code: 'RESEND_COOLDOWN',
          emailSent: false,
          retryAfterSeconds,
          message: 'Please wait before requesting another confirmation link.'
        });
      }
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

    // 3. Volunteer resend token created fields: - userId
    console.log(`Volunteer resend token created { userId: "${user.id}" }`);

    const verificationLink = `${baseUrl}/#/volunteer/verify-email?token=${rawVerifyToken}`;

    // 4. Volunteer resend email send started fields: - userId, maskedEmail
    console.log(`Volunteer resend email send started { userId: "${user.id}", email: "${maskedEmail}" }`);

    const emailResult = await sendVolunteerVerificationEmail({
      volunteerEmail: cleanEmail,
      volunteerFirstName: profile.full_name,
      verificationLink
    });

    if (!emailResult.success || !emailResult.id) {
      // 6. Volunteer resend email failed fields: - userId, maskedEmail, reason
      console.error(`Volunteer resend email failed { userId: "${user.id}", email: "${maskedEmail}", reason: "${emailResult.error || 'No provider id returned'}" }`);
      return res.status(502).json({
        success: false,
        code: 'EMAIL_SEND_FAILED',
        emailSent: false,
        message: 'We could not send a new confirmation link right now. Please try again.'
      });
    }

    // 5. Volunteer resend email sent fields: - userId, maskedEmail, providerId
    console.log(`Volunteer resend email sent { userId: "${user.id}", email: "${maskedEmail}", providerId: "${emailResult.id}" }`);

    const debugObj = process.env.NODE_ENV !== 'production' ? {
      providerId: emailResult.id,
      emailSent: true,
      route: 'volunteer.resend-verification'
    } : undefined;

    return res.json({
      success: true,
      emailSent: true,
      providerId: emailResult.id,
      message: 'A fresh confirmation link has been sent. Please check your inbox and spam folder.',
      retryAfterSeconds: 60,
      debug: debugObj
    });
  } catch (err: any) {
    console.error('Volunteer resend verification error:', err);
    res.status(500).json({
      success: false,
      code: 'EMAIL_SEND_FAILED',
      emailSent: false,
      message: 'We could not send the email right now. Please try again.'
    });
  }
});

// 2.7. FORGOT PASSWORD
router.post('/forgot-password', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Enter a valid email address to continue.'
      });
    }

    const emailVal = await validateEmailAddress(email, true);
    if (!emailVal.valid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Enter a valid email address to continue.'
      });
    }

    const cleanEmail = emailVal.normalizedEmail!;
    const maskedEmail = maskEmail(cleanEmail);

    // 1. Volunteer forgot password requested fields: maskedEmail
    console.log(`Volunteer forgot password requested { maskedEmail: "${maskedEmail}" }`);

    const user = await queryOne('SELECT id, email, role, email_verified FROM users WHERE email = ?', [cleanEmail]);
    if (!user) {
      // 2. Volunteer forgot password account state fields: userFound, hasVolunteerProfile
      console.log(`Volunteer forgot password account state { userFound: false, hasVolunteerProfile: false }`);
      
      const resPayload: any = {
        success: true,
        generic: true,
        emailSent: false,
        message: "If this email is connected to Volunteer Access, a reset link will be sent."
      };
      if (process.env.NODE_ENV !== 'production') {
        resPayload.debug = {
          route: "volunteer.forgot-password",
          userFound: false,
          hasVolunteerProfile: false,
          emailSent: false
        };
      }
      return res.json(resPayload);
    }

    const profile = await queryOne('SELECT id, full_name, status FROM volunteer_profiles WHERE user_id = ?', [user.id]);
    if (!profile) {
      // 2. Volunteer forgot password account state fields: userFound, userId, hasVolunteerProfile, emailVerified
      console.log(`Volunteer forgot password account state { userFound: true, userId: "${user.id}", hasVolunteerProfile: false, emailVerified: ${user.email_verified} }`);
      
      const resPayload: any = {
        success: true,
        generic: true,
        emailSent: false,
        message: "If this email is connected to Volunteer Access, a reset link will be sent."
      };
      if (process.env.NODE_ENV !== 'production') {
        resPayload.debug = {
          route: "volunteer.forgot-password",
          userFound: true,
          hasVolunteerProfile: false,
          emailSent: false
        };
      }
      return res.json(resPayload);
    }

    // 2. Volunteer forgot password account state fields: userFound, userId, hasVolunteerProfile, emailVerified, volunteerStatus
    console.log(`Volunteer forgot password account state { userFound: true, userId: "${user.id}", hasVolunteerProfile: true, emailVerified: ${user.email_verified}, volunteerStatus: "${profile.status}" }`);

    // Enforce cooldown (60 seconds)
    const lastToken = await queryOne(`
      SELECT created_at FROM auth_tokens 
      WHERE user_id = ? AND token_type = 'password_reset' AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `, [user.id]);
    if (lastToken) {
      const elapsedMs = Date.now() - new Date(lastToken.created_at).getTime();
      const cooldownMs = 60 * 1000;
      if (elapsedMs < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        console.log(`Volunteer password reset rejected due to cooldown { userId: "${user.id}", email: "${maskedEmail}", retryAfterSeconds: ${retryAfterSeconds} }`);
        return res.status(429).json({
          success: false,
          code: 'RESET_COOLDOWN',
          emailSent: false,
          retryAfterSeconds,
          message: 'Please wait before requesting another reset link.'
        });
      }
    }

    const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');
    const now = new Date().toISOString();

    // Expire old unused password_reset tokens
    await execute(`
      UPDATE auth_tokens
      SET expires_at = ?
      WHERE user_id = ? AND token_type = 'password_reset' AND used_at IS NULL
    `, [now, user.id]);

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await execute(`
      INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, created_at)
      VALUES (?, ?, ?, 'password_reset', ?, ?)
    `, [tokenId, user.id, resetTokenHash, expiresAt, now]);

    // 3. Volunteer password reset token created fields: userId, expiresAt
    console.log(`Volunteer password reset token created { userId: "${user.id}", expiresAt: "${expiresAt}" }`);

    const resetLink = `${baseUrl}/#/volunteer/reset-password?token=${rawResetToken}`;

    // 4. Volunteer password reset email send started fields: userId, maskedEmail
    console.log(`Volunteer password reset email send started { userId: "${user.id}", email: "${maskedEmail}" }`);

    const emailResult = await sendVolunteerPasswordResetEmail({
      volunteerEmail: cleanEmail,
      volunteerFirstName: profile.full_name,
      resetLink
    });

    if (!emailResult.success || !emailResult.id) {
      // 6. Volunteer password reset email failed fields: userId, maskedEmail, reason
      console.error(`Volunteer password reset email failed { userId: "${user.id}", email: "${maskedEmail}", reason: "${emailResult.error || 'No provider id returned'}" }`);
      return res.status(502).json({
        success: false,
        code: 'EMAIL_SEND_FAILED',
        emailSent: false,
        message: 'We could not send a reset link right now. Please try again.'
      });
    }

    // 5. Volunteer password reset email sent fields: userId, maskedEmail, providerId
    console.log(`Volunteer password reset email sent { userId: "${user.id}", email: "${maskedEmail}", providerId: "${emailResult.id}" }`);

    const resPayload: any = {
      success: true,
      emailSent: true,
      providerId: emailResult.id,
      message: 'A reset link has been sent. Please check your inbox and spam folder.',
      retryAfterSeconds: 60
    };
    if (process.env.NODE_ENV !== 'production') {
      resPayload.debug = {
        route: "volunteer.forgot-password",
        userFound: true,
        hasVolunteerProfile: true,
        emailSent: true,
        providerId: emailResult.id
      };
    }
    return res.json(resPayload);
  } catch (err: any) {
    console.error('Volunteer forgot password error:', err);
    res.status(500).json({
      success: false,
      code: 'EMAIL_SEND_FAILED',
      emailSent: false,
      message: 'We could not send a reset link right now. Please try again.'
    });
  }
});

// 2.8. RESET PASSWORD
router.post('/reset-password', async (req: AuthenticatedRequest, res: Response) => {
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

    const profile = await queryOne('SELECT id FROM volunteer_profiles WHERE user_id = ?', [user.id]);
    if (!profile) {
      return res.status(403).json({
        success: false,
        code: 'NO_VOLUNTEER_ACCESS',
        message: 'Volunteer Access has not been requested for this email.'
      });
    }

    const hashedPwd = hashPassword(password);
    const updatedAt = new Date().toISOString();

    await execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashedPwd, updatedAt, user.id]);
    await execute('UPDATE auth_tokens SET used_at = ? WHERE id = ?', [now, tokenRow.id]);
    await execute(`
      UPDATE auth_tokens
      SET expires_at = ?
      WHERE user_id = ? AND token_type = 'password_reset' AND used_at IS NULL
    `, [now, user.id]);

    // Logs: Volunteer password updated { userId }
    console.log(`Volunteer password updated { userId: "${user.id}" }`);

    return res.json({
      success: true,
      message: 'Your password has been updated. You can now sign in.'
    });
  } catch (err: any) {
    console.error('Volunteer reset password error:', err);
    res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An error occurred while resetting your password.'
    });
  }
});

// 3. GET ME
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role === 'parent' && !req.volunteerProfile) {
    return res.status(403).json({ error: 'Access denied: Volunteer profile required' });
  }
  res.json({ user: req.user, profile: req.volunteerProfile });
});

// 3.5. VOLUNTEER REQUEST (For existing users, e.g. parents requesting access)
router.post('/request', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      fullName,
      phone,
      whatsapp,
      isKoinoniaWorker,
      department,
      preferredTeam,
      servingExperience,
      note,
      photoFileId
    } = req.body;

    // Validate inputs
    if (!fullName || !phone || !preferredTeam) {
      return res.status(400).json({
        success: false,
        code: 'REQUIRED_FIELDS_MISSING',
        message: 'Name, phone, and preferred team are required.'
      });
    }

    const nameVal = validateName(fullName, 'fullName');
    if (!nameVal.valid) {
      return res.status(400).json({
        success: false,
        code: nameVal.code,
        field: 'fullName',
        message: nameVal.message
      });
    }

    const phoneVal = validatePhoneNumber(phone, 'NG');
    if (!phoneVal.valid) {
      return res.status(400).json({
        success: false,
        code: phoneVal.code,
        field: 'phone',
        message: phoneVal.message
      });
    }

    let cleanWhatsapp = phoneVal.normalizedPhone!;
    if (whatsapp) {
      const whatsappVal = validatePhoneNumber(whatsapp, 'NG');
      if (!whatsappVal.valid) {
        return res.status(400).json({
          success: false,
          code: whatsappVal.code,
          field: 'whatsapp',
          message: whatsappVal.message
        });
      }
      cleanWhatsapp = whatsappVal.normalizedPhone!;
    }

    let resolvedPhotoId = photoFileId || null;
    if (photoFileId && photoFileId.includes('/api/media/files/')) {
      const match = photoFileId.match(/\/api\/media\/files\/([a-zA-Z0-9-]+)/);
      if (match && match[1]) {
        resolvedPhotoId = match[1];
      }
    }

    const now = new Date().toISOString();
    let profile = req.volunteerProfile;

    if (profile) {
      // Update existing profile
      await execute(`
        UPDATE volunteer_profiles
        SET photo_file_id = ?,
            full_name = ?,
            phone = ?,
            whatsapp = ?,
            is_koinonia_worker = ?,
            department = ?,
            preferred_team = ?,
            serving_experience = ?,
            note = ?,
            status = 'pending_review',
            updated_at = ?
        WHERE user_id = ?
      `, [
        resolvedPhotoId || profile.photo_file_id,
        fullName.trim(),
        phoneVal.normalizedPhone!,
        cleanWhatsapp,
        isKoinoniaWorker ? 1 : 0,
        department || null,
        preferredTeam,
        servingExperience ? 1 : 0,
        note || null,
        now,
        req.user.id
      ]);
    } else {
      // Create new volunteer profile linked to current user
      const volunteerProfileId = crypto.randomUUID();
      await execute(`
        INSERT INTO volunteer_profiles (
          id, user_id, photo_file_id, full_name, phone, whatsapp,
          is_koinonia_worker, department, preferred_team, serving_experience,
          note, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)
      `, [
        volunteerProfileId,
        req.user.id,
        resolvedPhotoId,
        fullName.trim(),
        phoneVal.normalizedPhone!,
        cleanWhatsapp,
        isKoinoniaWorker ? 1 : 0,
        department || null,
        preferredTeam,
        servingExperience ? 1 : 0,
        note || null,
        now,
        now
      ]);
    }

    // Fetch the updated/created profile
    const updatedProfile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [req.user.id]);

    // Send volunteer request received email
    try {
      const subject = 'Volunteer request received';
      const firstName = fullName.trim().split(/\s+/)[0];
      const bodyHtml = `
        <p>Hello ${firstName},</p>
        <p>We have received your request to serve with Children and Teens.</p>
        <p>The team will review your details and update you when volunteer access is ready.</p>
        <p>Thank you,</p>
        <p>Koinonia Children and Teens</p>
      `;
      const text = `Hello ${firstName},\n\nWe have received your request to serve with Children and Teens.\n\nThe team will review your details and update you when volunteer access is ready.\n\nThank you,\nKoinonia Children and Teens`;
      const html = wrapVolunteerEmailTemplate(subject, bodyHtml);

      await sendEmail({ to: req.user.email, subject, html, text });
    } catch (e) {
      console.error('Failed to send volunteer request email:', e);
    }

    res.json({ success: true, profile: updatedProfile });
  } catch (err) {
    console.error('Volunteer request access error:', err);
    res.status(500).json({ error: 'Internal server error processing volunteer request' });
  }
});

// 4. PUT PROFILE
router.put('/profile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    const {
      fullName,
      phone,
      whatsapp,
      isKoinoniaWorker,
      department,
      preferredTeam,
      servingExperience,
      note,
      photoFileId
    } = req.body;

    if (fullName) {
      const nameVal = validateName(fullName, 'fullName');
      if (!nameVal.valid) {
        return res.status(400).json({ error: nameVal.message });
      }
    }

    const cleanPhone = phone ? validatePhoneNumber(phone, 'NG').normalizedPhone : undefined;
    const cleanWhatsapp = whatsapp ? validatePhoneNumber(whatsapp, 'NG').normalizedPhone : undefined;
    const now = new Date().toISOString();

    // Extract file UUID if a full URL is passed
    let resolvedPhotoId = photoFileId || null;
    if (photoFileId && photoFileId.includes('/api/media/files/')) {
      const match = photoFileId.match(/\/api\/media\/files\/([a-zA-Z0-9-]+)/);
      if (match && match[1]) {
        resolvedPhotoId = match[1];
      }
    }

    await execute(`
      UPDATE volunteer_profiles
      SET full_name = COALESCE(?, full_name),
          phone = COALESCE(?, phone),
          whatsapp = COALESCE(?, whatsapp),
          is_koinonia_worker = COALESCE(?, is_koinonia_worker),
          department = COALESCE(?, department),
          preferred_team = COALESCE(?, preferred_team),
          serving_experience = COALESCE(?, serving_experience),
          note = COALESCE(?, note),
          photo_file_id = COALESCE(?, photo_file_id),
          updated_at = ?
      WHERE user_id = ?
    `, [
      fullName || null,
      cleanPhone || null,
      cleanWhatsapp || null,
      isKoinoniaWorker !== undefined ? (isKoinoniaWorker ? 1 : 0) : null,
      department || null,
      preferredTeam || null,
      servingExperience !== undefined ? (servingExperience ? 1 : 0) : null,
      note || null,
      resolvedPhotoId,
      now,
      req.user.id
    ]);

    const updatedProfile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, profile: updatedProfile });
  } catch (err) {
    console.error('Update volunteer profile error:', err);
    res.status(500).json({ error: 'Internal server error updating profile' });
  }
});

// 5. EVENT HOME (DASHBOARD STATS)
router.get('/event-home', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    // Role/Access check: Pending volunteers cannot access event-home
    if (req.volunteerProfile && req.volunteerProfile.status === 'pending_review') {
      return res.status(403).json({ error: 'Access denied: Your volunteer access is under review.' });
    }

    // Fetch active event details
    const event = await queryOne('SELECT * FROM events WHERE id = ?', [REAL_EVENT_ID]);
    if (!event) {
      return res.status(404).json({ error: 'Active event not found' });
    }

    // Expected count
    const expectedQuery = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE status IN ('pass_ready', 'checked_in', 'inside', 'picked_up')");
    const expected = expectedQuery ? expectedQuery.count : 0;

    // Checked in count
    const checkedInQuery = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE status IN ('checked_in', 'inside')");
    const checkedIn = checkedInQuery ? checkedInQuery.count : 0;

    // Picked up count
    const pickedUpQuery = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE status IN ('picked_up', 'checked_out')");
    const pickedUp = pickedUpQuery ? pickedUpQuery.count : 0;

    // Attention items SQL queries
    // Issue A: Missing pickup photo (for active passes or check-ins)
    const missingPhotos = await query(`
      SELECT 'missing_photo_' || child_event_entries.id as id,
             'Missing pickup photo' as issue_type,
             children.full_name as child_name,
             children.id as child_id,
             'RESOLVE' as action_text
      FROM child_event_entries
      JOIN children ON child_event_entries.child_id = children.id
      JOIN pickup_people ON pickup_people.child_event_entry_id = child_event_entries.id
      WHERE child_event_entries.status IN ('pass_ready', 'checked_in', 'inside')
        AND (pickup_people.photo_file_id IS NULL OR pickup_people.photo_file_id = '')
      LIMIT 10
    `);

    // Issue B: Medical note review
    const medicalReviews = await query(`
      SELECT 'medical_' || child_event_entries.id as id,
             'Medical note update' as issue_type,
             children.full_name as child_name,
             children.id as child_id,
             'REVIEW' as action_text
      FROM child_event_entries
      JOIN children ON child_event_entries.child_id = children.id
      WHERE child_event_entries.status IN ('under_review', 'pass_ready')
        AND child_event_entries.has_medical_notes = 1
        AND child_event_entries.medical_notes IS NOT NULL
        AND child_event_entries.medical_notes != ''
      LIMIT 10
    `);

    // Issue C: Age review required
    const ageReviews = await query(`
      SELECT 'age_review_' || children.id as id,
             'Age review required' as issue_type,
             children.full_name as child_name,
             children.id as child_id,
             'VERIFY' as action_text
      FROM child_event_entries
      JOIN children ON child_event_entries.child_id = children.id
      WHERE children.needs_age_review = 1
      LIMIT 10
    `);

    const attentionItems = [...missingPhotos, ...medicalReviews, ...ageReviews];
    const attentionCount = attentionItems.length;

    res.json({
      event,
      stats: {
        expected: expected || 0,
        checkedIn: checkedIn || 0,
        pickedUp: pickedUp || 0,
        attention: attentionCount || 0
      },
      attentionItems: attentionItems
    });
  } catch (err) {
    console.error('Event home error:', err);
    res.status(500).json({ error: 'Internal server error fetching event home stats' });
  }
});

// ADMIN APPROVAL ENDPOINTS (Prepared but not fully designed)
router.get('/admin/volunteers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }
    const volunteers = await query(`
      SELECT vp.*, u.email, u.role
      FROM volunteer_profiles vp
      JOIN users u ON vp.user_id = u.id
      ORDER BY vp.created_at DESC
    `);
    res.json({ success: true, volunteers });
  } catch (err) {
    console.error('Get admin volunteers error:', err);
    res.status(500).json({ error: 'Failed to retrieve volunteers list' });
  }
});

router.post('/admin/volunteers/:volunteerId/approve', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }
    const { volunteerId } = req.params;
    const now = new Date().toISOString();

    await transaction(async () => {
      await execute(`
        UPDATE volunteer_profiles
        SET status = 'active', approved_by_user_id = ?, approved_at = ?, updated_at = ?
        WHERE id = ?
      `, [req.user!.id, now, now, volunteerId]);

      // Ensure user role is active/volunteer or staff (preserving parent role for multi-role users)
      const profile = await queryOne('SELECT user_id FROM volunteer_profiles WHERE id = ?', [volunteerId]);
      if (profile) {
        const parentProf = await queryOne('SELECT id FROM parent_profiles WHERE user_id = ?', [profile.user_id]);
        if (!parentProf) {
          await execute("UPDATE users SET role = 'volunteer' WHERE id = ?", [profile.user_id]);
        }
      }
    });

    res.json({ success: true, message: 'Volunteer profile approved successfully' });
  } catch (err) {
    console.error('Approve volunteer error:', err);
    res.status(500).json({ error: 'Failed to approve volunteer' });
  }
});

router.post('/admin/volunteers/:volunteerId/reject', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }
    const { volunteerId } = req.params;
    const now = new Date().toISOString();

    await execute(`
      UPDATE volunteer_profiles
      SET status = 'rejected', updated_at = ?
      WHERE id = ?
    `, [now, volunteerId]);

    res.json({ success: true, message: 'Volunteer profile rejected' });
  } catch (err) {
    console.error('Reject volunteer error:', err);
    res.status(500).json({ error: 'Failed to reject volunteer' });
  }
});

router.post('/admin/volunteers/:volunteerId/suspend', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }
    const { volunteerId } = req.params;
    const now = new Date().toISOString();

    await execute(`
      UPDATE volunteer_profiles
      SET status = 'suspended', updated_at = ?
      WHERE id = ?
    `, [now, volunteerId]);

    res.json({ success: true, message: 'Volunteer profile suspended' });
  } catch (err) {
    console.error('Suspend volunteer error:', err);
    res.status(500).json({ error: 'Failed to suspend volunteer' });
  }
});

export default router;
