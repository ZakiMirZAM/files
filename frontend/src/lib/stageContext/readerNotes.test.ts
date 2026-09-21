// The reader's earlier conclusions, as the block carries them.
//
// Everything here is the pure half: the Convex read happens in React, at click
// time, and hands these rows over.

import { describe, expect, it } from "vitest";
import { decodeReasonedRating } from "../../components/ReasonedRating";
import {
  formatReaderNotes,
  isNoteQuestion,
  isSynthesis,
  labelFor,
  splitRating,
  type SavedAnswerRow,
} from "./readerNotes";

function row(
  section: string,
  questionId: string,
  answer: string,
  updatedAt = 0,
): SavedAnswerRow {
  return { section, scopeKey: "Semiconductors", questionId, answer, updatedAt };
}

describe("which saved answers are earlier conclusions", () => {
  it("keeps the connect decks, the economic verdict and the five forces", () => {
    expect(isNoteQuestion("economic", "econ.verdict.phase")).toBe(true);
    expect(isNoteQuestion("credit", "credit.connect.rates")).toBe(true);
    expect(isNoteQuestion("sector", "sec.connect.readings")).toBe(true);
    expect(isNoteQuestion("industry", "ind.connect.structure")).toBe(true);
    expect(isNoteQuestion("industry", "ind.forces.entry.rating")).toBe(true);
    expect(isNoteQuestion("comparative", "comp.connect.valuation")).toBe(true);
  });

  it("leaves out every other deck in the same scopes", () => {
    // The metric question banks, the integrity checks and the understanding
    // decks live under the same section and scope and would crowd out the
    // syntheses this is for.
    expect(isNoteQuestion("industry", "integrity-margin-drift")).toBe(false);
    expect(isNoteQuestion("industry", "ind.define.what")).toBe(false);
    expect(isNoteQuestion("economic", "econ.understand.regime")).toBe(false);
    expect(isNoteQuestion("individual", "indiv.connect.peers")).toBe(false);
  });

  it("knows which answers are a stage's closing account", () => {
    expect(isSynthesis("sec.connect.synthesis")).toBe(true);
    expect(isSynthesis("ind.forces.account")).toBe(true);
    expect(isSynthesis("sec.connect.readings")).toBe(false);
  });
});

describe("the rating a reader saved with their reasoning", () => {
  it("splits it the same way ReasonedRating does", () => {
    const cases = [
      "entry is hard || 4",
      "no rating here",
      "a reason with || inside it || 2",
      "out of range || 9",
      "",
    ];
    for (const raw of cases) {
      expect(splitRating(raw), raw).toEqual(decodeReasonedRating(raw));
    }
  });
});

describe("the words in front of one answer", () => {
  it("names the stage and what was answered", () => {
    expect(labelFor(row("sector", "sec.connect.score_vs_matrix", "x"))).toBe(
      "Sector stage, score vs matrix",
    );
    expect(labelFor(row("economic", "econ.verdict.phase", "x"))).toBe("Economic stage, phase");
    expect(labelFor(row("industry", "ind.forces.buyers.rating", "x"))).toBe(
      "Industry stage, five forces, bargaining power of buyers",
    );
    expect(labelFor(row("industry", "ind.forces.account", "x"))).toBe(
      "Industry stage, five forces, the reader's account",
    );
  });
});

describe("the block's READER'S EARLIER CONCLUSIONS body", () => {
  it("never includes the answer to the question being asked", () => {
    const rows = [
      row("industry", "ind.connect.structure", "my half-written draft"),
      row("industry", "ind.connect.groups", "the groups are two"),
    ];
    const text = formatReaderNotes(rows, "ind.connect.structure");
    expect(text).not.toContain("my half-written draft");
    expect(text).toContain("the groups are two");
  });

  it("puts the syntheses first, then the most recently edited", () => {
    const rows = [
      row("sector", "sec.connect.readings", "oldest", 1),
      row("sector", "sec.connect.credit", "newest", 9),
      row("sector", "sec.connect.synthesis", "the whole account", 2),
    ];
    const lines = formatReaderNotes(rows).split("\n");
    expect(lines[0]).toContain("the whole account");
    expect(lines[1]).toContain("newest");
    expect(lines[2]).toContain("oldest");
  });

  it("carries the rating beside the reasoning it was given for", () => {
    const text = formatReaderNotes([
      row("industry", "ind.forces.entry.rating", "plants cost billions || 4"),
    ]);
    expect(text).toBe(
      "Industry stage, five forces, threat of entry (the reader rated it 4 out of 5): " +
        "plants cost billions",
    );
  });

  it("folds an answer to one line of plain text", () => {
    const text = formatReaderNotes([row("sector", "sec.connect.readings", "one\n\ntwo   three")]);
    expect(text).toBe("Sector stage, readings: one two three");
  });

  it("drops the answers that do not fit and keeps the ones that do", () => {
    const rows = [
      row("sector", "sec.connect.synthesis", "K".repeat(400), 1),
      row("sector", "sec.connect.readings", "L".repeat(400), 2),
      row("sector", "sec.connect.credit", "M".repeat(400), 3),
    ];
    const text = formatReaderNotes(rows, undefined, 500);
    expect(text.length).toBeLessThanOrEqual(500);
    // The synthesis is first in the order, so it is the one that survives.
    expect(text).toContain("K".repeat(400));
    expect(text).not.toContain("L".repeat(400));
  });

  it("is empty when the reader has written nothing", () => {
    expect(formatReaderNotes([])).toBe("");
    expect(formatReaderNotes([row("sector", "sec.connect.readings", "   ")])).toBe("");
  });
});
