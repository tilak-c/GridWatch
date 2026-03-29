import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { evaluateReadings } from '../services/anomalyService';
import { createAnomaly, createAlert, isSensorSuppressed } from '../services/alertService';

/**
 * BullMQ Worker: processes readings for Rules A and B anomaly detection.
 * Runs asynchronously after ingestion → does not block the <200ms response.
 */
export function startAnomalyWorker(): void {
  const worker = new Worker(
    'anomaly-processing',
    async (job) => {
      const { readings } = job.data;

      if (!readings || readings.length === 0) return;

      // Evaluate Rules A and B
      const anomalies = await evaluateReadings(readings);

      // Process each detected anomaly
      for (const anomaly of anomalies) {
        const suppressed = await isSensorSuppressed(anomaly.sensorId);

        // Always create the anomaly record (even if suppressed)
        const anomalyId = await createAnomaly(
          anomaly.sensorId,
          anomaly.readingId,
          anomaly.ruleType,
          anomaly.details,
          suppressed
        );

        // Only create alert if NOT suppressed
        if (!suppressed) {
          await createAlert(
            anomalyId,
            anomaly.sensorId,
            anomaly.zoneId,
            anomaly.severity
          );
        }
      }

      return { processedReadings: readings.length, anomaliesFound: anomalies.length };
    },
    {
      connection: createRedisConnection(),
      concurrency: 5, // Process up to 5 jobs in parallel
    }
  );

  worker.on('completed', (job, result) => {
    if (result && result.anomaliesFound > 0) {
      console.log(
        `✓ Anomaly job ${job.id}: ${result.processedReadings} readings → ${result.anomaliesFound} anomalies`
      );
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`✗ Anomaly job ${job?.id} failed:`, err.message);
  });

  console.log('✓ Anomaly detection worker started');
}
