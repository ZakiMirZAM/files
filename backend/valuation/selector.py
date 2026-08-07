"""Model-structure selection (Damodaran Ch. 12/13/14/15 decision rules).

Which cash-flow track, how many stages, and how long a high-growth period a
firm deserves are DECISIONS THE BOOK MAKES FROM OBSERVABLES, not free
parameters:

  * track — financials are valued on dividends ("we have no choice": a bank's
    reinvestment is unobservable), non-financials on FCFF (the safe default
    whenever the debt ratio may change, Ch. 15), loss-makers on the
    revenue-driven n-stage path (Ch. 11/22);
  * high-growth period length — Ch. 12's three factors (size, current excess
    returns, competitive advantage via the life-cycle stage), mapped to the
    book's own archetypes: Con Ed 0 years, P&G 5, Amgen 10;
  * stage count — already-stable firms take a single-stage perpetuity;
    moderate growers a two-stage ("a firm growing at 7 percent... more
    reasonable than one growing at 40 percent"); very high growth (the >25%
    rule of thumb) or multi-dimensional change takes three stages with a
    transition;
  * the H model — a cross-check only, for high-payout firms whose growth is
    already declining (Vodafone's profile).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

__all__ = ["ModelChoice", "high_growth_period", "select_model",
           "VERY_HIGH_GROWTH", "H_MODEL_MIN_PAYOUT"]

# Ch. 13.6 footnote: "growth rates over 25 percent would qualify as very high
# when the stable growth rate is 6 to 8 percent" — the three-stage trigger.
VERY_HIGH_GROWTH = 0.25
# The H model needs "high growth and high payout" — a firm paying out less
# has no dividend base for the model to work from (Ch. 13.5).
H_MODEL_MIN_PAYOUT = 0.40
# An excess return below this is noise, not a competitive advantage.
_EXCESS_SMALL = 0.02
# An excess return above this is a durable advantage worth a long window.
_EXCESS_LARGE = 0.08
# Ch. 12 size factor: small firms in large markets sustain excess returns
# longest. $5B mirrors the synthetic-rating size split used elsewhere.
_SMALL_CAP = 5e9


@dataclass(frozen=True)
class ModelChoice:
    track: str                    # "ddm" | "fcff" | "nstage"
    stages: int                   # recommended stage count: 1 | 2 | 3
    high_growth_years: int        # 0 | 5 | 10
    archetype: str                # "con-ed" | "pg" | "amgen"
    rationale: list[str] = field(default_factory=list)
    h_model_applicable: bool = False


def high_growth_period(stage: Optional[str],
                       excess_return: Optional[float],
                       size_usd: Optional[float],
                       g_fund: Optional[float],
                       rf: float) -> tuple[int, str, list[str]]:
    """Ch. 12's three determinants, scored to the book's archetypes.

    Returns (years, archetype, rationale sentences)."""
    reasons: list[str] = []
    score = 0

    if stage in ("emerging", "growth"):
        score += 2
        reasons.append("The company is still in its "
                       f"{'young' if stage == 'emerging' else 'high'}-growth "
                       "phase of the life cycle, which argues for a long "
                       "high-growth window.")
    elif stage == "mature":
        score += 1
        reasons.append("The company's revenue and margin history read as "
                       "mature, so the high-growth window is short.")
    elif stage == "declining":
        reasons.append("The company's history reads as declining; a "
                       "perpetual-decline stable model fits better than any "
                       "high-growth phase.")
    else:
        score += 1

    if excess_return is not None:
        if excess_return >= _EXCESS_LARGE:
            score += 2
            reasons.append(f"Returns run {excess_return:.0%} above the cost of "
                           "capital; an advantage that wide usually erodes "
                           "slowly, which lengthens the high-growth period.")
        elif excess_return >= _EXCESS_SMALL:
            score += 1
            reasons.append(f"Returns exceed the cost of capital by "
                           f"{excess_return:.0%}, a modest advantage that "
                           "competition should close over a few years.")
        else:
            reasons.append("Returns do not meaningfully exceed the cost of "
                           "capital; growth without excess returns adds no "
                           "value, so the high-growth window is short.")

    if size_usd is not None and size_usd < _SMALL_CAP and score > 0:
        score += 1
        reasons.append("A smaller company has more room to run before its own "
                       "scale becomes the constraint.")

    already_stable = (
        stage in ("mature", "declining")
        and (excess_return is None or excess_return < _EXCESS_SMALL)
        and (g_fund is None or g_fund <= rf)
    )
    if already_stable:
        reasons.append("Growth at or below the risk-free rate with no excess "
                       "returns is stable growth already; the perpetuity "
                       "starts today (the Con Ed case).")
        return 0, "con-ed", reasons

    if g_fund is not None and g_fund > VERY_HIGH_GROWTH:
        reasons.append(f"Fundamental growth of {g_fund:.0%} is far above any "
                       "stable rate; growth, reinvestment and risk all have to "
                       "change on the way down, which takes a transition "
                       "phase (the Amgen case).")
        return 10, "amgen", reasons

    if score >= 4:
        reasons.append("Taken together, the advantages support roughly a "
                       "decade of above-stable growth with a gradual descent "
                       "(the Amgen case).")
        return 10, "amgen", reasons
    reasons.append("A five-year high-growth window with an abrupt shift to "
                   "stable growth fits a moderate advantage (the P&G case).")
    return 5, "pg", reasons


def select_model(*,
                 fcff_ok: bool,
                 stage: Optional[str],
                 excess_return: Optional[float],
                 size_usd: Optional[float],
                 g_fund: Optional[float],
                 rf: float,
                 roic: Optional[float],
                 margin_current: Optional[float],
                 payout: Optional[float],
                 historical_growth: Optional[float]) -> ModelChoice:
    """The consolidated decision table."""
    rationale: list[str] = []

    if not fcff_ok:
        track = "ddm"
        rationale.append("For a financial company the reinvestment that drives "
                         "a cash-flow model is not observable, so the "
                         "valuation rests on the dividends the company "
                         "actually pays (with the FCFE regulatory-capital "
                         "model alongside).")
    elif roic is None or roic <= 0 or (margin_current is not None
                                       and margin_current < 0):
        track = "nstage"
        rationale.append("With negative returns on capital, growth cannot be "
                         "read off earnings; the valuation builds from the "
                         "revenue path, a margin that converges on the "
                         "industry's, and reinvestment tied to sales (the "
                         "young-company method).")
    else:
        track = "fcff"
        rationale.append("The firm model (FCFF at the cost of capital) is the "
                         "dependable choice whenever the mix of debt and "
                         "equity could shift over time.")

    n, archetype, period_reasons = high_growth_period(
        stage, excess_return, size_usd, g_fund, rf)
    rationale.extend(period_reasons)

    stages = 1 if n == 0 else (2 if n == 5 else 3)
    if track == "nstage":
        # The revenue-driven path always carries a full explicit period —
        # a loss-maker is never "already stable".
        stages = max(stages, 3)
        n = max(n, 10)
        archetype = "amgen"

    h_ok = bool(payout is not None and payout >= H_MODEL_MIN_PAYOUT
                and historical_growth is not None and g_fund is not None
                and historical_growth > (g_fund if g_fund is not None else 0)
                and stage in ("mature", "declining", None))

    return ModelChoice(track=track, stages=stages, high_growth_years=n,
                       archetype=archetype, rationale=rationale,
                       h_model_applicable=h_ok)
