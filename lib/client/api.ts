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

export async function probeReady(simulatedOffline: boolean): Promise<boolean> {
  if (simulatedOffline) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const response = await fetch("/api/ready", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}
