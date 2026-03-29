import { pool } from '../config/database';
import { detectAbsentSensors } from '../services/anomalyService';
import { createAnomaly, createAlert, isSensorSuppressed } from '../services/alertService';
import { emitSensorStateChange } from '../services/realtimeService';

const ABSENCE_CHECK_INTERVAL = 30_000; // 30 seconds

/**
 * Rule C: Pattern Absence Worker
 * Runs on a 30-second interval, independent of ingestion.
 * Detects sensors that haven't reported in 2+ minutes.
 */
export function startAbsenceWorker(): void {
  const interval = setInterval(async () => {
    try {
      const absentSensors = await detectAbsentSensors();

      for (const sensor of absentSensors) {
        const suppressed = await isSensorSuppressed(sensor.sensorId);

        // Create anomaly (always, even if suppressed)
        const anomalyId = await createAnomaly(
          sensor.sensorId,
          null,
          'pattern_absence',
          {
            message: 'Sensor has not reported in over 2 minutes',
            last_reading_at: sensor.lastReadingAt,
          },
          suppressed
        );

        // Create alert if not suppressed
        if (!suppressed) {
          await createAlert(
            anomalyId,
            sensor.sensorId,
            sensor.zoneId,
            sensor.severity
          );
        }

        // Update sensor status to silent
        const updateResult = await pool.query(
          `UPDATE sensors SET status = 'silent' WHERE id = $1 AND status != 'silent' RETURNING sensor_id`,
          [sensor.sensorId]
        );

        if (updateResult.rows.length > 0) {
          emitSensorStateChange(sensor.zoneId, {
            sensorId: sensor.sensorId,
            sensorExternalId: updateResult.rows[0].sensor_id,
            status: 'silent',
            previousStatus: '',
          });
        }
      }

      if (absentSensors.length > 0) {
        console.log(`✓ Absence check: ${absentSensors.length} silent sensors detected`);
      }
    } catch (err) {
      console.error('Absence worker error:', err);
    }
  }, ABSENCE_CHECK_INTERVAL);

  interval.unref();
  console.log('✓ Pattern absence worker started (30s interval)');
}
