// Learn slice A3: formula trees for the DCF section's own WACC and ROIC. Built
// only from the numbers the valuation itself used (waccBuild from compute_wacc,
// roicBuild from _valuation_roic_parts), so every value matches its tile. The
// DCF's WACC differs from the chart and comparison-table WACCs: it adds the
// operating-lease debt, uses current rates and (when on) the bottom-up beta.

import type { RoicBuild, WaccBuild } from "./types";
import type { FormulaNode } from "./formulaTree";

const MINUS = "−";
type Fmt = (v: number | null | undefined) => string;

const pct: Fmt = (v) => (v == null ? "n/a" : `${v < 0 ? MINUS : ""}${Math.abs(v * 100).toFixed(2)}%`);
const num = (v: number | null | undefined, d = 3) => (v == null ? "n/a" : v.toFixed(d));

function node(
  key: string,
  name: string,
  value: number | null,
  display: string,
  extra: Partial<FormulaNode> = {},
): FormulaNode {
  return {
    key, name, unit: "", value, display,
    formula: null, substituted: null, source: null, rule: null, defLabel: name, children: [],
    ...extra,
  };
}

/** The DCF's cost of equity: rf + β × ERP, from the valuation's own inputs. */
export function dcfCostOfEquityTree(b: WaccBuild): FormulaNode {
  const rf = node("rf", "Risk-free rate (rf)", b.riskFreeRate, pct(b.riskFreeRate), { defLabel: "Risk-Free Rate" });
  const erp = node("erp", "Equity risk premium (ERP)", b.equityRiskPremium, pct(b.equityRiskPremium), {
    defLabel: "Equity Risk Premium",
  });
  // Show the bottom-up build only when it IS the beta the valuation used: in
  // BETA_RESOLVER=shadow mode the metadata is attached but the regression beta
  // is used, and a relevered beta outside [0.2, 3.0] is clamped
  // (backend/betas/bottom_up.py).
  const tm = b.marginalTaxRate ?? 0.21;
  const relevered =
    b.betaUnlevered != null && b.betaDeRatio != null ? b.betaUnlevered * (1 + (1 - tm) * b.betaDeRatio) : null;
  const clamped = relevered == null ? null : Math.max(0.2, Math.min(3.0, relevered));
  const bottomUp =
    !!b.betaMethod && b.betaMethod.startsWith("bottom_up") && b.beta != null && clamped != null &&
    Math.abs(clamped - b.beta) < 0.0015;
  const wasClamped = bottomUp && relevered != null && clamped !== relevered;
  const betaKids = bottomUp
    ? [
        node("bu", "Unlevered industry beta (βu)", b.betaUnlevered ?? null, num(b.betaUnlevered)),
        node("de", "Debt to equity (D/E)", b.betaDeRatio ?? null, num(b.betaDeRatio)),
      ]
    : [];
  const beta = node("beta", bottomUp ? "Beta (β, bottom-up)" : "Beta (β)", b.beta, num(b.beta), {
    defLabel: "Beta",
    ...(bottomUp
      ? {
          formula: `βu × (1 + (1 ${MINUS} t) × D/E)`,
          // Hamada relevering at the marginal tax rate (backend/betas/formulas.py).
          substituted: wasClamped
            ? `max(0.2, min(3.0, ${num(b.betaUnlevered)} × (1 + (1 ${MINUS} ${pct(tm)}) × ${num(b.betaDeRatio)})))`
            : `${num(b.betaUnlevered)} × (1 + (1 ${MINUS} ${pct(tm)}) × ${num(b.betaDeRatio)})`,
          rule: wasClamped ? "Limited to 0.2 to 3.0." : null,
          children: betaKids,
        }
      : {}),
  });
  return node("costOfEquity", "Cost of equity (Ke)", b.costOfEquity, pct(b.costOfEquity), {
    defLabel: "Cost of Equity",
    formula: "rf + β × ERP",
    // With no beta, compute_wacc's CAPM call returns the flat default rate.
    substituted: b.beta == null
      ? `${pct(b.costOfEquity)} default rate (no beta)`
      : `${pct(b.riskFreeRate)} + ${num(b.beta)} × ${pct(b.equityRiskPremium)}`,
    children: [rf, beta, erp],
  });
}

/** The DCF's after-tax cost of debt, from the synthetic rating. */
export function dcfCostOfDebtTree(b: WaccBuild): FormulaNode {
  const cov = node("coverage", "Interest coverage", b.interestCoverage,
    b.interestCoverage == null ? "n/a" : `${b.interestCoverage.toFixed(2)}x`, {
      defLabel: "Interest Coverage",
      formula: "Operating Income ÷ |Interest Expense|",
    });
  const spread = b.costOfDebtPretax == null ? null : b.costOfDebtPretax - b.riskFreeRate;
  const pre = node("pretax", "Pre-tax cost of debt", b.costOfDebtPretax, pct(b.costOfDebtPretax), {
    defLabel: "Cost of Debt",
    formula: b.interestCoverage == null
      ? "rf + fallback spread (no interest expense to rate)"
      : "rf + default spread (from the interest coverage rating)",
    substituted: `${pct(b.riskFreeRate)} + ${pct(spread)}`,
    children: [cov],
  });
  const tm = b.marginalTaxRate ?? null;
  return node("costOfDebtAfterTax", "After-tax cost of debt (Kd)", b.costOfDebtAfterTax, pct(b.costOfDebtAfterTax), {
    defLabel: "After-Tax Cost of Debt",
    formula: `Pre-tax cost of debt × (1 ${MINUS} marginal tax rate)`,
    substituted: `${pct(b.costOfDebtPretax)} × (1 ${MINUS} ${pct(tm)})`,
    children: [pre, node("tm", "Marginal tax rate", tm, pct(tm), { defLabel: "Marginal Tax Rate" })],
  });
}

/** The DCF's WACC: E/V × Ke + D/V × Kd, debt including operating leases. */
export function dcfWaccTree(b: WaccBuild, money: Fmt): FormulaNode {
  const ke = dcfCostOfEquityTree(b);
  const e = node("E", "Equity value (E = market cap)", b.marketValueEquity, money(b.marketValueEquity), {
    defLabel: "Market Cap",
  });
  const debtKids = b.leaseDebt
    ? [
        node("conv", "Total Debt", b.conventionalDebt ?? null, money(b.conventionalDebt)),
        node("lease", "Operating-lease debt", b.leaseDebt ?? null, money(b.leaseDebt), {
          defLabel: "Operating Leases",
        }),
      ]
    : [];
  const d = node("D", "Debt (D)", b.bookValueDebt, money(b.bookValueDebt), {
    defLabel: "Total Debt",
    ...(b.leaseDebt
      ? {
          formula: "Total Debt + Operating-lease debt",
          substituted: `${money(b.conventionalDebt)} + ${money(b.leaseDebt)}`,
          children: debtKids,
        }
      : {}),
  });
  if (!b.weightDebt) {
    const why =
      b.marketValueEquity == null
        ? "no market cap"
        : (b.bookValueDebt ?? 0) > 0
          ? "debt too small to weigh"
          : "no debt";
    return node("wacc", "WACC", b.wacc, pct(b.wacc), {
      defLabel: "WACC",
      formula: "E/V × Ke + D/V × Kd",
      substituted: `Ke = ${pct(b.costOfEquity)} (${why})`,
      children: [ke, e],
    });
  }
  const kd = dcfCostOfDebtTree(b);
  return node("wacc", "WACC", b.wacc, pct(b.wacc), {
    defLabel: "WACC",
    formula: "E/V × Ke + D/V × Kd",
    substituted: `${num(b.weightEquity, 4)} × ${pct(b.costOfEquity)} + ${num(b.weightDebt, 4)} × ${pct(b.costOfDebtAfterTax)}`,
    children: [ke, kd, e, d],
  });
}

/** The DCF's ROIC: adjusted operating income × (1 − t) ÷ valuation capital. */
export function dcfRoicTree(r: RoicBuild, money: Fmt): FormulaNode {
  const oi = node("oi", "Operating Income", r.operatingIncome, money(r.operatingIncome), { defLabel: "Operating Income" });
  const rd = r.rdAdded != null;
  const adjOi = rd
    ? node("adjOi", "Operating income with R&D capitalized", r.adjustedOperatingIncome, money(r.adjustedOperatingIncome), {
        formula: `Operating Income + R&D ${MINUS} R&D amortization`,
        substituted: `${money(r.operatingIncome)} + ${money(r.rdAdded)} ${MINUS} ${money(r.rdAmortization)}`,
        children: [
          oi,
          node("rd", "R&D expense", r.rdAdded, money(r.rdAdded), { defLabel: "Research And Development Expenses" }),
          node("rdAm", "R&D amortization", r.rdAmortization, money(r.rdAmortization)),
        ],
      })
    : oi;
  const t = node("t", "Effective tax rate (t)", r.taxRate, pct(r.taxRate), { defLabel: "Effective Tax Rate" });
  const eq = node("eq", "Shareholders' equity", r.equity, money(r.equity), { defLabel: "Total Stockholders Equity" });
  const debt = node("debt", "Total Debt", r.debt, money(r.debt), { defLabel: "Total Debt" });
  const cash = node("cash", "Cash and short-term investments", r.cash, money(r.cash), { defLabel: "Cash" });
  const base = node("base", "Capital (equity + debt" + (r.cashSubtracted ? ` ${MINUS} cash)` : ")"), r.capitalBase, money(r.capitalBase), {
    defLabel: "Invested Capital",
    formula: r.cashSubtracted ? `Equity + Debt ${MINUS} Cash` : "Equity + Debt",
    substituted: r.cashSubtracted
      ? `${money(r.equity)} + ${money(r.debt)} ${MINUS} ${money(r.cash)}`
      : `${money(r.equity)} + ${money(r.debt)}`,
    children: r.cashSubtracted ? [eq, debt, cash] : [eq, debt],
  });
  const capital = rd
    ? node("cap", "Capital with the research asset", r.capital, money(r.capital), {
        formula: "Capital + Research asset",
        substituted: `${money(r.capitalBase)} + ${money(r.researchAsset)}`,
        children: [base, node("ra", "Research asset (capitalized R&D)", r.researchAsset, money(r.researchAsset))],
      })
    : base;
  return node("roic", "ROIC", r.roic, pct(r.roic), {
    defLabel: "ROIC",
    formula: `${rd ? "Operating income with R&D capitalized" : "Operating Income"} × (1 ${MINUS} t) ÷ ${rd ? "Capital with the research asset" : "Capital"}`,
    substituted: `${money(rd ? r.adjustedOperatingIncome : r.operatingIncome)} × (1 ${MINUS} ${pct(r.taxRate)}) ÷ ${money(r.capital)}`,
    children: [adjOi, t, capital],
  });
}
