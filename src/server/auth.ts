import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { query, queryOne, execute } from './db';

const SECRET_KEY = process.env.JWT_SECRET || 'koinonia-secret-key-default-2026';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    email_verified?: number;
  };
  parentProfile?: {
    id: string;
    user_id: string;
    full_name: string;
    phone_number: string;
    whatsapp_number: string;
    email: string;
    home_address: string;
    preferred_contact: string;
    is_koinonia_worker: number;
    department: string;
    photo_file_id: string;
    profile_completed_at: string | null;
  };
  volunteerProfile?: {
    id: string;
    user_id: string;
    photo_file_id: string | null;
    full_name: string;
    phone: string;
    whatsapp: string;
    is_koinonia_worker: number;
    department: string | null;
    preferred_team: string;
    serving_experience: number;
    note: string | null;
    status: string;
    approved_by_user_id: string | null;
    approved_at: string | null;
    whatsapp_consent_status?: string | null;
    whatsapp_consent_at?: string | null;
    whatsapp_opt_out_at?: string | null;
    whatsapp_consent_source?: string | null;
    created_at: string;
    updated_at: string;
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  try {
    const [salt, key] = hash.split(':');
    if (!salt || !key) return false;
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derivedKey, 'hex'));
  } catch {
    return false;
  }
}

export function generateToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyToken(token: string): string | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('base64url');
    if (sig !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > data.exp) return null;
    return data.userId;
  } catch {
    return null;
  }
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  if (!token && req.query && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Support automated/job scheduler requests protected by JOB_SECRET
  const jobSecret = process.env.JOB_SECRET || 'job-secret-default-2026';
  if (token === jobSecret) {
    req.user = {
      id: 'system-job',
      email: 'job-scheduler@koinonia.org',
      role: 'admin',
      email_verified: 1
    };
    return next();
  }

  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = await queryOne('SELECT id, email, role, email_verified, status FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (user.status === 'suspended' || user.status === 'revoked') {
    return res.status(403).json({ error: 'Access Denied: Your account has been suspended or revoked.' });
  }

  const profile = await resolveParentProfileForUser(userId, user.email);
  const volProfile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [userId]);

  req.user = user;
  req.parentProfile = profile || undefined;
  req.volunteerProfile = volProfile || undefined;
  next();
}

export async function resolveParentProfileForUser(userId: string, userEmail?: string): Promise<any | null> {
  // 1. Direct ownership: profiles explicitly linked to this authenticated user
  const directProfiles = await query(
    'SELECT * FROM parent_profiles WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC',
    [userId]
  );

  if (directProfiles && directProfiles.length > 0) {
    if (directProfiles.length === 1) {
      return directProfiles[0];
    }
    // Duplicate profiles for the SAME authenticated parent (all have user_id = userId).
    // Safely pick the primary one: prefer profile with active children, then most recently updated.
    for (const dp of directProfiles) {
      const childCountRow = await queryOne(
        'SELECT COUNT(*) as count FROM children WHERE parent_profile_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)',
        [dp.id]
      );
      if (parseInt(childCountRow?.count || '0', 10) > 0) {
        return dp;
      }
    }
    return directProfiles[0];
  }

  // 2. Unlinked legacy profile fallback:
  // Only if no profile is directly linked to this user_id yet, and user has an email.
  const normalizedEmail = (userEmail || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  // Check if any profile with this email is already owned by ANOTHER user — MUST NEVER claim or expose
  const otherUserClaimed = await queryOne(
    'SELECT id FROM parent_profiles WHERE LOWER(TRIM(email)) = ? AND user_id IS NOT NULL AND user_id != ? LIMIT 1',
    [normalizedEmail, userId]
  );
  if (otherUserClaimed) {
    // Another user account owns this profile — FAIL CLOSED
    return null;
  }

  // Exact, normalized email match on unlinked legacy profiles ONLY (user_id IS NULL)
  const matchingUnlinked = await query(
    'SELECT * FROM parent_profiles WHERE LOWER(TRIM(email)) = ? AND user_id IS NULL ORDER BY created_at ASC',
    [normalizedEmail]
  );

  if (!matchingUnlinked || matchingUnlinked.length === 0) {
    return null;
  }

  if (matchingUnlinked.length === 1) {
    const legacyProfile = matchingUnlinked[0];
    // Atomically claim the unlinked profile for this authenticated user
    await execute(
      'UPDATE parent_profiles SET user_id = ?, updated_at = ? WHERE id = ? AND user_id IS NULL',
      [userId, new Date().toISOString(), legacyProfile.id]
    );
    legacyProfile.user_id = userId;
    return legacyProfile;
  }

  // Multiple unlinked profiles with the same email -> AMBIGUOUS MATCH -> FAIL CLOSED
  return null;
}

export async function optionalAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  if (!token && req.query && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return next();
  }

  const userId = verifyToken(token);
  if (!userId) {
    return next();
  }

  const user = await queryOne('SELECT id, email, role, email_verified, status FROM users WHERE id = ?', [userId]);
  if (!user || user.status === 'suspended' || user.status === 'revoked') {
    return next();
  }

  const profile = await resolveParentProfileForUser(userId, user.email);
  const volProfile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [userId]);

  req.user = user;
  req.parentProfile = profile || undefined;
  req.volunteerProfile = volProfile || undefined;
  next();
}
