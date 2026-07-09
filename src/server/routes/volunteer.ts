import { Router, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { query, queryOne, execute, transaction, REAL_EVENT_ID } from '../db';
import { hashPassword, verifyPassword, generateToken, authMiddleware, AuthenticatedRequest } from '../auth';
import { sendEmail, sendVolunteerVerificationEmail, sendVolunteerPasswordResetEmail, sendVolunteerApprovedEmail } from '../services/email';
import { validateEmailAddress, validatePhoneNumber, validateName } from '../utils/validation';
import { uploadMedia } from '../services/media/cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

async function getEventStats() {
  const expectedQuery = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE status IN ('pass_ready', 'checked_in', 'inside', 'picked_up')");
  const checkedInQuery = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE status IN ('checked_in', 'inside')");
  const pickedUpQuery = await queryOne("SELECT COUNT(*) as count FROM child_event_entries WHERE status IN ('picked_up', 'checked_out')");
  
  // Calculate attention
  const missingPhotos = await query(`
    SELECT COUNT(*) as count FROM child_event_entries
    JOIN children ON child_event_entries.child_id = children.id
    JOIN pickup_people ON pickup_people.child_event_entry_id = child_event_entries.id
    WHERE child_event_entries.status IN ('pass_ready', 'checked_in', 'inside')
      AND (pickup_people.photo_file_id IS NULL OR pickup_people.photo_file_id = '')
  `);
  const medicalReviews = await query(`
    SELECT COUNT(*) as count FROM child_event_entries
    WHERE child_event_entries.status IN ('under_review', 'pass_ready')
      AND child_event_entries.has_medical_notes = 1
      AND child_event_entries.medical_notes IS NOT NULL
      AND child_event_entries.medical_notes != ''
  `);
  const ageReviews = await query(`
    SELECT COUNT(*) as count FROM children WHERE needs_age_review = 1
  `);
  
  const attentionCount = (missingPhotos[0]?.count || 0) + (medicalReviews[0]?.count || 0) + (ageReviews[0]?.count || 0);

  return {
    expected: expectedQuery ? expectedQuery.count : 0,
    checkedIn: checkedInQuery ? checkedInQuery.count : 0,
    pickedUp: pickedUpQuery ? pickedUpQuery.count : 0,
    attention: attentionCount || 0
  };
}

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
        volunteerProfile: profile,
        token,
        nextRoute: '/volunteer/pending-review'
      });
    }

    // 10. If volunteerProfile.status === "active" or "approved": return success with token, user, volunteerProfile, nextRoute: "/volunteer/event".
    if (volunteerStatus === 'active' || volunteerStatus === 'approved') {
      // 5. Volunteer sign-in final result fields:
      console.log(`Volunteer sign-in final result { outcome: "${volunteerStatus}" }`);
      return res.json({
        success: true,
        user: { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
        profile,
        volunteerProfile: profile,
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
        volunteerProfile: profile,
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
        volunteerProfile: profile,
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
      volunteerProfile: profile,
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

  // Check email verified status
  const emailVerified = req.user.email_verified === 1;
  if (!emailVerified) {
    return res.status(403).json({
      success: false,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Access denied: Email is not verified.'
    });
  }

  // Retrieve or verify volunteer profile
  const profile = req.volunteerProfile;
  if (!profile) {
    return res.status(403).json({
      success: false,
      code: 'NO_VOLUNTEER_ACCESS',
      message: 'Access denied: Volunteer profile required.'
    });
  }

  const status = profile.status || 'none';
  const hasAccess = status === 'active' || status === 'approved';

  try {
    // Map profile roles/teams/areas
    let assignedTeam = 'General Team';
    let assignedArea = 'General Hall';
    let accessScope = 'General Access';

    const pTeam = (profile.preferred_team || '').toLowerCase();
    if (pTeam.includes('check-in') || pTeam.includes('entry') || pTeam.includes('gate') || pTeam.includes('event-day')) {
      assignedTeam = 'Check-in Team';
      assignedArea = 'Main Entrance';
      accessScope = 'Check-in only';
    } else if (pTeam.includes('pickup') || pTeam.includes('release') || pTeam.includes('checkout')) {
      assignedTeam = 'Pickup Team';
      assignedArea = 'Pickup Zone';
      accessScope = 'Pickup only';
    } else if (profile.preferred_team) {
      assignedTeam = profile.preferred_team;
    }

    const photoUrl = profile.photo_file_id ? `/api/media/files/${profile.photo_file_id}` : null;

    const volunteerProfileObj = {
      id: profile.id,
      status: profile.status,
      preferredTeam: profile.preferred_team,
      assignedTeam,
      assignedArea,
      accessScope
    };

    if (!hasAccess) {
      return res.json({
        success: true,
        user: {
          id: req.user.id,
          fullName: profile.full_name || 'Volunteer',
          email: req.user.email,
          photoUrl
        },
        profile: volunteerProfileObj,
        volunteerProfile: volunteerProfileObj,
        event: {
          name: 'Children and Teens',
          section: 'The General Assembly'
        },
        activity: {
          checkedInByYou: 0,
          lastScanAt: null,
          pendingUpdates: 0
        },
        help: {
          eventLeadName: 'Pastor Isaac',
          eventLeadPhone: '+234 803 123 4567',
          eventLeadEmail: 'isaac@koinoniaglobal.org'
        }
      });
    }

    // Real stats: count checkins / pick-ups by this user
    const checkInCountRow = await queryOne(
      "SELECT COUNT(*) as count FROM child_event_entries WHERE (checked_in_by = ? OR picked_up_by = ?)",
      [req.user.id, req.user.id]
    );
    const checkedInByYou = checkInCountRow ? checkInCountRow.count : 0;

    const lastScanRow = await queryOne(
      "SELECT MAX(COALESCE(checked_in_at, picked_up_at)) as last_scan FROM child_event_entries WHERE checked_in_by = ? OR picked_up_by = ?",
      [req.user.id, req.user.id]
    );
    const lastScanAt = lastScanRow ? lastScanRow.last_scan : null;

    // Fetch active event details
    const activeEvent = await queryOne(
      "SELECT title, section_name FROM events WHERE id = ?",
      [REAL_EVENT_ID]
    );

    const eventName = activeEvent?.title || 'Children and Teens';
    const eventSection = activeEvent?.section_name || 'The General Assembly';

    res.json({
      success: true,
      user: {
        id: req.user.id,
        fullName: profile.full_name || 'Volunteer',
        email: req.user.email,
        photoUrl
      },
      profile: volunteerProfileObj,
      volunteerProfile: volunteerProfileObj,
      event: {
        name: eventName,
        section: eventSection
      },
      activity: {
        checkedInByYou,
        lastScanAt,
        pendingUpdates: 0
      },
      help: {
        eventLeadName: 'Pastor Isaac',
        eventLeadPhone: '+234 803 123 4567',
        eventLeadEmail: 'isaac@koinoniaglobal.org'
      }
    });
  } catch (err) {
    console.error('Error in /api/volunteer/me:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3a. GET ME STATUS
router.get('/me/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  // Check email verified status
  const emailVerified = req.user.email_verified === 1;

  // Read fresh status from DB every time
  const profile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [req.user.id]);
  if (!profile) {
    return res.status(404).json({
      success: false,
      code: 'NO_VOLUNTEER_ACCESS',
      message: 'Volunteer profile not found.'
    });
  }

  const volunteerStatus = profile.status || 'none';
  let nextRoute = '/volunteer/pending-review';
  if (!emailVerified) {
    nextRoute = '/volunteer/verify-email';
  } else if (volunteerStatus === 'approved' || volunteerStatus === 'active') {
    nextRoute = '/volunteer/event';
  }

  const photoUrl = profile.photo_file_id ? `/api/media/files/${profile.photo_file_id}` : null;

  const volunteerProfileObj = {
    id: profile.id,
    status: volunteerStatus,
    preferredTeam: profile.preferred_team,
    photoUrl,
    full_name: profile.full_name,
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    is_koinonia_worker: profile.is_koinonia_worker,
    department: profile.department,
    serving_experience: profile.serving_experience,
    photo_file_id: profile.photo_file_id
  };

  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      emailVerified
    },
    profile: volunteerProfileObj,
    volunteerProfile: volunteerProfileObj,
    nextRoute
  });
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

// 4a. PATCH/POST ME PROFILE (Secure onboarding edit)
const handleMeProfileUpdate = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const userId = req.user.id;
    const profile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [userId]);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Volunteer profile not found' });
    }

    // Explicitly reject/ignore admin fields if they were attempted to be sent from clients
    const bodyKeys = Object.keys(req.body);
    const forbiddenKeys = [
      'email', 'role', 'status', 'assignedTeam', 'assignedArea', 'assigned_team', 'assigned_area',
      'permissions', 'accessScope', 'reviewedBy', 'reviewedAt', 'adminNotes', 'admin_notes',
      'password', 'token', 'userId', 'user_id', 'id'
    ];
    for (const key of forbiddenKeys) {
      if (bodyKeys.includes(key)) {
        delete req.body[key];
      }
    }

    const {
      fullName,
      phone,
      whatsapp,
      isKoinoniaWorker,
      department,
      preferredTeam,
      servingExperience,
      note
    } = req.body;

    let resolvedPhotoId: string | null = profile.photo_file_id || null;

    if (req.file) {
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

      // Upload to Cloudinary using existing helper
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
        userId,
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
    }

    let updatedFullName = profile.full_name;
    if (fullName !== undefined) {
      const nameVal = validateName(fullName, 'fullName');
      if (!nameVal.valid) {
        return res.status(400).json({ success: false, message: nameVal.message });
      }
      updatedFullName = fullName.trim().slice(0, 100);
    }

    let updatedPhone = profile.phone;
    if (phone !== undefined && phone !== null && phone !== '') {
      const phoneVal = validatePhoneNumber(phone, 'NG');
      if (!phoneVal.valid) {
        return res.status(400).json({ success: false, message: phoneVal.message || 'Invalid phone number' });
      }
      updatedPhone = phoneVal.normalizedPhone!;
    }

    let updatedWhatsapp = profile.whatsapp;
    if (whatsapp !== undefined && whatsapp !== null && whatsapp !== '') {
      const whatsappVal = validatePhoneNumber(whatsapp, 'NG');
      if (!whatsappVal.valid) {
        return res.status(400).json({ success: false, message: whatsappVal.message || 'Invalid WhatsApp number' });
      }
      updatedWhatsapp = whatsappVal.normalizedPhone!;
    }

    let updatedIsKoinoniaWorker = profile.is_koinonia_worker;
    if (isKoinoniaWorker !== undefined) {
      updatedIsKoinoniaWorker = (isKoinoniaWorker === true || isKoinoniaWorker === 'true' || isKoinoniaWorker === 1 || isKoinoniaWorker === '1') ? 1 : 0;
    }

    let updatedDepartment = profile.department;
    if (department !== undefined) {
      updatedDepartment = department ? department.trim().slice(0, 100) : null;
    }

    let updatedPreferredTeam = profile.preferred_team;
    if (preferredTeam !== undefined) {
      updatedPreferredTeam = preferredTeam ? preferredTeam.trim().slice(0, 100) : null;
    }

    let updatedServingExperience = profile.serving_experience;
    if (servingExperience !== undefined) {
      updatedServingExperience = (servingExperience === true || servingExperience === 'true' || servingExperience === 1 || servingExperience === '1') ? 1 : 0;
    }

    let updatedNote = profile.note;
    if (note !== undefined) {
      updatedNote = note ? note.trim().slice(0, 500) : null;
    }

    const now = new Date().toISOString();

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
          updated_at = ?
      WHERE user_id = ?
    `, [
      resolvedPhotoId,
      updatedFullName,
      updatedPhone,
      updatedWhatsapp,
      updatedIsKoinoniaWorker,
      updatedDepartment,
      updatedPreferredTeam,
      updatedServingExperience,
      updatedNote,
      now,
      userId
    ]);

    // Query fresh volunteer profile
    const freshProfile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [userId]);
    const photoUrl = freshProfile.photo_file_id ? `/api/media/files/${freshProfile.photo_file_id}` : null;

    // Resolve assigned details for compatibility
    let assignedTeam = 'General Team';
    let assignedArea = 'General Hall';
    let accessScope = 'General Access';
    const pTeam = (freshProfile.preferred_team || '').toLowerCase();
    if (pTeam.includes('check-in') || pTeam.includes('entry') || pTeam.includes('gate') || pTeam.includes('event-day')) {
      assignedTeam = 'Check-in Team';
      assignedArea = 'Main Entrance';
      accessScope = 'Check-in only';
    } else if (pTeam.includes('pickup') || pTeam.includes('release') || pTeam.includes('checkout')) {
      assignedTeam = 'Pickup Team';
      assignedArea = 'Pickup Zone';
      accessScope = 'Pickup only';
    } else if (freshProfile.preferred_team) {
      assignedTeam = freshProfile.preferred_team;
    }

    const updatedProfileObj = {
      id: freshProfile.id,
      fullName: freshProfile.full_name,
      full_name: freshProfile.full_name,
      phone: freshProfile.phone,
      whatsapp: freshProfile.whatsapp,
      isKoinoniaWorker: freshProfile.is_koinonia_worker === 1,
      is_koinonia_worker: freshProfile.is_koinonia_worker,
      department: freshProfile.department,
      preferredTeam: freshProfile.preferred_team,
      preferred_team: freshProfile.preferred_team,
      servingExperience: freshProfile.serving_experience === 1,
      serving_experience: freshProfile.serving_experience,
      note: freshProfile.note,
      photoUrl,
      photo_file_id: freshProfile.photo_file_id,
      status: freshProfile.status,
      assignedTeam,
      assignedArea,
      accessScope
    };

    res.json({
      success: true,
      profile: updatedProfileObj,
      volunteerProfile: updatedProfileObj
    });
  } catch (err) {
    console.error('PATCH/POST me profile error:', err);
    res.status(500).json({ success: false, message: 'Internal server error updating profile' });
  }
};

router.patch('/me/profile', authMiddleware, upload.single('photo'), handleMeProfileUpdate);
router.post('/me/profile', authMiddleware, upload.single('photo'), handleMeProfileUpdate);

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

    let approvedVolunteer: { email: string; fullName: string; preferredTeam: string } | null = null;

    // Retrieve details before transaction/update to ensure we have the correct user email and profile info
    const profileInfo = await queryOne(`
      SELECT vp.full_name, vp.preferred_team, u.email
      FROM volunteer_profiles vp
      JOIN users u ON vp.user_id = u.id
      WHERE vp.id = ?
    `, [volunteerId]);

    if (profileInfo) {
      approvedVolunteer = {
        email: profileInfo.email,
        fullName: profileInfo.full_name,
        preferredTeam: profileInfo.preferred_team
      };
    }

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

    // Trigger volunteer approval email trigger post-transaction
    if (approvedVolunteer) {
      const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');
      const loginLink = `${baseUrl}/#/volunteer/sign-in`;

      sendVolunteerApprovedEmail({
        volunteerEmail: approvedVolunteer.email,
        volunteerFirstName: approvedVolunteer.fullName,
        preferredTeam: approvedVolunteer.preferredTeam,
        loginLink
      }).catch((err) => console.error('Error sending volunteer approval email:', err));
    }

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

// 6. SEARCH CHILDREN/PARENTS FOR CHECK-IN
router.get('/children/search', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    // Role/Access check: Pending volunteers cannot search
    if (req.volunteerProfile && req.volunteerProfile.status === 'pending_review') {
      return res.status(403).json({ error: 'Access denied: Your volunteer access is under review.' });
    }

    const searchQuery = (req.query.q || '').toString().trim();
    if (!searchQuery) {
      return res.json([]);
    }

    const likeParam = `%${searchQuery}%`;
    const rows = await query(`
      SELECT c.id as child_id, c.full_name as child_name, c.date_of_birth, c.gender, c.calculated_age, c.age_group, c.photo_file_id as child_photo_id,
             p.full_name as parent_name, p.phone_number as parent_phone, p.whatsapp_number as parent_whatsapp,
             e.id as entry_id, e.status as entry_status, e.school_class, e.school_name, e.has_medical_notes, e.medical_notes, e.needs_extra_support, e.support_notes
      FROM children c
      JOIN parent_profiles p ON c.parent_profile_id = p.id
      LEFT JOIN child_event_entries e ON c.id = e.child_id AND e.event_id = ?
      WHERE c.full_name LIKE ? OR p.full_name LIKE ? OR p.phone_number LIKE ?
      LIMIT 50
    `, [REAL_EVENT_ID, likeParam, likeParam, likeParam]);

    const results = [];
    for (const r of rows) {
      // Resolve photos
      let childPhotoUrl = '';
      if (r.child_photo_id) {
        if (r.child_photo_id.startsWith('http') || r.child_photo_id.startsWith('/')) {
          childPhotoUrl = r.child_photo_id;
        } else {
          const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [r.child_photo_id]);
          childPhotoUrl = media ? (media.secure_url || media.file_url || `/api/media/files/${r.child_photo_id}`) : `/api/media/files/${r.child_photo_id}`;
        }
      }

      // Get pickup person details
      let pickup = null;
      if (r.entry_id) {
        const pickupRow = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [r.entry_id]);
        if (pickupRow) {
          let pickupPhotoUrl = '';
          if (pickupRow.photo_file_id) {
            if (pickupRow.photo_file_id.startsWith('http') || pickupRow.photo_file_id.startsWith('/')) {
              pickupPhotoUrl = pickupRow.photo_file_id;
            } else {
              const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [pickupRow.photo_file_id]);
              pickupPhotoUrl = media ? (media.secure_url || media.file_url || `/api/media/files/${pickupRow.photo_file_id}`) : `/api/media/files/${pickupRow.photo_file_id}`;
            }
          }
          pickup = {
            id: pickupRow.id,
            fullName: pickupRow.full_name,
            relationship: pickupRow.relationship_to_child,
            phone: pickupRow.phone_number,
            whatsapp: pickupRow.whatsapp_number,
            photoUrl: pickupPhotoUrl
          };
        }
      }

      // Check pass
      let passReference = null;
      if (r.entry_id) {
        const passRow = await queryOne('SELECT pass_reference FROM event_passes WHERE child_event_entry_id = ?', [r.entry_id]);
        if (passRow) {
          passReference = passRow.pass_reference;
        }
      }

      results.push({
        childId: r.child_id,
        childName: r.child_name,
        gender: r.gender,
        dateOfBirth: r.date_of_birth,
        calculatedAge: r.calculated_age,
        ageGroup: r.age_group,
        photoUrl: childPhotoUrl,
        parentName: r.parent_name,
        parentPhone: r.parent_phone,
        parentWhatsapp: r.parent_whatsapp,
        entryId: r.entry_id,
        entryStatus: r.entry_status,
        schoolClass: r.school_class,
        schoolName: r.school_name,
        hasMedicalNotes: r.has_medical_notes === 1,
        medicalNotes: r.medical_notes,
        needsExtraSupport: r.needs_extra_support === 1,
        supportNotes: r.support_notes,
        passReference,
        pickup
      });
    }

    res.json(results);
  } catch (err) {
    console.error('Volunteer children search error:', err);
    res.status(500).json({ error: 'Internal server error searching children' });
  }
});

// 6.5 PASS LOOKUP (Two-Step check-in)
router.post('/pass/lookup', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    if (req.volunteerProfile && req.volunteerProfile.status === 'pending_review') {
      return res.status(403).json({ error: 'Access denied: Your volunteer access is under review.' });
    }

    const { passReference, childId, childEventEntryId } = req.body;
    let entryId = childEventEntryId;

    if (!entryId) {
      if (passReference) {
        let cleanRef = passReference.toString().trim().toUpperCase();
        if (cleanRef.startsWith('KCT:')) {
          cleanRef = cleanRef.substring(4);
        }
        if (cleanRef.startsWith('PASS-')) {
          cleanRef = cleanRef.replace('PASS-', 'KOI-2026-');
        } else if (!cleanRef.startsWith('KOI-2026-') && cleanRef.length === 6) {
          cleanRef = `KOI-2026-${cleanRef}`;
        }
        
        const passRow = await queryOne('SELECT child_event_entry_id, status FROM event_passes WHERE pass_reference = ? OR id = ?', [cleanRef, passReference]);
        if (!passRow) {
          return res.status(404).json({ error: `Event pass with reference "${passReference}" not found` });
        }
        if (passRow.status === 'revoked' || passRow.status === 'inactive') {
          return res.status(400).json({ error: 'This pass has been revoked. Review reopened.' });
        }
        entryId = passRow.child_event_entry_id;
      } else if (childId) {
        const entryRow = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
        if (!entryRow) {
          return res.status(404).json({ error: `Registration not found for child ID "${childId}"` });
        }
        entryId = entryRow.id;
      }
    }

    if (!entryId) {
      return res.status(400).json({ error: 'Please provide passReference, childId, or childEventEntryId' });
    }

    const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryId]);
    if (!entry) {
      return res.status(404).json({ error: 'Event registration entry not found' });
    }

    // Fetch child and parent details
    const child = await queryOne('SELECT * FROM children WHERE id = ?', [entry.child_id]);
    if (!child) {
      return res.status(404).json({ error: 'Registered child details not found' });
    }
    const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [child.parent_profile_id]);
    const pickupRow = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryId]);

    let childPhotoUrl = '';
    if (child.photo_file_id) {
      if (child.photo_file_id.startsWith('http') || child.photo_file_id.startsWith('/')) {
        childPhotoUrl = child.photo_file_id;
      } else {
        const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [child.photo_file_id]);
        childPhotoUrl = media ? (media.secure_url || media.file_url || `/api/media/files/${child.photo_file_id}`) : `/api/media/files/${child.photo_file_id}`;
      }
    }

    let pickup = null;
    if (pickupRow) {
      let pickupPhotoUrl = '';
      if (pickupRow.photo_file_id) {
        if (pickupRow.photo_file_id.startsWith('http') || pickupRow.photo_file_id.startsWith('/')) {
          pickupPhotoUrl = pickupRow.photo_file_id;
        } else {
          const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [pickupRow.photo_file_id]);
          pickupPhotoUrl = media ? (media.secure_url || media.file_url || `/api/media/files/${pickupRow.photo_file_id}`) : `/api/media/files/${pickupRow.photo_file_id}`;
        }
      }
      pickup = {
        id: pickupRow.id,
        fullName: pickupRow.full_name,
        relationship: pickupRow.relationship_to_child,
        phone: pickupRow.phone_number,
        whatsapp: pickupRow.whatsapp_number,
        photoUrl: pickupPhotoUrl
      };
    }

    // Get passReference associated with entry if we didn't receive one
    let finalPassReference = passReference || null;
    if (!finalPassReference) {
      const passRow = await queryOne('SELECT pass_reference FROM event_passes WHERE child_event_entry_id = ?', [entryId]);
      if (passRow) {
        finalPassReference = passRow.pass_reference;
      }
    }

    res.json({
      success: true,
      child: {
        id: child.id,
        fullName: child.full_name,
        photoUrl: childPhotoUrl,
        ageGroup: child.age_group,
        dateOfBirth: child.date_of_birth,
        gender: child.gender,
        parentName: parent ? parent.full_name : '',
        parentPhone: parent ? parent.phone_number : '',
        parentWhatsapp: parent ? parent.whatsapp_number : '',
        schoolClass: entry.school_class,
        schoolName: entry.school_name,
        hasMedicalNotes: entry.has_medical_notes === 1,
        medicalNotes: entry.medical_notes,
        needsExtraSupport: entry.needs_extra_support === 1,
        supportNotes: entry.support_notes,
        entryId: entry.id,
        entryStatus: entry.status,
        passReference: finalPassReference,
        pickup
      }
    });
  } catch (err) {
    console.error('Pass lookup error:', err);
    res.status(500).json({ error: 'Internal server error performing pass lookup' });
  }
});

// 7. CHECK IN CHILD
router.post('/check-in', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    if (req.volunteerProfile && req.volunteerProfile.status === 'pending_review') {
      return res.status(403).json({ error: 'Access denied: Your volunteer access is under review.' });
    }

    const { passReference, childId, childEventEntryId } = req.body;
    let entryId = childEventEntryId;

    if (!entryId) {
      if (passReference) {
        // Normalize passReference (e.g., KOI-2026-6E80A7 or just 6E80A7)
        let cleanRef = passReference.toString().trim().toUpperCase();
        if (cleanRef.startsWith('KCT:')) {
          cleanRef = cleanRef.substring(4);
        }
        if (cleanRef.startsWith('PASS-')) {
          cleanRef = cleanRef.replace('PASS-', 'KOI-2026-');
        } else if (!cleanRef.startsWith('KOI-2026-') && cleanRef.length === 6) {
          cleanRef = `KOI-2026-${cleanRef}`;
        }
        
        const passRow = await queryOne('SELECT child_event_entry_id, status FROM event_passes WHERE pass_reference = ? OR id = ?', [cleanRef, passReference]);
        if (!passRow) {
          return res.status(404).json({ error: `Event pass with reference "${passReference}" not found` });
        }
        if (passRow.status === 'revoked' || passRow.status === 'inactive') {
          return res.status(400).json({ error: 'This pass has been revoked. Review reopened.' });
        }
        entryId = passRow.child_event_entry_id;
      } else if (childId) {
        const entryRow = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
        if (!entryRow) {
          return res.status(404).json({ error: `Registration not found for child ID "${childId}"` });
        }
        entryId = entryRow.id;
      }
    }

    if (!entryId) {
      return res.status(400).json({ error: 'Please provide passReference, childId, or childEventEntryId' });
    }

    const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryId]);
    if (!entry) {
      return res.status(404).json({ error: 'Event registration entry not found' });
    }

    const child = await queryOne('SELECT * FROM children WHERE id = ?', [entry.child_id]);
    if (!child) {
      return res.status(404).json({ error: 'Registered child details not found' });
    }
    const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [child.parent_profile_id]);
    const pickupRow = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryId]);

    let childPhotoUrl = '';
    if (child.photo_file_id) {
      if (child.photo_file_id.startsWith('http') || child.photo_file_id.startsWith('/')) {
        childPhotoUrl = child.photo_file_id;
      } else {
        const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [child.photo_file_id]);
        childPhotoUrl = media ? (media.secure_url || media.file_url || `/api/media/files/${child.photo_file_id}`) : `/api/media/files/${child.photo_file_id}`;
      }
    }

    let authorizedPickup = [];
    if (pickupRow) {
      let pickupPhotoUrl = '';
      if (pickupRow.photo_file_id) {
        if (pickupRow.photo_file_id.startsWith('http') || pickupRow.photo_file_id.startsWith('/')) {
          pickupPhotoUrl = pickupRow.photo_file_id;
        } else {
          const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [pickupRow.photo_file_id]);
          pickupPhotoUrl = media ? (media.secure_url || media.file_url || `/api/media/files/${pickupRow.photo_file_id}`) : `/api/media/files/${pickupRow.photo_file_id}`;
        }
      }
      authorizedPickup.push({
        id: pickupRow.id,
        fullName: pickupRow.full_name,
        relationship: pickupRow.relationship_to_child || 'Parent',
        phone: pickupRow.phone_number,
        photoUrl: pickupPhotoUrl
      });
    }

    const volunteerProfile = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ?', [req.user.id]);
    const volunteerName = volunteerProfile ? volunteerProfile.full_name : (req.user.email || 'Event Worker');

    // Handle Already Checked In
    if (entry.status === 'checked_in' || entry.status === 'inside') {
      const stats = await getEventStats();
      const currentCheckedInAt = entry.checked_in_at || entry.updated_at || new Date().toISOString();
      return res.json({
        success: true,
        alreadyCheckedIn: true,
        message: 'This child has already been checked in.',
        child: {
          id: child.id,
          fullName: child.full_name,
          firstName: child.full_name.split(' ')[0],
          age: child.calculated_age || 0,
          gender: child.gender,
          classGroup: child.age_group || 'General',
          photoUrl: childPhotoUrl,
          passImageUrl: null,
          entryStatus: 'checked_in',
          checkedInAt: currentCheckedInAt,
          medicalNote: entry.medical_notes || '',
          allergies: entry.has_medical_notes === 1 ? 'Yes' : 'No',
          extraSupport: entry.needs_extra_support === 1 ? 'Yes' : 'No',
          authorizedPickup
        },
        entry: {
          checkedInAt: currentCheckedInAt,
          checkedInBy: {
            id: entry.checked_in_by || req.user.id,
            fullName: volunteerName
          },
          point: 'Entrance A'
        },
        stats: {
          expected: stats.expected,
          checkedIn: stats.checkedIn,
          waiting: Math.max(0, stats.expected - stats.checkedIn)
        }
      });
    }

    if (entry.status !== 'pass_ready' && entry.status !== 'selected') {
      return res.status(400).json({ error: `Cannot check in. Child's registration status is currently "${entry.status}" (must be "pass_ready")` });
    }

    const now = new Date().toISOString();
    await execute(`
      UPDATE child_event_entries
      SET status = 'checked_in', checked_in_at = ?, checked_in_by = ?, updated_at = ?
      WHERE id = ?
    `, [now, now, req.user.id, now, entryId]);

    const stats = await getEventStats();

    res.json({
      success: true,
      message: 'Child checked in.',
      child: {
        id: child.id,
        fullName: child.full_name,
        firstName: child.full_name.split(' ')[0],
        age: child.calculated_age || 0,
        gender: child.gender,
        classGroup: child.age_group || 'General',
        photoUrl: childPhotoUrl,
        passImageUrl: null,
        entryStatus: 'checked_in',
        checkedInAt: now,
        medicalNote: entry.medical_notes || '',
        allergies: entry.has_medical_notes === 1 ? 'Yes' : 'No',
        extraSupport: entry.needs_extra_support === 1 ? 'Yes' : 'No',
        authorizedPickup
      },
      entry: {
        checkedInAt: now,
        checkedInBy: {
          id: req.user.id,
          fullName: volunteerName
        },
        point: 'Entrance A'
      },
      stats: {
        expected: stats.expected,
        checkedIn: stats.checkedIn,
        waiting: Math.max(0, stats.expected - stats.checkedIn)
      }
    });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Internal server error processing check-in' });
  }
});

// Helper to get last picked up child
async function getLastPickedUp() {
  const row = await queryOne(`
    SELECT c.full_name as childFullName, c.calculated_age as age, e.picked_up_at
    FROM child_event_entries e
    JOIN children c ON e.child_id = c.id
    WHERE e.status IN ('picked_up', 'checked_out') AND e.picked_up_at IS NOT NULL
    ORDER BY e.picked_up_at DESC
    LIMIT 1
  `);
  if (!row) return null;
  return {
    childFullName: row.childFullName,
    age: row.age || 4,
    pickedUpAt: row.picked_up_at
  };
}

// 8. CHECK OUT CHILD (PICKUP RELEASE)
router.post('/check-out', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    if (req.volunteerProfile && req.volunteerProfile.status === 'pending_review') {
      return res.status(403).json({ error: 'Access denied: Your volunteer access is under review.' });
    }

    const { passReference, childId, childEventEntryId, pickupPersonId } = req.body;
    let entryId = childEventEntryId;

    if (!entryId) {
      if (passReference) {
        let cleanRef = passReference.toString().trim().toUpperCase();
        if (cleanRef.startsWith('PASS-')) {
          cleanRef = cleanRef.replace('PASS-', 'KOI-2026-');
        } else if (!cleanRef.startsWith('KOI-2026-') && cleanRef.length === 6) {
          cleanRef = `KOI-2026-${cleanRef}`;
        }
        
        const passRow = await queryOne('SELECT child_event_entry_id, status FROM event_passes WHERE pass_reference = ? OR id = ?', [cleanRef, passReference]);
        if (!passRow) {
          return res.status(404).json({ error: `Event pass with reference "${passReference}" not found` });
        }
        if (passRow.status === 'revoked' || passRow.status === 'inactive') {
          return res.status(400).json({ error: 'This pass has been revoked. Review reopened.' });
        }
        entryId = passRow.child_event_entry_id;
      } else if (childId) {
        const entryRow = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
        if (!entryRow) {
          return res.status(404).json({ error: `Registration not found for child ID "${childId}"` });
        }
        entryId = entryRow.id;
      }
    }

    if (!entryId) {
      return res.status(400).json({ error: 'Please provide passReference, childId, or childEventEntryId' });
    }

    const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryId]);
    if (!entry) {
      return res.status(404).json({ error: 'Event registration entry not found' });
    }

    const child = await queryOne('SELECT * FROM children WHERE id = ?', [entry.child_id]);
    const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [child.parent_profile_id]);
    const pickupRow = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryId]);

    let childPhotoUrl = '';
    if (child.photo_file_id) {
      if (child.photo_file_id.startsWith('http') || child.photo_file_id.startsWith('/')) {
        childPhotoUrl = child.photo_file_id;
      } else {
        const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [child.photo_file_id]);
        childPhotoUrl = media ? (media.secure_url || media.file_url || `/api/media/files/${child.photo_file_id}`) : `/api/media/files/${child.photo_file_id}`;
      }
    }

    const volunteerProfile = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ?', [req.user.id]);
    const volunteerName = volunteerProfile ? volunteerProfile.full_name : (req.user.email || 'Event Worker');

    let pickupPersonDetails = null;
    if (pickupRow) {
      pickupPersonDetails = {
        id: pickupRow.id,
        fullName: pickupRow.full_name,
        relationship: pickupRow.relationship_to_child || 'Parent',
        phone: pickupRow.phone_number
      };
    } else {
      pickupPersonDetails = {
        id: parent.id,
        fullName: parent.full_name,
        relationship: 'Primary Parent',
        phone: parent.phone_number
      };
    }

    // Handle Already Checked Out
    if (entry.status === 'picked_up' || entry.status === 'checked_out') {
      const stats = await getEventStats();
      const lastPickedUpVal = await getLastPickedUp();
      return res.json({
        success: true,
        alreadyPickedUp: true,
        message: 'This child has already been picked up.',
        child: {
          id: child.id,
          fullName: child.full_name,
          age: child.calculated_age || 0,
          pickupStatus: 'picked_up',
          pickedUpAt: entry.picked_up_at || entry.updated_at
        },
        pickup: {
          pickedUpAt: entry.picked_up_at || entry.updated_at,
          pickedUpBy: {
            id: entry.picked_up_by || req.user.id,
            fullName: volunteerName
          },
          pickupPerson: pickupPersonDetails
        },
        stats,
        lastPickedUp: lastPickedUpVal
      });
    }

    // Ensure they are checked in first
    if (entry.status !== 'checked_in' && entry.status !== 'inside') {
      return res.status(400).json({
        success: false,
        code: 'NOT_CHECKED_IN',
        message: 'This child has not been checked in yet.'
      });
    }

    const now = new Date().toISOString();
    await execute(`
      UPDATE child_event_entries
      SET status = 'picked_up', picked_up_at = ?, picked_up_by = ?, pickup_person_id = ?, updated_at = ?
      WHERE id = ?
    `, [now, now, req.user.id, pickupPersonId || (pickupRow ? pickupRow.id : parent.id), now, entryId]);

    const stats = await getEventStats();
    const lastPickedUpVal = await getLastPickedUp();

    res.json({
      success: true,
      message: 'Child picked up.',
      child: {
        id: child.id,
        fullName: child.full_name,
        age: child.calculated_age || 0,
        pickupStatus: 'picked_up',
        pickedUpAt: now
      },
      pickup: {
        pickedUpAt: now,
        pickedUpBy: {
          id: req.user.id,
          fullName: volunteerName
        },
        pickupPerson: pickupPersonDetails
      },
      stats,
      lastPickedUp: lastPickedUpVal
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Internal server error processing checkout' });
  }
});

// Helper to resolve any photo UUID to secure URL or fallback URL path
async function resolvePhotoUrl(photoFileId: string | null | undefined): Promise<string> {
  if (!photoFileId) return '';
  if (photoFileId.startsWith('http') || photoFileId.startsWith('/') || photoFileId.startsWith('data:')) {
    return photoFileId;
  }
  const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [photoFileId]);
  return media ? (media.secure_url || media.file_url || `/api/media/files/${photoFileId}`) : `/api/media/files/${photoFileId}`;
}

// POST /api/volunteer/pickup/lookup
router.post('/pickup/lookup', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    if (req.volunteerProfile && req.volunteerProfile.status === 'pending_review') {
      return res.status(403).json({ error: 'Access denied: Your volunteer access is under review.' });
    }

    const { passCode } = req.body;
    if (!passCode) {
      return res.status(400).json({ success: false, error: 'Please provide a pass code' });
    }

    let cleanRef = passCode.toString().trim().toUpperCase();
    if (cleanRef.startsWith('PASS-')) {
      cleanRef = cleanRef.replace('PASS-', 'KOI-2026-');
    } else if (!cleanRef.startsWith('KOI-2026-') && cleanRef.length === 6) {
      cleanRef = `KOI-2026-${cleanRef}`;
    }

    const passRow = await queryOne('SELECT child_event_entry_id, status FROM event_passes WHERE pass_reference = ? OR id = ?', [cleanRef, passCode]);
    if (!passRow) {
      return res.status(404).json({
        success: false,
        code: 'INVALID_PASS',
        message: 'We could not find a child for this pass.'
      });
    }
    if (passRow.status === 'revoked' || passRow.status === 'inactive') {
      return res.status(400).json({
        success: false,
        code: 'REVOKED_PASS',
        message: 'This pass has been revoked. Review has been reopened.'
      });
    }

    const entryId = passRow.child_event_entry_id;
    const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryId]);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Event registration entry not found' });
    }

    const child = await queryOne('SELECT * FROM children WHERE id = ?', [entry.child_id]);
    const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [child.parent_profile_id]);
    const pickupRow = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryId]);

    const childPhotoUrl = await resolvePhotoUrl(child.photo_file_id);
    let pickupPhotoUrl = '';
    if (pickupRow) {
      pickupPhotoUrl = await resolvePhotoUrl(pickupRow.photo_file_id);
    } else if (parent) {
      pickupPhotoUrl = await resolvePhotoUrl(parent.photo_file_id);
    }

    const authorizedPickup = [
      {
        id: pickupRow ? pickupRow.id : parent.id,
        fullName: pickupRow ? pickupRow.full_name : parent.full_name,
        relationship: pickupRow ? pickupRow.relationship_to_child : 'Mother',
        phone: pickupRow ? pickupRow.phone_number : parent.phone_number,
        photoUrl: pickupPhotoUrl
      }
    ];

    const volunteerProfile = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ?', [req.user.id]);
    const volunteerName = volunteerProfile ? volunteerProfile.full_name : (req.user.email || 'Event Worker');

    // Handle Already Picked Up
    if (entry.status === 'picked_up' || entry.status === 'checked_out') {
      return res.json({
        success: true,
        alreadyPickedUp: true,
        child: {
          id: child.id,
          fullName: child.full_name,
          firstName: child.full_name.split(' ')[0],
          age: child.calculated_age || 0,
          gender: child.gender,
          classGroup: child.age_group || 'General',
          photoUrl: childPhotoUrl,
          entryStatus: 'checked_in',
          pickupStatus: 'picked_up',
          checkedInAt: entry.checked_in_at || entry.created_at,
          pickedUpAt: entry.picked_up_at || entry.updated_at,
          medicalNote: entry.medical_notes || '',
          allergies: entry.has_medical_notes === 1 ? 'Yes' : 'No',
          extraSupport: entry.needs_extra_support === 1 ? 'Yes' : 'No',
          authorizedPickup
        },
        pickup: {
          pickedUpAt: entry.picked_up_at || entry.updated_at,
          pickedUpBy: {
            id: entry.picked_up_by || req.user.id,
            fullName: volunteerName
          }
        }
      });
    }

    // Ensure checked in
    if (entry.status !== 'checked_in' && entry.status !== 'inside') {
      return res.json({
        success: false,
        code: 'NOT_CHECKED_IN',
        message: 'This child has not been checked in yet.'
      });
    }

    res.json({
      success: true,
      child: {
        id: child.id,
        fullName: child.full_name,
        firstName: child.full_name.split(' ')[0],
        age: child.calculated_age || 0,
        gender: child.gender,
        classGroup: child.age_group || 'General',
        photoUrl: childPhotoUrl,
        entryStatus: 'checked_in',
        pickupStatus: 'not_picked_up',
        checkedInAt: entry.checked_in_at || entry.updated_at,
        pickedUpAt: null,
        medicalNote: entry.medical_notes || '',
        allergies: entry.has_medical_notes === 1 ? 'Yes' : 'No',
        extraSupport: entry.needs_extra_support === 1 ? 'Yes' : 'No',
        authorizedPickup
      }
    });
  } catch (err) {
    console.error('Pickup lookup error:', err);
    res.status(500).json({ success: false, error: 'Internal server error performing pickup lookup' });
  }
});

// POST /api/volunteer/pickup/mark
router.post('/pickup/mark', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    if (req.volunteerProfile && req.volunteerProfile.status === 'pending_review') {
      return res.status(403).json({ error: 'Access denied: Your volunteer access is under review.' });
    }

    const { childId, passCode, pickupPersonId } = req.body;
    let entryId = null;

    if (childId) {
      const entryRow = await queryOne('SELECT id FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
      if (entryRow) {
        entryId = entryRow.id;
      }
    }

    if (!entryId && passCode) {
      let cleanRef = passCode.toString().trim().toUpperCase();
      if (cleanRef.startsWith('PASS-')) {
        cleanRef = cleanRef.replace('PASS-', 'KOI-2026-');
      } else if (!cleanRef.startsWith('KOI-2026-') && cleanRef.length === 6) {
        cleanRef = `KOI-2026-${cleanRef}`;
      }
      const passRow = await queryOne('SELECT child_event_entry_id, status FROM event_passes WHERE pass_reference = ? OR id = ?', [cleanRef, passCode]);
      if (passRow) {
        if (passRow.status === 'revoked' || passRow.status === 'inactive') {
          return res.status(400).json({ error: 'This pass has been revoked. Review reopened.' });
        }
        entryId = passRow.child_event_entry_id;
      }
    }

    if (!entryId) {
      return res.status(404).json({ error: 'Child event entry not found for the provided details' });
    }

    const entry = await queryOne('SELECT * FROM child_event_entries WHERE id = ?', [entryId]);
    if (!entry) {
      return res.status(404).json({ error: 'Event registration entry not found' });
    }

    const child = await queryOne('SELECT * FROM children WHERE id = ?', [entry.child_id]);
    const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [child.parent_profile_id]);
    const pickupRow = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryId]);

    const childPhotoUrl = await resolvePhotoUrl(child.photo_file_id);
    let pickupPhotoUrl = '';
    if (pickupRow) {
      pickupPhotoUrl = await resolvePhotoUrl(pickupRow.photo_file_id);
    } else if (parent) {
      pickupPhotoUrl = await resolvePhotoUrl(parent.photo_file_id);
    }

    const volunteerProfile = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ?', [req.user.id]);
    const volunteerName = volunteerProfile ? volunteerProfile.full_name : (req.user.email || 'Event Worker');

    const pickupPersonDetails = {
      id: pickupRow ? pickupRow.id : parent.id,
      fullName: pickupRow ? pickupRow.full_name : parent.full_name,
      relationship: pickupRow ? (pickupRow.relationship_to_child || 'Authorized Pickup') : 'Primary Parent',
      phone: pickupRow ? pickupRow.phone_number : parent.phone_number,
      photoUrl: pickupPhotoUrl
    };

    // Handle Already Picked Up
    if (entry.status === 'picked_up' || entry.status === 'checked_out') {
      const stats = await getEventStats();
      const lastPickedUpVal = await getLastPickedUp();
      const pickedUpAtVal = entry.picked_up_at || entry.updated_at || new Date().toISOString();
      return res.json({
        success: true,
        alreadyPickedUp: true,
        message: 'This child has already been picked up.',
        child: {
          id: child.id,
          fullName: child.full_name,
          firstName: child.full_name.split(' ')[0],
          age: child.calculated_age || 0,
          classGroup: child.age_group || 'General',
          photoUrl: childPhotoUrl,
          passImageUrl: null,
          pickupStatus: 'picked_up',
          pickedUpAt: pickedUpAtVal
        },
        pickup: {
          pickedUpAt: pickedUpAtVal,
          pickedUpBy: pickupPersonDetails,
          confirmedBy: {
            id: entry.picked_up_by || req.user.id,
            fullName: volunteerName
          },
          point: 'Main exit'
        },
        stats: {
          inside: stats.checkedIn,
          pickedUp: stats.pickedUp,
          attention: stats.attention
        },
        lastPickedUp: lastPickedUpVal
      });
    }

    // Ensure they are checked in first
    if (entry.status !== 'checked_in' && entry.status !== 'inside') {
      return res.status(400).json({
        success: false,
        code: 'NOT_CHECKED_IN',
        message: 'This child has not been checked in yet.'
      });
    }

    const now = new Date().toISOString();
    await execute(`
      UPDATE child_event_entries
      SET status = 'picked_up', picked_up_at = ?, picked_up_by = ?, pickup_person_id = ?, updated_at = ?
      WHERE id = ?
    `, [now, now, req.user.id, pickupPersonId || (pickupRow ? pickupRow.id : parent.id), now, entryId]);

    const stats = await getEventStats();
    const lastPickedUpVal = await getLastPickedUp();

    res.json({
      success: true,
      message: 'Child picked up.',
      child: {
        id: child.id,
        fullName: child.full_name,
        firstName: child.full_name.split(' ')[0],
        age: child.calculated_age || 0,
        classGroup: child.age_group || 'General',
        photoUrl: childPhotoUrl,
        passImageUrl: null,
        pickupStatus: 'picked_up',
        pickedUpAt: now
      },
      pickup: {
        pickedUpAt: now,
        pickedUpBy: pickupPersonDetails,
        confirmedBy: {
          id: req.user.id,
          fullName: volunteerName
        },
        point: 'Main exit'
      },
      stats: {
        inside: stats.checkedIn,
        pickedUp: stats.pickedUp,
        attention: stats.attention
      },
      lastPickedUp: lastPickedUpVal
    });
  } catch (err) {
    console.error('Pickup mark error:', err);
    res.status(500).json({ error: 'Internal server error processing pickup mark' });
  }
});

// GET /api/volunteer/pickup-home
router.get('/pickup-home', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    if (req.volunteerProfile && req.volunteerProfile.status === 'pending_review') {
      return res.status(403).json({ error: 'Access denied: Your volunteer access is under review.' });
    }

    const stats = await getEventStats();
    const lastPickedUpVal = await getLastPickedUp();

    res.json({
      stats: {
        inside: stats.checkedIn,
        pickedUp: stats.pickedUp,
        attention: stats.attention
      },
      lastPickedUp: lastPickedUpVal
    });
  } catch (err) {
    console.error('Pickup home stats error:', err);
    res.status(500).json({ error: 'Internal server error fetching pickup stats' });
  }
});

// 9. GET RECENT CHECK-IN HISTORY
router.get('/check-in-history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role === 'parent' && !req.volunteerProfile)) {
      return res.status(403).json({ error: 'Access denied: Volunteer/Staff role required' });
    }

    if (req.volunteerProfile && req.volunteerProfile.status === 'pending_review') {
      return res.status(403).json({ error: 'Access denied: Your volunteer access is under review.' });
    }

    const rows = await query(`
      SELECT c.id as child_id, c.full_name as child_name, c.age_group, c.photo_file_id as child_photo_id,
             e.status as entry_status, e.updated_at
      FROM child_event_entries e
      JOIN children c ON e.child_id = c.id
      WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside', 'picked_up', 'checked_out')
      ORDER BY e.updated_at DESC
      LIMIT 20
    `, [REAL_EVENT_ID]);

    const results = [];
    for (const r of rows) {
      let childPhotoUrl = '';
      if (r.child_photo_id) {
        if (r.child_photo_id.startsWith('http') || r.child_photo_id.startsWith('/')) {
          childPhotoUrl = r.child_photo_id;
        } else {
          const media = await queryOne('SELECT secure_url, file_url FROM media_files WHERE id = ?', [r.child_photo_id]);
          childPhotoUrl = media ? (media.secure_url || media.file_url || `/api/media/files/${r.child_photo_id}`) : `/api/media/files/${r.child_photo_id}`;
        }
      }

      results.push({
        childId: r.child_id,
        childName: r.child_name,
        ageGroup: r.age_group,
        photoUrl: childPhotoUrl,
        status: r.entry_status,
        timestamp: r.updated_at
      });
    }

    res.json(results);
  } catch (err) {
    console.error('Check-in history error:', err);
    res.status(500).json({ error: 'Internal server error fetching check-in history' });
  }
});

// GET /api/volunteer/children
router.get('/children', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.user.email_verified) {
      return res.status(403).json({ error: 'Email must be verified to access this resource' });
    }
    if (!req.volunteerProfile) {
      return res.status(403).json({ error: 'Access denied: Volunteer profile required' });
    }
    if (req.volunteerProfile.status !== 'active' && req.volunteerProfile.status !== 'approved') {
      return res.status(403).json({ error: 'Access denied: Volunteer access must be active' });
    }

    const status = (req.query.status || 'all').toString().toLowerCase();
    const q = (req.query.q || '').toString().trim();
    const limit = parseInt((req.query.limit || '50').toString(), 10) || 50;

    let sql = `
      SELECT c.id as child_id, c.full_name as child_name, c.date_of_birth, c.gender, c.calculated_age, c.age_group, c.photo_file_id as child_photo_id,
             p.full_name as parent_name, p.phone_number as parent_phone, p.whatsapp_number as parent_whatsapp,
             e.id as entry_id, e.status as entry_status, e.school_class, e.school_name, e.has_medical_notes, e.medical_notes, e.needs_extra_support, e.support_notes
      FROM children c
      JOIN parent_profiles p ON c.parent_profile_id = p.id
      LEFT JOIN child_event_entries e ON c.id = e.child_id AND e.event_id = ?
      WHERE 1=1
    `;
    const params: any[] = [REAL_EVENT_ID];

    if (q) {
      sql += ` AND (c.full_name LIKE ? OR p.full_name LIKE ? OR p.phone_number LIKE ?)`;
      const likeParam = `%${q}%`;
      params.push(likeParam, likeParam, likeParam);
    }

    if (status === 'inside') {
      sql += ` AND e.status IN ('checked_in', 'inside')`;
    } else if (status === 'picked_up') {
      sql += ` AND e.status IN ('picked_up', 'checked_out')`;
    } else if (status === 'not_arrived') {
      sql += ` AND (e.status IS NULL OR e.status NOT IN ('checked_in', 'inside', 'picked_up', 'checked_out'))`;
    } else if (status === 'attention') {
      sql += ` AND (e.needs_extra_support = 1 OR e.has_medical_notes = 1 OR e.status = 'under_review')`;
    }

    sql += ` ORDER BY c.full_name ASC LIMIT ?`;
    params.push(limit);

    const rows = await query(sql, params);

    const results = [];
    for (const r of rows) {
      const childPhotoUrl = await resolvePhotoUrl(r.child_photo_id);
      
      let pickup = null;
      if (r.entry_id) {
        const pickupRow = await queryOne('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [r.entry_id]);
        if (pickupRow) {
          const pickupPhotoUrl = await resolvePhotoUrl(pickupRow.photo_file_id);
          pickup = {
            id: pickupRow.id,
            fullName: pickupRow.full_name,
            relationship: pickupRow.relationship_to_child,
            phone: pickupRow.phone_number,
            whatsapp: pickupRow.whatsapp_number,
            photoUrl: pickupPhotoUrl
          };
        }
      }

      // Get associated pass reference
      let passReference = null;
      if (r.entry_id) {
        const passRow = await queryOne('SELECT pass_reference FROM event_passes WHERE child_event_entry_id = ?', [r.entry_id]);
        if (passRow) {
          passReference = passRow.pass_reference;
        }
      }

      results.push({
        childId: r.child_id,
        childName: r.child_name,
        ageGroup: r.age_group,
        gender: r.gender,
        age: r.calculated_age || 0,
        photoUrl: childPhotoUrl,
        parentName: r.parent_name,
        parentPhone: r.parent_phone,
        parentWhatsapp: r.parent_whatsapp,
        entryStatus: r.entry_status || 'not_arrived',
        schoolClass: r.school_class,
        schoolName: r.school_name,
        hasMedicalNotes: r.has_medical_notes === 1,
        medicalNotes: r.medical_notes,
        needsExtraSupport: r.needs_extra_support === 1,
        supportNotes: r.support_notes,
        passReference,
        pickup
      });
    }

    res.json(results);
  } catch (err) {
    console.error('Fetch children error:', err);
    res.status(500).json({ error: 'Internal server error fetching children list' });
  }
});

// GET /api/volunteer/children/:childId
router.get('/children/:childId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.user.email_verified) {
      return res.status(403).json({ error: 'Email must be verified to access this resource' });
    }
    if (!req.volunteerProfile) {
      return res.status(403).json({ error: 'Access denied: Volunteer profile required' });
    }
    if (req.volunteerProfile.status !== 'active' && req.volunteerProfile.status !== 'approved') {
      return res.status(403).json({ error: 'Access denied: Volunteer access must be active' });
    }

    const { childId } = req.params;

    const child = await queryOne('SELECT * FROM children WHERE id = ?', [childId]);
    if (!child) {
      return res.status(404).json({ error: 'Child not found' });
    }

    const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [child.parent_profile_id]);
    if (!parent) {
      return res.status(404).json({ error: 'Parent profile not found' });
    }

    // Get child event entry
    const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);

    const childPhotoUrl = await resolvePhotoUrl(child.photo_file_id);
    const parentPhotoUrl = parent ? await resolvePhotoUrl(parent.photo_file_id) : '';

    // Get pickup people
    const pickupPeople: any[] = [];
    const entryId = entry ? entry.id : null;

    // Map entryStatus to user-friendly UI values matching the spec: "inside" | "not_arrived" | "picked_up" | "needs_attention"
    let statusLabel: 'inside' | 'not_arrived' | 'picked_up' | 'needs_attention' = 'not_arrived';
    if (entry) {
      if (entry.needs_extra_support === 1 || entry.has_medical_notes === 1 || entry.status === 'under_review') {
        statusLabel = 'needs_attention';
      } else if (entry.status === 'checked_in' || entry.status === 'inside') {
        statusLabel = 'inside';
      } else if (entry.status === 'picked_up' || entry.status === 'checked_out') {
        statusLabel = 'picked_up';
      } else {
        statusLabel = 'not_arrived';
      }
    }

    if (entryId) {
      const rows = await query('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entryId]);
      for (const r of rows) {
        const photoUrl = await resolvePhotoUrl(r.photo_file_id);
        pickupPeople.push({
          id: r.id,
          fullName: r.full_name,
          relationship: r.relationship_to_child,
          phone: r.phone_number,
          photoUrl: photoUrl,
          isPrimary: r.pickup_type === 'primary',
          label: r.pickup_type === 'primary' ? 'Primary' : 'Alternative'
        });
      }
    }

    // Resolve checked in by / picked up by names
    let checkedInByDetail = null;
    if (entry && entry.checked_in_by) {
      const volunteer = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ? OR id = ?', [entry.checked_in_by, entry.checked_in_by]);
      checkedInByDetail = {
        id: entry.checked_in_by,
        fullName: volunteer ? volunteer.full_name : 'Event Staff'
      };
    }

    const todayActivity = {
      checkedInAt: entry ? entry.checked_in_at : null,
      checkedInBy: checkedInByDetail,
      pickedUpAt: entry ? entry.picked_up_at : null,
      pickedUpBy: null as any,
      pickupPerson: null as any
    };

    if (entry && entry.picked_up_by) {
      const volunteer = await queryOne('SELECT full_name FROM volunteer_profiles WHERE user_id = ? OR id = ?', [entry.picked_up_by, entry.picked_up_by]);
      todayActivity.pickedUpBy = {
        id: entry.picked_up_by,
        fullName: volunteer ? volunteer.full_name : 'Event Staff'
      };
    }

    if (entry && entry.pickup_person_id) {
      const pickupRow = await queryOne('SELECT full_name, relationship_to_child FROM pickup_people WHERE id = ?', [entry.pickup_person_id]);
      if (pickupRow) {
        todayActivity.pickupPerson = {
          id: entry.pickup_person_id,
          fullName: pickupRow.full_name,
          relationship: pickupRow.relationship_to_child
        };
      } else {
        todayActivity.pickupPerson = {
          id: parent.id,
          fullName: parent.full_name,
          relationship: 'Parent'
        };
      }
    }

    const event = await queryOne('SELECT * FROM events WHERE id = ?', [REAL_EVENT_ID]);

    res.json({
      success: true,
      child: {
        id: child.id,
        fullName: child.full_name,
        firstName: child.full_name.split(' ')[0],
        age: child.calculated_age || 0,
        gender: child.gender,
        classGroup: entry ? (entry.school_class || child.age_group) : child.age_group,
        photoUrl: childPhotoUrl,
        status: statusLabel,
        checkedInAt: entry ? entry.checked_in_at : null,
        checkedInBy: checkedInByDetail,
        pickedUpAt: entry ? entry.picked_up_at : null,
        pickedUpBy: todayActivity.pickedUpBy,
        medicalNote: entry ? entry.medical_notes : null,
        allergies: null,
        extraSupport: entry ? entry.support_notes : null
      },
      parent: {
        id: parent.id,
        fullName: parent.full_name,
        relationship: 'Mother',
        phone: parent.phone_number,
        photoUrl: parentPhotoUrl
      },
      pickupPeople: pickupPeople,
      event: {
        name: event ? (event.theme || 'More Than Conquerors') : 'The General Assembly',
        section: event ? (event.title || 'Children and Teens') : 'Children and Teens',
        dateLabel: event ? `${event.starts_at} to ${event.ends_at}` : '18th to 22nd November 2026',
        timeLabel: event ? `${event.daily_start_time} to ${event.daily_end_time}` : '9:00 AM to 7:00 PM'
      },
      todayActivity: todayActivity
    });

  } catch (err) {
    console.error('Get child details error:', err);
    res.status(500).json({ error: 'Internal server error fetching child details' });
  }
});

// POST /api/volunteer/pickup/prepare-child
router.post('/pickup/prepare-child', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.user.email_verified) {
      return res.status(403).json({ error: 'Email must be verified to access this resource' });
    }
    if (!req.volunteerProfile) {
      return res.status(403).json({ error: 'Access denied: Volunteer profile required' });
    }
    if (req.volunteerProfile.status !== 'active' && req.volunteerProfile.status !== 'approved') {
      return res.status(403).json({ error: 'Access denied: Volunteer access must be active' });
    }

    const { childId } = req.body;
    if (!childId) {
      return res.status(400).json({ error: 'Child ID is required' });
    }

    const entry = await queryOne('SELECT * FROM child_event_entries WHERE child_id = ? AND event_id = ?', [childId, REAL_EVENT_ID]);
    if (!entry) {
      return res.status(404).json({ error: 'Child registration entry not found for this event' });
    }

    if (entry.status !== 'checked_in' && entry.status !== 'inside') {
      return res.status(400).json({ error: 'Child is not checked in' });
    }

    if (entry.status === 'picked_up' || entry.status === 'checked_out') {
      return res.status(400).json({ error: 'Child has already been picked up' });
    }

    // Get pickup people
    const pickupPeople = await query('SELECT * FROM pickup_people WHERE child_event_entry_id = ?', [entry.id]);
    const parent = await queryOne('SELECT * FROM parent_profiles WHERE id = ?', [
      (await queryOne('SELECT parent_profile_id FROM children WHERE id = ?', [childId]))?.parent_profile_id
    ]);

    if (pickupPeople.length === 0 && !parent) {
      return res.status(400).json({ error: 'Child does not have any authorized pickup person' });
    }

    // Return the same payload structure as lookupPass
    const childRow = await queryOne('SELECT * FROM children WHERE id = ?', [childId]);
    const childPhotoUrl = await resolvePhotoUrl(childRow.photo_file_id);
    const parentPhotoUrl = parent ? await resolvePhotoUrl(parent.photo_file_id) : '';

    let pickup = null;
    const pickupRow = pickupPeople[0];
    if (pickupRow) {
      const pickupPhotoUrl = await resolvePhotoUrl(pickupRow.photo_file_id);
      pickup = {
        id: pickupRow.id,
        fullName: pickupRow.full_name,
        relationship: pickupRow.relationship_to_child,
        phone: pickupRow.phone_number,
        whatsapp: pickupRow.whatsapp_number,
        photoUrl: pickupPhotoUrl
      };
    } else if (parent) {
      pickup = {
        id: parent.id,
        fullName: parent.full_name,
        relationship: 'Primary Parent',
        phone: parent.phone_number,
        whatsapp: parent.whatsapp_number,
        photoUrl: parentPhotoUrl
      };
    }

    // Get associated pass reference
    const passRow = await queryOne('SELECT pass_reference FROM event_passes WHERE child_event_entry_id = ?', [entry.id]);
    const passReference = passRow ? passRow.pass_reference : null;

    res.json({
      success: true,
      child: {
        id: childRow.id,
        fullName: childRow.full_name,
        photoUrl: childPhotoUrl,
        ageGroup: childRow.age_group,
        dateOfBirth: childRow.date_of_birth,
        gender: childRow.gender,
        parentName: parent ? parent.full_name : '',
        parentPhone: parent ? parent.phone_number : '',
        parentWhatsapp: parent ? parent.whatsapp_number : '',
        schoolClass: entry.school_class,
        schoolName: entry.school_name,
        hasMedicalNotes: entry.has_medical_notes === 1,
        medicalNotes: entry.medical_notes,
        needsExtraSupport: entry.needs_extra_support === 1,
        supportNotes: entry.support_notes,
        entryId: entry.id,
        entryStatus: entry.status,
        passReference: passReference,
        pickup
      }
    });

  } catch (err) {
    console.error('Prepare pickup error:', err);
    res.status(500).json({ error: 'Internal server error preparing pickup' });
  }
});

// GET /api/volunteer/reports
router.get('/reports', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.user.email_verified) {
      return res.status(403).json({ error: 'Email must be verified to access reports' });
    }
    if (!req.volunteerProfile) {
      return res.status(403).json({ error: 'Access denied: Volunteer profile required' });
    }
    if (req.volunteerProfile.status !== 'active' && req.volunteerProfile.status !== 'approved') {
      return res.status(403).json({ error: 'Access denied: Volunteer access must be active to view reports' });
    }

    const stats = await getEventStats();

    // Age groups
    const ageGroupRows = await query(`
      SELECT 
        COALESCE(NULLIF(c.age_group, ''), 'Unassigned') as "ageGroup",
        COUNT(e.id) as expected,
        SUM(CASE WHEN e.status IN ('checked_in', 'inside') THEN 1 ELSE 0 END) as "checkedIn",
        SUM(CASE WHEN e.status IN ('picked_up', 'checked_out') THEN 1 ELSE 0 END) as "pickedUp"
      FROM child_event_entries e
      JOIN children c ON e.child_id = c.id
      WHERE e.event_id = ?
      GROUP BY COALESCE(NULLIF(c.age_group, ''), 'Unassigned')
    `, [REAL_EVENT_ID]);

    const standardGroups = ['Creche', 'Preschool', 'Ages 4-6', 'Ages 7-9', 'Teens'];
    const ageGroupsMap = new Map();
    for (const row of ageGroupRows) {
      ageGroupsMap.set(row.ageGroup, {
        ageGroup: row.ageGroup,
        expected: Number(row.expected || 0),
        checkedIn: Number(row.checkedIn || 0),
        pickedUp: Number(row.pickedUp || 0)
      });
    }

    for (const group of standardGroups) {
      if (!ageGroupsMap.has(group)) {
        ageGroupsMap.set(group, {
          ageGroup: group,
          expected: 0,
          checkedIn: 0,
          pickedUp: 0
        });
      }
    }

    const ageGroups = Array.from(ageGroupsMap.values());

    // Recent entries logs
    const recentEntries = await query(`
      SELECT 
        e.id,
        c.full_name as "childName",
        e.checked_in_at as "checkedInAt",
        COALESCE(vp.full_name, u.email, 'Event Worker') as "volunteerName"
      FROM child_event_entries e
      JOIN children c ON e.child_id = c.id
      LEFT JOIN users u ON e.checked_in_by = u.id
      LEFT JOIN volunteer_profiles vp ON u.id = vp.user_id
      WHERE e.event_id = ? AND e.status IN ('checked_in', 'inside', 'picked_up', 'checked_out') AND e.checked_in_at IS NOT NULL
      ORDER BY e.checked_in_at DESC
      LIMIT 10
    `, [REAL_EVENT_ID]);

    // Recent pickups logs
    const recentPickups = await query(`
      SELECT 
        e.id,
        c.full_name as "childName",
        e.picked_up_at as "pickedUpAt",
        COALESCE(vp.full_name, u.email, 'Event Worker') as "volunteerName",
        COALESCE(pp.full_name, parent.full_name, 'Authorized Person') as "pickupPersonName",
        COALESCE(pp.relationship_to_child, 'Primary Parent') as relationship
      FROM child_event_entries e
      JOIN children c ON e.child_id = c.id
      LEFT JOIN parent_profiles parent ON c.parent_profile_id = parent.id
      LEFT JOIN users u ON e.picked_up_by = u.id
      LEFT JOIN volunteer_profiles vp ON u.id = vp.user_id
      LEFT JOIN pickup_people pp ON e.pickup_person_id = pp.id OR (pp.child_event_entry_id = e.id AND e.pickup_person_id IS NULL)
      WHERE e.event_id = ? AND e.status IN ('picked_up', 'checked_out') AND e.picked_up_at IS NOT NULL
      ORDER BY e.picked_up_at DESC
      LIMIT 10
    `, [REAL_EVENT_ID]);

    // Needs attention details
    const missingPhotos = await query(`
      SELECT 
        child_event_entries.id,
        children.full_name as "childName",
        'Missing pickup photo' as "issueType",
        'RESOLVE' as "actionText"
      FROM child_event_entries
      JOIN children ON child_event_entries.child_id = children.id
      JOIN pickup_people ON pickup_people.child_event_entry_id = child_event_entries.id
      WHERE child_event_entries.status IN ('pass_ready', 'checked_in', 'inside')
        AND (pickup_people.photo_file_id IS NULL OR pickup_people.photo_file_id = '')
      LIMIT 5
    `);

    const medicalReviews = await query(`
      SELECT 
        child_event_entries.id,
        children.full_name as "childName",
        'Medical alert' as "issueType",
        'REVIEW' as "actionText"
      FROM child_event_entries
      JOIN children ON child_event_entries.child_id = children.id
      WHERE child_event_entries.status IN ('under_review', 'pass_ready', 'checked_in', 'inside')
        AND child_event_entries.has_medical_notes = 1
        AND child_event_entries.medical_notes IS NOT NULL
        AND child_event_entries.medical_notes != ''
      LIMIT 5
    `);

    const ageReviews = await query(`
      SELECT 
        child_event_entries.id,
        children.full_name as "childName",
        'Needs age group review' as "issueType",
        'RECLASSIFY' as "actionText"
      FROM children
      JOIN child_event_entries ON children.id = child_event_entries.child_id
      WHERE children.needs_age_review = 1 AND child_event_entries.event_id = ?
      LIMIT 5
    `, [REAL_EVENT_ID]);

    const needsAttention = [...missingPhotos, ...medicalReviews, ...ageReviews];

    // Get latest final event report notes
    const latestReport = await queryOne(`
      SELECT r.report_notes as notes, r.created_at as "submittedAt", vp.full_name as "submittedBy"
      FROM volunteer_event_reports r
      JOIN volunteer_profiles vp ON r.volunteer_profile_id = vp.id
      WHERE r.event_id = ?
      ORDER BY r.created_at DESC
      LIMIT 1
    `, [REAL_EVENT_ID]);

    res.json({
      success: true,
      stats,
      ageGroups,
      recentEntries,
      recentPickups,
      needsAttention,
      finalReport: latestReport || null
    });

  } catch (err) {
    console.error('Get reports error:', err);
    res.status(500).json({ error: 'Internal server error fetching reports' });
  }
});

// POST /api/volunteer/reports/submit
router.post('/reports/submit', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.user.email_verified) {
      return res.status(403).json({ error: 'Email must be verified to submit reports' });
    }
    if (!req.volunteerProfile) {
      return res.status(403).json({ error: 'Access denied: Volunteer profile required' });
    }
    if (req.volunteerProfile.status !== 'active' && req.volunteerProfile.status !== 'approved') {
      return res.status(403).json({ error: 'Access denied: Volunteer access must be active' });
    }

    const { notes } = req.body;
    if (!notes || !notes.trim()) {
      return res.status(400).json({ error: 'Report notes are required' });
    }

    const id = 'rep-' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO volunteer_event_reports (id, event_id, volunteer_profile_id, report_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, REAL_EVENT_ID, req.volunteerProfile.id, notes.trim(), now, now]);

    res.json({
      success: true,
      message: 'Final Event Report submitted successfully.',
      report: {
        id,
        notes: notes.trim(),
        submittedAt: now,
        submittedBy: req.volunteerProfile.full_name
      }
    });

  } catch (err) {
    console.error('Submit report error:', err);
    res.status(500).json({ error: 'Internal server error submitting report' });
  }
});

export default router;
