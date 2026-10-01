# Final audit

Date: 1 October 2026. This audit records what was checked, not a claim that every manual scenario was executed against a hosted database.

## 1. SRS compliance

The PDF remains the baseline. The tracked MUST items in `docs/requirements-baseline.md` have an implementation path in `docs/requirements-traceability.md`. Items that are only partially proven are listed under remaining risks.

## 2. Functional requirement compliance

Create, draft, list, detail, filter, search, assignment, priority, workflow, history, dashboard counts, and analytics are implemented. Counts are derived from the reports on the device after the server merge. They are not hardcoded.

## 3. Offline compliance

Submit writes the report and the outbox row in one IndexedDB transaction. A failed save throws and does not show success. T-06 reopens the database and still finds the pending report. The banner text is "You're offline. Yetim keeps working."

## 4. Synchronization compliance

The engine sends one operation at a time, classifies failures, backs off, and stops automatic retries at five. Synchronized is set only in the success persist path. T-07 and T-08 cover acknowledgement and a later failure. Ready is probed before a send. `navigator.onLine` is not treated as proof.

## 5. Workflow compliance

The matrix is in `lib/domain/workflow.ts` and checked again in `changeStatus`. T-01 and T-02 pass, including the exact draft-to-resolved message.

## 6. History compliance

Server history is append-only. Local `SYNC_FAILED` events stay on the device and are labeled "On this device". Conflict detection and resolution append their own events.

## 7. Validation compliance

Zod schemas run for creates, updates, status changes, attachments, and sync batches. The form shows field errors. The server does not trust the browser. T-03 covers a rejected payload.

## 8. Security compliance

No credentials are in source. `.env` is gitignored. IndexedDB stores reports, not database URLs. Attachment bytes are checked for JPEG, PNG, or WebP signatures and size. 500 responses omit stacks. The role header is an explicit stand-in, documented as such.

## 9. Testing compliance

`npx vitest run`: 21 tests, 5 files, all passed (T-01 through T-12). `npx tsc --noEmit` passed. `npx next build` completed successfully (Next.js 15.5.27). Playwright scenarios A and B are in `tests/e2e/critical.spec.ts`. They were not executed in this audit because a PostgreSQL instance was not available and Playwright's browser was not installed here. Scenarios C through G are covered by unit tests and `docs/manual-qa.md`, not by a green Playwright run.

## 10. README compliance

`README.md` uses the required title, tagline, and one-line description, and includes the sections requested in the brief.

## 11. Git compliance

The baseline commit is `docs: add SRS and project requirements baseline`. Further commits should be the implementation and the documents. `node_modules`, `.env`, and `.next` are ignored. A search for the previous product name found no matches in source. `console.log` remains only in the seed script, which is a command-line summary.

## 12. Deployment compliance

`/api/health` and `/api/ready` exist. `.env.example` lists `DATABASE_URL` and `NEXT_PUBLIC_APP_URL`. The migration is in `prisma/migrations`. This audit did not deploy to Vercel or Neon.

## 13. Manual QA compliance

The checklist is written. The click-through in a browser against a live database was not completed in this session. Do not treat the checklist as a passed run.

## 14. Known limitations

See the README. The important ones: role header instead of authentication, client merge capped at 100 rows, photos in PostgreSQL, no background sync after the tab closes, and end-to-end tests not run here.

## 15. Remaining risks

- Two truly parallel creates are handled by the unique constraint in `PrismaReportRepository`, but the unit suite uses the in-memory repository. A database-level race test is still worth adding.
- The production build succeeded. A full Playwright run still needs PostgreSQL and `npx playwright install chromium` before those browser scenarios can be called green.
- Demo reset is available to anyone who can send `x-yetim-role: DEMO_REVIEWER` while demo mode is on.

## MUST evidence (short)

| Area | Where | How verified |
| --- | --- | --- |
| Offline save | `lib/offline/store.ts` | T-06 |
| Idempotent create | `createSubmitted` and unique `client_id` | T-04, T-09 |
| Partial sync | `synchronizeQueue` | T-08 |
| Conflict | version check and conflict panel | T-10 |
| Workflow | `changeStatus` | T-01, T-02 |
| History order | report service | T-05, T-11 |
| Sync copy | `SyncBadge` | T-12 |
| Ready versus health | `app/api/ready/route.ts`, `app/api/health/route.ts` | code review |
