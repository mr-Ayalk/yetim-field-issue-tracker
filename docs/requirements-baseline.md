# Yetim requirements baseline

Extracted from `docs/YETIM_Offline_Field_Issue_Tracker_SRS_v1.0.pdf` (SRS v1.0.0, 1 October 2026) before application code. This checklist is the implementation contract. Traceability to files and tests is completed in `docs/requirements-traceability.md` as each requirement is verified.

Priority rule: every MUST is in scope. SHOULD items ship only when they do not weaken sync correctness, tests, README quality, or git discipline. MAY items are out of the critical path.

## Product identity

- Brand: የትም / Yetim. No previous product name anywhere.
- Tagline: Yetim: report from anywhere.
- Amharic: ከየትም ሪፖርት አድርጉ
- Offline banner: You're offline. Yetim keeps working.
- README one-liner: An offline-first field issue tracker that works anywhere, even where there's no signal.

## Functional requirements

| ID | Priority | Requirement | Planned home |
| --- | --- | --- | --- |
| FR-01 | MUST | Create report with category, description, location, priority, status, reportedAt, generated clientId | `lib/domain`, report form, `POST /api/reports` |
| FR-02 | MUST | Save incomplete work as Draft locally; do not submit until explicit submit | offline lifecycle |
| FR-03 | MUST | Reject invalid values in UI, domain, and server | `lib/domain/validation.ts`, API |
| FR-04 | MUST | Save a valid report offline and show Pending immediately | offline lifecycle + sync badge |
| FR-05 | MUST | IndexedDB survives refresh/reopen | Dexie store, T-06 |
| FR-06 | MUST | List shows status, priority, time, sync state | reports page |
| FR-07 | MUST | Detail shows fields, workflow, sync, ids, history | report detail |
| FR-08 | MUST | Visible Sync Now for retryable work | Sync Center |
| FR-09 | MUST | Auto sync on restored connectivity and focus/resume | sync engine triggers |
| FR-10 | MUST | Each operation ends synchronized, failed, or conflict; failures stay retryable | sync engine |
| FR-11 | MUST | Immutable client UUID + server unique constraint | API create + schema |
| FR-12 | MUST | Server-enforced status matrix | `lib/domain/workflow.ts`, status route |
| FR-13 | MUST | History for create, sync, failure, status, edits | `ReportHistory` |
| FR-14 | MUST | Coordinator sees the full set and can change workflow | roles + board/detail |
| FR-15 | MUST | Filter status, priority, category, sync state, date range | reports list (sync state is a client projection) |
| FR-16 | SHOULD | Search issue id, client id, description, location | reports list + API `q` |
| FR-17 | SHOULD | Assignment | status/assign service |
| FR-18 | SHOULD | Priority change with history | PATCH |
| FR-19 | SHOULD | Optional evidence with size/type controls | attachments |
| FR-20 | SHOULD | Optional GPS after explicit permission | location capture |
| FR-21 | SHOULD | Explicit conflict resolution, no silent overwrite | version + conflict UI |
| FR-22 | SHOULD | Operational analytics from real records | dashboard + analytics |

## Workflow

Valid transitions only:

- DRAFT → SUBMITTED
- SUBMITTED → ASSIGNED
- SUBMITTED → REJECTED
- ASSIGNED → IN_PROGRESS
- IN_PROGRESS → RESOLVED
- RESOLVED → IN_PROGRESS (coordinator reopen)
- REJECTED → SUBMITTED (resubmit)

Field workers may submit and resubmit. Coordinators perform operational transitions. Demo reviewers can operate the coordinator path and the diagnostic controls. The server enforces this even if the UI hides buttons.

## Offline and sync invariants

1. A pending local report is never deleted because sync failed.
2. Acknowledgement is stored before the operation is complete.
3. Retrying CREATE with the same clientId yields one server report.
4. Conflicts do not silently pick local or server data.
5. Refresh/reopen does not destroy pending work.
6. Permanent validation failures stay inspectable until corrected.
7. The UI shows Synchronized only after server acknowledgement.
8. Clearing local data is explicit.
9. Interrupted sync is per operation. A later failure does not roll back earlier acknowledgements. On a transient failure the current item becomes retryable and items not yet attempted stay pending.
10. `navigator.onLine` is only a hint. `/api/ready` establishes application connectivity.
11. Drafts are not uploaded. Only an explicit submit enqueues delivery.

## Data model

Server: Report, ReportHistory, Attachment, SyncSession. Local: reports, outbox, attachments, sync metadata. Unique `clientId`. Integer `version`. `reportedAt` is device time. `serverReceivedAt` is backend receipt time. Timestamps stored in UTC.

## API

- GET `/api/health`
- GET `/api/ready`
- GET/POST `/api/reports`
- GET/PATCH `/api/reports/:id`
- POST `/api/reports/:id/status`
- GET `/api/reports/:id/history`
- POST `/api/sync`
- GET `/api/sync/status`

Stable error envelope. 409 is version conflict. Idempotent create replay returns the existing report with success, not a second row.

## Roles

FIELD_WORKER, COORDINATOR, DEMO_REVIEWER. No production authentication. Role is a domain and server check via `x-yetim-role`, ready to be replaced by real identity later.

## Testing

T-01 through T-12, plus e2e scenarios A–G, plus manual QA in `docs/manual-qa.md`.

## Acceptance

AC-01 through AC-10, and the A01–A16 walkthrough in the master brief.

## Assumptions already fixed by the SRS

A-01 through A-15 in SRS section 18. Implementation will follow those decisions and record any additional decisions in `docs/assumptions.md`.

## Additional implementation decisions (recorded up front)

- D-01. Idempotent create replay responds 200 with `meta.idempotent: true`. 409 is reserved for a stale `baseVersion`, so the UI can tell "already delivered" apart from "someone else changed this".
- D-02. Without accounts, "own reports" means reports created in this browser plus server reports whose reporter name matches the local actor name. Coordinators and demo reviewers receive the full server set.
- D-03. Demo fault injection is one-shot, labeled simulated, and active only when demo mode is on.
- D-04. Attachment bytes are stored in PostgreSQL under a size cap so the app does not depend on an external object store. Upload is a separate outbox operation.
- D-05. Map tiles are optional. Coordinates are stored either way. A map preview is offered only when the network is available.
- D-06. DEMO_REVIEWER may perform coordinator mutations so a reviewer can evaluate workflow without being locked out, in addition to switching roles.
