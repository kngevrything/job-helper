import { vi, beforeEach } from "vitest";
import { resetJobApplications } from "./mocks/fakeJobApplication";

vi.mock("@/lib/db/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/JobApplication", async () => {
  return await import("./mocks/fakeJobApplication");
});

beforeEach(() => {
  resetJobApplications();
});
