import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../../src/app.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { Event } from '../../src/models/Event.js';
import { Venue } from '../../src/models/Venue.js';
import { signAccessToken } from '../../src/utils/tokens.js';
import { env } from '../../src/config/env.js';

describe('Phase 3 — events, venues, and performances', () => {
  let request;
  const ownerId = new mongoose.Types.ObjectId().toString();
  const otherOwnerId = new mongoose.Types.ObjectId().toString();
  const ownerToken = signAccessToken({ userId: ownerId, role: 'organizer', email: 'phase3@eventhive.test' });
  const otherOwnerToken = signAccessToken({ userId: otherOwnerId, role: 'organizer', email: 'other@eventhive.test' });
  const customerToken = signAccessToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'customer', email: 'customer@eventhive.test' });
  const uploadedStorageKeys = [];

  beforeAll(async () => {
    await connectDb();
    request = supertest(createApp());
  }, 30_000);

  afterAll(async () => {
    await Promise.all(uploadedStorageKeys.map(async (storageKey) => {
      const filePath = path.resolve(env.UPLOAD_DIR, ...storageKey.split('/'));
      await fs.unlink(filePath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }));
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
      address: { line1: '42 Park Street', line2: 'Suite 2', city: 'Test City', state: 'Test State', postalCode: '400001', country: 'India' },
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
    expect(detail.body.event.performances[0].venueAddress).toMatchObject({
      line1: '42 Park Street',
      line2: 'Suite 2',
      city: 'Test City',
      state: 'Test State',
      postalCode: '400001',
      country: 'India',
    });
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

  it('stores validated organizer images outside MongoDB and preserves URL fallbacks in event drafts', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
    const unauthenticated = await request.post('/api/events/uploads');
    expect(unauthenticated.status).toBe(401);
    const customerUpload = await request.post('/api/events/uploads')
      .set('Authorization', 'Bearer ' + customerToken)
      .attach('image', png, { filename: 'poster.png', contentType: 'image/png' });
    expect(customerUpload.status).toBe(403);

    const uploaded = await request.post('/api/events/uploads')
      .set('Authorization', 'Bearer ' + ownerToken)
      .attach('image', png, { filename: 'poster.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.image).toMatchObject({
      url: expect.stringMatching(/^\/uploads\/organizers\//),
      storageKey: expect.stringMatching(new RegExp(`^organizers/${ownerId}/`)),
      originalName: 'poster.png',
      mimeType: 'image/png',
      size: png.length,
    });
    uploadedStorageKeys.push(uploaded.body.image.storageKey);
    const staticImage = await request.get(uploaded.body.image.url);
    expect(staticImage.status).toBe(200);
    expect(staticImage.headers['content-type']).toMatch(/image\/png/);
    expect(staticImage.body).toEqual(png);

    const invalidExtension = await request.post('/api/events/uploads')
      .set('Authorization', 'Bearer ' + ownerToken)
      .attach('image', png, { filename: 'poster.gif', contentType: 'image/gif' });
    expect(invalidExtension.status).toBe(415);
    const mismatchedMime = await request.post('/api/events/uploads')
      .set('Authorization', 'Bearer ' + ownerToken)
      .attach('image', png, { filename: 'poster.png', contentType: 'image/jpeg' });
    expect(mismatchedMime.status).toBe(415);
    const fakeImage = await request.post('/api/events/uploads')
      .set('Authorization', 'Bearer ' + ownerToken)
      .attach('image', Buffer.from('not an image'), { filename: 'poster.png', contentType: 'image/png' });
    expect(fakeImage.status).toBe(415);
    const oversized = await request.post('/api/events/uploads')
      .set('Authorization', 'Bearer ' + ownerToken)
      .attach('image', Buffer.alloc(env.MAX_FILE_SIZE_MB * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' });
    expect(oversized.status).toBe(413);

    const manualPosterUrl = 'https://images.example.test/phase-three-poster.jpg';
    const eventResponse = await request.post('/api/events')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({
        title: 'Uploaded artwork draft',
        description: 'A draft that retains its separate uploaded image and manual image URL.',
        category: 'concert',
        posterUrl: manualPosterUrl,
        posterUpload: uploaded.body.image,
      });
    expect(eventResponse.status).toBe(201);
    expect(eventResponse.body.event.posterUrl).toBe(manualPosterUrl);
    expect(eventResponse.body.event.posterUpload.originalName).toBe('poster.png');

    const forbiddenAttach = await request.post('/api/events')
      .set('Authorization', 'Bearer ' + otherOwnerToken)
      .send({
        title: 'Another organizer image test',
        description: 'This organizer must not attach another person uploaded artwork.',
        category: 'concert',
        posterUpload: uploaded.body.image,
      });
    expect(forbiddenAttach.status).toBe(403);

    const otherEvent = await createEvent('Other Organizer Upload Test', otherOwnerToken);
    const forbiddenUpdate = await request.patch('/api/events/' + otherEvent._id)
      .set('Authorization', 'Bearer ' + otherOwnerToken)
      .send({ posterUpload: uploaded.body.image });
    expect(forbiddenUpdate.status).toBe(403);

    const reopened = await request.get('/api/events/organizer/' + eventResponse.body.event._id)
      .set('Authorization', 'Bearer ' + ownerToken);
    expect(reopened.status).toBe(200);
    expect(reopened.body.event.posterUrl).toBe(manualPosterUrl);
    expect(reopened.body.event.posterUpload).toMatchObject({
      url: uploaded.body.image.url,
      storageKey: uploaded.body.image.storageKey,
      mimeType: 'image/png',
    });

    const removed = await request.patch('/api/events/' + eventResponse.body.event._id)
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({ posterUpload: null });
    expect(removed.status).toBe(200);
    expect(removed.body.event.posterUpload).toBeNull();
    expect(removed.body.event.posterUrl).toBe(manualPosterUrl);
  });
});
