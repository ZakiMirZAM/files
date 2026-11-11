import { describe, expect, it } from "vitest";
import { layoutPages, mostVisiblePage, pageAtOffset, pagesInRange } from "./PdfViewer";

describe("PdfViewer layout helpers", () => {
  const heights = [100, 100, 200, 100];
  const { tops, total } = layoutPages(heights, 10, 5);

  it("stacks pages with a gap after a start offset", () => {
    expect(tops).toEqual([5, 115, 225, 435]);
    expect(total).toBe(535);
  });

  it("finds the page at an offset, including gaps and above the first page", () => {
    expect(pageAtOffset(tops, 0)).toBe(0);
    expect(pageAtOffset(tops, 110)).toBe(0);
    expect(pageAtOffset(tops, 115)).toBe(1);
    expect(pageAtOffset(tops, 10_000)).toBe(3);
    expect(pageAtOffset([], 50)).toBe(0);
  });

  it("picks the page covering most of the view", () => {
    expect(mostVisiblePage(tops, heights, 0, 100)).toBe(0);
    expect(mostVisiblePage(tops, heights, 90, 190)).toBe(1);
    expect(mostVisiblePage(tops, heights, 200, 300)).toBe(2);
    expect(mostVisiblePage(tops, heights, 400, 520)).toBe(3);
  });

  it("returns the pages overlapping a range, capped around the current page", () => {
    expect(pagesInRange(tops, heights, 120, 300, 1, 10)).toEqual([1, 2]);
    expect(pagesInRange(tops, heights, 0, 10_000, 0, 10)).toEqual([0, 3]);
    expect(pagesInRange(tops, heights, 0, 10_000, 2, 2)).toEqual([2, 3]);
    expect(pagesInRange(tops, heights, 0, 10_000, 0, 2)).toEqual([0, 1]);
  });

  it("keeps the window small on a 1,000-page book", () => {
    const many = new Array(1000).fill(1000);
    const l = layoutPages(many, 12, 12);
    const top = l.tops[498];
    const most = mostVisiblePage(l.tops, many, top, top + 1000);
    expect(most).toBe(498);
    const [f, t] = pagesInRange(l.tops, many, top - 5000, top + 6000, most, 8);
    expect(t - f + 1).toBeLessThanOrEqual(8);
    expect(f).toBeLessThanOrEqual(498);
    expect(t).toBeGreaterThanOrEqual(498);
  });
});
