import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { buildBaseName, buildContent, parseSalary, writeJdInboxFile } from "@/lib/jdInbox/jdInbox";

const NOW = new Date(2026, 9, 8, 9, 5, 7);

describe("parseSalary", () => {
  it.each([
    ["Base pay: $170,000 - $210,000 per year plus equity", "$170,000 - $210,000 per year"],
    ["Range $170K–$210K/yr.", "$170K–$210K/yr"],
    ["We pay $55.00 to $65.00 an hour", "$55.00 to $65.00 an hour"],
    ["Salary: $150,000 USD - $180,000 USD", "$150,000 USD - $180,000 USD"],
    ["$185,000 annually", "$185,000 annually"],
    ["The range is $120,000-$140,000, plus bonus", "$120,000-$140,000"],
  ])("finds %s", (text, expected) => {
    expect(parseSalary(text)).toBe(expected);
  });

  it("ignores bare dollar figures with no range or pay period", () => {
    expect(parseSalary("We raised $50M and have a $500 learning stipend.")).toBeNull();
  });
});

describe("buildBaseName", () => {
  it("formats timestamp_company_title and slugifies", () => {
    expect(buildBaseName({ company: "Example Co.", title: "Staff Software Engineer (Remote)" }, NOW)).toBe(
      "20261008-090507_example-co_staff-software-engineer-remote"
    );
  });

  it("keeps the full filename at or under 100 characters with a suffix", () => {
    const base = buildBaseName({ company: "A".repeat(80), title: "B".repeat(80) }, NOW);
    expect(`${base}-99.md`.length).toBeLessThanOrEqual(100);
    expect(base.startsWith("_")).toBe(false);
  });
});

describe("buildContent", () => {
  it("writes header lines, a --- line, then the description as-is", () => {
    const content = buildContent({
      company: "Example Co",
      title: "Staff Engineer",
      board: "linkedin",
      url: "https://www.linkedin.com/jobs/view/1/",
      description: "Line one\n\n- bullet\nPay: $100K - $120K/yr",
    });
    expect(content).toBe(
      "company: Example Co\ntitle: Staff Engineer\nboard: linkedin\nsalary: $100K - $120K/yr\n" +
        "url: https://www.linkedin.com/jobs/view/1/\n---\nLine one\n\n- bullet\nPay: $100K - $120K/yr\n"
    );
  });

  it("writes salary: unknown and omits url when missing", () => {
    const content = buildContent({ company: "X", title: "Y", board: "indeed", description: "No pay listed." });
    expect(content).toBe("company: X\ntitle: Y\nboard: indeed\nsalary: unknown\n---\nNo pay listed.\n");
  });
});

describe("writeJdInboxFile", () => {
  let dir: string;
  beforeEach(async () => {
    dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "jd-inbox-")), "inbox");
  });
  afterEach(async () => {
    await fs.rm(path.dirname(dir), { recursive: true, force: true });
  });

  it("creates the folder and never overwrites, appending -2, -3", async () => {
    const input = { company: "X", title: "Y", board: "linkedin", description: "d" };
    const a = await writeJdInboxFile(dir, input, NOW);
    const b = await writeJdInboxFile(dir, input, NOW);
    const c = await writeJdInboxFile(dir, input, NOW);
    expect([a, b, c]).toEqual([
      "20261008-090507_x_y.md",
      "20261008-090507_x_y-2.md",
      "20261008-090507_x_y-3.md",
    ]);
  });
});
