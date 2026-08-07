"""
group_scoring.py — value score + integrity checks for the sector / industry
scorecard matrices (/api/sector-metrics, /api/sector/{s}/industry-metrics,
/api/industry/{i}/scorecard).

Two altitudes, two unit spaces — do not mix them:

  • score_groups() works on the MATRIX columns produced by
    api._aggregate_weighted_columns. Those are DISPLAY units (percents already
    ×100: a 5pp ROIC−WACC spread arrives as 5.0, not 0.05). The curves here are
    anchored in display units for that reason.
  • build_group_integrity() works on the industry_averages by-year aggregates
    (compute_*_averages_by_year). Those are stored-column DECIMALS (a 20% margin
    arrives as 0.20). Thresholds mirror the individual page's _SHN_* constants.

Scoring method mirrors comparitivestockanalysis.score_industry: each metric
contributes LEVEL_BLEND of an absolute calibrated level plus the remainder from
a peer percentile (tie-averaged), weighted by a sector profile, with the
negative-profit hard cap and the coverage floor. Shared constants are imported
so the two engines stay calibrated together.

Weighting (RAG/vault-grounded, see docs below each curve):
  • ROIC−WACC spread carries the top weight. "It is not growth that creates
    value, but growth in conjunction with excess returns" (Damodaran,
    Investment Valuation Ch.32).
  • EVA Margin rides alongside it: EVA/Sales = (ROIC−WACC) ÷ capital turnover
    (same identity, different angle — Stewart, Best-Practice EVA Ch.5; the two
    views are complements, not duplicates). Anchors follow Stewart's Russell
    3000 distribution (median ≈ 0.4%, 75th ≈ 4.1%, 90th ≈ 9.7%, Exhibit 7.14).
  • WACC is also scored directly (lower is better) so the cost-of-capital side
    keeps its weight now that EVA Margin doubles up the return side.
  • Financials / Real Estate swap to the equity lens: ROIC/WACC/EVA are
    undefined there (debt is raw material), so Excess Return (ROE − Ke) takes
    the top weight (Damodaran Ch.21) and the FCFF-side metrics drop out.

Integrity checks fire as plain-language questions with the numbers that
tripped them. They ANNOTATE the score; they never change it.
"""

from __future__ import annotations

import math
from typing import Any, Optional

from comparitivestockanalysis import (  # shared calibration, same engine family
    LEVEL_BLEND,
    MIN_SCORE_COVERAGE,
    NEG_PROFIT_CAP,
    _interp,
)

# ── Scoring: curves in DISPLAY units (matrix space) ──────────────────────────

# Percents are ×100 in the matrix (roicWaccSpread 5.0 = five points); ratio
# metrics (x) are unscaled. Anchor sources: the spread / excess-return / FCF
# conversion / EBIT-margin / revenue-growth curves re-anchor METRIC_CURVES from
# comparitivestockanalysis (decimals → display). evaMargin follows Stewart's
# Russell 3000 percentiles. wacc is calibrated to this app's own aggregate
# distribution (sector WACC has run ~5.5–9% under the live-ERP CAPM here; the
# external 2026 Damodaran refresh runs 7–16% but includes size premia this
# pipeline does not apply). Checked 2026-07 after the valuation-engine rebuild:
# the sector CAPM already ran on the live rf/implied ERP before the rebuild
# (only the no-beta fallback route changed), so the WACC distribution these
# anchors were calibrated against did not shift; re-anchor only if the ERP
# methodology itself changes. netDebtToOcf follows the credit years-to-repay
# convention (≤1x excellent, 2–5x normal band, >5x weak). pbGap anchors ±: a
# sector trading a full multiple point below its justified P/B is cheap, a
# point above is rich (Damodaran Ch.19/21 justified-multiple framework).
GROUP_METRIC_CURVES: dict[str, list[tuple[float, float]]] = {
    "roicWaccSpread":     [(-5.0, 0), (0.0, 12), (5.0, 62), (15.0, 92), (30.0, 100)],
    "evaMargin":          [(-5.0, 0), (0.0, 12), (4.0, 55), (9.0, 85), (15.0, 97)],
    "excessReturnEquity": [(-5.0, 0), (0.0, 12), (5.0, 60), (12.0, 90), (25.0, 100)],
    "wacc":               [(6.0, 92), (7.5, 68), (8.5, 50), (9.5, 28), (11.0, 6)],
    "fcfToNetIncome":     [(-0.5, 0), (0.0, 15), (0.4, 40), (0.8, 65), (1.0, 82), (1.5, 98)],
    "dupontEbitMargin":   [(-5.0, 0), (0.0, 15), (12.0, 62), (30.0, 92), (45.0, 100)],
    "pbGap":              [(-1.5, 95), (-0.5, 75), (0.0, 55), (1.0, 32), (3.0, 8)],
    "revenueGrowth":      [(-10.0, 5), (0.0, 25), (8.0, 55), (20.0, 82), (40.0, 98)],
    "netDebtToOcf":       [(0.0, 95), (1.0, 80), (3.0, 55), (5.0, 30), (8.0, 8)],
    "netMargin":          [(-5.0, 0), (0.0, 15), (10.0, 60), (25.0, 92), (40.0, 100)],
    "netInterestMargin":  [(0.0, 0), (1.5, 30), (3.0, 65), (4.5, 90), (6.0, 100)],
}

# Metrics where a SMALLER value is better.
_LOWER_IS_BETTER: set[str] = {"pbGap", "netDebtToOcf", "wacc"}

# Default profile — economic profit dominant, WACC-anchored block heaviest.
DEFAULT_GROUP_WEIGHTS: dict[str, float] = {
    "roicWaccSpread": 3.0,
    "evaMargin": 2.0,
    "excessReturnEquity": 2.0,
    "wacc": 1.5,
    "fcfToNetIncome": 1.5,
    "dupontEbitMargin": 1.5,
    "pbGap": 1.5,
    "revenueGrowth": 1.0,
    "netDebtToOcf": 1.0,
}

# Sector overrides. Financials: ROIC/WACC/EVA undefined (fcff guard) and
# OCF/FCF distorted by loan-book flows → equity lens leads (ROE − Ke), NIM
# joins, P/B gap matters more (book tracks net-asset value for banks).
# Real Estate: FCFF metrics also n/a; cash conversion and leverage stay.
GROUP_WEIGHTS_BY_SECTOR: dict[str, dict[str, float]] = {
    "Financial Services": {
        "excessReturnEquity": 3.0,
        "netInterestMargin": 2.0,
        "pbGap": 2.0,
        "dupontEbitMargin": 1.0,
        "revenueGrowth": 1.0,
        "netMargin": 1.5,
    },
    "Real Estate": {
        "excessReturnEquity": 3.0,
        "fcfToNetIncome": 1.5,
        "pbGap": 2.0,
        "dupontEbitMargin": 1.5,
        "revenueGrowth": 1.0,
        "netDebtToOcf": 1.5,
    },
}

# Negative-core-profit cap triggers, checked in DISPLAY units. Profile-aware:
# a group is never capped on a metric its own profile deliberately excludes.
_CAP_TRIGGERS = ("netMargin", "excessReturnEquity", "roicWaccSpread")


def weights_for(sector: Optional[str]) -> dict[str, float]:
    """The active weight profile for a group's parent sector."""
    return GROUP_WEIGHTS_BY_SECTOR.get(sector or "", DEFAULT_GROUP_WEIGHTS)


def scoring_inputs(col: dict[str, Any]) -> dict[str, Optional[float]]:
    """Derive the scored inputs from one aggregated matrix column.

    Adds pbGap = actual P/B − justified P/B (both already computed and
    winsorised upstream). Values pass through otherwise untouched.
    """
    out: dict[str, Optional[float]] = {}
    for key in set(DEFAULT_GROUP_WEIGHTS) | {
        k for prof in GROUP_WEIGHTS_BY_SECTOR.values() for k in prof
    }:
        if key == "pbGap":
            continue
        v = col.get(key)
        out[key] = float(v) if isinstance(v, (int, float)) and math.isfinite(v) else None
    apb, jpb = col.get("actualPB"), col.get("justifiedPB")
    if isinstance(apb, (int, float)) and isinstance(jpb, (int, float)) \
            and math.isfinite(apb) and math.isfinite(jpb):
        out["pbGap"] = float(apb) - float(jpb)
    else:
        out["pbGap"] = None
    return out


def _level_score(metric: str, value: Optional[float]) -> Optional[float]:
    anchors = GROUP_METRIC_CURVES.get(metric)
    if anchors is None or value is None:
        return None
    return max(0.0, min(100.0, _interp(anchors, float(value))))


def _peer_percentiles(
    values: dict[str, Optional[float]], lower_better: bool
) -> dict[str, float]:
    """rank/(n-1)*100 within the peer set (best = 100); ties share the average
    percentile. Same semantics as comparitivestockanalysis._peer_percentiles."""
    valid = [(g, v) for g, v in values.items() if v is not None]
    if len(valid) < 2:
        return {}
    ordered = sorted(valid, key=lambda kv: kv[1], reverse=lower_better)
    n = len(ordered)
    out: dict[str, float] = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and ordered[j + 1][1] == ordered[i][1]:
            j += 1
        pct = ((i + j) / 2.0 / (n - 1)) * 100.0
        for k in range(i, j + 1):
            out[ordered[k][0]] = pct
        i = j + 1
    return out


def _has_negative_core_profit(
    inputs: dict[str, Optional[float]], weights: dict[str, float]
) -> bool:
    """True when a present, PROFILE-WEIGHTED core-profitability signal is
    negative. Financials are not capped on roicWaccSpread because their
    profile deliberately excludes it (debt is operating raw material there)."""
    for key in _CAP_TRIGGERS:
        if key not in weights and key != "netMargin":
            continue  # profile excludes this signal for the group
        v = inputs.get(key)
        if v is not None and v < 0:
            return True
    return False


def score_groups(
    columns: dict[str, dict[str, Any]],
    *,
    sector: Optional[str] = None,
    sector_by_group: Optional[dict[str, str]] = None,
) -> dict[str, float]:
    """Value score (0–100) for each group column in a matrix.

    ``sector`` scores every group under one profile (industries inside one
    sector). ``sector_by_group`` gives each group its own profile (the
    11-sector matrix, where each sector is judged by its own lens while the
    peer percentiles stay cross-sectional). Mirrors score_industry: level and
    peer blend 70/30, coverage floor, negative-profit cap.
    """
    if len(columns) < 2:
        return {g: 0.0 for g in columns}

    inputs = {g: scoring_inputs(col) for g, col in columns.items()}
    profiles = {
        g: weights_for((sector_by_group or {}).get(g, sector)) for g in columns
    }
    all_metrics = sorted({k for prof in profiles.values() for k in prof})

    scores = {g: 0.0 for g in columns}
    weights_used = {g: 0.0 for g in columns}
    for metric in all_metrics:
        peer = _peer_percentiles(
            {g: inputs[g].get(metric) for g in columns}, metric in _LOWER_IS_BETTER
        )
        for g in columns:
            weight = profiles[g].get(metric)
            value = inputs[g].get(metric)
            if weight is None or value is None:
                continue
            lvl = _level_score(metric, value)
            if lvl is None:
                if g not in peer:
                    continue
                metric_score = peer[g]
            else:
                metric_score = LEVEL_BLEND * lvl + (1 - LEVEL_BLEND) * peer.get(g, lvl)
            scores[g] += metric_score * weight
            weights_used[g] += weight

    out: dict[str, float] = {}
    for g in columns:
        total = sum(profiles[g].values())
        if weights_used[g] < MIN_SCORE_COVERAGE * total or weights_used[g] <= 0:
            out[g] = 0.0
            continue
        composite = scores[g] / weights_used[g]
        if _has_negative_core_profit(inputs[g], profiles[g]):
            composite = min(composite, NEG_PROFIT_CAP)
        out[g] = round(composite, 2)
    return out


def rank_groups(scores: dict[str, float]) -> dict[str, int]:
    """1-based rank by descending score; ties broken by name for determinism."""
    ordered = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    return {g: i + 1 for i, (g, _s) in enumerate(ordered)}


# ── Integrity checks: DECIMAL units (industry_averages by-year space) ────────

# Thresholds mirror the individual page's shenanigan detectors (_SHN_* in
# individualanalysis.py) and earnings_normalization's Ch.9 rules, applied at
# the group-aggregate altitude. severity escalates at 2× the base threshold.
NONOP_SHARE = 0.20            # _SHN_NONOP_SHARE (EM3)
INCOME_QUALITY_FLOOR = 0.80   # _SHN_INCOME_QUALITY_FLOOR
INCOME_QUALITY_BAD = 0.50     # _SHN_INCOME_QUALITY_BAD
MARGIN_MEDIAN_DEV = 0.10      # earnings_normalization._ONE_TIME_MARGIN_DEV
TAX_BURDEN_DEV = 0.10         # tax-retention jump vs own 5y median
GM_JUMP = 0.05                # _SHN_GM_JUMP (KM1)
GOODWILL_DROP = 0.15          # aggregate goodwill fall that smells of write-downs
EARN_GROWTH_STD = 0.25        # std of YoY EBIT growth: lumpy-earnings threshold.
                              # (CV of the LEVEL is wrong at this altitude — a
                              # steadily growing aggregate has a huge level-CV
                              # from growth alone; growth-rate variability is
                              # the standard earnings-variability measure.)
DEFREV_DRAWDOWN = 0.15        # aggregate drawdown (looser than _SHN: means drift)
BASE_GROWTH_BIG = 0.50        # growth this large gets base-year scrutiny
RECV_GAP = 0.10               # _SHN_RECV_GAP (EM1)
AGG_GROWTH_SANE = 1.0         # aggregate growth means beyond ±100% are artifacts
ROE_JUMP = 0.10               # ΔROE that outruns a flat/falling ROA (2017 case)
LEVERAGE_JUMP = 0.25          # YoY equity-multiplier jump (robust 2017 trigger:
                              # the raw cap-weighted ROE mean can be poisoned by
                              # negative-book-equity outliers; leverage is not)
LEVERAGE_HIGH = 4.0           # equity multiplier where ROE stops meaning quality
SIGN_DISAGREE_MIN = 0.05      # ROE vs ROIC disagreement worth flagging
TOP5_SHARE = 0.60             # concentration: top-5 caps as share of group weight
COMPOSITION_SWING = 0.25      # universe change (1y, or cumulative over 2y)
STABLE_UNIVERSE = 0.10        # max YoY count change for composition-sensitive checks
IQ_SANE = 10.0                # |OCF/NI| beyond this is a ratio-mean artifact
RANK_DRIFT = 3                # places between 1y rank and 3y-median rank

# Standing questions the user answers in a text box (humanizer-passed: detailed
# and clear, no em dashes, no unclear pronoun references). `{group}` is filled
# with the sector or industry name so each question reads on its own. The check's
# `detail` supplies the specific figures beneath the question.
QUESTIONS: dict[str, str] = {
    "nonop_income_share":
        "How much of {group}'s profit this year came from outside its normal operations, "
        "such as asset sales, investment gains, or legal settlements, and would the picture "
        "change if those one-off items were stripped out?",
    "ocf_ni":
        "Is {group}'s reported profit backed by real cash from operations, or is a large "
        "share of that profit accounting profit that has not turned into cash?",
    "margin_vs_median":
        "Is {group}'s operating margin this year close to its own long-run normal, or far "
        "enough from that norm to point to a one-time swing rather than a lasting change?",
    "tax_windfall":
        "Did a lower tax bill flatter {group}'s bottom line this year, and how would the "
        "profit look if the tax rate returned to its usual level?",
    "gm_swing":
        "Did {group}'s gross margin move too far in a single year to be a genuine change in "
        "the business, rather than a shift in product mix or an accounting change?",
    "goodwill_base_effect":
        "Is a large write-down in an earlier year making {group}'s recent profit growth look "
        "stronger than the underlying business actually improved?",
    "ebit_cv":
        "Are {group}'s earnings swinging so much from year to year that a single year says "
        "little about the real earning power, so that a multi-year average is the fairer read?",
    "deferred_rev_drawdown":
        "Is {group} pulling sales forward from future periods, drawing down deferred revenue "
        "while still reporting growth in the current year?",
    "base_year_growth":
        "Is {group}'s headline growth rate this year mostly a rebound off a depressed or "
        "loss-making prior year, rather than real new progress?",
    "receivables_vs_revenue":
        "Are {group}'s receivables growing faster than its sales, which can mean revenue is "
        "being booked ahead of the cash actually arriving?",
    "leverage_roe":
        "Is {group}'s return on equity being lifted by heavier borrowing rather than by the "
        "businesses earning more on their assets, and does that borrowing change how much the "
        "profitability can be trusted?",
    "roe_roic_sign":
        "Do {group}'s return on equity and return on invested capital point in the same "
        "direction, or do the two disagree in a way that suggests the equity figure is "
        "distorted by buybacks or negative book value?",
    "top5_concentration":
        "Is {group}'s size-weighted average really describing the whole field, or is the "
        "average dominated by a handful of the largest companies?",
    "composition_drift":
        "Is {group}'s average this year measured on roughly the same set of companies as last "
        "year, so that a year-over-year change reflects the businesses rather than a changed "
        "list of members?",
    "plausibility_bounds":
        "Did any of {group}'s inputs hit the extreme-value guardrails, meaning the raw figure "
        "was too large or too small to display and should be read as not meaningful rather "
        "than as a precise number?",
    "rank_3y_median":
        "Would {group}'s standing against its peers hold up if the group were judged on "
        "three-year median figures rather than on a single, possibly unusual, year?",
}

# Theme each question belongs to (drives the two frontend groups).
TIER_ONE_TIME = "One-time gains and outliers"
TIER_AVERAGING = "How the average is built"
TIER: dict[str, str] = {
    "nonop_income_share": TIER_ONE_TIME, "ocf_ni": TIER_ONE_TIME,
    "margin_vs_median": TIER_ONE_TIME, "tax_windfall": TIER_ONE_TIME,
    "gm_swing": TIER_ONE_TIME, "goodwill_base_effect": TIER_ONE_TIME,
    "ebit_cv": TIER_ONE_TIME, "deferred_rev_drawdown": TIER_ONE_TIME,
    "base_year_growth": TIER_ONE_TIME, "receivables_vs_revenue": TIER_ONE_TIME,
    "leverage_roe": TIER_AVERAGING, "roe_roic_sign": TIER_AVERAGING,
    "top5_concentration": TIER_AVERAGING, "composition_drift": TIER_AVERAGING,
    "plausibility_bounds": TIER_AVERAGING, "rank_3y_median": TIER_AVERAGING,
}


def _check(group: str, check_id: str, severity: str, value: Optional[float],
           threshold: Optional[float], detail: str) -> dict[str, Any]:
    return {
        "id": check_id,
        "question": QUESTIONS[check_id].format(group=group),
        "tier": TIER[check_id],
        "severity": severity,
        "value": value,
        "threshold": threshold,
        "detail": detail,
    }


def _sev(value: float, base: float) -> str:
    """medium at the base threshold, high at 2×. (Floor-style checks like
    OCF/NI inline their own two-constant logic instead.)"""
    return "high" if value >= base * 2 else "medium"


def _pct(x: Optional[float]) -> str:
    return "n/a" if x is None else f"{x * 100:.0f}%"


def _median(vals: list[float]) -> Optional[float]:
    clean = sorted(v for v in vals if v is not None)
    if not clean:
        return None
    n = len(clean)
    mid = n // 2
    return clean[mid] if n % 2 else (clean[mid - 1] + clean[mid]) / 2.0


def _series(by_year: dict[int, dict[str, Any]], col: str,
            years: list[int]) -> list[Optional[float]]:
    return [
        (by_year.get(y) or {}).get(col) for y in years
    ]


def build_group_integrity(
    group: str,
    by_year: dict[int, dict[str, Any]],
    *,
    peers_by_year: Optional[dict[str, dict[int, dict[str, Any]]]] = None,
    comps: Optional[list[dict[str, Any]]] = None,
    matrix_col: Optional[dict[str, Any]] = None,
    clip: Optional[dict[str, tuple[float, float]]] = None,
    equity_lens: bool = False,
) -> list[dict[str, Any]]:
    """The 16 integrity checks for one group.

    ``by_year``: {year: {stored/derived column: decimal value}} from
    compute_*_averages_by_year (this group only). ``peers_by_year`` is the
    same shape for every peer group (for the rank-persistence check).
    ``comps`` are the group's per-company matrix dicts (concentration).
    ``matrix_col`` + ``clip`` are the group's aggregated matrix column and the
    winsorisation bounds (saturation check). ``equity_lens`` marks
    Financials / Real Estate, where ROIC-based reads are skipped.
    """
    checks: list[dict[str, Any]] = []
    years = sorted(y for y in by_year if (by_year[y] or {}).get("_ticker_count", 0) >= 3)
    # Drop trailing partially-filed fiscal years (same 60%-of-prior-count rule
    # the sector page applies): mid-year, the newest "year" only contains the
    # companies that have filed so far, and every year-over-year read against
    # it is an artifact of the filing calendar, not the businesses.
    while len(years) >= 2:
        c_last = (by_year[years[-1]] or {}).get("_ticker_count") or 0
        c_prev = (by_year[years[-2]] or {}).get("_ticker_count") or 0
        if c_prev and c_last < 0.6 * c_prev:
            years.pop()
        else:
            break
    if not years:
        return checks
    latest = years[-1]
    prior = years[-2] if len(years) > 1 else None
    row = by_year.get(latest) or {}
    prow = (by_year.get(prior) or {}) if prior is not None else {}

    def g(col: str, yr_row: dict[str, Any] = row) -> Optional[float]:
        v = yr_row.get(col)
        return float(v) if isinstance(v, (int, float)) and math.isfinite(v) else None

    # Composition-sensitive checks (gross margin swing, deferred revenue) only
    # read cleanly when this year's mean covers roughly the same companies as
    # last year's. A changed universe moves the mean without any business change.
    c_now = (row or {}).get("_ticker_count") or 0
    c_prev = (prow or {}).get("_ticker_count") or 0
    stable_universe = bool(c_prev) and abs(c_now - c_prev) / c_prev <= STABLE_UNIVERSE

    # 1 · nonop_income_share (EM3): other income vs pretax profit.
    other, ibt = g("Total Other Income Expenses Net"), g("Income Before Tax")
    if other is not None and ibt is not None and ibt > 0:
        share = other / ibt
        if share > NONOP_SHARE:
            checks.append(_check(group,
                "nonop_income_share", _sev(share, NONOP_SHARE), share, NONOP_SHARE,
                f"Other income is {_pct(share)} of pretax profit in {latest}. "
                f"The flag trips at {_pct(NONOP_SHARE)}: asset sales, securities gains "
                "and settlements live in this line, and they rarely repeat."))
        else:
            checks.append(_check(group, "nonop_income_share", "ok", share, NONOP_SHARE,
                                 f"Other income is {_pct(share)} of pretax profit."))
    else:
        checks.append(_check(group, "nonop_income_share", "na", None, NONOP_SHARE,
                             "Other-income and pretax columns are not both available."))

    # 2 · ocf_ni: cash backing of reported profit.
    iq = g("Income Quality")
    if iq is not None and abs(iq) > IQ_SANE:
        iq = None  # ratio-of-means artifact (NI near zero explodes the mean)
    if iq is not None:
        if iq < INCOME_QUALITY_FLOOR:
            sev = "high" if iq < INCOME_QUALITY_BAD else "medium"
            checks.append(_check(group,
                "ocf_ni", sev, iq, INCOME_QUALITY_FLOOR,
                f"Operating cash flow is {iq:.2f}x net income in {latest}. Below "
                f"{INCOME_QUALITY_FLOOR:.2f}x, a growing share of profit is accruals, "
                "not cash."))
        else:
            checks.append(_check(group, "ocf_ni", "ok", iq, INCOME_QUALITY_FLOOR,
                                 f"Operating cash flow covers {iq:.2f}x of net income."))
    else:
        checks.append(_check(group, "ocf_ni", "na", None, INCOME_QUALITY_FLOOR,
                             "Income Quality (OCF/NI) is not available."))

    # 3 · margin_vs_median: Damodaran Ch.9 one-time screen at the group level.
    margins = [m for m in _series(by_year, "Operating Income Ratio", years) if m is not None]
    m_now = g("Operating Income Ratio")
    if m_now is not None and len(margins) >= 5:
        med = _median(margins)
        dev = abs(m_now - med) if med is not None else None
        if dev is not None and dev > MARGIN_MEDIAN_DEV:
            checks.append(_check(group,
                "margin_vs_median", _sev(dev, MARGIN_MEDIAN_DEV), dev, MARGIN_MEDIAN_DEV,
                f"Operating margin is {_pct(m_now)} in {latest} against a long-run median "
                f"of {_pct(med)}. A gap over {_pct(MARGIN_MEDIAN_DEV)} usually means "
                "one-time items or a cycle extreme, not a new normal."))
        elif dev is not None:
            checks.append(_check(group, "margin_vs_median", "ok", dev, MARGIN_MEDIAN_DEV,
                                 f"Operating margin sits {_pct(dev)} from its own median."))
    else:
        checks.append(_check(group, "margin_vs_median", "na", None, MARGIN_MEDIAN_DEV,
                             "Needs at least five years of operating margin history."))

    # 4 · tax_windfall: tax-retention lever jumping above its own norm.
    tb_series = [t for t in _series(by_year, "Tax Burden", years[-6:-1]) if t is not None]
    tb_now = g("Tax Burden")
    if tb_now is not None and len(tb_series) >= 3:
        tb_med = _median(tb_series)
        dev = (tb_now - tb_med) if tb_med is not None else None
        if dev is not None and dev > TAX_BURDEN_DEV:
            checks.append(_check(group,
                "tax_windfall", _sev(dev, TAX_BURDEN_DEV), dev, TAX_BURDEN_DEV,
                f"The group kept {_pct(tb_now)} of pretax profit in {latest} versus a "
                f"{_pct(tb_med)} norm. One-off tax benefits flatter net income and do "
                "not repeat."))
        elif dev is not None:
            checks.append(_check(group, "tax_windfall", "ok", dev, TAX_BURDEN_DEV,
                                 f"Tax retention is {_pct(tb_now)}, near its own norm."))
    else:
        checks.append(_check(group, "tax_windfall", "na", None, TAX_BURDEN_DEV,
                             "Needs a few years of tax-burden history."))

    # 5 · gm_swing (KM1): gross margin moving faster than businesses change.
    gm_now, gm_prev = g("Gross Profit Ratio"), g("Gross Profit Ratio", prow)
    if gm_now is not None and gm_prev is not None and not stable_universe:
        checks.append(_check(group, "gm_swing", "na", None, GM_JUMP,
                             "Skipped: the measured universe changed too much this "
                             "year for a margin swing to be readable."))
    elif gm_now is not None and gm_prev is not None:
        swing = abs(gm_now - gm_prev)
        if swing > GM_JUMP:
            checks.append(_check(group,
                "gm_swing", _sev(swing, GM_JUMP), swing, GM_JUMP,
                f"Gross margin moved {_pct(swing)} in one year ({_pct(gm_prev)} to "
                f"{_pct(gm_now)}). Cost structures rarely move that fast; mix shifts "
                "and accounting changes do."))
        else:
            checks.append(_check(group, "gm_swing", "ok", swing, GM_JUMP,
                                 f"Gross margin moved {_pct(swing)} year over year."))
    else:
        checks.append(_check(group, "gm_swing", "na", None, GM_JUMP,
                             "Needs gross margin for the latest two years."))

    # 6 · goodwill_base_effect: last year's write-down inflating this year's growth.
    gw_prev2 = g("Goodwill", by_year.get(years[-3]) or {}) if len(years) > 2 else None
    gw_prev, ni_g = g("Goodwill", prow), g("Net Income Growth")
    if gw_prev is not None and gw_prev2 is not None and gw_prev2 > 0 and ni_g is not None:
        drop = (gw_prev2 - gw_prev) / gw_prev2
        if drop > GOODWILL_DROP and ni_g > 0.25:
            checks.append(_check(group,
                "goodwill_base_effect", _sev(drop, GOODWILL_DROP), drop, GOODWILL_DROP,
                f"Aggregate goodwill fell {_pct(drop)} into {prior}, then profit growth "
                f"came in at {_pct(ni_g)} in {latest}. Growth off a written-down base "
                "overstates the recovery."))
        else:
            checks.append(_check(group, "goodwill_base_effect", "ok", drop, GOODWILL_DROP,
                                 f"No write-down-then-rebound pattern in goodwill."))
    else:
        checks.append(_check(group, "goodwill_base_effect", "na", None, GOODWILL_DROP,
                             "Needs three years of goodwill plus profit growth."))

    # 7 · ebit_cv: lumpy earnings make single-year reads unreliable. Measured
    # as the variability (std) of YoY operating-income growth, not the CV of
    # the level — a steadily growing aggregate has a large level-CV from
    # growth alone, which is not lumpiness.
    oi_series = _series(by_year, "Operating Income", years)
    growths: list[float] = []
    for a, b in zip(oi_series, oi_series[1:]):
        if a is not None and b is not None and a > 0:
            grw = b / a - 1.0
            if abs(grw) <= 3.0:  # beyond ±300% is a data artifact, not a cycle
                growths.append(grw)
    if len(growths) >= 5:
        # Trim the single most extreme year before measuring spread: one shock
        # (2020) should not brand every sector cyclical — only groups that
        # swing REPEATEDLY should fire.
        mean_all = sum(growths) / len(growths)
        trimmed = sorted(growths, key=lambda x: abs(x - mean_all))[:-1]
        mean_g = sum(trimmed) / len(trimmed)
        std_g = math.sqrt(sum((x - mean_g) ** 2 for x in trimmed) / (len(trimmed) - 1))
        if std_g > EARN_GROWTH_STD:
            checks.append(_check(group,
                "ebit_cv", _sev(std_g, EARN_GROWTH_STD), std_g, EARN_GROWTH_STD,
                f"Year-over-year operating income swings with a spread of "
                f"{_pct(std_g)} around its average (flag at {_pct(EARN_GROWTH_STD)}). "
                "In a group this cyclical, one strong year says little; judge it on "
                "multi-year medians."))
        else:
            checks.append(_check(group, "ebit_cv", "ok", std_g, EARN_GROWTH_STD,
                                 f"Operating income growth is steady "
                                 f"(spread {_pct(std_g)} around its average)."))
    else:
        checks.append(_check(group, "ebit_cv", "na", None, EARN_GROWTH_STD,
                             "Needs at least six years of positive operating income."))

    # 8 · deferred_rev_drawdown: shrinking backlog while booking growth.
    # Composition-sensitive (an aggregate mean drifts when the universe turns
    # over) and meaningless for banks/REITs, so guarded on both.
    dr_now, dr_prev, rev_g = g("Deferred Revenue"), g("Deferred Revenue", prow), g("Revenue Growth")
    if equity_lens:
        checks.append(_check(group, "deferred_rev_drawdown", "na", None, DEFREV_DRAWDOWN,
                             "Skipped: deferred revenue is not a pull-forward "
                             "signal for banks and property groups."))
    elif dr_now is not None and dr_prev is not None and not stable_universe:
        checks.append(_check(group, "deferred_rev_drawdown", "na", None, DEFREV_DRAWDOWN,
                             "Skipped: the measured universe changed too much "
                             "this year for the backlog trend to be readable."))
    elif dr_now is not None and dr_prev is not None and dr_prev > 0 and rev_g is not None:
        draw = (dr_prev - dr_now) / dr_prev
        if draw > DEFREV_DRAWDOWN and rev_g > 0:
            checks.append(_check(group,
                "deferred_rev_drawdown", _sev(draw, DEFREV_DRAWDOWN), draw, DEFREV_DRAWDOWN,
                f"Deferred revenue fell {_pct(draw)} while reported revenue grew "
                f"{_pct(rev_g)}. That reads as demand pulled forward from next year."))
        else:
            checks.append(_check(group, "deferred_rev_drawdown", "ok", draw, DEFREV_DRAWDOWN,
                                 "Deferred revenue is not being drawn down."))
    else:
        checks.append(_check(group, "deferred_rev_drawdown", "na", None, DEFREV_DRAWDOWN,
                             "Deferred-revenue data is not available for both years."))

    # 9 · base_year_growth: big growth off a crushed or negative base.
    ni_series = _series(by_year, "Net Income", years)
    ni_growth = g("Net Income Growth")
    ni_prev = g("Net Income", prow)
    if ni_growth is not None and ni_growth > BASE_GROWTH_BIG and len(ni_series) >= 3:
        prior_vals = [v for v in ni_series[:-1] if v is not None]
        avg3 = sum(prior_vals[-3:]) / len(prior_vals[-3:]) if prior_vals else None
        depressed = (ni_prev is not None and ni_prev <= 0) or (
            ni_prev is not None and avg3 is not None and avg3 > 0 and ni_prev < 0.5 * avg3
        )
        if depressed:
            checks.append(_check(group,
                "base_year_growth", "medium", ni_growth, BASE_GROWTH_BIG,
                f"Profit growth of {_pct(ni_growth)} in {latest} comes off a depressed "
                f"{prior} base. Treat the percentage as not meaningful; look at the "
                "level against 3-year history instead."))
        else:
            checks.append(_check(group, "base_year_growth", "ok", ni_growth, BASE_GROWTH_BIG,
                                 f"Growth of {_pct(ni_growth)} sits on a normal base."))
    elif ni_growth is not None:
        checks.append(_check(group, "base_year_growth", "ok", ni_growth, BASE_GROWTH_BIG,
                             f"Profit growth is {_pct(ni_growth)}."))
    else:
        checks.append(_check(group, "base_year_growth", "na", None, BASE_GROWTH_BIG,
                             "Net income growth is not available."))

    # 10 · receivables_vs_revenue (EM1): booking sales faster than collecting.
    # Aggregate growth means are un-winsorised; a single tiny-base outlier can
    # print a nonsense figure, so anything beyond ±100% is treated as an
    # artifact rather than a signal.
    recv_g = g("Receivables Growth")
    if recv_g is not None and rev_g is not None and (
            abs(recv_g) > AGG_GROWTH_SANE or abs(rev_g) > AGG_GROWTH_SANE):
        checks.append(_check(group, "receivables_vs_revenue", "na", None, RECV_GAP,
                             "Skipped: the aggregate growth figures are outside a "
                             "plausible range this year (small-base outliers)."))
    elif recv_g is not None and rev_g is not None:
        gap = recv_g - rev_g
        if gap > RECV_GAP:
            checks.append(_check(group,
                "receivables_vs_revenue", _sev(gap, RECV_GAP), gap, RECV_GAP,
                f"Receivables grew {_pct(gap)} faster than revenue in {latest}. Sales "
                "booked ahead of cash is the classic end-of-cycle tell."))
        else:
            checks.append(_check(group, "receivables_vs_revenue", "ok", gap, RECV_GAP,
                                 "Receivables are growing in line with revenue."))
    else:
        checks.append(_check(group, "receivables_vs_revenue", "na", None, RECV_GAP,
                             "Receivables growth is not available."))

    # 11 · leverage_roe: the 2017 Consumer Cyclical catch. Three triggers, any
    # one fires (two or more escalate to high):
    #   a) ROE jumped while ROA went nowhere (return made on the equity line);
    #   b) the equity multiplier itself jumped — robust even when the raw
    #      cap-weighted ROE mean is poisoned by negative-book-equity outliers;
    #   c) structurally levered: high ROE on thin ROA at high leverage.
    roe_now, roe_prev = g("ROE"), g("ROE", prow)
    roa_now, roa_prev = g("ROA"), g("ROA", prow)
    lev_now, lev_prev = g("Financial Leverage"), g("Financial Leverage", prow)
    if not equity_lens and (roe_now is not None or lev_now is not None):
        jump = (roe_now - roe_prev) if (roe_now is not None and roe_prev is not None) else None
        roa_flat = (roa_now is not None and roa_prev is not None and roa_now <= roa_prev)
        lev_jump = (lev_now / lev_prev - 1.0) if (lev_now and lev_prev and lev_prev > 0) else None
        trig_roe = jump is not None and jump > ROE_JUMP and roa_flat
        trig_lev = lev_jump is not None and lev_jump > LEVERAGE_JUMP and roa_flat
        trig_abs = (roe_now is not None and roe_now > 0.15
                    and roa_now is not None and roa_now < 0.05
                    and lev_now is not None and lev_now > LEVERAGE_HIGH)
        n_trig = sum((trig_roe, trig_lev, trig_abs))
        if n_trig:
            parts = []
            if trig_roe:
                parts.append(f"ROE jumped {_pct(jump)} in a year while ROA fell")
            if trig_lev:
                parts.append(f"the equity multiplier rose {_pct(lev_jump)} to "
                             f"{lev_now:.1f}x while ROA fell")
            if trig_abs:
                parts.append(f"ROE is {_pct(roe_now)} on just {_pct(roa_now)} ROA at "
                             f"{lev_now:.1f}x leverage")
            checks.append(_check(group,
                "leverage_roe", "high" if n_trig >= 2 else "medium",
                roe_now if roe_now is not None else lev_now, ROE_JUMP,
                "; ".join(parts).capitalize() + ". The return is coming from the "
                "balance sheet, not the business. Buybacks that shrink book equity "
                "make ROE look brilliant right before it reverses."))
        else:
            checks.append(_check(group, "leverage_roe", "ok", roe_now, ROE_JUMP,
                                 f"ROE ({_pct(roe_now)}) is consistent with ROA and leverage."))
    else:
        checks.append(_check(group, "leverage_roe", "na", None, ROE_JUMP,
                             "Skipped: leverage is the business model here, so this "
                             "read uses ROE against cost of equity instead."))

    # 12 · roe_roic_sign: opposite signs mean the equity base is distorted.
    roic_now = g("ROIC")
    if not equity_lens and roe_now is not None and roic_now is not None:
        disagree = (roe_now > SIGN_DISAGREE_MIN and roic_now < -SIGN_DISAGREE_MIN) or \
                   (roe_now < -SIGN_DISAGREE_MIN and roic_now > SIGN_DISAGREE_MIN)
        if disagree:
            checks.append(_check(group,
                "roe_roic_sign", "high", roe_now, None,
                f"ROE says {_pct(roe_now)} while ROIC says {_pct(roic_now)}. When the "
                "two disagree this hard, the equity denominator is broken (usually "
                "negative book equity from buybacks). Trust ROIC."))
        else:
            checks.append(_check(group, "roe_roic_sign", "ok", roe_now, None,
                                 "ROE and ROIC point the same way."))
    else:
        checks.append(_check(group, "roe_roic_sign", "na", None, None,
                             "Skipped for equity-lens groups (ROIC undefined)."))

    # 13 · top5_concentration: how much of the "average" is five companies.
    if comps:
        caps = sorted((c.get("_mc") or 0.0 for c in comps), reverse=True)
        total = sum(caps)
        if total > 0 and len(caps) >= 5:
            share = sum(caps[:5]) / total
            if share > TOP5_SHARE:
                checks.append(_check(group,
                    "top5_concentration", _sev(share, TOP5_SHARE, ), share, TOP5_SHARE,
                    f"The five largest companies are {_pct(share)} of this group's "
                    f"weight ({len(caps)} companies total). This average is mostly "
                    "their story; read it that way."))
            else:
                checks.append(_check(group, "top5_concentration", "ok", share, TOP5_SHARE,
                                     f"Top-5 weight share is {_pct(share)}."))
        else:
            checks.append(_check(group, "top5_concentration", "na", None, TOP5_SHARE,
                                 "Fewer than five companies in the group."))
    else:
        checks.append(_check(group, "top5_concentration", "na", None, TOP5_SHARE,
                             "Per-company weights not supplied."))

    # 14 · composition_drift: the universe changed under the average. Checked
    # both year-over-year and cumulatively over two years (a steady 12-15%
    # annual drift compounds into a different universe fast).
    counts = [(y, (by_year.get(y) or {}).get("_ticker_count")) for y in years]
    counts = [(y, c) for y, c in counts if c]
    if len(counts) >= 2:
        (y0, c0), (y1, c1) = counts[-2], counts[-1]
        swing = abs(c1 - c0) / c0 if c0 else 0.0
        base_y, base_c = (counts[-3] if len(counts) >= 3 else counts[-2])
        cum = abs(c1 - base_c) / base_c if base_c else 0.0
        worst = max(swing, cum)
        if worst > COMPOSITION_SWING:
            span = f"{base_y}: {base_c} companies, {y1}: {c1}" if cum >= swing \
                else f"{y0}: {c0} companies, {y1}: {c1}"
            checks.append(_check(group,
                "composition_drift", _sev(worst, COMPOSITION_SWING), worst, COMPOSITION_SWING,
                f"The measured universe changed {_pct(worst)} ({span}). Year-over-year "
                "'change' partly reflects different companies, not changed businesses."))
        else:
            checks.append(_check(group, "composition_drift", "ok", worst, COMPOSITION_SWING,
                                 f"Universe is stable ({c0} to {c1} companies)."))
    else:
        checks.append(_check(group, "composition_drift", "na", None, COMPOSITION_SWING,
                             "Needs ticker counts for two consecutive years."))

    # 15 · plausibility_bounds: aggregates pinned at their winsorisation caps.
    if matrix_col is not None and clip:
        pinned: list[str] = []
        for key, (lo, hi) in clip.items():
            v = matrix_col.get(key)
            if isinstance(v, (int, float)) and math.isfinite(v):
                span = (hi - lo) or 1.0
                if abs(v - lo) < 1e-9 or abs(v - hi) < 1e-9 or \
                        min(abs(v - lo), abs(v - hi)) < 0.001 * span:
                    pinned.append(key)
        if pinned:
            checks.append(_check(group,
                "plausibility_bounds", "medium", float(len(pinned)), None,
                f"These metrics sit exactly at their guardrail bounds: "
                f"{', '.join(sorted(pinned))}. A pinned value means the raw number "
                "was more extreme than the display allows; treat it as 'not "
                "meaningful', not as a precise reading."))
        else:
            checks.append(_check(group, "plausibility_bounds", "ok", 0.0, None,
                                 "No metric is pinned at a guardrail bound."))
    else:
        checks.append(_check(group, "plausibility_bounds", "na", None, None,
                             "Winsorisation bounds not supplied."))

    # 16 · rank_3y_median: does the headline rank survive a 3-year view?
    rank_col = "ROE" if equity_lens else "ROIC"
    if peers_by_year and len(peers_by_year) >= 3:
        def latest_val(peer: dict[int, dict[str, Any]]) -> Optional[float]:
            yrs = sorted(y for y in peer if (peer[y] or {}).get(rank_col) is not None)
            return peer[yrs[-1]].get(rank_col) if yrs else None

        def med3_val(peer: dict[int, dict[str, Any]]) -> Optional[float]:
            yrs = sorted(y for y in peer if (peer[y] or {}).get(rank_col) is not None)
            vals = [peer[y][rank_col] for y in yrs[-3:]]
            return _median(vals) if len(vals) >= 2 else None

        latest_vals = {p: latest_val(v) for p, v in peers_by_year.items()}
        med_vals = {p: med3_val(v) for p, v in peers_by_year.items()}

        def rank_of(vals: dict[str, Optional[float]]) -> Optional[int]:
            clean = {p: v for p, v in vals.items() if v is not None}
            if group not in clean or len(clean) < 3:
                return None
            ordered = sorted(clean.items(), key=lambda kv: -kv[1])
            return next(i + 1 for i, (p, _v) in enumerate(ordered) if p == group)

        r1, r3 = rank_of(latest_vals), rank_of(med_vals)
        if r1 is not None and r3 is not None:
            drift = abs(r1 - r3)
            if drift > RANK_DRIFT:
                checks.append(_check(group,
                    "rank_3y_median", "medium", float(drift), float(RANK_DRIFT),
                    f"On this year's {rank_col} the group ranks #{r1} of its peers; on "
                    f"three-year medians it ranks #{r3}. A gap that wide says the "
                    "current standing leans on one unusual year."))
            else:
                checks.append(_check(group, "rank_3y_median", "ok", float(drift), float(RANK_DRIFT),
                                     f"Rank #{r1} now vs #{r3} on 3-year medians."))
        else:
            checks.append(_check(group, "rank_3y_median", "na", None, float(RANK_DRIFT),
                                 f"Not enough peer {rank_col} history to compare ranks."))
    else:
        checks.append(_check(group, "rank_3y_median", "na", None, float(RANK_DRIFT),
                             "Peer history not supplied."))

    return checks


def fired(checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Only the checks that actually tripped, worst first."""
    order = {"high": 0, "medium": 1}
    hit = [c for c in checks if c.get("severity") in order]
    return sorted(hit, key=lambda c: order[c["severity"]])
