import { describe, expect, it } from "vitest";
import { ECONOMIC_METRIC_DEFS, ECON_METRIC_GROUPS, ECON_PANEL_ONLY } from "./economicDefinitions";

describe("ECON_METRIC_GROUPS", () => {
  const grouped = ECON_METRIC_GROUPS.flatMap((g) => g.numbers);

  it("places every dropdown metric in exactly one group", () => {
    const dropdown = ECONOMIC_METRIC_DEFS.map((d) => d.number).filter((n) => !ECON_PANEL_ONLY.has(n));
    for (const n of dropdown) {
      expect(grouped.filter((g) => g === n), `metric ${n}`).toHaveLength(1);
    }
  });

  it("only references metrics that have a definition", () => {
    const defined = new Set(ECONOMIC_METRIC_DEFS.map((d) => d.number));
    for (const n of grouped) expect(defined.has(n), `metric ${n}`).toBe(true);
  });
});
