import { describe, it, expect } from "vitest";
import {
  APPLICATION_STATUSES,
  TERMINAL_STATUSES,
  STATUS_GROUPS,
  isTerminalStatus,
  isInterviewingStatus,
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

  it("every status containing 'Exit' is terminal", () => {
    for (const status of APPLICATION_STATUSES.filter((s) => s.includes("Exit"))) {
      expect(isTerminalStatus(status)).toBe(true);
    }
  });

  it("isInterviewingStatus excludes pre-interview and terminal statuses", () => {
    for (const status of ["UNSET", "Tailoring", "Applied", ...TERMINAL_STATUSES]) {
      expect(isInterviewingStatus(status)).toBe(false);
    }
    expect(isInterviewingStatus("Not A Real Status")).toBe(false);
  });

  it("isInterviewingStatus includes active rounds and Offer Received", () => {
    expect(isInterviewingStatus("1st Round Scheduled")).toBe(true);
    expect(isInterviewingStatus("3rd Round Done")).toBe(true);
    expect(isInterviewingStatus("Final Round Scheduled")).toBe(true);
    expect(isInterviewingStatus("Offer Received")).toBe(true);
  });
});
