import { createReportSchema, draftSchema } from "@/lib/domain/validation";
import type { Category, Priority, Role, Status } from "@/lib/domain/constants";
import type { ReportDto } from "@/lib/server/repository";
import {
  getDb,
  type ActivityEntry,
  type LocalAttachment,
  type LocalHistoryEvent,
  type LocalOperation,
  type LocalReport,
} from "@/lib/offline/db";
import type { PersistUpdate } from "@/lib/offline/sync-engine";
import { deriveSyncState } from "@/lib/offline/sync-engine";

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

function isQuota(error: unknown): boolean {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  return name.includes("Quota") || name === "AbortError";
}

async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isQuota(error)) {
      throw new StorageError("This device is out of space, so the report was not saved.");
    }
    throw new StorageError("The report could not be saved on this device. Your typing is still in the form.");
  }
}

function event(action: string, message: string, role: Role, actor: string): LocalHistoryEvent {
  return {
    id: crypto.randomUUID(),
    action,
    message,
    at: new Date().toISOString(),
    actorRole: role,
    actorName: actor,
    deviceOnly: true,
  };
}

export async function recoverInterrupted(): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.outbox, db.reports, async () => {
    const stuck = await db.outbox.where("status").equals("SYNCING").toArray();
    for (const op of stuck) {
      await db.outbox.update(op.clientOperationId, { status: "PENDING", updatedAt: new Date().toISOString() });
    }
    const ops = await db.outbox.toArray();
    const reports = await db.reports.toArray();
    for (const report of reports) {
      if (report.status === "DRAFT") continue;
      await db.reports.update(report.clientId, { syncState: deriveSyncState(ops, report.clientId) });
    }
  });
}

export async function saveDraft(input: {
  clientId: string;
  category?: Category;
  description: string;
  location: string;
  priority?: Priority;
  reportedAt: string;
  reportedTimezone: string;
  reporterName?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  role: Role;
  actor: string;
}): Promise<LocalReport> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    throw new StorageError(parsed.error.issues[0]?.message ?? "Check the highlighted fields.");
  }
  return guard(() =>
    getDb().transaction("rw", getDb().reports, async () => {
      const db = getDb();
      const existing = await db.reports.get(input.clientId);
      if (existing && existing.status !== "DRAFT") {
        throw new StorageError("This report was already submitted. Open it to see its sync state.");
      }
      const now = new Date().toISOString();
      const report: LocalReport = {
        clientId: input.clientId,
        category: input.category,
        description: input.description,
        location: input.location,
        priority: input.priority,
        status: "DRAFT",
        reportedAt: input.reportedAt,
        reportedTimezone: input.reportedTimezone,
        version: 0,
        reporterName: input.reporterName || input.actor,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyMeters: input.accuracyMeters ?? null,
        syncState: "LOCAL",
        localHistory: existing
          ? existing.localHistory
          : [event("REPORT_CREATED", "Draft saved on this device.", input.role, input.actor)],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.reports.put(report);
      return report;
    }),
  );
}

export async function submitLocalReport(input: {
  clientId: string;
  category: Category;
  description: string;
  location: string;
  priority: Priority;
  reportedAt: string;
  reportedTimezone: string;
  reporterName?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  role: Role;
  actor: string;
}): Promise<LocalReport> {
  const candidate = {
    ...input,
    status: "SUBMITTED" as const,
    reporterName: input.reporterName || input.actor,
  };
  const parsed = createReportSchema.safeParse(candidate);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.message).join(" ");
    throw new StorageError(fields || "Check the highlighted fields.");
  }
  return guard(async () => {
    const db = getDb();
    return db.transaction("rw", db.reports, db.outbox, db.attachments, async () => {
      const existing = await db.reports.get(input.clientId);
      const now = new Date().toISOString();
      const operationId = crypto.randomUUID();
      const report: LocalReport = {
        clientId: input.clientId,
        serverId: existing?.serverId ?? null,
        category: input.category,
        description: input.description,
        location: input.location,
        priority: input.priority,
        status: "SUBMITTED",
        reportedAt: input.reportedAt,
        reportedTimezone: input.reportedTimezone,
        version: existing?.version ?? 0,
        reporterName: input.reporterName || input.actor,
        assigneeName: existing?.assigneeName ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyMeters: input.accuracyMeters ?? null,
        syncState: "PENDING",
        serverSnapshot: null,
        syncError: null,
        localHistory: [
          ...(existing?.localHistory ?? []),
          event("REPORT_SUBMITTED", "Saved safely on this device. Waiting to sync.", input.role, input.actor),
        ],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const operation: LocalOperation = {
        clientOperationId: operationId,
        reportClientId: input.clientId,
        type: existing?.serverId ? "UPDATE_REPORT" : "CREATE_REPORT",
        payload: candidate,
        baseVersion: existing?.serverId ? existing.version : undefined,
        status: "PENDING",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.reports.put(report);
      await db.outbox.put(operation);
      const attachments = await db.attachments.where("reportClientId").equals(input.clientId).toArray();
      for (const attachment of attachments.filter((item) => item.status !== "SYNCHRONIZED")) {
        await db.outbox.put({
          clientOperationId: crypto.randomUUID(),
          reportClientId: input.clientId,
          type: "UPLOAD_ATTACHMENT",
          payload: { clientAttachmentId: attachment.clientAttachmentId },
          status: "PENDING",
          attempts: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      return report;
    });
  });
}

export async function queueStatusChange(input: {
  report: LocalReport;
  to: Status;
  assigneeName?: string;
  reason?: string;
  role: Role;
  actor: string;
}): Promise<void> {
  const db = getDb();
  await guard(() =>
    db.transaction("rw", db.reports, db.outbox, async () => {
      const now = new Date().toISOString();
      await db.outbox.put({
        clientOperationId: crypto.randomUUID(),
        reportClientId: input.report.clientId,
        type: "CHANGE_STATUS",
        baseVersion: input.report.version,
        payload: { to: input.to, assigneeName: input.assigneeName, reason: input.reason, baseVersion: input.report.version },
        status: "PENDING",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
      await db.reports.update(input.report.clientId, {
        syncState: "PENDING",
        updatedAt: now,
        localHistory: [
          ...input.report.localHistory,
          event("STATUS_CHANGED", `Queued status change to ${input.to}.`, input.role, input.actor),
        ],
      });
    }),
  );
}

export async function queueConflictResolution(input: {
  report: LocalReport;
  strategy: "KEEP_SERVER" | "APPLY_LOCAL";
  patch?: Record<string, unknown>;
  role: Role;
  actor: string;
}): Promise<void> {
  const db = getDb();
  await guard(() =>
    db.transaction("rw", db.reports, db.outbox, async () => {
      const now = new Date().toISOString();
      const stale = await db.outbox
        .where("reportClientId")
        .equals(input.report.clientId)
        .filter((op) => op.status === "CONFLICT")
        .toArray();
      for (const op of stale) {
        await db.outbox.update(op.clientOperationId, { status: "SYNCHRONIZED", updatedAt: now });
      }
      await db.outbox.put({
        clientOperationId: crypto.randomUUID(),
        reportClientId: input.report.clientId,
        type: "RESOLVE_CONFLICT",
        baseVersion: input.report.version,
        payload: { strategy: input.strategy, patch: input.patch },
        status: "PENDING",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
      await db.reports.update(input.report.clientId, {
        syncState: "PENDING",
        syncError: null,
        updatedAt: now,
      });
    }),
  );
}

export async function saveAttachment(attachment: LocalAttachment): Promise<void> {
  await guard(() => getDb().attachments.put(attachment));
}

export async function persistSyncUpdate(update: PersistUpdate): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.outbox, db.reports, async () => {
    await db.outbox.update(update.operationId, update.operation);
    if (update.report) {
      const current = await db.reports.get(update.report.clientId);
      if (!current) return;
      const history = [...current.localHistory];
      if (update.operation.status === "FAILED") {
        history.push({
          id: crypto.randomUUID(),
          action: "SYNC_FAILED",
          message: update.report.syncError ?? "Sync failed.",
          at: new Date().toISOString(),
          actorRole: "FIELD_WORKER",
          actorName: current.reporterName ?? "This device",
          deviceOnly: true,
        });
      }
      await db.reports.update(update.report.clientId, { ...update.report, localHistory: history });
    }
  });
}

export async function rememberActivity(message: string, level: ActivityEntry["level"]): Promise<void> {
  await getDb().activity.put({ id: crypto.randomUUID(), at: new Date().toISOString(), level, message });
}

export async function readMeta(key: string): Promise<string | null> {
  return (await getDb().meta.get(key))?.value ?? null;
}

export async function writeMeta(key: string, value: string): Promise<void> {
  await getDb().meta.put({ key, value });
}

export async function clearLocalWork(): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.reports, db.outbox, db.attachments, db.activity, async () => {
    await db.reports.clear();
    await db.outbox.clear();
    await db.attachments.clear();
    await db.activity.clear();
  });
}

export function fromServer(report: ReportDto): LocalReport {
  return {
    clientId: report.clientId,
    serverId: report.id,
    category: report.category,
    description: report.description,
    location: report.location,
    priority: report.priority,
    status: report.status,
    reportedAt: report.reportedAt,
    reportedTimezone: report.reportedTimezone,
    serverReceivedAt: report.serverReceivedAt,
    version: report.version,
    reporterName: report.reporterName,
    assigneeName: report.assigneeName,
    latitude: report.latitude,
    longitude: report.longitude,
    accuracyMeters: report.accuracyMeters,
    syncState: "SYNCHRONIZED",
    localHistory: [],
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}
