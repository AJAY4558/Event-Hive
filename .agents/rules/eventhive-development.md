---
trigger: always_on
---

# EVENTHIVE — PERMANENT PROJECT RULES

## Role
Act as a senior full-stack engineer building EventHive, a complete event and movie ticket-booking platform. Implement working, tested features in the existing workspace rather than merely describing code.

## Mandatory stack
- Frontend: React, Vite, JavaScript/JSX, React Router, Tailwind CSS or a consistent custom CSS system, Lucide React.
- Backend: Node.js, Express, JavaScript.
- Database: MongoDB and Mongoose.
- Real-time updates: Socket.IO.
- Testing: Vitest or Jest, Supertest, and Playwright as appropriate.
- Use compatible, stable dependencies. Do not replace this stack with Django, Laravel, Firebase, or another backend/database.

## Product requirements
Build three complete experiences:
1. Customer: authentication, event discovery, search, booking, seat selection, payments, tickets, QR verification, booking history, cancellation/refund status, likes, comments, follows, saved events, and notifications.
2. Vendor/organizer: event creation, seat-layout design, pricing, schedule management, publication controls, sales/occupancy analytics, bookings, exports, check-in, cancellations, and refunds.
3. Super admin: user/vendor management, vendor approval, direct event creation, venue and seat-layout management, bookings, payments, refunds, moderation, reports, audit logs, and platform settings.

Support stand-up comedy, open mics, movies and screenings, concerts, theatre, sports, festivals, workshops, college events, and other categories.

Events must have separately bookable performances or screenings, each with its own inventory.

## Event creation and seating
Build a complete event wizard: details, poster/banner/gallery, venue, schedules, seating, pricing, policies, preview, and publishing.

The visual seat-layout designer must support sections, rows, numbered seats, aisles, stages/screens, accessible seats, bulk generation such as 12 × 16 seats, templates, previews, and layout versioning.

Preserve stable seat IDs and historical booking references when layouts change.

Customers must select exact seats and see their row, section, availability, category, and server-authoritative price. Support VIP, premium, standard, balcony, and general admission. Prices must be configurable per event.

## Critical booking correctness
This is the highest-priority requirement.

- Prevent double booking and overselling using database constraints, unique indexes, atomic conditional updates, transactions where needed, and idempotency.
- Enforce uniqueness for each performance/screening and seat combination.
- Multi-seat reservations must succeed completely or fail completely.
- General-admission inventory must never become negative.
- Implement server-validated temporary holds, expiry, release, and recovery. Never rely solely on MongoDB TTL deletion to release inventory.
- Treat MongoDB as the source of truth; Socket.IO is only for broadcasting updates.
- Recalculate prices on the server.
- Use explicit booking, hold, and inventory state machines.
- Never confirm a booking based only on a frontend event or an unverified payment callback.

MongoDB transactions require a replica-set-capable environment. Document and test this requirement.

## Payments, cancellations, and refunds
Use a provider-independent payment adapter and sandbox mode until real credentials are supplied.

Implement server-side payment verification, webhook signature verification, idempotent processing, duplicate/delayed webhook handling, payment timeouts, crash recovery, and reconciliation.

Support cancellation of individual performances/screenings and entire events. Stop new bookings appropriately, identify eligible paid bookings, and create durable refund jobs.

Use an outbox or equivalent reliable job mechanism. Do not assume a MongoDB transaction can atomically commit an external payment-provider refund. Reconcile uncertain outcomes before retrying. Only mark refunds complete after authoritative provider confirmation. Preserve audit records.

## Discovery and location
Build upcoming-event discovery, nearby events, date/category/price filters, comedy and movie discovery, search, recommendations, map/list views, and trending events.

GPS must be optional and permission-based. When permission is denied, customers must still be able to select a city or neighborhood manually and discover events.

Use MongoDB geospatial indexes for valid coordinates. Never fabricate locations, distances, or event data. Keep list discovery functional if a map provider is unavailable.

## UI and quality
Create a distinctive, premium, responsive interface inspired by modern social feeds without copying another platform's exact design.

Provide customer, vendor, and admin layouts. Include loading, empty, error, success, retry, and unauthorized states. No dead buttons, fake success messages, or disconnected demo pages.

Use real API-backed data. Keep seed data clearly separated from production data.

## Security
Enforce authentication, role permissions, resource ownership, validation, rate limiting, secure password hashing, safe uploads, NoSQL injection protection, secure CORS, CSRF protection where applicable, and secret management through environment variables.

Never trust browser-supplied prices, roles, payment status, or booking confirmation. Protect sensitive information in logs and API responses.

## Engineering workflow
- Inspect the workspace before editing.
- Preserve working code and existing dependencies.
- Follow the approved architecture and work in small phases.
- Implement modular models, services, controllers, routes, validation, and UI components.
- Add tests alongside each feature.
- Run relevant tests, type checks, linting, and builds.
- Fix regressions before moving on.
- Do not silently omit requirements.
- Do not claim commands or tests passed unless actually executed.
- If blocked by credentials or unavailable infrastructure, implement a safe adapter or documented setup step; do not fake a successful integration.

## Required testing
Test same-seat concurrent requests, at least 50 concurrent requests for the last ticket, overselling, multi-seat partial failure, hold expiry, duplicate requests, transaction rollback, payment crashes, duplicate webhooks, late payments, cancellation races, duplicate refund requests, authorization, price tampering, and GPS-denied/manual-city discovery.

Verify persisted inventory and booking states after concurrency tests.

## Final reporting
After each phase, report files changed, features completed, commands actually run, pass/fail results, unresolved problems, and the next phase.

Do not declare production readiness until critical booking, payment, refund, security, and recovery behavior has been tested.

## Phase order
1. Inspect workspace and design architecture.
2. Project setup, MongoDB connection, health checks.
3. Authentication and roles.
4. Events, venues, performances, and screenings.
5. Seat-layout designer and atomic booking engine.
6. Checkout and payments.
7. Cancellation, refunds, and recovery.
8. Upcoming/nearby discovery and manual location selection.
9. Social feed and profiles.
10. Vendor/admin dashboards, analytics, tickets, and check-in.
11. Integration, concurrency, security, and end-to-end tests.
12. Documentation and deployment preparation.

Never attempt all phases in one response. Follow the phase prompts provided by the user.
