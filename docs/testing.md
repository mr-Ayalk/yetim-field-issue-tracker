# Testing

Unit tests run with Vitest and do not need PostgreSQL. They cover the rules that lose data if they are wrong.

| ID | What it locks | File |
| --- | --- | --- |
| T-01 | Legal status change is accepted | `tests/unit/report-service.test.ts` |
| T-02 | Illegal status change is rejected and the row stays put | `tests/unit/report-service.test.ts`, `tests/unit/workflow.test.ts` |
| T-03 | Invalid create payload is rejected and nothing is stored | `tests/unit/report-service.test.ts` |
| T-04 | The same client ID returns one report | `tests/unit/report-service.test.ts` |
| T-05 | Status changes append history in order | `tests/unit/report-service.test.ts` |
| T-06 | A submitted offline report is still there after the database is reopened | `tests/unit/offline-store.test.ts` |
| T-07 | Acknowledgement is what marks an operation synchronized | `tests/unit/sync-engine.test.ts` |
| T-08 | A later failure stays retryable and does not undo the earlier success | `tests/unit/sync-engine.test.ts` |
| T-09 | Replaying the same create does not add a second row | `tests/unit/report-service.test.ts` |
| T-10 | A stale version becomes a conflict and the server value remains | `tests/unit/sync-engine.test.ts`, `tests/unit/report-service.test.ts` |
| T-11 | Create and status history stay chronological | `tests/unit/report-service.test.ts` |
| T-12 | Sync badges render the words Pending, Syncing, Synchronized, Failed, and Conflict | `tests/unit/sync-badge.test.tsx` |

`npm run test` runs that suite.

Playwright covers the field path that must be obvious to a reviewer:

- Scenario A. Create a report and open it.
- Scenario B. Simulated offline, create, refresh, the report is still pending.

Scenarios C through G are covered by the unit tests above and by the manual checklist in `docs/manual-qa.md`. They need a reachable PostgreSQL database, so they are not implied to pass in an environment with no `DATABASE_URL`.

The repository implementation against PostgreSQL is `PrismaReportRepository`. The unit suite drives the same service methods through `MemoryReportRepository`, including the unique client ID and version checks. A deployment still has to run the migration against PostgreSQL before those paths are live.
