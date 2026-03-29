import { pool } from '../config/database';
import { emitAlertEscalated } from '../services/realtimeService';

const ESCALATION_CHECK_INTERVAL = 30_000; // 30 seconds

/**
 * Escalation Worker — checks for critical alerts open > 5 min with no acknowledgement.
 * Uses UNIQUE constraint on escalation_log.alert_id to guarantee exactly-once escalation.
 */
export function startEscalationWorker(): void {
  const interval = setInterval(async () => {
    try {
      // Find critical open alerts older than 5 minutes that haven't been escalated
      const alertsResult = await pool.query(`
        SELECT a.id, a.sensor_id, a.zone_id, a.assigned_to, a.severity
        FROM alerts a
        WHERE a.severity = 'critical'
          AND a.status = 'open'
          AND a.escalated = false
          AND a.suppressed = false
          AND a.created_at < NOW() - INTERVAL '5 minutes'
        FOR UPDATE SKIP LOCKED
      `);

      for (const alert of alertsResult.rows) {
        // Find a supervisor for this zone
        const supervisorResult = await pool.query(
          `SELECT u.id FROM users u WHERE u.role = 'supervisor' LIMIT 1`
        );

        const supervisorId = supervisorResult.rows[0]?.id || null;

        try {
          // Insert into escalation_log (UNIQUE on alert_id prevents duplicates)
          await pool.query(
            `INSERT INTO escalation_log (alert_id, from_operator, to_supervisor)
             VALUES ($1, $2, $3)`,
            [alert.id, alert.assigned_to, supervisorId]
          );

          // Mark alert as escalated and reassign to supervisor
          await pool.query(
            `UPDATE alerts SET escalated = true, assigned_to = $1, updated_at = NOW()
             WHERE id = $2`,
            [supervisorId, alert.id]
          );

          // Audit log
          await pool.query(
            `INSERT INTO alert_audit_log (alert_id, from_status, to_status, changed_by)
             VALUES ($1, 'open', 'open', NULL)`,
            [alert.id]
          );

          console.log(`⚠ Alert ${alert.id} escalated to supervisor ${supervisorId}`);

          emitAlertEscalated(alert.zone_id, {
            alertId: alert.id,
            sensorId: alert.sensor_id,
            supervisorId,
          });
        } catch (err: any) {
          // UNIQUE violation = already escalated (exactly-once guarantee)
          if (err.code === '23505') {
            console.log(`Alert ${alert.id} already escalated (duplicate prevented)`);
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      console.error('Escalation worker error:', err);
    }
  }, ESCALATION_CHECK_INTERVAL);

  interval.unref();
  console.log('✓ Escalation worker started (30s interval)');
}
