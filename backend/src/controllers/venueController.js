'use strict';

const venueService = require('../services/events/venueService');

async function list(req, res, next) {
  try {
    const venues = await venueService.listVenues(req.user);
    res.status(200).json({ venues });
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const venue = await venueService.getVenue(req.params.venueId, req.user);
    res.status(200).json({ venue });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const venue = await venueService.createVenue(req.body, req.user);
    res.status(201).json({ venue });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const venue = await venueService.updateVenue(req.params.venueId, req.body, req.user);
    res.status(200).json({ venue });
  } catch (error) {
    next(error);
  }
}

async function deactivate(req, res, next) {
  try {
    const venue = await venueService.deactivateVenue(req.params.venueId, req.user);
    res.status(200).json({ venue });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, get, create, update, deactivate };
