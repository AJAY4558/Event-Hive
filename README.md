# EventHive — Monorepo

## Stack
- **Backend**: Node.js, Express, JavaScript (CommonJS), Mongoose, Socket.IO
- **Frontend**: React 18, Vite, JavaScript/JSX, Tailwind CSS, React Router v6
- **Database**: MongoDB 8.x (replica-set `rs0` required for transactions)
- **Testing**: Vitest, Supertest, Playwright

## Prerequisites

### 1. MongoDB Replica Set (REQUIRED before `npm install`)

The project-local configuration uses `127.0.0.1:27018` and the existing `mongo-rs/data` path. It leaves the Windows MongoDB service on `27017` and that service's data directory unchanged.

**In a normal PowerShell window:**
```powershell
$mongoBin = "$env:ProgramFiles\MongoDB\Server\8.2\bin\mongod.exe"
$cfg = (Resolve-Path .\mongo-rs\mongod-rs0.cfg).Path
Start-Process -FilePath $mongoBin -ArgumentList @('--config', "`"$cfg`"") -WindowStyle Hidden
.\mongo-rs\init-replica-set.ps1
```

The initializer only calls `rs.initiate` when the server reports `NotYetInitialized`; otherwise it verifies the existing primary. It does not remove test collections or data.

### 2. Environment Variables

Copy `.env.example` to `backend/.env` and fill in values:
```powershell
Copy-Item .env.example backend\.env
```

## Installation
```bash
npm install
```

## Development
```bash
# Terminal 1 — backend
npm run dev:backend

# Terminal 2 — frontend
npm run dev:frontend
```

## Health Check
```bash
curl http://localhost:4000/health
```
Expected: `{"status":"ok","db":"connected","rs":true,"uptime":...}`

## Testing
```bash
npm run test:backend          # unit + integration
npm run lint:backend
npm run build:frontend
```

The backend integration tests use the isolated `eventhive_test` database configured by `backend/tests/setup.js`. They require an available primary for replica set `rs0`.

## Phase 3 — Events, venues, and organizer tools

Organizers can create event drafts, edit event details, create and manage venue layouts, add multiple future performances, configure general-admission capacity and prices, set assigned-seat category prices, and publish or cancel events. Published events appear in the public discovery and detail pages. Discovery supports text, category, city, date filters, and pagination.

Each performance stores its own schedule, venue address snapshot, capacity/pricing configuration, and a copy of its seat map. Editing a venue later does not rewrite the seat IDs or layout already attached to a performance. This phase does not create bookings, holds, or seat-availability claims.

### Phase 3 API routes

- Public discovery: `GET /api/events`, `GET /api/events/:eventId`
- Organizer events: `POST /api/events`, `GET /api/events/organizer`, `GET /api/events/organizer/:eventId`, `PATCH /api/events/:eventId`
- Event lifecycle: `POST /api/events/:eventId/publish`, `POST /api/events/:eventId/cancel`
- Performances: `POST /api/events/:eventId/performances`, `PATCH /api/events/:eventId/performances/:performanceId`, and the matching `/cancel` action
- Venues and layouts: `GET/POST /api/venues`, `GET/PATCH/DELETE /api/venues/:venueId`, `PATCH /api/venues/:venueId/layout`

Organizer routes require a bearer access token and enforce organizer role and resource ownership. Venue deletion is a soft deactivation and is rejected while a scheduled performance uses that venue.

## Project Structure
```
eventhive/
├── backend/          Node.js + Express + JavaScript
├── frontend/         React + Vite + JavaScript/JSX + Tailwind
├── mongo-rs/         Local replica-set config (development alternative)
└── .env.example      Environment variable template
```
