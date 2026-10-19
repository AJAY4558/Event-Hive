'use strict';

const eventService = require('../services/events/eventService');
const bookingService = require('../services/bookings/bookingService');

async function listPublic(req, res, next) {
  try {
    const result = await eventService.listPublicEvents(req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getPublic(req, res, next) {
  try {
    const event = await eventService.getPublicEvent(req.params.eventId);
    res.status(200).json({ event });
  } catch (error) {
    next(error);
  }
}

async function listOrganizer(req, res, next) {
  try {
    const result = await eventService.listOrganizerEvents(req.user, req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getOrganizer(req, res, next) {
  try {
    const event = await eventService.getOrganizerEvent(req.params.eventId, req.user);
    res.status(200).json({ event });
  } catch (error) {
    next(error);
  }
}

async function listOrganizerBookings(req, res, next) {
  try {
    const result = await bookingService.listOrganizerEventBookings(req.params.eventId, req.user, req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const event = await eventService.createEvent(req.body, req.user);
    res.status(201).json({ event });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const event = await eventService.updateEvent(req.params.eventId, req.body, req.user);
    res.status(200).json({ event });
  } catch (error) {
    next(error);
  }
}

async function addPerformance(req, res, next) {
  try {
    const performance = await eventService.addPerformance(req.params.eventId, req.body, req.user);
    res.status(201).json({ performance });
  } catch (error) {
    next(error);
  }
}

async function updatePerformance(req, res, next) {
  try {
    const performance = await eventService.updatePerformance(
      req.params.eventId,
      req.params.performanceId,
      req.body,
      req.user
    );
    res.status(200).json({ performance });
  } catch (error) {
    next(error);
  }
}

async function publish(req, res, next) {
  try {
    const event = await eventService.publishEvent(req.params.eventId, req.user);
    res.status(200).json({ event });
  } catch (error) {
    next(error);
  }
}

async function cancel(req, res, next) {
  try {
    const event = await eventService.cancelEvent(req.params.eventId, req.user);
    res.status(200).json({ event });
  } catch (error) {
    next(error);
  }
}

async function cancelPerformance(req, res, next) {
  try {
    const performance = await eventService.cancelPerformance(
      req.params.eventId,
      req.params.performanceId,
      req.user
    );
    res.status(200).json({ performance });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listPublic,
  getPublic,
  listOrganizer,
  getOrganizer,
  listOrganizerBookings,
  create,
  update,
  addPerformance,
  updatePerformance,
  publish,
  cancel,
  cancelPerformance,
};
