import { registerAs } from '@nestjs/config';

export default registerAs('dbBuffer', () => ({
  enabled: process.env.DB_BUFFER_ENABLED !== 'false', // Default to true if not specified
  flushIntervalMs: Number.parseInt(
    process.env.DB_BUFFER_INTERVAL_MS || '5000',
    10
  ),
  maxItems: Number.parseInt(process.env.DB_BUFFER_MAX_ITEMS || '5', 10),
}));
