import mongoose from 'mongoose';
import { startE2EPreviewServer } from './vite-server.js';

const apiUrl = 'http://127.0.0.1:4001';
const frontendUrl = 'http://127.0.0.1:5174';
const mongoUri = 'mongodb://127.0.0.1:27018/eventhive_test?replicaSet=rs0';

export default async function globalSetup() {
  const parsed = new URL(mongoUri);
  if (
    parsed.hostname !== '127.0.0.1' ||
    parsed.port !== '27018' ||
    parsed.pathname !== '/eventhive_test' ||
    parsed.searchParams.get('replicaSet') !== 'rs0'
  ) {
    throw new Error('E2E database URI is not the isolated eventhive_test replica set.');
  }

  const connection = mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    await connection.asPromise();
    const hello = await connection.db.admin().command({ hello: 1 });
    if (hello.setName !== 'rs0' || hello.isWritablePrimary !== true) {
      throw new Error('E2E MongoDB is not a writable rs0 primary.');
    }
  } finally {
    await connection.close();
  }

  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) throw new Error(`Isolated backend health check returned HTTP ${response.status}.`);
  const health = await response.json();
  if (
    health.environment !== 'test' || health.db?.connected !== true || health.db?.rs !== true ||
    health.db?.primary !== true || health.db?.setName !== 'rs0' ||
    !String(health.db?.host || '').includes(':27018')
  ) {
    throw new Error('Backend on port 4001 is not the expected isolated test replica-set service.');
  }

  process.env.EVENTHIVE_E2E_PORT = '5174';
  process.env.VITE_API_BASE_URL = `${apiUrl}/api`;
  process.env.VITE_SOCKET_URL = apiUrl;

  let closePreview;
  try {
    closePreview = await startE2EPreviewServer();
    const frontend = await fetch(frontendUrl);
    if (!frontend.ok) throw new Error(`Vite preview returned HTTP ${frontend.status}.`);
  } catch (error) {
    await closePreview?.();
    throw error;
  }

  console.log('E2E safety check passed: API is test-mode on rs0:27018; MongoDB is a writable primary.');
  return async () => closePreview?.();
}
