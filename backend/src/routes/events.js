'use strict';

const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const eventController = require('../controllers/eventController');
const bookingController = require('../controllers/bookingController');
const {
  eventDetails,
  eventUpdate,
  performanceCreate,
  performanceUpdate,
  idParams,
  performanceParams,
  listQuery,
} = require('../services/events/eventValidation');
const { availabilityParams, bookingListQuery } = require('../services/bookings/bookingValidation');

const eventRouter = Router();
const organizerAccess = [authenticate, authorize('organizer')];

eventRouter.get('/', validate(listQuery), eventController.listPublic);
eventRouter.get('/:eventId/performances/:performanceId/availability', validate(availabilityParams), bookingController.availability);
eventRouter.get('/organizer', ...organizerAccess, validate(listQuery), eventController.listOrganizer);
eventRouter.get('/organizer/:eventId/bookings', ...organizerAccess, validate(idParams), validate(bookingListQuery), eventController.listOrganizerBookings);
eventRouter.get('/organizer/:eventId', ...organizerAccess, validate(idParams), eventController.getOrganizer);
eventRouter.post('/', ...organizerAccess, validate({ body: eventDetails }), eventController.create);
eventRouter.patch('/:eventId', ...organizerAccess, validate(idParams), validate({ body: eventUpdate }), eventController.update);
eventRouter.post('/:eventId/publish', ...organizerAccess, validate(idParams), eventController.publish);
eventRouter.post('/:eventId/cancel', ...organizerAccess, validate(idParams), eventController.cancel);
eventRouter.post('/:eventId/performances', ...organizerAccess, validate(idParams), validate({ body: performanceCreate }), eventController.addPerformance);
eventRouter.patch('/:eventId/performances/:performanceId', ...organizerAccess, validate(performanceParams), validate({ body: performanceUpdate }), eventController.updatePerformance);
eventRouter.post('/:eventId/performances/:performanceId/cancel', ...organizerAccess, validate(performanceParams), eventController.cancelPerformance);
eventRouter.get('/:eventId', validate(idParams), eventController.getPublic);

module.exports = { eventRouter };
