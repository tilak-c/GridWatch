import { Queue } from 'bullmq';
import { createRedisConnection } from './redis';

export const anomalyQueue = new Queue('anomaly-processing', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 1000 }, // Keep last 1000 completed
    removeOnFail: { count: 5000 },     // Keep last 5000 failed for recovery
  },
});

console.log('✓ BullMQ anomaly queue initialized');
