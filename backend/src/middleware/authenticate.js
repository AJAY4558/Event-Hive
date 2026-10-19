'use strict';

const { extractBearerToken, verifyAccessToken, ROLE_HIERARCHY } = require('../utils/tokens');

/**
 * authenticate — verifies JWT Bearer token and attaches req.user.
 */
function authenticate(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    const isExpired = err instanceof Error && err.name === 'TokenExpiredError';
    res.status(401).json({
      error: isExpired
        ? 'Session expired. Please refresh your token.'
        : 'Invalid token. Please log in again.',
    });
  }
}

/**
 * authorize(...roles) — must come AFTER authenticate.
 * Returns 403 if the authenticated user lacks the required role level.
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const userLevel = ROLE_HIERARCHY[req.user.role];
    const requiredLevel = Math.max(...roles.map((r) => ROLE_HIERARCHY[r]));

    if (userLevel < requiredLevel) {
      res.status(403).json({
        error: 'You do not have permission to perform this action.',
      });
      return;
    }

    next();
  };
}

function requireExactRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.user.role !== role) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

/**
 * requireOwnerOrAdmin — checks req.params.userId matches the authenticated user
 * OR the user is an admin.
 */
function requireOwnerOrAdmin(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const isOwner = req.params.userId === req.user.userId;
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  next();
}

module.exports = { authenticate, authorize, requireExactRole, requireOwnerOrAdmin };
