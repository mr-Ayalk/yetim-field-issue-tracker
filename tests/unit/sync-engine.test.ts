import { describe, expect, it } from "vitest";
import type { LocalOperation } from "@/lib/offline/db";
import { deriveSyncState, shouldAttempt, synchronizeQueue } from "@/lib/offline/sync-engine";

function op(partial: Partial<LocalOperation> & Pick<LocalOperation, "clientOperationId" | "type">): LocalOperation {
  return {
    reportClientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    payload: {},
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

const serverReport = {
  id: "server-1",
  clientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  category: "WATER_POINT",
  description: "The standpipe has no flow and the valve handle is missing.",
  location: "Hawassa",
  priority: "HIGH",
  status: "SUBMITTED",
  reportedAt: "2026-10-01T00:00:00.000Z",
  reportedTimezone: "UTC+03:00",
  serverReceivedAt: "2026-10-01T00:01:00.000Z",
  version: 1,
  reporterName: "Hana Bekele",
  assigneeName: null,
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  createdAt: "2026-10-01T00:01:00.000Z",
  updatedAt: "2026-10-01T00:01:00.000Z",
};

describe("sync engine", () => {
  it("T-07 marks only acknowledged operations synchronized", async () => {
    const persisted: string[] = [];
    const summary = await synchronizeQueue({
      ops: [op({ clientOperationId: "op-1", type: "CREATE_REPORT" })],
      now: Date.parse("2026-10-01T00:02:00.000Z"),
      manual: true,
      fault: null,
      send: async () => ({
        httpStatus: 200,
        body: { data: { results: [{ ok: true, httpStatus: 200, data: serverReport }] } },
      }),
      persist: async (update) => {
        persisted.push(`${update.operation.status}:${update.report?.syncState}`);
      },
    });
    expect(summary.synchronized).toBe(1);
    expect(persisted).toContain("SYNCHRONIZED:SYNCHRONIZED");
  });

  it("T-08 keeps a failed operation retryable and preserves earlier acknowledgements", async () => {
    const states: string[] = [];
    const summary = await synchronizeQueue({
      ops: [
        op({ clientOperationId: "op-1", type: "CREATE_REPORT", reportClientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", createdAt: "2026-10-01T00:00:00.000Z" }),
        op({ clientOperationId: "op-2", type: "CREATE_REPORT", reportClientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", createdAt: "2026-10-01T00:00:01.000Z" }),
      ],
      now: Date.parse("2026-10-01T00:02:00.000Z"),
      manual: false,
      fault: null,
      send: async (operation) => {
        if (operation.clientOperationId === "op-2") return { network: true, message: "timeout" };
        return { httpStatus: 200, body: { data: { results: [{ ok: true, httpStatus: 200, data: { ...serverReport, clientId: operation.reportClientId } }] } } };
      },
      persist: async (update) => {
        if (update.operation.status === "SYNCHRONIZED" || update.operation.status === "FAILED") {
          states.push(`${update.operationId}:${update.operation.status}`);
        }
      },
    });
    expect(summary.synchronized).toBe(1);
    expect(summary.failed).toBe(1);
    expect(states).toEqual(["op-1:SYNCHRONIZED", "op-2:FAILED"]);
    const retry = op({ clientOperationId: "op-2", type: "CREATE_REPORT", status: "FAILED", attempts: 1, failureClass: "TRANSIENT", nextRetryAt: "2026-10-01T00:03:00.000Z" });
    expect(shouldAttempt(retry, Date.parse("2026-10-01T00:02:30.000Z"), false)).toBe(false);
    expect(shouldAttempt(retry, Date.parse("2026-10-01T00:03:01.000Z"), false)).toBe(true);
  });

  it("T-10 leaves a version conflict visible instead of applying either side", async () => {
    let snapshot: unknown = "missing";
    await synchronizeQueue({
      ops: [op({ clientOperationId: "op-9", type: "UPDATE_REPORT", baseVersion: 1 })],
      now: Date.now(),
      manual: true,
      fault: null,
      send: async () => ({
        httpStatus: 200,
        body: {
          data: {
            results: [
              {
                ok: false,
                httpStatus: 409,
                error: {
                  code: "VERSION_CONFLICT",
                  message: "stale",
                  details: { server: { ...serverReport, version: 2, priority: "CRITICAL" } },
                },
              },
            ],
          },
        },
      }),
      persist: async (update) => {
        if (update.operation.status === "CONFLICT") snapshot = update.report?.serverSnapshot;
      },
    });
    expect(snapshot).toMatchObject({ version: 2, priority: "CRITICAL" });
    expect(deriveSyncState([op({ clientOperationId: "op-9", type: "UPDATE_REPORT", status: "CONFLICT" })], "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1")).toBe("CONFLICT");
  });

  it("does not auto-retry a validation failure", () => {
    const failed = op({
      clientOperationId: "op-3",
      type: "CREATE_REPORT",
      status: "FAILED",
      attempts: 1,
      failureClass: "VALIDATION",
    });
    expect(shouldAttempt(failed, Date.now(), false)).toBe(false);
    expect(shouldAttempt(failed, Date.now(), true)).toBe(true);
  });
});
