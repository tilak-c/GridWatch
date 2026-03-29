import { Request, Response, NextFunction } from 'express';
import { getUserZoneIds } from './auth';

/**
 * Zone isolation middleware.
 * Attaches `req.zoneIds` — the list of zone IDs the user can access.
 * All downstream queries MUST filter by these zone IDs.
 */
export async function zoneGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const zoneIds = await getUserZoneIds(req.user);
    // Attach resolved zone IDs to request for downstream use
    (req as any).zoneIds = zoneIds;
    next();
  } catch (err) {
    console.error('Zone guard error:', err);
    res.status(500).json({ error: 'Failed to resolve zone access' });
  }
}

/**
 * Helper to build a zone-scoped WHERE clause.
 * Returns { clause: string, params: any[] } for use in SQL queries.
 */
export function zoneWhereClause(
  zoneIds: number[],
  tableAlias: string = '',
  paramOffset: number = 1
): { clause: string; params: number[] } {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const placeholders = zoneIds.map((_, i) => `$${paramOffset + i}`).join(', ');
  return {
    clause: `${prefix}zone_id IN (${placeholders})`,
    params: zoneIds,
  };
}
