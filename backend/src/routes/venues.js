'use strict';

const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const venueController = require('../controllers/venueController');
const { venueDetails, venueUpdate, venueLayoutUpdate, venueParams } = require('../services/events/eventValidation');

const venueRouter = Router();
const organizerAccess = [authenticate, authorize('organizer')];

venueRouter.use(...organizerAccess);
venueRouter.get('/', venueController.list);
venueRouter.post('/', validate({ body: venueDetails }), venueController.create);
venueRouter.patch('/:venueId/layout', validate(venueParams), validate(venueLayoutUpdate), venueController.update);
venueRouter.get('/:venueId', validate(venueParams), venueController.get);
venueRouter.patch('/:venueId', validate(venueParams), validate({ body: venueUpdate }), venueController.update);
venueRouter.delete('/:venueId', validate(venueParams), venueController.deactivate);

module.exports = { venueRouter };
