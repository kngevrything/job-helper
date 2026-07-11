import { test, expect } from "@playwright/test";
import { uniqueJobId } from "./helpers";

test.describe("copy button feedback", () => {
  test("copy gives local inline feedback, not a global notification/toast", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.goto("/");
    await page.getByPlaceholder("Company", { exact: true }).fill("Copy Feedback Co");
    await page.getByPlaceholder("Job ID", { exact: true }).fill(uniqueJobId("copy"));
    await page.getByPlaceholder("Job Title", { exact: true }).fill("Role");
    await page.getByPlaceholder("Job URL", { exact: true }).fill("https://example.com/copy-role");
    await page.getByRole("button", { name: "Create Application" }).click();

    await expect(page.getByText("Application created successfully.")).toBeVisible();

    const copyRowButton = page.getByRole("button", { name: "Copy" }).first();
    await copyRowButton.click();

    await expect(page.getByText("Row Copied...")).toBeVisible();

    // No app-wide toast/notification region should appear -- feedback is scoped to the
    // button. Next.js's App Router always renders a route announcer for accessibility
    // (id="__next-route-announcer__", role="alert") using a visually-hidden 1x1px box --
    // it still has a non-zero bounding box, so Playwright's `:visible` counts it as
    // visible even though nothing is actually shown on screen. Exclude it by its known,
    // stable Next.js element id rather than relying on `:visible`.
    await expect(
      page.locator(
        '[role="alert"]:not(#__next-route-announcer__), [role="status"]:not(#__next-route-announcer__), .toast, .notification'
      )
    ).toHaveCount(0);

    // Feedback reverts after ~3s.
    await expect(page.getByText("Row Copied...")).toBeHidden({ timeout: 4000 });
  });
});
