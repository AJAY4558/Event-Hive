'use strict';

const { z } = require('zod');

const EVENT_CATEGORIES = [
  'movie', 'concert', 'comedy', 'theatre', 'sports', 'workshop',
  'conference', 'festival', 'exhibition', 'college', 'other',
];

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .refine((value) => !value || /^https?:\/\//i.test(value), 'Enter a valid http or https URL');

const eventDetails = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(20).max(10000),
  category: z.enum(EVENT_CATEGORIES),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
  ageRating: z.string().trim().max(20).optional(),
  posterUrl: optionalUrl,
  bannerUrl: optionalUrl,
});
const eventUpdate = eventDetails.partial().refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

const venueAddress = z.object({
  line1: z.string().trim().min(2).max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().max(80).optional(),
  country: z.string().trim().min(2).max(80).default('India'),
  postalCode: z.string().trim().max(16).optional(),
});

const seatSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(12),
  number: z.coerce.number().int().positive().max(500),
  category: z.string().trim().min(2).max(40).transform((value) => value.toLowerCase()).default('standard'),
  accessible: z.boolean().default(false),
  blocked: z.boolean().default(false),
});

const rowSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(12),
  aisleAfter: z.array(z.coerce.number().int().positive().max(500)).max(50).default([]),
  seats: z.array(seatSchema).max(500),
});

const sectionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  rows: z.array(rowSchema).max(100),
});

const layoutSchema = z.object({
  stageLabel: z.string().trim().min(1).max(60).default('Stage'),
  sections: z.array(sectionSchema).max(20).default([]),
}).superRefine((layout, ctx) => {
  const ids = [];
  const sectionNames = new Set();

  layout.sections.forEach((section, sectionIndex) => {
    const normalizedName = section.name.toLowerCase();
    if (sectionNames.has(normalizedName)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'name'], message: 'Section names must be unique' });
    }
    sectionNames.add(normalizedName);

    const rowLabels = new Set();
    section.rows.forEach((row, rowIndex) => {
      if (rowLabels.has(row.label.toLowerCase())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'rows', rowIndex, 'label'], message: 'Row labels must be unique within a section' });
      }
      rowLabels.add(row.label.toLowerCase());
      const seatLabels = new Set();
      row.seats.forEach((seat, seatIndex) => {
        if (seatLabels.has(seat.label.toLowerCase())) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'rows', rowIndex, 'seats', seatIndex, 'label'], message: 'Seat labels must be unique within a row' });
        }
        seatLabels.add(seat.label.toLowerCase());
        if (seat.id) ids.push(seat.id);
      });
      row.aisleAfter.forEach((position, aisleIndex) => {
        if (position >= row.seats.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'rows', rowIndex, 'aisleAfter', aisleIndex], message: 'An aisle must be placed before the end of the row' });
        }
      });
    });
    if (section.id) ids.push(section.id);
    section.rows.forEach((row) => { if (row.id) ids.push(row.id); });
  });

  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections'], message: 'Layout IDs must be unique' });
  }
});

const venueDetailsBase = z.object({
  name: z.string().trim().min(2).max(120),
  address: venueAddress,
  capacity: z.coerce.number().int().positive().max(100000),
  inventoryKind: z.enum(['general', 'assigned', 'mixed']),
  layout: layoutSchema.default({ stageLabel: 'Stage', sections: [] }),
});

const venueDetails = venueDetailsBase.superRefine((venue, ctx) => {
  const seatCount = venue.layout.sections.reduce(
    (total, section) => total + section.rows.reduce((rowTotal, row) => rowTotal + row.seats.length, 0),
    0
  );
  if (['assigned', 'mixed'].includes(venue.inventoryKind) && seatCount === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['layout', 'sections'], message: 'Assigned or mixed venues need a seat layout' });
  }
  if (seatCount > venue.capacity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capacity'], message: 'Venue capacity cannot be smaller than the number of configured seats' });
  }
});

const venueUpdate = venueDetailsBase.partial().refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

const performanceCreate = z.object({
  label: z.string().trim().min(1).max(100).default('Performance'),
  venueId: objectId,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  inventoryKind: z.enum(['general', 'assigned']),
  capacity: z.coerce.number().int().positive().max(100000).optional(),
  price: z.coerce.number().min(0).max(1000000).optional(),
  priceTiers: z.array(z.object({
    category: z.string().trim().min(2).max(40).transform((value) => value.toLowerCase()),
    price: z.coerce.number().min(0).max(1000000),
  })).max(20).optional(),
}).superRefine((performance, ctx) => {
  if (performance.endsAt <= performance.startsAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'End time must be after the start time' });
  }
  if (performance.inventoryKind === 'general' && (performance.capacity === undefined || performance.price === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capacity'], message: 'General admission needs a capacity and ticket price' });
  }
  if (performance.inventoryKind === 'assigned' && (!performance.priceTiers || performance.priceTiers.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['priceTiers'], message: 'Assigned seating needs prices for each seat category' });
  }
  if (performance.priceTiers && new Set(performance.priceTiers.map((tier) => tier.category.toLowerCase())).size !== performance.priceTiers.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['priceTiers'], message: 'Price categories must be unique' });
  }
});

const performanceUpdate = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  capacity: z.coerce.number().int().positive().max(100000).optional(),
  price: z.coerce.number().min(0).max(1000000).optional(),
  priceTiers: z.array(z.object({
    category: z.string().trim().min(2).max(40).transform((value) => value.toLowerCase()),
    price: z.coerce.number().min(0).max(1000000),
  })).max(20).optional(),
}).refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

const idParams = z.object({ params: z.object({ eventId: objectId }) });
const performanceParams = z.object({ params: z.object({ eventId: objectId, performanceId: objectId }) });
const venueParams = z.object({ params: z.object({ venueId: objectId }) });
const listQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().max(100000).optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
    search: z.string().trim().max(80).optional(),
    category: z.enum(EVENT_CATEGORIES).optional(),
    city: z.string().trim().max(80).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    minPrice: z.coerce.number().min(0).max(1000000).optional(),
    maxPrice: z.coerce.number().min(0).max(1000000).optional(),
    sort: z.enum(['dateAsc', 'dateDesc', 'priceAsc', 'priceDesc', 'title', 'newest']).optional(),
  }),
}).superRefine((data, ctx) => {
  if (data.query.from && data.query.to && data.query.to < data.query.from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['query', 'to'], message: 'End date must be on or after the start date' });
  }
  if (data.query.minPrice !== undefined && data.query.maxPrice !== undefined && data.query.minPrice > data.query.maxPrice) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['query', 'maxPrice'], message: 'Maximum price must be greater than or equal to minimum price' });
  }
});

const venueLayoutUpdate = z.object({ body: z.object({ layout: layoutSchema }) });

module.exports = {
  EVENT_CATEGORIES,
  eventDetails,
  eventUpdate,
  venueDetails,
  venueUpdate,
  venueLayoutUpdate,
  layoutSchema,
  performanceCreate,
  performanceUpdate,
  idParams,
  performanceParams,
  venueParams,
  listQuery,
};
