import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { queryOne } from './db';

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

  const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [userId]);
  const volProfile = await queryOne('SELECT * FROM volunteer_profiles WHERE user_id = ?', [userId]);

  req.user = user;
  req.parentProfile = profile || undefined;
  req.volunteerProfile = volProfile || undefined;
  next();
}
