import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryReportRepository } from "@/lib/server/memory-repository";
import {
  changeStatus,
  createReport,
  ensureDemoSeed,
  getHistory,
  updateReport,
  type RequestContext,
} from "@/lib/server/report-service";
import { syncOperations } from "@/lib/server/sync-service";
import type { ReportDto } from "@/lib/server/repository";

const worker: RequestContext = { role: "FIELD_WORKER", actorName: "Hana Bekele" };
const coordinator: RequestContext = { role: "COORDINATOR", actorName: "Marta Girma" };

function payload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    category: "WATER_POINT",
    description: "The standpipe has no flow and the valve handle is missing.",
    location: "Hawassa industrial zone",
    priority: "HIGH",
    status: "SUBMITTED",
    reportedAt: "2026-09-28T06:40:00.000Z",
    reportedTimezone: "UTC+03:00",
    ...overrides,
  };
}

async function submit(repo: MemoryReportRepository, ctx = worker, overrides: Record<string, unknown> = {}) {
  const body = payload(overrides);
  const created = await createReport(repo, body, ctx);
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("expected create to succeed");
  return created.data;
}

describe("report workflow and integrity", () => {
  it("T-01 accepts a legal status transition and records history", async () => {
    const repo = new MemoryReportRepository();
    const report = await submit(repo);
    const assigned = await changeStatus(
      repo,
      report.id,
      { to: "ASSIGNED", baseVersion: report.version, assigneeName: "Yonas Alemu" },
      coordinator,
    );
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(assigned.data.status).toBe("ASSIGNED");
    expect(assigned.data.assigneeName).toBe("Yonas Alemu");
    const history = await getHistory(repo, report.id, coordinator);
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.data.map((event) => event.action)).toEqual([
      "REPORT_CREATED",
      "REPORT_SUBMITTED",
      "REPORT_SYNCED",
      "STATUS_CHANGED",
      "ASSIGNED",
    ]);
    expect(history.data.every((event, index) => event.sequence === index + 1)).toBe(true);
  });

  it("T-02 rejects an illegal transition without changing the report", async () => {
    const repo = new MemoryReportRepository();
    const report = await submit(repo);
    const denied = await changeStatus(
      repo,
      report.id,
      { to: "RESOLVED", baseVersion: report.version },
      coordinator,
    );
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.status).toBe(422);
    expect(denied.error.code).toBe("INVALID_STATUS_TRANSITION");
    expect(denied.error.details).toMatchObject({ from: "SUBMITTED", to: "RESOLVED" });
    const fresh = await repo.getById(report.id);
    expect(fresh?.status).toBe("SUBMITTED");
    expect(fresh?.version).toBe(report.version);
  });

  it("rejects a draft that tries to jump to resolved", async () => {
    const repo = new MemoryReportRepository();
    const draft: ReportDto = {
      id: randomUUID(),
      clientId: randomUUID(),
      category: "OTHER",
      description: "A draft that must not skip the workflow.",
      location: "Adama",
      priority: "LOW",
      status: "DRAFT",
      reportedAt: "2026-09-01T00:00:00.000Z",
      reportedTimezone: null,
      serverReceivedAt: "2026-09-01T00:00:00.000Z",
      version: 1,
      reporterName: "Hana Bekele",
      assigneeName: null,
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    await repo.insertRaw(draft);
    const denied = await changeStatus(repo, draft.id, { to: "RESOLVED", baseVersion: 1 }, coordinator);
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.error.message).toBe("Cannot move a DRAFT report directly to RESOLVED.");
  });

  it("T-03 rejects an invalid payload", async () => {
    const repo = new MemoryReportRepository();
    const result = await createReport(
      repo,
      payload({ description: "short", category: "NOT_A_CATEGORY", location: "" }),
      worker,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(repo.reports.size).toBe(0);
  });

  it("T-04 and T-09 return the same report when create is retried", async () => {
    const repo = new MemoryReportRepository();
    const body = payload();
    const operationId = randomUUID();
    const first = await syncOperations(
      repo,
      { operations: [{ clientOperationId: operationId, type: "CREATE_REPORT", reportClientId: body.clientId, payload: body }] },
      worker,
    );
    const second = await syncOperations(
      repo,
      { operations: [{ clientOperationId: operationId, type: "CREATE_REPORT", reportClientId: body.clientId, payload: body }] },
      worker,
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const firstRow = first.data.results[0];
    const secondRow = second.data.results[0];
    expect(firstRow?.ok && secondRow?.ok).toBe(true);
    if (!firstRow?.ok || !secondRow?.ok) return;
    expect(secondRow.meta?.idempotent).toBe(true);
    const firstId = (firstRow.data as { id: string }).id;
    const secondId = (secondRow.data as { id: string }).id;
    expect(secondId).toBe(firstId);
    expect(repo.reports.size).toBe(1);
  });

  it("T-05 status changes stay in chronological order across the whole lifecycle", async () => {
    const repo = new MemoryReportRepository();
    const report = await submit(repo);
    const assigned = await changeStatus(
      repo,
      report.id,
      { to: "ASSIGNED", baseVersion: 1, assigneeName: "Marta Girma" },
      coordinator,
    );
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    const started = await changeStatus(
      repo,
      report.id,
      { to: "IN_PROGRESS", baseVersion: assigned.data.version },
      coordinator,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const resolved = await changeStatus(
      repo,
      report.id,
      { to: "RESOLVED", baseVersion: started.data.version, reason: "Flow restored." },
      coordinator,
    );
    expect(resolved.ok).toBe(true);
    const history = await getHistory(repo, report.id, coordinator);
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    const sequences = history.data.map((event) => event.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(history.data.at(-1)?.action).toBe("STATUS_CHANGED");
    expect(history.data.at(-1)?.toValue).toBe("RESOLVED");
  });

  it("T-10 surfaces a stale version and does not overwrite the server", async () => {
    const repo = new MemoryReportRepository();
    const report = await submit(repo);
    const first = await updateReport(
      repo,
      report.id,
      { baseVersion: report.version, priority: "CRITICAL" },
      coordinator,
    );
    expect(first.ok).toBe(true);
    const stale = await updateReport(
      repo,
      report.id,
      { baseVersion: report.version, priority: "LOW" },
      coordinator,
    );
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.status).toBe(409);
    expect(stale.error.code).toBe("VERSION_CONFLICT");
    const fresh = await repo.getById(report.id);
    expect(fresh?.priority).toBe("CRITICAL");
  });

  it("keeps earlier sync acknowledgements when a later operation fails", async () => {
    const repo = new MemoryReportRepository();
    const firstBody = payload();
    const secondBody = payload({ description: "no" });
    const synced = await syncOperations(
      repo,
      {
        operations: [
          {
            clientOperationId: randomUUID(),
            type: "CREATE_REPORT",
            reportClientId: firstBody.clientId,
            payload: firstBody,
          },
          {
            clientOperationId: randomUUID(),
            type: "CREATE_REPORT",
            reportClientId: secondBody.clientId,
            payload: secondBody,
          },
        ],
      },
      worker,
    );
    expect(synced.ok).toBe(true);
    if (!synced.ok) return;
    expect(synced.data.results[0]?.ok).toBe(true);
    expect(synced.data.results[1]?.ok).toBe(false);
    expect(repo.reports.size).toBe(1);
  });

  it("lets a field worker resubmit a rejection and blocks them from assigning", async () => {
    const repo = new MemoryReportRepository();
    const report = await submit(repo);
    const rejected = await changeStatus(
      repo,
      report.id,
      { to: "REJECTED", baseVersion: 1, reason: "Need a clearer location." },
      coordinator,
    );
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    const blocked = await changeStatus(
      repo,
      report.id,
      { to: "ASSIGNED", baseVersion: rejected.data.version, assigneeName: "Hana Bekele" },
      worker,
    );
    expect(blocked.ok).toBe(false);
    const resubmitted = await changeStatus(
      repo,
      report.id,
      { to: "SUBMITTED", baseVersion: rejected.data.version },
      worker,
    );
    expect(resubmitted.ok).toBe(true);
    if (!resubmitted.ok) return;
    expect(resubmitted.data.status).toBe("SUBMITTED");
  });

  it("loads demonstration reports when the database is empty", async () => {
    const repo = new MemoryReportRepository();
    await ensureDemoSeed(repo);
    const first = await repo.list({ page: 1, pageSize: 20, sort: "reportedAt", direction: "desc" });
    expect(first.total).toBe(7);
    await ensureDemoSeed(repo);
    const second = await repo.list({ page: 1, pageSize: 20, sort: "reportedAt", direction: "desc" });
    expect(second.total).toBe(7);
  });
});
