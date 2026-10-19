'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const authController = require('../controllers/authController');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
  refreshSchema,
} = require('../services/auth/authValidation');

const authRouter = Router();

// ── Auth-specific rate limiters ───────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  keyGenerator: (req) => req.ip || 'unknown',
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh requests.' },
});

// ── Public routes ─────────────────────────────────────────────────────────────

authRouter.post('/register', authLimiter, validate(registerSchema), authController.register);
authRouter.post('/login', authLimiter, validate(loginSchema), authController.login);
authRouter.post('/refresh', refreshLimiter, validate(refreshSchema), authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
authRouter.post('/reset-password/:token', authLimiter, validate(resetPasswordSchema), authController.resetPassword);

// ── Protected routes ──────────────────────────────────────────────────────────

authRouter.get('/me', authenticate, authController.me);
authRouter.patch('/profile', authenticate, validate(updateProfileSchema), authController.updateProfile);
authRouter.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

module.exports = { authRouter };
