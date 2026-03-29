import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

redis.on('connect', () => {
  console.log('✓ Redis connected');
});

// Create a separate connection for BullMQ (it needs its own)
export function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
