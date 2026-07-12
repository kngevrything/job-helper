import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { POST } from "@/app/api/job-applications/[id]/create-document/route";
import { resetJobApplications } from "../mocks/fakeJobApplication";

const ORIGINAL_ENV = { ...process.env };
let appsRoot: string;
let folderPath: string;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(type: unknown) {
  return new Request("http://localhost/api/job-applications/x/create-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
}

beforeEach(async () => {
  appsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jt-docs-root-"));
  folderPath = await fs.mkdtemp(path.join(os.tmpdir(), "jt-docs-folder-"));
  await fs.writeFile(path.join(appsRoot, "Base Resume.docx"), "fake resume");
  await fs.writeFile(path.join(appsRoot, "Base Cover Letter.docx"), "fake cover letter");
  process.env.APPLICATIONS_ROOT = appsRoot;
  process.env.BASE_RESUME_FILENAME = "Base Resume.docx";
  process.env.BASE_COVER_LETTER_FILENAME = "Base Cover Letter.docx";
  process.env.APPLICANT_NAME = "Test Applicant";
});

afterEach(async () => {
  await fs.rm(appsRoot, { recursive: true, force: true });
  await fs.rm(folderPath, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/job-applications/[id]/create-document", () => {
  it("rejects an invalid type", async () => {
    resetJobApplications([{ _id: "1", company: "A", jobId: "1", folderPath }]);
    const res = await POST(req("bogus"), ctx("1"));
    expect(res.status).toBe(400);
  });

  it("returns 500 when file configuration env vars are missing", async () => {
    delete process.env.BASE_RESUME_FILENAME;
    resetJobApplications([{ _id: "1", company: "A", jobId: "1", folderPath }]);
    const res = await POST(req("resume"), ctx("1"));
    expect(res.status).toBe(500);
  });

  it("returns 500 when APPLICANT_NAME is missing", async () => {
    delete process.env.APPLICANT_NAME;
    resetJobApplications([{ _id: "1", company: "A", jobId: "1", folderPath }]);
    const res = await POST(req("resume"), ctx("1"));
    expect(res.status).toBe(500);
  });

  it("returns 404 for a non-existent application", async () => {
    resetJobApplications([]);
    const res = await POST(req("resume"), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the application has no folderPath", async () => {
    resetJobApplications([{ _id: "1", company: "A", jobId: "1", folderPath: null }]);
    const res = await POST(req("resume"), ctx("1"));
    expect(res.status).toBe(400);
  });

  it("copies the base resume into the folder and sets resumePath + status=Tailoring", async () => {
    resetJobApplications([
      { _id: "1", company: "A", jobId: "42", folderPath, status: "UNSET" },
    ]);
    const res = await POST(req("resume"), ctx("1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("Tailoring");
    expect(json.data.resumePath).toBe(path.join(folderPath, "Test Applicant Resume 42.docx"));

    const copied = await fs.readFile(json.data.resumePath, "utf-8");
    expect(copied).toBe("fake resume");
  });

  it("BUG FIX: creating a resume for an application that already progressed further " +
     "(e.g. mid-interview) no longer regresses its status -- only a brand-new " +
     "(UNSET) application advances to 'Tailoring'", async () => {
    resetJobApplications([
      { _id: "1", company: "A", jobId: "42", folderPath, status: "2nd Round Scheduled" },
    ]);
    const res = await POST(req("resume"), ctx("1"));
    const json = await res.json();
    expect(json.data.status).toBe("2nd Round Scheduled");
  });

  it("cover letter creation never changes status, consistent with the fixed resume behavior", async () => {
    resetJobApplications([
      { _id: "1", company: "A", jobId: "42", folderPath, status: "2nd Round Scheduled" },
    ]);
    const res = await POST(req("coverLetter"), ctx("1"));
    const json = await res.json();
    expect(json.data.status).toBe("2nd Round Scheduled");
    expect(json.data.coverLetterPath).toBe(path.join(folderPath, "Test Applicant Cover Letter 42.docx"));
  });

  it("returns 409 if the destination file already exists, without overwriting it", async () => {
    const destPath = path.join(folderPath, "Test Applicant Resume 42.docx");
    await fs.writeFile(destPath, "pre-existing content");
    resetJobApplications([{ _id: "1", company: "A", jobId: "42", folderPath }]);

    const res = await POST(req("resume"), ctx("1"));
    expect(res.status).toBe(409);

    const contents = await fs.readFile(destPath, "utf-8");
    expect(contents).toBe("pre-existing content");
  });
});
