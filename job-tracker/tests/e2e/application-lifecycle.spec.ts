import { test, expect } from "@playwright/test";
import { uniqueJobId } from "./helpers";

// Requires a real MongoDB reachable at MONGODB_URI and a writable APPLICATIONS_ROOT.
// See docker-compose.test.yml + report for setup instructions. Cannot run in the
// sandbox this suite was authored in (no outbound MongoDB access there).

test.describe("application lifecycle", () => {
  test("create, view, edit, and change status of an application", async ({ page }) => {
    const jobId = uniqueJobId("lifecycle");
    const company = "Playwright Testing Co";

    await page.goto("/");

    await page.getByPlaceholder("Company", { exact: true }).fill(company);
    await page.getByPlaceholder("Job ID", { exact: true }).fill(jobId);
    await page.getByPlaceholder("Job Title", { exact: true }).fill("QA Engineer");
    await page.getByPlaceholder("Job URL", { exact: true }).fill("https://example.com/qa-role");
    await page.getByRole("button", { name: "Create Application" }).click();

    await expect(page.getByText("Application created successfully.")).toBeVisible();

    // New row appears in the list and gets auto-selected.
    await expect(page.getByText(company).first()).toBeVisible();
    await expect(page.getByText("QA Engineer").first()).toBeVisible();

    // The Details panel labels each field in its own "rounded-xl bg-slate-50 p-4" box
    // (Company, Job ID, Job Title, Job URL, Status, Ended On, Notes, ...). Scoping by
    // that box + its label text is what reliably finds the right control, since several
    // of these labels/values (e.g. "Company", "Status", "Active") also appear elsewhere
    // on the page (the create form above, the Applications list, the Dashboard below).
    const fieldBox = (label: string) =>
      page.locator("div.rounded-xl.bg-slate-50.p-4", { hasText: label });

    // Edit jobTitle + notes.
    await page.getByRole("button", { name: "Edit" }).click();
    await fieldBox("Job Title").locator("input").fill("Senior QA Engineer");
    await fieldBox("Notes").locator("textarea").fill("Left a note during e2e test.");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Senior QA Engineer").first()).toBeVisible();
    await expect(page.getByText("Left a note during e2e test.")).toBeVisible();

    // Status change: moving to a terminal status stamps endedAt, so the "Ended On" field
    // should switch from "Active" to a real date. (The Details panel's Status <select> is
    // one of three <select> elements on the page -- the Applications list also has a
    // status-filter dropdown and a sort-order dropdown -- so it has to be scoped too.)
    await fieldBox("Status").getByRole("combobox").selectOption({ label: "Ghosted" });
    await expect(fieldBox("Ended On")).not.toContainText("Active");
  });

  test("duplicate company + jobId is rejected with a clear error", async ({ page, request }) => {
    const jobId = uniqueJobId("dup");
    const company = "Duplicate Test Co";

    const first = await request.post("/api/job-applications", {
      data: {
        company,
        jobId,
        jobTitle: "Role",
        jobUrl: "https://example.com/dup",
        createFiles: true,
      },
    });
    expect(first.ok()).toBe(true);

    await page.goto("/");
    await page.getByPlaceholder("Company", { exact: true }).fill(company);
    await page.getByPlaceholder("Job ID", { exact: true }).fill(jobId);
    await page.getByPlaceholder("Job Title", { exact: true }).fill("Role");
    await page.getByPlaceholder("Job URL", { exact: true }).fill("https://example.com/dup");
    await page.getByRole("button", { name: "Create Application" }).click();

    await expect(page.getByText("That application already exists.")).toBeVisible();
  });
});
