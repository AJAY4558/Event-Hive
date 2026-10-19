'use strict';

const { Router } = require('express');
const os = require('os');
const { getDbStatus } = require('../config/db');
const { env } = require('../config/env');

const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const db = getDbStatus();

  const payload = {
    status: db.connected && db.isReplicaSet && db.isPrimary ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    db: {
      connected: db.connected,
      rs: db.isReplicaSet,
      primary: db.isPrimary,
      setName: db.setName || null,
      host: db.host,
    },
    server: {
      platform: os.platform(),
      nodeVersion: process.version,
      memory: {
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    },
  };

  const httpStatus = payload.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(payload);
});

healthRouter.get('/live', (_req, res) => {
  res.status(200).json({ alive: true, uptime: Math.floor(process.uptime()) });
});

healthRouter.get('/ready', (_req, res) => {
  const db = getDbStatus();
  const ready = db.connected && db.isReplicaSet && db.isPrimary;
  res.status(ready ? 200 : 503).json({ ready, db: db.connected, rs: db.isReplicaSet });
});

module.exports = { healthRouter };
