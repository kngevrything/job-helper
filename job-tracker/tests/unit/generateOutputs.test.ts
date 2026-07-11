import { describe, it, expect } from "vitest";
import { generateOutputs } from "@/lib/prompts/generateOutputs";

describe("generateOutputs", () => {
  const input = {
    company: "  Acme Corp  ",
    jobId: " 12345 ",
    jobTitle: " Software Engineer ",
    jobUrl: " https://example.com/job/1 ",
  };

  it("trims all fields", () => {
    const { excelRowText } = generateOutputs(input);
    expect(excelRowText).not.toMatch(/ {2,}/);
    expect(excelRowText.split("\t")).toEqual([
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      "Acme Corp",
      "12345",
      "https://example.com/job/1",
      "Software Engineer",
    ]);
  });

  it("BUG: excelRowText column order is [date, company, jobId, jobUrl, jobTitle] here, " +
     "but scripts/importCsv.js's generateExcelRowText produces [date, company, jobId, jobTitle, jobUrl] " +
     "-- URL and Title are swapped between the live app and the import script", () => {
    const { excelRowText } = generateOutputs(input);
    const cols = excelRowText.split("\t");
    // Column index 3 in the app's output is the URL...
    expect(cols[3]).toBe("https://example.com/job/1");
    // ...but scripts/importCsv.js would put the Job Title there instead.
    // If these two ever need to produce interchangeable Excel rows, this is a real inconsistency.
  });

  it("starterPromptText includes company and job title", () => {
    const { starterPromptText } = generateOutputs(input);
    expect(starterPromptText).toContain("Acme Corp");
    expect(starterPromptText).toContain("Software Engineer");
  });

  it("today's date in excelRowText matches current UTC date", () => {
    const { excelRowText } = generateOutputs(input);
    const today = new Date().toISOString().split("T")[0];
    expect(excelRowText.startsWith(today)).toBe(true);
  });
});
