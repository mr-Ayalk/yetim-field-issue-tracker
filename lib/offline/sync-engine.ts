import { autoRetriesExhausted, classifyHttpStatus, nextRetryAt } from "@/lib/domain/backoff";
import type { SyncState } from "@/lib/domain/constants";
import { friendlyMessage } from "@/lib/domain/messages";
import type { FailureClass } from "@/lib/domain/types";
import type { LocalOperation, LocalReport } from "@/lib/offline/db";
import type { ReportDto } from "@/lib/server/repository";

export type SendResult =
  | { network: true; message: string }
  | { httpStatus: number; body: unknown };

type ItemBody = {
  ok?: boolean;
  httpStatus?: number;
  data?: ReportDto;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
  meta?: { idempotent?: boolean };
};

export type PersistUpdate = {
  operationId: string;
  operation: Partial<LocalOperation>;
  report?: Partial<LocalReport> & { clientId: string };
};

export type SyncSummary = {
  attempted: number;
  synchronized: number;
  failed: number;
  conflict: number;
};

function openOps(ops: LocalOperation[], reportClientId: string): LocalOperation[] {
  return ops.filter(
    (op) => op.reportClientId === reportClientId && op.status !== "SYNCHRONIZED",
  );
}

export function deriveSyncState(ops: LocalOperation[], reportClientId: string): SyncState | "LOCAL" {
  const open = openOps(ops, reportClientId);
  if (open.length === 0) return "SYNCHRONIZED";
  if (open.some((op) => op.status === "CONFLICT")) return "CONFLICT";
  if (open.some((op) => op.status === "SYNCING")) return "SYNCING";
  if (open.some((op) => op.status === "FAILED")) return "FAILED";
  return "PENDING";
}

export function shouldAttempt(op: LocalOperation, now: number, manual: boolean): boolean {
  if (op.status === "SYNCHRONIZED" || op.status === "CONFLICT" || op.status === "SYNCING") return false;
  if (!manual && (op.failureClass === "VALIDATION" || op.failureClass === "AUTHORIZATION")) return false;
  if (!manual && autoRetriesExhausted(op.attempts) && op.attempts > 0 && op.status === "FAILED") return false;
  if (!manual && op.nextRetryAt && Date.parse(op.nextRetryAt) > now) return false;
  return op.status === "PENDING" || op.status === "FAILED";
}

function waitingOnCreate(op: LocalOperation, ops: LocalOperation[]): boolean {
  if (op.type === "CREATE_REPORT" || op.type === "RESOLVE_CONFLICT") return false;
  return ops.some(
    (other) =>
      other.reportClientId === op.reportClientId &&
      other.type === "CREATE_REPORT" &&
      other.status !== "SYNCHRONIZED",
  );
}

function readItem(body: unknown): ItemBody | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: { results?: ItemBody[] } }).data;
  return data?.results?.[0] ?? null;
}

export async function synchronizeQueue(input: {
  ops: LocalOperation[];
  now: number;
  manual: boolean;
  fault: string | null;
  send: (op: LocalOperation, fault: string | null) => Promise<SendResult>;
  persist: (update: PersistUpdate) => Promise<void>;
}): Promise<SyncSummary> {
  const summary: SyncSummary = { attempted: 0, synchronized: 0, failed: 0, conflict: 0 };
  const ops = input.ops.map((op) => ({ ...op }));
  const ordered = [...ops].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const op of ordered) {
    if (!shouldAttempt(op, input.now, input.manual)) continue;
    if (waitingOnCreate(op, ops)) continue;
    summary.attempted += 1;
    const attempts = op.attempts + 1;
    op.status = "SYNCING";
    await input.persist({
      operationId: op.clientOperationId,
      operation: { status: "SYNCING", attempts, lastAttemptAt: new Date(input.now).toISOString(), updatedAt: new Date(input.now).toISOString() },
      report: { clientId: op.reportClientId, syncState: "SYNCING", syncError: null },
    });

    let response: SendResult;
    try {
      response = await input.send(op, input.fault);
    } catch (error) {
      response = { network: true, message: error instanceof Error ? error.message : "Network error" };
    }

    if ("network" in response) {
      await failOp(input, op, ops, attempts, "TRANSIENT", "SYNC_NETWORK_ERROR", response.message);
      summary.failed += 1;
      continue;
    }

    const item = readItem(response.body);
    const httpStatus = item?.httpStatus ?? response.httpStatus;
    if (item?.ok && item.data) {
      op.status = "SYNCHRONIZED";
      const syncState = deriveSyncState(ops, op.reportClientId);
      await input.persist({
        operationId: op.clientOperationId,
        operation: {
          status: "SYNCHRONIZED",
          attempts,
          failureClass: null,
          lastError: null,
          lastErrorCode: null,
          nextRetryAt: null,
          updatedAt: new Date(input.now).toISOString(),
        },
        report: {
          clientId: op.reportClientId,
          serverId: item.data.id,
          version: item.data.version,
          status: item.data.status,
          priority: item.data.priority,
          category: item.data.category,
          assigneeName: item.data.assigneeName,
          serverReceivedAt: item.data.serverReceivedAt,
          syncState,
          syncError: null,
          syncErrorCode: null,
          syncDetail: null,
          serverSnapshot: null,
          updatedAt: item.data.updatedAt,
        },
      });
      summary.synchronized += 1;
      continue;
    }

    const code = item?.error?.code ?? (httpStatus >= 500 ? "SYNC_NETWORK_ERROR" : "SYNC_VALIDATION_ERROR");
    const message = item?.error?.message ?? `The server returned ${httpStatus}.`;
    const failureClass = item?.error?.code === "VERSION_CONFLICT" ? "CONFLICT" : classifyHttpStatus(httpStatus);
    if (failureClass === "CONFLICT") {
      op.status = "CONFLICT";
      const server = item?.error?.details?.server as ReportDto | undefined;
      await input.persist({
        operationId: op.clientOperationId,
        operation: {
          status: "CONFLICT",
          attempts,
          failureClass: "CONFLICT",
          lastError: message,
          lastErrorCode: code,
          nextRetryAt: null,
          updatedAt: new Date(input.now).toISOString(),
        },
        report: {
          clientId: op.reportClientId,
          syncState: "CONFLICT",
          syncError: friendlyMessage(code, message),
          syncErrorCode: code,
          syncDetail: message,
          serverSnapshot: server ?? null,
          serverId: server?.id ?? undefined,
        },
      });
      summary.conflict += 1;
      continue;
    }

    await failOp(input, op, ops, attempts, failureClass, code, message, item?.error?.details);
    summary.failed += 1;
  }

  return summary;
}

async function failOp(
  input: {
    now: number;
    persist: (update: PersistUpdate) => Promise<void>;
  },
  op: LocalOperation,
  ops: LocalOperation[],
  attempts: number,
  failureClass: FailureClass,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  op.status = "FAILED";
  op.failureClass = failureClass;
  op.attempts = attempts;
  const retryAt =
    failureClass === "TRANSIENT" || failureClass === "UNKNOWN" ? nextRetryAt(attempts, input.now) : null;
  await input.persist({
    operationId: op.clientOperationId,
    operation: {
      status: "FAILED",
      attempts,
      failureClass,
      lastError: message,
      lastErrorCode: code,
      nextRetryAt: retryAt,
      updatedAt: new Date(input.now).toISOString(),
    },
    report: {
      clientId: op.reportClientId,
      syncState: deriveSyncState(ops, op.reportClientId),
      syncError: friendlyMessage(code, message),
      syncErrorCode: code,
      syncDetail: details ? `${message} ${JSON.stringify(details)}` : message,
    },
  });
}
