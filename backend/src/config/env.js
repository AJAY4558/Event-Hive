'use strict';

const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Database
  MONGO_URI: z
    .string()
    .min(1, 'MONGO_URI is required')
    .refine(
      (uri) => uri.includes('replicaSet='),
      'MONGO_URI must include replicaSet=rs0 for transaction support. ' +
        'See README.md for replica-set setup instructions.'
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
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),

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

module.exports = { env };
