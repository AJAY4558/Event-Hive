'use strict';

const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
}, { timestamps: true });

favoriteSchema.index({ customerId: 1, eventId: 1 }, { unique: true, name: 'uniq_customer_favorite' });
favoriteSchema.index({ customerId: 1, createdAt: -1 });

const Favorite = mongoose.models.Favorite || mongoose.model('Favorite', favoriteSchema);

module.exports = { Favorite };
