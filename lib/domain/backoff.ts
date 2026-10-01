import { MAX_AUTO_ATTEMPTS } from "@/lib/domain/constants";

const BASE_MS = 1000;
const CAP_MS = 30_000;

/** Bounded exponential backoff: 1s, 2s, 4s, 8s, 16s, then 30s. */
export function backoffDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(BASE_MS * 2 ** exponent, CAP_MS);
}

export function nextRetryAt(attempt: number, nowMs: number): string {
  return new Date(nowMs + backoffDelayMs(attempt)).toISOString();
}

export function autoRetriesExhausted(attempts: number): boolean {
  return attempts >= MAX_AUTO_ATTEMPTS;
}

export function classifyHttpStatus(status: number): "TRANSIENT" | "VALIDATION" | "CONFLICT" | "AUTHORIZATION" | "UNKNOWN" {
  if (status === 409) return "CONFLICT";
  if (status === 401 || status === 403) return "AUTHORIZATION";
  if (status === 400 || status === 422) return "VALIDATION";
  if (status === 408 || status === 429 || status >= 500) return "TRANSIENT";
  if (status === 0) return "TRANSIENT";
  return "UNKNOWN";
}
