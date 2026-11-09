"""Formula trees for the Company page comparison table (Learn slice A2).

For each of the 26 comparison metrics, a tree the definition sidebar draws:
the metric's formula, the same formula with the company's own numbers, and
every variable, which is either a statement line or another formula with its
own children. Limits and fallbacks the app applies (the 2% to 12% cost-of-debt
band, the 21% tax fallback, the beta band) travel as a ``rule`` line, so the
numbers on screen always add up.

This module RECOMPUTES every value from the same inputs
``api.py#_spread_company_inputs`` exposes, mirroring ``api.py#_metric_intermediates``
and ``api.py#_company_metrics`` line by line. It does not import them, on
purpose: ``test_formulas.py`` compares the two, so a change to the app's
arithmetic that is not copied here fails a test instead of putting a wrong
derivation on screen.

Units. Inputs are the ``inputs.values`` units: reporting-currency amounts,
decimal rates (0.21), decimal growth columns. A root carries the table's
DISPLAY unit (percent metrics multiplied by 100), so its value equals the
table cell. Formatting happens here so the frontend only draws.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

MINUS = "−"  # the app's load-bearing minus sign

# Where each stored line comes from, for the "source" line under a value.
_STATEMENT = {
    "Revenue": "Income statement", "Operating Income": "Income statement",
    "Net Income": "Income statement", "Income Before Tax": "Income statement",
    "Income Tax Expense": "Income statement", "Interest Expense": "Income statement",
    "Interest Income": "Income statement",
    "Total Assets": "Balance sheet", "Total Stockholders Equity": "Balance sheet",
    "Total Liabilities": "Balance sheet", "Total Debt": "Balance sheet",
    "Net Debt": "Balance sheet",
    "Free Cash Flow": "Cash flow statement", "Operating Cash Flow": "Cash flow statement",
    "Capital Expenditure": "Cash flow statement",
    "Depreciation And Amortization": "Cash flow statement",
    "Market Cap": "Market data", "beta": "Market data",
    "Payout Ratio": "Reported ratio", "Revenue Growth": "Reported growth",
    "Net Income Growth": "Reported growth",
    "Prior Operating Income": "Income statement",
    "Prior Revenue": "Income statement",
}


@dataclass
class Params:
    """Everything outside the company's row that the arithmetic reads."""
    rf_capm: float            # risk-free rate inside CAPM (api._sector_wacc_params)
    erp: float                # live implied equity risk premium
    rf_growth: float          # risk-free cap on justified P/B growth (api._live_rf)
    currency: str = "USD"
    fiscal_year: Optional[int] = None
    prior_year: Optional[int] = None  # the prior row's own year (may skip a gap)
    sector: Optional[str] = None
    ttm_overlay: bool = False
    beta_min: float = 0.3
    beta_max: float = 3.0
    nim_materiality: float = 0.20
    nim_funding_min: float = 0.20
    nim_leverage_min: float = 4.0


@dataclass
class Node:
    key: str
    name: str
    unit: str                       # amount | rate | pct | multiple | ratio | beta
    value: Optional[float]
    formula: Optional[str] = None   # symbolic; None for a leaf
    substituted: Optional[str] = None
    source: Optional[str] = None
    rule: Optional[str] = None
    def_label: Optional[str] = None  # label the frontend resolves to a definition
    children: list["Node"] = field(default_factory=list)

    def to_dict(self, ccy: str) -> dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "unit": self.unit,
            "value": None if self.value is None else round(self.value, 6),
            "display": fmt(self.value, self.unit, ccy),
            "formula": self.formula,
            "substituted": self.substituted,
            "source": self.source,
            "rule": self.rule,
            "defLabel": self.def_label,
            "children": [c.to_dict(ccy) for c in self.children],
        }


# ── formatting ────────────────────────────────────────────────────────────────

def fmt(v: Optional[float], unit: str, ccy: str) -> str:
    if v is None:
        return "n/a"
    sign = MINUS if v < 0 else ""
    a = abs(v)
    if unit == "amount":
        for div, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M")):
            if a >= div:
                return f"{sign}{ccy} {a / div:.2f}{suffix}"
        return f"{sign}{ccy} {a:.2f}"
    if unit == "rate":
        return f"{sign}{a * 100:.2f}%"
    if unit == "pct":
        return f"{sign}{a:.2f}%"
    if unit == "beta":
        return f"{sign}{a:.3f}"
    return f"{sign}{a:.2f}x"  # multiple / ratio


def _f(n: Node, ccy: str) -> str:
    return fmt(n.value, n.unit, ccy)


def _num(values: dict[str, Any], col: str) -> Optional[float]:
    v = values.get(col)
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _ratio(n: Optional[float], d: Optional[float]) -> Optional[float]:
    if n is None or d is None or d <= 0:
        return None
    return n / d


_DENOM_RULE = "Not shown when the bottom of the fraction is zero or negative."


# ── the builder ───────────────────────────────────────────────────────────────

class _Builder:
    def __init__(self, values: dict[str, Any], p: Params):
        self.v = values
        self.p = p
        self.ccy = p.currency
        fy = f"FY{p.fiscal_year}" if p.fiscal_year else "latest fiscal year"
        self.fy = fy

    # leaves
    def line(self, col: str, name: Optional[str] = None, *, unit: str = "amount",
             rule: Optional[str] = None, def_label: Optional[str] = None,
             value: Optional[float] = None, use_value: bool = False) -> Node:
        val = value if use_value else _num(self.v, col)
        src = _STATEMENT.get(col, "Reported")
        if col.startswith("Prior "):
            when = f"FY{self.p.prior_year}" if self.p.prior_year else "prior fiscal year"
        elif self.p.ttm_overlay and src in ("Income statement", "Cash flow statement"):
            when = "trailing twelve months"
        else:
            when = self.fy
        return Node(key=col, name=name or col, unit=unit, value=val,
                    source=f"{src} · {when}", rule=rule,
                    def_label=def_label or (name or col))

    def s(self, n: Node) -> str:
        return _f(n, self.ccy)

    # derived terms (mirror api._metric_intermediates)
    def tax_rate(self) -> Node:
        ibt = self.line("Income Before Tax"); tax = self.line("Income Tax Expense")
        if ibt.value and ibt.value > 0 and tax.value is not None:
            raw = tax.value / ibt.value
            tr = max(0.0, min(0.45, raw))
            sub = f"{self.s(tax)} ÷ {self.s(ibt)}"
            if tr != raw:  # the limit binds: show it, so the line equals the value
                sub = f"max(0%, min(45%, {sub}))"
        else:
            tr, sub = 0.21, "21% fallback"
        return Node("taxRate", "Tax rate (t)", "rate", tr,
                    formula="Income Tax Expense ÷ Income Before Tax", substituted=sub,
                    rule="Limited to 0% to 45%. Set to 21% when pre-tax income is "
                         "missing, zero or negative, or the tax line is missing.",
                    def_label="Effective Tax Rate", children=[tax, ibt])

    def nopat(self) -> Node:
        oi = self.line("Operating Income"); t = self.tax_rate()
        val = oi.value * (1 - t.value) if oi.value is not None else None
        return Node("nopat", "NOPAT", "amount", val,
                    formula="Operating Income × (1 " + MINUS + " t)",
                    substituted=f"{self.s(oi)} × (1 {MINUS} {self.s(t)})",
                    def_label="NOPAT", children=[oi, t])

    def total_debt(self) -> Node:
        td = _num(self.v, "Total Debt") or 0.0
        return self.line("Total Debt", value=td, use_value=True,
                         rule="A missing total debt line counts as 0.")

    def invested_capital(self) -> Node:
        eq = self.line("Total Stockholders Equity", "Shareholders' equity",
                       def_label="Total Stockholders Equity")
        td = self.total_debt()
        val = (eq.value + td.value) if eq.value is not None else None
        return Node("investedCapital", "Invested capital", "amount", val,
                    formula="Shareholders' equity + Total Debt",
                    substituted=f"{self.s(eq)} + {self.s(td)}",
                    def_label="Invested Capital", children=[eq, td])

    def cost_of_equity(self) -> Node:
        p = self.p
        raw_beta = _num(self.v, "beta")
        if raw_beta is None or raw_beta <= 0:
            b_used = None
        else:
            b_used = max(p.beta_min, min(p.beta_max, raw_beta))
        rf = Node("capmRiskFree", "Risk-free rate (rf)", "rate", p.rf_capm,
                  source="Live 10-year US Treasury yield", def_label="Risk-Free Rate")
        erp = Node("equityRiskPremium", "Equity risk premium (ERP)", "rate", p.erp,
                   source="Live implied equity risk premium", def_label="Equity Risk Premium")
        beta = Node("beta", "Beta (β)", "beta", b_used if b_used is not None else 1.0,
                    source=f"Market data · reported beta {fmt(raw_beta, 'beta', '')}",
                    rule=f"Limited to {p.beta_min} to {p.beta_max}. A missing or "
                         "non-positive beta uses 1.0, the market's own beta.",
                    def_label="Beta")
        if b_used is None:
            ke = p.rf_capm + p.erp
        else:
            ke = p.rf_capm + b_used * p.erp
        return Node("costOfEquity", "Cost of equity (Ke)", "rate", ke,
                    formula="rf + β × ERP",
                    substituted=f"{self.s(rf)} + {self.s(beta)} × {self.s(erp)}",
                    def_label="Cost of Equity", children=[rf, beta, erp])

    def cost_of_debt(self) -> Node:
        ie = self.line("Interest Expense"); td = self.total_debt()
        if ie.value is not None and td.value > 0:
            raw = abs(ie.value) / td.value
            kd = max(0.02, min(0.12, raw))
            sub = f"|{self.s(ie)}| ÷ {self.s(td)}"
            if kd != raw:  # the limit binds: show it, so the line equals the value
                sub = f"max(2%, min(12%, {sub}))"
        else:
            kd, sub = 0.05, "5% fallback"
        return Node("costOfDebt", "Cost of debt (Kd)", "rate", kd,
                    formula="|Interest Expense| ÷ Total Debt", substituted=sub,
                    rule="Limited to 2% to 12%. Set to 5% when interest expense is "
                         "missing or there is no debt.",
                    def_label="Cost of Debt", children=[ie, td])

    def wacc(self) -> Node:
        ke = self.cost_of_equity(); kd = self.cost_of_debt(); t = self.tax_rate()
        mc = _num(self.v, "Market Cap")
        e = self.line("Market Cap", "Equity value (E = market cap)", value=mc or 0.0,
                      use_value=True, rule="A missing market cap counts as 0.",
                      def_label="Market Cap")
        d = self.total_debt()
        v_tot = e.value + d.value
        if v_tot > 0:
            w = ke.value * (e.value / v_tot) + kd.value * (1 - t.value) * (d.value / v_tot)
            sub = (f"{self.s(ke)} × {e.value / v_tot:.4f} + {self.s(kd)} × "
                   f"(1 {MINUS} {self.s(t)}) × {d.value / v_tot:.4f}")
            rule = (f"E/V and D/V use V = E + D = {fmt(v_tot, 'amount', self.ccy)}. "
                    "Comparison-table WACC; the DCF valuation computes its own.")
        else:
            w, sub = ke.value, "Ke (no market cap and no debt)"
            rule = "With no market cap and no debt, WACC equals the cost of equity."
        return Node("wacc", "WACC", "rate", w,
                    formula=f"Ke × E/V + Kd × (1 {MINUS} t) × D/V", substituted=sub,
                    rule=rule, def_label="WACC", children=[ke, kd, t, e, d])

    def eva(self) -> Node:
        n = self.nopat(); w = self.wacc(); ic = self.invested_capital()
        val = (n.value - w.value * ic.value) if (n.value is not None and ic.value is not None) else None
        return Node("eva", "EVA", "amount", val,
                    formula=f"NOPAT {MINUS} WACC × Invested capital",
                    substituted=f"{self.s(n)} {MINUS} {self.s(w)} × {self.s(ic)}",
                    def_label="EVA", children=[n, w, ic])

    # roots (mirror api._company_metrics)
    def pct_ratio(self, key: str, name: str, top: Node, bottom: Node, *,
                  unit: str = "pct", def_label: Optional[str] = None,
                  formula: Optional[str] = None) -> Node:
        r = _ratio(top.value, bottom.value)
        val = None if r is None else (r * 100.0 if unit == "pct" else r)
        return Node(key, name, unit, val,
                    formula=formula or f"{top.name} ÷ {bottom.name}",
                    substituted=f"{self.s(top)} ÷ {self.s(bottom)}",
                    rule=_DENOM_RULE, def_label=def_label or name,
                    children=[top, bottom])

    def roic(self) -> Node:
        return self.pct_ratio("roic", "ROIC", self.nopat(), self.invested_capital(),
                              formula="NOPAT ÷ Invested capital")

    def roe(self) -> Node:
        return self.pct_ratio("roe", "ROE", self.line("Net Income"),
                              self.line("Total Stockholders Equity", "Shareholders' equity",
                                        def_label="Total Stockholders Equity"),
                              def_label="Return on Equity",
                              formula="Net Income ÷ Shareholders' equity")


def _as_pct(n: Node, key: str, name: str, def_label: str) -> Node:
    """A decimal-rate node re-expressed as a percent root (display units)."""
    return Node(key, name, "pct", None if n.value is None else n.value * 100.0,
                formula=n.formula, substituted=n.substituted, rule=n.rule,
                def_label=def_label, children=n.children)


def build_formula_trees(values: dict[str, Any], params: Params) -> dict[str, dict[str, Any]]:
    """{metric_key: tree} for every comparison metric, keyed like the table."""
    b = _Builder(values, params)
    ccy = params.currency
    L = b.line
    out: dict[str, Node] = {}

    out["roic"] = b.roic()
    out["wacc"] = _as_pct(b.wacc(), "wacc", "WACC", "WACC")
    roic_n, wacc_n = b.roic(), _as_pct(b.wacc(), "wacc", "WACC", "WACC")
    spread = (roic_n.value - wacc_n.value) if roic_n.value is not None else None
    out["roic_wacc_spread"] = Node(
        "roic_wacc_spread", f"ROIC {MINUS} WACC spread", "pct", spread,
        formula=f"ROIC {MINUS} WACC",
        substituted=f"{_f(roic_n, ccy)} {MINUS} {_f(wacc_n, ccy)}",
        def_label=f"ROIC {MINUS} WACC Spread", children=[roic_n, wacc_n])
    eva_n = b.eva()
    out["eva_margin"] = b.pct_ratio("eva_margin", "EVA margin", eva_n, L("Revenue"),
                                    formula="EVA ÷ Revenue", def_label="EVA Margin")
    out["roe"] = b.roe()
    ke = b.cost_of_equity()
    out["cost_of_equity"] = _as_pct(ke, "cost_of_equity", "Cost of equity", "Cost of Equity")
    roe_n = b.roe()
    excess = (roe_n.value - ke.value * 100.0) if roe_n.value is not None else None
    ke_pct = _as_pct(ke, "costOfEquity", "Cost of equity (Ke)", "Cost of Equity")
    out["excess_return"] = Node(
        "excess_return", "Excess return on equity", "pct", excess,
        formula=f"ROE {MINUS} Ke",
        substituted=f"{_f(roe_n, ccy)} {MINUS} {_f(ke_pct, ccy)}",
        def_label="Excess Return", children=[roe_n, ke_pct])

    # Justified P/B = (ROE − g) ÷ (Ke − g), g = min(rf, max(0, retention × ROE)).
    roe_dec = _ratio(_num(values, "Net Income"), _num(values, "Total Stockholders Equity"))
    payout_raw = _num(values, "Payout Ratio")
    payout = max(0.0, min(1.0, payout_raw)) if payout_raw is not None else None
    payout_n = L("Payout Ratio", "Payout ratio", unit="rate", value=payout, use_value=True,
                 rule="Limited to 0% to 100%. A missing payout ratio means all earnings "
                      "are retained.")
    rfg = Node("riskFreeRate", "Risk-free rate (growth cap)", "rate", params.rf_growth,
               source="Live 10-year US Treasury yield", def_label="Risk-Free Rate")
    jpb = None
    g_val = None
    if roe_dec is not None and roe_dec > 0:
        retention = (1.0 - payout) if payout is not None else 1.0
        g_val = min(params.rf_growth, max(0.0, retention * roe_dec))
        if ke.value > g_val:
            jpb = (roe_dec - g_val) / (ke.value - g_val)
    # A missing payout means full retention; print 0% so the line equals the value.
    payout_shown = fmt(payout if payout is not None else 0.0, "rate", ccy)
    g_n = Node("growth", "Sustainable growth (g)", "rate", g_val,
               formula=f"min(rf, (1 {MINUS} payout) × ROE)",
               substituted=(f"min({_f(rfg, ccy)}, max(0%, (1 {MINUS} {payout_shown}) × "
                            f"{fmt(roe_dec, 'rate', ccy)}))"),
               rule="Never below 0% and never above the risk-free rate.",
               def_label="Sustainable Growth Rate", children=[payout_n, rfg])
    out["justified_pb"] = Node(
        "justified_pb", "Justified P/B", "multiple", jpb,
        formula=f"(ROE {MINUS} g) ÷ (Ke {MINUS} g)",
        substituted=(f"({fmt(roe_dec, 'rate', ccy)} {MINUS} {_f(g_n, ccy)}) ÷ "
                     f"({_f(ke, ccy)} {MINUS} {_f(g_n, ccy)})"),
        rule="Not shown when ROE is zero or negative, or when Ke is not above g.",
        def_label="Justified P/B", children=[b.roe(), ke, g_n])

    equity = lambda: L("Total Stockholders Equity", "Shareholders' equity",  # noqa: E731
                       def_label="Total Stockholders Equity")
    out["pb"] = b.pct_ratio("pb", "P/B", L("Market Cap"), equity(), unit="multiple",
                            formula="Market Cap ÷ Shareholders' equity", def_label="P/B")
    out["pe"] = b.pct_ratio("pe", "P/E", L("Market Cap"), L("Net Income"), unit="multiple",
                            formula="Market Cap ÷ Net Income", def_label="P/E")

    # Net interest margin: banks only (the same gates as _company_metrics).
    ii, ie, assets = L("Interest Income"), L("Interest Expense"), L("Total Assets")
    rev, eq_v = _num(values, "Revenue"), _num(values, "Total Stockholders Equity")
    nim = None
    p = params
    if (p.sector == "Financial Services"
            and ii.value is not None and ii.value > 0 and rev and rev > 0
            and ie.value is not None and ie.value > 0
            and assets.value and assets.value > 0 and eq_v and eq_v > 0
            and (ii.value / rev) >= p.nim_materiality
            and (ie.value / ii.value) >= p.nim_funding_min
            and (assets.value / eq_v) >= p.nim_leverage_min):
        nii = ii.value - ie.value
        if nii > 0:
            nim = nii / assets.value * 100.0
    out["net_interest_margin"] = Node(
        "net_interest_margin", "Net interest margin", "pct", nim,
        formula=f"(Interest Income {MINUS} Interest Expense) ÷ Total Assets",
        substituted=f"({_f(ii, ccy)} {MINUS} {_f(ie, ccy)}) ÷ {_f(assets, ccy)}",
        rule=("Shown for lenders only: Financial Services, interest income at least "
              f"{p.nim_materiality:.0%} of revenue, interest expense at least "
              f"{p.nim_funding_min:.0%} of interest income, and assets at least "
              f"{p.nim_leverage_min:g}x equity."),
        def_label="Net Interest Margin", children=[ii, ie, assets])

    out["dupont_tax_burden"] = b.pct_ratio(
        "dupont_tax_burden", "Tax burden", L("Net Income"), L("Income Before Tax"),
        unit="ratio", formula="Net Income ÷ Income Before Tax", def_label="Tax Burden")
    out["dupont_interest_burden"] = b.pct_ratio(
        "dupont_interest_burden", "Interest burden", L("Income Before Tax"),
        L("Operating Income"), unit="ratio",
        formula="Income Before Tax ÷ Operating Income", def_label="Interest Burden")
    out["dupont_ebit_margin"] = b.pct_ratio(
        "dupont_ebit_margin", "EBIT margin", L("Operating Income"), L("Revenue"),
        formula="Operating Income ÷ Revenue", def_label="EBIT Margin")
    out["net_margin"] = b.pct_ratio("net_margin", "Net margin", L("Net Income"), L("Revenue"),
                                    formula="Net Income ÷ Revenue", def_label="Net Margin")
    out["asset_turnover"] = b.pct_ratio(
        "asset_turnover", "Asset turnover", L("Revenue"), L("Total Assets"), unit="ratio",
        formula="Revenue ÷ Total Assets", def_label="Asset Turnover")
    out["equity_multiplier"] = b.pct_ratio(
        "equity_multiplier", "Equity multiplier", L("Total Assets"), equity(), unit="ratio",
        formula="Total Assets ÷ Shareholders' equity", def_label="Equity Multiplier")
    out["operating_margin"] = b.pct_ratio(
        "operating_margin", "Operating margin", L("Operating Income"), L("Revenue"),
        formula="Operating Income ÷ Revenue", def_label="Operating Margin")

    for key, col, name in (("revenue_growth", "Revenue Growth", "Revenue growth"),
                           ("net_income_growth", "Net Income Growth", "Net income growth")):
        g = _num(values, col)
        leaf = L(col, name, unit="rate")
        out[key] = Node(key, name, "pct", None if g is None else g * 100.0,
                        formula=f"{col} (reported, year over year)",
                        substituted=_f(leaf, ccy), def_label=name.title(), children=[leaf])

    # Operating leverage = (OI ÷ prior OI − 1) ÷ (Revenue ÷ prior Revenue − 1).
    oi, oi0 = L("Operating Income"), L("Prior Operating Income", "Prior operating income")
    rv, rv0 = L("Revenue"), L("Prior Revenue", "Prior revenue")
    dol = None
    if (not params.ttm_overlay and oi0.value and rv0.value
            and rv.value is not None and oi.value is not None):
        rev_g = rv.value / rv0.value - 1
        if rev_g != 0:
            dol = (oi.value / oi0.value - 1) / rev_g
    out["operating_leverage"] = Node(
        "operating_leverage", "Operating leverage", "ratio", dol,
        formula=(f"(Operating Income ÷ Prior Operating Income {MINUS} 1) ÷ "
                 f"(Revenue ÷ Prior Revenue {MINUS} 1)"),
        substituted=(f"({_f(oi, ccy)} ÷ {_f(oi0, ccy)} {MINUS} 1) ÷ "
                     f"({_f(rv, ccy)} ÷ {_f(rv0, ccy)} {MINUS} 1)"),
        rule="Not shown when revenue did not change, a prior-year line is missing, "
             "or the latest figures are trailing twelve months.",
        def_label="Operating Leverage", children=[oi, oi0, rv, rv0])

    cap = L("Capital Expenditure")
    cap_abs = abs(cap.value) if cap.value is not None else None
    da = L("Depreciation And Amortization")
    r_cd = _ratio(cap_abs, da.value)
    out["capex_depreciation"] = Node(
        "capex_depreciation", "Capex to depreciation", "ratio", r_cd,
        formula="|Capital Expenditure| ÷ Depreciation And Amortization",
        substituted=f"|{_f(cap, ccy)}| ÷ {_f(da, ccy)}", rule=_DENOM_RULE,
        def_label="Capex to Depreciation", children=[cap, da])
    out["sales_invested_capital"] = b.pct_ratio(
        "sales_invested_capital", "Sales to invested capital", L("Revenue"),
        b.invested_capital(), unit="ratio", formula="Revenue ÷ Invested capital",
        def_label="Sales to Invested Capital")
    out["fcf_net_income"] = b.pct_ratio(
        "fcf_net_income", "FCF to net income", L("Free Cash Flow"), L("Net Income"),
        unit="ratio", formula="Free Cash Flow ÷ Net Income", def_label="FCF to Net Income")
    out["net_debt_ocf"] = b.pct_ratio(
        "net_debt_ocf", "Net debt to operating cash flow", L("Net Debt"),
        L("Operating Cash Flow"), unit="ratio", formula="Net Debt ÷ Operating Cash Flow",
        def_label="Net Debt to OCF")
    out["liabilities_equity"] = b.pct_ratio(
        "liabilities_equity", "Liabilities to equity", L("Total Liabilities"), equity(),
        unit="ratio", formula="Total Liabilities ÷ Shareholders' equity",
        def_label="Liabilities to Equity")

    return {k: n.to_dict(ccy) for k, n in out.items()}
