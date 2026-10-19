'use strict';

const mongoose = require('mongoose');
const { Event } = require('../../models/Event');
const { Favorite } = require('../../models/Favorite');

function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function listFavorites(user) {
  const favorites = await Favorite.find({ customerId: user.userId }).sort({ createdAt: -1 }).lean();
  if (!favorites.length) return { favorites: [] };
  const events = await Event.find({
    _id: { $in: favorites.map((favorite) => favorite.eventId) },
    status: 'published',
  }).select('-ownerId -__v -performances.generalAdmission.soldQuantity -performances.inventoryRevision').lean();
  const byId = new Map(events.map((event) => [String(event._id), event]));
  return {
    favorites: favorites.flatMap((favorite) => {
      const event = byId.get(String(favorite.eventId));
      return event ? [{ eventId: favorite.eventId, createdAt: favorite.createdAt, event }] : [];
    }),
  };
}

async function addFavorite(eventId, user) {
  const event = await Event.findOne({ _id: eventId, status: 'published' }).select('_id').lean();
  if (!event) throw makeError('Published event not found.', 404);
  const filter = { customerId: new mongoose.Types.ObjectId(user.userId), eventId: event._id };
  const update = await Favorite.updateOne(filter, { $setOnInsert: filter }, { upsert: true });
  const favorite = await Favorite.findOne(filter).lean();
  return { favorite, created: update.upsertedCount === 1 };
}

async function removeFavorite(eventId, user) {
  const result = await Favorite.deleteOne({ customerId: user.userId, eventId });
  return { removed: result.deletedCount === 1 };
}

module.exports = { listFavorites, addFavorite, removeFavorite };
