# Yetim (የትም)

Yetim: report from anywhere.

> An offline-first field issue tracker that works anywhere,
> even where there's no signal.

## Product Story

Field workers report from anywhere, including places with no signal at all. The app works anywhere, with or without a network. Reports reach the coordinator from anywhere in the field.

ከየትም ሪፖርት አድርጉ. Report from anywhere.

## Problem

A field issue that only exists in a notebook, or in a form that refused to open because the radio was down, never reaches the person who can assign it. Waiting for a signal before the report is captured means the report is often lost, rewritten later from memory, or submitted twice when the phone finally connects.

## Why Offline-First Matters

Yetim writes the report to this device first. The screen can say Pending immediately. Synchronization is a later, acknowledged step. A timeout, a 503, or a coordinator edit made while the device was away does not delete the local report and does not silently overwrite either copy.

## Key Features

- Create and draft reports with no network, including category, priority, location, and an immutable client ID.
- IndexedDB outbox with per-operation acknowledgement, bounded backoff, and visible Pending, Syncing, Synchronized, Failed, and Conflict states.
- Idempotent create: the same client ID cannot become two server reports.
- Server-enforced workflow from draft through submitted, assigned, in progress, resolved, and rejected.
- Append-only history for creates, status changes, assignments, sync, and conflict decisions.
- Coordinator workbench, filters, and dashboard counts taken from real rows.
- Optional coordinates and a photo, neither of which is required to save the report.
- Demo controls for simulated offline, timeout, 503, validation failure, and conflict.

## Reviewer Quick Start

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev

```
## Screenshots


1. Dashboard with the offline banner.

<img width="1365" height="631" alt="image" src="https://github.com/user-attachments/assets/3d5ae333-01ee-4863-b5e8-bae3e3d78394" />

2. New report form on a narrow viewport.

<img width="1365" height="629" alt="image" src="https://github.com/user-attachments/assets/43fe701b-dd92-4797-a6ed-1ab40a3a4de7" />
<img width="1365" height="626" alt="image" src="https://github.com/user-attachments/assets/fbd9c024-38de-4e08-836b-39c875c2f29c" />



## Architecture

Yetim is a single Next.js App Router application. The browser owns unacknowledged work. Route handlers and PostgreSQL own shared work. See [docs/architecture.md](docs/architecture.md).

## System Diagram

```
                 Yetim Web App
                       │
           ┌───────────┴───────────┐
           │                       │
      Field Worker             Coordinator
           │                       │
           └───────────┬───────────┘
                       │
                 Next.js App
                       │
           ┌───────────┴───────────┐
           │                       │
       IndexedDB              Route Handlers
           │                       │
        Outbox                     │
           │                       │
       Sync Engine                 │
           └───────────┬───────────┘
                       │
                    Prisma
                       │
                  PostgreSQL
```

## Offline Architecture

A submit saves the report and the outbox operation in one IndexedDB transaction. Drafts are not uploaded. The service worker may cache the shell. It does not sync the queue. Details are in [docs/synchronization.md](docs/synchronization.md).

## Synchronization Strategy

```
PENDING → SYNCING → SYNCHRONIZED
              ├─→ FAILED
              └─→ CONFLICT
```

The client sends one operation at a time and records the response before it starts the next. Restored connectivity, focus, a timer, and Sync now are the triggers. Each one probes `/api/ready` first.

## Idempotency and Duplicate Prevention

`clientId` is a UUID created on the device and never derived from the text. PostgreSQL has a unique constraint on `client_id`. A retry returns the existing row with `meta.idempotent: true`. Status 409 is reserved for a stale version, not for "already created".

## Conflict Handling

If `baseVersion` does not match, the server leaves the newer row in place and the device shows both versions. The user keeps the server copy, applies the local copy, or edits and then applies. The decision is written to history as `CONFLICT_RESOLVED`.

## Workflow State Machine

```
DRAFT → SUBMITTED → ASSIGNED → IN_PROGRESS → RESOLVED
            │                         ↑
            └→ REJECTED               │
                 │                    │
                 └→ SUBMITTED         └── reopen to IN_PROGRESS
```

Any other jump returns `INVALID_STATUS_TRANSITION`. The UI hides illegal buttons. The server still checks.

## Data Model

- `reports` with unique `client_id`, `version`, `reported_at`, and `server_received_at`
- `report_history` append-only, cascaded with the report
- `attachments` with a unique client attachment ID and a unique checksum per report
- `processed_operations` for replayed sync operations
- `sync_sessions` for the last delivery attempt

Local stores mirror reports, the outbox, and attachment blobs. Schema: `prisma/schema.prisma`.

## API

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/health` | Process is up |
| GET | `/api/ready` | Database answers |
| GET, POST | `/api/reports` | List and idempotent create |
| GET, PATCH | `/api/reports/:id` | Read and correct. `:id` may be the server id or the client id |
| POST | `/api/reports/:id/status` | Workflow transition |
| GET | `/api/reports/:id/history` | Audit trail |
| POST | `/api/sync` | Per-operation batch |
| GET | `/api/sync/status` | Recent server sync sessions |

Errors use `{ "error": { "code", "message", "details" } }`. Validation is 422. A stale version is 409. Not found is 404. A role violation is 403. Unexpected failures are 500 and do not include a stack trace.

## User Roles

Send `x-yetim-role` as `FIELD_WORKER`, `COORDINATOR`, or `DEMO_REVIEWER`, and `x-yetim-actor` as the display name. The switcher in the header sets both.

Field workers create, draft, submit, resubmit a rejection, and inspect their sync failures. Coordinators see the full set, assign, change priority, and move legal workflow states. Demo reviewers can do the coordinator work and use the simulated faults.

## Tech Stack

Next.js 15, React 19, TypeScript, Tailwind CSS 4, Prisma 6, PostgreSQL, Dexie, Zod, Lucide, Vitest, Testing Library, Playwright, ESLint, Prettier.

## Project Structure

```
app/                 routes and API handlers
components/          workspace UI
lib/domain/          workflow, validation, backoff
lib/offline/         IndexedDB, outbox, sync engine
lib/server/          services and Prisma repository
prisma/              schema, migration, seed
tests/unit           domain, API rules, offline, sync
tests/e2e            browser create and offline refresh
docs/                SRS, architecture, QA, traceability
```

## Prerequisites

- Node.js 20 or newer
- A PostgreSQL database you can migrate

## Environment Variables

Copy `.env.example` to `.env`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes, for server sync | PostgreSQL connection string |
| `NEXT_PUBLIC_APP_URL` | No | Public origin, default `http://localhost:3000` |
| `YETIM_DEMO_MODE` | No | Set to `false` to disable demo reset and fault injection |
| `YETIM_LOG` | No | `info` logs warnings as well as errors |

Do not commit `.env`.

## Local Setup

```bash
npm install
copy .env.example .env
```

On Git Bash use `cp .env.example .env`. Then edit `.env` and set `DATABASE_URL` to your Neon or local Postgres URL. Prisma does not read `.env.example`.

`npm install` runs `prisma generate`. If the client is missing after a partial install, run `npm run db:generate`.

## Database Setup

```bash
npm run db:setup
```

That applies the migration and loads the demo reports. You can also run the two steps yourself:

```bash
npm run db:migrate
npm run db:seed
```

`npm run db:setup` runs both. The seed replaces server demo rows with seven field reports (water point, solar equipment, road maintenance, power interruption, safety, a resolved pump, and a rejected request). It does not erase IndexedDB.

## Seed Data

The seed is deterministic and uses fixed client IDs. Run it again any time you want the server demo set restored. In the app, a demo reviewer can also use Seed demo data in Settings, which calls the same reset.

## Running the Application

```bash
npm run dev
```

Open http://localhost:3000. Without a database the shell and offline capture still work. `/api/ready` stays unavailable until PostgreSQL answers, and Sync now will not claim success.

## Running Tests

```bash
npm run test
npm run typecheck
npm run lint
npm run test:e2e
```

Unit tests do not need PostgreSQL. End-to-end tests start `npm run dev` and need the app to boot. Playwright browsers must be installed once with `npx playwright install chromium`.

## Test Coverage Summary

The unit suite has 21 tests covering T-01 through T-12: legal and illegal transitions, invalid payloads, idempotent create, history order, offline reopen, acknowledgement, partial failure, version conflicts, and sync badge text. See [docs/testing.md](docs/testing.md). This is targeted coverage of the failure paths, not a claim of 100% line coverage.

## Manual QA

Follow [docs/manual-qa.md](docs/manual-qa.md). The shortest reviewer path is: dashboard, field worker, simulated offline, create, refresh, Sync Center, online, sync twice, coordinator workflow, invalid transition, simulated conflict.

## Deployment

The app is a standard Next.js deployment in front of managed PostgreSQL (for example Vercel and Neon, or any host that can run `next start` and reach `DATABASE_URL`).

The local seed writes into whichever database is in `.env`. Vercel does not read that file. In the Vercel project, set `DATABASE_URL` to the same Neon connection string, then redeploy. The build applies migrations and, when that database has no reports, loads the seven demonstration reports. A later deploy does not replace reports that are already there. The first report list does the same fill if the database is still empty.

Leave `YETIM_DEMO_MODE` unset, or set it to `true`, on the demo deployment. `false` turns off demo seed and the Settings reset.

```bash
npx prisma migrate deploy
npm run build
npm start
```

Health is `/api/health`. Readiness, including the database, is `/api/ready`.

## Production Readiness

- Server validation and Prisma queries, not string-built SQL
- Security headers for content type, referrer, and framing
- No secrets in the repository or in IndexedDB
- Production 500 responses omit stack traces
- Migrations are in `prisma/migrations`
- Demo fault injection can be turned off

Authentication is intentionally not implemented. The role check is the seam for a future session.

## Assumptions and Design Decisions

See [docs/assumptions.md](docs/assumptions.md). The short version: the server is authoritative after acknowledgement, the device is authoritative before that, and a conflict is a decision rather than a merge algorithm.

## Known Limitations

- **Assessment limitation:** Authentication is intentionally omitted because the
- exercise does not require it. Role simulation is implemented through the
- `x-yetim-role` header for deterministic demonstration. A production deployment
- would replace this mechanism with authenticated sessions and server-side
- identity/authorization.

- The role is a header, not a login. Anyone who can call the API can send a coordinator header while demo mode is on.
- The client merges up to 100 server reports at a time.
- Photos are stored in PostgreSQL and capped at 1.2 MB after compression.
- The map preview depends on OpenStreetMap and is skipped while offline.
- The service worker does not sync in the background after the tab closes.
- End-to-end coverage in CI without a database is the create and offline-refresh path. Conflict, retry, and workflow are locked by unit tests and the manual script.
- `npm run db:seed` replaces server demo data.

## Future Enhancements

- Real authentication in place of `x-yetim-role`
- Object storage for evidence
- Paging the client merge past 100 rows
- Background sync while the installed app is closed
- A hosted deployment with a managed Postgres URL

## AI and Development-Tool Disclosure

This repository was implemented with Cursor. The assistant drafted the Next.js application, domain rules, Prisma schema, IndexedDB sync engine, tests, and these documents from the SRS and the master brief.

What was generated: the application structure, workflow matrix, outbox engine, API handlers, workspace UI, unit tests, and documentation.

What was accepted: offline-first capture, immutable client IDs, per-operation acknowledgement, server-side transition checks, explicit conflict resolution, and the test list T-01 through T-12.

What was modified during the same pass: validation messages, role rules, history event order, and the UI copy so that "synchronized" is only used after an acknowledgement.

What was rejected: a second backend, fuzzy duplicate detection, silent conflict merges, and treating the service worker cache as synchronization.

Verification: `npx tsc --noEmit` and `npx vitest run` (21 tests). Synchronization and idempotency were reviewed against the failure cases in `docs/synchronization.md`, not only the happy path. Final engineering judgment for submission stays with the author. AI output was not treated as proof that a requirement is met.


All generated code was reviewed against the SRS, tested, and modified where
necessary. The final architecture, implementation decisions, debugging,
verification, and submission remain my responsibility.


## Development Timeline / Time Spent


Approximately **4 hours** were spent on the assessment implementation, testing,
documentation, and final verification.

The work was developed incrementally, with meaningful commits throughout the
implementation rather than a single final bulk commit.

## What I Would Improve With More Time

I would run the Playwright conflict, retry, and full-workflow scenarios against a disposable PostgreSQL database in CI, add a race test that fires two creates at the database at once, and replace the role header with a real session without moving the domain rules.

## Requirements Traceability

[docs/requirements-traceability.md](docs/requirements-traceability.md) maps each tracked requirement to code, tests, and an acceptance step. The authoritative baseline is the SRS PDF in `docs/`.


## Core Engineering Decisions

- **Offline-first:** reports are persisted locally before synchronization.
- **Durable outbox:** server-bound operations survive refresh and temporary outages.
- **Idempotency:** immutable client IDs prevent duplicate server creates during retries.
- **Per-operation acknowledgement:** partial synchronization does not lose successful work.
- **Optimistic concurrency:** stale updates become explicit conflicts instead of silent overwrites.
- **Append-only history:** operational changes remain auditable.
- **Server authority after acknowledgement:** synchronized state comes from server acknowledgement;
  unsynchronized work remains safely owned by the local device.

  
## Submission Information

- Product: የትም / Yetim
- Repository: yetim-field-issue-tracker
- Exercise: WEDER Strategies Full Stack Developer Internship technical exercise
- Spec: `docs/YETIM_Offline_Field_Issue_Tracker_SRS_v1.0.pdf`
- Audit: `docs/final-audit.md`
