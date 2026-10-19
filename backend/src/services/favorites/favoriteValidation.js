'use strict';

const { z } = require('zod');

const favoriteParams = z.object({
  params: z.object({ eventId: z.string().regex(/^[a-f\d]{24}$/i, 'A valid event ID is required') }),
});

module.exports = { favoriteParams };
