'use strict';

const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'A valid ID is required');
const userParams = z.object({ params: z.object({ userId: objectId }) });
const bookingParams = z.object({ params: z.object({ bookingId: objectId }) });
const roleUpdate = z.object({ body: z.object({ role: z.enum(['customer', 'organizer', 'admin']) }).strict() });
const adminListQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().max(100000).optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().trim().max(100).optional(),
  }),
});
const auditListQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().max(100000).optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

module.exports = { userParams, bookingParams, roleUpdate, adminListQuery, auditListQuery };
