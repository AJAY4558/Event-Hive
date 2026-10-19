'use strict';

// Load environment variables before any module imports
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27018/eventhive_test?replicaSet=rs0';
process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-characters-long!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-must-be-at-least-32-characters!!';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.UPLOAD_DIR = './uploads';
process.env.MAX_FILE_SIZE_MB = '10';
process.env.HOLD_EXPIRY_MINUTES = '15';
process.env.PAYMENT_TIMEOUT_MINUTES = '30';
process.env.PAYMENT_PROVIDER = 'sandbox';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX = '1000'; // Higher for tests
process.env.AUTH_RATE_LIMIT_MAX = '1000'; // Higher for tests
