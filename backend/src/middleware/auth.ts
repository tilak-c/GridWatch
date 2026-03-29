import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { AuthUser } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'gridwatch-jwt-secret-change-in-production';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = header.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/**
 * Returns zone IDs the user has access to.
 * Supervisors get ALL zone IDs; operators get only their assigned zones.
 */
export async function getUserZoneIds(user: AuthUser): Promise<number[]> {
  if (user.role === 'supervisor') {
    const result = await pool.query('SELECT id FROM zones');
    return result.rows.map((r: any) => r.id);
  }
  return user.zoneIds;
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, zoneIds: user.zoneIds },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}
