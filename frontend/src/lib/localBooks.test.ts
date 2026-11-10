import { describe, expect, it } from "vitest";
import { formatSize, localBookUrl, shelfRows, type LocalBook, type ShelfBookRef } from "./localBooks";

const local: LocalBook[] = [
  { id: "27598267.pdf", name: "27598267.pdf", size: 48_733_964 },
  { id: "sub/Good Strategy.pdf", name: "Good Strategy.pdf", size: 2048 },
  { id: "Lean Startup.pdf", name: "Lean Startup.pdf", size: 10 },
];

const saved: ShelfBookRef[] = [
  { _id: "a", fileName: "27598267.PDF", localPath: null, noteCount: 89 },
  { _id: "b", fileName: "Good Strategy.pdf", localPath: "sub/Good Strategy.pdf", noteCount: 4 },
];

describe("shelfRows", () => {
  it("matches a shelf book by path and an uploaded book by file name", () => {
    const rows = shelfRows(local, saved);
    expect(rows.map((r) => r.saved?._id ?? null)).toEqual(["a", "b", null]);
  });

  it("does not match a shelf book to another folder's book of the same name", () => {
    const rows = shelfRows([{ id: "other/Good Strategy.pdf", name: "Good Strategy.pdf", size: 1 }], saved);
    expect(rows[0].saved).toBeNull();
  });
});

describe("helpers", () => {
  it("encodes the id in the file URL", () => {
    expect(localBookUrl("sub/A & B.pdf")).toContain("id=sub%2FA%20%26%20B.pdf");
  });

  it("formats sizes", () => {
    expect(formatSize(48_733_964)).toBe("46.5 MB");
    expect(formatSize(2048)).toBe("2 KB");
  });
});
