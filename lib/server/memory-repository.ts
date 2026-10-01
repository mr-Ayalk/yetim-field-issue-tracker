import { randomUUID } from "node:crypto";
import type { Priority } from "@/lib/domain/constants";
import type {
  AttachmentDto,
  AttachmentInput,
  CreateReportData,
  HistoryDto,
  HistoryWrite,
  ListParams,
  MutationOutcome,
  ReportDto,
  ReportPatch,
  ReportRepository,
  SeedReport,
  SyncSessionDto,
} from "@/lib/server/repository";

type StoredAttachment = AttachmentDto & { content: Uint8Array };
type Processed = { report: ReportDto };

const PRIORITY_RANK: Record<Priority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function matchesQuery(report: ReportDto, params: ListParams): boolean {
  if (params.status && report.status !== params.status) return false;
  if (params.priority && report.priority !== params.priority) return false;
  if (params.category && report.category !== params.category) return false;
  if (params.reporterName && report.reporterName !== params.reporterName) return false;
  if (params.from && new Date(report.reportedAt) < params.from) return false;
  if (params.to && new Date(report.reportedAt) > params.to) return false;
  if (params.q) {
    const haystack = [report.id, report.clientId, report.description, report.location]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(params.q.toLowerCase())) return false;
  }
  return true;
}

function sortReports(items: ReportDto[], params: ListParams): ReportDto[] {
  const direction = params.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (params.sort === "priority") {
      return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * direction;
    }
    const left = params.sort === "updatedAt" ? a.updatedAt : a.reportedAt;
    const right = params.sort === "updatedAt" ? b.updatedAt : b.reportedAt;
    return left.localeCompare(right) * direction;
  });
}

export class MemoryReportRepository implements ReportRepository {
  reports = new Map<string, ReportDto>();
  history: HistoryDto[] = [];
  attachments = new Map<string, StoredAttachment>();
  processed = new Map<string, Processed>();
  sessions: SyncSessionDto[] = [];
  private chains = new Map<string, Promise<unknown>>();

  async readiness(): Promise<boolean> {
    return true;
  }

  async list(params: ListParams): Promise<{ items: ReportDto[]; total: number }> {
    const filtered = sortReports(
      [...this.reports.values()].filter((report) => matchesQuery(report, params)),
      params,
    );
    const start = (params.page - 1) * params.pageSize;
    return { total: filtered.length, items: filtered.slice(start, start + params.pageSize) };
  }

  async getById(id: string): Promise<ReportDto | null> {
    return this.reports.get(id) ?? null;
  }

  async getByClientId(clientId: string): Promise<ReportDto | null> {
    return [...this.reports.values()].find((report) => report.clientId === clientId) ?? null;
  }

  async getByAnyId(id: string): Promise<ReportDto | null> {
    return (await this.getById(id)) ?? (await this.getByClientId(id));
  }

  private async exclusive<T>(operationId: string | undefined, work: () => Promise<T>): Promise<T> {
    if (!operationId) return work();
    const previous = this.chains.get(operationId) ?? Promise.resolve();
    const run = previous.then(work, work);
    this.chains.set(operationId, run.then(() => undefined, () => undefined));
    return run;
  }

  async createSubmitted(
    input: CreateReportData,
    operationId?: string,
  ): Promise<{ report: ReportDto; idempotent: boolean }> {
    return this.exclusive(operationId, async () => {
      if (operationId) {
        const replay = this.processed.get(operationId);
        if (replay) return { report: replay.report, idempotent: true };
      }
      const existing = await this.getByClientId(input.clientId);
      if (existing) return { report: existing, idempotent: true };
      const now = new Date().toISOString();
      const report: ReportDto = {
        id: randomUUID(),
        clientId: input.clientId,
        category: input.category,
        description: input.description,
        location: input.location,
        priority: input.priority,
        status: "SUBMITTED",
        reportedAt: input.reportedAt,
        reportedTimezone: input.reportedTimezone ?? null,
        serverReceivedAt: now,
        version: 1,
        reporterName: input.reporterName,
        assigneeName: null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyMeters: input.accuracyMeters ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.reports.set(report.id, report);
      this.pushHistory(report.id, input.history, now);
      if (operationId) this.processed.set(operationId, { report });
      return { report, idempotent: false };
    });
  }

  async applyMutation(input: {
    id: string;
    expectedVersion: number;
    patch: ReportPatch;
    history: HistoryWrite[];
    operationId?: string;
    force?: boolean;
  }): Promise<MutationOutcome> {
    return this.exclusive(input.operationId, async () => {
      if (input.operationId) {
        const replay = this.processed.get(input.operationId);
        if (replay) return { kind: "replay", report: replay.report };
      }
      const current = await this.getByAnyId(input.id);
      if (!current) return { kind: "not_found" };
      if (!input.force && current.version !== input.expectedVersion) {
        return { kind: "conflict", report: current };
      }
      const now = new Date().toISOString();
      const report: ReportDto = {
        ...current,
        ...stripUndefined(input.patch),
        version: current.version + 1,
        updatedAt: now,
      };
      this.reports.set(report.id, report);
      this.pushHistory(report.id, input.history, now);
      if (input.operationId) this.processed.set(input.operationId, { report });
      return { kind: "ok", report };
    });
  }

  async listHistory(reportId: string): Promise<HistoryDto[]> {
    return this.history
      .filter((event) => event.reportId === reportId)
      .sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
  }

  async hasHistoryMessage(reportId: string, action: string, snippet: string): Promise<boolean> {
    return this.history.some(
      (event) =>
        event.reportId === reportId && event.action === action && event.message.includes(snippet),
    );
  }

  async appendHistory(reportId: string, history: HistoryWrite[]): Promise<void> {
    this.pushHistory(reportId, history, new Date().toISOString());
  }

  async addAttachment(
    input: AttachmentInput,
    operationId?: string,
  ): Promise<
    | { kind: "ok"; attachment: AttachmentDto; idempotent: boolean }
    | { kind: "not_found" }
    | { kind: "duplicate" }
  > {
    return this.exclusive(operationId, async () => {
      const report = this.reports.get(input.reportId);
      if (!report) return { kind: "not_found" };
      const byClient = [...this.attachments.values()].find(
        (item) => item.clientAttachmentId === input.clientAttachmentId,
      );
      if (byClient) {
        return { kind: "ok", attachment: toAttachmentDto(byClient), idempotent: true };
      }
      const duplicate = [...this.attachments.values()].find(
        (item) => item.reportId === input.reportId && item.checksum === input.checksum,
      );
      if (duplicate) {
        return { kind: "ok", attachment: toAttachmentDto(duplicate), idempotent: true };
      }
      const now = new Date().toISOString();
      const attachment: StoredAttachment = {
        id: randomUUID(),
        reportId: input.reportId,
        clientAttachmentId: input.clientAttachmentId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.content.byteLength,
        checksum: input.checksum,
        createdAt: now,
        content: input.content,
      };
      this.attachments.set(attachment.id, attachment);
      this.pushHistory(report.id, input.history, now);
      report.version += 1;
      report.updatedAt = now;
      if (operationId) this.processed.set(operationId, { report: { ...report } });
      return { kind: "ok", attachment: toAttachmentDto(attachment), idempotent: false };
    });
  }

  async listAttachments(reportId: string): Promise<AttachmentDto[]> {
    return [...this.attachments.values()]
      .filter((item) => item.reportId === reportId)
      .map((item) => toAttachmentDto(item));
  }

  async getAttachment(
    attachmentId: string,
  ): Promise<(AttachmentDto & { content: Uint8Array }) | null> {
    return this.attachments.get(attachmentId) ?? null;
  }

  async recordSyncSession(input: {
    successCount: number;
    failureCount: number;
    conflictCount: number;
    actorRole: string | null;
  }): Promise<SyncSessionDto> {
    const now = new Date().toISOString();
    const session: SyncSessionDto = {
      id: randomUUID(),
      startedAt: now,
      completedAt: now,
      ...input,
    };
    this.sessions.push(session);
    return session;
  }

  async recentSyncSessions(limit: number): Promise<SyncSessionDto[]> {
    return [...this.sessions].reverse().slice(0, limit);
  }

  async resetAndSeed(records: SeedReport[]): Promise<number> {
    this.reports.clear();
    this.history = [];
    this.attachments.clear();
    this.processed.clear();
    this.sessions = [];
    for (const record of records) {
      const report: ReportDto = {
        id: record.id,
        clientId: record.clientId,
        category: record.category,
        description: record.description,
        location: record.location,
        priority: record.priority,
        status: record.status,
        reportedAt: record.reportedAt,
        reportedTimezone: record.reportedTimezone ?? null,
        serverReceivedAt: record.serverReceivedAt,
        version: record.version,
        reporterName: record.reporterName,
        assigneeName: record.assigneeName ?? null,
        latitude: record.latitude ?? null,
        longitude: record.longitude ?? null,
        accuracyMeters: record.accuracyMeters ?? null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
      this.reports.set(report.id, report);
      this.pushHistory(report.id, record.history, record.createdAt);
      if (record.extraHistory) this.pushHistory(report.id, record.extraHistory, record.updatedAt);
    }
    return records.length;
  }

  async diverge(clientId: string, actorRole: string, actorName: string): Promise<ReportDto | null> {
    const current = await this.getByClientId(clientId);
    if (!current) return null;
    const nextPriority = current.priority === "CRITICAL" ? "HIGH" : "CRITICAL";
    const now = new Date().toISOString();
    const report: ReportDto = {
      ...current,
      priority: nextPriority,
      version: current.version + 1,
      updatedAt: now,
    };
    this.reports.set(report.id, report);
    this.pushHistory(
      report.id,
      [
        {
          action: "PRIORITY_CHANGED",
          actorRole,
          actorName,
          fromValue: current.priority,
          toValue: nextPriority,
          message: "Simulated server edit while a device was offline.",
        },
      ],
      now,
    );
    return report;
  }

  async insertRaw(report: ReportDto): Promise<void> {
    this.reports.set(report.id, report);
  }

  private pushHistory(reportId: string, events: HistoryWrite[], at: string) {
    const current = this.history.filter((event) => event.reportId === reportId);
    let sequence = current.reduce((max, event) => Math.max(max, event.sequence), 0);
    for (const event of events) {
      sequence += 1;
      this.history.push({
        id: randomUUID(),
        reportId,
        action: event.action,
        actorRole: event.actorRole,
        actorName: event.actorName ?? null,
        fromValue: event.fromValue ?? null,
        toValue: event.toValue ?? null,
        message: event.message,
        sequence,
        createdAt: at,
      });
    }
  }
}

function toAttachmentDto(attachment: StoredAttachment): AttachmentDto {
  return {
    id: attachment.id,
    reportId: attachment.reportId,
    clientAttachmentId: attachment.clientAttachmentId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    checksum: attachment.checksum,
    createdAt: attachment.createdAt,
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  const next: Partial<T> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) next[key as keyof T] = item as T[keyof T];
  }
  return next;
}
