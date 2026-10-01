"use client";

import Link from "next/link";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/domain/constants";
import { ageLabel } from "@/lib/client/format";
import { useYetim } from "@/components/provider";
import { PriorityBadge, SyncBadge } from "@/components/sync-badge";

export function DashboardView() {
  const { reports, outbox, lastSuccess, online } = useYetim();
  const count = (status: string) => reports.filter((report) => report.status === status).length;
  const pending = outbox.filter((op) => op.status === "PENDING").length;
  const failed = outbox.filter((op) => op.status === "FAILED").length;
  const conflict = outbox.filter((op) => op.status === "CONFLICT").length;
  const critical = reports.filter((report) => report.priority === "CRITICAL" && report.status !== "RESOLVED" && report.status !== "REJECTED");
  const unresolved = reports.filter((report) => !["RESOLVED", "REJECTED", "DRAFT"].includes(report.status));
  const averageHours = unresolved.length
    ? Math.round(unresolved.reduce((sum, report) => sum + (Date.now() - Date.parse(report.reportedAt)), 0) / unresolved.length / 3_600_000)
    : 0;
  const oldestPending = outbox
    .filter((op) => op.status === "PENDING")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  const cards = [
    ["Total reports", reports.length],
    ["Pending sync", pending],
    ["Submitted", count("SUBMITTED")],
    ["Assigned", count("ASSIGNED")],
    ["In progress", count("IN_PROGRESS")],
    ["Resolved", count("RESOLVED")],
    ["Rejected", count("REJECTED")],
    ["Critical open", critical.length],
  ] as const;

  return (
    <div className="rise space-y-8">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.16em] text-teal uppercase">Field coordination</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">What needs attention</h1>
        <p className="mt-3 text-muted">ከየትም ሪፖርት አድርጉ. Reports stay on this device until the server confirms them.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-line bg-card px-4 py-4 shadow-sm">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-line bg-card p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Open critical and high issues</h2>
          <ul className="mt-4 divide-y divide-line">
            {reports
              .filter((report) => (report.priority === "CRITICAL" || report.priority === "HIGH") && report.status !== "RESOLVED" && report.status !== "REJECTED")
              .slice(0, 5)
              .map((report) => (
                <li key={report.clientId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/reports/${report.clientId}`} className="font-medium hover:underline">
                      {report.location || "Untitled location"}
                    </Link>
                    <p className="text-sm text-muted">{report.category ? CATEGORY_LABELS[report.category] : "Draft"} · {STATUS_LABELS[report.status]} · {ageLabel(report.reportedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={report.priority} />
                    <SyncBadge state={report.syncState} />
                  </div>
                </li>
              ))}
            {critical.length === 0 && reports.filter((report) => report.priority === "HIGH").length === 0 ? (
              <li className="py-6 text-sm text-muted">No high or critical issues in the current view.</li>
            ) : null}
          </ul>
        </article>
        <article className="rounded-2xl border border-line bg-teal-deep p-5 text-paper">
          <h2 className="text-lg font-semibold">Synchronization health</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt>Connection</dt><dd>{online ? "Backend reachable" : "Working offline"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Failed</dt><dd>{failed}</dd></div>
            <div className="flex justify-between gap-4"><dt>Conflicts</dt><dd>{conflict}</dd></div>
            <div className="flex justify-between gap-4"><dt>Average open age</dt><dd>{unresolved.length ? `${averageHours} h` : "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Oldest pending</dt><dd>{oldestPending ? ageLabel(oldestPending.createdAt) : "None"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Last success</dt><dd>{lastSuccess ? ageLabel(lastSuccess) + " ago" : "Not yet"}</dd></div>
          </dl>
          <Link href="/sync" className="mt-5 inline-flex rounded-xl bg-white px-3 py-2 text-sm font-semibold text-teal-deep">
            Open Sync Center
          </Link>
        </article>
      </section>
    </div>
  );
}
