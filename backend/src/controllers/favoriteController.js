'use strict';

const favoriteService = require('../services/favorites/favoriteService');

async function list(req, res, next) {
  try {
    res.status(200).json(await favoriteService.listFavorites(req.user));
  } catch (error) {
    next(error);
  }
}

async function add(req, res, next) {
  try {
    const result = await favoriteService.addFavorite(req.params.eventId, req.user);
    res.status(result.created ? 201 : 200).json({ favorite: result.favorite });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    res.status(200).json(await favoriteService.removeFavorite(req.params.eventId, req.user));
  } catch (error) {
    next(error);
  }
}

module.exports = { list, add, remove };
