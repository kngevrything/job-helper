import { test, expect } from "@playwright/test";
import { seedApplication, uniqueJobId } from "./helpers";

// Seeds enough applications to exercise the "300+ entries" dense-UI target this
// app is designed for. Defaults to a smaller number for a fast local run;
// set SEED_COUNT=300 to match the real target before a release check.
const SEED_COUNT = Number(process.env.SEED_COUNT ?? 60);

test.describe("dense list rendering", () => {
  test(`renders and filters correctly with ${SEED_COUNT} seeded applications`, async ({
    page,
    request,
  }) => {
    test.setTimeout(SEED_COUNT * 1000 + 30_000);

    // Other spec files in this run create their own applications too (global-setup.ts
    // only wipes the DB once, at the very start of the whole suite) -- so the expected
    // total has to be measured against a baseline taken right before seeding, not an
    // absolute number.
    const before = await request.get("/api/job-applications");
    const baseline = (await before.json()).data.length as number;

    for (let i = 0; i < SEED_COUNT; i++) {
      await seedApplication(request, {
        company: `Dense Co ${i % 10}`,
        jobId: uniqueJobId(`dense-${i}`),
        jobTitle: i % 3 === 0 ? "Special Role" : "Regular Role",
      });
    }

    await page.goto("/");

    const expectedTotal = baseline + SEED_COUNT;
    await expect(page.getByText(`Total ${expectedTotal}`, { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    // Filtering should still narrow the visible list correctly at this volume.
    await page.getByPlaceholder("Search company, title, job ID, or URL").fill("Special Role");
    const rows = page.locator('button:has-text("Special Role")');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(SEED_COUNT);
  });
});
