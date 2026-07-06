import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { queryOne } from './db';

const SECRET_KEY = process.env.JWT_SECRET || 'koinonia-secret-key-default-2026';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
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

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = await queryOne('SELECT id, email, role FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const profile = await queryOne('SELECT * FROM parent_profiles WHERE user_id = ?', [userId]);

  req.user = user;
  req.parentProfile = profile || undefined;
  next();
}
