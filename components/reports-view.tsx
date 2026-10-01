"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, PRIORITIES, STATUSES, STATUS_LABELS, SYNC_STATES } from "@/lib/domain/constants";
import { issueCode, formatWhen } from "@/lib/client/format";
import { useYetim } from "@/components/provider";
import { PriorityBadge, SyncBadge } from "@/components/sync-badge";

export function ReportsView() {
  const { reports } = useYetim();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [sync, setSync] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return reports.filter((report) => {
      if (status && report.status !== status) return false;
      if (priority && report.priority !== priority) return false;
      if (category && report.category !== category) return false;
      if (sync && report.syncState !== sync) return false;
      if (from && Date.parse(report.reportedAt) < Date.parse(from)) return false;
      if (to && Date.parse(report.reportedAt) > Date.parse(`${to}T23:59:59`)) return false;
      if (q.trim()) {
        const haystack = `${issueCode(report.clientId)} ${report.clientId} ${report.serverId ?? ""} ${report.description} ${report.location}`.toLowerCase();
        if (!haystack.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [category, from, priority, q, reports, status, sync, to]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-muted">{filtered.length} shown from this device and the server.</p>
        </div>
        <Link href="/reports/new" className="rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white">
          New report
        </Link>
      </div>
      <form className="grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-4" aria-label="Filter reports">
        <label className="text-sm md:col-span-2">
          Search
          <input className="mt-1 w-full rounded-lg border border-line px-3 py-2" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Issue ID, client ID, description, location" />
        </label>
        <Select label="Status" value={status} onChange={setStatus} options={STATUSES.map((item) => [item, STATUS_LABELS[item]])} />
        <Select label="Priority" value={priority} onChange={setPriority} options={PRIORITIES.map((item) => [item, item[0] + item.slice(1).toLowerCase()])} />
        <Select label="Category" value={category} onChange={setCategory} options={CATEGORIES.map((item) => [item, CATEGORY_LABELS[item]])} />
        <Select label="Sync" value={sync} onChange={setSync} options={SYNC_STATES.map((item) => [item, item[0] + item.slice(1).toLowerCase()])} />
        <label className="text-sm">From<input type="date" className="mt-1 w-full rounded-lg border border-line px-3 py-2" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm">To<input type="date" className="mt-1 w-full rounded-lg border border-line px-3 py-2" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </form>
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center">
          <p className="text-lg font-semibold">No reports in this view</p>
          <p className="mt-2 text-sm text-muted">Create one from the field, or widen the filters. Nothing here was invented.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {filtered.map((report) => (
              <li key={report.clientId}>
                <ReportCard report={report} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl border border-line bg-card md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Issue</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Sync</th>
                  <th className="px-4 py-3 font-medium">Reported</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((report) => (
                  <tr key={report.clientId} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-3">
                      <Link className="font-semibold hover:underline" href={`/reports/${report.clientId}`}>{issueCode(report.clientId)}</Link>
                      <p className="text-xs text-muted">{report.category ? CATEGORY_LABELS[report.category] : "Draft"}</p>
                    </td>
                    <td className="px-4 py-3">{report.location || "—"}</td>
                    <td className="px-4 py-3">{STATUS_LABELS[report.status]}</td>
                    <td className="px-4 py-3"><PriorityBadge priority={report.priority} /></td>
                    <td className="px-4 py-3"><SyncBadge state={report.syncState} /></td>
                    <td className="px-4 py-3">{formatWhen(report.reportedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: ReturnType<typeof useYetim>["reports"][number] }) {
  return (
    <Link href={`/reports/${report.clientId}`} className="block rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{issueCode(report.clientId)}</p>
        <SyncBadge state={report.syncState} />
      </div>
      <p className="mt-2 text-sm">{report.location || "Location not set"}</p>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{report.description || "No description yet"}</p>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span>{STATUS_LABELS[report.status]}</span>
        <PriorityBadge priority={report.priority} />
      </div>
    </Link>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="text-sm">
      {label}
      <select className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Any</option>
        {options.map(([option, text]) => (
          <option key={option} value={option}>{text}</option>
        ))}
      </select>
    </label>
  );
}
