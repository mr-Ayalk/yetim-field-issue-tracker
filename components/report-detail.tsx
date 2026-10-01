"use client";

import { useEffect, useState } from "react";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/domain/constants";
import { roleCanTransition } from "@/lib/domain/workflow";
import { apiFetch } from "@/lib/client/api";
import { formatWhen, issueCode } from "@/lib/client/format";
import { useYetim } from "@/components/provider";
import { PriorityBadge, SyncBadge } from "@/components/sync-badge";
import type { HistoryDto } from "@/lib/server/repository";

export function ReportDetail({ clientId }: { clientId: string }) {
  const yetim = useYetim();
  const report = yetim.reports.find((item) => item.clientId === clientId);
  const [serverHistory, setServerHistory] = useState<HistoryDto[]>([]);
  const [assignee, setAssignee] = useState("");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [invalidMessage, setInvalidMessage] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!report?.serverId || !yetim.online) return;
    void apiFetch(`/api/reports/${report.serverId}/history`, { role: yetim.role, actor: yetim.actor }).then((response) => {
      const events = (response.body as { data?: HistoryDto[] } | null)?.data;
      if (Array.isArray(events)) setServerHistory(events);
    });
  }, [report?.serverId, report?.version, yetim.actor, yetim.online, yetim.role]);

  if (!report) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card px-6 py-12">
        <h1 className="text-2xl font-semibold">Report not on this device</h1>
        <p className="mt-2 text-sm text-muted">It may still be syncing from the server, or the link is for a report that was cleared locally.</p>
      </div>
    );
  }

  const transitions = (["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"] as const).filter((to) =>
    roleCanTransition(yetim.role, report.status, to),
  );
  const timeline = [
    ...report.localHistory.map((event) => ({ at: event.at, action: event.action, message: event.message, where: "On this device" })),
    ...serverHistory.map((event) => ({ at: event.createdAt, action: event.action, message: event.message, where: event.actorName ?? event.actorRole })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-teal uppercase">{issueCode(report.clientId)}</p>
          <h1 className="mt-1 text-3xl font-semibold">{report.location || "Draft report"}</h1>
          <p className="mt-2 text-sm text-muted">{report.category ? CATEGORY_LABELS[report.category] : "Category not set"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PriorityBadge priority={report.priority} />
          <SyncBadge state={report.syncState} />
          <span className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold ring-1 ring-line">{STATUS_LABELS[report.status]}</span>
        </div>
      </header>
      {report.syncError ? <p role="alert" className="rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">{report.syncError}</p> : null}
      {actionError ? <p role="alert" className="rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">{actionError}</p> : null}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="text-lg font-semibold">Issue</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{report.description || "No description yet."}</p>
          </section>
          {report.syncState === "CONFLICT" && report.serverSnapshot ? (
            <section data-testid="conflict-dialog" className="rounded-2xl border border-clay/40 bg-card p-5">
              <h2 className="text-lg font-semibold">This report changed in two places</h2>
              <p className="mt-2 text-sm text-muted">Yetim did not choose a winner. Compare the versions, then decide.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <VersionCard title="On this device" body={report.description} meta={`Priority ${report.priority ?? "unset"} · version ${report.version}`} />
                <VersionCard title="On the server" body={report.serverSnapshot.description} meta={`Priority ${report.serverSnapshot.priority} · version ${report.serverSnapshot.version} · ${report.serverSnapshot.updatedAt}`} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => void yetim.resolveConflict(report, "KEEP_SERVER")}>Keep server version</button>
                <button type="button" className="rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white" onClick={() => void yetim.resolveConflict(report, "APPLY_LOCAL", { description: report.description, location: report.location, priority: report.priority, category: report.category })}>Apply local version</button>
                <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => setManual(report.description)}>Review manually</button>
              </div>
              {manual ? (
                <form className="mt-4 space-y-2" onSubmit={(event) => { event.preventDefault(); void yetim.resolveConflict(report, "APPLY_LOCAL", { description: manual, location: report.location, priority: report.priority, category: report.category }); }}>
                  <label className="text-sm font-semibold" htmlFor="manual-resolution">Corrected description</label>
                  <textarea id="manual-resolution" className="min-h-24 w-full rounded-xl border border-line px-3 py-2" value={manual} onChange={(event) => setManual(event.target.value)} />
                  <button type="submit" className="rounded-xl bg-ink px-3 py-2 text-sm text-white">Apply this revision</button>
                </form>
              ) : null}
            </section>
          ) : null}
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="text-lg font-semibold">History</h2>
            <ol className="mt-4 space-y-4">
              {timeline.length === 0 ? <li className="text-sm text-muted">No events yet.</li> : null}
              {timeline.map((event, index) => (
                <li key={`${event.at}-${event.action}-${index}`} className="border-l-2 border-teal/40 pl-4">
                  <p className="text-sm font-semibold">{event.action.replaceAll("_", " ")}</p>
                  <p className="text-sm">{event.message}</p>
                  <p className="text-xs text-muted">{formatWhen(event.at)} · {event.where}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-card p-5 text-sm">
            <h2 className="text-lg font-semibold">Case file</h2>
            <dl className="mt-3 space-y-2">
              <Row label="Client ID" value={report.clientId} />
              <Row label="Server ID" value={report.serverId ?? "Waiting for acknowledgement"} />
              <Row label="Reported" value={formatWhen(report.reportedAt)} />
              <Row label="Server received" value={formatWhen(report.serverReceivedAt)} />
              <Row label="Timezone" value={report.reportedTimezone ?? "Not recorded"} />
              <Row label="Reporter" value={report.reporterName ?? "Not recorded"} />
              <Row label="Assigned to" value={report.assigneeName ?? "Unassigned"} />
              <Row label="Version" value={String(report.version)} />
              <Row label="Coordinates" value={report.latitude != null && report.longitude != null ? `${report.latitude}, ${report.longitude}` : "Not captured"} />
            </dl>
            {report.latitude != null && report.longitude != null ? (
              yetim.online && !yetim.simulatedOffline ? (
                <iframe title="Map preview of the reported coordinates" className="mt-4 h-40 w-full rounded-xl border border-line" src={`https://www.openstreetmap.org/export/embed.html?bbox=${report.longitude - 0.02}%2C${report.latitude - 0.02}%2C${report.longitude + 0.02}%2C${report.latitude + 0.02}&layer=mapnik&marker=${report.latitude}%2C${report.longitude}`} />
              ) : (
                <p className="mt-3 text-xs text-muted">Coordinates are saved. The map preview waits until you are online.</p>
              )
            ) : null}
          </section>
          {transitions.length > 0 ? (
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="text-lg font-semibold">Workflow</h2>
              {transitions.includes("ASSIGNED") ? (
                <label className="mt-3 block text-sm">Assign to
                  <input className="mt-1 w-full rounded-lg border border-line px-3 py-2" value={assignee} onChange={(event) => setAssignee(event.target.value)} />
                </label>
              ) : null}
              {transitions.includes("REJECTED") ? (
                <label className="mt-3 block text-sm">Reason
                  <input className="mt-1 w-full rounded-lg border border-line px-3 py-2" value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
              ) : null}
              <div className="mt-3 flex flex-col gap-2">
                {transitions.map((to) => (
                  <button
                    key={to}
                    type="button"
                    className="rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      setActionError("");
                      void yetim.queueStatus(report, to, { assigneeName: assignee, reason }).catch((error: unknown) => {
                        setActionError(error instanceof Error ? error.message : "That change was not queued.");
                      });
                    }}
                  >
                    Move to {STATUS_LABELS[to]}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {yetim.role !== "FIELD_WORKER" && report.serverId ? (
            <section className="rounded-2xl border border-dashed border-line p-5">
              <h2 className="text-sm font-semibold">Reviewer checks</h2>
              <button
                type="button"
                data-testid="invalid-transition"
                className="mt-3 rounded-xl border border-line px-3 py-2 text-sm"
                onClick={() => {
                  void yetim.attemptInvalid(report).then(setInvalidMessage);
                }}
              >
                Attempt invalid resolve
              </button>
              {invalidMessage ? <p role="alert" className="mt-2 text-sm text-clay">{invalidMessage}</p> : null}
            </section>
          ) : null}
        </aside>
      </section>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[60%] text-right break-all">{value}</dd>
    </div>
  );
}

function VersionCard({ title, body, meta }: { title: string; body: string; meta: string }) {
  return (
    <div className="rounded-xl bg-paper p-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm">{body}</p>
      <p className="mt-2 text-xs text-muted">{meta}</p>
    </div>
  );
}
