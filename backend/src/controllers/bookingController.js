'use strict';

const bookingService = require('../services/bookings/bookingService');

function serializeBooking(booking) {
  const value = booking?.toObject ? booking.toObject() : { ...booking };
  delete value.idempotencyKey;
  delete value.requestHash;
  delete value.__v;
  return value;
}

async function availability(req, res, next) {
  try {
    const result = await bookingService.getPerformanceAvailability(req.params.eventId, req.params.performanceId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  const idempotencyKey = req.get('X-Idempotency-Key');
  if (!idempotencyKey || !/^[a-zA-Z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    res.status(400).json({ error: 'A valid X-Idempotency-Key header is required.' });
    return;
  }
  try {
    const result = await bookingService.createBooking(req.body, req.user, idempotencyKey);
    res.status(result.replayed ? 200 : 201).json({ booking: serializeBooking(result.booking), replayed: result.replayed });
  } catch (error) {
    next(error);
  }
}

async function listMine(req, res, next) {
  try {
    const result = await bookingService.listCustomerBookings(req.user, req.query);
    res.status(200).json({
      ...result,
      bookings: result.bookings.map(serializeBooking),
    });
  } catch (error) {
    next(error);
  }
}

async function getMine(req, res, next) {
  try {
    const booking = await bookingService.getCustomerBooking(req.params.bookingId, req.user);
    res.status(200).json({ booking: serializeBooking(booking) });
  } catch (error) {
    next(error);
  }
}

async function cancelMine(req, res, next) {
  try {
    const booking = await bookingService.cancelCustomerBooking(req.params.bookingId, req.user);
    res.status(200).json({ booking: serializeBooking(booking) });
  } catch (error) {
    next(error);
  }
}

module.exports = { availability, create, listMine, getMine, cancelMine };
