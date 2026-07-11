import { describe, it, expect } from "vitest";
import { companyNeedsCustomResume } from "@/lib/files/companyRules";

describe("companyNeedsCustomResume", () => {
  it("returns false for known companies regardless of case/whitespace", () => {
    expect(companyNeedsCustomResume("Microsoft")).toBe(false);
    expect(companyNeedsCustomResume("  microsoft  ")).toBe(false);
    expect(companyNeedsCustomResume("MICROSOFT")).toBe(false);
    expect(companyNeedsCustomResume("GitHub")).toBe(false);
    expect(companyNeedsCustomResume("Atlassian")).toBe(false);
  });

  it("returns true for companies not on the exemption list", () => {
    expect(companyNeedsCustomResume("Google")).toBe(true);
    expect(companyNeedsCustomResume("Some Random Startup")).toBe(true);
  });

  it("NOTE: this function is not called anywhere in the live app (API routes/UI) -- " +
     "only scripts/importCsv.js uses it. needsCustomResume on new applications is always null.",
     () => {
      // This test just documents the current wiring; see report for details.
      expect(typeof companyNeedsCustomResume).toBe("function");
  });
});
