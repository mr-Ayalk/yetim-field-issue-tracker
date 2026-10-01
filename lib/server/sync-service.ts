import { APP_VERSION } from "@/lib/domain/constants";
import { seesAllReports } from "@/lib/domain/workflow";
import { fail, ok, type Result } from "@/lib/domain/types";
import { syncBatchSchema, validationFailure } from "@/lib/domain/validation";
import {
  addAttachment,
  changeStatus,
  createReport,
  updateReport,
  type RequestContext,
} from "@/lib/server/report-service";
import type { ReportRepository } from "@/lib/server/repository";

type ItemResult = {
  clientOperationId: string;
  reportClientId: string;
  httpStatus: number;
  body: Result<unknown>;
};

export async function syncOperations(repo: ReportRepository, body: unknown, ctx: RequestContext) {
  const parsed = syncBatchSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  const results: ItemResult[] = [];
  let successCount = 0;
  let failureCount = 0;
  let conflictCount = 0;

  for (const operation of parsed.data.operations) {
    const item = await runOperation(repo, operation, ctx);
    results.push(item);
    if (item.body.ok) successCount += 1;
    else if (item.body.status === 409 && item.body.error.code === "VERSION_CONFLICT") conflictCount += 1;
    else failureCount += 1;
  }

  const session = await repo.recordSyncSession({
    successCount,
    failureCount,
    conflictCount,
    actorRole: ctx.role,
  });

  return ok({
    sessionId: session.id,
    version: APP_VERSION,
    results: results.map((item) => ({
      clientOperationId: item.clientOperationId,
      reportClientId: item.reportClientId,
      httpStatus: item.httpStatus,
      ...(item.body.ok
        ? { ok: true as const, data: item.body.data, meta: item.body.meta }
        : { ok: false as const, error: item.body.error }),
    })),
  });
}

async function runOperation(
  repo: ReportRepository,
  operation: {
    clientOperationId: string;
    type: string;
    reportClientId: string;
    baseVersion?: number;
    payload?: unknown;
  },
  ctx: RequestContext,
): Promise<ItemResult> {
  const payload =
    operation.payload && typeof operation.payload === "object"
      ? { ...(operation.payload as Record<string, unknown>) }
      : {};

  let result: Result<unknown>;
  if (operation.type === "CREATE_REPORT") {
    result = await createReport(repo, { ...payload, clientId: operation.reportClientId, status: "SUBMITTED" }, ctx, operation.clientOperationId);
  } else if (operation.type === "UPDATE_REPORT") {
    result = await updateReport(
      repo,
      operation.reportClientId,
      { ...payload, baseVersion: operation.baseVersion ?? payload.baseVersion },
      ctx,
      operation.clientOperationId,
    );
  } else if (operation.type === "CHANGE_STATUS") {
    result = await changeStatus(
      repo,
      operation.reportClientId,
      { ...payload, baseVersion: operation.baseVersion ?? payload.baseVersion },
      ctx,
      operation.clientOperationId,
    );
  } else if (operation.type === "UPLOAD_ATTACHMENT") {
    result = await addAttachment(repo, operation.reportClientId, payload, ctx, operation.clientOperationId);
  } else if (operation.type === "RESOLVE_CONFLICT") {
    const strategy = (payload as { strategy?: string }).strategy;
    if (strategy === "KEEP_SERVER") {
      const current = await repo.getByAnyId(operation.reportClientId);
      if (!current) result = fail(404, "REPORT_NOT_FOUND", "That report could not be found.");
      else if (!seesAllReports(ctx.role) && current.reporterName !== ctx.actorName) {
        result = fail(403, "FORBIDDEN", "Your current role cannot do that.", "AUTHORIZATION");
      } else {
        const seen = await repo.hasHistoryMessage(
          current.id,
          "CONFLICT_RESOLVED",
          operation.clientOperationId,
        );
        if (!seen) {
          await repo.appendHistory(current.id, [
            {
              action: "CONFLICT_RESOLVED",
              actorRole: ctx.role,
              actorName: ctx.actorName,
              message: `Kept the server version (${operation.clientOperationId}).`,
            },
          ]);
        }
        result = ok(current);
      }
    } else {
      result = await updateReport(
        repo,
        operation.reportClientId,
        {
          ...(payload as { patch?: Record<string, unknown> }).patch,
          baseVersion: operation.baseVersion ?? 1,
          resolution: "APPLY_LOCAL",
        },
        ctx,
        operation.clientOperationId,
      );
    }
  } else {
    result = fail(422, "VALIDATION_ERROR", "Unknown sync operation.", "VALIDATION");
  }

  return {
    clientOperationId: operation.clientOperationId,
    reportClientId: operation.reportClientId,
    httpStatus: result.ok ? 200 : result.status,
    body: result,
  };
}
