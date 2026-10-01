import type { Priority, Status } from "@/lib/domain/constants";
import type { HistoryAction } from "@/lib/domain/constants";

export type HistoryDraft = {
  action: HistoryAction;
  actorRole: string;
  actorName?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  message: string;
};

type Comparable = {
  category?: string;
  description?: string;
  location?: string;
  priority?: Priority;
  status?: Status;
  assigneeName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function creationHistory(actorRole: string, actorName: string): HistoryDraft[] {
  return [
    {
      action: "REPORT_CREATED",
      actorRole,
      actorName,
      message: "Report created from a field submission.",
    },
    {
      action: "REPORT_SUBMITTED",
      actorRole,
      actorName,
      fromValue: "DRAFT",
      toValue: "SUBMITTED",
      message: "Report submitted for coordination.",
    },
    {
      action: "REPORT_SYNCED",
      actorRole,
      actorName,
      message: "Server acknowledged the report.",
    },
  ];
}

export function fieldDiffHistory(
  before: Comparable,
  after: Comparable,
  actorRole: string,
  actorName: string,
): HistoryDraft[] {
  const events: HistoryDraft[] = [];

  if (after.status && after.status !== before.status) {
    events.push({
      action: "STATUS_CHANGED",
      actorRole,
      actorName,
      fromValue: before.status ?? null,
      toValue: after.status,
      message: `Status changed from ${before.status} to ${after.status}.`,
    });
  }

  if (after.priority && after.priority !== before.priority) {
    events.push({
      action: "PRIORITY_CHANGED",
      actorRole,
      actorName,
      fromValue: before.priority ?? null,
      toValue: after.priority,
      message: `Priority changed from ${before.priority} to ${after.priority}.`,
    });
  }

  if (after.assigneeName !== undefined && after.assigneeName !== before.assigneeName) {
    if (!after.assigneeName) {
      events.push({
        action: "UNASSIGNED",
        actorRole,
        actorName,
        fromValue: before.assigneeName ?? null,
        toValue: null,
        message: "Assignment cleared.",
      });
    } else {
      events.push({
        action: "ASSIGNED",
        actorRole,
        actorName,
        fromValue: before.assigneeName ?? null,
        toValue: after.assigneeName,
        message: `Assigned to ${after.assigneeName}.`,
      });
    }
  }

  const corrected: string[] = [];
  if (after.category && after.category !== before.category) corrected.push("category");
  if (after.description && after.description !== before.description) corrected.push("description");
  if (after.location && after.location !== before.location) corrected.push("location");
  if (after.latitude !== undefined && after.latitude !== before.latitude) corrected.push("latitude");
  if (after.longitude !== undefined && after.longitude !== before.longitude) {
    corrected.push("longitude");
  }
  if (corrected.length > 0) {
    events.push({
      action: "FIELD_CORRECTED",
      actorRole,
      actorName,
      message: `Corrected ${corrected.join(", ")}.`,
    });
  }

  return events;
}
