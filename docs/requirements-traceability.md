# Requirements traceability

Source: `docs/YETIM_Offline_Field_Issue_Tracker_SRS_v1.0.pdf`, extracted in `docs/requirements-baseline.md`.

| Requirement | Implementation | Tests | Acceptance |
| --- | --- | --- | --- |
| FR-01 Create report | `components/report-form.tsx`, `POST /api/reports` | T-03 | A01 |
| FR-02 Drafts stay local | `lib/offline/store.ts` `saveDraft` | offline draft test | Manual QA |
| FR-03 Validation at UI, domain, and server | `lib/domain/validation.ts`, route handlers | T-03 | A11 |
| FR-04 Offline create shows Pending | `submitLocalReport`, `SyncBadge` | T-06, T-12 | A02 |
| FR-05 IndexedDB survives refresh | Dexie `yetim` database | T-06 | A03, A04 |
| FR-06 List shows status, priority, time, sync | `components/reports-view.tsx` | T-12 | A15 |
| FR-07 Detail case file | `components/report-detail.tsx` | Scenario A | A12 |
| FR-08 Sync now | `components/sync-view.tsx` | sync engine | A07 |
| FR-09 Auto sync on focus and connectivity | `components/provider.tsx` | sync engine triggers via `shouldAttempt` | A06 |
| FR-10 Terminal states and retry | `lib/offline/sync-engine.ts` | T-07, T-08 | A09, A10 |
| FR-11 Immutable client ID and unique constraint | schema `client_id`, `createSubmitted` | T-04, T-09 | A08 |
| FR-12 Server workflow matrix | `lib/domain/workflow.ts`, `changeStatus` | T-01, T-02 | A11, A12 |
| FR-13 History | `report_history`, local history for failures | T-05, T-11 | A12, A14 |
| FR-14 Coordinator sees and changes the set | role checks, workbench | role test in report service | A15 |
| FR-15 Filters including sync and dates | reports view | manual | A15 |
| FR-16 Search | reports view and `q` on the API | manual | A15 |
| FR-17 Assignment | status change to ASSIGNED | T-01 | A15 |
| FR-18 Priority change with history | `fieldDiffHistory` | T-10 setup | A12 |
| FR-19 Evidence | attachments API and local blobs | service size and type checks | Manual QA |
| FR-20 Optional GPS | form geolocation button | manual | Manual QA |
| FR-21 Explicit conflict resolution | version check, conflict panel | T-10 | A13, A14 |
| FR-22 Analytics from real rows | dashboard and analytics views | no fabricated numbers | dashboard |
| NFR offline persistence | IndexedDB transaction | T-06 | A03–A05 |
| NFR idempotent create | unique client ID plus processed operations | T-04, T-09 | A08 |
| NFR per-operation sync | one-at-a-time client send, independent server loop | T-08 | A09 |
| NFR accessibility | labels, text plus icon, focus ring | T-12 | Manual QA |
| API health and ready | `app/api/health`, `app/api/ready` | ready used by the probe | deployment |
| Roles | `x-yetim-role` checked in the service | field worker versus coordinator test | A15 |
