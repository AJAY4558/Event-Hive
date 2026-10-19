'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const { env } = require('./config/env');
const { healthRouter } = require('./routes/health');
const { authRouter } = require('./routes/auth');
const { eventRouter } = require('./routes/events');
const { venueRouter } = require('./routes/venues');
const { bookingRouter } = require('./routes/bookings');
const { favoriteRouter } = require('./routes/favorites');
const { adminRouter } = require('./routes/admin');

function createApp() {
  const app = express();

  // ── Security middleware ─────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
    })
  );

  // ── Global rate limiter ─────────────────────────────────────────────────────
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    })
  );

  // ── Body & cookie parsing ────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // ── Logging ─────────────────────────────────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
  }

  // ── Static uploads ──────────────────────────────────────────────────────────
  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));

  // ── Routes ──────────────────────────────────────────────────────────────────
  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/events', eventRouter);
  app.use('/api/venues', venueRouter);
  app.use('/api/bookings', bookingRouter);
  app.use('/api/favorites', favoriteRouter);
  app.use('/api/admin', adminRouter);

  // 404 fallback for unmatched /api routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // ── Global error handler ────────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
    const body = { error: status < 500 ? (err.message || 'Request failed') : 'Internal server error' };
    if (status === 500) {
      console.error('[500] Unexpected request failure:', err.name || 'Error', err.code || '');
    }
    res.status(status).json(body);
  });

  return app;
}

module.exports = { createApp };
