import type { APIRequestContext } from "@playwright/test";

let counter = 0;

export function uniqueJobId(prefix = "e2e") {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function seedApplication(
  request: APIRequestContext,
  overrides: Partial<{
    company: string;
    jobId: string;
    jobTitle: string;
    jobUrl: string;
  }> = {}
) {
  const body = {
    company: overrides.company ?? "Seed Co",
    jobId: overrides.jobId ?? uniqueJobId(),
    jobTitle: overrides.jobTitle ?? "Seed Role",
    jobUrl: overrides.jobUrl ?? "https://example.com/seed",
    createFiles: true,
  };

  const res = await request.post("/api/job-applications", { data: body });
  if (!res.ok()) {
    throw new Error(`Seed failed (${res.status()}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.data;
}
