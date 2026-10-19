'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const { Booking } = require('../../models/Booking');
const { SeatAllocation } = require('../../models/SeatAllocation');
const { Event } = require('../../models/Event');
const { AdminAuditLog } = require('../../models/AdminAuditLog');

function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function toPaise(price) {
  const value = Math.round((Number(price) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(value) || value < 0) throw makeError('The configured price is invalid.', 422);
  return value;
}

function requestHash(input) {
  const payload = input.seatIds
    ? { eventId: input.eventId, performanceId: input.performanceId, seatIds: [...input.seatIds].sort() }
    : { eventId: input.eventId, performanceId: input.performanceId, quantity: input.quantity };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function bookingReference() {
  return 'EH-' + crypto.randomBytes(7).toString('hex').toUpperCase();
}

function snapshotFor(event, performance) {
  return {
    eventSnapshot: {
      title: event.title,
      category: event.category,
      posterUrl: event.posterUrl,
    },
    performanceSnapshot: {
      label: performance.label,
      startsAt: performance.startsAt,
      endsAt: performance.endsAt,
      venueName: performance.venueName,
      venueAddress: performance.venueAddress?.toObject
        ? performance.venueAddress.toObject()
        : performance.venueAddress,
    },
  };
}

function flattenSeats(performance) {
  const result = [];
  for (const section of performance.seatMap?.sections || []) {
    for (const row of section.rows || []) {
      for (const seat of row.seats || []) {
        result.push({ ...seat, sectionName: section.name, rowLabel: row.label });
      }
    }
  }
  return result;
}

async function findIdempotentBooking(customerId, key, hash) {
  const prior = await Booking.findOne({ customerId, idempotencyKey: key }).lean();
  if (prior && prior.requestHash !== hash) {
    throw makeError('This idempotency key was already used for a different booking request.', 409);
  }
  return prior;
}

async function createBooking(input, user, idempotencyKey) {
  const customerId = new mongoose.Types.ObjectId(user.userId);
  const hash = requestHash(input);
  const existing = await findIdempotentBooking(customerId, idempotencyKey, hash);
  if (existing) return { booking: existing, replayed: true };

  const session = await mongoose.startSession();
  let result;
  const reference = bookingReference();
  try {
    await session.withTransaction(async () => {
      const duplicate = await Booking.findOne({ customerId, idempotencyKey }).session(session).lean();
      if (duplicate) {
        if (duplicate.requestHash !== hash) {
          throw makeError('This idempotency key was already used for a different booking request.', 409);
        }
        result = { booking: duplicate, replayed: true };
        return;
      }

      const event = await Event.findById(input.eventId).session(session);
      if (!event) throw makeError('Event not found.', 404);
      if (event.status !== 'published') throw makeError('This event is not open for booking.', 409);
      const performance = event.performances.id(input.performanceId);
      if (!performance) throw makeError('Performance not found.', 404);
      if (performance.status !== 'scheduled' || performance.startsAt <= new Date()) {
        throw makeError('This performance is no longer bookable.', 409);
      }

      let seats = [];
      let quantity;
      let unitPricePaise;
      let ticketType;

      if (performance.inventoryKind === 'assigned') {
        if (!input.seatIds) throw makeError('Choose seats for this assigned-seating performance.', 422);
        const allSeats = flattenSeats(performance.toObject());
        const seatById = new Map(allSeats.map((seat) => [seat.id, seat]));
        seats = input.seatIds.map((seatId) => {
          const seat = seatById.get(seatId);
          if (!seat) throw makeError('One or more selected seats are not part of this performance.', 422);
          if (seat.blocked) throw makeError('Blocked seats cannot be booked.', 422);
          const tier = performance.priceTiers.find((item) => item.category.toLowerCase() === seat.category.toLowerCase());
          if (!tier) throw makeError('A selected seat has no configured price.', 422);
          return {
            seatId: seat.id,
            label: seat.label,
            sectionName: seat.sectionName,
            rowLabel: seat.rowLabel,
            category: seat.category,
            accessible: Boolean(seat.accessible),
            unitPricePaise: toPaise(tier.price),
          };
        });
        quantity = seats.length;
        const seatPrices = new Set(seats.map((seat) => seat.unitPricePaise));
        if (seatPrices.size === 1) unitPricePaise = seats[0].unitPricePaise;

        // Touch the event document in the same transaction as the allocation.
        // Event/performance cancellation writes the same document, so either
        // operation serializes before the other or MongoDB retries the loser.
        const inventoryTouched = await Event.updateOne({
          _id: event._id,
          status: 'published',
          performances: {
            $elemMatch: {
              _id: performance._id,
              status: 'scheduled',
              inventoryKind: 'assigned',
              startsAt: { $gt: new Date() },
            },
          },
        }, {
          $inc: { 'performances.$.inventoryRevision': 1 },
        }, { session });
        if (inventoryTouched.modifiedCount !== 1) {
          throw makeError('This performance is no longer bookable. Please refresh availability.', 409);
        }
      } else {
        if (input.quantity === undefined) throw makeError('Choose a ticket quantity for this general-admission performance.', 422);
        if (input.seatIds) throw makeError('General-admission performances do not have assigned seats.', 422);
        quantity = input.quantity;
        ticketType = 'General admission';
        unitPricePaise = toPaise(performance.generalAdmission.price);

        const capacity = performance.generalAdmission.capacity;
        const canAllocate = await Event.updateOne({
          _id: event._id,
          status: 'published',
          performances: {
            $elemMatch: {
              _id: performance._id,
              status: 'scheduled',
              startsAt: { $gt: new Date() },
              inventoryKind: 'general',
              'generalAdmission.capacity': { $eq: capacity, $gte: quantity },
              $or: [
                { 'generalAdmission.soldQuantity': { $lte: capacity - quantity } },
                { 'generalAdmission.soldQuantity': { $exists: false } },
              ],
            },
          },
        }, {
          $inc: { 'performances.$.generalAdmission.soldQuantity': quantity },
        }, { session });
        if (canAllocate.modifiedCount !== 1) {
          throw makeError('Tickets were just booked or the remaining quantity is too low. Please refresh availability.', 409);
        }
      }

      const snapshots = snapshotFor(event, performance);
      const booking = new Booking({
        bookingReference: reference,
        customerId,
        eventId: event._id,
        performanceId: performance._id,
        idempotencyKey,
        requestHash: hash,
        inventoryKind: performance.inventoryKind,
        seats,
        ticketType,
        quantity,
        unitPricePaise,
        totalPaise: performance.inventoryKind === 'assigned'
          ? seats.reduce((sum, seat) => sum + seat.unitPricePaise, 0)
          : unitPricePaise * quantity,
        ...snapshots,
      });
      await booking.save({ session });

      if (performance.inventoryKind === 'assigned') {
        await SeatAllocation.insertMany(seats.map((seat) => ({
          performanceId: performance._id,
          eventId: event._id,
          seatId: seat.seatId,
          bookingId: booking._id,
          customerId,
          status: 'confirmed',
        })), { session, ordered: true });
      }
      result = { booking, replayed: false };
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
      maxCommitTimeMS: 10000,
    });
    return result;
  } catch (error) {
    if (error.code === 11000) {
      const replay = await findIdempotentBooking(customerId, idempotencyKey, hash);
      if (replay) return { booking: replay, replayed: true };
      throw makeError('One or more selected seats were just booked. Please refresh availability.', 409);
    }
    if (error.code === 112 || error.hasErrorLabel?.('TransientTransactionError')) {
      throw makeError('Inventory changed during booking. Please refresh availability and try again.', 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function getPerformanceAvailability(eventId, performanceId) {
  const event = await Event.findOne({ _id: eventId, status: 'published' }).lean();
  if (!event) throw makeError('Published event not found.', 404);
  const performance = (event.performances || []).find((item) => String(item._id) === performanceId);
  if (!performance) throw makeError('Performance not found.', 404);

  const isBookable = performance.status === 'scheduled' && new Date(performance.startsAt) > new Date();
  if (performance.inventoryKind === 'general') {
    const sold = performance.generalAdmission?.soldQuantity || 0;
    const capacity = performance.generalAdmission?.capacity || 0;
    return {
      eventId: event._id,
      performanceId: performance._id,
      inventoryKind: 'general',
      isBookable,
      performance: {
        label: performance.label,
        startsAt: performance.startsAt,
        endsAt: performance.endsAt,
        venueName: performance.venueName,
        venueAddress: performance.venueAddress,
      },
      generalAdmission: {
        ticketType: 'General admission',
        capacity,
        sold,
        available: Math.max(0, capacity - sold),
        price: performance.generalAdmission?.price,
        currency: performance.generalAdmission?.currency || 'INR',
      },
    };
  }

  const bookedIds = new Set(await SeatAllocation.find({
    performanceId: performance._id,
    status: 'confirmed',
  }).distinct('seatId'));
  const tiers = new Map((performance.priceTiers || []).map((tier) => [tier.category.toLowerCase(), tier.price]));
  const seats = flattenSeats(performance).map((seat) => {
    const booked = bookedIds.has(seat.id);
    return {
      seatId: seat.id,
      label: seat.label,
      sectionName: seat.sectionName,
      rowLabel: seat.rowLabel,
      category: seat.category,
      accessible: Boolean(seat.accessible),
      blocked: Boolean(seat.blocked),
      booked,
      available: isBookable && !seat.blocked && !booked,
      price: tiers.get(String(seat.category).toLowerCase()),
      currency: 'INR',
    };
  });
  return {
    eventId: event._id,
    performanceId: performance._id,
    inventoryKind: 'assigned',
    isBookable,
    performance: {
      label: performance.label,
      startsAt: performance.startsAt,
      endsAt: performance.endsAt,
      venueName: performance.venueName,
      venueAddress: performance.venueAddress,
    },
    seatMap: performance.seatMap,
    seats,
  };
}

async function listCustomerBookings(user, query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 50);
  const filter = { customerId: user.userId };
  const [bookings, total] = await Promise.all([
    Booking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);
  return { bookings, page, limit, total, pages: Math.ceil(total / limit) };
}

async function listOrganizerEventBookings(eventId, user, query = {}) {
  const event = await Event.findById(eventId).lean();
  if (!event) throw makeError('Event not found.', 404);
  if (user.role !== 'admin' && String(event.ownerId) !== user.userId) {
    throw makeError('You do not have access to this event.', 403);
  }
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 50, 100);
  const filter = { eventId: event._id };
  const [bookings, total, metrics] = await Promise.all([
    Booking.find(filter).select('-customerId -idempotencyKey -requestHash -__v')
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments(filter),
    Booking.aggregate([
      { $match: { eventId: event._id, status: 'confirmed' } },
      {
        $group: {
          _id: null,
          bookingCount: { $sum: 1 },
          ticketsSold: { $sum: '$quantity' },
          revenuePaise: { $sum: '$totalPaise' },
        },
      },
    ]),
  ]);
  return {
    event: { _id: event._id, title: event.title, status: event.status },
    bookings,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    metrics: metrics[0] ? {
      bookingCount: metrics[0].bookingCount,
      ticketsSold: metrics[0].ticketsSold,
      revenuePaise: metrics[0].revenuePaise,
    } : { bookingCount: 0, ticketsSold: 0, revenuePaise: 0 },
  };
}

async function getCustomerBooking(bookingId, user) {
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) throw makeError('Booking not found.', 404);
  if (String(booking.customerId) !== user.userId) throw makeError('You do not have access to this booking.', 403);
  return booking;
}

async function cancelCustomerBooking(bookingId, user, adminSupport = false) {
  if (adminSupport && user.role !== 'admin') {
    throw makeError('You do not have permission to perform this action.', 403);
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const booking = await Booking.findById(bookingId).session(session);
      if (!booking) throw makeError('Booking not found.', 404);
      if (!adminSupport && String(booking.customerId) !== user.userId) throw makeError('You do not have access to this booking.', 403);
      if (booking.status === 'cancelled') {
        result = booking;
        return;
      }
      if (booking.performanceSnapshot.startsAt <= new Date()) {
        throw makeError('This booking can no longer be cancelled.', 409);
      }

      const cancelledAt = new Date();
      const changed = await Booking.updateOne({ _id: booking._id, status: 'confirmed' }, {
        $set: { status: 'cancelled', cancelledAt },
      }, { session });
      if (changed.modifiedCount !== 1) throw makeError('Booking status changed. Refresh and try again.', 409);

      if (booking.inventoryKind === 'assigned') {
        const released = await SeatAllocation.updateMany({
          bookingId: booking._id,
          status: 'confirmed',
        }, { $set: { status: 'cancelled', cancelledAt } }, { session });
        if (released.modifiedCount !== booking.quantity) {
          throw makeError('Seat allocation could not be safely released.', 409);
        }
      } else {
        const restored = await Event.updateOne({
          _id: booking.eventId,
          performances: {
            $elemMatch: {
              _id: booking.performanceId,
              inventoryKind: 'general',
              'generalAdmission.soldQuantity': { $gte: booking.quantity },
            },
          },
        }, {
          $inc: { 'performances.$.generalAdmission.soldQuantity': -booking.quantity },
        }, { session });
        if (restored.modifiedCount !== 1) throw makeError('Ticket inventory could not be safely released.', 409);
      }

      if (adminSupport) {
        await AdminAuditLog.create([{
          actorId: new mongoose.Types.ObjectId(user.userId),
          action: 'booking.cancel.support',
          resourceType: 'booking',
          resourceId: booking._id,
          metadata: { bookingReference: booking.bookingReference, previousStatus: 'confirmed', nextStatus: 'cancelled' },
        }], { session });
      }

      result = await Booking.findById(booking._id).session(session);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
      maxCommitTimeMS: 10000,
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function cancelAdminBooking(bookingId, user) {
  return cancelCustomerBooking(bookingId, user, true);
}

module.exports = {
  createBooking,
  getPerformanceAvailability,
  listCustomerBookings,
  listOrganizerEventBookings,
  getCustomerBooking,
  cancelCustomerBooking,
  cancelAdminBooking,
};
