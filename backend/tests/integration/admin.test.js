import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { AdminAuditLog } from '../../src/models/AdminAuditLog.js';
import { Event } from '../../src/models/Event.js';
import { User } from '../../src/models/User.js';
import { signAccessToken } from '../../src/utils/tokens.js';

describe('Phase 8 — protected admin operations and audit log', () => {
  let request;
  const adminId = new mongoose.Types.ObjectId();
  const targetUserId = new mongoose.Types.ObjectId();
  const adminToken = signAccessToken({ userId: adminId.toString(), role: 'admin', email: 'phase8-admin@eventhive.test' });
  const customerToken = signAccessToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'customer', email: 'phase8-customer@eventhive.test' });
  const admin = { Authorization: 'Bearer ' + adminToken };
  let adminUser;
  let targetUser;
  let event;

  beforeAll(async () => {
    await connectDb();
    request = supertest(createApp());
    adminUser = await User.create({
      _id: adminId,
      name: 'Phase Eight Admin',
      email: `phase8-admin-${adminId.toString()}@eventhive.test`,
      passwordHash: 'isolated-test-hash',
      role: 'admin',
    });
    targetUser = await User.create({
      _id: targetUserId,
      name: 'Phase Eight Target',
      email: `phase8-${targetUserId.toString()}@eventhive.test`,
      passwordHash: 'isolated-test-hash',
      role: 'customer',
    });
    event = await Event.create({
      ownerId: targetUserId,
      title: 'Phase Eight Moderation Draft',
      description: 'A draft fixture for admin role and event audit integration checks.',
      category: 'concert',
      status: 'draft',
    });
  }, 30_000);

  afterAll(async () => {
    await AdminAuditLog.deleteMany({ actorId: adminId });
    await Event.deleteOne({ _id: event?._id });
    await User.deleteOne({ _id: adminUser?._id });
    await User.deleteOne({ _id: targetUser?._id });
    await disconnectDb();
  }, 10_000);

  it('protects admin APIs, updates roles transactionally, and prevents self-demotion', async () => {
    const denied = await request.get('/api/admin/overview').set('Authorization', 'Bearer ' + customerToken);
    const overview = await request.get('/api/admin/overview').set(admin);
    const users = await request.get('/api/admin/users').query({ search: 'Phase Eight Target' }).set(admin);
    expect(denied.status).toBe(403);
    expect(overview.status).toBe(200);
    expect(overview.body.users.total).toBeGreaterThan(0);
    expect(users.body.users[0].email).toBe(targetUser.email);

    const changed = await request.patch(`/api/admin/users/${targetUser._id}/role`).set(admin).send({ role: 'organizer' });
    const selfChange = await request.patch(`/api/admin/users/${adminId}/role`).set(admin).send({ role: 'customer' });
    expect(changed.status).toBe(200);
    expect(changed.body.user.role).toBe('organizer');
    expect(selfChange.status).toBe(409);
    expect((await User.findById(adminId).lean()).role).toBe('admin');
    expect(await AdminAuditLog.countDocuments({ actorId: adminId, action: 'user.role.update', resourceId: targetUserId })).toBe(1);
  });

  it('audits admin event edits and moderation and lists those records only to admins', async () => {
    const edited = await request.patch(`/api/events/${event._id}`).set(admin).send({ title: 'Phase Eight Reviewed Draft' });
    const cancelled = await request.post(`/api/events/${event._id}/cancel`).set(admin);
    const logs = await request.get('/api/admin/audit-logs').set(admin);
    const customerLogs = await request.get('/api/admin/audit-logs').set('Authorization', 'Bearer ' + customerToken);
    expect(edited.status).toBe(200);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.event.status).toBe('cancelled');
    expect(logs.body.logs.some((log) => log.action === 'event.details.update' && log.resourceId === event._id.toString())).toBe(true);
    expect(logs.body.logs.some((log) => log.action === 'event.cancel' && log.resourceId === event._id.toString())).toBe(true);
    expect(customerLogs.status).toBe(403);
  });
});
