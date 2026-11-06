'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const { v4: uuidv4 } = require('uuid');
const { env } = require('../config/env');

const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function matchesImageSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function encodedKey(storageKey) {
  return storageKey.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function imageMetadata(file, storageKey, url) {
  return {
    url,
    storageKey,
    originalName: path.basename(file.originalname).replace(/[\r\n\t]/g, ' ').slice(0, 255) || 'event-image',
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date(),
  };
}

async function storeLocally(file, storageKey) {
  if (env.NODE_ENV === 'production') {
    throw makeError('Persistent image storage is not configured for production.', 503);
  }

  const root = path.resolve(env.UPLOAD_DIR);
  const destination = path.resolve(root, ...storageKey.split('/'));
  if (!destination.startsWith(root + path.sep)) {
    throw makeError('Invalid upload path.', 400);
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, file.buffer, { flag: 'wx', mode: 0o644 });
  const publicBase = env.UPLOAD_PUBLIC_BASE_URL ? new URL(env.UPLOAD_PUBLIC_BASE_URL).origin : '';
  return imageMetadata(file, storageKey, `${publicBase}/uploads/${encodedKey(storageKey)}`);
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

async function storeInS3(file, storageKey) {
  const { UPLOAD_S3_BUCKET: bucket, UPLOAD_S3_REGION: region, UPLOAD_S3_ACCESS_KEY_ID: accessKey, UPLOAD_S3_SECRET_ACCESS_KEY: secretKey, UPLOAD_S3_ENDPOINT: configuredEndpoint, UPLOAD_PUBLIC_BASE_URL: publicBase } = env;
  if (!bucket || !accessKey || !secretKey || !publicBase) {
    throw makeError('Persistent image storage is not fully configured.', 503);
  }

  const publicUrl = new URL(publicBase);
  if ((env.NODE_ENV === 'production' && publicUrl.protocol !== 'https:') || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
    throw makeError('Persistent image storage is not correctly configured.', 503);
  }

  const isCustomEndpoint = Boolean(configuredEndpoint);
  const endpoint = configuredEndpoint
    ? new URL(configuredEndpoint)
    : new URL(`https://${bucket}.s3.${region}.amazonaws.com`);
  if ((env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw makeError('Persistent image storage endpoint must use HTTPS and contain no credentials.', 503);
  }

  const objectUrl = new URL(endpoint);
  const encoded = encodedKey(storageKey);
  objectUrl.pathname = isCustomEndpoint
    ? `${endpoint.pathname.replace(/\/$/, '')}/${encodeURIComponent(bucket)}/${encoded}`
    : `/${encoded}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = [
    `content-type:${file.mimetype}`,
    `host:${objectUrl.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n');
  const canonicalRequest = ['PUT', objectUrl.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const dateKey = hmac('AWS4' + secretKey, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  let response;
  try {
    response = await putObject(objectUrl, {
      Authorization: authorization,
      'Content-Type': file.mimetype,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    }, file.buffer);
  } catch {
    throw makeError('Image storage could not be reached. Try again later.', 502);
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw makeError('Image storage rejected the upload. Check the server storage configuration.', 502);
  }

  const basePath = publicUrl.pathname.replace(/\/$/, '');
  const url = `${publicUrl.origin}${basePath}/${encoded}`;
  return imageMetadata(file, storageKey, url);
}

function putObject(url, headers, buffer) {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, { method: 'PUT', headers, timeout: 30_000 }, (response) => {
      response.resume();
      response.on('end', () => resolve({ statusCode: response.statusCode || 500 }));
    });
    request.on('timeout', () => request.destroy(new Error('Object storage request timed out.')));
    request.on('error', reject);
    request.end(buffer);
  });
}

async function storeImage(file, userId) {
  const extension = EXTENSIONS[file.mimetype];
  if (!extension || !matchesImageSignature(file.buffer, file.mimetype)) {
    throw makeError('The uploaded file contents do not match a supported JPG, PNG, or WebP image.', 415);
  }

  const storageKey = `organizers/${userId}/${uuidv4()}${extension}`;
  if (env.UPLOAD_STORAGE_DRIVER === 's3') return storeInS3(file, storageKey);
  return storeLocally(file, storageKey);
}

module.exports = { storeImage, matchesImageSignature };
