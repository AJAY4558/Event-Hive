'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const seatSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    number: { type: Number, required: true, min: 1 },
    category: { type: String, required: true, trim: true, default: 'standard' },
    accessible: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
  },
  { _id: false }
);

const rowSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    aisleAfter: { type: [Number], default: [] },
    seats: { type: [seatSchema], default: [] },
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    rows: { type: [rowSchema], default: [] },
  },
  { _id: false }
);

const venueSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    address: {
      line1: { type: String, required: true, trim: true, maxlength: 160 },
      line2: { type: String, trim: true, maxlength: 160 },
      city: { type: String, required: true, trim: true, maxlength: 80 },
      state: { type: String, trim: true, maxlength: 80 },
      country: { type: String, required: true, trim: true, maxlength: 80, default: 'India' },
      postalCode: { type: String, trim: true, maxlength: 16 },
    },
    capacity: { type: Number, required: true, min: 1, max: 100000 },
    inventoryKind: { type: String, enum: ['general', 'assigned', 'mixed'], required: true },
    layout: {
      stageLabel: { type: String, trim: true, maxlength: 60, default: 'Stage' },
      sections: { type: [sectionSchema], default: [] },
    },
    layoutVersion: { type: Number, min: 1, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

venueSchema.index({ ownerId: 1, 'address.city': 1, updatedAt: -1 });

const Venue = mongoose.models.Venue || mongoose.model('Venue', venueSchema);

module.exports = { Venue };
