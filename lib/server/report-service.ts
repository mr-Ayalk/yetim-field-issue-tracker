import type { Role } from "@/lib/domain/constants";
import { creationHistory, fieldDiffHistory, type HistoryDraft } from "@/lib/domain/history";
import { MAX_ATTACHMENT_BYTES } from "@/lib/domain/constants";
import { fail, ok, type Result } from "@/lib/domain/types";
import {
  attachmentSchema,
  createReportSchema,
  listQuerySchema,
  statusChangeSchema,
  updateReportSchema,
  validationFailure,
} from "@/lib/domain/validation";
import {
  canCorrectSubmittedFields,
  canMutateOperationalFields,
  isAllowedTransition,
  roleCanTransition,
  seesAllReports,
  transitionErrorMessage,
} from "@/lib/domain/workflow";
import { buildSeedReports } from "@/lib/server/seed-data";
import type { ReportDto, ReportRepository } from "@/lib/server/repository";

export type RequestContext = {
  role: Role;
  actorName: string;
};

const IMAGE_SIGNATURES: Array<{ mime: string; check: (bytes: Uint8Array) => boolean }> = [
  { mime: "image/jpeg", check: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  {
    mime: "image/png",
    check: (bytes) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
  },
  {
    mime: "image/webp",
    check: (bytes) =>
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50,
  },
];

function owns(report: ReportDto, ctx: RequestContext): boolean {
  if (seesAllReports(ctx.role)) return true;
  return report.reporterName === ctx.actorName;
}

function forbidden(): Result<never> {
  return fail(403, "FORBIDDEN", "Your current role cannot do that.", "AUTHORIZATION");
}

function notFound(): Result<never> {
  return fail(404, "REPORT_NOT_FOUND", "That report could not be found.");
}

function conflict(report: ReportDto, expected: number): Result<never> {
  return fail(
    409,
    "VERSION_CONFLICT",
    "This report changed on the server while you were away.",
    "CONFLICT",
    {
      baseVersion: expected,
      serverVersion: report.version,
      server: report,
    },
  );
}

function normalizeSearch(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^yt-/i, "");
}

export async function listReports(
  repo: ReportRepository,
  query: unknown,
  ctx: RequestContext,
): Promise<Result<{ items: ReportDto[]; total: number; page: number; pageSize: number }>> {
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) return validationFailure(parsed.error);
  const from = parsed.data.from ? new Date(parsed.data.from) : undefined;
  const to = parsed.data.to ? new Date(parsed.data.to) : undefined;
  if (parsed.data.from && Number.isNaN(from?.getTime())) {
    return fail(422, "VALIDATION_ERROR", "Invalid date/time", "VALIDATION", {
      fields: { from: "Invalid date/time" },
    });
  }
  if (parsed.data.to && Number.isNaN(to?.getTime())) {
    return fail(422, "VALIDATION_ERROR", "Invalid date/time", "VALIDATION", {
      fields: { to: "Invalid date/time" },
    });
  }
  if (from && to && from > to) {
    return fail(422, "VALIDATION_ERROR", "The start date is after the end date.", "VALIDATION", {
      fields: { from: "Start must be before end." },
    });
  }
  const reporterName = seesAllReports(ctx.role) ? parsed.data.reporterName : ctx.actorName;
  const listed = await repo.list({
    status: parsed.data.status,
    priority: parsed.data.priority,
    category: parsed.data.category,
    q: normalizeSearch(parsed.data.q),
    from,
    to,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    reporterName,
    sort: parsed.data.sort,
    direction: parsed.data.direction,
  });
  return ok({ ...listed, page: parsed.data.page, pageSize: parsed.data.pageSize });
}

export async function getReport(
  repo: ReportRepository,
  id: string,
  ctx: RequestContext,
): Promise<Result<ReportDto>> {
  const report = await repo.getByAnyId(id);
  if (!report) return notFound();
  if (!owns(report, ctx)) return forbidden();
  return ok(report);
}

export async function createReport(
  repo: ReportRepository,
  body: unknown,
  ctx: RequestContext,
  operationId?: string,
): Promise<Result<ReportDto>> {
  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const reporterName = seesAllReports(ctx.role)
    ? parsed.data.reporterName?.trim() || ctx.actorName
    : ctx.actorName;
  const history = creationHistory(ctx.role, ctx.actorName);
  const created = await repo.createSubmitted(
    {
      clientId: parsed.data.clientId,
      category: parsed.data.category,
      description: parsed.data.description,
      location: parsed.data.location,
      priority: parsed.data.priority,
      reportedAt: new Date(parsed.data.reportedAt).toISOString(),
      reportedTimezone: parsed.data.reportedTimezone ?? null,
      reporterName,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      accuracyMeters: parsed.data.accuracyMeters ?? null,
      actorRole: ctx.role,
      actorName: ctx.actorName,
      history,
    },
    operationId,
  );
  return ok(created.report, created.idempotent ? { idempotent: true } : undefined);
}

export async function updateReport(
  repo: ReportRepository,
  id: string,
  body: unknown,
  ctx: RequestContext,
  operationId?: string,
): Promise<Result<ReportDto>> {
  const parsed = updateReportSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const current = await repo.getByAnyId(id);
  if (!current) return notFound();
  if (!owns(current, ctx)) return forbidden();

  const touchesCore =
    parsed.data.category !== undefined ||
    parsed.data.description !== undefined ||
    parsed.data.location !== undefined ||
    parsed.data.latitude !== undefined ||
    parsed.data.longitude !== undefined ||
    parsed.data.accuracyMeters !== undefined;
  const touchesOps =
    parsed.data.priority !== undefined || parsed.data.assigneeName !== undefined;
  const resolving = parsed.data.resolution === "APPLY_LOCAL";

  if (resolving) {
    if (!owns(current, ctx)) return forbidden();
  } else {
    if (current.status !== "DRAFT" && touchesCore && !canCorrectSubmittedFields(ctx.role)) {
      return fail(
        403,
        "FORBIDDEN",
        "Submitted issue details can only be corrected by a coordinator.",
        "AUTHORIZATION",
      );
    }
    if (touchesOps && !canMutateOperationalFields(ctx.role) && current.status !== "DRAFT") {
      return forbidden();
    }
    if (ctx.role === "FIELD_WORKER" && current.status !== "DRAFT") return forbidden();
  }

  const history = fieldDiffHistory(
    current,
    {
      category: parsed.data.category,
      description: parsed.data.description,
      location: parsed.data.location,
      priority: parsed.data.priority,
      assigneeName: parsed.data.assigneeName,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    },
    ctx.role,
    ctx.actorName,
  );
  const resolvedOperationId = operationId ?? parsed.data.clientOperationId;
  if (resolving) {
    history.push({
      action: "CONFLICT_RESOLVED",
      actorRole: ctx.role,
      actorName: ctx.actorName,
      message: `Applied the local version${resolvedOperationId ? ` (${resolvedOperationId})` : ""}.`,
    });
  }
  return applyAndMap(repo, {
    id: current.id,
    expectedVersion: parsed.data.baseVersion,
    patch: {
      category: parsed.data.category,
      description: parsed.data.description,
      location: parsed.data.location,
      priority: parsed.data.priority,
      assigneeName: parsed.data.assigneeName,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracyMeters: parsed.data.accuracyMeters,
    },
    history,
    operationId: resolvedOperationId,
    force: parsed.data.resolution === "APPLY_LOCAL",
  });
}

export async function changeStatus(
  repo: ReportRepository,
  id: string,
  body: unknown,
  ctx: RequestContext,
  operationId?: string,
): Promise<Result<ReportDto>> {
  const parsed = statusChangeSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const current = await repo.getByAnyId(id);
  if (!current) return notFound();
  if (!owns(current, ctx)) return forbidden();
  if (current.status === parsed.data.to) {
    return ok(current, { idempotent: true });
  }
  if (!isAllowedTransition(current.status, parsed.data.to)) {
    return fail(
      422,
      "INVALID_STATUS_TRANSITION",
      transitionErrorMessage(current.status, parsed.data.to),
      "VALIDATION",
      { from: current.status, to: parsed.data.to },
    );
  }
  if (!roleCanTransition(ctx.role, current.status, parsed.data.to)) return forbidden();

  const assigneeName = parsed.data.assigneeName?.trim();
  if (parsed.data.to === "ASSIGNED" && !assigneeName && !current.assigneeName) {
    return fail(422, "VALIDATION_ERROR", "Choose who this report is assigned to.", "VALIDATION", {
      fields: { assigneeName: "Assignment needs a person." },
    });
  }

  const history: HistoryDraft[] = fieldDiffHistory(
    current,
    {
      status: parsed.data.to,
      assigneeName:
        parsed.data.to === "ASSIGNED" ? assigneeName ?? current.assigneeName : undefined,
    },
    ctx.role,
    ctx.actorName,
  );
  if (parsed.data.reason) {
    const statusEvent = history.find((event) => event.action === "STATUS_CHANGED");
    if (statusEvent) statusEvent.message = `${statusEvent.message} ${parsed.data.reason}`;
  }

  return applyAndMap(repo, {
    id: current.id,
    expectedVersion: parsed.data.baseVersion,
    patch: {
      status: parsed.data.to,
      assigneeName:
        parsed.data.to === "ASSIGNED" ? assigneeName ?? current.assigneeName ?? undefined : undefined,
    },
    history,
    operationId: operationId ?? parsed.data.clientOperationId,
    force: parsed.data.resolution === "APPLY_LOCAL",
  });
}

async function applyAndMap(
  repo: ReportRepository,
  input: Parameters<ReportRepository["applyMutation"]>[0],
): Promise<Result<ReportDto>> {
  const outcome = await repo.applyMutation(input);
  if (outcome.kind === "not_found") return notFound();
  if (outcome.kind === "conflict") {
    const already = input.operationId
      ? await repo.hasHistoryMessage(outcome.report.id, "CONFLICT_DETECTED", input.operationId)
      : false;
    if (!already) {
      await repo.appendHistory(outcome.report.id, [
        {
          action: "CONFLICT_DETECTED",
          actorRole: input.history[0]?.actorRole ?? "FIELD_WORKER",
          actorName: input.history[0]?.actorName ?? null,
          message: `Rejected a stale update${input.operationId ? ` (${input.operationId})` : ""}. The server version was kept.`,
        },
      ]);
    }
    return conflict(outcome.report, input.expectedVersion);
  }
  if (outcome.kind === "replay") return ok(outcome.report, { idempotent: true });
  return ok(outcome.report);
}

export async function getHistory(repo: ReportRepository, id: string, ctx: RequestContext) {
  const report = await getReport(repo, id, ctx);
  if (!report.ok) return report;
  const events = await repo.listHistory(report.data.id);
  return ok(events);
}

export async function addAttachment(
  repo: ReportRepository,
  id: string,
  body: unknown,
  ctx: RequestContext,
  operationId?: string,
) {
  const parsed = attachmentSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const report = await repo.getByAnyId(id);
  if (!report) return notFound();
  if (!owns(report, ctx)) return forbidden();
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(parsed.data.contentBase64, "base64"));
  } catch {
    return fail(422, "ATTACHMENT_UNSUPPORTED", "That image could not be read.", "VALIDATION");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return fail(413, "ATTACHMENT_TOO_LARGE", "That image is too large. Use a smaller photo.", "VALIDATION");
  }
  const signature = IMAGE_SIGNATURES.find((item) => item.check(bytes));
  if (!signature || signature.mime !== parsed.data.mimeType) {
    return fail(422, "ATTACHMENT_UNSUPPORTED", "Use a JPEG, PNG, or WebP image.", "VALIDATION");
  }
  const saved = await repo.addAttachment(
    {
      reportId: report.id,
      clientAttachmentId: parsed.data.clientAttachmentId,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      checksum: parsed.data.checksum,
      content: bytes,
      history: [
        {
          action: "ATTACHMENT_ADDED",
          actorRole: ctx.role,
          actorName: ctx.actorName,
          message: `Evidence added: ${parsed.data.fileName}.`,
        },
      ],
    },
    operationId,
  );
  if (saved.kind === "not_found") return notFound();
  if (saved.kind === "duplicate") {
    return fail(409, "DUPLICATE_CLIENT_ID", "This image is already attached to the report.", "VALIDATION");
  }
  return ok(saved.attachment, saved.idempotent ? { idempotent: true } : undefined);
}

export async function resetDemoData(repo: ReportRepository, ctx: RequestContext) {
  if (process.env.YETIM_DEMO_MODE === "false") {
    return fail(404, "REPORT_NOT_FOUND", "Demo controls are disabled.");
  }
  if (ctx.role !== "DEMO_REVIEWER") {
    return forbidden();
  }
  const count = await repo.resetAndSeed(buildSeedReports());
  return ok({ seeded: count });
}

export async function divergeForDemo(repo: ReportRepository, clientId: string, ctx: RequestContext) {
  if (process.env.YETIM_DEMO_MODE === "false") {
    return fail(404, "REPORT_NOT_FOUND", "Demo controls are disabled.");
  }
  if (ctx.role !== "DEMO_REVIEWER" && ctx.role !== "COORDINATOR") return forbidden();
  const report = await repo.diverge(clientId, ctx.role, ctx.actorName);
  if (!report) return notFound();
  return ok(report);
}

export async function syncStatus(repo: ReportRepository) {
  const [ready, recent] = await Promise.all([repo.readiness(), repo.recentSyncSessions(10)]);
  const lastSuccess = recent.find((session) => session.successCount > 0) ?? null;
  return ok({
    database: ready,
    recent,
    lastSuccess,
  });
}
