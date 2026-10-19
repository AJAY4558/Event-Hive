'use strict';

const adminService = require('../services/admin/adminService');
const bookingService = require('../services/bookings/bookingService');

async function overview(_req, res, next) {
  try {
    res.status(200).json(await adminService.getOverview());
  } catch (error) {
    next(error);
  }
}

async function users(req, res, next) {
  try {
    res.status(200).json(await adminService.listUsers(req.query));
  } catch (error) {
    next(error);
  }
}

async function updateUserRole(req, res, next) {
  try {
    const result = await adminService.updateUserRole(req.params.userId, req.body.role, req.user);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function auditLogs(req, res, next) {
  try {
    res.status(200).json(await adminService.listAuditLogs(req.query));
  } catch (error) {
    next(error);
  }
}

async function booking(req, res, next) {
  try {
    res.status(200).json({ booking: await adminService.getBookingSupportRecord(req.params.bookingId) });
  } catch (error) {
    next(error);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const result = await bookingService.cancelAdminBooking(req.params.bookingId, req.user);
    res.status(200).json({ booking: result });
  } catch (error) {
    next(error);
  }
}

module.exports = { overview, users, updateUserRole, auditLogs, booking, cancelBooking };
