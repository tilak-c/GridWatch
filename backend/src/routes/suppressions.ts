import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { zoneGuard } from '../middleware/zoneGuard';
import { createSuppression, getSuppressions, deleteSuppression } from '../services/suppressionService';
import { queryString, paramString } from '../utils/params';

const router = Router();
router.use(zoneGuard);

/**
 * POST /api/suppressions
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sensor_id, start_time, end_time, reason } = req.body;

    if (!sensor_id || !start_time || !end_time) {
      res.status(400).json({ error: 'sensor_id, start_time, and end_time are required' });
      return;
    }

    if (new Date(end_time) <= new Date(start_time)) {
      res.status(400).json({ error: 'end_time must be after start_time' });
      return;
    }

    const zoneIds: number[] = (req as any).zoneIds;
    const zonePlaceholders = zoneIds.map((_, i) => `$${i + 2}`).join(', ');
    const accessCheck = await pool.query(
      `SELECT 1 FROM sensors WHERE id = $1 AND zone_id IN (${zonePlaceholders})`,
      [sensor_id, ...zoneIds]
    );
    if (accessCheck.rows.length === 0) {
      res.status(404).json({ error: 'Sensor not found or not in your zone' });
      return;
    }

    const suppression = await createSuppression(
      sensor_id, start_time, end_time, reason || null, req.user!.id
    );

    res.status(201).json({ data: suppression });
  } catch (err) {
    console.error('Create suppression error:', err);
    res.status(500).json({ error: 'Failed to create suppression' });
  }
});

/**
 * GET /api/suppressions?sensor_id=...&active=true
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sensorIdStr = queryString(req.query.sensor_id);
    const sensorId = sensorIdStr ? parseInt(sensorIdStr) : NaN;
    const activeOnly = queryString(req.query.active) === 'true';

    if (!sensorId || isNaN(sensorId)) {
      res.status(400).json({ error: 'sensor_id query param is required' });
      return;
    }

    const zoneIds: number[] = (req as any).zoneIds;
    const zonePlaceholders = zoneIds.map((_, i) => `$${i + 2}`).join(', ');
    const accessCheck = await pool.query(
      `SELECT 1 FROM sensors WHERE id = $1 AND zone_id IN (${zonePlaceholders})`,
      [sensorId, ...zoneIds]
    );
    if (accessCheck.rows.length === 0) {
      res.status(404).json({ error: 'Sensor not found or not in your zone' });
      return;
    }

    const suppressions = await getSuppressions(sensorId, activeOnly);
    res.json({ data: suppressions });
  } catch (err) {
    console.error('Get suppressions error:', err);
    res.status(500).json({ error: 'Failed to fetch suppressions' });
  }
});

/**
 * DELETE /api/suppressions/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(paramString(req.params.id));
    const deleted = await deleteSuppression(id);

    if (!deleted) {
      res.status(404).json({ error: 'Suppression not found' });
      return;
    }
    res.json({ message: 'Suppression cancelled' });
  } catch (err) {
    console.error('Delete suppression error:', err);
    res.status(500).json({ error: 'Failed to delete suppression' });
  }
});

export default router;
