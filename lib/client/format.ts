export function issueCode(clientId: string): string {
  return `YT-${clientId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function formatWhen(value?: string | null): string {
  if (!value) return "Not received yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date/time";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ageLabel(fromIso: string, now = Date.now()): string {
  const delta = Math.max(0, now - Date.parse(fromIso));
  const hours = Math.floor(delta / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function deviceTimezone(): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function localInputToIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function isoToLocalInput(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
