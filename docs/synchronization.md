# Synchronization

Yetim treats the server as the authority for shared data and the device as the authority for work that has not been acknowledged yet.

## Local persistence

IndexedDB (Dexie, database name `yetim`) keeps four stores:

| Store | Contents |
| --- | --- |
| `reports` | Drafts and submitted reports, including the last known server version |
| `outbox` | One row per server-bound mutation |
| `attachments` | Image blobs, checksums, and upload state |
| `activity` / `meta` | Sync log and last-success timestamps |

Drafts are not queued. Submit writes the report and a `CREATE_REPORT` outbox row in one transaction. If that transaction fails, the UI keeps the form and does not say the report was saved.

Closing the tab or refreshing does not clear these stores.

## Outbox lifecycle

```
PENDING ──► SYNCING ──► SYNCHRONIZED
                │
                ├──► FAILED      (retryable unless the error is permanent)
                └──► CONFLICT    (needs an explicit decision)
```

An operation that is still `SYNCING` when the page loads is put back to `PENDING`. The attempt may have reached the server. The next send uses the same `clientOperationId` and the same `clientId`, so the server returns the existing report instead of creating another.

## When sync runs

- The browser comes online.
- The tab becomes visible or focused.
- A 30 second timer, when something is queued.
- Sync now, including after submit when the backend is reachable.

Each trigger probes `GET /api/ready`. Simulated offline skips the probe and does not send.

## One acknowledgement at a time

The client sends a batch of one operation. The server also walks a batch independently, so a later item cannot erase an earlier success.

```
Report A → acknowledged
Report B → acknowledged
Report C → timeout, FAILED, still stored
Report D → not attempted, still PENDING
```

## Retry

Transient failures (network, timeout, 408, 429, 5xx) use bounded exponential backoff: 1s, 2s, 4s, 8s, 16s, then 30s. Automatic retries stop after 5 attempts. Sync now can try again.

Validation and authorization failures are not retried automatically. The row stays in the queue with the error until someone corrects it or retries on purpose.

Conflicts are not retried as the same update.

## Idempotency

Every local report has an immutable `clientId` generated with `crypto.randomUUID()`. It is not derived from the description.

`reports.client_id` is unique. A repeated create with the same `clientId` returns the existing row and `meta.idempotent: true`. A repeated `clientOperationId` is stored in `processed_operations` and returns the same logical report. Two overlapping creates still end as one row because the unique constraint fails the loser, which then reads the winner.

## Failure classes

| Class | Examples | Client result |
| --- | --- | --- |
| Transient | timeout, 502, 503, connection reset | FAILED, backoff, data kept |
| Validation | 400, 422, bad enum | FAILED, no automatic retry |
| Conflict | 409 `VERSION_CONFLICT` | CONFLICT, both versions shown |
| Authorization | 401, 403 | FAILED, no automatic retry |
| Unknown | anything else | FAILED, retries capped |

Demo faults are labeled simulated. A simulated 503 or validation error returns before any write. A simulated timeout waits on the request signal and does not write if the client aborts.

## Conflicts

Server rows have an integer `version`. An update includes `baseVersion`. If it does not match, the server returns 409 and does not change the business fields. It appends `CONFLICT_DETECTED` once for that operation id.

The device stores the server snapshot beside the local report. The user chooses:

- Keep server version. The server appends `CONFLICT_RESOLVED` and the device adopts the server row.
- Apply local version. The server writes the local fields even though the version was stale, bumps the version, and appends `CONFLICT_RESOLVED`.
- Review manually. The user edits the local text, then applies that revision.

Nothing in that flow silently picks a side.

## Time

`reportedAt` is the device time, converted to UTC, with the offset kept in `reportedTimezone`. `serverReceivedAt` is set when PostgreSQL accepts the report. The interface shows local time and the case file shows both timestamps.

## What sync is not

The service worker caches the shell only. It does not read the outbox, and it does not run while the site is closed. Delivery happens while Yetim is open.
