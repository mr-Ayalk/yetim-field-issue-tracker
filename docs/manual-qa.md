# Manual QA

Use a current Chromium browser. Start PostgreSQL, run `npm run db:setup`, then `npm run dev`. Open http://localhost:3000. The role switcher starts as Demo reviewer.

## Demo path

1. Open Yetim and read the dashboard.
2. Switch to Field worker.
3. Toggle simulated offline. Confirm the banner says "You're offline. Yetim keeps working."
4. Create a water-point report and submit it.
5. Confirm the badge says Pending, not Synchronized.
6. Refresh. The report is still there.
7. Open Sync Center and confirm the pending count.
8. Turn simulated offline off.
9. Sync now. The badge becomes Synchronized only after the request succeeds.
10. Sync now again. The server still has one row for that client ID.
11. Switch to Coordinator. Open the workbench, assign the report, and move it to in progress.
12. Open the case file and read the history.
13. Use Attempt invalid resolve. The message names the illegal transition.
14. From Settings, as Demo reviewer, simulate a conflict on a synchronized report.
15. Confirm both versions are visible and that nothing changes until Keep server, Apply local, or Review manually.

## Checklist

| Step | Expected |
| --- | --- |
| A01 Create while online | Local row, server row, history contains created, submitted, and synced |
| A02 Create while offline | Pending badge, outbox row, no claim of upload |
| A03 Refresh | Same report and pending state |
| A04 Close and reopen the browser | Same report |
| A05 Several offline reports | All remain, each with its own client ID |
| A06 Restore connectivity | Ready probe succeeds and sync is offered |
| A07 Sync now | Each acknowledged report becomes Synchronized |
| A08 Sync now again | No second server row |
| A09 Simulate 503 or timeout | Failed, report still present, technical detail expandable |
| A10 Retry | A later success becomes Synchronized |
| A11 Invalid transition | 422 `INVALID_STATUS_TRANSITION` and a readable message |
| A12 Full workflow | History gains each status, assignment, and resolution |
| A13 Stale version | Conflict badge, local and server text both visible |
| A14 Resolve | The chosen version is stored and `CONFLICT_RESOLVED` is in history |
| A15 Workbench | Filters, assignment, and legal status actions work |
| A16 Sync Center | Pending, failed, conflict, last success, and diagnostic detail |

## Also check

- Save draft does not add an outbox row.
- A description under 10 characters cannot be submitted.
- Deny location permission. The report can still be submitted, and the case file says coordinates were not captured.
- A photo that is not a JPEG, PNG, or WebP is rejected. The text report remains.
- Clear local data does nothing until the word CLEAR is typed. Server rows remain.
- Keyboard: reach the role switcher, the form fields, and Sync now without a pointer. Focus is visible.
- Narrow the window to a phone width. The report list becomes cards and the workbench scrolls sideways.
- Search by issue code, client ID, location, and a word in the description.

## Empty and failure states

- Filters that match nothing show an empty state, not a fake metric.
- If PostgreSQL is down, `/api/ready` is 503, the banner treats the app as offline, and local drafts still save.
