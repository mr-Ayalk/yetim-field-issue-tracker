import type { Role } from "@/lib/domain/constants";

export async function apiFetch(path: string, init: {
  method?: string;
  body?: unknown;
  role: Role;
  actor: string;
  fault?: string | null;
  signal?: AbortSignal;
}): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.fault === "timeout" ? 1500 : 8000);
  const onAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch(path, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        "x-yetim-role": init.role,
        "x-yetim-actor": init.actor,
        ...(init.fault ? { "x-yetim-fault": init.fault } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) as unknown : null;
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

const READY_TIMEOUT_MS = 15_000;
const RETRY_PAUSE_MS = 1_000;

export type ProbeConnection = {
  /** The app server returned an HTTP response. The network is up even if the database is still waking. */
  reachable: boolean;
  /** `/api/ready` succeeded, so synchronization may send. */
  ready: boolean;
};

type ProbeDeps = {
  fetch?: typeof fetch;
  pauseMs?: number;
  timeoutMs?: number;
};

// `navigator.onLine` is only a hint. Windows often reports false while localhost
// and the network still work, so a failed hint must not skip this request.
// Neon can also refuse the first connection while compute wakes; one retry covers that.
// A 503 still means the server was reached, so the UI must not call that offline.
export async function probeConnection(
  simulatedOffline: boolean,
  deps?: ProbeDeps,
): Promise<ProbeConnection> {
  if (simulatedOffline) return { reachable: false, ready: false };

  const fetchImpl = deps?.fetch ?? fetch;
  const pauseMs = deps?.pauseMs ?? RETRY_PAUSE_MS;
  const timeoutMs = deps?.timeoutMs ?? READY_TIMEOUT_MS;

  const attempt = async (): Promise<ProbeConnection> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl("/api/ready", { cache: "no-store", signal: controller.signal });
      return { reachable: true, ready: response.ok };
    } catch {
      return { reachable: false, ready: false };
    } finally {
      clearTimeout(timer);
    }
  };

  const first = await attempt();
  if (first.ready) return first;
  await new Promise((resolve) => setTimeout(resolve, pauseMs));
  const second = await attempt();
  return {
    reachable: first.reachable || second.reachable,
    ready: second.ready,
  };
}
