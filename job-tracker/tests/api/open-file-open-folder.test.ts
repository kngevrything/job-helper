import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetJobApplications } from "../mocks/fakeJobApplication";

const execFileMock = vi.fn(
  (_cmd: string, _args: string[], cb?: (err: unknown) => void) => {
    if (cb) cb(null);
  }
);

vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...(args as [string, string[]])),
}));

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  execFileMock.mockClear();
});

describe("POST /api/job-applications/[id]/open-file", () => {
  it("SECURITY FIX: uses execFile with an argument array (no shell involved), so a " +
     "malicious filePath can't break out into additional commands -- it's passed as " +
     "a single, literal argv element rather than shell-interpreted text", async () => {
    const { POST } = await import("@/app/api/job-applications/[id]/open-file/route");

    const malicious = `C:\\legit.docx" & calc.exe & "`;
    const request = new Request("http://localhost/x/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: malicious }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [command, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(command).toBe("cmd.exe");
    // The payload is one array element among several -- never concatenated into
    // a single shell-parsed string, so "& calc.exe &" has no special meaning.
    expect(args).toEqual(["/c", "start", "", malicious]);
  });

  it("PORTABILITY (deliberately unfixed, see TESTING_REPORT.md): still uses " +
     "Windows-only commands (cmd.exe / start) -- will fail on Linux/macOS and " +
     "therefore inside a Linux container. A container-portable HTTP-download " +
     "replacement was tried and reverted because it broke the 'edit in place' " +
     "workflow this app is built around.", async () => {
    const { POST } = await import("@/app/api/job-applications/[id]/open-file/route");
    const request = new Request("http://localhost/x/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: "C:\\some\\file.docx" }),
    });
    await POST(request);
    const [command] = execFileMock.mock.calls[0] as [string, string[]];
    expect(command).toBe("cmd.exe");
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
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/job-applications/[id]/open-folder", () => {
  it("SECURITY FIX: uses execFile with an argument array (no shell) to launch " +
     "explorer.exe directly -- a malicious folderPath is inert", async () => {
    const { POST } = await import("@/app/api/job-applications/[id]/open-folder/route");
    const malicious = `C:\\Jobs\\Acme" & calc.exe & "`;
    resetJobApplications([
      { _id: "1", company: "A", jobId: "1", folderPath: malicious },
    ]);

    const res = await POST(new Request("http://localhost/x/open-folder", { method: "POST" }), ctx("1"));
    expect(res.status).toBe(200);

    const [command, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(command).toBe("explorer.exe");
    expect(args).toEqual([malicious]);
  });

  it("returns 404 when the application has no folderPath", async () => {
    const { POST } = await import("@/app/api/job-applications/[id]/open-folder/route");
    resetJobApplications([{ _id: "1", company: "A", jobId: "1", folderPath: null }]);
    const res = await POST(new Request("http://localhost/x/open-folder", { method: "POST" }), ctx("1"));
    expect(res.status).toBe(404);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

// Note: GET /api/job-applications/[id]/file was a container-portable
// HTTP-download replacement for open-file's shell-exec approach, tried and
// reverted (see TESTING_REPORT.md), then deleted outright along with this
// suite's coverage of it.
