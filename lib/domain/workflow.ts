import type { Role, Status } from "@/lib/domain/constants";

/**
 * The only legal workflow edges. Anything else is rejected by the domain
 * and again by the server, even if a client hides the button.
 */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["ASSIGNED", "REJECTED"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["IN_PROGRESS"],
  REJECTED: ["SUBMITTED"],
};

const FIELD_EDGES = new Set(["DRAFT>SUBMITTED", "REJECTED>SUBMITTED"]);

const COORDINATOR_EDGES = new Set([
  "DRAFT>SUBMITTED",
  "SUBMITTED>ASSIGNED",
  "SUBMITTED>REJECTED",
  "ASSIGNED>IN_PROGRESS",
  "IN_PROGRESS>RESOLVED",
  "RESOLVED>IN_PROGRESS",
  "REJECTED>SUBMITTED",
]);

export function edgeKey(from: Status, to: Status): string {
  return `${from}>${to}`;
}

export function isAllowedTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export function roleCanTransition(role: Role, from: Status, to: Status): boolean {
  if (!isAllowedTransition(from, to)) return false;
  if (role === "DEMO_REVIEWER") return true;
  if (role === "COORDINATOR") return COORDINATOR_EDGES.has(edgeKey(from, to));
  return FIELD_EDGES.has(edgeKey(from, to));
}

export function transitionErrorMessage(from: Status, to: Status): string {
  return `Cannot move a ${from} report directly to ${to}.`;
}

export function canMutateOperationalFields(role: Role): boolean {
  return role === "COORDINATOR" || role === "DEMO_REVIEWER";
}

export function canCorrectSubmittedFields(role: Role): boolean {
  return role === "COORDINATOR" || role === "DEMO_REVIEWER";
}

export function canUseDemoControls(role: Role): boolean {
  return role === "DEMO_REVIEWER" || role === "COORDINATOR";
}

export function seesAllReports(role: Role): boolean {
  return role === "COORDINATOR" || role === "DEMO_REVIEWER";
}
