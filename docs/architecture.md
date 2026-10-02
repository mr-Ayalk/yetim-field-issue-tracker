# Architecture

Yetim is one Next.js application. Field reports are created in the browser, stored in IndexedDB, and delivered to PostgreSQL through route handlers. The service worker can cache the app shell. It does not sync report data.

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

## Boundaries

| Layer | Responsibility | Location |
| --- | --- | --- |
| UI | Forms, workbench, sync center, role switcher | `components/`, `app/` |
| Application | Create, update, status, sync batch, demo controls | `lib/server/report-service.ts`, `lib/server/sync-service.ts` |
| Domain | Categories, priorities, workflow matrix, validation, backoff | `lib/domain/` |
| Local persistence | Reports, outbox, attachments, activity | `lib/offline/` |
| Server persistence | Prisma repository and schema | `lib/server/prisma-repository.ts`, `prisma/` |

Browser code does not import Prisma. Route handlers do not import Dexie.

## Request path

1. The UI writes a report and an outbox operation in one IndexedDB transaction.
2. The sync engine sends one operation to `POST /api/sync`.
3. The service validates again, checks the role, and calls the repository.
4. PostgreSQL enforces `unique(client_id)`, foreign keys, and the status enum.
5. The response is an acknowledgement or a classified failure.
6. The client stores that acknowledgement before it treats the operation as complete.

## Roles

There is no account system. The browser sends `x-yetim-role` and `x-yetim-actor`. The server checks the role before operational changes. Replacing the header with a session later does not require moving the workflow rules.

## Health and readiness

`GET /api/health` reports that the process is alive. It does not touch the database.

`GET /api/ready` runs `SELECT 1`. Any HTTP response means the network and the app server are up, so the offline banner stays hidden. Synchronization starts only after that check returns 200. `navigator.onLine` alone is never enough to show offline or to send, and a started request is never shown as synchronized.
