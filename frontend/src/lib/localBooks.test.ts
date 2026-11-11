import { describe, expect, it } from "vitest";
import { bookTitle, matchBooks, mentionAt, type LocalBook } from "./localBooks";

const books: LocalBook[] = [
  { id: "a.pdf", name: "dokumen.pub_investment-valuation-university-edition.pdf", size: 1 },
  { id: "b.pdf", name: "Investment Valuation 3rd.pdf", size: 1 },
  { id: "c.pdf", name: "Good strategy, bad strategy.pdf", size: 1 },
];

describe("matchBooks", () => {
  it("matches every typed word, hyphens and spaces alike, title-start first", () => {
    expect(matchBooks(books, "investment valuation").map((b) => b.id)).toEqual(["b.pdf", "a.pdf"]);
    expect(matchBooks(books, "strategy").map((b) => b.id)).toEqual(["c.pdf"]);
    expect(matchBooks(books, "zebra")).toEqual([]);
  });
});

describe("mentionAt", () => {
  it("finds the @ query at the caret", () => {
    const t = "Explain chapter 1 of @invest";
    expect(mentionAt(t, t.length)).toEqual({ start: 21, query: "invest" });
  });

  it("ignores an @ inside a word or with no @", () => {
    expect(mentionAt("mail me@home", 12)).toBeNull();
    expect(mentionAt("no mention", 10)).toBeNull();
  });
});

it("mentionLabel makes download-site names readable", async () => {
  const { mentionLabel } = await import("../components/AiChat");
  expect(mentionLabel({ name: "dokumen.pub_investment-valuation-university-edition-tools-and-techniques-for.pdf" })).toBe(
    "investment valuation university edition tools and",
  );
  expect(mentionLabel({ name: "_OceanofPDFcom_Principles_for_Success_-_Ray_Dalio.pdf" })).toBe("Principles for Success Ray Dalio");
  expect(mentionLabel({ name: "Good strategy, bad strategy _ the difference -- Richard Rumelt.pdf" })).toBe(
    "Good strategy, bad strategy the difference",
  );
});

it("bookTitle drops .pdf", () => {
  expect(bookTitle("Good strategy.PDF")).toBe("Good strategy");
});
