"""
marketdata/refresh.py  (new — scoped in-process refresh + scheduler)

Keeps the ported market data fresh *inside the FastAPI process* — no external
Windows Task Scheduler jobs. Mirrors the autonomous daemon pattern already used
by ``backend/api.py`` for the weekly market-PE aggregate: a daemon thread wakes
periodically and runs only the refresh tasks whose staleness gate has expired, so
a daily series is never refetched on every tick.

Cadences (staleness gates), matching valuation_debug's monitor_freshness:
  * FRED treasury/inflation/EPU-US  — daily   (1 day)
  * Shiller (CAPE/earnings/price)    — weekly  (7 days)
  * GPR + global EPU                 — weekly  (7 days)
  * market_inputs (rf + implied ERP) — daily   (1 day; also pulls Damodaran ERP,
                                                 whose .xls is cached ~30 days)

Sector ETF prices are NOT handled here — they are served live through the
``/api/sector-etf`` endpoint under a 15-minute TTL cache (see backend/api.py).
"""

from __future__ import annotations

import datetime as _dt
import logging
import os
import threading
import time
from typing import Callable

from . import CACHE_DIR, connect

log = logging.getLogger("marketdata.refresh")

# Staleness gates in days.
GATE_FRED = 1.0
GATE_SHILLER = 7.0
GATE_GEO = 7.0
GATE_MARKET_INPUTS = 1.0
# Damodaran industry beta/EV-Sales datasets (backend/betas): he updates the
# published files roughly annually with intra-year refreshes; monthly re-check
# is plenty. (This deliberately reverses the old "no industry Damodaran data
# in the scheduler" rule for these two datasets ONLY — the bottom-up beta
# engine depends on them; the wacc/margin/pe datasets remain out of scope.)
GATE_DAMODARAN_IND = 30.0

_STARTUP_DELAY = 8.0          # let the app finish booting before first fetch
_CHECK_INTERVAL = 3600.0      # re-check hourly; per-task gates enforce cadence

_lock = threading.Lock()
_running = {"v": False}


# ── individual refresh tasks ──────────────────────────────────────────────────


def refresh_fred(conn, *, force: bool = False) -> dict[str, int]:
    from .fred_client import FredClient
    return FredClient(cache_dir=str(CACHE_DIR)).refresh_catalog(conn, force=force)


def refresh_shiller(conn, *, force: bool = False) -> int:
    from .shiller_data import ShillerData
    rows = ShillerData(cache_dir=str(CACHE_DIR)).load(force=force)
    return ShillerData(cache_dir=str(CACHE_DIR)).store(conn, rows)


def refresh_geo(conn, *, force: bool = False) -> dict[str, int]:
    from .geopolitical_data import refresh_geopolitical
    return refresh_geopolitical(conn, cache_dir=str(CACHE_DIR), force=force)


def refresh_market_inputs(conn, *, force: bool = False) -> dict[str, object]:
    from .market_inputs import get_live_wacc_params, historical_implied_erp_series
    p = get_live_wacc_params(conn, cache_dir=str(CACHE_DIR), persist=True)
    hist = historical_implied_erp_series(conn)
    return {
        "rf": p.risk_free_rate, "erp": p.equity_risk_premium,
        "method": p.erp_method, "erp_years": len(hist),
    }


# ── staleness helpers ─────────────────────────────────────────────────────────


def _age_days(ts: str | None) -> float | None:
    if not ts:
        return None
    try:
        return (_dt.datetime.now() - _dt.datetime.fromisoformat(ts)).total_seconds() / 86400.0
    except ValueError:
        return None


def _newest_macro(conn, series_ids: list[str]) -> str | None:
    qmarks = ",".join("?" * len(series_ids))
    try:
        row = conn.execute(
            f"SELECT MAX(fetched_at) FROM macro_series WHERE series_id IN ({qmarks})",
            series_ids,
        ).fetchone()
    except Exception as exc:  # noqa: BLE001
        log.debug("_newest_macro: staleness lookup failed for %s: %s", series_ids, exc)
        return None
    return row[0] if row else None


def _newest_single(conn, sql: str) -> str | None:
    try:
        row = conn.execute(sql).fetchone()
    except Exception as exc:  # noqa: BLE001
        log.debug("_newest_single: staleness lookup failed: %s", exc)
        return None
    return row[0] if row else None


def _is_stale(age: float | None, gate: float) -> bool:
    return age is None or age >= gate


# ── orchestration ─────────────────────────────────────────────────────────────


def run_due(*, force: bool = False) -> bool:
    """Run every refresh task whose gate has expired. Returns True if any ran."""
    ran = False
    conn = connect()
    try:
        fred_stale = force or _is_stale(
            _age_days(_newest_macro(conn, ["DGS1", "DGS10", "T10YIE", "USEPUINDXD"])),
            GATE_FRED,
        )
        shiller_stale = force or _is_stale(
            _age_days(_newest_single(conn, "SELECT MAX(fetched_at) FROM shiller_sp500")),
            GATE_SHILLER,
        )
        geo_stale = force or _is_stale(
            _age_days(_newest_macro(conn, ["GPR", "GEPUCURRENT"])), GATE_GEO,
        )
        mi_stale = force or _is_stale(
            _age_days(_newest_single(conn, "SELECT MAX(computed_at) FROM market_inputs")),
            GATE_MARKET_INPUTS,
        )

        if fred_stale:
            try:
                log.info("[marketdata] FRED refresh: %s", refresh_fred(conn))
                ran = True
            except Exception as e:  # noqa: BLE001
                log.warning("[marketdata] FRED refresh failed: %s", e)
        if shiller_stale:
            try:
                n = refresh_shiller(conn)
                log.info("[marketdata] Shiller refresh: %d rows", n)
                ran = True
            except Exception as e:  # noqa: BLE001
                log.warning("[marketdata] Shiller refresh failed: %s", e)
        if geo_stale:
            try:
                log.info("[marketdata] GPR/EPU refresh: %s", refresh_geo(conn))
                ran = True
            except Exception as e:  # noqa: BLE001
                log.warning("[marketdata] GPR/EPU refresh failed: %s", e)
        # market_inputs depends on fresh Shiller + DGS10 in the DB.
        if mi_stale or fred_stale or shiller_stale:
            try:
                log.info("[marketdata] market_inputs refresh: %s", refresh_market_inputs(conn))
                ran = True
            except Exception as e:  # noqa: BLE001
                log.warning("[marketdata] market_inputs refresh failed: %s", e)
    finally:
        conn.close()

    # Damodaran industry betas + EV/Sales live in financials.db (betas package
    # owns them), so this task runs outside the market_data.db connection.
    try:
        from betas.refresh import damodaran_asof, refresh_damodaran  # noqa: PLC0415
        if force or _is_stale(_age_days_date(damodaran_asof()), GATE_DAMODARAN_IND):
            log.info("[marketdata] Damodaran industry refresh: %s",
                     refresh_damodaran(force=force))
            ran = True
    except Exception as e:  # noqa: BLE001
        log.warning("[marketdata] Damodaran industry refresh failed: %s", e)
    return ran


def _age_days_date(iso_date: str | None) -> float | None:
    """Age of a plain ISO date (the damodaran asof column stores dates, not
    timestamps)."""
    if not iso_date:
        return None
    try:
        return (_dt.date.today() - _dt.date.fromisoformat(iso_date[:10])).days * 1.0
    except ValueError:
        return None


def refresh_all(*, force: bool = True) -> bool:
    """Force-run every refresh task (CLI / test entrypoint)."""
    return run_due(force=force)


# ── scheduler ─────────────────────────────────────────────────────────────────


def _loop(invalidate_cb: Callable[[str], object] | None) -> None:
    time.sleep(_STARTUP_DELAY)
    first = True
    while True:
        try:
            ran = run_due(force=False)
            if ran and invalidate_cb is not None:
                try:
                    invalidate_cb("econ")
                except Exception as exc:  # noqa: BLE001
                    log.warning("[marketdata] cache invalidation callback failed: %s", exc)
        except Exception as e:  # noqa: BLE001
            log.warning("[marketdata] scheduler tick error: %s", e)
        first = False  # noqa: F841 — kept for readability of the run cadence
        time.sleep(_CHECK_INTERVAL)


def start_scheduler(invalidate_cb: Callable[[str], object] | None = None) -> bool:
    """Start the background refresh daemon once. Returns False if disabled.

    Set ``DISABLE_MARKETDATA_REFRESH=1`` to turn it off (tests/dev)."""
    if os.environ.get("DISABLE_MARKETDATA_REFRESH") == "1":
        log.info("[marketdata] scheduler disabled via DISABLE_MARKETDATA_REFRESH")
        return False
    with _lock:
        if _running["v"]:
            return True
        _running["v"] = True
    threading.Thread(target=_loop, args=(invalidate_cb,), daemon=True).start()
    log.info("[marketdata] refresh scheduler started")
    return True
