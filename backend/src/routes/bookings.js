'use strict';

const { Router } = require('express');
const { authenticate, requireExactRole } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const bookingController = require('../controllers/bookingController');
const { createBooking, bookingParams, bookingListQuery } = require('../services/bookings/bookingValidation');

const bookingRouter = Router();
const customerAccess = [authenticate, requireExactRole('customer')];

bookingRouter.post('/', ...customerAccess, validate({ body: createBooking }), bookingController.create);
bookingRouter.get('/mine', ...customerAccess, validate(bookingListQuery), bookingController.listMine);
bookingRouter.get('/:bookingId', ...customerAccess, validate(bookingParams), bookingController.getMine);
bookingRouter.post('/:bookingId/cancel', ...customerAccess, validate(bookingParams), bookingController.cancelMine);

module.exports = { bookingRouter };
