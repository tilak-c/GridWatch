import { Router, Request, Response } from 'express';
import { ingestReadings } from '../services/ingestService';

const router = Router();

/**
 * POST /api/ingest
 * Accept a batch of sensor readings (up to 1000 per request).
 * Responds in <200ms — readings are durably stored, then processed async.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { readings } = req.body;

    if (!readings || !Array.isArray(readings) || readings.length === 0) {
      res.status(400).json({ error: 'Request body must contain a non-empty "readings" array' });
      return;
    }

    if (readings.length > 1000) {
      res.status(400).json({ error: 'Maximum 1000 readings per request' });
      return;
    }

    // Validate reading shape (lightweight — full validation is downstream)
    for (let i = 0; i < readings.length; i++) {
      const r = readings[i];
      if (!r.sensor_id || !r.timestamp) {
        res.status(400).json({
          error: `Invalid reading at index ${i}: sensor_id and timestamp are required`,
        });
        return;
      }
    }

    const result = await ingestReadings(readings);

    res.status(202).json({
      success: true,
      message: `Ingested ${result.inserted} readings. Processing queued.`,
      inserted: result.inserted,
      unknown_sensors: result.unknown.length > 0 ? result.unknown : undefined,
    });
  } catch (err) {
    console.error('Ingest error:', err);
    res.status(500).json({ error: 'Failed to ingest readings' });
  }
});

export default router;
