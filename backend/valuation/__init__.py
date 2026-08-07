"""Damodaran multi-stage intrinsic-valuation engine.

Implements the growth-estimation, stage-selection and terminal-value framework
of Damodaran, *Investment Valuation* (Ch. 11 growth, Ch. 12 closure, Ch. 13
dividend discount models, Ch. 14 FCFE, Ch. 15 FCFF), replacing the legacy
clamped-growth DCF. Growth is endogenous per track:

    FCFF: reinvestment rate x ROIC (+ efficiency term)
    FCFE: equity reinvestment rate x noncash ROE
    DDM : augmented retention x ROE  (buyback-inclusive payout)

No growth rate is ever fabricated: an estimator that cannot derive a rate from
the data returns None and the engine surfaces {"applicable": False, "reason"}.
The only structural ceiling anywhere is Damodaran's stable-growth constraint
(g_stable <= the risk-free rate, his proxy for nominal economy growth).

The package never imports individualanalysis: discount-rate callables are
injected so the dependency points one way only.
"""
import os

__all__ = ["valuation_engine"]


def valuation_engine() -> str:
    """`VALUATION_ENGINE` in {damodaran, legacy}. Default `damodaran`.

    `damodaran` drives every valuation through this package's multi-stage
    engine. `legacy` is the byte-identical pre-rebuild behavior (rollback);
    under it the old clamped-growth paths run exactly as before. Re-read on
    every call so tests can flip it (same shape as growth_model / beta_mode).
    """
    mode = os.environ.get("VALUATION_ENGINE", "damodaran").strip().lower()
    return mode if mode in ("damodaran", "legacy") else "damodaran"
