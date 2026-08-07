"""Per-track fundamental growth estimators (Damodaran Ch. 11 / 13 / 14).

    FCFF track: g = reinvestment rate × ROIC  (+ efficiency term when the
                return on EXISTING capital is improving)
    FCFE track: g = equity reinvestment rate × noncash ROE  (+ the Tsingtao
                drifting-ROE term when a depressed ROE converges on a target)
    DDM track:  g = augmented retention × ROE  (buyback-inclusive payout)

Every estimator returns None when the data carries no signal — never a
fabricated rate. There are NO growth caps here: the only structural ceiling in
the engine is Damodaran's stable-phase constraint (g_stable ≤ the risk-free
rate), applied where terminal values are built, not where growth is measured.
Suspicious inputs produce diagnostics, not silent clamps.
"""
from __future__ import annotations

from typing import Any, Optional

from .inputs import (
    augmented_payout,
    equity_reinvestment_rate,
    median,
    noncash_roe,
    reinvestment_rate,
)

__all__ = ["fcff_growth", "fcfe_growth", "ddm_growth", "roe_drift_term"]

# Byte-compat values for the legacy delegate ONLY (see legacy_caps flag).
_LEGACY_REINVEST_CAP = 0.90
_LEGACY_EFFICIENCY_CAP = 0.10
# A latest-year reinvestment rate this far (in absolute rate points) from the
# firm's own multi-year median is a one-off (acquisition, disposal, WC swing),
# not a plan — the median speaks instead and a diagnostic says so (Ch. 11's
# treatment of lumpy/negative reinvestment).
_REINVEST_SPIKE_GAP = 0.50


def fcff_growth(rows: list[Any], roic: Optional[float], *,
                prev_roic: Optional[float] = None,
                prev2_roic: Optional[float] = None,
                legacy_caps: bool = False) -> Optional[dict]:
    """Firm-side fundamental growth: reinvestment rate × ROIC, plus the
    second-order efficiency term when the return on existing capital improves:

        g = RR × ROIC + (ROIC_now − ROIC_prior) / ROIC_prior

    ``prev_roic`` is injected by the caller (this package never imports the
    ratio engine). None when ROIC carries no signal (≤ 0) — those firms are
    valued on the revenue-driven sales-to-capital path instead.

    ``legacy_caps=True`` reproduces the pre-rebuild clamps exactly (reinvest
    capped to [0, 0.90], efficiency to 0.10) for VALUATION_ENGINE=legacy; the
    default measures without caps and emits diagnostics instead."""
    if not rows or roic is None or roic <= 0:
        return None
    latest = rows[-1]
    reinvest = reinvestment_rate(latest)
    if reinvest is None:
        return None

    diagnostics: list[dict] = []
    source = "latestYear"
    if legacy_caps:
        reinvest = max(0.0, min(reinvest, _LEGACY_REINVEST_CAP))
    else:
        # Lumpy-reinvestment handling (Ch. 11): a single year far off the
        # firm's own median is replaced by the median, with provenance.
        history = [reinvestment_rate(r) for r in rows[-4:]]
        med = median(history)
        if med is not None and abs(reinvest - med) > _REINVEST_SPIKE_GAP:
            diagnostics.append({
                "id": "reinvestment_spike",
                "detail": (f"Latest-year reinvestment rate {reinvest:.0%} sits far "
                           f"from the firm's own recent median {med:.0%}; the "
                           "median drives the growth estimate instead."),
                "latest": round(reinvest, 4), "median": round(med, 4),
            })
            reinvest = med
            source = "multiYearMedian"
        # A negative rate is kept: living off past investment IS negative
        # growth pressure (Ch. 11's deliberate-shrinkage case) — but say so.
        if reinvest < 0:
            diagnostics.append({
                "id": "negative_reinvestment",
                "detail": ("The firm is reinvesting less than nothing (disposals "
                           "or working-capital release exceed capex); fundamental "
                           "growth is negative until that reverses."),
                "value": round(reinvest, 4),
            })
    base = reinvest * roic

    efficiency = 0.0
    if prev_roic is not None and prev_roic > 0 and roic > prev_roic:
        raw_eff = (roic - prev_roic) / prev_roic
        if legacy_caps:
            efficiency = min(raw_eff, _LEGACY_EFFICIENCY_CAP)
        else:
            # The second-order term is growth from repricing EXISTING assets
            # at an improving return (Ch. 11, Con Ed). That only belongs in
            # the forecast when the improvement is a TREND the analyst can
            # expect to continue — a single-year jump is far more often a
            # restatement, a divestiture, or a margin blip, so it warns
            # instead of driving.
            persistent = (prev2_roic is not None and prev2_roic > 0
                          and prev_roic > prev2_roic)
            if persistent:
                efficiency = raw_eff
            else:
                diagnostics.append({
                    "id": "single_year_roic_jump",
                    "detail": (f"ROIC improved {raw_eff:.0%} against last year "
                               "without a supporting multi-year trend; the "
                               "efficiency-growth term is excluded from the "
                               "forecast and shown here instead — check what "
                               "changed."),
                    "value": round(raw_eff, 4),
                    "excludedFromGrowth": True,
                })

    out = {
        "growth": base + efficiency,
        "reinvestmentRate": round(reinvest, 4),
        "roic": round(roic, 4),
        "base": round(base, 4),
        "efficiencyTerm": round(efficiency, 4),
    }
    if not legacy_caps:
        out["reinvestmentSource"] = source
        out["diagnostics"] = diagnostics
    return out


def roe_drift_term(roe_now: float, roe_target: float, years: int) -> float:
    """The Tsingtao drifting-ROE growth component (Ch. 14, Illustration):
    annualized growth from an ROE converging on a higher target,

        [(ROE_target − ROE_now) / ROE_now] ^ (1/years) − 1
    """
    ratio = (roe_target - roe_now) / roe_now
    if ratio <= 0:
        return 0.0
    return ratio ** (1.0 / years) - 1.0


def fcfe_growth(rows: list[Any], *,
                window: int = 5,
                roe_target: Optional[float] = None,
                target_years: int = 5,
                err_override: Optional[float] = None,
                roe_override: Optional[float] = None) -> Optional[dict]:
    """Equity-side fundamental growth (Ch. 14):

        g = equity reinvestment rate × noncash ROE

    — NOT retention × ROE, which the book calls inconsistent with the FCFE
    premise that all free cash flow to equity is paid out ("It is far more
    consistent to replace the retention ratio with the equity reinvestment
    rate"). When today's ROE is depressed and a credible ``roe_target`` is
    supplied (industry norm), the Tsingtao form applies: g = ERR × ROE_target
    + the annualized drift term. Overrides exist for tests and for the book's
    assumed-forward-ROE convention."""
    err_info = None
    err = err_override
    if err is None:
        err_info = equity_reinvestment_rate(rows, window=window)
        if err_info is None:
            return None
        err = err_info["value"]

    roe_info = None
    roe = roe_override
    if roe is None:
        roe_info = noncash_roe(rows)
        if roe_info is None:
            return None
        roe = roe_info["value"]
    if roe is None or roe <= 0:
        return None

    drift = 0.0
    roe_used = roe
    if roe_target is not None and roe_target > roe > 0:
        drift = roe_drift_term(roe, roe_target, target_years)
        roe_used = roe_target

    out = {
        "growth": err * roe_used + drift,
        "equityReinvestmentRate": round(err, 4),
        "noncashRoe": round(roe, 4),
        "roeUsed": round(roe_used, 4),
        "roeDriftTerm": round(drift, 4),
    }
    if err_info is not None:
        out["netDebtSource"] = err_info["netDebtSource"]
        out["yearsUsed"] = err_info["yearsUsed"]
    if roe_info is not None:
        out["noncashNetIncome"] = roe_info["noncashNetIncome"]
        out["noncashBookEquity"] = roe_info["noncashBookEquity"]
    return out


def ddm_growth(rows: list[Any], *,
               window: int = 5,
               roe_override: Optional[float] = None) -> Optional[dict]:
    """Dividend-track fundamental growth (Ch. 13):

        g = (1 − augmented payout) × ROE

    with the augmented (buyback-inclusive) payout aggregated over 4-5 years
    and the ROE re-estimated with recent buybacks added back to book equity —
    both straight from Ch. 13.3. Falls back to the conventional payout when
    the repurchase data is absent (``buybacksIncluded`` says which ran)."""
    pay = augmented_payout(rows, window=window)
    if pay is None:
        return None
    roe = roe_override
    if roe is None:
        roe = pay["buybackAdjustedRoe"]
    if roe is None or roe <= 0:
        return None
    payout = pay["augmentedPayout"] if pay["buybacksIncluded"] else pay["conventionalPayout"]
    retention = 1.0 - payout
    return {
        "growth": retention * roe,
        "augmentedPayout": pay["augmentedPayout"],
        "conventionalPayout": pay["conventionalPayout"],
        "payoutUsed": round(payout, 4),
        "retention": round(retention, 4),
        "roeUsed": round(roe, 4),
        "buybacksIncluded": pay["buybacksIncluded"],
        "yearsUsed": pay["yearsUsed"],
    }
