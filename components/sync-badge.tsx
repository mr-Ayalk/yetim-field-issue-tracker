import type { SyncState } from "@/lib/domain/constants";
import { PRIORITY_LABELS, SYNC_LABELS, type Priority } from "@/lib/domain/constants";
import { AlertTriangle, ArrowUp, Equal, Minus, RefreshCw } from "lucide-react";

const SYNC_MARK: Record<SyncState, string> = {
  PENDING: "●",
  SYNCING: "↻",
  SYNCHRONIZED: "✓",
  FAILED: "!",
  CONFLICT: "⚠",
};

const SYNC_CLASS: Record<SyncState | "LOCAL", string> = {
  LOCAL: "bg-sky text-teal-deep",
  PENDING: "bg-amber/10 text-amber",
  SYNCING: "bg-sky text-teal",
  SYNCHRONIZED: "bg-ok/10 text-ok",
  FAILED: "bg-clay/10 text-clay",
  CONFLICT: "bg-amber/15 text-clay",
};

export function SyncBadge({ state }: { state: SyncState | "LOCAL" }) {
  const label = state === "LOCAL" ? "On this device" : SYNC_LABELS[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${SYNC_CLASS[state]}`}>
      {state !== "LOCAL" ? <span aria-hidden="true">{SYNC_MARK[state]}</span> : null}
      {state === "SYNCING" ? <RefreshCw aria-hidden="true" className="h-3 w-3 animate-spin" /> : null}
      <span>{label}</span>
    </span>
  );
}

const PRIORITY_ICON = {
  LOW: Minus,
  MEDIUM: Equal,
  HIGH: ArrowUp,
  CRITICAL: AlertTriangle,
} as const;

export function PriorityBadge({ priority }: { priority?: Priority }) {
  if (!priority) return <span className="text-xs text-muted">No priority</span>;
  const Icon = PRIORITY_ICON[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${priority === "CRITICAL" || priority === "HIGH" ? "text-clay" : "text-ink"}`}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span>{PRIORITY_LABELS[priority]}</span>
    </span>
  );
}
