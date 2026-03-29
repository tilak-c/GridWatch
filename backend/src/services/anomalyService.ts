import { pool } from '../config/database';
import { SensorRule, ThresholdConfig, RateOfChangeConfig } from '../types';

interface ReadingData {
  readingId: number;
  sensorId: number;
  zoneId: number;
  voltage: number;
  current: number;
  temperature: number;
  timestamp: string;
}

interface AnomalyResult {
  sensorId: number;
  readingId: number;
  ruleType: string;
  severity: string;
  details: Record<string, any>;
  zoneId: number;
}

/**
 * Evaluate Rules A (threshold breach) and B (rate-of-change) for a batch of readings.
 * Returns list of detected anomalies.
 */
export async function evaluateReadings(readings: ReadingData[]): Promise<AnomalyResult[]> {
  const anomalies: AnomalyResult[] = [];

  // Group readings by sensor for efficient rule lookup
  const bySensor = new Map<number, ReadingData[]>();
  for (const r of readings) {
    if (!bySensor.has(r.sensorId)) bySensor.set(r.sensorId, []);
    bySensor.get(r.sensorId)!.push(r);
  }

  for (const [sensorId, sensorReadings] of bySensor) {
    // Fetch rules for this sensor
    const rulesResult = await pool.query(
      'SELECT * FROM sensor_rules WHERE sensor_id = $1 AND enabled = true',
      [sensorId]
    );
    const rules: SensorRule[] = rulesResult.rows;

    for (const reading of sensorReadings) {
      // Rule A: Threshold Breach
      const thresholdRule = rules.find(r => r.rule_type === 'threshold_breach');
      if (thresholdRule) {
        const config = thresholdRule.config as ThresholdConfig;
        const breaches: string[] = [];

        if (config.min_voltage !== undefined && reading.voltage < config.min_voltage) {
          breaches.push(`voltage ${reading.voltage} below min ${config.min_voltage}`);
        }
        if (config.max_voltage !== undefined && reading.voltage > config.max_voltage) {
          breaches.push(`voltage ${reading.voltage} above max ${config.max_voltage}`);
        }
        if (config.min_temp !== undefined && reading.temperature < config.min_temp) {
          breaches.push(`temperature ${reading.temperature} below min ${config.min_temp}`);
        }
        if (config.max_temp !== undefined && reading.temperature > config.max_temp) {
          breaches.push(`temperature ${reading.temperature} above max ${config.max_temp}`);
        }

        if (breaches.length > 0) {
          anomalies.push({
            sensorId,
            readingId: reading.readingId,
            ruleType: 'threshold_breach',
            severity: thresholdRule.severity,
            details: {
              breaches,
              voltage: reading.voltage,
              temperature: reading.temperature,
              thresholds: config,
            },
            zoneId: reading.zoneId,
          });
        }
      }

      // Rule B: Rate-of-Change Spike
      const rateRule = rules.find(r => r.rule_type === 'rate_of_change');
      if (rateRule) {
        const config = rateRule.config as RateOfChangeConfig;
        const changePercent = config.change_percent;

        // Get the average of the previous 3 readings for this sensor
        const prevResult = await pool.query(
          `SELECT AVG(voltage) as avg_voltage, AVG(temperature) as avg_temp
           FROM (
             SELECT voltage, temperature FROM readings
             WHERE sensor_id = $1 AND id < $2
             ORDER BY "timestamp" DESC
             LIMIT 3
           ) sub`,
          [sensorId, reading.readingId]
        );

        if (prevResult.rows[0] && prevResult.rows[0].avg_voltage !== null) {
          const avgVoltage = parseFloat(prevResult.rows[0].avg_voltage);
          const avgTemp = parseFloat(prevResult.rows[0].avg_temp);
          const spikes: string[] = [];

          if (avgVoltage > 0) {
            const voltageChange = Math.abs((reading.voltage - avgVoltage) / avgVoltage) * 100;
            if (voltageChange > changePercent) {
              spikes.push(`voltage changed ${voltageChange.toFixed(1)}% (threshold: ${changePercent}%)`);
            }
          }

          if (avgTemp > 0) {
            const tempChange = Math.abs((reading.temperature - avgTemp) / avgTemp) * 100;
            if (tempChange > changePercent) {
              spikes.push(`temperature changed ${tempChange.toFixed(1)}% (threshold: ${changePercent}%)`);
            }
          }

          if (spikes.length > 0) {
            anomalies.push({
              sensorId,
              readingId: reading.readingId,
              ruleType: 'rate_of_change',
              severity: rateRule.severity,
              details: {
                spikes,
                voltage: reading.voltage,
                temperature: reading.temperature,
                avgVoltage,
                avgTemp,
                changePercent,
              },
              zoneId: reading.zoneId,
            });
          }
        }
      }
    }
  }

  return anomalies;
}

/**
 * Rule C: Pattern Absence — detect sensors that haven't reported in 2+ minutes.
 * This runs on a timer, independent of ingestion.
 */
export async function detectAbsentSensors(): Promise<{
  sensorId: number;
  zoneId: number;
  lastReadingAt: Date | null;
  severity: string;
}[]> {
  // Find sensors whose last_reading_at is older than 2 minutes
  // Exclude sensors that already have a recent pattern_absence anomaly (within last 3 minutes)
  // to avoid duplicate alerts
  const result = await pool.query(`
    SELECT s.id as sensor_id, s.zone_id, s.last_reading_at,
           COALESCE(sr.severity, 'warning') as severity
    FROM sensors s
    LEFT JOIN sensor_rules sr ON sr.sensor_id = s.id AND sr.rule_type = 'pattern_absence' AND sr.enabled = true
    WHERE s.last_reading_at IS NOT NULL
      AND s.last_reading_at < NOW() - INTERVAL '2 minutes'
      AND s.status != 'silent'
      AND NOT EXISTS (
        SELECT 1 FROM anomalies a
        WHERE a.sensor_id = s.id
          AND a.rule_type = 'pattern_absence'
          AND a.created_at > NOW() - INTERVAL '3 minutes'
      )
  `);

  return result.rows.map((r: any) => ({
    sensorId: r.sensor_id,
    zoneId: r.zone_id,
    lastReadingAt: r.last_reading_at,
    severity: r.severity,
  }));
}
