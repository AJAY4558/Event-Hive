'use strict';

const mongoose = require('mongoose');
const { env } = require('./env');
const { Booking } = require('../models/Booking');
const { SeatAllocation } = require('../models/SeatAllocation');
const { Favorite } = require('../models/Favorite');
const { AdminAuditLog } = require('../models/AdminAuditLog');

/** @type {{ connected: boolean, isReplicaSet: boolean, isPrimary: boolean, host: string, setName?: string }} */
let dbStatus = {
  connected: false,
  isReplicaSet: false,
  isPrimary: false,
  host: '',
};

async function connectDb() {
  try {
    await mongoose.connect(env.MONGO_URI, {
      writeConcern: { w: 'majority', j: true },
      maxPoolSize: 20,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
    });

    await verifyReplicaSet();

    console.log(
      `✅ MongoDB connected: ${dbStatus.host} ` +
        `| RS: ${dbStatus.isReplicaSet ? dbStatus.setName : 'NONE'} ` +
        `| Primary: ${dbStatus.isPrimary}`
    );

    if (!dbStatus.isReplicaSet) {
      console.error(
        '\n⛔ FATAL: MongoDB is not running as a replica set.\n' +
          '   Multi-document transactions (required for booking correctness) are unavailable.\n' +
          '   Follow the replica-set setup in README.md and restart.\n'
      );
      process.exit(1);
    }

    if (!dbStatus.isPrimary) {
      console.error(
        '\n⛔ FATAL: Connected to a non-primary MongoDB node.\n' +
          '   Connect to the primary for write access.\n'
      );
      process.exit(1);
    }

    // Create only the booking indexes declared by these models. createIndexes
    // preserves existing indexes and data; unlike syncIndexes, it never drops
    // indexes that are not declared in the current schemas.
    await Promise.all([
      Booking.createIndexes(),
      SeatAllocation.createIndexes(),
      Favorite.createIndexes(),
      AdminAuditLog.createIndexes(),
    ]);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.name || 'Error', err.code || '');
    throw err;
  }
}

async function verifyReplicaSet() {
  try {
    const admin = mongoose.connection.db && mongoose.connection.db.admin();
    if (!admin) return;

    const isMasterResult = await admin.command({ isMaster: 1 });

    dbStatus = {
      connected: true,
      isReplicaSet: Boolean(isMasterResult.setName),
      isPrimary: Boolean(isMasterResult.ismaster),
      host: isMasterResult.me || mongoose.connection.host || '',
      setName: isMasterResult.setName,
    };
  } catch (err) {
    console.warn('⚠️  Could not verify replica-set status:', err.name || 'Error', err.code || '');
  }
}

function getDbStatus() {
  return { ...dbStatus };
}

async function disconnectDb() {
  await mongoose.disconnect();
  dbStatus = { connected: false, isReplicaSet: false, isPrimary: false, host: '' };
}

// Mongoose connection events
mongoose.connection.on('connected', () => {
  dbStatus.connected = true;
});

mongoose.connection.on('disconnected', () => {
  dbStatus.connected = false;
  dbStatus.isReplicaSet = false;
  dbStatus.isPrimary = false;
  console.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err.name || 'Error', err.code || '');
});

module.exports = { connectDb, disconnectDb, getDbStatus };
