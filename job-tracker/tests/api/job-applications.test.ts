import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { GET, POST } from "@/app/api/job-applications/route";
import { resetJobApplications, getAllDocsRaw } from "../mocks/fakeJobApplication";

let appsRoot: string;
const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  appsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jt-approot-"));
  process.env.APPLICATIONS_ROOT = appsRoot;
});

afterEach(async () => {
  await fs.rm(appsRoot, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

function makeCreateRequest(body: unknown) {
  return new Request("http://localhost/api/job-applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/job-applications", () => {
  it("returns an empty list when there are no applications", async () => {
    resetJobApplications([]);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual([]);
  });

  it("returns applications sorted newest-first by createdAt", async () => {
    resetJobApplications([
      { _id: "a", company: "A", jobId: "1", createdAt: new Date("2024-01-01") },
      { _id: "b", company: "B", jobId: "1", createdAt: new Date("2024-06-01") },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(json.data.map((d: any) => d._id)).toEqual(["b", "a"]);
  });
});

describe("POST /api/job-applications", () => {
  const validBody = {
    company: "Acme Corp",
    jobId: "12345",
    jobTitle: "Software Engineer",
    jobUrl: "https://example.com/job/1",
    createFiles: true,
  };

  it("creates a new application and a folder on disk", async () => {
    const res = await POST(makeCreateRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.company).toBe("Acme Corp");
    expect(json.data.status).toBe("UNSET");
    expect(json.data.folderPath).toBe(path.join(appsRoot, "Acme Corp", "12345"));

    const stat = await fs.stat(json.data.folderPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("rejects invalid input with 400 and does not touch the filesystem", async () => {
    const res = await POST(makeCreateRequest({ ...validBody, jobUrl: "not-a-url" }));
    expect(res.status).toBe(400);
    const entries = await fs.readdir(appsRoot);
    expect(entries).toEqual([]);
  });

  it("returns 409 when company+jobId already exists", async () => {
    resetJobApplications([{ _id: "existing", company: "Acme Corp", jobId: "12345" }]);
    const res = await POST(makeCreateRequest(validBody));
    expect(res.status).toBe(409);
  });

  it("returns 500 when APPLICATIONS_ROOT is not configured", async () => {
    delete process.env.APPLICATIONS_ROOT;
    const res = await POST(makeCreateRequest(validBody));
    expect(res.status).toBe(500);
  });

  it("BUG FIX: the pre-check (findOne) + create is still not atomic, but a genuine " +
     "unique-index race now resolves to a clean 409 instead of a raw 500", async () => {
    resetJobApplications([]);
    // Simulate a concurrent insert landing *after* the route's findOne pre-check
    // has already returned null, but *before* create() runs: stub findOne to miss
    // once, while the duplicate doc is already present so create()'s unique-index
    // emulation throws E11000, matching real MongoDB race behavior.
    const model = await import("../mocks/fakeJobApplication");
    getAllDocsRaw().push({
      _id: "race",
      company: validBody.company,
      jobId: validBody.jobId,
      createdAt: new Date(),
    });
    const spy = vi.spyOn(model.JobApplication, "findOne").mockResolvedValueOnce(null);

    const res = await POST(makeCreateRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already exists/i);

    spy.mockRestore();
  });
});
