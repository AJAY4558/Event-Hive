import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { Booking } from '../../src/models/Booking.js';
import { AdminAuditLog } from '../../src/models/AdminAuditLog.js';
import { Event } from '../../src/models/Event.js';
import { SeatAllocation } from '../../src/models/SeatAllocation.js';
import { Venue } from '../../src/models/Venue.js';
import { signAccessToken } from '../../src/utils/tokens.js';

describe('Phase 4 — transactional bookings and inventory integrity', () => {
  let request;
  const organizerId = new mongoose.Types.ObjectId();
  const otherOrganizerId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const customerIds = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
  const organizerToken = signAccessToken({ userId: organizerId.toString(), role: 'organizer', email: 'booking-organizer@eventhive.test' });
  const customerTokens = customerIds.map((id, index) => signAccessToken({
    userId: id.toString(),
    role: 'customer',
    email: `booking-customer-${index}@eventhive.test`,
  }));
  const organizer = { Authorization: 'Bearer ' + organizerToken };
  const otherOrganizerToken = signAccessToken({ userId: otherOrganizerId.toString(), role: 'organizer', email: 'other-booking-organizer@eventhive.test' });
  const adminToken = signAccessToken({ userId: adminId.toString(), role: 'admin', email: 'booking-admin@eventhive.test' });

  beforeAll(async () => {
    await connectDb();
    await Promise.all([Booking.init(), SeatAllocation.init()]);
    request = supertest(createApp());
  }, 30_000);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      const eventIds = await Event.find({ ownerId: organizerId }).distinct('_id');
      await Booking.deleteMany({ $or: [{ eventId: { $in: eventIds } }, { customerId: { $in: customerIds } }] });
      await SeatAllocation.deleteMany({ $or: [{ eventId: { $in: eventIds } }, { customerId: { $in: customerIds } }] });
      await AdminAuditLog.deleteMany({ actorId: adminId });
      await Event.deleteMany({ ownerId: organizerId });
      await Venue.deleteMany({ ownerId: organizerId });
      await disconnectDb();
    }
  }, 15_000);

  async function createPerformance({ inventoryKind = 'assigned', capacity = 4, price = 599, blockedSeats = [] } = {}) {
    const seatInputs = Array.from({ length: capacity }, (_, index) => ({
      label: 'A' + (index + 1),
      number: index + 1,
      category: 'standard',
      blocked: blockedSeats.includes(index + 1),
    }));
    const venueResponse = await request.post('/api/venues').set(organizer).send({
      name: 'Booking Integration Hall',
      address: { line1: '10 Test Road', city: 'Booking Test City', country: 'India' },
      capacity,
      inventoryKind,
      layout: {
        stageLabel: 'Stage',
        sections: inventoryKind === 'assigned'
          ? [{ name: 'Main Floor', rows: [{ label: 'A', seats: seatInputs }] }]
          : [],
      },
    });
    expect(venueResponse.status).toBe(201);

    const eventResponse = await request.post('/api/events').set(organizer).send({
      title: 'Booking Integrity ' + new mongoose.Types.ObjectId().toString().slice(-6),
      description: 'A focused integration event for transactional inventory checks.',
      category: 'concert',
    });
    expect(eventResponse.status).toBe(201);

    const startsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    startsAt.setSeconds(0, 0);
    const performanceResponse = await request.post(`/api/events/${eventResponse.body.event._id}/performances`)
      .set(organizer)
      .send({
        label: 'Test performance',
        venueId: venueResponse.body.venue._id,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        inventoryKind,
        ...(inventoryKind === 'assigned'
          ? { priceTiers: [{ category: 'standard', price }] }
          : { capacity, price }),
      });
    expect(performanceResponse.status).toBe(201);
    const publishResponse = await request.post(`/api/events/${eventResponse.body.event._id}/publish`).set(organizer);
    expect(publishResponse.status).toBe(200);

    return {
      event: eventResponse.body.event,
      performance: performanceResponse.body.performance,
    };
  }

  function bookingBody(event, performance, seatIds) {
    return {
      eventId: event._id,
      performanceId: performance._id,
      ...(seatIds ? { seatIds } : { quantity: 1 }),
    };
  }

  function idempotencyKey() {
    return new mongoose.Types.ObjectId().toString();
  }

  it('books a seat at the server price, replays an idempotent request, and preserves the historical price', async () => {
    const { event, performance } = await createPerformance({ capacity: 2 });
    const seatId = performance.seatMap.sections[0].rows[0].seats[0].id;
    const storedEvent = await Event.findById(event._id).lean();
    const storedSeatIds = storedEvent.performances[0].seatMap.sections[0].rows[0].seats.map((seat) => seat.id);
    expect(storedSeatIds, JSON.stringify({ responseSeatId: seatId, storedSeatIds })).toContain(seatId);
    const body = bookingBody(event, performance, [seatId]);
    const key = idempotencyKey();

    const created = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', key).send(body);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.booking.customerId).toBe(customerIds[0].toString());
    expect(created.body.booking.performanceId).toBe(performance._id);
    expect(created.body.booking.seats[0].seatId).toBe(seatId);
    expect(created.body.booking.seats[0].unitPricePaise).toBe(59900);
    expect(created.body.booking.totalPaise).toBe(59900);

    const replay = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', key).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.booking._id).toBe(created.body.booking._id);

    const changedPayload = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', key).send(bookingBody(event, performance, [performance.seatMap.sections[0].rows[0].seats[1].id]));
    expect(changedPayload.status).toBe(409);

    const repriced = await request.patch(`/api/events/${event._id}/performances/${performance._id}`)
      .set(organizer).send({ priceTiers: [{ category: 'standard', price: 750 }] });
    expect(repriced.status).toBe(200);
    const stored = await Booking.findById(created.body.booking._id).lean();
    expect(stored.totalPaise).toBe(59900);

    const organizerReport = await request.get(`/api/events/organizer/${event._id}/bookings`).set(organizer);
    const dashboard = await request.get('/api/events/organizer').set(organizer);
    const forbiddenReport = await request.get(`/api/events/organizer/${event._id}/bookings`)
      .set('Authorization', 'Bearer ' + otherOrganizerToken);
    expect(organizerReport.status).toBe(200);
    expect(organizerReport.body.metrics.ticketsSold).toBe(1);
    expect(organizerReport.body.bookings[0].customerId).toBeUndefined();
    expect(dashboard.body.events.find((item) => item._id === event._id).metrics.ticketsSold).toBe(1);
    expect(forbiddenReport.status).toBe(403);
  });

  it('allows only one concurrent customer to allocate the same seat', async () => {
    const { event, performance } = await createPerformance({ capacity: 1 });
    const seatId = performance.seatMap.sections[0].rows[0].seats[0].id;
    const requests = await Promise.all([0, 1].map((index) => request.post('/api/bookings')
      .set('Authorization', 'Bearer ' + customerTokens[index])
      .set('X-Idempotency-Key', idempotencyKey())
      .send(bookingBody(event, performance, [seatId]))));

    expect(requests.map((response) => response.status).sort(), JSON.stringify(requests.map((response) => response.body))).toEqual([201, 409]);
    expect(await SeatAllocation.countDocuments({ performanceId: performance._id, seatId, status: 'confirmed' })).toBe(1);
    expect(await Booking.countDocuments({ eventId: event._id, status: 'confirmed' })).toBe(1);
  });

  it('allows concurrent customers to book different seats on the same performance', async () => {
    const { event, performance } = await createPerformance({ capacity: 2, price: 1.005 });
    const seats = performance.seatMap.sections[0].rows[0].seats;
    const requests = await Promise.all([0, 1].map((index) => request.post('/api/bookings')
      .set('Authorization', 'Bearer ' + customerTokens[index])
      .set('X-Idempotency-Key', idempotencyKey())
      .send(bookingBody(event, performance, [seats[index].id]))));

    expect(requests.map((response) => response.status)).toEqual([201, 201]);
    expect(requests.map((response) => response.body.booking.totalPaise)).toEqual([101, 101]);
    expect(await SeatAllocation.countDocuments({ performanceId: performance._id, status: 'confirmed' })).toBe(2);
    const storedEvent = await Event.findById(event._id).lean();
    expect(storedEvent.performances[0].inventoryRevision).toBe(2);
  });

  it('has a database-enforced unique index for active performance-seat allocations', async () => {
    const indexes = await SeatAllocation.collection.indexes();
    const activeSeatIndex = indexes.find((index) => index.name === 'uniq_active_performance_seat');
    expect(activeSeatIndex?.unique).toBe(true);
    expect(activeSeatIndex?.partialFilterExpression).toEqual({ status: 'confirmed' });

    const bookingIndexes = await Booking.collection.indexes();
    expect(bookingIndexes.find((index) => index.name === 'uniq_customer_idempotency')?.unique).toBe(true);
    expect(bookingIndexes.find((index) => index.name === 'bookingReference_1')?.unique).toBe(true);
  });

  it('prevents general-admission overselling under concurrent requests and restores inventory once on cancellation', async () => {
    const { event, performance } = await createPerformance({ inventoryKind: 'general', capacity: 1, price: 350 });
    const body = bookingBody(event, performance);
    const requests = await Promise.all([0, 1].map((index) => request.post('/api/bookings')
      .set('Authorization', 'Bearer ' + customerTokens[index])
      .set('X-Idempotency-Key', idempotencyKey()).send(body)));
    expect(requests.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await Booking.countDocuments({ eventId: event._id, status: 'confirmed' })).toBe(1);

    const winner = requests.find((response) => response.status === 201).body.booking;
    expect(winner.unitPricePaise).toBe(35000);
    let storedEvent = await Event.findById(event._id).lean();
    expect(storedEvent.performances[0].generalAdmission.soldQuantity).toBe(1);

    const ownerIndex = customerIds.findIndex((id) => id.toString() === winner.customerId);
    const ownerToken = customerTokens[ownerIndex];
    const cancelled = await request.post(`/api/bookings/${winner._id}/cancel`).set('Authorization', 'Bearer ' + ownerToken);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.booking.status).toBe('cancelled');
    const repeated = await request.post(`/api/bookings/${winner._id}/cancel`).set('Authorization', 'Bearer ' + ownerToken);
    expect(repeated.status).toBe(200);
    storedEvent = await Event.findById(event._id).lean();
    expect(storedEvent.performances[0].generalAdmission.soldQuantity).toBe(0);
  });

  it('rejects blocked seats and rolls back every seat when a multi-seat request conflicts', async () => {
    const { event, performance } = await createPerformance({ capacity: 3, blockedSeats: [3] });
    const seats = performance.seatMap.sections[0].rows[0].seats;

    const blocked = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seats[2].id]));
    expect(blocked.status).toBe(422);

    const established = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seats[1].id]));
    expect(established.status).toBe(201);

    const competing = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[1])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seats[0].id, seats[1].id]));
    expect(competing.status).toBe(409);
    expect(await SeatAllocation.countDocuments({ performanceId: performance._id, seatId: seats[0].id, status: 'confirmed' })).toBe(0);
    expect(await Booking.countDocuments({ eventId: event._id })).toBe(1);
  });

  it('enforces booking ownership, exposes current availability, and permits rebooking after cancellation', async () => {
    const { event, performance } = await createPerformance({ capacity: 1 });
    const unauthorizedEdit = await request.patch(`/api/events/${event._id}`)
      .set('Authorization', 'Bearer ' + customerTokens[2])
      .send({ title: 'Customer attempted organizer edit' });
    expect(unauthorizedEdit.status).toBe(403);
    expect((await Event.findById(event._id)).title).toBe(event.title);

    const seatId = performance.seatMap.sections[0].rows[0].seats[0].id;
    const created = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seatId]));
    expect(created.status).toBe(201);

    const availability = await request.get(`/api/events/${event._id}/performances/${performance._id}/availability`);
    expect(availability.status).toBe(200);
    expect(availability.body.seats.find((seat) => seat.seatId === seatId).booked).toBe(true);

    const deniedRead = await request.get(`/api/bookings/${created.body.booking._id}`).set('Authorization', 'Bearer ' + customerTokens[1]);
    const deniedCancel = await request.post(`/api/bookings/${created.body.booking._id}/cancel`).set('Authorization', 'Bearer ' + customerTokens[1]);
    expect(deniedRead.status).toBe(403);
    expect(deniedCancel.status).toBe(403);
    const ownerRead = await request.get(`/api/bookings/${created.body.booking._id}`).set('Authorization', 'Bearer ' + customerTokens[0]);
    const ownerList = await request.get('/api/bookings/mine').set('Authorization', 'Bearer ' + customerTokens[0]);
    expect(ownerRead.status).toBe(200);
    expect(ownerList.body.bookings.some((booking) => booking._id === created.body.booking._id)).toBe(true);

    const cancelled = await request.post(`/api/bookings/${created.body.booking._id}/cancel`).set('Authorization', 'Bearer ' + customerTokens[0]);
    expect(cancelled.status).toBe(200);
    const second = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[1])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seatId]));
    expect(second.status).toBe(201);
    expect(await SeatAllocation.countDocuments({ performanceId: performance._id, seatId, status: 'confirmed' })).toBe(1);
  });

  it('rejects client ownership and price fields and requires an idempotency key', async () => {
    const { event, performance } = await createPerformance({ capacity: 1 });
    const seatId = performance.seatMap.sections[0].rows[0].seats[0].id;
    const body = { ...bookingBody(event, performance, [seatId]), customerId: customerIds[2].toString(), totalPaise: 1 };
    const injected = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0]).send(body);
    const missingKey = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .send(bookingBody(event, performance, [seatId]));
    const invalidAvailability = await request.get('/api/events/not-an-id/performances/not-an-id/availability');
    const invalidSeat = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, ['not-a-seat-in-this-performance']));
    const invalidPerformance = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', idempotencyKey())
      .send({ eventId: event._id, performanceId: new mongoose.Types.ObjectId().toString(), seatIds: [seatId] });
    expect(injected.status).toBe(422);
    expect(missingKey.status).toBe(400);
    expect(invalidAvailability.status).toBe(422);
    expect(invalidSeat.status).toBe(422);
    expect(invalidPerformance.status).toBe(404);
    expect(await Booking.countDocuments({ eventId: event._id })).toBe(0);
  });

  it('cancels active bookings and releases matching inventory when a performance or event is cancelled', async () => {
    const assigned = await createPerformance({ capacity: 2 });
    const assignedSeatId = assigned.performance.seatMap.sections[0].rows[0].seats[0].id;
    const assignedBooking = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', idempotencyKey())
      .send(bookingBody(assigned.event, assigned.performance, [assignedSeatId]));
    expect(assignedBooking.status).toBe(201);

    const cancelledPerformance = await request.post(
      `/api/events/${assigned.event._id}/performances/${assigned.performance._id}/cancel`
    ).set(organizer);
    expect(cancelledPerformance.status).toBe(200);
    expect(cancelledPerformance.body.performance.status).toBe('cancelled');
    expect((await Booking.findById(assignedBooking.body.booking._id)).status).toBe('cancelled');
    expect(await SeatAllocation.countDocuments({
      bookingId: assignedBooking.body.booking._id,
      status: 'confirmed',
    })).toBe(0);
    const assignedAvailability = await request.get(
      `/api/events/${assigned.event._id}/performances/${assigned.performance._id}/availability`
    );
    expect(assignedAvailability.body.isBookable).toBe(false);

    const general = await createPerformance({ inventoryKind: 'general', capacity: 2, price: 350 });
    const generalBooking = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[1])
      .set('X-Idempotency-Key', idempotencyKey())
      .send({ eventId: general.event._id, performanceId: general.performance._id, quantity: 2 });
    expect(generalBooking.status).toBe(201);

    const cancelledEvent = await request.post(`/api/events/${general.event._id}/cancel`).set(organizer);
    expect(cancelledEvent.status).toBe(200);
    expect(cancelledEvent.body.event.status).toBe('cancelled');
    expect((await Booking.findById(generalBooking.body.booking._id)).status).toBe('cancelled');
    const eventAfterCancellation = await Event.findById(general.event._id).lean();
    expect(eventAfterCancellation.performances[0].status).toBe('cancelled');
    expect(eventAfterCancellation.performances[0].generalAdmission.soldQuantity).toBe(0);
  });

  it('serializes assigned-seat booking against event cancellation', async () => {
    const { event, performance } = await createPerformance({ capacity: 1 });
    const seatId = performance.seatMap.sections[0].rows[0].seats[0].id;
    const [bookingResponse, cancellationResponse] = await Promise.all([
      request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[2])
        .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seatId])),
      request.post(`/api/events/${event._id}/cancel`).set(organizer),
    ]);

    expect(cancellationResponse.status).toBe(200);
    expect([201, 409]).toContain(bookingResponse.status);
    const storedEvent = await Event.findById(event._id).lean();
    expect(storedEvent.status).toBe('cancelled');
    expect(await Booking.countDocuments({ eventId: event._id, status: 'confirmed' })).toBe(0);
    expect(await SeatAllocation.countDocuments({ eventId: event._id, status: 'confirmed' })).toBe(0);
  });

  it('keeps a booking and active allocation consistent during an overlapping cancel and rebook', async () => {
    const { event, performance } = await createPerformance({ capacity: 1 });
    const seatId = performance.seatMap.sections[0].rows[0].seats[0].id;
    const original = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seatId]));
    expect(original.status).toBe(201);

    const [cancelResponse, overlappingBooking] = await Promise.all([
      request.post(`/api/bookings/${original.body.booking._id}/cancel`).set('Authorization', 'Bearer ' + customerTokens[0]),
      request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[1])
        .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seatId])),
    ]);
    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.booking.status).toBe('cancelled');
    expect([201, 409]).toContain(overlappingBooking.status);

    if (overlappingBooking.status === 409) {
      const retry = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[1])
        .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seatId]));
      expect(retry.status).toBe(201);
    }
    const activeAllocations = await SeatAllocation.find({ performanceId: performance._id, seatId, status: 'confirmed' }).lean();
    expect(activeAllocations).toHaveLength(1);
    expect(activeAllocations[0].customerId.toString()).toBe(customerIds[1].toString());
    const originalStored = await Booking.findById(original.body.booking._id).lean();
    expect(originalStored.status).toBe('cancelled');
  });

  it('allows authorized admin support cancellation with an audit record and consistent seat release', async () => {
    const { event, performance } = await createPerformance({ capacity: 1 });
    const seatId = performance.seatMap.sections[0].rows[0].seats[0].id;
    const created = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [seatId]));
    expect(created.status).toBe(201);

    const cancelled = await request.post(`/api/admin/bookings/${created.body.booking._id}/cancel`)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.booking.status).toBe('cancelled');
    expect(await SeatAllocation.countDocuments({ performanceId: performance._id, seatId, status: 'confirmed' })).toBe(0);
    expect(await AdminAuditLog.countDocuments({ actorId: adminId, action: 'booking.cancel.support', resourceId: created.body.booking._id })).toBe(1);
  });

  it('keeps the same venue seat independent across performances and rejects non-customer booking roles', async () => {
    const { event, performance } = await createPerformance({ capacity: 1 });
    const startsAt = new Date(new Date(performance.startsAt).getTime() + 24 * 60 * 60 * 1000);
    const secondPerformanceResponse = await request.post(`/api/events/${event._id}/performances`).set(organizer).send({
      venueId: performance.venueId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      inventoryKind: 'assigned',
      priceTiers: [{ category: 'standard', price: 599 }],
    });
    expect(secondPerformanceResponse.status).toBe(201);
    const secondPerformance = secondPerformanceResponse.body.performance;
    const sharedSeatId = performance.seatMap.sections[0].rows[0].seats[0].id;
    const first = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[0])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [sharedSeatId]));
    const second = await request.post('/api/bookings').set('Authorization', 'Bearer ' + customerTokens[1])
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, secondPerformance, [sharedSeatId]));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const organizerAttempt = await request.post('/api/bookings').set(organizer)
      .set('X-Idempotency-Key', idempotencyKey()).send(bookingBody(event, performance, [sharedSeatId]));
    expect(organizerAttempt.status).toBe(403);
  });
});
