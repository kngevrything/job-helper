import { describe, it, expect } from "vitest";
import { isJobBoardUrl, normalizeJobTitle, jobTitlesMatch } from "@/lib/jobMatching";

describe("isJobBoardUrl", () => {
  it("detects job boards including subdomains", () => {
    expect(isJobBoardUrl("https://www.linkedin.com/jobs/view/4012345678")).toBe(true);
    expect(isJobBoardUrl("https://www.indeed.com/viewjob?jk=abc")).toBe(true);
    expect(isJobBoardUrl("https://uk.indeed.com/viewjob?jk=abc")).toBe(true);
  });

  it("does not treat ATS or company career sites as boards", () => {
    expect(isJobBoardUrl("https://job-boards.greenhouse.io/acme/jobs/123")).toBe(false);
    expect(isJobBoardUrl("https://jobs.lever.co/acme/abc")).toBe(false);
    expect(isJobBoardUrl("https://adobe.wd5.myworkdayjobs.com/en-US/x/job/R1")).toBe(false);
    expect(isJobBoardUrl("https://jobs.careers.microsoft.com/global/en/job/1")).toBe(false);
  });

  it("does not match lookalike hosts", () => {
    expect(isJobBoardUrl("https://notlinkedin.com/jobs/1")).toBe(false);
  });

  it("returns false for empty or invalid input", () => {
    expect(isJobBoardUrl("")).toBe(false);
    expect(isJobBoardUrl(null)).toBe(false);
    expect(isJobBoardUrl("not a url")).toBe(false);
  });
});

describe("normalizeJobTitle / jobTitlesMatch", () => {
  it("ignores case, punctuation, separators and common abbreviations", () => {
    expect(normalizeJobTitle("Sr. Software Engineer, Payments")).toBe("senior software engineer payments");
    expect(jobTitlesMatch("Sr. Software Engineer, Payments", "Senior Software Engineer - Payments")).toBe(true);
    expect(jobTitlesMatch("Senior SW Engineer | Payments", "senior software engineer — payments")).toBe(true);
  });

  it("keeps team suffixes significant", () => {
    expect(jobTitlesMatch("Software Engineer - Payments", "Software Engineer - Identity")).toBe(false);
    expect(jobTitlesMatch("Software Engineer", "Software Engineer - Payments")).toBe(false);
  });

  it("keeps levels significant", () => {
    expect(jobTitlesMatch("Software Engineer II", "Software Engineer III")).toBe(false);
    expect(jobTitlesMatch("Staff Software Engineer", "Senior Software Engineer")).toBe(false);
  });

  it("never matches empty titles", () => {
    expect(jobTitlesMatch("", "")).toBe(false);
    expect(jobTitlesMatch(null, undefined)).toBe(false);
  });
});
