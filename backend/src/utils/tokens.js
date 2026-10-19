'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

// ── Token generation ──────────────────────────────────────────────────────────

function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'eventhive',
    audience: 'eventhive-client',
  });
}

function signRefreshToken(userId) {
  return jwt.sign({ userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: 'eventhive',
    audience: 'eventhive-client',
  });
}

// ── Token verification ────────────────────────────────────────────────────────

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: 'eventhive',
    audience: 'eventhive-client',
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: 'eventhive',
    audience: 'eventhive-client',
  });
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

const IS_PROD = env.NODE_ENV === 'production';

function setRefreshTokenCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth/refresh',
  });
}

function clearRefreshTokenCookie(res) {
  res.cookie('refreshToken', '', {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    maxAge: 0,
    path: '/api/auth/refresh',
  });
}

// ── Bearer token extraction ───────────────────────────────────────────────────

function extractBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ── Role helpers ──────────────────────────────────────────────────────────────

const ROLE_HIERARCHY = {
  customer: 1,
  organizer: 2,
  admin: 3,
};

function hasMinimumRole(userRole, requiredRole) {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  extractBearerToken,
  ROLE_HIERARCHY,
  hasMinimumRole,
};
