"use client";

import { CATEGORY_LABELS, type Category } from "@/lib/domain/constants";
import { useYetim } from "@/components/provider";

export function AnalyticsView() {
  const { reports } = useYetim();
  const byCategory = countBy(reports.map((report) => report.category).filter(Boolean) as Category[]);
  const byStatus = countBy(reports.map((report) => report.status));
  const unresolved = reports.filter((report) => !["RESOLVED", "REJECTED", "DRAFT"].includes(report.status));
  const buckets = [
    ["Under a day", unresolved.filter((report) => ageHours(report.reportedAt) < 24).length],
    ["1–3 days", unresolved.filter((report) => ageHours(report.reportedAt) >= 24 && ageHours(report.reportedAt) < 72).length],
    ["3–7 days", unresolved.filter((report) => ageHours(report.reportedAt) >= 72 && ageHours(report.reportedAt) < 168).length],
    ["Over a week", unresolved.filter((report) => ageHours(report.reportedAt) >= 168).length],
  ] as const;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Analytics</h1>
        <p className="mt-2 text-sm text-muted">Counts come from the reports currently visible on this device. Empty means there is no data, not a hidden number.</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart title="By category" rows={Object.entries(byCategory).map(([key, value]) => [CATEGORY_LABELS[key as Category] ?? key, value])} />
        <Chart title="By status" rows={Object.entries(byStatus)} />
        <Chart title="Age of unresolved issues" rows={buckets.map(([label, value]) => [label, value])} />
      </div>
    </div>
  );
}

function Chart({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="mt-4 text-sm text-muted">No records yet.</p> : null}
      <ul className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <li key={label}>
            <div className="flex justify-between text-sm">
              <span>{label}</span>
              <span className="tabular-nums">{value}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-paper">
              <div className="h-2 rounded-full bg-teal" style={{ width: `${(value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((map, value) => {
    map[value] = (map[value] ?? 0) + 1;
    return map;
  }, {});
}

function ageHours(iso: string): number {
  return (Date.now() - Date.parse(iso)) / 3_600_000;
}
