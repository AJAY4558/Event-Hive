'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const seatAllocationSchema = new Schema({
  performanceId: { type: Schema.Types.ObjectId, required: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
  seatId: { type: String, required: true },
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['confirmed', 'cancelled'], required: true, default: 'confirmed' },
  cancelledAt: { type: Date },
}, { timestamps: true });

seatAllocationSchema.index(
  { performanceId: 1, seatId: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' }, name: 'uniq_active_performance_seat' }
);
seatAllocationSchema.index({ bookingId: 1, status: 1 });
seatAllocationSchema.index({ eventId: 1, performanceId: 1, status: 1 });

const SeatAllocation = mongoose.models.SeatAllocation || mongoose.model('SeatAllocation', seatAllocationSchema);

module.exports = { SeatAllocation };
