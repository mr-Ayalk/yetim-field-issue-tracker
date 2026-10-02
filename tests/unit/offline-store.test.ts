import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/lib/offline/db";
import { saveDraft, submitLocalReport } from "@/lib/offline/store";

async function fresh() {
  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("yetim");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  }
  resetDbForTests();
}

describe("local persistence", () => {
  beforeEach(async () => {
    await fresh();
  });

  it("T-06 keeps an offline report after the database is reopened", async () => {
    const clientId = crypto.randomUUID();
    await submitLocalReport({
      clientId,
      category: "WATER_POINT",
      description: "The standpipe has no flow and the valve handle is missing.",
      location: "Hawassa industrial zone",
      priority: "HIGH",
      reportedAt: "2026-10-01T06:40:00.000Z",
      reportedTimezone: "UTC+03:00",
      role: "FIELD_WORKER",
      actor: "Hana Bekele",
    });
    const operation = await getDb().outbox.toArray();
    expect(operation).toHaveLength(1);
    expect(operation[0]?.status).toBe("PENDING");
    getDb().close();
    resetDbForTests();
    const reopened = await getDb().reports.get(clientId);
    expect(reopened?.syncState).toBe("PENDING");
    expect(reopened?.description).toContain("standpipe");
    const queue = await getDb().outbox.toArray();
    expect(queue).toHaveLength(1);
  });

  it("saves a draft without queueing it for the server", async () => {
    const clientId = crypto.randomUUID();
    await saveDraft({
      clientId,
      description: "Incomplete note",
      location: "",
      reportedAt: "2026-10-01T06:40:00.000Z",
      reportedTimezone: "UTC+03:00",
      role: "FIELD_WORKER",
      actor: "Hana Bekele",
    });
    expect(await getDb().outbox.count()).toBe(0);
    expect((await getDb().reports.get(clientId))?.status).toBe("DRAFT");
  });

  it("does not claim success when storage throws", async () => {
    const database = getDb();
    database.close();
    await database.delete();
    resetDbForTests();
    const blocked = getDb();
    blocked.reports.put = (() =>
      Promise.reject(
        new DOMException("quota", "QuotaExceededError"),
      )) as unknown as typeof blocked.reports.put;
    await expect(
      saveDraft({
        clientId: crypto.randomUUID(),
        description: "Keep this text",
        location: "Adama",
        reportedAt: "2026-10-01T06:40:00.000Z",
        reportedTimezone: "UTC+03:00",
        role: "FIELD_WORKER",
        actor: "Hana Bekele",
      }),
    ).rejects.toThrow(/not saved/i);
  });
});
