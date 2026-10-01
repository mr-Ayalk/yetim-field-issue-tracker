import type { FailureClass } from "@/lib/domain/types";

const FRIENDLY: Record<string, string> = {
  VALIDATION_ERROR: "Some fields need attention before this can continue.",
  INVALID_STATUS_TRANSITION: "That status change is not allowed.",
  REPORT_NOT_FOUND: "That report could not be found.",
  VERSION_CONFLICT: "This report changed on the server while you were away.",
  FORBIDDEN: "Your current role cannot do that.",
  SYNC_NETWORK_ERROR: "The network failed before the server could confirm this.",
  SYNC_VALIDATION_ERROR: "The server rejected this update. Correct it, then retry.",
  SYNC_AUTHORIZATION_ERROR: "The server refused this update for the current role.",
  STORAGE_QUOTA_ERROR: "This device is out of space, so the report was not saved.",
  ATTACHMENT_TOO_LARGE: "That image is too large. Use a smaller photo.",
  ATTACHMENT_UNSUPPORTED: "Use a JPEG, PNG, or WebP image.",
  DUPLICATE_CLIENT_ID: "This report was already accepted.",
  INTERNAL: "Something went wrong on the server. Saved local work is still on this device.",
};

export function friendlyMessage(code: string, fallback: string): string {
  return FRIENDLY[code] ?? fallback;
}

export function failureClassForCode(code: string): FailureClass {
  if (code === "VERSION_CONFLICT") return "CONFLICT";
  if (code === "FORBIDDEN" || code === "SYNC_AUTHORIZATION_ERROR") return "AUTHORIZATION";
  if (
    code === "VALIDATION_ERROR" ||
    code === "INVALID_STATUS_TRANSITION" ||
    code === "ATTACHMENT_TOO_LARGE" ||
    code === "ATTACHMENT_UNSUPPORTED" ||
    code === "SYNC_VALIDATION_ERROR"
  ) {
    return "VALIDATION";
  }
  if (code === "SYNC_NETWORK_ERROR" || code === "STORAGE_QUOTA_ERROR") return "TRANSIENT";
  return "UNKNOWN";
}
