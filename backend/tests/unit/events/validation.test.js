import { describe, expect, it } from 'vitest';
import {
  EVENT_CATEGORIES,
  eventDetails,
  layoutSchema,
  performanceCreate,
  venueDetails,
} from '../../../src/services/events/eventValidation.js';
import { normalizeLayout } from '../../../src/services/events/venueService.js';

const seat = (label, number) => ({ label, number, category: 'standard', accessible: false, blocked: false });

describe('Phase 3 event and venue validation', () => {
  it('accepts the supported event categories and valid event details', () => {
    expect(EVENT_CATEGORIES).toEqual(expect.arrayContaining([
      'movie', 'concert', 'comedy', 'theatre', 'sports', 'workshop', 'conference', 'festival', 'exhibition', 'college', 'other',
    ]));
    expect(eventDetails.safeParse({
      title: 'An evening of live music',
      description: 'A locally organized evening with a full live band and guest performers.',
      category: 'concert',
      tags: ['live music'],
    }).success).toBe(true);
  });

  it('rejects duplicate seat labels and invalid aisle positions', () => {
    const duplicateSeat = layoutSchema.safeParse({
      stageLabel: 'Stage',
      sections: [{
        name: 'Main Floor',
        rows: [{ label: 'A', aisleAfter: [3], seats: [seat('A1', 1), seat('A1', 2)] }],
      }],
    });
    expect(duplicateSeat.success).toBe(false);

    const aisleAtEnd = layoutSchema.safeParse({
      sections: [{ name: 'Main Floor', rows: [{ label: 'A', aisleAfter: [2], seats: [seat('A1', 1), seat('A2', 2)] }] }],
    });
    expect(aisleAtEnd.success).toBe(false);
  });

  it('requires a layout for assigned seating and bounds it by venue capacity', () => {
    const valid = venueDetails.safeParse({
      name: 'Riverside Hall',
      address: { line1: '42 Park Street', city: 'Mumbai' },
      capacity: 2,
      inventoryKind: 'assigned',
      layout: { sections: [{ name: 'Main Floor', rows: [{ label: 'A', seats: [seat('A1', 1), seat('A2', 2)] }] }] },
    });
    expect(valid.success).toBe(true);

    const tooSmall = venueDetails.safeParse({
      name: 'Riverside Hall',
      address: { line1: '42 Park Street', city: 'Mumbai' },
      capacity: 1,
      inventoryKind: 'assigned',
      layout: { sections: [{ name: 'Main Floor', rows: [{ label: 'A', seats: [seat('A1', 1), seat('A2', 2)] }] }] },
    });
    expect(tooSmall.success).toBe(false);
  });

  it('requires general admission capacity and price, and validates time order', () => {
    const base = {
      label: 'Friday evening',
      venueId: '0123456789abcdef01234567',
      startsAt: '2030-08-01T18:00:00.000Z',
      endsAt: '2030-08-01T20:00:00.000Z',
      inventoryKind: 'general',
    };
    expect(performanceCreate.safeParse(base).success).toBe(false);
    expect(performanceCreate.safeParse({ ...base, capacity: 120, price: 450 }).success).toBe(true);
    expect(performanceCreate.safeParse({ ...base, startsAt: '2030-08-01T20:00:00.000Z', capacity: 120, price: 450 }).success).toBe(false);
  });

  it('keeps venue seat IDs stable when a layout is edited at the same positions', () => {
    const first = normalizeLayout({
      stageLabel: 'Stage',
      sections: [{ name: 'Main Floor', rows: [{ label: 'A', seats: [seat('A1', 1), seat('A2', 2)] }] }],
    });
    const edited = normalizeLayout({
      stageLabel: 'Screen',
      sections: [{ name: 'Main Floor', rows: [{ label: 'A', seats: [seat('A1', 1), { ...seat('A2', 2), accessible: true }] }] }],
    }, first);

    expect(edited.sections[0].id).toBe(first.sections[0].id);
    expect(edited.sections[0].rows[0].id).toBe(first.sections[0].rows[0].id);
    expect(edited.sections[0].rows[0].seats.map((item) => item.id)).toEqual(first.sections[0].rows[0].seats.map((item) => item.id));
    expect(edited.sections[0].rows[0].seats[1].accessible).toBe(true);
  });
});
