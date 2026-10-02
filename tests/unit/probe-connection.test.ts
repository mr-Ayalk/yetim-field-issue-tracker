import { afterEach, describe, expect, it, vi } from "vitest";
import { probeConnection } from "@/lib/client/api";

function jsonResponse(status: number) {
  return new Response(JSON.stringify({ data: { status } }), { status });
}

describe("probeConnection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats a successful ready check as online even when the browser says offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchImpl = vi.fn(async () => jsonResponse(200));
    const result = await probeConnection(false, { fetch: fetchImpl as typeof fetch, pauseMs: 0 });
    expect(result).toEqual({ reachable: true, ready: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("stays reachable when the database is still waking and then becomes ready", async () => {
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValueOnce(jsonResponse(200));
    const result = await probeConnection(false, { fetch: fetchImpl as typeof fetch, pauseMs: 0 });
    expect(result).toEqual({ reachable: true, ready: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not call the network offline when the server answers that the database is down", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503));
    const result = await probeConnection(false, { fetch: fetchImpl as typeof fetch, pauseMs: 0 });
    expect(result).toEqual({ reachable: true, ready: false });
  });

  it("reports offline only when the server cannot be reached", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await probeConnection(false, { fetch: fetchImpl as typeof fetch, pauseMs: 0 });
    expect(result).toEqual({ reachable: false, ready: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("skips the network during simulated offline", async () => {
    const fetchImpl = vi.fn();
    const result = await probeConnection(true, { fetch: fetchImpl as typeof fetch, pauseMs: 0 });
    expect(result).toEqual({ reachable: false, ready: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
