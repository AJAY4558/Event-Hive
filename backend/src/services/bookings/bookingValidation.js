'use strict';

const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'A valid ID is required');

const createBooking = z.object({
  eventId: objectId,
  performanceId: objectId,
  seatIds: z.array(z.string().trim().min(1).max(100)).min(1).max(20).optional(),
  quantity: z.coerce.number().int().min(1).max(20).optional(),
}).strict().superRefine((body, ctx) => {
  if ((body.seatIds === undefined) === (body.quantity === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide either seatIds or quantity.' });
  }
  if (body.seatIds && new Set(body.seatIds).size !== body.seatIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['seatIds'], message: 'A seat can only be selected once.' });
  }
});

const availabilityParams = z.object({
  params: z.object({ eventId: objectId, performanceId: objectId }),
});

const bookingParams = z.object({ params: z.object({ bookingId: objectId }) });

const bookingListQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().max(100000).optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
  }),
});

module.exports = { createBooking, availabilityParams, bookingParams, bookingListQuery };
