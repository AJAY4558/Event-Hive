'use strict';

const { Router } = require('express');
const { authenticate, requireExactRole } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const adminController = require('../controllers/adminController');
const {
  userParams,
  bookingParams,
  roleUpdate,
  adminListQuery,
  auditListQuery,
} = require('../services/admin/adminValidation');

const adminRouter = Router();
const adminAccess = [authenticate, requireExactRole('admin')];

adminRouter.get('/overview', ...adminAccess, adminController.overview);
adminRouter.get('/users', ...adminAccess, validate(adminListQuery), adminController.users);
adminRouter.patch('/users/:userId/role', ...adminAccess, validate(userParams), validate(roleUpdate), adminController.updateUserRole);
adminRouter.get('/audit-logs', ...adminAccess, validate(auditListQuery), adminController.auditLogs);
adminRouter.get('/bookings/:bookingId', ...adminAccess, validate(bookingParams), adminController.booking);
adminRouter.post('/bookings/:bookingId/cancel', ...adminAccess, validate(bookingParams), adminController.cancelBooking);

module.exports = { adminRouter };
