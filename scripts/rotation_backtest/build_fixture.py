"""Build the offline fixture for the Sector Rotation backtest harness.

Produces two JSON files under scripts/rotation_backtest/data/ (gitignored):

  fixture_series.json   The FULL-HISTORY /api/economic payload. Built by calling
                        the backend's own economic() builder with MIN_YEAR
                        patched to 1990, so every transform (YoY series, real
                        money, the fed-model spread inputs, treasury curve)
                        is byte-identical to what the live page serves; only
                        the truncation year changes. Do NOT re-implement the
                        transforms here; drift between this fixture and the
                        page is exactly the bug this design avoids.

  fixture_returns.json  Monthly adjusted closes per app sector name from the
                        SPDR sector ETFs (backend/marketdata/sector_etf.py).

Run manually (network required; ~2-5 minutes cold, fast on warm FRED cache):

  python scripts/rotation_backtest/build_fixture.py

Then run the harness:

  cd frontend && npx vitest run rotationBacktest.harness

Honesty notes (also in frontend/src/lib/rotationBacktest.ts): FRED serves
latest-vintage values, so revised series are cleaner than a real-time investor
saw; ETF windows are limited by inception (XLRE 2015-10, XLC 2018-06); this
fixture validates hand-set rules and must never be used to fit the 47 weights.
"""

from __future__ import annotations

import inspect
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

OUT_DIR = Path(__file__).resolve().parent / "data"

FIXTURE_MIN_YEAR = 1990


def build_series() -> dict:
    import backend.api as api  # heavy import (~10s), injects backend/ onto sys.path

    api.MIN_YEAR = FIXTURE_MIN_YEAR
    # Unwrap the route decorators (limiter + TTL cache) to the raw builder.
    economic = inspect.unwrap(api.economic)

    class _DummyRequest:  # slowapi's decorator is unwrapped; body never reads it
        pass

    return economic(_DummyRequest())


def build_returns() -> dict:
    from marketdata.sector_etf import SECTOR_NAME_TO_TICKER, fetch_price_history

    out: dict[str, list[dict]] = {}
    for sector, ticker in SECTOR_NAME_TO_TICKER.items():
        rows = fetch_price_history(ticker, interval="1mo", start="2009-01-01")
        monthly: dict[str, float] = {}
        for date_str, price in rows:
            monthly[date_str[:7]] = float(price)  # last close wins per month
        out[sector] = [
            {"period": period, "close": close} for period, close in sorted(monthly.items())
        ]
        print(f"  {sector:<24} {ticker}  {len(out[sector])} months")
    return out


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Building full-history economic payload (MIN_YEAR={FIXTURE_MIN_YEAR})...")
    data = build_series()
    n_metrics = len(data.get("metrics", []))
    if n_metrics < 30:
        print(f"ERROR: only {n_metrics} metrics in the payload; refusing to write a thin fixture.")
        return 1
    series_path = OUT_DIR / "fixture_series.json"
    series_path.write_text(json.dumps(data, default=str), encoding="utf-8")
    print(f"  wrote {series_path} ({series_path.stat().st_size / 1e6:.1f} MB, {n_metrics} metrics)")

    print("Fetching monthly SPDR sector closes...")
    returns = build_returns()
    missing = [s for s, rows in returns.items() if len(rows) < 24]
    if missing:
        print(f"WARNING: thin return history for: {', '.join(missing)}")
    returns_path = OUT_DIR / "fixture_returns.json"
    returns_path.write_text(json.dumps(returns), encoding="utf-8")
    print(f"  wrote {returns_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
