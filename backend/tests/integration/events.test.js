import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { Event } from '../../src/models/Event.js';
import { Venue } from '../../src/models/Venue.js';
import { signAccessToken } from '../../src/utils/tokens.js';

describe('Phase 3 — events, venues, and performances', () => {
  let request;
  const ownerId = new mongoose.Types.ObjectId().toString();
  const otherOwnerId = new mongoose.Types.ObjectId().toString();
  const ownerToken = signAccessToken({ userId: ownerId, role: 'organizer', email: 'phase3@eventhive.test' });
  const otherOwnerToken = signAccessToken({ userId: otherOwnerId, role: 'organizer', email: 'other@eventhive.test' });

  beforeAll(async () => {
    await connectDb();
    request = supertest(createApp());
  }, 30_000);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await Event.deleteMany({ ownerId: { $in: [ownerId, otherOwnerId] } });
      await Venue.deleteMany({ ownerId: { $in: [ownerId, otherOwnerId] } });
      await disconnectDb();
    }
  }, 10_000);

  async function createEvent(title = 'Phase Three Live Event', token = ownerToken) {
    const response = await request.post('/api/events').set('Authorization', 'Bearer ' + token).send({
      title,
      description: 'A focused integration event to verify event setup and publishing.',
      category: 'concert',
      tags: ['phase three'],
    });
    expect(response.status).toBe(201);
    return response.body.event;
  }

  async function createAssignedVenue() {
    const response = await request.post('/api/venues').set('Authorization', 'Bearer ' + ownerToken).send({
      name: 'Phase Three Hall',
      address: { line1: '42 Park Street', city: 'Test City', country: 'India' },
      capacity: 2,
      inventoryKind: 'assigned',
      layout: {
        stageLabel: 'Main stage',
        sections: [{
          name: 'Main Floor',
          rows: [{
            label: 'A',
            aisleAfter: [],
            seats: [
              { label: 'A1', number: 1, category: 'standard' },
              { label: 'A2', number: 2, category: 'premium', accessible: true },
            ],
          }],
        }],
      },
    });
    expect(response.status).toBe(201);
    return response.body.venue;
  }

  it('requires organizer authentication and enforces event ownership', async () => {
    const unauthenticated = await request.post('/api/events').send({});
    expect(unauthenticated.status).toBe(401);

    const event = await createEvent('Ownership Test Event');
    const dashboard = await request.get('/api/events/organizer')
      .set('Authorization', 'Bearer ' + ownerToken);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.events.some((item) => item._id === event._id)).toBe(true);
    expect(dashboard.body.counts.draft).toBeGreaterThanOrEqual(1);

    const forbidden = await request.patch('/api/events/' + event._id)
      .set('Authorization', 'Bearer ' + otherOwnerToken)
      .send({ title: 'Changed by another organizer' });
    expect(forbidden.status).toBe(403);
  });

  it('creates venue and event-specific performance snapshots, then publishes searchable events', async () => {
    const venue = await createAssignedVenue();
    const event = await createEvent('Phase Three Searchable Jazz Night');
    const startsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    startsAt.setMinutes(0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

    const added = await request.post('/api/events/' + event._id + '/performances')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({
        label: 'Saturday evening',
        venueId: venue._id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        inventoryKind: 'assigned',
        priceTiers: [{ category: 'standard', price: 500 }, { category: 'premium', price: 900 }],
      });
    expect(added.status).toBe(201);
    const originalSeatIds = added.body.performance.seatMap.sections[0].rows[0].seats.map((seat) => seat.id);

    const published = await request.post('/api/events/' + event._id + '/publish').set('Authorization', 'Bearer ' + ownerToken);
    expect(published.status).toBe(200);
    expect(published.body.event.status).toBe('published');

    const listed = await request.get('/api/events').query({ search: 'Jazz Night', city: 'Test City', category: 'concert' });
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((item) => item._id === event._id)).toBe(true);

    const updatedLayout = {
      stageLabel: 'Updated stage',
      sections: [{ name: 'Main Floor', rows: [{ label: 'A', seats: [{ label: 'A1', number: 1, category: 'standard' }] }] }],
    };
    const layoutUpdate = await request.patch('/api/venues/' + venue._id + '/layout')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({ layout: updatedLayout });
    expect(layoutUpdate.status).toBe(200);
    expect(layoutUpdate.body.venue.layoutVersion).toBe(venue.layoutVersion + 1);

    const detail = await request.get('/api/events/' + event._id);
    expect(detail.status).toBe(200);
    expect(detail.body.event.performances[0].seatMap.sections[0].rows[0].seats).toHaveLength(2);
    expect(detail.body.event.performances[0].seatMap.sections[0].rows[0].seats.map((seat) => seat.id)).toEqual(originalSeatIds);

    const deactivate = await request.delete('/api/venues/' + venue._id).set('Authorization', 'Bearer ' + ownerToken);
    expect(deactivate.status).toBe(409);
  });

  it('rejects general admission capacity above the venue limit', async () => {
    const venueResponse = await request.post('/api/venues').set('Authorization', 'Bearer ' + ownerToken).send({
      name: 'Phase Three GA Space',
      address: { line1: '8 River Road', city: 'Test City', country: 'India' },
      capacity: 5,
      inventoryKind: 'general',
      layout: { stageLabel: 'Stage', sections: [] },
    });
    expect(venueResponse.status).toBe(201);
    const event = await createEvent('Phase Three GA Event');
    const startsAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const payload = {
      venueId: venueResponse.body.venue._id,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 90 * 60 * 1000).toISOString(),
      inventoryKind: 'general',
      capacity: 6,
      price: 250,
    };

    const oversize = await request.post('/api/events/' + event._id + '/performances').set('Authorization', 'Bearer ' + ownerToken).send(payload);
    expect(oversize.status).toBe(422);

    const valid = await request.post('/api/events/' + event._id + '/performances')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({ ...payload, capacity: 5 });
    expect(valid.status).toBe(201);
    expect(valid.body.performance.generalAdmission.capacity).toBe(5);
  });

  it('prevents organizers from attaching another organizer’s venue', async () => {
    const venue = await createAssignedVenue();
    const event = await createEvent('Venue Ownership Event', otherOwnerToken);
    const startsAt = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000);
    const response = await request.post('/api/events/' + event._id + '/performances')
      .set('Authorization', 'Bearer ' + otherOwnerToken)
      .send({
        venueId: venue._id,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
        inventoryKind: 'assigned',
        priceTiers: [{ category: 'standard', price: 500 }, { category: 'premium', price: 900 }],
      });
    expect(response.status).toBe(403);
  });
});
