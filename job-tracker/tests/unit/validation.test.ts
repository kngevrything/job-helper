import { describe, it, expect } from "vitest";
import {
  jobApplicationInputSchema,
  jobApplicationStatusSchema,
} from "@/lib/validation/jobApplication";

describe("jobApplicationInputSchema", () => {
  const valid = {
    company: "Acme Corp",
    jobId: "12345",
    jobTitle: "Software Engineer",
    jobUrl: "https://example.com/job/1",
    createFiles: true,
  };

  it("accepts a fully valid payload", () => {
    const result = jobApplicationInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects empty company", () => {
    const result = jobApplicationInputSchema.safeParse({ ...valid, company: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only company (trimmed to empty)", () => {
    const result = jobApplicationInputSchema.safeParse({ ...valid, company: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects empty jobId", () => {
    const result = jobApplicationInputSchema.safeParse({ ...valid, jobId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty jobTitle", () => {
    const result = jobApplicationInputSchema.safeParse({ ...valid, jobTitle: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid jobUrl", () => {
    const result = jobApplicationInputSchema.safeParse({ ...valid, jobUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects a jobUrl missing a scheme", () => {
    const result = jobApplicationInputSchema.safeParse({ ...valid, jobUrl: "example.com/job" });
    expect(result.success).toBe(false);
  });

  it("accepts non-http(s) URL schemes (documents current behavior: no scheme allowlist)", () => {
    // zod's .url() accepts any valid URL, including javascript: and file: schemes.
    const result = jobApplicationInputSchema.safeParse({
      ...valid,
      jobUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing createFiles field", () => {
    const { createFiles, ...rest } = valid;
    const result = jobApplicationInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("trims leading/trailing whitespace from string fields", () => {
    const result = jobApplicationInputSchema.safeParse({
      ...valid,
      company: "  Acme Corp  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.company).toBe("Acme Corp");
    }
  });

  it("does not reject company/jobId containing path traversal or path-separator characters", () => {
    // Documents that filesystem-unsafe characters are not rejected at the validation layer.
    const result = jobApplicationInputSchema.safeParse({
      ...valid,
      company: "../../etc",
      jobId: "..\\..\\Windows",
    });
    expect(result.success).toBe(true);
  });
});

describe("jobApplicationStatusSchema", () => {
  it("accepts a known status", () => {
    expect(jobApplicationStatusSchema.safeParse("Applied").success).toBe(true);
  });

  it("rejects an unknown status string", () => {
    expect(jobApplicationStatusSchema.safeParse("Made Up Status").success).toBe(false);
  });

  it("rejects lowercase variants of valid statuses", () => {
    expect(jobApplicationStatusSchema.safeParse("applied").success).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(jobApplicationStatusSchema.safeParse(123).success).toBe(false);
    expect(jobApplicationStatusSchema.safeParse(null).success).toBe(false);
    expect(jobApplicationStatusSchema.safeParse(undefined).success).toBe(false);
  });
});
