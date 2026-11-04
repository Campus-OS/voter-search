require('dotenv').config();
const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB: z.string().min(1).default('voter-records'),
  VOTERS_COLLECTION: z.string().default('voters'),
  WARD_COLLECTION: z.string().default('wards'),
  DEFAULT_DATASET_ID: z.coerce.number().int().positive().default(1),
  SEARCH_RATE_LIMIT: z.coerce.number().int().positive().default(60),
  VOTE_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  DEVICE_ACCESS_KEYS_FILE: z.string().min(1).default('.device-access-key-hashes.json'),
  VOTE_API_KEY: z.string().min(24).optional(),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid environment configuration:', result.error.flatten().fieldErrors);
  process.exit(1);
}

if (result.data.NODE_ENV === 'production' && !result.data.VOTE_API_KEY) {
  console.error('VOTE_API_KEY is required in production.');
  process.exit(1);
}

module.exports = Object.freeze(result.data);
