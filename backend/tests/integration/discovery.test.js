import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { Event } from '../../src/models/Event.js';

describe('Phase 6 — discovery filters and sorting', () => {
  let request;
  const ownerId = new mongoose.Types.ObjectId();
  const startsAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await connectDb();
    request = supertest(createApp());
    await Event.create([
      makeEvent('Discovery Range Low', 300, new Date(startsAt.getTime() + 24 * 60 * 60 * 1000)),
      makeEvent('Discovery Range High', 900, startsAt),
    ]);
  }, 30_000);

  afterAll(async () => {
    await Event.deleteMany({ ownerId });
    await disconnectDb();
  }, 10_000);

  function makeEvent(title, price, eventStartsAt) {
    return {
      ownerId,
      title,
      description: 'A published discovery listing used for search filter integration checks.',
      category: 'concert',
      status: 'published',
      publishedAt: new Date(),
      performances: [{
        venueId: new mongoose.Types.ObjectId(),
        venueLayoutVersion: 1,
        venueName: 'Discovery Hall',
        venueAddress: { line1: '1 Test Street', city: 'Discovery City', country: 'India' },
        startsAt: eventStartsAt,
        endsAt: new Date(eventStartsAt.getTime() + 2 * 60 * 60 * 1000),
        inventoryKind: 'general',
        generalAdmission: { capacity: 20, price, currency: 'INR' },
      }],
    };
  }

  it('filters actual performance prices and sorts public listings by price and title', async () => {
    const filtered = await request.get('/api/events').query({ category: 'concert', city: 'Discovery City', minPrice: 800 });
    expect(filtered.status).toBe(200);
    expect(filtered.body.items.map((event) => event.title)).toEqual(['Discovery Range High']);

    const priceSorted = await request.get('/api/events').query({ category: 'concert', city: 'Discovery City', sort: 'priceAsc' });
    expect(priceSorted.status).toBe(200);
    expect(priceSorted.body.items.map((event) => event.title)).toEqual(['Discovery Range Low', 'Discovery Range High']);

    const titleSorted = await request.get('/api/events').query({ category: 'concert', city: 'Discovery City', sort: 'title' });
    expect(titleSorted.body.items.map((event) => event.title)).toEqual(['Discovery Range High', 'Discovery Range Low']);
  });

  it('rejects an inverted price range', async () => {
    const response = await request.get('/api/events').query({ minPrice: 901, maxPrice: 900 });
    expect(response.status).toBe(422);
  });
});
