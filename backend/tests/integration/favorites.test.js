import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { Event } from '../../src/models/Event.js';
import { Favorite } from '../../src/models/Favorite.js';
import { signAccessToken } from '../../src/utils/tokens.js';

describe('Phase 6 — customer favorites', () => {
  let request;
  const customerId = new mongoose.Types.ObjectId();
  const otherCustomerId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  const customerToken = signAccessToken({ userId: customerId.toString(), role: 'customer', email: 'favorite@eventhive.test' });
  const otherToken = signAccessToken({ userId: otherCustomerId.toString(), role: 'customer', email: 'other-favorite@eventhive.test' });
  let event;

  beforeAll(async () => {
    await connectDb();
    request = supertest(createApp());
    event = await Event.create({
      ownerId,
      title: 'Favorite integration event',
      description: 'A published event used to verify customer favorite behavior.',
      category: 'concert',
      status: 'published',
    });
  }, 30_000);

  afterAll(async () => {
    await Favorite.deleteMany({ eventId: event?._id });
    if (event) await Event.deleteOne({ _id: event._id, ownerId });
    await disconnectDb();
  }, 10_000);

  it('adds, lists, keeps, and removes a customer-owned favorite idempotently', async () => {
    const first = await request.put(`/api/favorites/${event._id}`).set('Authorization', 'Bearer ' + customerToken);
    const duplicate = await request.put(`/api/favorites/${event._id}`).set('Authorization', 'Bearer ' + customerToken);
    const list = await request.get('/api/favorites').set('Authorization', 'Bearer ' + customerToken);
    const otherList = await request.get('/api/favorites').set('Authorization', 'Bearer ' + otherToken);
    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect(await Favorite.countDocuments({ customerId, eventId: event._id })).toBe(1);
    expect(list.body.favorites[0].event._id).toBe(event._id.toString());
    expect(otherList.body.favorites).toHaveLength(0);

    const removed = await request.delete(`/api/favorites/${event._id}`).set('Authorization', 'Bearer ' + customerToken);
    expect(removed.status).toBe(200);
    expect(removed.body.removed).toBe(true);
    expect(await Favorite.countDocuments({ customerId, eventId: event._id })).toBe(0);
  });
});
