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

  it("SECURITY FIX: jobId containing '..' path segments is rejected instead of " +
     "escaping applicationsRoot (defense in depth -- the API layer also rejects " +
     "this at the validation step, but this guarantees the function itself " +
     "can't be tricked by any caller)", async () => {
    const outsideMarker = path.join(root, "..", "jt-traversal-marker");
    await fs.rm(outsideMarker, { recursive: true, force: true });

    await expect(
      createApplicationFolder({
        applicationsRoot: root,
        company: "Acme",
        jobId: "../../jt-traversal-marker",
      })
    ).rejects.toThrow(/outside the applications root/i);

    // Confirm nothing was actually created outside applicationsRoot.
    await expect(fs.access(outsideMarker)).rejects.toThrow();
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
