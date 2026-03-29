import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { zoneGuard } from '../middleware/zoneGuard';
import { queryString, paramString } from '../utils/params';

const router = Router();
router.use(zoneGuard);

/**
 * GET /api/sensors
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const zoneIds: number[] = (req as any).zoneIds;
    const zonePlaceholders = zoneIds.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pool.query(
      `SELECT s.*, z.name as zone_name,
              (SELECT COUNT(*) FROM alerts a WHERE a.sensor_id = s.id AND a.status = 'open') as open_alerts
       FROM sensors s
       JOIN zones z ON z.id = s.zone_id
       WHERE s.zone_id IN (${zonePlaceholders})
       ORDER BY s.status = 'critical' DESC, s.status = 'warning' DESC, s.name ASC`,
      zoneIds
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get sensors error:', err);
    res.status(500).json({ error: 'Failed to fetch sensors' });
  }
});

/**
 * GET /api/sensors/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const sensorId = parseInt(paramString(req.params.id));
    const zoneIds: number[] = (req as any).zoneIds;

    const zonePlaceholders = zoneIds.map((_, i) => `$${i + 2}`).join(', ');
    const sensorResult = await pool.query(
      `SELECT s.*, z.name as zone_name
       FROM sensors s
       JOIN zones z ON z.id = s.zone_id
       WHERE s.id = $1 AND s.zone_id IN (${zonePlaceholders})`,
      [sensorId, ...zoneIds]
    );

    if (sensorResult.rows.length === 0) {
      res.status(404).json({ error: 'Sensor not found or not in your zone' });
      return;
    }

    const sensor = sensorResult.rows[0];

    const [readingsResult, anomaliesResult, suppressionResult, rulesResult] = await Promise.all([
      pool.query(
        `SELECT * FROM readings WHERE sensor_id = $1 ORDER BY "timestamp" DESC LIMIT 20`,
        [sensorId]
      ),
      pool.query(
        `SELECT an.*, r."timestamp" as reading_timestamp
         FROM anomalies an
         LEFT JOIN readings r ON r.id = an.reading_id
         WHERE an.sensor_id = $1 ORDER BY an.created_at DESC LIMIT 50`,
        [sensorId]
      ),
      pool.query(
        `SELECT * FROM suppressions
         WHERE sensor_id = $1 AND start_time <= NOW() AND end_time >= NOW()
         ORDER BY end_time DESC LIMIT 1`,
        [sensorId]
      ),
      pool.query('SELECT * FROM sensor_rules WHERE sensor_id = $1', [sensorId]),
    ]);

    res.json({
      sensor,
      recentReadings: readingsResult.rows,
      anomalies: anomaliesResult.rows,
      activeSuppression: suppressionResult.rows[0] || null,
      rules: rulesResult.rows,
    });
  } catch (err) {
    console.error('Get sensor detail error:', err);
    res.status(500).json({ error: 'Failed to fetch sensor details' });
  }
});

/**
 * GET /api/sensors/:id/history
 * Performance target: <300ms on 30 days of data.
 */
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const sensorId = parseInt(paramString(req.params.id));
    const zoneIds: number[] = (req as any).zoneIds;
    const from = queryString(req.query.from);
    const to = queryString(req.query.to);
    const page = parseInt(queryString(req.query.page) || '1');
    const limit = Math.min(parseInt(queryString(req.query.limit) || '100'), 500);
    const offset = (page - 1) * limit;

    if (!from || !to) {
      res.status(400).json({ error: '"from" and "to" query params are required' });
      return;
    }

    // Verify zone access
    const zonePlaceholders = zoneIds.map((_, i) => `$${i + 2}`).join(', ');
    const accessCheck = await pool.query(
      `SELECT 1 FROM sensors WHERE id = $1 AND zone_id IN (${zonePlaceholders})`,
      [sensorId, ...zoneIds]
    );
    if (accessCheck.rows.length === 0) {
      res.status(404).json({ error: 'Sensor not found or not in your zone' });
      return;
    }

    // Count + fetch in parallel for speed
    const [countResult, dataResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM readings
         WHERE sensor_id = $1 AND "timestamp" >= $2 AND "timestamp" <= $3`,
        [sensorId, from, to]
      ),
      pool.query(
        `SELECT
           r.id as reading_id, r."timestamp", r.voltage, r.current, r.temperature, r.status_code,
           COALESCE(
             json_agg(
               json_build_object(
                 'anomaly_id', an.id, 'rule_type', an.rule_type,
                 'details', an.details, 'suppressed', an.suppressed,
                 'alert_id', al.id, 'alert_status', al.status, 'alert_severity', al.severity
               )
             ) FILTER (WHERE an.id IS NOT NULL), '[]'::json
           ) as anomalies
         FROM readings r
         LEFT JOIN anomalies an ON an.reading_id = r.id
         LEFT JOIN alerts al ON al.anomaly_id = an.id
         WHERE r.sensor_id = $1 AND r."timestamp" >= $2 AND r."timestamp" <= $3
         GROUP BY r.id
         ORDER BY r."timestamp" DESC
         LIMIT $4 OFFSET $5`,
        [sensorId, from, to, limit, offset]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      data: dataResult.rows.map((row: any) => ({
        ...row,
        has_anomalies: row.anomalies.length > 0,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('History query error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;
