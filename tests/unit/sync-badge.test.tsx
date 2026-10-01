import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SyncBadge } from "@/components/sync-badge";

describe("sync badges", () => {
  it("T-12 shows a text state for every synchronization status", () => {
    const { rerender } = render(<SyncBadge state="PENDING" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    rerender(<SyncBadge state="SYNCING" />);
    expect(screen.getByText("Syncing")).toBeInTheDocument();
    rerender(<SyncBadge state="SYNCHRONIZED" />);
    expect(screen.getByText("Synchronized")).toBeInTheDocument();
    rerender(<SyncBadge state="FAILED" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    rerender(<SyncBadge state="CONFLICT" />);
    expect(screen.getByText("Conflict")).toBeInTheDocument();
  });
});
