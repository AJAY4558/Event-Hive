'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const seatSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    number: { type: Number, required: true },
    category: { type: String, required: true },
    accessible: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
  },
  { _id: false }
);

const rowSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    aisleAfter: { type: [Number], default: [] },
    seats: { type: [seatSchema], default: [] },
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    rows: { type: [rowSchema], default: [] },
  },
  { _id: false }
);

const performanceSchema = new Schema(
  {
    label: { type: String, trim: true, maxlength: 100, default: 'Performance' },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    venueLayoutVersion: { type: Number, required: true },
    venueName: { type: String, required: true },
    venueAddress: {
      line1: { type: String, required: true },
      line2: { type: String },
      city: { type: String, required: true },
      state: { type: String },
      country: { type: String, required: true },
      postalCode: { type: String },
    },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },
    inventoryKind: { type: String, enum: ['general', 'assigned'], required: true },
    status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
    inventoryRevision: { type: Number, default: 0 },
    generalAdmission: {
      capacity: { type: Number, min: 1 },
      soldQuantity: { type: Number, min: 0, default: 0 },
      price: { type: Number, min: 0 },
      currency: { type: String, default: 'INR' },
    },
    priceTiers: [
      {
        category: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'INR' },
      },
    ],
    seatMap: { sections: { type: [sectionSchema], default: [] } },
  },
  { timestamps: true }
);

const eventSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 140 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 10000 },
    category: {
      type: String,
      required: true,
      enum: ['movie', 'concert', 'comedy', 'theatre', 'sports', 'workshop', 'conference', 'festival', 'exhibition', 'college', 'other'],
    },
    tags: { type: [String], default: [] },
    ageRating: { type: String, trim: true, maxlength: 20 },
    posterUrl: { type: String, trim: true, maxlength: 500 },
    bannerUrl: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: ['draft', 'published', 'cancelled'], default: 'draft', index: true },
    publishedAt: { type: Date },
    performances: { type: [performanceSchema], default: [] },
  },
  { timestamps: true }
);

eventSchema.index({ status: 1, 'performances.startsAt': 1 });
eventSchema.index({ ownerId: 1, status: 1, updatedAt: -1 });
eventSchema.index({ title: 'text', description: 'text', tags: 'text', category: 'text' });

const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);

module.exports = { Event };
