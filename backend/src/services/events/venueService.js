'use strict';

const { randomUUID } = require('crypto');
const { Venue } = require('../../models/Venue');
const { Event } = require('../../models/Event');
const { venueDetails } = require('./eventValidation');

function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hasAccess(venue, user) {
  return user.role === 'admin' || String(venue.ownerId) === user.userId;
}

function previousLayoutMap(layout) {
  const sections = new Map();
  for (const section of layout?.sections || []) {
    const rows = new Map();
    for (const row of section.rows || []) {
      if (row.id) rows.set(row.id, row);
      rows.set(row.label, row);
    }
    const savedSection = { ...section, rowMap: rows };
    if (section.id) sections.set(section.id, savedSection);
    sections.set(section.name, savedSection);
  }
  return sections;
}

function normalizeLayout(layout, previousLayout) {
  const oldSections = previousLayoutMap(previousLayout);
  return {
    stageLabel: layout.stageLabel || 'Stage',
    sections: (layout.sections || []).map((section) => {
      const oldSection = oldSections.get(section.id || section.name);
      const oldRows = oldSection?.rowMap || new Map();
      return {
        id: section.id || oldSection?.id || randomUUID(),
        name: section.name,
        rows: (section.rows || []).map((row) => {
          const oldRow = oldRows.get(row.id || row.label);
          const oldSeats = new Map();
          for (const seat of oldRow?.seats || []) {
            if (seat.id) oldSeats.set(seat.id, seat);
            oldSeats.set(seat.label, seat);
          }
          return {
            id: row.id || oldRow?.id || randomUUID(),
            label: row.label,
            aisleAfter: row.aisleAfter || [],
            seats: (row.seats || []).map((seat) => {
              const oldSeat = oldSeats.get(seat.id || seat.label);
              return {
                id: seat.id || oldSeat?.id || randomUUID(),
                label: seat.label,
                number: seat.number,
                category: seat.category || 'standard',
                accessible: Boolean(seat.accessible),
                blocked: Boolean(seat.blocked),
              };
            }),
          };
        }),
      };
    }),
  };
}

function seatCount(layout) {
  return (layout.sections || []).reduce(
    (total, section) => total + section.rows.reduce((sectionTotal, row) => sectionTotal + row.seats.length, 0),
    0
  );
}

async function listVenues(user) {
  const filter = user.role === 'admin' ? {} : { ownerId: user.userId };
  return Venue.find(filter).sort({ updatedAt: -1 }).lean();
}

async function getVenue(venueId, user) {
  const venue = await Venue.findById(venueId);
  if (!venue) throw makeError('Venue not found.', 404);
  if (!hasAccess(venue, user)) throw makeError('You do not have access to this venue.', 403);
  return venue;
}

async function createVenue(input, user) {
  const layout = normalizeLayout(input.layout, null);
  return Venue.create({ ...input, layout, ownerId: user.userId });
}

async function updateVenue(venueId, input, user) {
  const venue = await getVenue(venueId, user);
  const merged = {
    name: input.name ?? venue.name,
    address: input.address ?? (venue.address.toObject ? venue.address.toObject() : venue.address),
    capacity: input.capacity ?? venue.capacity,
    inventoryKind: input.inventoryKind ?? venue.inventoryKind,
    layout: input.layout ?? (venue.layout.toObject ? venue.layout.toObject() : venue.layout),
  };
  const result = venueDetails.safeParse(merged);
  if (!result.success) {
    throw makeError(result.error.issues.map((issue) => issue.message).join(' '), 422);
  }

  const previousLayout = venue.layout.toObject ? venue.layout.toObject() : venue.layout;
  if (input.name !== undefined) venue.name = input.name;
  if (input.address !== undefined) venue.address = input.address;
  if (input.capacity !== undefined) venue.capacity = input.capacity;
  if (input.inventoryKind !== undefined) venue.inventoryKind = input.inventoryKind;
  if (input.layout !== undefined) {
    venue.layout = normalizeLayout(input.layout, previousLayout);
    venue.layoutVersion += 1;
  }
  await venue.save();
  return venue;
}

async function deactivateVenue(venueId, user) {
  const venue = await getVenue(venueId, user);
  const now = new Date();
  const activeEvents = await Event.exists({
    status: { $in: ['draft', 'published'] },
    performances: { $elemMatch: { venueId: venue._id, status: 'scheduled', endsAt: { $gt: now } } },
  });
  if (activeEvents) {
    throw makeError('This venue is used by a scheduled performance. Cancel or move those performances before deactivating it.', 409);
  }
  venue.isActive = false;
  await venue.save();
  return venue;
}

module.exports = { listVenues, getVenue, createVenue, updateVenue, deactivateVenue, normalizeLayout, seatCount };
