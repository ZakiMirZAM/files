import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  chunk,
  deckNameFromFile,
  htmlToText,
  importKind,
  parseDelimited,
  parseTextImport,
  tableToCards,
} from "./learnImport";

describe("parseDelimited", () => {
  it("handles quotes, doubled quotes and newlines inside quotes", () => {
    const rows = parseDelimited('a,"b, c"\n"line1\nline2","say ""hi"""\n', ",");
    expect(rows).toEqual([
      ["a", "b, c"],
      ["line1\nline2", 'say "hi"'],
    ]);
  });
  it("drops blank lines", () => {
    expect(parseDelimited("x\ty\n\n\nz\tw\r\n", "\t")).toEqual([
      ["x", "y"],
      ["z", "w"],
    ]);
  });
});

describe("htmlToText", () => {
  it("keeps line breaks and bullets and decodes entities", () => {
    const t = htmlToText('<ul><li style="x">One &amp; two</li><li>It&#x27;s &quot;3&quot;</li></ul><small>Src</small><br>end<img src="a.png">');
    expect(t).toBe("\u2022 One & two\n\u2022 It's \"3\"\nSrc\nend");
  });
  it("drops sound tags and scripts", () => {
    expect(htmlToText("hi [sound:a.mp3]<script>alert(1)</script>")).toBe("hi");
  });
});

describe("parseTextImport", () => {
  it("reads Anki plain-text headers", () => {
    const txt = "#separator:tab\n#html:true\n#tags column:3\nQ1<br>more\tA1\ttag1 tag2\nQ2\t<b>A2</b>\t\n";
    const t = parseTextImport(txt, "deck.txt");
    expect(t.separatorName).toBe("tab");
    expect(t.html).toBe(true);
    expect(t.tagsCol).toBe(2);
    expect(t.frontCol).toBe(0);
    expect(t.backCol).toBe(1);
    const cards = tableToCards(t);
    expect(cards).toEqual([
      { front: "Q1\nmore", back: "A1", tags: ["tag1", "tag2"] },
      { front: "Q2", back: "A2" },
    ]);
  });

  it("skips Anki notetype and deck columns", () => {
    const txt = "#separator:tab\n#notetype column:1\n#deck column:2\nBasic\tDefault\tFront\tBack\n";
    const t = parseTextImport(txt);
    expect(t.frontCol).toBe(2);
    expect(t.backCol).toBe(3);
  });

  it("reads a CSV with a header row", () => {
    const t = parseTextImport("Question,Answer,Tags\nWhat is ROIC?,Return on invested capital,metrics\n", "x.csv");
    expect(t.header).toEqual(["Question", "Answer", "Tags"]);
    expect(t.rows.length).toBe(1);
    expect(tableToCards(t)).toEqual([{ front: "What is ROIC?", back: "Return on invested capital", tags: ["metrics"] }]);
  });

  it("guesses a semicolon CSV without a header", () => {
    const t = parseTextImport("a;b\nc;d\n", "x.csv");
    expect(t.separatorName).toBe("semicolon");
    expect(tableToCards(t)).toEqual([
      { front: "a", back: "b" },
      { front: "c", back: "d" },
    ]);
  });

  it("parses a real Anki export when present", () => {
    const p = "C:/Users/Zaki_Mir/Downloads/Flashcards/damodaran_iv_ch01_core.txt";
    if (!existsSync(p)) return;
    const t = parseTextImport(readFileSync(p, "utf8"), p);
    const cards = tableToCards(t);
    expect(cards.length).toBeGreaterThan(3);
    expect(cards[0].front.length).toBeGreaterThan(10);
    expect(cards[0].back).not.toMatch(/<li|&quot;/);
    expect(cards[0].tags?.length).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("routes files by extension", () => {
    expect(importKind("a.apkg")).toBe("backend");
    expect(importKind("a.XLSX")).toBe("backend");
    expect(importKind("a.tsv")).toBe("text");
    expect(importKind("a.pdf")).toBeNull();
  });
  it("names decks and chunks lists", () => {
    expect(deckNameFromFile("damodaran_iv_ch01_core.txt")).toBe("damodaran iv ch01 core");
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
