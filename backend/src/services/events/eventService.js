'use strict';

const mongoose = require('mongoose');
const { Event } = require('../../models/Event');
const { Venue } = require('../../models/Venue');
const { Booking } = require('../../models/Booking');
const { SeatAllocation } = require('../../models/SeatAllocation');
const { AdminAuditLog } = require('../../models/AdminAuditLog');
const { normalizeLayout } = require('./venueService');

function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function canManage(event, user) {
  return user.role === 'admin' || String(event.ownerId) === user.userId;
}

async function auditAdminChange(session, user, action, resourceType, resourceId, metadata) {
  if (user.role !== 'admin') return;
  await AdminAuditLog.create([{
    actorId: new mongoose.Types.ObjectId(user.userId),
    action,
    resourceType,
    resourceId,
    metadata,
  }], { session });
}

async function findManagedEvent(eventId, user) {
  const event = await Event.findById(eventId);
  if (!event) throw makeError('Event not found.', 404);
  if (!canManage(event, user)) throw makeError('You do not have access to this event.', 403);
  return event;
}

async function createEvent(input, user) {
  return Event.create({ ...input, ownerId: user.userId, status: 'draft' });
}

async function updateEvent(eventId, input, user) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const event = await Event.findById(eventId).session(session);
      if (!event) throw makeError('Event not found.', 404);
      if (!canManage(event, user)) throw makeError('You do not have access to this event.', 403);
      if (event.status === 'cancelled') throw makeError('Cancelled events cannot be edited.', 409);
      Object.assign(event, input);
      await event.save({ session });
      await auditAdminChange(session, user, 'event.details.update', 'event', event._id, { fields: Object.keys(input) });
      result = event;
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

function cleanSearch(value) {
  return value.replace(/["\\]/g, ' ').trim();
}

async function listPublicEvents(query) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 12, 50);
  const now = new Date();
  const filter = { status: 'published' };
  if (query.category) filter.category = query.category;
  const performanceFilter = { status: 'scheduled', startsAt: { $gt: now } };
  if (query.city) {
    const safeCity = query.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    performanceFilter['venueAddress.city'] = new RegExp('^' + safeCity + '$', 'i');
  }
  if (query.from || query.to) {
    if (query.from) performanceFilter.startsAt.$gte = new Date(query.from);
    if (query.to) performanceFilter.startsAt.$lte = new Date(query.to);
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const priceRange = {};
    if (query.minPrice !== undefined) priceRange.$gte = Number(query.minPrice);
    if (query.maxPrice !== undefined) priceRange.$lte = Number(query.maxPrice);
    performanceFilter.$or = [
      { 'generalAdmission.price': priceRange },
      { priceTiers: { $elemMatch: { price: priceRange } } },
    ];
  }
  filter.performances = { $elemMatch: performanceFilter };
  const search = query.search ? cleanSearch(query.search) : '';
  if (search) filter.$text = { $search: search };
  const performanceConditions = [
    { $eq: ['$$performance.status', 'scheduled'] },
    { $gt: ['$$performance.startsAt', now] },
  ];
  if (query.city) {
    performanceConditions.push({
      $regexMatch: {
        input: '$$performance.venueAddress.city',
        regex: query.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        options: 'i',
      },
    });
  }
  if (query.from) performanceConditions.push({ $gte: ['$$performance.startsAt', new Date(query.from)] });
  if (query.to) performanceConditions.push({ $lte: ['$$performance.startsAt', new Date(query.to)] });
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const rangeConditions = [];
    if (query.minPrice !== undefined) rangeConditions.push({ $gte: ['$$price.price', Number(query.minPrice)] });
    if (query.maxPrice !== undefined) rangeConditions.push({ $lte: ['$$price.price', Number(query.maxPrice)] });
    const qualifyingTiers = {
      $filter: {
        input: { $ifNull: ['$$performance.priceTiers', []] },
        as: 'price',
        cond: { $and: rangeConditions.length ? rangeConditions : [true] },
      },
    };
    const generalPriceConditions = [{ $eq: ['$$performance.inventoryKind', 'general'] }];
    if (query.minPrice !== undefined) generalPriceConditions.push({ $gte: ['$$performance.generalAdmission.price', Number(query.minPrice)] });
    if (query.maxPrice !== undefined) generalPriceConditions.push({ $lte: ['$$performance.generalAdmission.price', Number(query.maxPrice)] });
    performanceConditions.push({
      $or: [
        { $and: generalPriceConditions },
        { $gt: [{ $size: qualifyingTiers }, 0] },
      ],
    });
  }

  const priceForPerformance = {
    $cond: [
      { $eq: ['$$performance.inventoryKind', 'general'] },
      '$$performance.generalAdmission.price',
      { $min: '$$performance.priceTiers.price' },
    ],
  };
  const sortOptions = {
    dateAsc: { nextPerformanceStartsAt: 1, _id: 1 },
    dateDesc: { nextPerformanceStartsAt: -1, _id: 1 },
    priceAsc: { nextPerformancePrice: 1, nextPerformanceStartsAt: 1, _id: 1 },
    priceDesc: { nextPerformancePrice: -1, nextPerformanceStartsAt: 1, _id: 1 },
    title: { title: 1, _id: 1 },
    newest: { publishedAt: -1, _id: 1 },
  };
  const sort = query.sort
    ? sortOptions[query.sort]
    : search
      ? { score: { $meta: 'textScore' }, nextPerformanceStartsAt: 1 }
      : sortOptions.dateAsc;
  const pipeline = [
    { $match: filter },
    {
      $addFields: {
        nextPerformanceStartsAt: {
          $min: {
            $map: {
              input: {
                $filter: {
                  input: '$performances',
                  as: 'performance',
                  cond: { $and: performanceConditions },
                },
              },
              as: 'performance',
              in: '$$performance.startsAt',
            },
          },
        },
        nextPerformancePrice: {
          $min: {
            $map: {
              input: {
                $filter: {
                  input: '$performances',
                  as: 'performance',
                  cond: { $and: performanceConditions },
                },
              },
              as: 'performance',
              in: priceForPerformance,
            },
          },
        },
      },
    },
    { $sort: sort },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    { $unset: [
      'nextPerformanceStartsAt',
      'nextPerformancePrice',
      'ownerId',
      '__v',
      'performances.generalAdmission.soldQuantity',
      'performances.inventoryRevision',
    ] },
  ];

  const [items, total] = await Promise.all([
    Event.aggregate(pipeline),
    Event.countDocuments(filter),
  ]);
  return { items, page, limit, total, pages: Math.ceil(total / limit) };
}

async function getPublicEvent(eventId) {
  const event = await Event.findOne({ _id: eventId, status: 'published' }).lean();
  if (!event) throw makeError('Event not found.', 404);
  delete event.ownerId;
  delete event.__v;
  for (const performance of event.performances || []) {
    if (performance.generalAdmission) delete performance.generalAdmission.soldQuantity;
    delete performance.inventoryRevision;
  }
  return event;
}

async function listOrganizerEvents(user, query = {}) {
  const filter = user.role === 'admin' ? {} : { ownerId: user.userId };
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 50, 100);
  const aggregateFilter = user.role === 'admin'
    ? {}
    : { ownerId: new mongoose.Types.ObjectId(user.userId) };
  const [events, total, groupedStatuses] = await Promise.all([
    Event.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Event.countDocuments(filter),
    Event.aggregate([
      { $match: aggregateFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  const counts = { draft: 0, published: 0, cancelled: 0 };
  groupedStatuses.forEach((item) => { counts[item._id] = item.count; });
  const eventIds = events.map((event) => event._id);
  const bookingMetrics = eventIds.length
    ? await Booking.aggregate([
      { $match: { eventId: { $in: eventIds }, status: 'confirmed' } },
      {
        $group: {
          _id: '$eventId',
          bookingCount: { $sum: 1 },
          ticketsSold: { $sum: '$quantity' },
          revenuePaise: { $sum: '$totalPaise' },
        },
      },
    ])
    : [];
  const metricsByEvent = new Map(bookingMetrics.map((item) => [String(item._id), item]));
  const eventsWithMetrics = events.map((event) => {
    const metrics = metricsByEvent.get(String(event._id));
    return {
      ...event,
      metrics: {
        bookingCount: metrics?.bookingCount || 0,
        ticketsSold: metrics?.ticketsSold || 0,
        revenuePaise: metrics?.revenuePaise || 0,
      },
    };
  });
  return { events: eventsWithMetrics, page, limit, total, pages: Math.ceil(total / limit), counts };
}

async function getOrganizerEvent(eventId, user) {
  return findManagedEvent(eventId, user);
}

function normalizedSeatMap(layout) {
  const stableLayout = normalizeLayout(layout.toObject ? layout.toObject() : layout, null);
  return { sections: stableLayout.sections };
}

function categoryNames(layout) {
  const names = new Set();
  for (const section of layout.sections || []) {
    for (const row of section.rows || []) {
      for (const seat of row.seats || []) {
        if (!seat.blocked) names.add(seat.category);
      }
    }
  }
  return [...names].sort();
}

function isPriceTierSetValid(tiers, categories) {
  if (!Array.isArray(tiers)) return false;
  const requested = tiers.map((tier) => tier.category.toLowerCase()).sort();
  const expected = categories.map((category) => category.toLowerCase()).sort();
  return requested.length === expected.length && requested.every((category, index) => category === expected[index]);
}

async function addPerformance(eventId, input, user) {
  const event = await findManagedEvent(eventId, user);
  if (event.status === 'cancelled') throw makeError('Cancelled events cannot receive performances.', 409);
  if (input.startsAt <= new Date()) throw makeError('A performance must start in the future.', 422);

  const venue = await Venue.findById(input.venueId);
  if (!venue || !venue.isActive) throw makeError('Choose an active venue.', 422);
  if (String(venue.ownerId) !== String(event.ownerId) && user.role !== 'admin') {
    throw makeError('A performance must use a venue owned by this organizer.', 403);
  }
  if (venue.inventoryKind !== 'mixed' && venue.inventoryKind !== input.inventoryKind) {
    throw makeError('This venue is not configured for the selected inventory type.', 422);
  }

  const venueAddress = venue.address.toObject();
  const overlaps = event.performances.some((performance) =>
    performance.status === 'scheduled' &&
    String(performance.venueId) === String(venue._id) &&
    input.startsAt < performance.endsAt && input.endsAt > performance.startsAt
  );
  if (overlaps) throw makeError('This event already has a performance at this venue during that time.', 409);

  const performance = {
    label: input.label,
    venueId: venue._id,
    venueLayoutVersion: venue.layoutVersion,
    venueName: venue.name,
    venueAddress,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    inventoryKind: input.inventoryKind,
    status: 'scheduled',
  };

  if (input.inventoryKind === 'general') {
    if (input.capacity > venue.capacity) throw makeError('General admission capacity cannot exceed the venue capacity.', 422);
    performance.generalAdmission = { capacity: input.capacity, price: input.price, currency: 'INR' };
    performance.seatMap = { sections: [] };
    performance.priceTiers = [];
  } else {
    const seatMap = normalizedSeatMap(venue.layout);
    const categories = categoryNames(seatMap);
    if (!categories.length) throw makeError('This venue has no available seats in its layout.', 422);
    if (!isPriceTierSetValid(input.priceTiers, categories)) {
      throw makeError('Provide exactly one price for every active seat category: ' + categories.join(', ') + '.', 422);
    }
    performance.seatMap = seatMap;
    performance.priceTiers = input.priceTiers.map((tier) => ({ ...tier, currency: 'INR' }));
    performance.generalAdmission = undefined;
  }

  event.performances.push(performance);
  await event.save();
  return event.performances[event.performances.length - 1];
}

async function updatePerformance(eventId, performanceId, input, user) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const event = await Event.findById(eventId).session(session);
      if (!event) throw makeError('Event not found.', 404);
      if (!canManage(event, user)) throw makeError('You do not have access to this event.', 403);
      if (event.status === 'cancelled') throw makeError('Cancelled events cannot be edited.', 409);
      const performance = event.performances.id(performanceId);
      if (!performance) throw makeError('Performance not found.', 404);
      if (performance.status === 'cancelled') throw makeError('Cancelled performances cannot be edited.', 409);

      const nextStartsAt = input.startsAt || performance.startsAt;
      const nextEndsAt = input.endsAt || performance.endsAt;
      if (nextStartsAt <= new Date()) throw makeError('A performance must start in the future.', 422);
      if (nextEndsAt <= nextStartsAt) throw makeError('End time must be after the start time.', 422);

      const otherOverlap = event.performances.some((item) =>
        String(item._id) !== String(performance._id) &&
        item.status === 'scheduled' &&
        String(item.venueId) === String(performance.venueId) &&
        nextStartsAt < item.endsAt && nextEndsAt > item.startsAt
      );
      if (otherOverlap) throw makeError('This event already has a performance at this venue during that time.', 409);

      if (input.label !== undefined) performance.label = input.label;
      performance.startsAt = nextStartsAt;
      performance.endsAt = nextEndsAt;

      if (performance.inventoryKind === 'general') {
        const venue = await Venue.findById(performance.venueId).session(session);
        const capacity = input.capacity ?? performance.generalAdmission.capacity;
        if (!venue || capacity > venue.capacity) throw makeError('General admission capacity cannot exceed the venue capacity.', 422);
        if (capacity < (performance.generalAdmission.soldQuantity || 0)) {
          throw makeError('Capacity cannot be lower than the number of tickets already booked.', 409);
        }
        if (input.capacity !== undefined) performance.generalAdmission.capacity = input.capacity;
        if (input.price !== undefined) performance.generalAdmission.price = input.price;
      } else if (input.priceTiers !== undefined) {
        const categories = categoryNames(performance.seatMap);
        if (!isPriceTierSetValid(input.priceTiers, categories)) {
          throw makeError('Provide exactly one price for every active seat category: ' + categories.join(', ') + '.', 422);
        }
        performance.priceTiers = input.priceTiers.map((tier) => ({ ...tier, currency: 'INR' }));
      }

      await event.save({ session });
      result = event.performances.id(performanceId);
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

async function publishEvent(eventId, user) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const event = await Event.findById(eventId).session(session);
      if (!event) throw makeError('Event not found.', 404);
      if (!canManage(event, user)) throw makeError('You do not have access to this event.', 403);
      if (event.status === 'cancelled') throw makeError('Cancelled events cannot be published.', 409);
      const now = new Date();
      const hasUpcomingPerformance = event.performances.some(
        (performance) => performance.status === 'scheduled' && performance.startsAt > now && performance.endsAt > performance.startsAt
      );
      if (!hasUpcomingPerformance) throw makeError('Add at least one valid future performance before publishing.', 422);
      const previousStatus = event.status;
      event.status = 'published';
      event.publishedAt = event.publishedAt || now;
      await event.save({ session });
      if (previousStatus !== 'published') {
        await auditAdminChange(session, user, 'event.publish', 'event', event._id, { previousStatus, nextStatus: 'published' });
      }
      result = event;
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

async function cancelPerformanceBookings(event, performances, session, cancelledAt) {
  const performanceIds = performances.map((performance) => performance._id);
  const activeBookings = await Booking.find({
    eventId: event._id,
    performanceId: { $in: performanceIds },
    status: 'confirmed',
  }).select('_id performanceId inventoryKind quantity').session(session).lean();

  const bookingsByPerformance = new Map();
  for (const booking of activeBookings) {
    const key = String(booking.performanceId);
    const total = bookingsByPerformance.get(key) || { quantity: 0, assignedQuantity: 0, generalQuantity: 0 };
    total.quantity += booking.quantity;
    if (booking.inventoryKind === 'assigned') total.assignedQuantity += booking.quantity;
    if (booking.inventoryKind === 'general') total.generalQuantity += booking.quantity;
    bookingsByPerformance.set(key, total);
  }

  for (const performance of performances) {
    const totals = bookingsByPerformance.get(String(performance._id)) || { quantity: 0, assignedQuantity: 0, generalQuantity: 0 };
    if (performance.inventoryKind === 'general') {
      const soldQuantity = performance.generalAdmission?.soldQuantity || 0;
      if (totals.generalQuantity !== totals.quantity || soldQuantity !== totals.generalQuantity) {
        throw makeError('General admission inventory is inconsistent. The performance was not cancelled.', 409);
      }
      performance.generalAdmission.soldQuantity = 0;
    } else if (totals.assignedQuantity !== totals.quantity) {
      throw makeError('Assigned inventory is inconsistent. The performance was not cancelled.', 409);
    }
  }

  if (!activeBookings.length) return;
  const bookingIds = activeBookings.map((booking) => booking._id);
  const changedBookings = await Booking.updateMany({
    _id: { $in: bookingIds },
    status: 'confirmed',
  }, { $set: { status: 'cancelled', cancelledAt } }, { session });
  if (changedBookings.modifiedCount !== activeBookings.length) {
    throw makeError('Booking records could not be safely cancelled.', 409);
  }

  const assignedBookingIds = activeBookings
    .filter((booking) => booking.inventoryKind === 'assigned')
    .map((booking) => booking._id);
  if (assignedBookingIds.length) {
    const expectedAllocations = activeBookings
      .filter((booking) => booking.inventoryKind === 'assigned')
      .reduce((total, booking) => total + booking.quantity, 0);
    const released = await SeatAllocation.updateMany({
      bookingId: { $in: assignedBookingIds },
      status: 'confirmed',
    }, { $set: { status: 'cancelled', cancelledAt } }, { session });
    if (released.modifiedCount !== expectedAllocations) {
      throw makeError('Seat allocations could not be safely released.', 409);
    }
  }
}

async function cancelEvent(eventId, user) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const event = await Event.findById(eventId).session(session);
      if (!event) throw makeError('Event not found.', 404);
      if (!canManage(event, user)) throw makeError('You do not have access to this event.', 403);
      if (event.status === 'cancelled') {
        result = event;
        return;
      }
      const previousStatus = event.status;
      const cancelledAt = new Date();
      await cancelPerformanceBookings(event, event.performances, session, cancelledAt);
      event.status = 'cancelled';
      for (const performance of event.performances) performance.status = 'cancelled';
      await event.save({ session });
      await auditAdminChange(session, user, 'event.cancel', 'event', event._id, { previousStatus, nextStatus: 'cancelled' });
      result = event;
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

async function cancelPerformance(eventId, performanceId, user) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const event = await Event.findById(eventId).session(session);
      if (!event) throw makeError('Event not found.', 404);
      if (!canManage(event, user)) throw makeError('You do not have access to this event.', 403);
      const performance = event.performances.id(performanceId);
      if (!performance) throw makeError('Performance not found.', 404);
      const previousStatus = performance.status;
      if (previousStatus !== 'cancelled') {
        await cancelPerformanceBookings(event, [performance], session, new Date());
      }
      performance.status = 'cancelled';
      await event.save({ session });
      if (previousStatus !== 'cancelled') {
        await auditAdminChange(session, user, 'performance.cancel', 'event', event._id, { performanceId: String(performance._id), previousStatus, nextStatus: 'cancelled' });
      }
      result = performance;
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

module.exports = {
  createEvent,
  updateEvent,
  listPublicEvents,
  getPublicEvent,
  listOrganizerEvents,
  getOrganizerEvent,
  addPerformance,
  updatePerformance,
  publishEvent,
  cancelEvent,
  cancelPerformance,
};
