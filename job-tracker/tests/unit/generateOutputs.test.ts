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

  it("excelRowText column order is [date, company, jobId, jobUrl, jobTitle], matching " +
     "the real spreadsheet header (...Company, Job ID, Link, Title...) -- " +
     "scripts/importCsv.js's generateExcelRowText was previously out of sync with this " +
     "(Title/URL swapped) and has been aligned to match", () => {
    const { excelRowText } = generateOutputs(input);
    const cols = excelRowText.split("\t");
    expect(cols[3]).toBe("https://example.com/job/1");
    expect(cols[4]).toBe("Software Engineer");
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
