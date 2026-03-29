import { pool } from '../config/database';
import { AlertStatus, VALID_TRANSITIONS, SensorStatus } from '../types';
import { emitSensorStateChange, emitNewAlert, emitAlertUpdated, emitAlertEscalated } from './realtimeService';

/**
 * Check if a sensor is currently suppressed.
 */
export async function isSensorSuppressed(sensorId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM suppressions
     WHERE sensor_id = $1 AND start_time <= NOW() AND end_time >= NOW()
     LIMIT 1`,
    [sensorId]
  );
  return result.rows.length > 0;
}

/**
 * Create an anomaly record. Always created regardless of suppression.
 */
export async function createAnomaly(
  sensorId: number,
  readingId: number | null,
  ruleType: string,
  details: Record<string, any>,
  suppressed: boolean
): Promise<number> {
  const result = await pool.query(
    `INSERT INTO anomalies (sensor_id, reading_id, rule_type, details, suppressed)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [sensorId, readingId, ruleType, JSON.stringify(details), suppressed]
  );
  return result.rows[0].id;
}

/**
 * Create an alert from an anomaly. Only called when sensor is NOT suppressed.
 */
export async function createAlert(
  anomalyId: number,
  sensorId: number,
  zoneId: number,
  severity: string,
  suppressed: boolean = false
): Promise<any> {
  const result = await pool.query(
    `INSERT INTO alerts (anomaly_id, sensor_id, zone_id, severity, suppressed)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [anomalyId, sensorId, zoneId, severity, suppressed]
  );
  const alert = result.rows[0];

  // Write initial audit log entry
  await pool.query(
    `INSERT INTO alert_audit_log (alert_id, from_status, to_status, changed_by)
     VALUES ($1, NULL, 'open', NULL)`,
    [alert.id]
  );

  // Update sensor status based on severity
  const newStatus: SensorStatus = severity === 'critical' ? 'critical' : 'warning';
  await updateSensorStatus(sensorId, zoneId, newStatus);

  // Emit real-time event
  if (!suppressed) {
    emitNewAlert(zoneId, alert);
  }

  return alert;
}

/**
 * Transition an alert's status. Enforces valid state transitions.
 */
export async function transitionAlert(
  alertId: number,
  newStatus: AlertStatus,
  userId: number
): Promise<any> {
  // Get current alert
  const alertResult = await pool.query('SELECT * FROM alerts WHERE id = $1', [alertId]);
  if (alertResult.rows.length === 0) {
    throw new Error('Alert not found');
  }

  const alert = alertResult.rows[0];
  const currentStatus = alert.status as AlertStatus;

  // Validate transition
  const validNextStates = VALID_TRANSITIONS[currentStatus];
  if (!validNextStates || !validNextStates.includes(newStatus)) {
    throw new Error(`Invalid transition: ${currentStatus} → ${newStatus}`);
  }

  // Update alert
  const updateResult = await pool.query(
    `UPDATE alerts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [newStatus, alertId]
  );
  const updatedAlert = updateResult.rows[0];

  // Append audit log (append-only — no updates or deletes)
  await pool.query(
    `INSERT INTO alert_audit_log (alert_id, from_status, to_status, changed_by)
     VALUES ($1, $2, $3, $4)`,
    [alertId, currentStatus, newStatus, userId]
  );

  // Recalculate sensor status
  await recalculateSensorStatus(alert.sensor_id, alert.zone_id);

  // Emit real-time event
  emitAlertUpdated(alert.zone_id, updatedAlert);

  return updatedAlert;
}

/**
 * Recalculate a sensor's overall status based on its active alerts.
 * Priority: critical > warning > healthy
 * Silent is only set by the absence worker.
 */
export async function recalculateSensorStatus(sensorId: number, zoneId: number): Promise<void> {
  const result = await pool.query(
    `SELECT severity FROM alerts
     WHERE sensor_id = $1 AND status IN ('open', 'acknowledged') AND suppressed = false
     ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 END
     LIMIT 1`,
    [sensorId]
  );

  let newStatus: SensorStatus = 'healthy';
  if (result.rows.length > 0) {
    newStatus = result.rows[0].severity === 'critical' ? 'critical' : 'warning';
  }

  // Check if sensor is silent (no recent readings)
  const silenceCheck = await pool.query(
    `SELECT 1 FROM sensors
     WHERE id = $1 AND last_reading_at < NOW() - INTERVAL '2 minutes'`,
    [sensorId]
  );
  if (silenceCheck.rows.length > 0) {
    newStatus = 'silent';
  }

  await updateSensorStatus(sensorId, zoneId, newStatus);
}

/**
 * Update sensor status and emit real-time event if changed.
 */
async function updateSensorStatus(sensorId: number, zoneId: number, newStatus: SensorStatus): Promise<void> {
  const result = await pool.query(
    `UPDATE sensors SET status = $1 WHERE id = $2 AND status != $1 RETURNING sensor_id, status`,
    [newStatus, sensorId]
  );

  if (result.rows.length > 0) {
    // Status actually changed — get previous status for the event
    const sensor = result.rows[0];
    emitSensorStateChange(zoneId, {
      sensorId,
      sensorExternalId: sensor.sensor_id,
      status: newStatus,
      previousStatus: '', // We don't track the previous here, but the client will know
    });
  }
}

/**
 * Get alerts with pagination and filters. Zone-scoped.
 */
export async function getAlerts(
  zoneIds: number[],
  filters: { status?: string; severity?: string; sensorId?: number },
  page: number = 1,
  limit: number = 20
): Promise<{ alerts: any[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // Zone isolation
  const zonePlaceholders = zoneIds.map((_, i) => `$${paramIndex + i}`).join(', ');
  conditions.push(`a.zone_id IN (${zonePlaceholders})`);
  params.push(...zoneIds);
  paramIndex += zoneIds.length;

  if (filters.status) {
    conditions.push(`a.status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  }
  if (filters.severity) {
    conditions.push(`a.severity = $${paramIndex}`);
    params.push(filters.severity);
    paramIndex++;
  }
  if (filters.sensorId) {
    conditions.push(`a.sensor_id = $${paramIndex}`);
    params.push(filters.sensorId);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM alerts a ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  // Fetch page
  const offset = (page - 1) * limit;
  const alertsResult = await pool.query(
    `SELECT a.*, s.sensor_id as sensor_external_id, s.name as sensor_name
     FROM alerts a
     JOIN sensors s ON s.id = a.sensor_id
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { alerts: alertsResult.rows, total };
}

/**
 * Get alert audit trail.
 */
export async function getAlertAuditLog(alertId: number): Promise<any[]> {
  const result = await pool.query(
    `SELECT aal.*, u.username as changed_by_username
     FROM alert_audit_log aal
     LEFT JOIN users u ON u.id = aal.changed_by
     WHERE aal.alert_id = $1
     ORDER BY aal.changed_at ASC`,
    [alertId]
  );
  return result.rows;
}
