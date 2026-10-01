"use client";

import Link from "next/link";
import { ageLabel, formatWhen, issueCode } from "@/lib/client/format";
import { friendlyMessage } from "@/lib/domain/messages";
import { useYetim } from "@/components/provider";

export function SyncView() {
  const yetim = useYetim();
  const pending = yetim.outbox.filter((op) => op.status === "PENDING");
  const syncing = yetim.outbox.filter((op) => op.status === "SYNCING");
  const failed = yetim.outbox.filter((op) => op.status === "FAILED");
  const conflict = yetim.outbox.filter((op) => op.status === "CONFLICT");
  const oldest = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Sync Center</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">Each report is acknowledged on its own. A failure keeps the successful ones and leaves the rest waiting.</p>
        </div>
        <button type="button" data-testid="sync-now" className="rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={yetim.syncing || yetim.simulatedOffline || !yetim.online} onClick={() => void yetim.syncNow()}>
          {yetim.syncing ? "Syncing" : "Sync now"}
        </button>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Connection" value={yetim.simulatedOffline ? "Simulated offline" : yetim.online ? "Backend reachable" : "Offline"} />
        <Stat label="Pending" value={String(pending.length)} />
        <Stat label="Syncing" value={String(syncing.length)} />
        <Stat label="Failed / conflict" value={`${failed.length} / ${conflict.length}`} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-line bg-card p-5 text-sm">
          <h2 className="text-lg font-semibold">Timing</h2>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between gap-3"><dt>Last successful sync</dt><dd>{formatWhen(yetim.lastSuccess)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Last attempt</dt><dd>{formatWhen(yetim.lastAttempt)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Oldest pending</dt><dd>{oldest ? `${issueCode(oldest.reportClientId)} · ${ageLabel(oldest.createdAt)}` : "None"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Armed simulation</dt><dd>{yetim.pendingFault ?? "None"}</dd></div>
          </dl>
        </article>
        <article className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {yetim.activity.length === 0 ? <li className="text-muted">No sync attempts yet.</li> : null}
            {yetim.activity.map((entry) => (
              <li key={entry.id} className="flex justify-between gap-3">
                <span>{entry.message}</span>
                <span className="shrink-0 text-xs text-muted">{formatWhen(entry.at)}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
      <section className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Operation</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">What happened</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {yetim.outbox.length === 0 ? (
              <tr><td className="px-4 py-8 text-muted" colSpan={5}>The queue is empty.</td></tr>
            ) : null}
            {yetim.outbox.map((op) => (
              <tr key={op.clientOperationId} className="border-b border-line/70 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{op.type.replaceAll("_", " ")}</p>
                  <p className="text-xs text-muted">{issueCode(op.reportClientId)}</p>
                </td>
                <td className="px-4 py-3">{op.status}</td>
                <td className="px-4 py-3">{op.attempts}</td>
                <td className="px-4 py-3">
                  <p>{op.lastError ? friendlyMessage(op.lastErrorCode ?? "", op.lastError) : "Waiting"}</p>
                  {op.lastError ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted">Technical detail</summary>
                      <p className="mt-1 text-xs break-words text-muted">{op.lastErrorCode}: {op.lastError}</p>
                    </details>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-2">
                    <Link className="underline" href={`/reports/${op.reportClientId}`}>View report</Link>
                    {op.status === "FAILED" ? (
                      <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs" onClick={() => void yetim.syncNow()}>Retry</button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-line bg-card px-4 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </article>
  );
}
