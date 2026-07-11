import { describe, it, expect } from "vitest";
import { PATCH } from "@/app/api/job-applications/[id]/route";
import { resetJobApplications } from "../mocks/fakeJobApplication";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(body: unknown) {
  return new Request("http://localhost/api/job-applications/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/job-applications/[id]", () => {
  it("updates jobTitle, jobUrl, and notes", async () => {
    resetJobApplications([{ _id: "1", company: "A", jobId: "1", jobTitle: "Old", jobUrl: "https://old.example.com", notes: "" }]);
    const res = await PATCH(
      req({ jobTitle: "New Title", jobUrl: "https://new.example.com", notes: "hi" }),
      ctx("1")
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.jobTitle).toBe("New Title");
    expect(json.data.jobUrl).toBe("https://new.example.com");
    expect(json.data.notes).toBe("hi");
  });

  it("returns 404 for a non-existent id", async () => {
    resetJobApplications([]);
    const res = await PATCH(
      req({ jobTitle: "T", jobUrl: "https://example.com", notes: "" }),
      ctx("does-not-exist")
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid jobUrl", async () => {
    resetJobApplications([{ _id: "1", company: "A", jobId: "1" }]);
    const res = await PATCH(req({ jobTitle: "T", jobUrl: "nope", notes: "" }), ctx("1"));
    expect(res.status).toBe(400);
  });

  it("does not allow changing company or jobId (not in the update schema)", async () => {
    resetJobApplications([{ _id: "1", company: "A", jobId: "1" }]);
    const res = await PATCH(
      req({ jobTitle: "T", jobUrl: "https://example.com", notes: "", company: "Hacked" }),
      ctx("1")
    );
    const json = await res.json();
    expect(json.data.company).toBe("A");
  });

  it("allows notes to be an empty string but rejects a missing jobTitle", async () => {
    resetJobApplications([{ _id: "1", company: "A", jobId: "1" }]);
    const res = await PATCH(req({ jobTitle: "", jobUrl: "https://example.com", notes: "" }), ctx("1"));
    expect(res.status).toBe(400);
  });
});
