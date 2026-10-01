import { Prisma, PrismaClient } from "@prisma/client";
import type {
  AttachmentDto,
  AttachmentInput,
  CreateReportData,
  HistoryDto,
  HistoryWrite,
  ListParams,
  MutationOutcome,
  ReportDto,
  ReportRepository,
  SeedReport,
  SyncSessionDto,
} from "@/lib/server/repository";

type ReportRow = Prisma.ReportGetPayload<object>;
type HistoryRow = Prisma.ReportHistoryGetPayload<object>;
type AttachmentRow = Prisma.AttachmentGetPayload<object>;

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function iso(value: Date): string {
  return value.toISOString();
}

function mapReport(row: ReportRow): ReportDto {
  return {
    id: row.id,
    clientId: row.clientId,
    category: row.category,
    description: row.description,
    location: row.location,
    priority: row.priority,
    status: row.status,
    reportedAt: iso(row.reportedAt),
    reportedTimezone: row.reportedTimezone,
    serverReceivedAt: iso(row.serverReceivedAt),
    version: row.version,
    reporterName: row.reporterName,
    assigneeName: row.assigneeName,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracyMeters,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapHistory(row: HistoryRow): HistoryDto {
  return {
    id: row.id,
    reportId: row.reportId,
    action: row.action,
    actorRole: row.actorRole,
    actorName: row.actorName,
    fromValue: row.fromValue,
    toValue: row.toValue,
    message: row.message,
    sequence: row.sequence,
    createdAt: iso(row.createdAt),
  };
}

function mapAttachment(row: AttachmentRow): AttachmentDto {
  return {
    id: row.id,
    reportId: row.reportId,
    clientAttachmentId: row.clientAttachmentId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    createdAt: iso(row.createdAt),
  };
}

class ConflictRollback extends Error {
  constructor(readonly report: ReportDto) {
    super("conflict");
  }
}

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async readiness(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async list(params: ListParams): Promise<{ items: ReportDto[]; total: number }> {
    const where: Prisma.ReportWhereInput = {
      status: params.status,
      priority: params.priority,
      category: params.category,
      reporterName: params.reporterName,
      ...(params.from || params.to
        ? { reportedAt: { gte: params.from, lte: params.to } }
        : {}),
      ...(params.q
        ? {
            OR: [
              { description: { contains: params.q, mode: "insensitive" } },
              { location: { contains: params.q, mode: "insensitive" } },
              { clientId: { contains: params.q, mode: "insensitive" } },
              { id: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ReportOrderByWithRelationInput =
      params.sort === "priority"
        ? { priority: params.direction }
        : params.sort === "updatedAt"
          ? { updatedAt: params.direction }
          : { reportedAt: params.direction };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ]);
    return { total, items: rows.map(mapReport) };
  }

  async getById(id: string): Promise<ReportDto | null> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    return row ? mapReport(row) : null;
  }

  async getByClientId(clientId: string): Promise<ReportDto | null> {
    const row = await this.prisma.report.findUnique({ where: { clientId } });
    return row ? mapReport(row) : null;
  }

  async getByAnyId(id: string): Promise<ReportDto | null> {
    const row = await this.prisma.report.findFirst({ where: { OR: [{ id }, { clientId: id }] } });
    return row ? mapReport(row) : null;
  }

  async createSubmitted(
    input: CreateReportData,
    operationId?: string,
  ): Promise<{ report: ReportDto; idempotent: boolean }> {
    if (operationId) {
      const replay = await this.replay(operationId);
      if (replay) return { report: replay, idempotent: true };
    }
    const existing = await this.getByClientId(input.clientId);
    if (existing) return { report: existing, idempotent: true };
    try {
      const report = await this.prisma.$transaction(async (tx) => {
        if (operationId) {
          await tx.processedOperation.create({
            data: {
              clientOperationId: operationId,
              reportClientId: input.clientId,
              responseJson: { kind: "create" },
            },
          });
        }
        const created = await tx.report.create({
          data: {
            clientId: input.clientId,
            category: input.category,
            description: input.description,
            location: input.location,
            priority: input.priority,
            status: "SUBMITTED",
            reportedAt: new Date(input.reportedAt),
            reportedTimezone: input.reportedTimezone ?? null,
            serverReceivedAt: new Date(),
            reporterName: input.reporterName,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            accuracyMeters: input.accuracyMeters ?? null,
          },
        });
        await this.writeHistory(tx, created.id, input.history);
        return mapReport(created);
      });
      return { report, idempotent: false };
    } catch (error) {
      if (isUnique(error)) {
        const report = (operationId ? await this.replay(operationId) : null) ?? (await this.getByClientId(input.clientId));
        if (report) return { report, idempotent: true };
      }
      throw error;
    }
  }

  async applyMutation(input: {
    id: string;
    expectedVersion: number;
    patch: import("@/lib/server/repository").ReportPatch;
    history: HistoryWrite[];
    operationId?: string;
    force?: boolean;
  }): Promise<MutationOutcome> {
    if (input.operationId) {
      const replay = await this.replay(input.operationId);
      if (replay) return { kind: "replay", report: replay };
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.report.findFirst({
          where: { OR: [{ id: input.id }, { clientId: input.id }] },
        });
        if (!current) return { kind: "not_found" };
        if (!input.force && current.version !== input.expectedVersion) {
          return { kind: "conflict", report: mapReport(current) };
        }
        if (input.operationId) {
          await tx.processedOperation.create({
            data: {
              clientOperationId: input.operationId,
              reportClientId: current.clientId,
              responseJson: { kind: "mutation" },
            },
          });
        }
        const claimed = await tx.report.updateMany({
          where: {
            id: current.id,
            version: input.force ? current.version : input.expectedVersion,
          },
          data: {
            category: input.patch.category,
            description: input.patch.description,
            location: input.patch.location,
            priority: input.patch.priority,
            status: input.patch.status,
            assigneeName: input.patch.assigneeName,
            latitude: input.patch.latitude,
            longitude: input.patch.longitude,
            accuracyMeters: input.patch.accuracyMeters,
            version: { increment: 1 },
          },
        });
        if (claimed.count !== 1) {
          const fresh = await tx.report.findUnique({ where: { id: current.id } });
          throw new ConflictRollback(fresh ? mapReport(fresh) : mapReport(current));
        }
        await this.writeHistory(tx, current.id, input.history);
        const updated = await tx.report.findUniqueOrThrow({ where: { id: current.id } });
        return { kind: "ok", report: mapReport(updated) };
      });
    } catch (error) {
      if (error instanceof ConflictRollback) return { kind: "conflict", report: error.report };
      if (isUnique(error) && input.operationId) {
        const replay = await this.replay(input.operationId);
        if (replay) return { kind: "replay", report: replay };
      }
      throw error;
    }
  }

  async listHistory(reportId: string): Promise<HistoryDto[]> {
    const rows = await this.prisma.reportHistory.findMany({
      where: { reportId },
      orderBy: { sequence: "asc" },
    });
    return rows.map(mapHistory);
  }

  async hasHistoryMessage(reportId: string, action: string, snippet: string): Promise<boolean> {
    const row = await this.prisma.reportHistory.findFirst({
      where: { reportId, action, message: { contains: snippet } },
    });
    return Boolean(row);
  }

  async appendHistory(reportId: string, history: HistoryWrite[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.writeHistory(tx, reportId, history);
    });
  }

  async addAttachment(
    input: AttachmentInput,
    operationId?: string,
  ): Promise<
    | { kind: "ok"; attachment: AttachmentDto; idempotent: boolean }
    | { kind: "not_found" }
    | { kind: "duplicate" }
  > {
    if (operationId) {
      const existingOp = await this.prisma.processedOperation.findUnique({
        where: { clientOperationId: operationId },
      });
      if (existingOp) {
        const attachment = await this.prisma.attachment.findUnique({
          where: { clientAttachmentId: input.clientAttachmentId },
        });
        if (attachment) return { kind: "ok", attachment: mapAttachment(attachment), idempotent: true };
      }
    }
    const byClient = await this.prisma.attachment.findUnique({
      where: { clientAttachmentId: input.clientAttachmentId },
    });
    if (byClient) return { kind: "ok", attachment: mapAttachment(byClient), idempotent: true };
    const duplicate = await this.prisma.attachment.findFirst({
      where: { reportId: input.reportId, checksum: input.checksum },
    });
    if (duplicate) return { kind: "ok", attachment: mapAttachment(duplicate), idempotent: true };
    try {
      const attachment = await this.prisma.$transaction(async (tx) => {
        const report = await tx.report.findUnique({ where: { id: input.reportId } });
        if (!report) return null;
        const created = await tx.attachment.create({
          data: {
            reportId: input.reportId,
            clientAttachmentId: input.clientAttachmentId,
            fileName: input.fileName,
            mimeType: input.mimeType,
            sizeBytes: input.content.byteLength,
            checksum: input.checksum,
            content: Buffer.from(input.content),
          },
        });
        await tx.report.update({
          where: { id: report.id },
          data: { version: { increment: 1 } },
        });
        await this.writeHistory(tx, report.id, input.history);
        if (operationId) {
          await tx.processedOperation.create({
            data: {
              clientOperationId: operationId,
              reportClientId: report.clientId,
              responseJson: { kind: "attachment" },
            },
          });
        }
        return mapAttachment(created);
      });
      if (!attachment) return { kind: "not_found" };
      return { kind: "ok", attachment, idempotent: false };
    } catch (error) {
      if (isUnique(error)) {
        const attachment =
          (await this.prisma.attachment.findUnique({
            where: { clientAttachmentId: input.clientAttachmentId },
          })) ??
          (await this.prisma.attachment.findFirst({
            where: { reportId: input.reportId, checksum: input.checksum },
          }));
        if (attachment) return { kind: "ok", attachment: mapAttachment(attachment), idempotent: true };
      }
      throw error;
    }
  }

  async listAttachments(reportId: string): Promise<AttachmentDto[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { reportId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapAttachment);
  }

  async getAttachment(
    attachmentId: string,
  ): Promise<(AttachmentDto & { content: Uint8Array }) | null> {
    const row = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!row) return null;
    return { ...mapAttachment(row), content: new Uint8Array(row.content) };
  }

  async recordSyncSession(input: {
    successCount: number;
    failureCount: number;
    conflictCount: number;
    actorRole: string | null;
  }): Promise<SyncSessionDto> {
    const row = await this.prisma.syncSession.create({
      data: { ...input, completedAt: new Date() },
    });
    return {
      id: row.id,
      startedAt: iso(row.startedAt),
      completedAt: row.completedAt ? iso(row.completedAt) : null,
      successCount: row.successCount,
      failureCount: row.failureCount,
      conflictCount: row.conflictCount,
      actorRole: row.actorRole,
    };
  }

  async recentSyncSessions(limit: number): Promise<SyncSessionDto[]> {
    const rows = await this.prisma.syncSession.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      startedAt: iso(row.startedAt),
      completedAt: row.completedAt ? iso(row.completedAt) : null,
      successCount: row.successCount,
      failureCount: row.failureCount,
      conflictCount: row.conflictCount,
      actorRole: row.actorRole,
    }));
  }

  async resetAndSeed(records: SeedReport[]): Promise<number> {
    await this.prisma.$transaction([
      this.prisma.attachment.deleteMany(),
      this.prisma.reportHistory.deleteMany(),
      this.prisma.processedOperation.deleteMany(),
      this.prisma.syncSession.deleteMany(),
      this.prisma.report.deleteMany(),
    ]);
    for (const record of records) {
      await this.prisma.report.create({
        data: {
          id: record.id,
          clientId: record.clientId,
          category: record.category,
          description: record.description,
          location: record.location,
          priority: record.priority,
          status: record.status,
          reportedAt: new Date(record.reportedAt),
          reportedTimezone: record.reportedTimezone ?? null,
          serverReceivedAt: new Date(record.serverReceivedAt),
          version: record.version,
          reporterName: record.reporterName,
          assigneeName: record.assigneeName ?? null,
          latitude: record.latitude ?? null,
          longitude: record.longitude ?? null,
          accuracyMeters: record.accuracyMeters ?? null,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
          history: {
            create: [...record.history, ...(record.extraHistory ?? [])].map((event, index) => ({
              action: event.action,
              actorRole: event.actorRole,
              actorName: event.actorName ?? null,
              fromValue: event.fromValue ?? null,
              toValue: event.toValue ?? null,
              message: event.message,
              sequence: index + 1,
              createdAt: new Date(index < record.history.length ? record.createdAt : record.updatedAt),
            })),
          },
        },
      });
    }
    return records.length;
  }

  async diverge(clientId: string, actorRole: string, actorName: string): Promise<ReportDto | null> {
    const current = await this.prisma.report.findUnique({ where: { clientId } });
    if (!current) return null;
    const nextPriority = current.priority === "CRITICAL" ? "HIGH" : "CRITICAL";
    const updated = await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.update({
        where: { id: current.id },
        data: { priority: nextPriority, version: { increment: 1 } },
      });
      await this.writeHistory(tx, report.id, [
        {
          action: "PRIORITY_CHANGED",
          actorRole,
          actorName,
          fromValue: current.priority,
          toValue: nextPriority,
          message: "Simulated server edit while a device was offline.",
        },
      ]);
      return report;
    });
    return mapReport(updated);
  }

  private async replay(operationId: string): Promise<ReportDto | null> {
    const processed = await this.prisma.processedOperation.findUnique({
      where: { clientOperationId: operationId },
    });
    if (!processed) return null;
    return this.getByClientId(processed.reportClientId);
  }

  private async writeHistory(
    tx: Prisma.TransactionClient,
    reportId: string,
    events: HistoryWrite[],
  ): Promise<void> {
    if (events.length === 0) return;
    const aggregate = await tx.reportHistory.aggregate({
      where: { reportId },
      _max: { sequence: true },
    });
    let sequence = aggregate._max.sequence ?? 0;
    await tx.reportHistory.createMany({
      data: events.map((event) => {
        sequence += 1;
        return {
          reportId,
          action: event.action,
          actorRole: event.actorRole,
          actorName: event.actorName ?? null,
          fromValue: event.fromValue ?? null,
          toValue: event.toValue ?? null,
          message: event.message,
          sequence,
        };
      }),
    });
  }
}
