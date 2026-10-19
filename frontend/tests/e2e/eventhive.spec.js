import { randomUUID } from 'node:crypto';
import { test, expect, request as playwrightRequest } from '@playwright/test';
import mongoose from 'mongoose';

const apiUrl = 'http://127.0.0.1:4001';
const mongoUri = 'mongodb://127.0.0.1:27018/eventhive_test?replicaSet=rs0';
const password = `EventHive${randomUUID().slice(0, 8)}A1!`;
const runId = randomUUID().replaceAll('-', '').slice(0, 10);
const created = { userEmails: [], venueNames: [], eventTitles: [] };

// These journeys share the isolated event created by the organizer UI test.
test.describe.configure({ mode: 'serial' });

let api;
let dbConnection;
let db;
let fixture;
let lastBackendUptime = 0;

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ baseURL: apiUrl, timeout: 15_000 });
  dbConnection = mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await dbConnection.asPromise();
  db = dbConnection.db;

  if (db.databaseName !== 'eventhive_test') {
    throw new Error('E2E database connection did not select eventhive_test.');
  }
  const hello = await db.admin().command({ hello: 1 });
  if (hello.setName !== 'rs0' || hello.isWritablePrimary !== true) {
    throw new Error('E2E MongoDB is not a writable rs0 primary.');
  }
  lastBackendUptime = (await assertIsolatedBackendReady()).uptime;
});

test.afterAll(async () => {
  try {
    await cleanupRunRecords();
  } finally {
    await api?.dispose();
    await dbConnection?.close();
  }
});

test('the frontend reaches the isolated API and an organizer creates and publishes a configured event', async ({ page }) => {
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(apiUrl)) {
      console.log(`E2E browser API request failed: ${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText || ''}`);
    }
  });
  page.on('response', (response) => {
    if (response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/venues')) {
      console.log(`E2E venue API response: ${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  const eventListResponse = page.waitForResponse((response) => (
    response.url().startsWith(`${apiUrl}/api/events`) && response.request().method() === 'GET'
  ));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const eventList = await eventListResponse;
  expect(eventList.status()).toBe(200);

  const title = `Playwright ${runId} Live Moment`;
  fixture = { title };
  created.eventTitles.push(title);
  fixture.organizer = await registerAccount('organizer', 'E2E Organizer');

  await signIn(page, fixture.organizer);
  await page.goto('/organizer');
  await expect(page.getByRole('heading', { name: 'Organizer studio' })).toBeVisible();

  fixture.assignedVenue = await createVenueInUI(page, {
    name: `E2E Assigned Hall ${runId}`,
    inventoryKind: 'assigned',
    capacity: 16,
  });
  fixture.generalVenue = await createVenueInUI(page, {
    name: `E2E General Hall ${runId}`,
    inventoryKind: 'general',
    capacity: 80,
  });

  await page.goto('/organizer/events/new');
  await expect(page.getByRole('heading', { name: 'Create an event' })).toBeVisible();
  await page.getByLabel('Event title').fill(title);
  await page.getByLabel('Category').selectOption('concert');
  await page.getByLabel('Description').fill('A live test event used only for isolated EventHive browser verification.');
  await page.getByLabel('Tags (comma separated)').fill('e2e, isolated test');

  const createEventResponse = page.waitForResponse((response) => isApiResponse(response, '/api/events', 'POST'));
  await page.getByRole('button', { name: 'Save draft and continue' }).click();
  const eventCreated = await createEventResponse;
  expect(eventCreated.status()).toBe(201);
  const eventBody = await eventCreated.json();
  fixture.eventId = eventBody.event._id;
  await expect(page).toHaveURL(new RegExp(`/organizer/events/${fixture.eventId}/edit$`));
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('draft', { exact: true })).toBeVisible();

  fixture.assigned = await addPerformanceInUI(page, {
    label: 'Assigned evening',
    venue: fixture.assignedVenue,
    daysAhead: 2,
    prices: { standard: '599', premium: '799' },
  });
  fixture.general = await addPerformanceInUI(page, {
    label: 'General admission evening',
    venue: fixture.generalVenue,
    daysAhead: 3,
    capacity: '60',
    price: '350',
  });

  // Keep the stale-state and concurrent final-ticket cases on separate
  // one-ticket performances so one scenario cannot consume another's fixture.
  fixture.staleGeneral = await createPerformance(
    fixture.organizer.token, fixture.eventId, fixture.generalVenue._id,
    { label: 'Stale availability check', inventoryKind: 'general', capacity: 1, price: 350 }, 4,
  );
  fixture.assignedRace = await createPerformance(
    fixture.organizer.token, fixture.eventId, fixture.assignedVenue._id,
    { label: 'Single seat race', inventoryKind: 'assigned', priceTiers: assignedPrices() }, 5,
  );
  fixture.generalRace = await createPerformance(
    fixture.organizer.token, fixture.eventId, fixture.generalVenue._id,
    { label: 'Final ticket race', inventoryKind: 'general', capacity: 1, price: 350 }, 6,
  );
  fixture.cancellation = await createPerformance(
    fixture.organizer.token, fixture.eventId, fixture.assignedVenue._id,
    { label: 'Cancellation check', inventoryKind: 'assigned', priceTiers: assignedPrices() }, 7,
  );

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('draft', { exact: true })).toBeVisible();
  const publishResponse = page.waitForResponse((response) => (
    isApiResponse(response, `/api/events/${fixture.eventId}/publish`, 'POST')
  ));
  await page.getByRole('button', { name: 'Publish event' }).click();
  const published = await publishResponse;
  expect(published.status()).toBe(200);
  await expect(page.getByText('Event published and visible in discovery.')).toBeVisible();
  await expect(page.getByText('published', { exact: true })).toBeVisible();

  fixture.customerA = await registerAccount('customer', 'E2E Customer One');
  fixture.customerB = await registerAccount('customer', 'E2E Customer Two');

  const storedEvent = await db.collection('events').findOne({ _id: new mongoose.Types.ObjectId(fixture.eventId) });
  expect(storedEvent?.title).toBe(title);
  expect(storedEvent?.status).toBe('published');
  const configured = await getOrganizerEvent(fixture.eventId, fixture.organizer.token);
  fixture.event = configured;
  fixture.assigned = configured.performances.find((performance) => performance.label === 'Assigned evening');
  fixture.general = configured.performances.find((performance) => performance.label === 'General admission evening');
  fixture.staleGeneral = configured.performances.find((performance) => performance.label === 'Stale availability check');
  fixture.assignedRace = configured.performances.find((performance) => performance.label === 'Single seat race');
  fixture.generalRace = configured.performances.find((performance) => performance.label === 'Final ticket race');
  fixture.cancellation = configured.performances.find((performance) => performance.label === 'Cancellation check');
  expect(fixture.assigned.priceTiers).toEqual(expect.arrayContaining([
    expect.objectContaining({ category: 'standard', price: 599 }),
    expect.objectContaining({ category: 'premium', price: 799 }),
  ]));
  expect(fixture.general.generalAdmission).toMatchObject({ capacity: 60, price: 350, soldQuantity: 0 });
});

test('customers can discover the published event and open its performance details', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search events').fill(fixture.title);
  await page.getByRole('button', { name: 'Explore events' }).click();

  const eventLink = page.getByRole('link', { name: new RegExp(escapeRegExp(fixture.title)) }).first();
  await expect(eventLink).toBeVisible();
  await eventLink.click();
  await expect(page.getByRole('heading', { level: 1, name: fixture.title })).toBeVisible();
  const assignedCard = page.getByRole('button', { name: /Assigned evening/ });
  const generalCard = page.getByRole('button', { name: /General admission evening/ });
  await expect(assignedCard).toBeVisible();
  await expect(generalCard).toBeVisible();
  await expect(assignedCard).toContainText(fixture.assignedVenue.name);
  await expect(generalCard).toContainText(fixture.generalVenue.name);
  await expect(assignedCard).toContainText('599');
  await expect(generalCard).toContainText('350');
  const assignedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(fixture.assigned.startsAt));
  await expect(assignedCard).toContainText(assignedDate);
});

test('a customer can book an assigned seat, see the confirmed reference, and find it unavailable afterward', async ({ page }) => {
  await signIn(page, fixture.customerA);
  await page.goto(`/events/${fixture.eventId}`);
  const seat = page.getByRole('button', { name: /Seat A1, standard,.*available/ });
  await expect(seat).toBeVisible();
  await seat.click();
  await page.getByRole('button', { name: 'Book Now' }).click();

  const confirmation = page.getByRole('status').filter({ hasText: 'Booking confirmed' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(/Reference\s+[A-Z0-9-]+/);
  await expect(confirmation).toContainText('599');

  await page.getByRole('link', { name: 'Open My Bookings' }).click();
  await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible();
  await expect(page.getByText(fixture.title)).toBeVisible();
  await expect(page.getByText('Assigned evening', { exact: true })).toBeVisible();

  await page.goto(`/events/${fixture.eventId}`);
  await expect(page.getByRole('button', { name: /Seat A1, standard,.*booked/ })).toBeDisabled();
});

test('general-admission booking reduces the remaining inventory', async ({ page }) => {
  await signIn(page, fixture.customerA);
  await page.goto(`/events/${fixture.eventId}`);
  await page.getByRole('button', { name: /General admission evening/ }).click();
  await expect(page.getByText('60 tickets available')).toBeVisible();
  await page.getByRole('button', { name: 'Book Now' }).click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

  const availability = await api.get(`/api/events/${fixture.eventId}/performances/${fixture.general._id}/availability`);
  expect(availability.status()).toBe(200);
  const body = await availability.json();
  expect((body.availability ?? body).generalAdmission.available).toBe(59);
});

test('a stale general-admission view reports a conflict when the last ticket is taken', async ({ page }) => {
  await signIn(page, fixture.customerA);
  await page.goto(`/events/${fixture.eventId}`);
  await page.getByRole('button', { name: /Stale availability check/ }).click();
  await expect(page.getByText('1 ticket available')).toBeVisible();

  const competingBooking = await api.post('/api/bookings', {
    headers: { ...bearer(fixture.customerB.token), 'X-Idempotency-Key': randomUUID() },
    data: { eventId: fixture.eventId, performanceId: fixture.staleGeneral._id, quantity: 1 },
  });
  expect(competingBooking.status()).toBe(201);

  await page.getByRole('button', { name: 'Book Now' }).click();
  const error = page.getByRole('alert');
  await expect(error).toBeVisible();
  await expect(error).toContainText(/ticket|availability|available|sold/i);
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toHaveCount(0);
  await expect(page.getByText('0 tickets available')).toBeVisible();
});

test('concurrent assigned-seat requests create exactly one booking and one active allocation', async () => {
  const seatId = fixture.assignedRace.seatMap.sections[0].rows[0].seats[0].id;
  const responses = await Promise.all([fixture.customerA, fixture.customerB].map((customer) => api.post('/api/bookings', {
    headers: { ...bearer(customer.token), 'X-Idempotency-Key': randomUUID() },
    data: { eventId: fixture.eventId, performanceId: fixture.assignedRace._id, seatIds: [seatId] },
  })));

  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
  const winner = await responses.find((response) => response.status() === 201).json();
  const eventId = new mongoose.Types.ObjectId(fixture.eventId);
  const performanceId = new mongoose.Types.ObjectId(fixture.assignedRace._id);
  const bookings = await db.collection('bookings').find({ eventId, performanceId, status: 'confirmed' }).toArray();
  const allocations = await db.collection('seatallocations').find({
    eventId, performanceId, seatId, status: 'confirmed',
  }).toArray();

  expect(bookings).toHaveLength(1);
  expect(allocations).toHaveLength(1);
  expect(allocations[0].bookingId.toString()).toBe(winner.booking._id);
  const availability = await api.get(`/api/events/${fixture.eventId}/performances/${fixture.assignedRace._id}/availability`);
  expect((await availability.json()).seats.find((seat) => seat.seatId === seatId).booked).toBe(true);
});

test('concurrent general-admission requests cannot oversell a separate final ticket', async () => {
  const responses = await Promise.all([fixture.customerA, fixture.customerB].map((customer) => api.post('/api/bookings', {
    headers: { ...bearer(customer.token), 'X-Idempotency-Key': randomUUID() },
    data: { eventId: fixture.eventId, performanceId: fixture.generalRace._id, quantity: 1 },
  })));

  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
  const eventId = new mongoose.Types.ObjectId(fixture.eventId);
  const performanceId = new mongoose.Types.ObjectId(fixture.generalRace._id);
  const bookings = await db.collection('bookings').find({ eventId, performanceId, status: 'confirmed' }).toArray();
  expect(bookings).toHaveLength(1);

  const event = await db.collection('events').findOne({ _id: eventId });
  const performance = event.performances.find((item) => item._id.toString() === fixture.generalRace._id);
  expect(performance.generalAdmission.soldQuantity).toBe(1);
  const availability = await api.get(`/api/events/${fixture.eventId}/performances/${fixture.generalRace._id}/availability`);
  expect((await availability.json()).generalAdmission.available).toBe(0);
});

test('customer event edits are forbidden and cancellation releases only the owned booking inventory', async () => {
  const forbidden = await api.patch(`/api/events/${fixture.eventId}`, {
    headers: bearer(fixture.customerA.token),
    data: { title: 'Unauthorized customer edit' },
  });
  expect(forbidden.status()).toBe(403);
  const storedEvent = await db.collection('events').findOne({ _id: new mongoose.Types.ObjectId(fixture.eventId) });
  expect(storedEvent?.title).toBe(fixture.title);

  const seatId = fixture.cancellation.seatMap.sections[0].rows[0].seats[0].id;
  const bookingResponse = await api.post('/api/bookings', {
    headers: { ...bearer(fixture.customerA.token), 'X-Idempotency-Key': randomUUID() },
    data: { eventId: fixture.eventId, performanceId: fixture.cancellation._id, seatIds: [seatId] },
  });
  expect(bookingResponse.status()).toBe(201);
  const booking = (await bookingResponse.json()).booking;

  const deniedCancellation = await api.post(`/api/bookings/${booking._id}/cancel`, {
    headers: bearer(fixture.customerB.token),
  });
  expect(deniedCancellation.status()).toBe(403);

  const cancellation = await api.post(`/api/bookings/${booking._id}/cancel`, {
    headers: bearer(fixture.customerA.token),
  });
  expect(cancellation.status()).toBe(200);
  expect((await cancellation.json()).booking.status).toBe('cancelled');
  const availability = await api.get(`/api/events/${fixture.eventId}/performances/${fixture.cancellation._id}/availability`);
  expect((await availability.json()).seats.find((seat) => seat.seatId === seatId).available).toBe(true);
});

async function assertIsolatedBackendReady() {
  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) throw new Error(`Isolated backend health check returned HTTP ${response.status}.`);
  const health = await response.json();
  if (
    health.environment !== 'test' || health.db?.connected !== true || health.db?.rs !== true ||
    health.db?.primary !== true || health.db?.setName !== 'rs0' ||
    !String(health.db?.host || '').includes(':27018')
  ) {
    throw new Error('API on port 4001 is not the isolated test backend on writable rs0:27018.');
  }
  return health;
}

async function registerAccount(role, name) {
  const email = `eh-e2e-${runId}-${role}-${randomUUID().slice(0, 6)}@example.test`;
  created.userEmails.push(email);
  if (await db.collection('users').findOne({ email })) {
    throw new Error('Generated E2E identity already exists; refusing to reuse a pre-existing account.');
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await api.post('/api/auth/register', { data: { name, email, password, role } });
      expect(response.status()).toBe(201);
      const body = await response.json();
      const account = await db.collection('users').findOne({
        _id: new mongoose.Types.ObjectId(body.user.id), email, role,
      });
      expect(account).toBeTruthy();
      return { id: body.user.id, email, token: body.accessToken, password };
    } catch (error) {
      if (!isConnectionReset(error)) throw error;

      const health = await assertIsolatedBackendReady();
      if (health.uptime < lastBackendUptime) {
        throw new Error('The isolated backend restarted during registration; the E2E setup stopped without retrying.');
      }
      lastBackendUptime = health.uptime;

      // If the connection reset after MongoDB committed, log in to that exact
      // unique identity instead of repeating registration or creating a duplicate.
      const persisted = await db.collection('users').findOne({ email, role });
      if (persisted) return loginRunAccount(email, persisted._id.toString());
      if (attempt === 1) throw error;

      console.warn('One registration socket reset occurred while the isolated backend stayed healthy; retrying once.');
      await new Promise((resolve) => setTimeout(resolve, 250));
      lastBackendUptime = health.uptime;
    }
  }
  throw new Error('E2E account setup exhausted its bounded registration retry.');
}

async function loginRunAccount(email, id) {
  const response = await api.post('/api/auth/login', { data: { email, password } });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.user.id).toBe(id);
  return { id, email, token: body.accessToken, password };
}

async function createVenueInUI(page, { name, inventoryKind, capacity }) {
  created.venueNames.push(name);
  await page.goto('/organizer/venues');
  await expect(page.getByRole('heading', { name: 'Add a venue' })).toBeVisible();
  await page.getByLabel('Venue name').fill(name);
  await page.getByLabel('Street address').fill('10 E2E Test Road');
  await page.getByLabel('City', { exact: true }).fill('Test City');
  await page.getByLabel('State').fill('Test State');
  await page.getByLabel('Country').fill('India');
  await page.getByLabel('Postal code').fill('400001');
  await page.getByLabel('Inventory style').selectOption(inventoryKind);
  await page.getByLabel('Venue capacity').fill(String(capacity));

  if (inventoryKind === 'assigned') {
    await page.locator('textarea').fill('Main Floor | standard\nPremium Balcony | premium');
    await page.getByLabel('Rows per section').fill('2');
    await page.getByLabel('Seats per row').fill('4');
    await page.getByLabel('Aisle after seat number').fill('0');
    await page.getByLabel('Stage or screen label').fill('E2E Stage');
    await page.getByRole('button', { name: 'Generate layout preview' }).click();
    const preview = page.getByRole('region', { name: 'Seating layout preview' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('16 seats', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(preview.getByRole('button', { name: 'A1', exact: true }).first()).toBeVisible();
  }

  const invalidFields = await page.locator('form').evaluate((form) => (
    Array.from(form.elements).filter((element) => !element.checkValidity()).map((element) => ({
      id: element.id,
      type: element.type,
      message: element.validationMessage,
    }))
  ));
  expect(invalidFields, 'Venue form should pass native browser validation before submission').toEqual([]);
  const createResponse = page.waitForResponse((response) => (
    response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/venues')
  ));
  await page.getByRole('button', { name: 'Create venue' }).click();
  const response = await createResponse;
  expect(response.status()).toBe(201);
  const venue = (await response.json()).venue;
  expect(venue.name).toBe(name);
  expect(venue.inventoryKind).toBe(inventoryKind);
  await expect(page.getByText('Venue created. Your layout is ready to use for performances.')).toBeVisible();
  return venue;
}

async function addPerformanceInUI(page, { label, venue, daysAhead, prices, capacity, price }) {
  await page.getByLabel('Performance name').fill(label);
  await page.getByLabel('Venue').selectOption(venue._id);
  const times = await page.evaluate((offset) => {
    const starts = new Date();
    starts.setDate(starts.getDate() + offset);
    starts.setHours(19, 0, 0, 0);
    const ends = new Date(starts);
    ends.setHours(ends.getHours() + 2);
    const toInput = (date) => {
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
      return local.toISOString().slice(0, 16);
    };
    return { starts: toInput(starts), ends: toInput(ends) };
  }, daysAhead);
  await page.getByLabel('Starts').fill(times.starts);
  await page.getByLabel('Ends').fill(times.ends);

  if (prices) {
    for (const [category, amount] of Object.entries(prices)) {
      await page.getByLabel(new RegExp(`${category}.*INR`, 'i')).fill(amount);
    }
  } else {
    await page.getByLabel('Capacity').fill(capacity);
    await page.getByLabel('Ticket price (INR)').fill(price);
  }

  const responsePromise = page.waitForResponse((response) => (
    isApiResponse(response, `/api/events/${fixture.eventId}/performances`, 'POST')
  ));
  await page.getByRole('button', { name: 'Add performance' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const performance = (await response.json()).performance;
  expect(performance.label).toBe(label);
  await expect(page.getByText('Performance added with its own inventory configuration.')).toBeVisible();
  return performance;
}

async function createPerformance(token, eventId, venueId, configuration, daysAhead) {
  const startsAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  startsAt.setSeconds(0, 0);
  const response = await api.post(`/api/events/${eventId}/performances`, {
    headers: bearer(token),
    data: {
      venueId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      ...configuration,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).performance;
}

async function getOrganizerEvent(eventId, token) {
  const response = await api.get(`/api/events/organizer/${eventId}`, { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return (await response.json()).event;
}

async function signIn(page, account) {
  await page.goto('/login');
  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  const responsePromise = page.waitForResponse((response) => isApiResponse(response, '/api/auth/login', 'POST'));
  await page.locator('#login-submit').click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.user.id).toBe(account.id);
  account.token = body.accessToken;
  await expect(page).toHaveURL('/');
}

async function cleanupRunRecords() {
  if (!db || !created.userEmails.length && !created.venueNames.length && !created.eventTitles.length) return;

  const [events, venues, users] = await Promise.all([
    created.eventTitles.length
      ? db.collection('events').find({ title: { $in: created.eventTitles } }).project({ _id: 1 }).toArray()
      : [],
    created.venueNames.length
      ? db.collection('venues').find({ name: { $in: created.venueNames } }).project({ _id: 1 }).toArray()
      : [],
    created.userEmails.length
      ? db.collection('users').find({ email: { $in: created.userEmails } }).project({ _id: 1 }).toArray()
      : [],
  ]);
  const eventIds = events.map((event) => event._id);
  const venueIds = venues.map((venue) => venue._id);
  const userIds = users.map((user) => user._id);

  if (eventIds.length) {
    await db.collection('seatallocations').deleteMany({ eventId: { $in: eventIds } });
    await db.collection('bookings').deleteMany({ eventId: { $in: eventIds } });
    await db.collection('favorites').deleteMany({ eventId: { $in: eventIds } });
    await db.collection('events').deleteMany({ _id: { $in: eventIds } });
  }
  if (venueIds.length) await db.collection('venues').deleteMany({ _id: { $in: venueIds } });
  if (userIds.length) await db.collection('users').deleteMany({ _id: { $in: userIds } });

  const [remainingUsers, remainingVenues, remainingEvents] = await Promise.all([
    created.userEmails.length ? db.collection('users').countDocuments({ email: { $in: created.userEmails } }) : 0,
    created.venueNames.length ? db.collection('venues').countDocuments({ name: { $in: created.venueNames } }) : 0,
    created.eventTitles.length ? db.collection('events').countDocuments({ title: { $in: created.eventTitles } }) : 0,
  ]);
  expect({ remainingUsers, remainingVenues, remainingEvents }).toEqual({
    remainingUsers: 0, remainingVenues: 0, remainingEvents: 0,
  });
  console.log(`E2E cleanup removed only this run's records; users=${users.length}, venues=${venues.length}, events=${events.length}.`);
}

function assignedPrices() {
  return [{ category: 'standard', price: 599 }, { category: 'premium', price: 799 }];
}

function isApiResponse(response, pathname, method) {
  const url = new URL(response.url());
  return url.origin === apiUrl && url.pathname === pathname && response.request().method() === method;
}

function isConnectionReset(error) {
  return /ECONNRESET|socket hang up/i.test(String(error?.message || error));
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
