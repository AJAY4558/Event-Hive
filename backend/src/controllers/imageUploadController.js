'use strict';

const multer = require('multer');
const { env } = require('../config/env');
const { storeImage } = require('../services/imageStorage');

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

module.exports = { uploadImage };
