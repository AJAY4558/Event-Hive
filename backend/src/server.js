'use strict';

require('dotenv/config'); // Must be first — loads .env before env.js validates process.env

const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const { env } = require('./config/env');
const { connectDb, disconnectDb } = require('./config/db');
const { createApp } = require('./app');

async function bootstrap() {
  // 1. Connect to MongoDB (will exit if replica set is not available)
  await connectDb();

  // 2. Create Express app
  const app = createApp();

  // 3. Create HTTP server
  const httpServer = http.createServer(app);

  // 4. Attach Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Store io on app for access in controllers
  app.set('io', io);

  // Basic Socket.IO connection handler (extended in Phase 5+)
  io.on('connection', (socket) => {
    if (env.NODE_ENV === 'development') {
      console.log(`🔌 Socket connected: ${socket.id}`);
    }

    socket.on('disconnect', (reason) => {
      if (env.NODE_ENV === 'development') {
        console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
      }
    });

    // Join a performance room to receive real-time seat updates
    socket.on('join:performance', (performanceId) => {
      if (typeof performanceId === 'string' && performanceId.trim()) {
        socket.join(`performance:${performanceId}`);
      }
    });

    socket.on('leave:performance', (performanceId) => {
      if (typeof performanceId === 'string') {
        socket.leave(`performance:${performanceId}`);
      }
    });
  });

  // 5. Start listening
  httpServer.listen(env.PORT, () => {
    console.log(`\n🚀 EventHive backend running on http://localhost:${env.PORT}`);
    console.log(`   Health: http://localhost:${env.PORT}/health`);
    console.log(`   Env:    ${env.NODE_ENV}\n`);
  });

  // 6. Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n📴 Received ${signal}. Shutting down gracefully...`);

    httpServer.close(() => {
      disconnectDb()
        .then(() => {
          console.log('✅ Server and DB connection closed.');
          process.exit(0);
        })
        .catch((err) => {
          console.error('Error during shutdown:', err.name || 'Error', err.code || '');
          process.exit(1);
        });
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('⚠️  Forced shutdown after timeout.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error('Unhandled rejection');
    console.error('Unhandled Promise Rejection:', error.name || 'Error', error.code || '');
  });
}

bootstrap().catch((err) => {
  console.error('❌ Fatal bootstrap error:', err.name || 'Error', err.code || '');
  process.exit(1);
});
