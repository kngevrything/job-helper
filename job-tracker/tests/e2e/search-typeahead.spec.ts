import { test, expect } from "@playwright/test";
import { seedApplication, uniqueJobId } from "./helpers";

test.describe("search and typeahead", () => {
  test("freeform search matches text that isn't a suggestion (no forced exact match)", async ({
    page,
    request,
  }) => {
    await seedApplication(request, {
      company: "Freeform Search Corp",
      jobTitle: "Backend Engineer",
      jobUrl: "https://example.com/backend-role-unique-token",
    });

    await page.goto("/");
    // Search on a substring of the URL, which is not offered as a suggestion at all
    // (suggestions are only company/jobTitle values) -- proves search isn't limited
    // to the suggestion list.
    await page.getByPlaceholder("Search company, title, job ID, or URL").fill("unique-token");

    await expect(page.getByText("Freeform Search Corp").first()).toBeVisible();
  });

  test("typeahead suggestions appear while typing a company and clicking fills the field", async ({
    page,
    request,
  }) => {
    await seedApplication(request, { company: "Acme Suggestion Corp" });

    await page.goto("/");
    const companyInput = page.getByPlaceholder("Company", { exact: true });
    await companyInput.fill("Acme");

    // The seeded company also appears as a row in the Applications list below the
    // form, so this has to be scoped to the typeahead's own suggestion button:
    // its accessible name is just the company name, while the list row is itself
    // a <button> whose accessible name includes the jobId/title/status too.
    const suggestion = page.getByRole("button", { name: "Acme Suggestion Corp", exact: true });
    await expect(suggestion).toBeVisible();
    await suggestion.click();

    await expect(companyInput).toHaveValue("Acme Suggestion Corp");
  });

  test("typing text with no matching suggestion is still accepted (not forced to pick a match)", async ({
    page,
  }) => {
    await page.goto("/");
    const companyInput = page.getByPlaceholder("Company", { exact: true });
    const freeText = `Totally New Company ${uniqueJobId()}`;
    await companyInput.fill(freeText);
    await expect(companyInput).toHaveValue(freeText);
  });

  test("company and search inputs have browser autocomplete disabled", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Company", { exact: true })).toHaveAttribute("autocomplete", "off");
    await expect(
      page.getByPlaceholder("Search company, title, job ID, or URL")
    ).toHaveAttribute("autocomplete", "off");
  });
});
