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

For MongoDB Atlas, set `MONGO_URI` in the ignored `backend/.env` to an Atlas
`mongodb+srv://` connection string and include the `eventhive` database in its
path. Give the database user read/write access and allowlist only the machine's
current public IP in Atlas Network Access. URL-encode reserved characters in
the password. The backend verifies replica-set primary status at startup and
creates its declared indexes; application collections are created as the app
uses them. Do not point integration tests at this database: they use the
separate local `eventhive_test` database.

## Installation
```bash
npm install
```

## Development
```bash
# Start the backend and frontend together
npm run dev

# Or start either service separately
npm run dev:backend
npm run dev:frontend
```

The combined command stops both services when either one exits. The API uses
`backend/.env`; the Vite proxy target is set by `frontend/.env`.

## Deploying to Render

The root `render.yaml` is a Blueprint for the API web service and frontend
static site. Connect this repository to Render and create a Blueprint from the
repository root. The API health check, frontend API URL, and CORS origin are
wired to the generated Render service URLs. `autoDeploy` is disabled so you
control when a deploy runs.

Before deploying, enter `MONGO_URI` in the API service's Render environment
using the Atlas URI for the `eventhive` database. Do not put it in `render.yaml`
or commit a `.env` file. In Atlas Network Access, allow the outbound IP ranges
shown for the Render API service's region; the local computer's IP alone will
not allow Render to connect. Choose the Singapore region in Render to be near
the current Mumbai Atlas cluster.

The Blueprint uses Render's free API plan. Free web services can sleep after
15 minutes without traffic and have ephemeral filesystems. Uploaded event
images therefore require configuring the existing S3-compatible storage
adapter (`UPLOAD_STORAGE_DRIVER=s3` and its bucket, public URL, region, and
credentials) before enabling uploads in production. Local-disk uploads return
HTTP 503 in production by design. Event image URL fields continue to work.

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

### Event artwork and location

The event editor keeps the existing poster and banner URL fields. An uploaded file takes precedence for its matching image slot; the manual URL remains saved as a fallback. Removing an upload only removes its event reference and never deletes the stored file. Drafts retain upload URL, storage key, original filename, MIME type, byte size, and upload time. Poster previews use a 2:3 ratio and banner previews use 16:9. Uploads accept JPG/JPEG, PNG, and WebP up to `MAX_FILE_SIZE_MB` (10 MB by default); set `VITE_MAX_IMAGE_SIZE_MB` in the frontend environment to the same value for matching client-side validation.

Development and test environments use `UPLOAD_STORAGE_DRIVER=local` with files stored under `UPLOAD_DIR` (default `./uploads`). Leave `UPLOAD_PUBLIC_BASE_URL` unset for the Vite development proxy; set it to the local API origin when using a preview on a separate origin. In production, local-disk uploads return HTTP 503 so an ephemeral filesystem is not mistaken for persistent storage. Configure the S3-compatible adapter with `UPLOAD_STORAGE_DRIVER=s3`, `UPLOAD_PUBLIC_BASE_URL`, `UPLOAD_S3_BUCKET`, `UPLOAD_S3_REGION`, `UPLOAD_S3_ACCESS_KEY_ID`, and `UPLOAD_S3_SECRET_ACCESS_KEY`; optionally set `UPLOAD_S3_ENDPOINT` for a compatible provider. Keep credentials only in the backend environment. The cloud bucket or CDN must serve uploaded objects publicly for event artwork, or be configured with an equivalent public-read policy. Existing event locations continue to come from the organizer's manually entered venue address and are snapshotted on each performance; no map service or coordinates are required.

## Project Structure
```
eventhive/
├── backend/          Node.js + Express + JavaScript
├── frontend/         React + Vite + JavaScript/JSX + Tailwind
├── mongo-rs/         Local replica-set config (development alternative)
└── .env.example      Environment variable template
```
