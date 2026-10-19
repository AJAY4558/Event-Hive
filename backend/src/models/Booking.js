'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const bookedSeatSchema = new Schema({
  seatId: { type: String, required: true },
  label: { type: String, required: true },
  sectionName: { type: String, required: true },
  rowLabel: { type: String, required: true },
  category: { type: String, required: true },
  accessible: { type: Boolean, default: false },
  unitPricePaise: { type: Number, min: 0 },
}, { _id: false });

const bookingSchema = new Schema({
  bookingReference: { type: String, required: true, unique: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
  performanceId: { type: Schema.Types.ObjectId, required: true },
  idempotencyKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  inventoryKind: { type: String, enum: ['assigned', 'general'], required: true },
  seats: { type: [bookedSeatSchema], default: [] },
  ticketType: { type: String, trim: true, maxlength: 80 },
  quantity: { type: Number, required: true, min: 1 },
  unitPricePaise: { type: Number, required: true, min: 0 },
  totalPaise: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  eventSnapshot: {
    title: { type: String, required: true },
    category: { type: String, required: true },
    posterUrl: { type: String },
  },
  performanceSnapshot: {
    label: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    venueName: { type: String, required: true },
    venueAddress: { type: Schema.Types.Mixed, required: true },
  },
  status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed', required: true },
  cancelledAt: { type: Date },
}, { timestamps: true });

bookingSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true, name: 'uniq_customer_idempotency' });
bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ eventId: 1, performanceId: 1, createdAt: -1 });

const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);

module.exports = { Booking };
