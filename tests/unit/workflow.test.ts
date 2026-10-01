import { describe, expect, it } from "vitest";
import { autoRetriesExhausted, backoffDelayMs, classifyHttpStatus } from "@/lib/domain/backoff";
import { isAllowedTransition, roleCanTransition } from "@/lib/domain/workflow";

describe("workflow matrix", () => {
  it("allows the primary path and the two controlled returns", () => {
    expect(isAllowedTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(isAllowedTransition("SUBMITTED", "ASSIGNED")).toBe(true);
    expect(isAllowedTransition("SUBMITTED", "REJECTED")).toBe(true);
    expect(isAllowedTransition("ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(isAllowedTransition("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(isAllowedTransition("RESOLVED", "IN_PROGRESS")).toBe(true);
    expect(isAllowedTransition("REJECTED", "SUBMITTED")).toBe(true);
    expect(isAllowedTransition("DRAFT", "RESOLVED")).toBe(false);
    expect(isAllowedTransition("SUBMITTED", "RESOLVED")).toBe(false);
    expect(isAllowedTransition("RESOLVED", "SUBMITTED")).toBe(false);
  });

  it("keeps field workers off coordinator transitions", () => {
    expect(roleCanTransition("FIELD_WORKER", "SUBMITTED", "ASSIGNED")).toBe(false);
    expect(roleCanTransition("FIELD_WORKER", "REJECTED", "SUBMITTED")).toBe(true);
    expect(roleCanTransition("COORDINATOR", "RESOLVED", "IN_PROGRESS")).toBe(true);
    expect(roleCanTransition("DEMO_REVIEWER", "IN_PROGRESS", "RESOLVED")).toBe(true);
  });
});

describe("retry classification", () => {
  it("backs off exponentially and then stops automatic retries", () => {
    expect(backoffDelayMs(1)).toBe(1000);
    expect(backoffDelayMs(2)).toBe(2000);
    expect(backoffDelayMs(3)).toBe(4000);
    expect(backoffDelayMs(6)).toBe(30_000);
    expect(autoRetriesExhausted(5)).toBe(true);
    expect(autoRetriesExhausted(4)).toBe(false);
  });

  it("separates conflicts, validation, and transient failures", () => {
    expect(classifyHttpStatus(409)).toBe("CONFLICT");
    expect(classifyHttpStatus(422)).toBe("VALIDATION");
    expect(classifyHttpStatus(403)).toBe("AUTHORIZATION");
    expect(classifyHttpStatus(503)).toBe("TRANSIENT");
    expect(classifyHttpStatus(0)).toBe("TRANSIENT");
  });
});
