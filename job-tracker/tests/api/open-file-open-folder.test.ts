import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetJobApplications } from "../mocks/fakeJobApplication";

const execMock = vi.fn((_cmd: string, cb?: (err: unknown) => void) => {
  if (cb) cb(null);
});

vi.mock("child_process", () => ({
  exec: (...args: unknown[]) => execMock(...(args as [string])),
}));

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  execMock.mockClear();
});

describe("POST /api/job-applications/[id]/open-file", () => {
  it("SECURITY: shells out via child_process.exec with the raw filePath string-interpolated " +
     "and unescaped -- a filePath containing shell metacharacters is executed verbatim " +
     "(command injection)", async () => {
    const { POST } = await import("@/app/api/job-applications/[id]/open-file/route");

    const malicious = `C:\\legit.docx" & calc.exe & "`;
    const request = new Request("http://localhost/x/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: malicious }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);

    expect(execMock).toHaveBeenCalledTimes(1);
    const [command] = execMock.mock.calls[0] as [string];
    // The malicious payload appears verbatim in the shell command string.
    expect(command).toContain("calc.exe");
    expect(command).toBe(`start "" "${malicious}"`);
  });

  it("PORTABILITY: uses the Windows-only 'start' shell command -- will fail on Linux/macOS " +
     "and therefore inside a Linux container", async () => {
    const { POST } = await import("@/app/api/job-applications/[id]/open-file/route");
    const request = new Request("http://localhost/x/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: "C:\\some\\file.docx" }),
    });
    await POST(request);
    const [command] = execMock.mock.calls[0] as [string];
    expect(command.startsWith("start ")).toBe(true);
  });

  it("returns 400 when filePath is missing", async () => {
    const { POST } = await import("@/app/api/job-applications/[id]/open-file/route");
    const request = new Request("http://localhost/x/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(request);
    expect(res.status).toBe(400);
    expect(execMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/job-applications/[id]/open-folder", () => {
  it("SECURITY + PORTABILITY: shells out via 'explorer \"<folderPath>\"' -- unescaped " +
     "folderPath and Windows-only command (explorer.exe doesn't exist on Linux)", async () => {
    const { POST } = await import("@/app/api/job-applications/[id]/open-folder/route");
    resetJobApplications([
      { _id: "1", company: "A", jobId: "1", folderPath: `C:\\Jobs\\Acme" & calc.exe & "` },
    ]);

    const res = await POST(new Request("http://localhost/x/open-folder", { method: "POST" }), ctx("1"));
    expect(res.status).toBe(200);

    const [command] = execMock.mock.calls[0] as [string];
    expect(command).toContain("calc.exe");
    expect(command.startsWith("explorer ")).toBe(true);
  });

  it("returns 404 when the application has no folderPath", async () => {
    const { POST } = await import("@/app/api/job-applications/[id]/open-folder/route");
    resetJobApplications([{ _id: "1", company: "A", jobId: "1", folderPath: null }]);
    const res = await POST(new Request("http://localhost/x/open-folder", { method: "POST" }), ctx("1"));
    expect(res.status).toBe(404);
    expect(execMock).not.toHaveBeenCalled();
  });
});
