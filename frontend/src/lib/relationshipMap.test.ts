import { describe, expect, it } from "vitest";
import {
  GROUP_ORDER,
  droppedText,
  footerText,
  groupCategories,
  isPending,
  isSuggestionGroup,
  linkDataLabel,
  mapRivalOptions,
  safeHref,
  type RelationshipMapResponse,
} from "./relationshipMap";

const link = (over: Record<string, unknown>) => ({
  name: "Rival Co",
  product: "widgets",
  source: { title: "10-K", url: "https://example.com/10k" },
  ...over,
});

const ready: RelationshipMapResponse = {
  status: "ready",
  ticker: "AAA",
  builtAt: "2026-10-01T00:00:00Z",
  groups: {
    competitors: [
      {
        category: "Direct",
        links: [
          link({ name: "B Inc", resolvedTicker: "bbb", inDatabase: true }),
          link({ name: "Private Co", resolvedTicker: null, inDatabase: false }),
          link({ name: "Self", resolvedTicker: "AAA", inDatabase: true }),
          link({ name: "B again", resolvedTicker: "BBB", inDatabase: true }),
          link({ name: "Foreign", resolvedTicker: "FFF", inDatabase: false }),
        ],
      },
      { category: "Other", links: [link({ name: "C Corp", resolvedTicker: "CCC", inDatabase: true })] },
    ],
  },
};

describe("group order and labels", () => {
  it("lists the five groups in the owner's order", () => {
    expect(GROUP_ORDER.map((g) => g.label)).toEqual([
      "Competitors",
      "Substitutes",
      "Suppliers",
      "Customers",
      "Potential entrants",
    ]);
  });
  it("marks only substitutes and entrants as suggestions", () => {
    expect(GROUP_ORDER.filter((g) => isSuggestionGroup(g.key)).map((g) => g.key)).toEqual([
      "substitutes",
      "entrants",
    ]);
  });
  it("labels links with no figures", () => {
    expect(linkDataLabel(link({ inDatabase: false }))).toBe("no financial data");
    expect(linkDataLabel(link({}))).toBe("no financial data");
    expect(linkDataLabel(link({ inDatabase: true }))).toBeNull();
  });
});

describe("safeHref", () => {
  it("keeps http and https only", () => {
    expect(safeHref("https://sec.gov/x")).toBe("https://sec.gov/x");
    expect(safeHref("http://a.com")).toBe("http://a.com");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("//evil.com")).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});

describe("groupCategories", () => {
  it("accepts a list or an object with categories and drops empty ones", () => {
    const cats = [{ category: "A", links: [link({})] }, { category: "B", links: [] }];
    expect(groupCategories(cats).map((c) => c.category)).toEqual(["A"]);
    expect(groupCategories({ suggestion: true, categories: cats }).map((c) => c.category)).toEqual(["A"]);
    expect(groupCategories(undefined)).toEqual([]);
  });
});

describe("mapRivalOptions", () => {
  it("takes in-database competitors by resolved ticker, deduped, base excluded", () => {
    expect(mapRivalOptions(ready, "aaa")).toEqual([
      { ticker: "BBB", name: "B Inc" },
      { ticker: "CCC", name: "C Corp" },
    ]);
  });
  it("is empty unless the map is ready", () => {
    expect(mapRivalOptions({ ...ready, status: "building" }, "AAA")).toEqual([]);
    expect(mapRivalOptions(null, "AAA")).toEqual([]);
  });
});

describe("status and footer text", () => {
  it("polls only while building or busy", () => {
    expect(isPending("building")).toBe(true);
    expect(isPending("busy")).toBe(true);
    expect(isPending("ready")).toBe(false);
    expect(isPending("none")).toBe(false);
    expect(isPending(undefined)).toBe(false);
  });
  it("words the footer and the dropped count", () => {
    expect(footerText("2026-10-01T00:00:00Z")).toMatch(
      /^Built .+ by Ask AI from filings and online sources\. Every link shows its source\.$/,
    );
    expect(footerText("not a date")).toContain("Built recently");
    expect(droppedText(0)).toBeNull();
    expect(droppedText(undefined)).toBeNull();
    expect(droppedText(3)).toBe("3 links were left out because they had no source.");
  });
});

describe("map v2 fields and suggestions", () => {
  it("shows only the link's own group fields, labeled, skipping empty ones", async () => {
    const { linkFieldLines } = await import("./relationshipMap");
    const l = link({ switchingCost: "loses tooling, gains price", trend: "  ", strategy: "brand vs price" });
    expect(linkFieldLines(l, "substitutes", "Acme")).toEqual([
      { label: "Switching cost", text: "loses tooling, gains price" },
    ]);
    expect(linkFieldLines(l, "competitors", "Acme")).toEqual([{ label: "Strategy", text: "brand vs price" }]);
    const e = link({ costOfCopying: "its dealer margin" });
    expect(linkFieldLines(e, "entrants", "Acme")).toEqual([
      { label: "What Acme would lose by copying it", text: "its dealer margin" },
    ]);
  });

  it("names the rebuild reason in one line", async () => {
    const { rebuildReasonText } = await import("./relationshipMap");
    expect(rebuildReasonText("new annual filing")).toBe("A new annual filing is available.");
    expect(rebuildReasonText("new prompt")).toBe("The map can be rebuilt with fuller questions.");
    expect(rebuildReasonText(null)).toBeNull();
  });

  it("stops polling on a result and gives up at 30 polls", async () => {
    const { suggestionNext, SUGGEST_MAX_POLLS } = await import("./relationshipMap");
    expect(SUGGEST_MAX_POLLS).toBe(30);
    expect(suggestionNext("checking", 0)).toBe("poll");
    expect(suggestionNext("checking", 29)).toBe("poll");
    expect(suggestionNext("checking", 30)).toBe("give-up");
    expect(suggestionNext("added", 3)).toBe("done");
    expect(suggestionNext("not-added", 0)).toBe("done");
    expect(suggestionNext("failed", 0)).toBe("done");
  });

  it("builds the fallback question and the added line", async () => {
    const { suggestFallbackQuestion, addedText } = await import("./relationshipMap");
    expect(suggestFallbackQuestion("Beta Co", "Acme")).toBe(
      "Where, if anywhere, does Beta Co fit in Acme's competitors, substitutes, suppliers, customers or potential entrants? Explain the business relationship and cite sources.",
    );
    expect(addedText("entrants", "Cloud platforms")).toBe("Added under Potential entrants: Cloud platforms.");
  });

  it("cleans the reader's input", async () => {
    const { cleanSuggestName } = await import("./relationshipMap");
    expect(cleanSuggestName("  Beta\u0000 Co\n ")).toBe("Beta  Co");
    expect(cleanSuggestName("x".repeat(200))).toHaveLength(120);
  });

  it("stamps a map by updatedAt, else builtAt", async () => {
    const { mapStamp } = await import("./relationshipMap");
    expect(mapStamp({ status: "ready", builtAt: "a", updatedAt: "b" })).toBe("b");
    expect(mapStamp({ status: "ready", builtAt: "a" })).toBe("a");
    expect(mapStamp(null)).toBe("");
  });
});
