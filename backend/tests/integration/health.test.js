import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApp } = require('../../src/app.js');
const { connectDb, disconnectDb, getDbStatus } = require('../../src/config/db.js');

describe('Phase 2 — Health Checks', () => {
  let request;

  beforeAll(async () => {
    await connectDb();
    const app = createApp();
    request = supertest(app);
  }, 30_000);

  afterAll(async () => {
    await disconnectDb();
  }, 10_000);

  describe('GET /health', () => {
    it('returns 200 when DB is connected and RS is active', async () => {
      const res = await request.get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db.connected).toBe(true);
      expect(res.body.db.rs).toBe(true);
      expect(res.body.db.primary).toBe(true);
      expect(res.body.db.setName).toBe('rs0');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('includes server metadata', async () => {
      const res = await request.get('/health');

      expect(res.body.server).toBeDefined();
      expect(res.body.server.nodeVersion).toMatch(/^v\d+\./);
      expect(res.body.server.memory.heapUsedMB).toBeGreaterThan(0);
    });

    it('has correct content-type', async () => {
      const res = await request.get('/health');
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('GET /health/live', () => {
    it('returns 200 liveness probe', async () => {
      const res = await request.get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.alive).toBe(true);
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 when DB and RS are ready', async () => {
      const res = await request.get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
      expect(res.body.db).toBe(true);
      expect(res.body.rs).toBe(true);
    });
  });

  describe('getDbStatus()', () => {
    it('reports connected=true, isReplicaSet=true, isPrimary=true after connect', () => {
      const status = getDbStatus();

      expect(status.connected).toBe(true);
      expect(status.isReplicaSet).toBe(true);
      expect(status.isPrimary).toBe(true);
      expect(status.setName).toBe('rs0');
    });
  });

  describe('MongoDB transaction support', () => {
    it('can commit a multi-document transaction', async () => {
      const mongoose = await import('mongoose');
      const session = await mongoose.default.startSession();

      try {
        await session.withTransaction(async () => {
          const col = mongoose.default.connection.db && mongoose.default.connection.db.collection('_txn_smoke_test');
          await col.insertOne({ test: 'a', ts: new Date() }, { session });
          await col.insertOne({ test: 'b', ts: new Date() }, { session });
        });

        const col = mongoose.default.connection.db && mongoose.default.connection.db.collection('_txn_smoke_test');
        const docs = await col.find({ test: { $in: ['a', 'b'] } }).toArray();
        expect(docs.length).toBe(2);

        await col.deleteMany({ test: { $in: ['a', 'b'] } });
      } finally {
        await session.endSession();
      }
    });

    it('rolls back a transaction on abort', async () => {
      const mongoose = await import('mongoose');
      const session = await mongoose.default.startSession();
      const col = mongoose.default.connection.db && mongoose.default.connection.db.collection('_txn_abort_test');

      try {
        session.startTransaction();
        await col.insertOne({ test: 'should-rollback' }, { session });
        await session.abortTransaction();

        const doc = await col.findOne({ test: 'should-rollback' });
        expect(doc).toBeNull();
      } finally {
        await session.endSession();
      }
    });
  });
});
