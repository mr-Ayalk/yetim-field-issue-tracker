export const APP_VERSION = "1.0.0";

export const CATEGORIES = [
  "WATER_POINT",
  "EQUIPMENT",
  "SERVICE_INTERRUPTION",
  "SAFETY_CONCERN",
  "MAINTENANCE",
  "OTHER",
] as const;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
] as const;

export const ROLES = ["FIELD_WORKER", "COORDINATOR", "DEMO_REVIEWER"] as const;

export const SYNC_STATES = [
  "PENDING",
  "SYNCING",
  "SYNCHRONIZED",
  "FAILED",
  "CONFLICT",
] as const;

export const HISTORY_ACTIONS = [
  "REPORT_CREATED",
  "REPORT_SUBMITTED",
  "REPORT_SYNCED",
  "SYNC_FAILED",
  "STATUS_CHANGED",
  "PRIORITY_CHANGED",
  "ASSIGNED",
  "UNASSIGNED",
  "FIELD_CORRECTED",
  "CONFLICT_DETECTED",
  "CONFLICT_RESOLVED",
  "ATTACHMENT_ADDED",
] as const;

export const OUTBOX_TYPES = [
  "CREATE_REPORT",
  "UPDATE_REPORT",
  "CHANGE_STATUS",
  "UPLOAD_ATTACHMENT",
  "RESOLVE_CONFLICT",
] as const;

export const MAX_AUTO_ATTEMPTS = 5;
export const MAX_ATTACHMENT_BYTES = 1_200_000;
export const MAX_DESCRIPTION_LENGTH = 4000;

export const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  WATER_POINT: "Water Point",
  EQUIPMENT: "Equipment",
  SERVICE_INTERRUPTION: "Service Interruption",
  SAFETY_CONCERN: "Safety Concern",
  MAINTENANCE: "Maintenance",
  OTHER: "Other",
};

export const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

export const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  FIELD_WORKER: "Field worker",
  COORDINATOR: "Coordinator",
  DEMO_REVIEWER: "Demo reviewer",
};

export const SYNC_LABELS: Record<(typeof SYNC_STATES)[number], string> = {
  PENDING: "Pending",
  SYNCING: "Syncing",
  SYNCHRONIZED: "Synchronized",
  FAILED: "Failed",
  CONFLICT: "Conflict",
};

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];
export type Role = (typeof ROLES)[number];
export type SyncState = (typeof SYNC_STATES)[number];
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];
export type OutboxType = (typeof OUTBOX_TYPES)[number];

export function enumTuple<T extends string>(values: readonly T[]): [T, ...T[]] {
  return [values[0], ...values.slice(1)] as [T, ...T[]];
}
