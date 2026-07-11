import { describe, it, expect } from "vitest";
import { PATCH } from "@/app/api/job-applications/[id]/status/route";
import { resetJobApplications } from "../mocks/fakeJobApplication";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(status: unknown) {
  return new Request("http://localhost/api/job-applications/x/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

describe("PATCH /api/job-applications/[id]/status", () => {
  it("setting a terminal status stamps endedAt", async () => {
    resetJobApplications([{ _id: "1", company: "A", jobId: "1", status: "Applied", endedAt: null }]);
    const res = await PATCH(req("Ghosted"), ctx("1"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.status).toBe("Ghosted");
    expect(json.data.endedAt).not.toBeNull();
  });

  it("moving from a terminal status back to a non-terminal one clears endedAt", async () => {
    resetJobApplications([
      { _id: "1", company: "A", jobId: "1", status: "Ghosted", endedAt: new Date("2024-01-01") },
    ]);
    const res = await PATCH(req("1st Round Scheduled"), ctx("1"));
    const json = await res.json();
    expect(json.data.status).toBe("1st Round Scheduled");
    expect(json.data.endedAt).toBeNull();
  });

  it("rejects an unknown status with 400 and leaves the record unchanged", async () => {
    resetJobApplications([{ _id: "1", company: "A", jobId: "1", status: "Applied", endedAt: null }]);
    const res = await PATCH(req("Not A Real Status"), ctx("1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent id", async () => {
    resetJobApplications([]);
    const res = await PATCH(req("Applied"), ctx("missing"));
    expect(res.status).toBe(404);
  });
});
