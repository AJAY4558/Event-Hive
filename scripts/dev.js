'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const vitePackageEntry = require.resolve('vite', { paths: [frontendDir] });
const viteCli = path.join(path.dirname(vitePackageEntry), 'bin', 'vite.js');

if (!fs.existsSync(viteCli)) {
  console.error(`Could not find the Vite CLI at ${viteCli}`);
  process.exit(1);
}

const services = [
  {
    name: 'backend',
    cwd: backendDir,
    args: ['--watch', 'src/server.js'],
  },
  {
    name: 'frontend',
    cwd: frontendDir,
    args: [viteCli],
  },
];

const children = [];
const finished = new Set();
let stopping = false;
let exitCode = 0;

function stopAll(code) {
  if (!stopping) {
    stopping = true;
    exitCode = code;
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
    }
  }
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

for (const service of services) {
  const child = spawn(process.execPath, service.args, {
    cwd: service.cwd,
    env: process.env,
    stdio: 'inherit',
  });
  children.push(child);

  child.on('error', (error) => {
    console.error(`[${service.name}] Could not start: ${error.message}`);
    stopAll(1);
  });

  child.on('close', (code) => {
    finished.add(child);
    if (!stopping) stopAll(code ?? 1);
    if (finished.size === children.length) process.exitCode = exitCode;
  });
}
