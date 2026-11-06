'use strict';

const multer = require('multer');
const { env } = require('../config/env');
const { storeImage, findAtlasImage, openAtlasImage } = require('../services/imageStorage');

const MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
    fields: 0,
    parts: 1,
  },
  fileFilter(_req, file, callback) {
    const extension = file.originalname.match(/\.[^.]+$/)?.[0].toLowerCase();
    if (!extension || MIME_BY_EXTENSION.get(extension) !== file.mimetype.toLowerCase()) {
      const error = new Error('Choose a matching JPG, PNG, or WebP image file.');
      error.status = 415;
      callback(error);
      return;
    }
    callback(null, true);
  },
}).single('image');

function uploadImage(req, res, next) {
  upload(req, res, (uploadError) => {
    if (uploadError) {
      if (uploadError.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: `Image must be ${env.MAX_FILE_SIZE_MB} MB or smaller.` });
        return;
      }
      if (uploadError.code === 'LIMIT_UNEXPECTED_FILE' || uploadError.code === 'LIMIT_FIELD_COUNT' || uploadError.code === 'LIMIT_PART_COUNT') {
        res.status(400).json({ error: 'Upload one image using the image field.' });
        return;
      }
      next(uploadError);
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Choose an image to upload.' });
      return;
    }

    storeImage(req.file, req.user.userId)
      .then((image) => res.status(201).json({ image }))
      .catch(next);
  });
}

async function serveImage(req, res, next) {
  if (env.UPLOAD_STORAGE_DRIVER !== 'atlas') {
    next();
    return;
  }

  const { ownerId, filename } = req.params;
  if (!/^[a-f\d]{24}$/i.test(ownerId) || !/^[a-f\d-]{36}\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    res.status(404).end();
    return;
  }

  try {
    const storageKey = `organizers/${ownerId}/${filename}`;
    const file = await findAtlasImage(storageKey);
    if (!file || file.metadata?.storageKey !== storageKey || file.metadata?.ownerId !== ownerId) {
      res.status(404).end();
      return;
    }

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.contentType)) {
      res.status(404).end();
      return;
    }

    res.set({
      'Content-Type': file.contentType,
      'Content-Length': String(file.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    const stream = openAtlasImage(file._id);
    stream.on('error', (error) => {
      if (res.headersSent) res.destroy(error);
      else next(error);
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

module.exports = { uploadImage, serveImage };
