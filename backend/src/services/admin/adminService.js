'use strict';

const mongoose = require('mongoose');
const { User } = require('../../models/User');
const { Event } = require('../../models/Event');
const { Booking } = require('../../models/Booking');
const { AdminAuditLog } = require('../../models/AdminAuditLog');

function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getOverview() {
  const [userRoles, eventStatuses, bookingStatuses, upcomingPerformances] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Event.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Booking.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, tickets: { $sum: '$quantity' }, totalPaise: { $sum: '$totalPaise' } } },
    ]),
    Event.countDocuments({ status: 'published', performances: { $elemMatch: { status: 'scheduled', startsAt: { $gt: new Date() } } } }),
  ]);
  const keyedCounts = (entries) => Object.fromEntries(entries.map((item) => [item._id, item.count]));
  const bookings = Object.fromEntries(bookingStatuses.map((item) => [item._id, item]));
  return {
    users: { total: Object.values(keyedCounts(userRoles)).reduce((sum, count) => sum + count, 0), byRole: keyedCounts(userRoles) },
    events: { total: Object.values(keyedCounts(eventStatuses)).reduce((sum, count) => sum + count, 0), byStatus: keyedCounts(eventStatuses), upcoming: upcomingPerformances },
    bookings: {
      confirmed: bookings.confirmed?.count || 0,
      cancelled: bookings.cancelled?.count || 0,
      ticketsConfirmed: bookings.confirmed?.tickets || 0,
      confirmedValuePaise: bookings.confirmed?.totalPaise || 0,
    },
  };
}

async function listUsers(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 50, 100);
  const filter = {};
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ name: regex }, { email: regex }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).select('name email role isActive createdAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return { users, page, limit, total, pages: Math.ceil(total / limit) };
}

async function updateUserRole(userId, role, actor) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      if (!user) throw makeError('User not found.', 404);
      if (String(user._id) === actor.userId && user.role !== role) {
        throw makeError('Administrators cannot change their own role.', 409);
      }
      const previousRole = user.role;
      if (previousRole === role) {
        result = { user: user.toJSON(), changed: false };
        return;
      }
      user.role = role;
      await user.save({ session });
      await AdminAuditLog.create([{
        actorId: new mongoose.Types.ObjectId(actor.userId),
        action: 'user.role.update',
        resourceType: 'user',
        resourceId: user._id,
        metadata: { previousRole, nextRole: role },
      }], { session });
      result = { user: user.toJSON(), changed: true };
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
      maxCommitTimeMS: 10000,
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function listAuditLogs(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 50, 100);
  const [logs, total] = await Promise.all([
    AdminAuditLog.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AdminAuditLog.countDocuments(),
  ]);
  return { logs, page, limit, total, pages: Math.ceil(total / limit) };
}

async function getBookingSupportRecord(bookingId) {
  const booking = await Booking.findById(bookingId)
    .select('-customerId -idempotencyKey -requestHash -__v').lean();
  if (!booking) throw makeError('Booking not found.', 404);
  return booking;
}

module.exports = { getOverview, listUsers, updateUserRole, listAuditLogs, getBookingSupportRecord };
