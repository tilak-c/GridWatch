import { Router, Request, Response } from 'express';
import { zoneGuard } from '../middleware/zoneGuard';
import { getAlerts, transitionAlert, getAlertAuditLog } from '../services/alertService';
import { queryString, paramString } from '../utils/params';

const router = Router();
router.use(zoneGuard);

/**
 * GET /api/alerts
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const zoneIds: number[] = (req as any).zoneIds;
    const page = parseInt(queryString(req.query.page) || '1');
    const limit = Math.min(parseInt(queryString(req.query.limit) || '20'), 100);
    const status = queryString(req.query.status);
    const severity = queryString(req.query.severity);
    const sensorIdStr = queryString(req.query.sensor_id);
    const sensorId = sensorIdStr ? parseInt(sensorIdStr) : undefined;

    const result = await getAlerts(zoneIds, { status, severity, sensorId }, page, limit);

    res.json({
      data: result.alerts,
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    });
  } catch (err) {
    console.error('Get alerts error:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * PATCH /api/alerts/:id/transition
 */
router.patch('/:id/transition', async (req: Request, res: Response) => {
  try {
    const alertId = parseInt(paramString(req.params.id));
    const { action } = req.body;

    if (!action || !['acknowledge', 'resolve'].includes(action)) {
      res.status(400).json({ error: 'action must be "acknowledge" or "resolve"' });
      return;
    }

    const newStatus = action === 'acknowledge' ? 'acknowledged' : 'resolved';
    const alert = await transitionAlert(alertId, newStatus as any, req.user!.id);
    res.json({ alert, message: `Alert ${alertId} ${newStatus}` });
  } catch (err: any) {
    if (err.message.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else if (err.message.includes('Invalid transition')) {
      res.status(409).json({ error: err.message });
    } else {
      console.error('Transition error:', err);
      res.status(500).json({ error: 'Failed to transition alert' });
    }
  }
});

/**
 * GET /api/alerts/:id/audit
 */
router.get('/:id/audit', async (req: Request, res: Response) => {
  try {
    const alertId = parseInt(paramString(req.params.id));
    const auditLog = await getAlertAuditLog(alertId);
    res.json({ data: auditLog });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default router;
