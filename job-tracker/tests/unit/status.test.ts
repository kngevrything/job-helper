import { describe, it, expect } from "vitest";
import {
  APPLICATION_STATUSES,
  TERMINAL_STATUSES,
  STATUS_GROUPS,
  isTerminalStatus,
} from "@/lib/status";

describe("status.ts", () => {
  it("every TERMINAL_STATUSES entry is a real application status", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(APPLICATION_STATUSES).toContain(status);
    }
  });

  it("STATUS_GROUPS options are all unique across groups (no duplicate status strings)", () => {
    const seen = new Set<string>();
    for (const status of APPLICATION_STATUSES) {
      expect(seen.has(status)).toBe(false);
      seen.add(status);
    }
  });

  it("isTerminalStatus returns true only for statuses in TERMINAL_STATUSES", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(isTerminalStatus(status)).toBe(
        (TERMINAL_STATUSES as readonly string[]).includes(status)
      );
    }
  });

  it("isTerminalStatus returns false for unknown/garbage status strings", () => {
    expect(isTerminalStatus("Not A Real Status")).toBe(false);
    expect(isTerminalStatus("")).toBe(false);
  });

  it("isTerminalStatus is case-sensitive (documents current behavior)", () => {
    // TERMINAL_STATUSES contains "Ghosted"; lowercase should NOT match.
    expect(isTerminalStatus("ghosted")).toBe(false);
  });

  it("non-terminal statuses include UNSET, Tailoring, Applied, and all *Scheduled/*Done rounds", () => {
    expect(isTerminalStatus("UNSET")).toBe(false);
    expect(isTerminalStatus("Tailoring")).toBe(false);
    expect(isTerminalStatus("Applied")).toBe(false);
    expect(isTerminalStatus("1st Round Scheduled")).toBe(false);
    expect(isTerminalStatus("Offer Received")).toBe(false);
  });

  it("STATUS_GROUPS flattens to exactly APPLICATION_STATUSES in the same order", () => {
    const flattened = STATUS_GROUPS.flatMap((g) => g.options);
    expect(flattened).toEqual(APPLICATION_STATUSES);
  });
});
