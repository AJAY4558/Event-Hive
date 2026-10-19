import path from 'node:path';
import net from 'node:net';
import { build, preview } from 'vite';
import projectConfig from '../../vite.config.js';

const root = path.resolve(import.meta.dirname, '../..');
const apiUrl = 'http://127.0.0.1:4001';
const outDir = path.join(root, 'test-results', 'e2e-build', 'site');

export async function startE2EPreviewServer(port = 5174) {
  if (
    process.env.VITE_API_BASE_URL !== `${apiUrl}/api` ||
    process.env.VITE_SOCKET_URL !== apiUrl
  ) {
    throw new Error('E2E frontend must target the isolated backend on 127.0.0.1:4001.');
  }

  await assertPortAvailable(port);

  // npm workspace scripts run from frontend/. Global setup runs from the
  // repository root, so restore frontend-relative PostCSS/Tailwind lookup.
  process.chdir(root);

  const viteConfig = {
    ...projectConfig,
    root,
    // Import the project config natively above. Vite's config bundler uses
    // esbuild to traverse parent directories, which is blocked in this managed
    // workspace. Passing the same config object avoids that extra bundle step.
    configFile: false,
    build: { ...projectConfig.build, outDir, emptyOutDir: true, sourcemap: false },
  };

  // Vite's dev dependency optimizer starts esbuild from the temporary .vite
  // cache. Here, esbuild cannot enumerate a parent directory even though
  // npm-hoisted package files exist. The production bundle keeps the E2E app
  // on the normal project configuration without widening filesystem access.
  await build(viteConfig);

  const server = await preview({
    ...viteConfig,
    preview: { host: '127.0.0.1', port, strictPort: true },
  });
  server.printUrls();

  const response = await fetch(`http://127.0.0.1:${port}/`);
  if (!response.ok) {
    await closePreviewServer(server);
    throw new Error(`Vite preview returned HTTP ${response.status}.`);
  }

  return () => closePreviewServer(server);
}

async function assertPortAvailable(port) {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => {
      probe.close((error) => error ? reject(error) : resolve());
    });
  }).catch((error) => {
    if (error.code === 'EADDRINUSE') {
      throw new Error(`E2E preview port ${port} is already in use; refusing to start another server.`);
    }
    throw error;
  });
}

async function closePreviewServer(server) {
  const closed = new Promise((resolve) => server.httpServer.close(resolve));
  server.httpServer.closeAllConnections?.();
  await closed;
}
