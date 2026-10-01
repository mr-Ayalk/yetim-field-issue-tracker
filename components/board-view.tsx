"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STATUS_LABELS, type Status } from "@/lib/domain/constants";
import { issueCode } from "@/lib/client/format";
import { seesAllReports } from "@/lib/domain/workflow";
import { useYetim } from "@/components/provider";
import { PriorityBadge, SyncBadge } from "@/components/sync-badge";

const COLUMNS: Status[] = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"];

export function BoardView() {
  const yetim = useYetim();
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("");
  const visible = useMemo(() => {
    return yetim.reports.filter((report) => {
      if (!seesAllReports(yetim.role) && report.reporterName !== yetim.actor) return false;
      if (priority && report.priority !== priority) return false;
      if (q.trim()) {
        const haystack = `${report.description} ${report.location} ${issueCode(report.clientId)}`.toLowerCase();
        if (!haystack.includes(q.trim().toLowerCase())) return false;
      }
      return COLUMNS.includes(report.status);
    });
  }, [priority, q, yetim.actor, yetim.reports, yetim.role]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold">Workbench</h1>
        <p className="mt-2 text-sm text-muted">Submitted work, who has it, and what is blocked. Drafts stay off this board.</p>
      </header>
      <div className="flex flex-wrap gap-3">
        <input className="min-w-64 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm" placeholder="Search location or description" value={q} onChange={(event) => setQ(event.target.value)} />
        <select className="rounded-xl border border-line bg-card px-3 py-2 text-sm" value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Priority filter">
          <option value="">All priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((status) => {
          const items = visible.filter((report) => report.status === status);
          return (
            <section key={status} className="w-72 shrink-0 rounded-2xl bg-white/60 p-3">
              <h2 className="flex items-center justify-between text-sm font-semibold">
                {STATUS_LABELS[status]}
                <span className="rounded-full bg-card px-2 py-0.5 text-xs">{items.length}</span>
              </h2>
              <ul className="mt-3 space-y-3">
                {items.map((report) => (
                  <li key={report.clientId} className="rounded-xl border border-line bg-card p-3">
                    <Link href={`/reports/${report.clientId}`} className="font-medium hover:underline">{report.location}</Link>
                    <p className="mt-1 line-clamp-3 text-xs text-muted">{report.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={report.priority} />
                      <SyncBadge state={report.syncState} />
                    </div>
                    {report.assigneeName ? <p className="mt-2 text-xs">Assigned to {report.assigneeName}</p> : null}
                  </li>
                ))}
                {items.length === 0 ? <li className="text-xs text-muted">Nothing in this column.</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
