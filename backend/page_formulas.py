"""Learn slice A3: formula trees for the company page's charted metrics.

One tree per metric the company page charts (individualanalysis.DISPLAY_METRICS)
and per statement metric with a formula (EBITDA, the stored ROIC and ROE, the
ratio columns). Each tree shows the formula, the same formula with the
company's own lines, and the result.

The RESULT of every tree is the number the page already shows: the latest
year of ``metric_history`` (or, for a statement metric, the stored column).
Derived variables (NOPAT, invested capital, the tax rate, the WACC parts)
come from the app's own helpers, so every variable is the app's own number.
Where the app shows a provider-reported figure (a stored ratio column), the
line with numbers is the standard formula on the company's lines; the owner
asked for the number only, with no comparison line (2026-11-08).

Built inside ``individualanalysis.build_individual_snapshot`` in its own
try/except, per the individual-page block contract (CLAUDE.md).
"""

from __future__ import annotations

from typing import Any, Optional

from company_profile.formulas import MINUS, Node, fmt

_UNIT = {"%": "rate", "x": "multiple", "d": "days", "$": "amount"}

_SOURCE = {
    "Balance sheet": (
        "Total Assets", "Total Stockholders Equity", "Total Equity", "Total Liabilities",
        "Total Debt", "Net Debt", "Inventory", "Net Receivables", "Account Payables",
        "Total Current Assets", "Total Current Liabilities", "Short Term Debt"),
    "Cash flow statement": (
        "Free Cash Flow", "Operating Cash Flow", "Capital Expenditure",
        "Depreciation and Amortization Cashflow", "Change In Working Capital",
        "Stock Based Compensation"),
    "Market data": ("Market Cap", "Enterprise Value"),
}


def _source_of(col: str) -> str:
    for src, cols in _SOURCE.items():
        if col in cols:
            return src
    return "Income statement"


class _B:
    """Leaves and shared derived nodes for one company-year."""

    def __init__(self, ia: Any, row: Any, prev: Any, ccy: str):
        self.ia, self.row, self.prev, self.ccy = ia, row, prev, ccy
        self.year = int(row["Calendar Year"])
        self.prev_year = int(prev["Calendar Year"]) if prev is not None else None

    def s(self, n: Node) -> str:
        return fmt(n.value, n.unit, self.ccy)

    def val(self, col: str, prior: bool = False) -> Optional[float]:
        r = self.prev if prior else self.row
        return self.ia._row_val(r, col) if r is not None else None

    def line(self, col: str, name: Optional[str] = None, *, prior: bool = False,
             unit: str = "amount", value: Optional[float] = None,
             use_value: bool = False) -> Node:
        v = value if use_value else self.val(col, prior)
        yr = self.prev_year if prior else self.year
        label = name or (f"Prior-year {col}" if prior else col)
        return Node(col if not prior else f"prior {col}", label, unit, v,
                    source=f"{_source_of(col)} · FY{yr}" if yr else _source_of(col),
                    def_label=col)

    def equity(self, prior: bool = False) -> Node:
        r = self.prev if prior else self.row
        v = (self.ia._row_val(r, "Total Stockholders Equity")
             or self.ia._row_val(r, "Total Equity")) if r is not None else None
        return self.line("Total Stockholders Equity", "Shareholders' equity", prior=prior,
                         value=v, use_value=True)

    def tax_rate(self) -> Node:
        ibt, tax = self.line("Income Before Tax"), self.line("Income Tax Expense")
        t = self.ia._effective_tax_rate(self.row)
        raw = self.ia._safe_div(tax.value, ibt.value)
        sub = (f"{self.s(tax)} ÷ {self.s(ibt)}" if raw is not None and raw == t
               else f"default rate {fmt(t, 'rate', self.ccy)}")
        return Node("taxRate", "Effective tax rate (t)", "rate", t,
                    formula="Income Tax Expense ÷ Income Before Tax", substituted=sub,
                    rule="A default rate is used when the effective rate is missing, "
                         "negative or above 60%.",
                    def_label="Effective Tax Rate", children=[tax, ibt])

    def nopat(self, prior: bool = False) -> Node:
        r = self.prev if prior else self.row
        oi = self.line("Operating Income", prior=prior)
        if prior:
            t_val = self.ia._effective_tax_rate(r)
            t = Node("taxRate", "Effective tax rate (t)", "rate", t_val, def_label="Effective Tax Rate")
        else:
            t = self.tax_rate()
        return Node("nopat" if not prior else "prior nopat",
                    "NOPAT" if not prior else "Prior-year NOPAT", "amount",
                    self.ia._nopat_for_row(r) if r is not None else None,
                    formula=f"Operating Income × (1 {MINUS} t)",
                    substituted=f"{self.s(oi)} × (1 {MINUS} {self.s(t)})",
                    def_label="NOPAT", children=[oi, t])

    def invested_capital(self, prior: bool = False) -> Node:
        r = self.prev if prior else self.row
        eq, debt = self.equity(prior), self.line("Total Debt", prior=prior)
        return Node("investedCapital" if not prior else "prior investedCapital",
                    "Invested capital" if not prior else "Prior-year invested capital",
                    "amount", self.ia._invested_capital(r) if r is not None else None,
                    formula="Shareholders' equity + Total Debt",
                    substituted=f"{self.s(eq)} + {self.s(debt)}",
                    def_label="Invested Capital", children=[eq, debt])


def _root(b: _B, key: str, name: str, unit: str, value: Optional[float], formula: str,
          substituted: str, children: list[Node], def_label: Optional[str] = None) -> Node:
    return Node(key, name, unit, value, formula=formula, substituted=substituted,
                def_label=def_label or name, children=children)


def _ratio(b: _B, key: str, name: str, unit: str, value: Optional[float],
           top: Node, bottom: Node, formula: Optional[str] = None) -> Node:
    return _root(b, key, name, unit, value, formula or f"{top.name} ÷ {bottom.name}",
                 f"{b.s(top)} ÷ {b.s(bottom)}", [top, bottom])


def _wacc_tree(b: _B, comps: dict[str, Any], ke: Optional[float], wacc: Optional[float]) -> tuple[Node, Node]:
    """(cost of equity, WACC) from compute_wacc's own breakdown for the year."""
    ccy = b.ccy
    rf = Node("riskFreeRate", "Risk-free rate (rf)", "rate", comps.get("riskFreeRate"),
              source="Year-end 10-year Treasury yield", def_label="Risk-Free Rate")
    erp = Node("equityRiskPremium", "Equity risk premium (ERP)", "rate",
               comps.get("equityRiskPremium"), source="Implied equity risk premium",
               def_label="Equity Risk Premium")
    beta = Node("beta", "Beta (β)", "beta", comps.get("beta"),
                source="Beta for the year", def_label="Beta")
    if comps.get("beta") is None:
        ke_sub = "default rate (no beta)"
    else:
        ke_sub = f"{fmt(rf.value, 'rate', ccy)} + {fmt(beta.value, 'beta', ccy)} × {fmt(erp.value, 'rate', ccy)}"
    ke_n = Node("costOfEquity", "Cost of equity (Ke)", "rate", ke,
                formula="rf + β × ERP", substituted=ke_sub, def_label="Cost of Equity",
                children=[rf, beta, erp])

    ic_val = comps.get("interestCoverage")
    cov = Node("interestCoverage", "Interest coverage", "multiple", ic_val,
               formula="Operating Income ÷ |Interest Expense|",
               substituted=f"{b.s(b.line('Operating Income'))} ÷ |{b.s(b.line('Interest Expense'))}|",
               def_label="Interest Coverage",
               children=[b.line("Operating Income"), b.line("Interest Expense")])
    pre = comps.get("costOfDebtPretax")
    spread = (pre - comps["riskFreeRate"]) if (pre is not None and comps.get("riskFreeRate") is not None) else None
    kd_pre = Node("costOfDebtPretax", "Pre-tax cost of debt", "rate", pre,
                  formula="rf + default spread (from the interest coverage rating)",
                  substituted=f"{fmt(comps.get('riskFreeRate'), 'rate', ccy)} + {fmt(spread, 'rate', ccy)}",
                  rule="The spread comes from a synthetic credit rating set by interest coverage.",
                  def_label="Cost of Debt", children=[cov])
    t_m = comps.get("marginalTaxRate")
    kd = Node("costOfDebtAfterTax", "After-tax cost of debt (Kd)", "rate",
              comps.get("costOfDebtAfterTax"),
              formula=f"Pre-tax cost of debt × (1 {MINUS} marginal tax rate)",
              substituted=f"{fmt(pre, 'rate', ccy)} × (1 {MINUS} {fmt(t_m, 'rate', ccy)})",
              def_label="After-Tax Cost of Debt", children=[kd_pre])
    e = Node("marketValueEquity", "Equity value (E = market cap)", "amount",
             comps.get("marketValueEquity"), source=f"Market data · FY{b.year}", def_label="Market Cap")
    d = Node("bookValueDebt", "Debt (D)", "amount", comps.get("bookValueDebt"),
             source=f"Balance sheet · FY{b.year}", def_label="Total Debt")
    we, wd = comps.get("weightEquity"), comps.get("weightDebt")
    if wd:
        sub = (f"{fmt(we, 'ratio', ccy).rstrip('x')} × {fmt(ke, 'rate', ccy)} + "
               f"{fmt(wd, 'ratio', ccy).rstrip('x')} × {fmt(comps.get('costOfDebtAfterTax'), 'rate', ccy)}")
        kids = [ke_n, kd, e, d]
    else:
        # compute_wacc weights debt at 0 when there is no debt OR no market cap.
        why = "no market cap" if (comps.get("bookValueDebt") or 0) > 0 else "no debt"
        sub, kids = f"Ke = {fmt(ke, 'rate', ccy)} ({why})", [ke_n, e]
    w = Node("wacc", "WACC", "rate", wacc, formula="E/V × Ke + D/V × Kd",
             substituted=sub, def_label="WACC", children=kids)
    return ke_n, w


def build_page_trees(rows: list[Any], metric_hist: dict[str, dict[int, Any]],
                     display_metrics: list[tuple[str, str, str, str]], *,
                     beta: Optional[float], rf: Optional[float], erp: Optional[float],
                     beta_hist: dict[int, float], hist_params: dict[int, dict[str, float]],
                     currency: str) -> dict[str, dict[str, dict[str, Any]]]:
    """{"history": {metric_key: tree}, "metrics": {statement label: tree}}."""
    import individualanalysis as ia  # lazy: this module is imported by it

    rows = sorted(rows, key=lambda r: int(r["Calendar Year"]))
    if not rows:
        return {"history": {}, "metrics": {}}
    row, prev = rows[-1], (rows[-2] if len(rows) > 1 else None)
    b = _B(ia, row, prev, currency)
    yr = b.year
    L, E = b.line, b.equity
    page = lambda k: (metric_hist.get(k) or {}).get(yr)  # noqa: E731
    meta = {k: (lab, _UNIT.get(u, "multiple")) for (k, lab, _g, u) in display_metrics}

    def unit(k: str) -> str:
        return meta.get(k, (k, "multiple"))[1]

    def name(k: str) -> str:
        return meta.get(k, (k, ""))[0]

    out: dict[str, Node] = {}

    def ratio(k: str, top: Node, bottom: Node, formula: Optional[str] = None) -> None:
        out[k] = _ratio(b, k, name(k), unit(k), page(k), top, bottom, formula)

    # Plain ratios of statement lines (stored-first ones show the page's figure).
    ratio("net_margin", L("Net Income"), L("Revenue"))
    ratio("asset_turnover", L("Revenue"), L("Total Assets"))
    ratio("equity_multiplier", L("Total Assets"), E())
    ratio("dupont_tax_burden", L("Net Income"), L("Income Before Tax"))
    ratio("dupont_interest_burden", L("Income Before Tax"), L("Operating Income"))
    ratio("dupont_ebit_margin", L("Operating Income"), L("Revenue"))
    ratio("operating_margin", L("Operating Income"), L("Revenue"))
    ratio("fcf_net_income", L("Free Cash Flow"), L("Net Income"))
    ratio("liabilities_equity", L("Total Liabilities"), E())
    ratio("net_debt_ocf", L("Net Debt"), L("Operating Cash Flow"))
    ratio("cogs_inventory", L("Cost Of Revenue"), L("Inventory"))
    ratio("roa", L("Net Income"), L("Total Assets"))
    ratio("current_ratio", L("Total Current Assets"), L("Total Current Liabilities"))
    ratio("fcf_total_debt", L("Free Cash Flow"), L("Total Debt"))
    ratio("ev_ebit", L("Enterprise Value"), L("Operating Income"))
    ratio("pe", L("Market Cap"), L("Net Income"))
    ratio("ev_ebitda", L("Enterprise Value"), L("EBITDA"))
    ratio("pb", L("Market Cap"), E())
    ratio("roe", L("Net Income"), E())
    ratio("debt_to_equity", L("Total Debt"), E())
    ratio("debt_to_assets", L("Total Debt"), L("Total Assets"))
    ratio("income_quality", L("Operating Cash Flow"), L("Net Income"))
    ratio("sbc_revenue", L("Stock Based Compensation"), L("Revenue"))
    ratio("net_debt_ebitda", L("Net Debt"), L("EBITDA"))
    ratio("receivables_turnover", L("Revenue"), L("Net Receivables"))
    ratio("payables_turnover", L("Cost Of Revenue"), L("Account Payables"))
    ratio("pfcf", L("Market Cap"), L("Free Cash Flow"))
    ratio("ps", L("Market Cap"), L("Revenue"))
    ratio("pocf", L("Market Cap"), L("Operating Cash Flow"))
    ratio("sga_revenue", L("Selling General And Administrative Expenses", "SG&A"), L("Revenue"))
    ratio("sales_invested_capital", L("Revenue"), b.invested_capital())

    capex, ie = L("Capital Expenditure"), L("Interest Expense")
    ratio("interest_coverage", L("Operating Income"), ie, "Operating Income ÷ |Interest Expense|")
    out["interest_coverage"].substituted = f"{b.s(L('Operating Income'))} ÷ |{b.s(ie)}|"
    da_cf = L("Depreciation and Amortization Cashflow", "Depreciation and amortization")
    out["capex_depreciation"] = _root(
        b, "capex_depreciation", name("capex_depreciation"), unit("capex_depreciation"),
        page("capex_depreciation"), "|Capital Expenditure| ÷ Depreciation and amortization",
        f"|{b.s(capex)}| ÷ {b.s(da_cf)}", [capex, da_cf])
    ebitda = L("EBITDA")
    out["ebitda_capex_interest"] = _root(
        b, "ebitda_capex_interest", name("ebitda_capex_interest"), "multiple",
        page("ebitda_capex_interest"), f"(EBITDA {MINUS} |Capex|) ÷ |Interest Expense|",
        f"({b.s(ebitda)} {MINUS} |{b.s(capex)}|) ÷ |{b.s(ie)}|", [ebitda, capex, ie])
    ca, inv, cl = L("Total Current Assets"), L("Inventory"), L("Total Current Liabilities")
    out["quick_ratio"] = _root(
        b, "quick_ratio", name("quick_ratio"), "multiple", page("quick_ratio"),
        f"(Current assets {MINUS} Inventory) ÷ Current liabilities",
        f"({b.s(ca)} {MINUS} {b.s(inv)}) ÷ {b.s(cl)}", [ca, inv, cl])
    ocf, std = L("Operating Cash Flow"), L("Short Term Debt")
    # The app uses EBITDA when operating cash flow is missing, and counts a
    # missing interest or short-term debt line as 0; the line shows what it used.
    cash = ocf if ocf.value is not None else L("EBITDA")
    ie_used = fmt(abs(ie.value) if ie.value is not None else 0.0, "amount", b.ccy)
    std_used = fmt(std.value if std.value is not None else 0.0, "amount", b.ccy)
    out["debt_service_coverage"] = _root(
        b, "debt_service_coverage", name("debt_service_coverage"), "multiple",
        page("debt_service_coverage"),
        f"{'Operating Cash Flow' if cash is ocf else 'EBITDA'} ÷ (|Interest Expense| + Short Term Debt)",
        f"{b.s(cash)} ÷ ({ie_used} + {std_used})", [cash, ie, std])

    # Working capital days (365-day basis) and the cash conversion cycle.
    rev, cogs = L("Revenue"), L("Cost Of Revenue")
    rec, pay = L("Net Receivables"), L("Account Payables")
    days = {
        "dso": (rec, rev, "365 × Receivables ÷ Revenue"),
        "dio": (inv, cogs, "365 × Inventory ÷ Cost of revenue"),
        "dpo": (pay, cogs, "365 × Payables ÷ Cost of revenue"),
    }
    for k, (top, bottom, f) in days.items():
        out[k] = _root(b, k, name(k), "days", page(k), f,
                       f"365 × {b.s(top)} ÷ {b.s(bottom)}", [top, bottom])
    out["ccc"] = _root(
        b, "ccc", name("ccc"), "days", page("ccc"), f"DSO + DIO {MINUS} DPO",
        f"{b.s(out['dso'])} + {b.s(out['dio'])} {MINUS} {b.s(out['dpo'])}",
        [out["dso"], out["dio"], out["dpo"]])

    # Earnings quality.
    ni, ta, ta0 = L("Net Income"), L("Total Assets"), L("Total Assets", prior=True)
    avg_v = ((ta.value + ta0.value) / 2.0) if (ta.value is not None and ta0.value is not None) else ta.value
    if ta.value is not None and ta0.value is not None:
        avg = Node("avgAssets", "Average total assets", "amount", avg_v,
                   formula="(Total Assets + Prior-year Total Assets) ÷ 2",
                   substituted=f"({b.s(ta)} + {b.s(ta0)}) ÷ 2", children=[ta, ta0])
    else:  # no prior year: the app uses this year's total assets alone
        avg = Node("avgAssets", "Total assets (no prior year)", "amount", avg_v,
                   formula="Total Assets", substituted=b.s(ta), children=[ta])
    out["sloan_accruals"] = _root(
        b, "sloan_accruals", name("sloan_accruals"), "rate", page("sloan_accruals"),
        f"(Net Income {MINUS} Operating Cash Flow) ÷ Average total assets",
        f"({b.s(ni)} {MINUS} {b.s(ocf)}) ÷ {b.s(avg)}", [ni, ocf, avg])

    # Value creation: NOPAT, invested capital, the year's WACC (compute_wacc).
    nopat, ic = b.nopat(), b.invested_capital()
    out["nopat"] = nopat
    beta_y = beta_hist.get(yr, beta)
    hp = hist_params.get(yr) or {}
    rf_y, erp_y = hp.get("rf", rf), hp.get("erp", erp)
    ke_val = ia.capm_discount_rate(beta_y, rf=rf_y, erp=erp_y)
    _w, comps = ia.compute_wacc(row, beta_y, rf_y, erp_y, ia._effective_tax_rate(row))
    ke_n, wacc_n = _wacc_tree(b, comps, ke_val, page("wacc"))
    out["wacc"] = wacc_n
    out["cost_of_equity"] = Node("cost_of_equity", name("cost_of_equity"), "rate",
                                 page("cost_of_equity"), formula=ke_n.formula,
                                 substituted=ke_n.substituted, def_label="Cost of Equity",
                                 children=ke_n.children)
    eva_v = page("eva")
    eva_n = _root(b, "eva", name("eva"), "amount", eva_v,
                  f"NOPAT {MINUS} WACC × Invested capital",
                  f"{b.s(nopat)} {MINUS} {b.s(wacc_n)} × {b.s(ic)}", [nopat, wacc_n, ic])
    out["eva"] = eva_n
    ratio("eva_margin", eva_n, L("Revenue"), "EVA ÷ Revenue")
    roic_n = _ratio(b, "roic", name("roic"), "rate", page("roic"), nopat, ic, "NOPAT ÷ Invested capital")
    out["roic"] = roic_n
    out["roic_wacc_spread"] = _root(
        b, "roic_wacc_spread", name("roic_wacc_spread"), "rate", page("roic_wacc_spread"),
        f"ROIC {MINUS} WACC", f"{b.s(roic_n)} {MINUS} {b.s(wacc_n)}", [roic_n, wacc_n])
    roe_n = out["roe"]
    out["excess_return"] = _root(
        b, "excess_return", name("excess_return"), "rate", page("excess_return"),
        f"ROE {MINUS} Ke", f"{b.s(roe_n)} {MINUS} {b.s(ke_n)}", [roe_n, ke_n])

    # Justified P/B = (ROE − g) ÷ (Ke − g), g = min(rf, retention × ROE).
    payout = L("Payout Ratio", "Payout ratio", unit="rate")
    g_cap = rf_y if rf_y is not None else ia.RISK_FREE_RATE
    g_val = None
    if roe_n.value is not None and roe_n.value > 0:
        p = max(0.0, min(1.0, payout.value)) if payout.value is not None else None
        g_val = min(g_cap, max(0.0, ((1.0 - p) if p is not None else 1.0) * roe_n.value))
    g_n = Node("growth", "Sustainable growth (g)", "rate", g_val,
               formula=f"min(rf, (1 {MINUS} payout) × ROE)",
               substituted=(f"min({fmt(g_cap, 'rate', b.ccy)}, (1 {MINUS} "
                            f"{fmt(payout.value or 0.0, 'rate', b.ccy)}) × {b.s(roe_n)})"),
               def_label="Sustainable Growth Rate", children=[payout])
    out["justified_pb"] = _root(
        b, "justified_pb", name("justified_pb"), "multiple", page("justified_pb"),
        f"(ROE {MINUS} g) ÷ (Ke {MINUS} g)",
        f"({b.s(roe_n)} {MINUS} {b.s(g_n)}) ÷ ({b.s(ke_n)} {MINUS} {b.s(g_n)})",
        [roe_n, ke_n, g_n])
    ii = L("Interest Income")
    out["net_interest_margin"] = _root(
        b, "net_interest_margin", name("net_interest_margin"), "rate", page("net_interest_margin"),
        f"(Interest Income {MINUS} |Interest Expense|) ÷ Total Assets",
        f"({b.s(ii)} {MINUS} |{b.s(ie)}|) ÷ {b.s(ta)}", [ii, ie, ta])

    # Reinvestment and the year-over-year metrics.
    dnwc = L("Change In Working Capital")
    out["reinvestment_rate"] = _root(
        b, "reinvestment_rate", name("reinvestment_rate"), "rate", page("reinvestment_rate"),
        f"(|Capex| {MINUS} Depreciation {MINUS} Change in working capital) ÷ NOPAT",
        f"(|{b.s(capex)}| {MINUS} {b.s(da_cf)} {MINUS} {b.s(dnwc)}) ÷ {b.s(nopat)}",
        [capex, da_cf, dnwc, nopat])
    if prev is not None:
        nopat0, ic0 = b.nopat(prior=True), b.invested_capital(prior=True)
        out["marginal_roic"] = _root(
            b, "marginal_roic", name("marginal_roic"), "rate", page("marginal_roic"),
            f"(NOPAT {MINUS} Prior NOPAT) ÷ (Invested capital {MINUS} Prior invested capital)",
            f"({b.s(nopat)} {MINUS} {b.s(nopat0)}) ÷ ({b.s(ic)} {MINUS} {b.s(ic0)})",
            [nopat, nopat0, ic, ic0])

        def growth(k: str, col: str) -> Node:
            cur, old = L(col), L(col, prior=True)
            return _root(b, k, name(k) or f"{col} growth", "rate", page(k),
                         f"({col} {MINUS} Prior {col}) ÷ |Prior {col}|",
                         f"({b.s(cur)} {MINUS} {b.s(old)}) ÷ |{b.s(old)}|", [cur, old])

        out["revenue_growth"] = growth("revenue_growth", "Revenue")
        out["net_income_growth"] = growth("net_income_growth", "Net Income")
        oi_g = growth("oi_growth", "Operating Income")
        oi_g.name, oi_g.def_label = "Operating income growth", "Operating Income Growth"
        out["operating_leverage"] = _root(
            b, "operating_leverage", name("operating_leverage"), "multiple",
            page("operating_leverage"), "Operating income growth ÷ Revenue growth",
            f"{b.s(oi_g)} ÷ {b.s(out['revenue_growth'])}", [oi_g, out["revenue_growth"]])

    # Leverage ROE identity terms (individualanalysis._leverage_roe_terms).
    debt, eq = L("Total Debt"), E()
    out["effective_tax_rate"] = b.tax_rate()
    out["effective_tax_rate"].key = "effective_tax_rate"
    book = _root(b, "book_interest_rate", name("book_interest_rate"), "rate",
                 page("book_interest_rate"), "|Interest Expense| ÷ Total Debt",
                 f"|{b.s(ie)}| ÷ {b.s(debt)}", [ie, debt])
    out["book_interest_rate"] = book
    t_n = b.tax_rate()
    atd = _root(b, "after_tax_debt_cost", name("after_tax_debt_cost"), "rate",
                page("after_tax_debt_cost"), f"Book interest rate × (1 {MINUS} t)",
                f"{b.s(book)} × (1 {MINUS} {b.s(t_n)})", [book, t_n])
    out["after_tax_debt_cost"] = atd
    lev_roic = _ratio(b, "roicBook", "ROIC (book)", "rate",
                      ia._safe_div(nopat.value, (eq.value + debt.value)
                                   if (eq.value is not None and debt.value is not None) else None),
                      nopat, ic, "NOPAT ÷ (equity + debt)")
    spread = _root(b, "roic_book_rate_spread", name("roic_book_rate_spread"), "rate",
                   page("roic_book_rate_spread"), f"ROIC {MINUS} After-tax cost of debt",
                   f"{b.s(lev_roic)} {MINUS} {b.s(atd)}", [lev_roic, atd])
    out["roic_book_rate_spread"] = spread
    de = Node("debtEquity", "Debt to equity (D/E)", "multiple",
              ia._safe_div(debt.value, eq.value), formula="Total Debt ÷ Shareholders' equity",
              substituted=f"{b.s(debt)} ÷ {b.s(eq)}", def_label="Debt To Equity",
              children=[debt, eq])
    out["leverage_gain"] = _root(
        b, "leverage_gain", name("leverage_gain"), "rate", page("leverage_gain"),
        f"D/E × (ROIC {MINUS} After-tax cost of debt)", f"{b.s(de)} × {b.s(spread)}", [de, spread])

    history = {k: n for k, n in out.items() if k in meta}
    for k, n in history.items():  # the page's label and unit always win
        n.name, n.unit = meta[k][0], meta[k][1] if n.unit != "amount" else "amount"

    # Statement metrics the page charts from stored columns (_INDIVIDUAL_METRICS).
    # The page skips blank years, so each tree uses the latest year whose stored
    # column has a value, and reads that same year's lines.
    def at_latest(col: str) -> Optional[_B]:
        for i in range(len(rows) - 1, -1, -1):
            if ia._row_val(rows[i], col) is not None:
                return _B(ia, rows[i], rows[i - 1] if i > 0 else None, currency)
        return None

    def ebitda_t(s: _B) -> Node:
        oi, da = s.line("Operating Income"), s.line("Depreciation And Amortization",
                                                      "Depreciation and amortization")
        return _root(s, "EBITDA", "EBITDA", "amount", s.val("EBITDA"),
                     "Operating Income + Depreciation and amortization",
                     f"{s.s(oi)} + {s.s(da)}", [oi, da])

    def gp_t(s: _B) -> Node:
        r, c = s.line("Revenue"), s.line("Cost Of Revenue")
        return _root(s, "Gross Profit", "Gross Profit", "amount", s.val("Gross Profit"),
                     f"Revenue {MINUS} Cost of revenue", f"{s.s(r)} {MINUS} {s.s(c)}", [r, c])

    def fcf_t(s: _B) -> Node:
        o, c = s.line("Operating Cash Flow"), s.line("Capital Expenditure")
        return _root(s, "Free Cash Flow", "Free Cash Flow", "amount", s.val("Free Cash Flow"),
                     f"Operating Cash Flow {MINUS} |Capital Expenditure|",
                     f"{s.s(o)} {MINUS} |{s.s(c)}|", [o, c])

    def ratio_t(label: str, col: str, unit_: str, top, bottom, formula: Optional[str] = None):
        def build(s: _B) -> Node:
            return _ratio(s, label, label, unit_, s.val(col), top(s), bottom(s), formula)
        return build

    specs = [
        ("EBITDA", "EBITDA", ebitda_t),
        ("Gross Profit", "Gross Profit", gp_t),
        ("Free Cash Flow", "Free Cash Flow", fcf_t),
        ("Return on Invested Capital", "ROIC", ratio_t(
            "Return on Invested Capital", "ROIC", "rate",
            lambda s: s.nopat(), lambda s: s.invested_capital(), "NOPAT ÷ Invested capital")),
        ("Return on Equity", "ROE", ratio_t(
            "Return on Equity", "ROE", "rate", lambda s: s.line("Net Income"), lambda s: s.equity())),
        ("Gross Profit Ratio", "Gross Profit Ratio", ratio_t(
            "Gross Profit Ratio", "Gross Profit Ratio", "rate",
            lambda s: s.line("Gross Profit"), lambda s: s.line("Revenue"))),
        ("Operating Income Ratio", "Operating Income Ratio", ratio_t(
            "Operating Income Ratio", "Operating Income Ratio", "rate",
            lambda s: s.line("Operating Income"), lambda s: s.line("Revenue"))),
        ("Debt to Equity", "Debt To Equity", ratio_t(
            "Debt to Equity", "Debt To Equity", "multiple",
            lambda s: s.line("Total Debt"), lambda s: s.equity())),
        ("Current Ratio", "Current Ratio", ratio_t(
            "Current Ratio", "Current Ratio", "multiple",
            lambda s: s.line("Total Current Assets"), lambda s: s.line("Total Current Liabilities"))),
    ]
    st: dict[str, Node] = {}
    for label, col, build in specs:
        s = at_latest(col)
        if s is not None:  # no stored value in any year: the page shows nothing either
            st[label] = build(s)

    return {
        "history": {k: n.to_dict(currency) for k, n in history.items()},
        "metrics": {k: n.to_dict(currency) for k, n in st.items()},
    }
