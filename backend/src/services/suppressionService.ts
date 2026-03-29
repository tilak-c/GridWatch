import { pool } from '../config/database';

/**
 * Create a suppression window for a sensor.
 *
 * Design decision: When a suppression is created while an alert is already open,
 * the existing alert remains open (it was legitimately created before suppression).
 * New anomalies during the suppression window are still recorded but:
 * - Marked as suppressed = true
 * - Do NOT produce alerts or notifications
 * - Do NOT trigger escalation
 */
export async function createSuppression(
  sensorId: number,
  startTime: string,
  endTime: string,
  reason: string | null,
  createdBy: number
): Promise<any> {
  const result = await pool.query(
    `INSERT INTO suppressions (sensor_id, start_time, end_time, reason, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [sensorId, startTime, endTime, reason, createdBy]
  );
  return result.rows[0];
}

/**
 * Get suppressions for a sensor, optionally filtered to active ones.
 */
export async function getSuppressions(
  sensorId: number,
  activeOnly: boolean = false
): Promise<any[]> {
  let query = `SELECT * FROM suppressions WHERE sensor_id = $1`;
  if (activeOnly) {
    query += ` AND start_time <= NOW() AND end_time >= NOW()`;
  }
  query += ` ORDER BY created_at DESC`;

  const result = await pool.query(query, [sensorId]);
  return result.rows;
}

/**
 * Check if a sensor is currently suppressed.
 */
export async function isSuppressed(sensorId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM suppressions
     WHERE sensor_id = $1 AND start_time <= NOW() AND end_time >= NOW()
     LIMIT 1`,
    [sensorId]
  );
  return result.rows.length > 0;
}

/**
 * Delete a suppression (e.g., cancel maintenance window early).
 */
export async function deleteSuppression(suppressionId: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM suppressions WHERE id = $1 RETURNING id',
    [suppressionId]
  );
  return result.rows.length > 0;
}
