import { pool } from '../config/database';
import { anomalyQueue } from '../config/queue';
import { IngestReading } from '../types';

// In-memory cache: external sensor_id → { id, zone_id }
const sensorCache = new Map<string, { id: number; zone_id: number }>();

async function resolveSensor(externalId: string): Promise<{ id: number; zone_id: number } | null> {
  if (sensorCache.has(externalId)) {
    return sensorCache.get(externalId)!;
  }

  const result = await pool.query(
    'SELECT id, zone_id FROM sensors WHERE sensor_id = $1',
    [externalId]
  );

  if (result.rows.length === 0) return null;

  const sensor = { id: result.rows[0].id, zone_id: result.rows[0].zone_id };
  sensorCache.set(externalId, sensor);
  return sensor;
}

// Pre-warm the sensor cache on first use
let cacheWarmed = false;
async function warmSensorCache(): Promise<void> {
  if (cacheWarmed) return;
  const result = await pool.query('SELECT id, sensor_id, zone_id FROM sensors');
  for (const row of result.rows) {
    sensorCache.set(row.sensor_id, { id: row.id, zone_id: row.zone_id });
  }
  cacheWarmed = true;
  console.log(`✓ Sensor cache warmed: ${sensorCache.size} sensors`);
}

/**
 * Ingest a batch of sensor readings.
 * 1. Durably stores all readings (sync — within the 200ms requirement)
 * 2. Enqueues async BullMQ job for anomaly processing
 *
 * Readings with unknown sensor_ids are tracked and returned for visibility.
 */
export async function ingestReadings(
  readings: IngestReading[]
): Promise<{ inserted: number; unknown: string[]; readingIds: number[] }> {
  await warmSensorCache();

  const unknown: string[] = [];
  const validReadings: { sensorId: number; zoneId: number; reading: IngestReading }[] = [];

  // Resolve all sensor IDs
  for (const reading of readings) {
    const sensor = await resolveSensor(reading.sensor_id);
    if (!sensor) {
      unknown.push(reading.sensor_id);
      continue;
    }
    validReadings.push({ sensorId: sensor.id, zoneId: sensor.zone_id, reading });
  }

  if (validReadings.length === 0) {
    return { inserted: 0, unknown, readingIds: [] };
  }

  // Batch INSERT readings using multi-row VALUES
  // Build parameterized query for safety + performance
  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const { sensorId, reading } of validReadings) {
    placeholders.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`
    );
    values.push(
      sensorId,
      reading.timestamp,
      reading.voltage,
      reading.current,
      reading.temperature,
      reading.status_code
    );
    paramIndex += 6;
  }

  const insertSQL = `
    INSERT INTO readings (sensor_id, "timestamp", voltage, current, temperature, status_code)
    VALUES ${placeholders.join(', ')}
    RETURNING id, sensor_id
  `;

  const result = await pool.query(insertSQL, values);
  const readingIds: number[] = result.rows.map((r: any) => r.id);

  // Update last_reading_at for affected sensors (batch)
  const sensorTimestamps = new Map<number, string>();
  for (const { sensorId, reading } of validReadings) {
    const existing = sensorTimestamps.get(sensorId);
    if (!existing || reading.timestamp > existing) {
      sensorTimestamps.set(sensorId, reading.timestamp);
    }
  }

  const updatePromises = Array.from(sensorTimestamps.entries()).map(([sensorId, ts]) =>
    pool.query(
      'UPDATE sensors SET last_reading_at = GREATEST(last_reading_at, $1) WHERE id = $2',
      [ts, sensorId]
    )
  );
  await Promise.all(updatePromises);

  // Enqueue async anomaly processing — this is the key to <200ms response
  const readingData = result.rows.map((r: any, i: number) => ({
    readingId: r.id,
    sensorId: r.sensor_id,
    zoneId: validReadings[i]!.zoneId,
    voltage: validReadings[i]!.reading.voltage,
    current: validReadings[i]!.reading.current,
    temperature: validReadings[i]!.reading.temperature,
    timestamp: validReadings[i]!.reading.timestamp,
  }));

  await anomalyQueue.add('process-batch', { readings: readingData }, {
    priority: 1,
  });

  return { inserted: validReadings.length, unknown, readingIds };
}
