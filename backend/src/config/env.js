'use strict';

const { z } = require('zod');

function supportsReplicaSet(uri) {
  // Atlas SRV records discover the replica-set members automatically. Keep
  // requiring an explicit replicaSet option for standard mongodb:// URIs.
  return (
    /^mongodb\+srv:\/\//i.test(uri) ||
    /(?:\?|&)replicaSet=rs0(?:&|$)/i.test(uri)
  );
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Database
  MONGO_URI: z
    .string()
    .min(1, 'MONGO_URI is required')
    .refine(
      supportsReplicaSet,
      'MONGO_URI must target a replica set. Use an Atlas mongodb+srv URI or include replicaSet=rs0. ' +
        'See README.md for database setup instructions.'
    ),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Uploads
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().max(50).default(10),
  UPLOAD_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_PUBLIC_BASE_URL: z.string().url().optional(),
  UPLOAD_S3_ENDPOINT: z.string().url().optional(),
  UPLOAD_S3_BUCKET: z.string().trim().min(1).optional(),
  UPLOAD_S3_REGION: z.string().trim().min(1).default('us-east-1'),
  UPLOAD_S3_ACCESS_KEY_ID: z.string().optional(),
  UPLOAD_S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Booking
  HOLD_EXPIRY_MINUTES: z.coerce.number().int().positive().default(15),
  PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),

  // Payment
  PAYMENT_PROVIDER: z.enum(['sandbox', 'razorpay', 'stripe']).default('sandbox'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error('\n❌ Environment variable validation failed:\n' + errors + '\n');
    process.exit(1);
  }

  return result.data;
}

const env = loadEnv();

module.exports = { env, supportsReplicaSet };
