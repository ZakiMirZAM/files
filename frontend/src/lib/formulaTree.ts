// Learn slice A2: the formula tree the backend builds for each comparison metric
// (backend/company_profile/formulas.py). The sidebar only draws it: every value,
// formula and substituted line arrives formatted, and backend/test_formulas.py
// proves each root equals the number in the comparison table.

import { resolveDefNumber } from "./individualDefinitions";
import { resolveComparativeDef } from "./surfaceDefinitions";

export interface FormulaNode {
  key: string;
  name: string;
  unit: string;
  value: number | null;
  /** Formatted value ("7.12%", "USD 44.00B", "0.620"). */
  display: string;
  /** Symbolic formula; null for a statement line. */
  formula: string | null;
  /** The formula with the company's numbers in place of the symbols. */
  substituted: string | null;
  /** Where a leaf comes from ("Balance sheet · FY2024"). */
  source: string | null;
  /** A limit or fallback the app applies to this value. */
  rule: string | null;
  /** Label to resolve to an existing definition (opened on a click). */
  defLabel: string | null;
  children: FormulaNode[];
}

/** The definition number for a variable, or undefined when none exists. */
export function defNumberFor(node: FormulaNode): number | undefined {
  const label = node.defLabel ?? node.name;
  return resolveDefNumber(label) ?? resolveComparativeDef(label) ?? undefined;
}
