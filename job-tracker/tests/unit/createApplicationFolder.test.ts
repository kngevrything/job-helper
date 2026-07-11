import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createApplicationFolder } from "@/lib/files/createApplicationFolder";

describe("createApplicationFolder", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "jt-folder-test-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("creates a nested applicationsRoot/company/jobId folder", async () => {
    const result = await createApplicationFolder({
      applicationsRoot: root,
      company: "Acme Corp",
      jobId: "12345",
    });

    expect(result.folderPath).toBe(path.join(root, "Acme Corp", "12345"));
    const stat = await fs.stat(result.folderPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("throws if the folder already exists on disk (does not overwrite)", async () => {
    await createApplicationFolder({ applicationsRoot: root, company: "Acme", jobId: "1" });
    await expect(
      createApplicationFolder({ applicationsRoot: root, company: "Acme", jobId: "1" })
    ).rejects.toThrow(/already exists/i);
  });

  it("SECURITY: jobId containing '..' path segments escapes applicationsRoot (path traversal)", async () => {
    const outsideMarker = path.join(root, "..", "jt-traversal-marker");
    await fs.rm(outsideMarker, { recursive: true, force: true });

    const result = await createApplicationFolder({
      applicationsRoot: root,
      company: "Acme",
      jobId: "../../jt-traversal-marker",
    });

    // The resulting folder path is OUTSIDE applicationsRoot -- proves no sanitization occurs.
    expect(result.folderPath.startsWith(root)).toBe(false);
    const stat = await fs.stat(result.folderPath);
    expect(stat.isDirectory()).toBe(true);

    await fs.rm(result.folderPath, { recursive: true, force: true });
  });

  it("creates folders fine with unicode/special (but filesystem-safe) characters in company name", async () => {
    const result = await createApplicationFolder({
      applicationsRoot: root,
      company: "Ünïcode & Co.",
      jobId: "1",
    });
    const stat = await fs.stat(result.folderPath);
    expect(stat.isDirectory()).toBe(true);
  });
});
