# Assumptions and design decisions

The SRS assumptions are followed. These are the decisions that would otherwise be ambiguous, chosen for data safety and testability.

## From the SRS

- Online means the app server answered `GET /api/ready`. `navigator.onLine` is only a hint and cannot mark the app offline by itself. A database that is still waking returns 503 and stays reachable; synchronization waits until the same check returns 200.
- A refresh or a reopened browser must still show pending local work. IndexedDB is that store.
- Duplicate prevention is an immutable client UUID plus a unique server constraint. Text similarity is not used.
- A failed operation does not roll back an earlier acknowledgement.
- A stale `baseVersion` is a conflict. The server does not overwrite the newer row.
- `reportedAt` is device time. `serverReceivedAt` is receipt time. Persistence is UTC.
- Field workers submit and resubmit. Coordinators assign, reject, resolve, and reopen. Demo reviewers can do the coordinator actions and use the diagnostic controls.
- A resolved report can return to in progress. A rejected report can be submitted again. No other jumps are legal.
- Drafts are editable. Submitted descriptions, locations, and categories are corrected only by a coordinator, or by an explicit conflict resolution, and every correction is history.
- Offline storage is not a security boundary. The role header is a development stand-in for a future session.
- Evidence is a separate outbox operation. A failed photo does not delete the report.
- Background sync does not run after the tab is closed.
- If the device is out of storage, the save fails visibly and the form text remains.
- Two intentional submissions are two reports because they have two client IDs. Retrying one submission is one report.
- The server is authoritative after acknowledgement.

## Additional decisions

- D-01. A replayed create returns 200 and `meta.idempotent: true`. 409 is only a stale version.
- D-02. Without accounts, a field worker's server list is filtered by the actor name. Coordinators and demo reviewers receive the full set. Reports created in this browser remain visible locally.
- D-03. Demo faults are one-shot, labeled simulated, and disabled when `YETIM_DEMO_MODE=false`.
- D-04. Attachment bytes live in PostgreSQL, capped at 1.2 MB, so the exercise does not need an object store. The same checksum on a report is treated as the existing image.
- D-05. Coordinates are stored with or without a network. The OpenStreetMap preview is shown only while online and is not required to create a report.
- D-06. A demo reviewer may perform coordinator mutations so the workflow can be reviewed without a second account.
- D-07. Descriptions must be at least 10 characters before submit. Shorter text can still be a draft.
- D-08. Automatic retries stop after five transient attempts. Manual retry remains available.
- D-09. The client merge loads at most 100 server reports per refresh. Larger deployments need paging on the client.
- D-10. Clearing local data requires the word CLEAR. It does not delete PostgreSQL rows.
- D-11. Seed and demo reset replace server demo rows. They do not wipe IndexedDB.
