import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defByNumber, resolveDefNumber } from "./individualDefinitions";
import { EM_DASH } from "./copyHygiene.test-helper";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "content", "individual");
const read = (f: string) => readFileSync(join(CONTENT, f), "utf8");
const NUMERIC = ["891-Total-Market.md", "892-Target-Operating-Margin.md",
                 "893-Stable-Growth-Rate.md", "894-Chance-The-Story-Ends.md"];

describe("story valuation definitions", () => {
  it("registers 890-894 in the storyValuation band", () => {
    for (const n of [890, 891, 892, 893, 894]) expect(defByNumber(n)?.section).toBe("storyValuation");
  });
  it("resolves every label the story surfaces print", () => {
    expect(resolveDefNumber("How a story becomes a value")).toBe(890);
    expect(resolveDefNumber("Total market")).toBe(891);
    expect(resolveDefNumber("Target operating margin")).toBe(892);
    expect(resolveDefNumber("Stable growth rate")).toBe(893);
    expect(resolveDefNumber("Chance the story ends")).toBe(894);
    expect(resolveDefNumber("Return on capital after growth ends")).toBe(880);
  });
  it("fixes the two labels that did not open their definitions", () => {
    expect(resolveDefNumber("Tax rate (effective)")).toBe(852);
    expect(resolveDefNumber("Cost of capital")).toBe(183);
  });
  it("leaves existing resolutions alone", () => {
    expect(resolveDefNumber("WACC")).toBe(183);
    expect(resolveDefNumber("Sales-to-capital")).toBe(520);
    expect(resolveDefNumber("Operating margin")).toBe(39);
  });
  it("numeric definitions have exactly Parts 1 to 9", () => {
    for (const f of NUMERIC) {
      const parts = read(f).match(/^## Part (\d+):/gm)?.map((h) => h.replace(/\D/g, ""));
      expect(parts, f).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    }
  });
  it("the overview uses the concept format", () => {
    const md = read("890-How-A-Story-Becomes-A-Value.md");
    for (const h of ["## What it is", "## How this section works", "## Why it matters", "## Common traps"])
      expect(md).toContain(h);
  });
  it("house copy rules hold in every new file", () => {
    for (const f of ["890-How-A-Story-Becomes-A-Value.md", ...NUMERIC]) {
      const md = read(f);
      expect(md.includes(EM_DASH), f).toBe(false);
      expect(md, f).not.toMatch(/[“”‘’]/);
      expect(md, f).not.toMatch(/Damodaran|Porter|Mauboussin|Rappaport|Helmer|Dorsey|Besanko|Penman/);
    }
  });
});
