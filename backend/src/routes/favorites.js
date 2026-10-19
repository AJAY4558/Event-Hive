'use strict';

const { Router } = require('express');
const { authenticate, requireExactRole } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { favoriteParams } = require('../services/favorites/favoriteValidation');
const favoriteController = require('../controllers/favoriteController');

const favoriteRouter = Router();
const customerAccess = [authenticate, requireExactRole('customer')];

favoriteRouter.get('/', ...customerAccess, favoriteController.list);
favoriteRouter.put('/:eventId', ...customerAccess, validate(favoriteParams), favoriteController.add);
favoriteRouter.delete('/:eventId', ...customerAccess, validate(favoriteParams), favoriteController.remove);

module.exports = { favoriteRouter };
