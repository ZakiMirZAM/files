"""FastAPI server wiring the analysis Python scripts to the frontend.

Endpoints return data in the SectionData shape consumed by
`frontend/src/lib/types.ts`.

Run with:
    pip install -r backend/requirements.txt
    uvicorn backend.api:app --reload --port 8000

The frontend (port 5173) hits these endpoints; if the API is offline it falls
back to mock data so the UI keeps working during development.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
import re
import secrets
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Iterator, NamedTuple, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi import Path as PathParam
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware

# ── Path wiring ──────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.environ.get("FINANCIALS_DB", ROOT / "financials.db"))

for p in (ROOT / "backend", ROOT / "data", ROOT / "remediation"):
    sp = str(p)
    if sp not in sys.path:
        sys.path.insert(0, sp)

import ttm_lib  # noqa: E402 -- pure TTM/latest-row selection logic (Phase 4)
# The one upper bound on a market cap used as a WEIGHT, shared with
# industry_averages' SQL aggregates so the two weighting paths agree on which
# rows are corrupt. Imported outside the analysis try/except below because
# fx_convert is a pure module with no dependencies of its own, exactly like
# ttm_lib above, and the scorecard matrices need the bound whether or not the
# heavy analysis modules loaded.
from fx_convert import MAX_MARKET_CAP_USD  # noqa: E402
# The blank-group guard every sector/industry query carries, written once so
# dropping the TRIM half at one call site cannot happen quietly.
from group_sql import named_group_sql  # noqa: E402

MIN_YEAR = 2012

# ── Scorecard history depth (sector + industry matrices ONLY) ────────────────
# The clicked-cell charts on the sector/industry scorecards reach back to 2016 (a
# full cycle: pre-COVID, the 2020 shock, the 2022 rate shock, today). The
# comparative/ranking surfaces keep their own shorter windows — they are about
# who is cheap NOW, not about a decade of history.
#
# TWO windows, and conflating them is a bug:
#   SCORECARD_HISTORY_START — how far back the CHART goes. Includes companies
#       that are now delisted, which is the whole point (they were often the
#       largest names in their year).
#   _CURRENT_MIN_YEAR       — a company must have filed since this year to be in
#       the CURRENT column. Without it, widening the fetch would let a company
#       whose last filing was 2018 supply "latest" values to today's average.
SCORECARD_HISTORY_START = 2016
CURRENT_YEAR = datetime.date.today().year
MAX_YEAR = CURRENT_YEAR
# A company must have filed since this year to contribute to a CURRENT column.
# Unchanged from the previous 5-year window, so today's displayed numbers and
# constituent sets do not move when the history window deepens.
_CURRENT_MIN_YEAR = MAX_YEAR - 4
MIN_TICKERS_PER_GROUP_YEAR = 3


def _max_year() -> int:
    """Upper year bound re-derived per call — MAX_YEAR is frozen at import, which
    goes stale in a long-running process once the calendar year rolls over."""
    return datetime.date.today().year

log = logging.getLogger("api")
logging.basicConfig(level=logging.INFO, format="%(message)s")

ENV = os.environ.get("ENV", "development").lower()
IS_PRODUCTION = ENV == "production"

# TTM substitution mode for the per-company metric sites (Phase 4).
#   off    -> latest annual row only (byte-identical to pre-Phase-4 behavior)
#   on     -> substitute the stored rolling TTM row (annual fallback per column)
#   shadow -> valuations unchanged; TTM surfaced via _ttm_row for display
TTM_MODE = os.getenv("TTM_MODE", "off").lower()

# Hide the interactive docs / OpenAPI schema in production — they map every
# route (including the admin endpoints) for anyone who hits /docs.
app = FastAPI(
    title="IntrinsicFinEd API",
    version="0.5.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

# ── Import existing analysis modules ─────────────────────────────────────────
# These do the heavy lifting — DCF, CAPE, value scoring, verdicts, full ratio
# decomposition, horizontal/vertical analysis. Importing them once at startup
# costs ~10s (financial_db loads pandas + yfinance) but every subsequent call
# is fast.
try:
    from financial_db import (  # type: ignore
        FinancialDB, fetch_latest_market_cap_currency_yf, EXCEL_COLUMNS,
        capm_discount_rate,
    )
    import fx_convert  # type: ignore
    from valuation import valuation_engine  # type: ignore
    from individualanalysis import (  # type: ignore
        build_individual_snapshot,
        load_ticker_rows,
        lifecycle_from_series,
        DCF_WACC,
        DCF_TERMINAL_GROWTH,
        DCF_PROJECTION_YEARS,
        DISPLAY_METRICS,
        MARGINAL_TAX_RATE,
    )
    from comparitivestockanalysis import (  # type: ignore
        build_snapshot as build_comparative_snapshot,
        score_industry,
        RANKED_METRICS,
    )
    from industry_averages import (  # type: ignore
        compute_sector_averages_by_year,
        compute_industry_averages_by_year,
        compute_cape,
        compute_dcf,
        score_and_rank,
        METRIC_COLS as ALL_STORED_METRIC_COLS,
        ALL_DERIVED_NAMES,
        DERIVED_METRICS as ALL_DERIVED_SQL,
    )
    ANALYSIS_MODULES_OK = True
    log.info("[api] Loaded individualanalysis + comparitivestockanalysis + industry_averages")
except Exception as exc:  # noqa: BLE001
    ANALYSIS_MODULES_OK = False
    log.error("[api] Failed to import analysis modules: %s", exc)
    FinancialDB = None  # type: ignore[assignment]

    fx_convert = None  # type: ignore[assignment]

    def fetch_latest_market_cap_currency_yf(_ticker: str):  # type: ignore[misc]
        """Fallback when analysis modules fail to import — no live cap available,
        so callers keep the stored DB Market Cap."""
        return (None, None)

    def capm_discount_rate(beta, rf=None, erp=None, *, market_fallback=False):  # type: ignore[misc]
        """Import-failure stub mirroring financial_db.capm_discount_rate."""
        rf = 0.045 if rf is None else rf
        erp = 0.045 if erp is None else erp
        try:
            return rf + float(beta) * erp
        except (TypeError, ValueError):
            return (rf + erp) if market_fallback else 0.10

    MARGINAL_TAX_RATE = 0.21  # mirror of individualanalysis.MARGINAL_TAX_RATE

    def valuation_engine() -> str:  # type: ignore[misc]
        """Import-failure stub mirroring valuation.valuation_engine."""
        mode = os.environ.get("VALUATION_ENGINE", "damodaran").strip().lower()
        return mode if mode in ("damodaran", "legacy") else "damodaran"

_db_instance: Any = None


def get_db() -> Any:
    """Lazy singleton wrapping FinancialDB."""
    global _db_instance
    if _db_instance is None and ANALYSIS_MODULES_OK:
        _db_instance = FinancialDB(str(DB_PATH))
    return _db_instance


# ── Ported market-data package ───────────────────────────────────────────────
# Scoped port of valuation_debug's market-level sources (Shiller CAPE, Damodaran
# implied ERP + S&P-500 EPS, the S&P-500 valuation, EPU/GPR macro indices, sector
# SPDR prices). It keeps its own small SQLite DB + file cache and an in-process
# refresh scheduler — see backend/marketdata/. No sector/industry Damodaran
# benchmarks are ported. ``backend`` is already on sys.path (above), so the
# package imports as ``marketdata``.
try:
    from marketdata import connect as md_connect, CACHE_DIR as MD_CACHE_DIR  # type: ignore
    from marketdata import sector_etf as md_sector_etf  # type: ignore
    from marketdata import damodaran_market as md_damodaran  # type: ignore
    from marketdata import market_inputs as md_market_inputs  # type: ignore
    from marketdata import expected_returns as md_expected_returns  # type: ignore
    MARKETDATA_OK = True
    log.info("[api] Loaded marketdata package (CAPE/ERP/EPU/GPR/sector-ETF)")
except Exception as exc:  # noqa: BLE001
    MARKETDATA_OK = False
    md_connect = None  # type: ignore[assignment]
    MD_CACHE_DIR = ""  # type: ignore[assignment]
    log.error("[api] marketdata package import failed: %s", exc)

# ── Bottom-up beta engine (backend/betas/) ───────────────────────────────────
# Damodaran Ch.8 bottom-up betas: SEC EDGAR segments x Damodaran industry
# unlevered betas, relevered at the firm's own D/E, behind the BETA_RESOLVER
# flag (on|shadow|off). Failure-isolated like marketdata: if the package can't
# import, every consumer keeps the stored regression beta.
try:
    import betas as beta_engine  # type: ignore

    BETAS_OK = True
    log.info("[api] Loaded betas package (bottom-up beta engine, mode=%s)",
             beta_engine.beta_mode())
except Exception as exc:  # noqa: BLE001
    BETAS_OK = False
    beta_engine = None  # type: ignore[assignment]
    log.error("[api] betas package import failed: %s", exc)

# ── Group scoring (scorecard value score + integrity questions) ──────────────
# Sector/industry scorecard value score (group_scoring.score_groups, mirroring
# comparitivestockanalysis.score_industry in display units) plus the sixteen
# scorecard integrity questions. Failure-isolated: if the module can't import,
# the matrices simply ship without valueScore/_integrity/_history.
try:
    import group_scoring  # type: ignore

    GROUP_SCORING_OK = True
    log.info("[api] Loaded group_scoring (scorecard value score + integrity checks)")
except Exception as exc:  # noqa: BLE001
    GROUP_SCORING_OK = False
    group_scoring = None  # type: ignore[assignment]
    log.error("[api] group_scoring import failed: %s", exc)

_COMPUTED_BETAS_EXISTS: bool | None = None


def _use_resolver_sql() -> bool:
    """True when SQL queries should read resolver betas (BETA_RESOLVER=on and
    the computed_betas table exists). Table check is cached per process."""
    global _COMPUTED_BETAS_EXISTS
    if not BETAS_OK or beta_engine is None or beta_engine.beta_mode() != "on":
        return False
    if _COMPUTED_BETAS_EXISTS is None:
        try:
            with db_conn() as conn:
                conn.execute("SELECT 1 FROM computed_betas LIMIT 1")
            _COMPUTED_BETAS_EXISTS = True
        except Exception:  # noqa: BLE001
            _COMPUTED_BETAS_EXISTS = False
    return _COMPUTED_BETAS_EXISTS


def _cb_beta(alias: str = "t") -> str:
    """SELECT expression for beta: the resolver's computed beta when enabled,
    else the stored tickers.beta. Always aliased AS beta."""
    if _use_resolver_sql():
        return f"COALESCE(cb.beta, {alias}.beta) AS beta"
    return f"{alias}.beta AS beta"


def _cb_join(on: str = "f.Ticker") -> str:
    """Matching LEFT JOIN, emitted only when the resolver drives SQL betas."""
    if _use_resolver_sql():
        return f" LEFT JOIN computed_betas cb ON cb.ticker = {on}"
    return ""

# Production sets ALLOWED_ORIGINS (comma-separated) to the public site origin(s);
# the permissive localhost regex is then dropped. In dev (unset) we keep the old
# behavior: Vite picks the next free port (5174, 5175, …) whenever 5173 is taken —
# which happens routinely because `npm run dev` starts Vite alongside `convex dev`.
# If the browser's origin isn't allowed, the browser blocks the response and the
# frontend silently falls back to MOCK data even though the API is online.
_allowed_origins = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins or [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_origin_regex=None if _allowed_origins else r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Unhandled-error handler (must exist for CORS to work on 500s) ────────────
# Starlette's CORSMiddleware adds Access-Control-Allow-Origin by wrapping `send`.
# An exception that escapes the endpoint never reaches that wrapper — it unwinds
# PAST CORSMiddleware to ServerErrorMiddleware, which emits a bare 500 with no
# CORS header. The browser then reports a phantom "No 'Access-Control-Allow-
# Origin' header" and the real 500 is invisible. Handling the exception here
# turns it into a normal response that travels back THROUGH the CORS wrapper.
from fastapi.responses import JSONResponse


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error("[api] unhandled error on %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


# ── Rate limiting (slowapi) ──────────────────────────────────────────────────
# Per-IP token buckets. Behind the reverse proxy, run uvicorn with
# --proxy-headers --forwarded-allow-ips=127.0.0.1 so get_remote_address sees the
# real client IP instead of the proxy's.
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── Admin auth ───────────────────────────────────────────────────────────────
# Admin routes (/api/cache/clear, /api/daily-update) require the X-Admin-Token
# header to match ADMIN_TOKEN. Fail-closed: with ADMIN_TOKEN unset they always
# return 403 — set it in the environment to enable them.


def require_admin(x_admin_token: str = Header(default="")) -> None:
    expected = os.environ.get("ADMIN_TOKEN", "")
    if not expected or not secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=403, detail="admin token required")


# ── Path-parameter validation ────────────────────────────────────────────────
# SQL is parameterized throughout; these patterns are defense-in-depth and keep
# junk out of logs and cache keys. Industry/sector names carry spaces, "&", ",",
# "-", ".", "/", "(", ")" and apostrophes (e.g. "Oil, Gas & Consumable Fuels").

# Must start alphanumeric so a value can never be read as an argparse flag
# (e.g. "--db"); internal dots/hyphens are still allowed (e.g. "BRK-B", "BF.B").
TICKER_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9.\-]{0,11}$"
GROUP_PATTERN = r"^[A-Za-z0-9 &,\-\./()']{1,80}$"
_TICKER_RE = re.compile(TICKER_PATTERN)


# ── TTL cache ────────────────────────────────────────────────────────────────
# Keep things in process — small footprint, no extra deps, easy to invalidate.

_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = threading.Lock()

# TTL for degraded payloads (dict results carrying an "analysis_error" marker,
# i.e. the analysis pipeline crashed) — cache briefly so a transient failure
# isn't pinned for the endpoint's full TTL.
_DEGRADED_TTL_SECONDS = 60.0


def cached(ttl_seconds: float, key_prefix: str = "") -> Callable:
    """TTL cache decorator. Key = prefix:funcname:args:kwargs.

    Request objects (injected for slowapi's per-route limits) are excluded from
    the key — their repr is unique per request and would disable caching."""
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            key_args = tuple(a for a in args if not isinstance(a, Request))
            key_kwargs = tuple(sorted(
                (k, v) for k, v in kwargs.items() if not isinstance(v, Request)
            ))
            key = f"{key_prefix}:{fn.__name__}:{key_args!r}:{key_kwargs!r}"
            now = time.time()
            with _cache_lock:
                entry = _cache.get(key)
                if entry and (now - entry[0]) < ttl_seconds:
                    return entry[1]
            result = fn(*args, **kwargs)
            with _cache_lock:
                if isinstance(result, dict) and result.get("analysis_error"):
                    # Backdate the entry so it expires after _DEGRADED_TTL_SECONDS.
                    effective = min(ttl_seconds, _DEGRADED_TTL_SECONDS)
                    _cache[key] = (now - ttl_seconds + effective, result)
                else:
                    _cache[key] = (now, result)
            return result
        return wrapper
    return decorator


def _clear_side_caches(prefix: str) -> None:
    """Drop the caches that live outside ``_cache`` (finding H5).

    ``POST /api/cache/clear`` promises to clear everything, but the
    connections sector cache, the cross-industry rank table and the macro
    economy block are separate in-process stores. Each owning module
    registers its own clear function with ``backend/side_caches.py``, so a
    cache added later cannot be missed here. An "econ" invalidation (the
    marketdata scheduler's) reaches the economy block, because its figures
    are read from ``market_data.db``.
    """
    try:
        from side_caches import clear_side_caches

        clear_side_caches(prefix)
    except Exception as exc:  # noqa: BLE001 — a clear must never 500
        log.warning("[api] side-cache clear failed: %s", exc)


def invalidate_cache(prefix: str = "") -> int:
    """Drop cache entries whose key starts with prefix. Returns drop count."""
    _clear_side_caches(prefix)
    with _cache_lock:
        if not prefix:
            n = len(_cache)
            _cache.clear()
            return n
        keys = [k for k in _cache if k.startswith(prefix)]
        if prefix == "econ":
            # The connections payload embeds the macro blocks, so a fresh
            # economic aggregate has to drop it as well.
            keys += [
                k for k in _cache
                if k.startswith("db:connections_endpoint") and k not in keys
            ]
        for k in keys:
            _cache.pop(k, None)
        return len(keys)


# ── Shared helpers ───────────────────────────────────────────────────────────

def metric(
    *,
    number: int,
    name: str,
    unit: str,
    trend: list[tuple[Any, float | None]],
    definition: str,
    analysis: str,
    vertical: list[dict[str, Any]] | None = None,
    frequency: str = "annual",
    display_type: str = "bar",
    is_rate_of_change: bool = False,
    secondary_label: str | None = None,
    level_trend: list[tuple[Any, float | None]] | None = None,
    level_unit: str | None = None,
    alt_trend: list[tuple[Any, float | None]] | None = None,
    alt_level_trend: list[tuple[Any, float | None]] | None = None,
    alt_unit: str | None = None,
    base_variant_label: str | None = None,
    alt_variant_label: str | None = None,
) -> dict[str, Any]:
    """Build a Metric dict matching frontend SectionData.metrics shape.

    ``level_trend``/``level_unit`` let a metric shown as a YoY % carry its
    underlying LEVEL series, so the UI can toggle the chart between
    "% change from a year ago" and "regular output" (and vice versa).

    ``alt_trend`` carries an alternate base series (e.g. an inflation-adjusted
    "Real" variant) so the UI can render a Nominal/Real switch. The labels are
    set via ``base_variant_label``/``alt_variant_label``."""
    def _clean(pairs: list[tuple[Any, float | None]]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for period, value in pairs:
            if value is None:
                continue
            try:
                rows.append({"period": str(period), "value": float(value)})
            except (TypeError, ValueError):
                continue
        return rows

    cleaned = _clean(trend)
    result: dict[str, Any] = {
        "id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
        "number": number,
        "name": name,
        "unit": unit,
        "latestValue": cleaned[-1]["value"] if cleaned else 0.0,
        "trend": cleaned,
        "definition": definition,
        "analysis": analysis,
        "vertical": vertical or [],
        "frequency": frequency,          # "annual" | "quarterly" | "monthly" | "daily"
        "displayType": display_type,     # "bar" | "line"
        "isRateOfChange": is_rate_of_change,
        "secondaryLabel": secondary_label,
    }
    if level_trend is not None:
        result["levelTrend"] = _clean(level_trend)
        result["levelUnit"] = level_unit if level_unit is not None else ""
    if alt_trend is not None:
        result["altTrend"] = _clean(alt_trend)
        if alt_level_trend is not None:
            result["altLevelTrend"] = _clean(alt_level_trend)
        if alt_unit is not None:
            result["altUnit"] = alt_unit
        if base_variant_label is not None:
            result["baseVariantLabel"] = base_variant_label
        if alt_variant_label is not None:
            result["altVariantLabel"] = alt_variant_label
    return result


# Every API endpoint is read-only against financials.db; the writers are the
# scheduled refresh jobs. Opening read-only (mode=ro) keeps these handles out of
# the write-lock queue entirely, and the busy timeout means a reader waits for a
# checkpointing writer instead of 500-ing with "database is locked".
_SQLITE_TIMEOUT_SECONDS = 30.0


def _ensure_wal() -> None:
    """Put financials.db in WAL once at import, so readers never block on a
    writer. Best-effort: a locked or read-only file keeps its current mode."""
    try:
        conn = sqlite3.connect(str(DB_PATH), timeout=_SQLITE_TIMEOUT_SECONDS)
        try:
            conn.execute("PRAGMA journal_mode = WAL")
        finally:
            conn.close()
    except Exception as exc:  # noqa: BLE001 — never block startup on this
        log.warning("could not enable WAL on %s: %s", DB_PATH, exc)


if DB_PATH.exists():
    _ensure_wal()


@contextmanager
def db_conn(read_only: bool = True) -> Iterator[sqlite3.Connection]:
    if not DB_PATH.exists():
        log.error("financials database not found at %s", DB_PATH)
        raise HTTPException(503, "financials database unavailable")
    if read_only:
        conn = sqlite3.connect(
            f"file:{DB_PATH.as_posix()}?mode=ro",
            uri=True,
            timeout=_SQLITE_TIMEOUT_SECONDS,
        )
    else:
        conn = sqlite3.connect(str(DB_PATH), timeout=_SQLITE_TIMEOUT_SECONDS)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(f"PRAGMA busy_timeout = {int(_SQLITE_TIMEOUT_SECONDS * 1000)}")
        # Memory-map the DB for fast page reads on a large (640 MB) file.
        # 256 MB is a safe ceiling that avoids address-space pressure.
        conn.execute("PRAGMA mmap_size = 268435456")
        # Raise the page cache from the default 2 MB to 16 MB so hot pages
        # survive across queries within the same connection. It is PRIVATE
        # heap per connection and the threadpool opens up to 40 of them, so
        # 64 MB here meant a 2.5 GB ceiling on page cache alone; the mmap
        # above already serves repeat page reads from the OS cache.
        conn.execute("PRAGMA cache_size = -16384")
        yield conn
    finally:
        conn.close()


# ── FRED ────────────────────────────────────────────────────────────────────

FRED_API_KEY = os.environ.get("FRED_API_KEY", "")
if not FRED_API_KEY:
    log.warning("FRED_API_KEY not set - FRED-backed economic series will be empty")
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"


@cached(ttl_seconds=6 * 3600, key_prefix="fred")
def fred_fetch(series_id: str, start: str, end: str) -> list[dict[str, Any]]:
    qs = urllib.parse.urlencode({
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": start,
        "observation_end": end,
    })
    url = f"{FRED_BASE}?{qs}"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        log.warning("FRED fetch failed for %s: %s", series_id, e)
        return []
    out: list[dict[str, Any]] = []
    for obs in data.get("observations", []):
        if obs.get("value") in (".", "", None):
            continue
        try:
            y, m, d = obs["date"].split("-")
            out.append({"date": f"{y}-{m}-{d}", "value": float(obs["value"])})
        except (KeyError, ValueError):
            continue
    return out


def build_yoy_series(obs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compute YoY % at each observation date. Returns same shape as input."""
    if not obs:
        return []
    by_date: dict[str, float] = {o["date"]: o["value"] for o in obs}
    # Build a sorted list of (date_str, value) and index for fast lookup
    sorted_obs = sorted(obs, key=lambda o: o["date"])
    dates = [o["date"] for o in sorted_obs]
    values = [o["value"] for o in sorted_obs]

    result: list[dict[str, Any]] = []
    for i, d_str in enumerate(dates):
        # Target date = exactly 1 year earlier
        y, m, day = d_str.split("-")
        prior = f"{int(y) - 1}-{m}-{day}"
        # Binary search for closest date in dates[:i]
        # Simpler: scan backwards from i looking for the closest match within 60 days
        prior_idx = None
        best_diff = 999999
        for j in range(i):
            yy, mm, dd = dates[j].split("-")
            d_diff = abs(
                (datetime.date(int(y), int(m), int(day))
                 - datetime.date(int(yy), int(mm), int(dd))).days - 365
            )
            if d_diff < best_diff:
                best_diff = d_diff
                prior_idx = j
            elif dates[j] > prior:
                break
        if prior_idx is None or best_diff > 45:
            continue
        prev_v = values[prior_idx]
        if prev_v == 0:
            continue
        pct = ((values[i] - prev_v) / abs(prev_v)) * 100
        result.append({"date": d_str, "value": pct})
    return result


def filter_from(obs: list[dict[str, Any]], min_year: int) -> list[dict[str, Any]]:
    return [o for o in obs if int(o["date"][:4]) >= min_year]


def trend_pairs(obs: list[dict[str, Any]]) -> list[tuple[str, float]]:
    """Convert FRED obs to trend pairs (date, value), sorted oldest→newest."""
    return [(o["date"], o["value"]) for o in sorted(obs, key=lambda o: o["date"])]


# ── Recession bands (USREC) ─────────────────────────────────────────────────

# Authoritative NBER US business-cycle recessions, as published by the NBER
# Business Cycle Dating Committee: (label, peak 'YYYY-MM', trough 'YYYY-MM').
# Each recession runs peak→trough inclusive. We shade from the first day of the
# peak month to the first day of the month AFTER the trough (so the trough month
# is covered), and label every chart with the exact published month range. This
# is the source of truth — preferred over the monthly USREC indicator, whose
# 0/1 transitions sit a month off the official peak/trough. USREC is used only
# to append any future recession not yet in this table.
# Earliest date the Economic page's recession shading reaches back to. Anchored on
# the oldest series the page serves (AAII asset allocation, November 1987) rather
# than MIN_YEAR, which governs the FRED metrics only.
_ECON_BANDS_START = "1987-01-01"

_NBER_RECESSIONS: tuple[tuple[str, str, str], ...] = (
    ("Great Depression", "1929-08", "1933-03"),
    ("1937–38 recession", "1937-05", "1938-06"),
    ("1945 recession", "1945-02", "1945-10"),
    ("1948–49 recession", "1948-11", "1949-10"),
    ("1953–54 recession", "1953-07", "1954-05"),
    ("1957–58 recession", "1957-08", "1958-04"),
    ("1960–61 recession", "1960-04", "1961-02"),
    ("1969–70 recession", "1969-12", "1970-11"),
    ("1973–75 oil crisis", "1973-11", "1975-03"),
    ("1980 recession", "1980-01", "1980-07"),
    ("1981–82 recession", "1981-07", "1982-11"),
    ("1990–91 recession", "1990-07", "1991-03"),
    ("Dot-com recession", "2001-03", "2001-11"),
    ("Great Recession", "2007-12", "2009-06"),
    ("COVID-19 recession", "2020-02", "2020-04"),
)

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _month_after(ym: str) -> str:
    """First day of the month AFTER 'YYYY-MM' (ISO date)."""
    y, m = int(ym[:4]), int(ym[5:7])
    return f"{y + 1}-01-01" if m == 12 else f"{y}-{m + 1:02d}-01"


def _month_label(ym: str) -> str:
    """'YYYY-MM' → 'Mon YYYY' (e.g. '2020-02' → 'Feb 2020')."""
    return f"{_MONTHS[int(ym[5:7]) - 1]} {ym[:4]}"


def _range_from_dates(start: str, end: str) -> str:
    """Human 'Mon YYYY – Mon YYYY' from two ISO dates (end is exclusive)."""
    sy, sm = int(start[:4]), int(start[5:7])
    ey, em = int(end[:4]), int(end[5:7]) - 1
    if em == 0:
        ey, em = ey - 1, 12
    return f"{_MONTHS[sm - 1]} {sy} – {_MONTHS[em - 1]} {ey}"


def _usrec_bands(start: str, end: str) -> list[dict[str, str]]:
    """Recession bands derived from FRED's monthly USREC 0/1 indicator."""
    obs = fred_fetch("USREC", start, end)
    if not obs:
        return []
    bands: list[dict[str, str]] = []
    sorted_obs = sorted(obs, key=lambda o: o["date"])
    in_recession = False
    band_start: str | None = None
    for o in sorted_obs:
        if o["value"] == 1.0 and not in_recession:
            in_recession = True
            band_start = o["date"]
        elif o["value"] == 0.0 and in_recession:
            in_recession = False
            bands.append({"start": band_start, "end": o["date"]})  # type: ignore[arg-type]
    if in_recession and band_start is not None:
        bands.append({"start": band_start, "end": sorted_obs[-1]["date"]})
    return bands


@cached(ttl_seconds=24 * 3600, key_prefix="fred-rec")
def fetch_recession_bands(start: str, end: str) -> list[dict[str, str]]:
    """NBER recessions overlapping [start, end], each labelled with its name and
    exact published peak→trough month range.

    Returns ``{start, end, label, range}`` dicts. ``start``/``end`` are ISO dates
    for shading (``end`` is the first day after the trough month); ``range`` is
    the official month range as published (e.g. "Dec 2007 – Jun 2009"). Any
    recession after the last tabulated one is appended from USREC so future
    cycles still shade, labelled generically."""
    bands: list[dict[str, str]] = []
    for label, peak, trough in _NBER_RECESSIONS:
        b_start = f"{peak}-01"
        b_end = _month_after(trough)
        if b_end >= start and b_start <= end:
            bands.append({
                "start": b_start,
                "end": b_end,
                "label": label,
                "range": f"{_month_label(peak)} – {_month_label(trough)}",
            })
    # Append any post-table recession the NBER has since dated (via USREC).
    last_known_end = _month_after(_NBER_RECESSIONS[-1][2])
    for b in _usrec_bands(start, end):
        if b["start"] > last_known_end:
            bands.append({
                "start": b["start"],
                "end": b["end"],
                "label": "Recession",
                "range": _range_from_dates(b["start"], b["end"]),
            })
    bands.sort(key=lambda x: x["start"])
    return bands


# ── Derived FRED helpers ─────────────────────────────────────────────────────

def real_money(money_series_id: str, start: str, end: str) -> list[dict[str, Any]]:
    """Real money supply = nominal / CPI × 100 (matches economicmetrics.py)."""
    nom = fred_fetch(money_series_id, start, end)
    cpi = fred_fetch("CPIAUCSL", start, end)
    cpi_by_date = {o["date"]: o["value"] for o in cpi}
    out: list[dict[str, Any]] = []
    for o in nom:
        c = cpi_by_date.get(o["date"])
        if c and c != 0:
            out.append({"date": o["date"], "value": (o["value"] / c) * 100})
    return out


def adjusted_sp500(money_series_id: str, sp500_obs: list[dict[str, Any]],
                   start: str, end: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """SP500 / money_supply, forward-filling monthly money to daily.
    Returns (raw_ratio, normalized_base_100)."""
    money = fred_fetch(money_series_id, start, end)
    if not money or not sp500_obs:
        return [], []
    money_sorted = sorted(money, key=lambda o: o["date"])
    sp_sorted = sorted(sp500_obs, key=lambda o: o["date"])
    money_by_date: dict[str, float] = {}
    idx = 0
    for sp in sp_sorted:
        while idx + 1 < len(money_sorted) and money_sorted[idx + 1]["date"] <= sp["date"]:
            idx += 1
        money_by_date[sp["date"]] = money_sorted[idx]["value"]
    raw = []
    for sp in sp_sorted:
        m = money_by_date.get(sp["date"])
        if m and m != 0:
            raw.append({"date": sp["date"], "value": sp["value"] / m})
    if not raw:
        return [], []
    base = raw[0]["value"]
    norm = [{"date": o["date"], "value": (o["value"] / base) * 100} for o in raw]
    return raw, norm


def quarterly_returns(obs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Quarter-over-quarter % return from daily observations.
    Uses last trading day of each quarter as the close."""
    if not obs:
        return []
    sorted_obs = sorted(obs, key=lambda o: o["date"])
    quarters: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for o in sorted_obs:
        y, m, _ = o["date"].split("-")
        q = (int(y), (int(m) - 1) // 3 + 1)
        quarters.setdefault(q, []).append(o)
    closes = [sorted(qo, key=lambda x: x["date"])[-1] for _q, qo in sorted(quarters.items())]
    out: list[dict[str, Any]] = []
    for i in range(1, len(closes)):
        prev_v = closes[i - 1]["value"]
        if prev_v == 0:
            continue
        out.append({
            "date": closes[i]["date"],
            "value": ((closes[i]["value"] - prev_v) / abs(prev_v)) * 100,
        })
    return out


def resample_monthly(obs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Take the last observation each calendar month."""
    by_month: dict[tuple[int, int], dict[str, Any]] = {}
    for o in sorted(obs, key=lambda x: x["date"]):
        y, m, _ = o["date"].split("-")
        by_month[(int(y), int(m))] = o
    return [by_month[k] for k in sorted(by_month.keys())]


def rolling_log_vol(obs: list[dict[str, Any]], window: int = 12) -> list[dict[str, Any]]:
    """Annualised log-return volatility on a rolling window (% terms)."""
    import math
    if len(obs) < window + 1:
        return []
    sorted_obs = sorted(obs, key=lambda o: o["date"])
    log_rets: list[dict[str, Any]] = []
    for i in range(1, len(sorted_obs)):
        prev_v = sorted_obs[i - 1]["value"]
        curr_v = sorted_obs[i]["value"]
        if prev_v > 0 and curr_v > 0:
            log_rets.append({
                "date": sorted_obs[i]["date"],
                "value": math.log(curr_v / prev_v),
            })
    if len(log_rets) < window:
        return []
    out = []
    for i in range(window - 1, len(log_rets)):
        vals = [log_rets[j]["value"] for j in range(i - window + 1, i + 1)]
        mean = sum(vals) / len(vals)
        variance = sum((v - mean) ** 2 for v in vals) / (len(vals) - 1)
        stdev = variance ** 0.5
        annualised = stdev * (window ** 0.5) * 100
        out.append({"date": log_rets[i]["date"], "value": annualised})
    return out


@cached(ttl_seconds=6 * 3600, key_prefix="yahoo")
def yahoo_monthly(ticker: str, start: str, end: str) -> list[dict[str, Any]]:
    """Pull daily closes from Yahoo and resample to month-end."""
    try:
        import yfinance as yf
    except ImportError:
        log.warning("yahoo_monthly: yfinance not installed — returning [] for %s", ticker)
        return []
    try:
        data = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
    except Exception as e:  # noqa: BLE001
        log.warning("yahoo_fetch %s failed: %s", ticker, e)
        return []
    if data is None or data.empty:
        return []
    out: list[dict[str, Any]] = []
    close = data["Close"]
    for ts in close.index:
        raw = close.loc[ts]
        if hasattr(raw, "iloc"):
            raw = raw.iloc[0]
        try:
            val = float(raw)
        except (TypeError, ValueError):
            continue
        if val != val:
            continue
        out.append({"date": ts.date().isoformat(), "value": val})
    return resample_monthly(out)


# ── Live cost-of-capital macro inputs (risk-free rate + equity risk premium) ──

# ─────────────────────────────────────────────────────────────────────────────
# Equity risk premium — FIXED, INTERIM VALUE (set 2026-06-11).
#
# The ERP is hard-set to 4.5%, a defensible mature-market premium: the historical
# excess return of US stocks over Treasuries is 3–5% (Expected Returns, Ch.8;
# Damodaran). This REPLACES the prior method — (average annual S&P 500 total
# return − the current 10Y yield) — which subtracted a spot bond yield from a
# long-run nominal return (mismatched windows) and used an arithmetic mean,
# producing an inflated ~8% ERP. That inflated every firm's WACC by ~350bp and
# made the whole universe screen as extremely overvalued on the DCF.
#
# TODO(true-ERP): once S&P 500 earnings data is available, replace this constant
# with a forward-looking IMPLIED ERP — solve for the rate r that equates the
# index level to the present value of expected index cash flows (earnings/
# dividends + buybacks), per Damodaran's implied-ERP method. Until then, 4.5% is
# the interim anchor and must NOT be derived from a trailing average return.
FIXED_EQUITY_RISK_PREMIUM = 0.045


def _live_implied_erp() -> tuple[float, str] | None:
    """The live forward-looking implied ERP (Damodaran two-stage solver, Ch.8)
    from the marketdata daily snapshot, band-checked to ``[1%, 9%]``. Returns
    ``(erp, method)`` or None when no fresh implied value is available (callers
    then fall back to the fixed 4.5% anchor)."""
    if not MARKETDATA_OK or md_connect is None:
        return None
    conn = md_connect()
    try:
        # A generous 7-day freshness window: the ERP moves slowly and the daily
        # scheduler keeps it current, but a weekend / powered-down PC must not
        # silently drop the whole universe back to the fixed anchor.
        params = md_market_inputs.read_cached_params(conn, max_age_days=7.0)
    finally:
        conn.close()
    if params is None or params.equity_risk_premium is None:
        return None
    erp = float(params.equity_risk_premium)
    if not (0.01 <= erp <= 0.09):
        return None
    return round(erp, 4), (params.erp_method or "implied_two_stage")


@cached(ttl_seconds=6 * 3600, key_prefix="macro")
def get_live_wacc_params() -> dict[str, float]:
    """CAPM macro inputs (cached 6h):

      • risk-free rate      = latest 10-year US Treasury yield (FRED ``DGS10``)
      • equity risk premium = live forward-looking IMPLIED ERP (Damodaran
        two-stage method, Ch.8), band-checked ``[1%, 9%]``; falls back to the
        fixed 4.5% anchor (``FIXED_EQUITY_RISK_PREMIUM``) only when no fresh
        implied value is available.

    ``erpMethod`` records which path was taken (``implied_two_stage`` |
    ``damodaran`` | ``fixed_fallback``) and ``rfSource`` does the same for the
    risk-free rate (``live_dgs10`` | ``static_fallback``), so a stale macro
    input is visible in the payload instead of silently driving valuations."""
    rf = 0.045
    rf_source = "static_fallback"
    try:
        obs = fred_fetch("DGS10", "2010-01-01", _today_iso())
        if obs:
            v = obs[-1]["value"]
            if v is not None and v > 0:
                rf = v / 100.0
                rf_source = "live_dgs10"
    except Exception as exc:  # noqa: BLE001
        log.warning("rf_anchor: DGS10 fetch failed, using fallback rf=%.4f: %s", rf, exc)

    erp = FIXED_EQUITY_RISK_PREMIUM
    erp_method = "fixed_fallback"
    try:
        implied = _live_implied_erp()
        if implied is not None:
            erp, erp_method = implied
    except Exception as exc:  # noqa: BLE001
        log.warning("erp_anchor: implied ERP unavailable, using fixed %.4f: %s",
                    FIXED_EQUITY_RISK_PREMIUM, exc)

    return {"rf": round(rf, 4), "erp": round(erp, 4),
            "erpMethod": erp_method, "rfSource": rf_source}


def _yoy_from_levels(vals: list[tuple[str, float]],
                     tolerance_days: int = 75) -> Optional[tuple[float, str]]:
    """Trailing year-over-year growth from a dated level series: the latest
    observation against the one closest to 365 days earlier, DATE-matched
    rather than position-counted so a gapped series cannot silently pair the
    wrong quarters. None when no prior observation lands within tolerance."""
    import datetime as _ndt
    if len(vals) < 2:
        return None
    latest_date_s, latest_v = vals[-1]
    if latest_v is None or latest_v <= 0:
        return None
    try:
        latest_d = _ndt.date.fromisoformat(latest_date_s)
    except ValueError:
        return None
    target = latest_d - _ndt.timedelta(days=365)
    best: tuple[int, float] | None = None
    for date_s, v in vals[:-1]:
        if v is None or v <= 0:
            continue
        try:
            gap = abs((_ndt.date.fromisoformat(date_s) - target).days)
        except ValueError:
            continue
        if gap <= tolerance_days and (best is None or gap < best[0]):
            best = (gap, v)
    if best is None:
        return None
    return latest_v / best[1] - 1.0, latest_date_s


@cached(ttl_seconds=24 * 3600, key_prefix="macro")
def get_nominal_gdp_growth() -> dict[str, Any]:
    """Trailing year-over-year US nominal GDP growth from the FRED ``GDP`` level
    series (quarterly): latest quarter over the observation one year earlier,
    date-matched. The marketdata scheduler snapshots the SAME level series
    (FRED_CATALOG "national_accounts"), so there is one definition of nominal
    GDP growth in the app regardless of which side computes it.

    This is the live economy pace behind Damodaran's Ch.12 stable-growth
    constraint (g_stable cannot outrun the economy; the risk-free rate is his
    proxy for it) and replaces the hardcoded 5% the growth-viability deck used
    to state as fact. ``{"value": None, ...}`` when FRED is unreachable, so
    consumers fall back to describing the rf proxy instead of a stale number."""
    try:
        obs = fred_fetch("GDP", "2015-01-01", _today_iso())
        vals = [(o["date"], o["value"]) for o in obs
                if o.get("value") is not None and o["value"] > 0]
        yoy = _yoy_from_levels(vals)
        if yoy is not None:
            value, as_of = yoy
            return {"value": round(value, 4), "asOf": as_of,
                    "source": "fred_gdp_yoy"}
    except Exception as exc:  # noqa: BLE001
        log.warning("nominal GDP growth unavailable: %s", exc)
    return {"value": None, "asOf": None, "source": "unavailable"}


@cached(ttl_seconds=24 * 3600, key_prefix="macro-hist")
def get_historical_wacc_params() -> dict[int, dict[str, float]]:
    """Per-year CAPM inputs ``{year: {"rf","erp"}}`` from Damodaran's histimpl.xls
    (year-end T-bond rate + implied ERP). Lets the cost-of-equity and WACC trends
    discount each historical year at that era's rate environment instead of the
    single current value. Empty on failure, so callers fall back to the live
    values."""
    try:
        return md_damodaran.historical_erp_rf_by_year(cache_dir=str(MD_CACHE_DIR))
    except Exception as exc:  # noqa: BLE001
        log.warning("historical wacc params failed: %s", exc)
        return {}


def _today_iso() -> str:
    return datetime.date.today().isoformat()


# ── Health & metadata ────────────────────────────────────────────────────────

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "db_exists": DB_PATH.exists(),
        "min_year": MIN_YEAR,
        "max_year": MAX_YEAR,
        "cache_entries": len(_cache),
    }


@app.post("/api/cache/clear", dependencies=[Depends(require_admin)])
@limiter.limit("5/minute")
def clear_cache(request: Request, prefix: str = Query(default="")) -> dict[str, Any]:
    n = invalidate_cache(prefix)
    return {"dropped": n, "remaining": len(_cache)}


# ── Daily update ─────────────────────────────────────────────────────────────

_update_state: dict[str, Any] = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "result": None,
    "error": None,
}
_update_lock = threading.Lock()


def _run_daily_update(tickers: list[str] | None = None) -> None:
    cmd = [sys.executable, str(ROOT / "data" / "daily_update.py"), "--db", str(DB_PATH), "--quiet"]
    if tickers:
        cmd.append("--ticker")
        cmd.extend(tickers)
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=60 * 30, check=False
        )
        with _update_lock:
            _update_state["finished_at"] = datetime.datetime.now().isoformat()
            _update_state["running"] = False
            _update_state["result"] = {
                "exit": result.returncode,
                "stdout_tail": result.stdout[-2000:],
                "stderr_tail": result.stderr[-2000:],
            }
        # Drop all cached DB queries — fresh data now in financials.db
        invalidate_cache("db")
        if not tickers:
            # A full update also refreshes fx_rates — drop cached USD conversions
            invalidate_cache("fx")
        if result.returncode != 0:
            log.warning("daily-update exited %s — stderr tail: %s",
                        result.returncode, result.stderr[-2000:])
        else:
            log.info("daily-update done — DB caches invalidated")
        _start_ranking_warm()  # the invalidation just made the big rankings cold
    except Exception as e:
        with _update_lock:
            _update_state["finished_at"] = datetime.datetime.now().isoformat()
            _update_state["running"] = False
            _update_state["error"] = str(e)
        log.error("daily-update failed: %s", e, exc_info=True)


@app.post("/api/daily-update", dependencies=[Depends(require_admin)])
@limiter.limit("5/minute")
def trigger_daily_update(request: Request, ticker: list[str] | None = Query(default=None)) -> dict[str, Any]:
    # Allowlist each ticker before it reaches the subprocess argv — blocks
    # "--flag" smuggling into data/daily_update.py's argparse and junk symbols.
    for t in ticker or []:
        if not _TICKER_RE.fullmatch(t):
            raise HTTPException(status_code=422, detail=f"invalid ticker: {t!r}")
    with _update_lock:
        if _update_state["running"]:
            return {"status": "already_running", "state": _update_state}
        _update_state.update({
            "running": True,
            "started_at": datetime.datetime.now().isoformat(),
            "finished_at": None,
            "result": None,
            "error": None,
        })
    threading.Thread(
        target=_run_daily_update,
        args=(ticker or None,),
        daemon=True,
    ).start()
    return {"status": "started", "tickers": ticker or "all"}


@app.get("/api/daily-update", dependencies=[Depends(require_admin)])
@limiter.limit("5/minute")
def daily_update_status(request: Request) -> dict[str, Any]:
    # Gated: the result echoes subprocess stdout/stderr tails (paths, internals).
    return _update_state


# ── Weekly market-PE aggregate (autonomous in-process scheduler) ─────────────
# Fully automated: a daemon thread started at app startup recomputes the market-
# cap-weighted index PE / earnings yield once a week (7-day staleness gate) and
# persists a row to market_aggregates. No cron or manual trigger required. Set
# DISABLE_WEEKLY_PE=1 to turn it off (e.g. in tests/dev).

_WEEKLY_STALE_DAYS = 7
_weekly_lock = threading.Lock()
_weekly_running = {"v": False}


def _market_pe_is_stale() -> bool:
    # Gate on the last COMPLETE ATTEMPT, not only on the last published aggregate.
    # A run that finishes and then fails its sanity checks writes no aggregate
    # row, so gating on the aggregate alone read "never computed" and relaunched
    # the entire yfinance universe sweep every 6h, indefinitely. A failed run now
    # backs off for the normal weekly cadence like a successful one.
    try:
        from market_pe import last_attempt_date  # noqa: PLC0415
        d = last_attempt_date(str(DB_PATH))
    except Exception as exc:  # noqa: BLE001
        log.warning("_market_pe_is_stale: staleness check failed, treating as stale: %s", exc)
        return True
    if not d:
        return True
    try:
        return (datetime.date.today() - datetime.date.fromisoformat(d)).days >= _WEEKLY_STALE_DAYS
    except ValueError:
        return True


def _run_market_pe_once() -> Optional[dict]:
    """Run ONE batch of the market-PE walk. Returns the batch result (``complete``
    says whether the universe is finished), or None if it could not run."""
    with _weekly_lock:
        if _weekly_running["v"]:
            return None
        _weekly_running["v"] = True
    try:
        from market_pe import compute_market_pe_aggregate  # noqa: PLC0415
        res = compute_market_pe_aggregate(str(DB_PATH))
        log.info("weekly market-PE aggregate: %s", res)
        if isinstance(res, dict) and res.get("complete") and res.get("ok"):
            invalidate_cache("econ")  # surface the fresh aggregate on next /api/economic
        return res
    except Exception as e:  # noqa: BLE001
        log.warning("weekly market-PE aggregate failed: %s", e)
        return None
    finally:
        with _weekly_lock:
            _weekly_running["v"] = False


def _weekly_market_pe_loop() -> None:
    import time  # noqa: PLC0415
    time.sleep(20)  # don't block startup or hammer yfinance at boot
    mid_run = False
    while True:
        res = None
        try:
            if _market_pe_is_stale():
                res = _run_market_pe_once()
        except Exception as e:  # noqa: BLE001
            log.warning("weekly scheduler tick error: %s", e)
        if isinstance(res, dict):
            mid_run = (not res.get("complete")) and (res.get("remaining") or 0) > 0
        # A None result mid-run (a batch that raised) keeps the short cadence so the
        # walk resumes instead of idling for 6h with progress rows sitting on disk.
        if mid_run:
            time.sleep(15 * 60)  # mid-run: come back soon for the next batch
        else:
            time.sleep(6 * 3600)  # re-check every 6h; the 7-day gate enforces weekly cadence


@app.on_event("startup")
def _start_weekly_scheduler() -> None:
    if os.environ.get("DISABLE_WEEKLY_PE") == "1":
        log.info("weekly market-PE scheduler disabled via DISABLE_WEEKLY_PE")
        return
    threading.Thread(target=_weekly_market_pe_loop, daemon=True).start()
    log.info("weekly market-PE scheduler started (7-day cadence)")


def _shiller_monthly_eps() -> list[tuple[str, float]]:
    """Shiller's monthly trailing-twelve-month S&P-500 earnings (index points),
    ascending ``[(YYYY-MM-01, eps)]``. Returns ``[]`` if the market-data DB is
    unavailable. This is the EPS numerator for the daily earnings yield — monthly
    TTM earnings stepped onto the daily S&P-500 price."""
    if not MARKETDATA_OK or md_connect is None:
        return []
    try:
        conn = md_connect()
    except Exception as exc:  # noqa: BLE001
        log.warning("_shiller_monthly_eps: market_data DB connect failed: %s", exc)
        return []
    try:
        rows = conn.execute(
            "SELECT date, earnings FROM shiller_sp500 "
            "WHERE earnings IS NOT NULL AND earnings > 0 ORDER BY date"
        ).fetchall()
        return [(r[0], float(r[1])) for r in rows]
    except Exception as exc:  # noqa: BLE001
        log.warning("_shiller_monthly_eps: query failed: %s", exc)
        return []
    finally:
        conn.close()


def _build_fed_model(dgs1_obs: list[dict[str, Any]],
                     sp500_obs: list[dict[str, Any]]) -> dict[str, Any]:
    """Earnings-yield vs 1-Year Treasury (DGS1) "Fed model" payload.

    The earnings yield is now computed **daily**: the trailing-twelve-month EPS
    (Shiller's monthly S&P-500 earnings, stepped/forward-filled) divided by the
    *daily* S&P-500 close (FRED ``SP500``). Dividing a slow quarterly-updated EPS
    by the fast daily price means the line moves with the market — short, sharp
    rallies and drawdowns push the yield down/up the same day, instead of being
    averaged out by a single year-end point. The forward line grows each day's
    trailing EPS by Damodaran's analyst growth estimate for that year. The
    Treasury series is DGS1's daily history. ``snapshot`` is None until the
    market-data sources are available."""
    treasury_trend = trend_pairs(dgs1_obs)
    treas_latest = treasury_trend[-1][1] if treasury_trend else None
    prices = trend_pairs(sp500_obs)              # [(date, index level)] daily
    eps_steps = _shiller_monthly_eps()           # [(YYYY-MM-01, ttm eps)] monthly
    ey_trend: list[dict[str, Any]] = []
    fey_trend: list[dict[str, Any]] = []         # forward (projected) earnings yield
    snapshot = None

    # Per-year analyst growth (for the forward line) from Damodaran's workbook.
    growth_by_year: dict[int, float] = {}
    current_growth: float | None = None
    if MARKETDATA_OK:
        try:
            hist = md_damodaran.sp500_earnings_history(cache_dir=str(MD_CACHE_DIR))
            for rec in hist:
                g = rec.get("growth")
                if g is not None and rec.get("year"):
                    growth_by_year[int(rec["year"])] = g
        except Exception as exc:  # noqa: BLE001
            log.warning("fed-model Damodaran history failed: %s", exc)
        try:
            current_growth = md_damodaran.current_analyst_growth(cache_dir=str(MD_CACHE_DIR))
        except Exception as exc:  # noqa: BLE001
            log.warning("fed-model analyst growth failed: %s", exc)
            current_growth = None

    # Step the monthly EPS onto every daily price (two-pointer; both ascending).
    last_eps: float | None = None
    if prices and eps_steps:
        j, n = 0, len(eps_steps)
        cur_eps: float | None = None
        for d, price in prices:
            while j < n and eps_steps[j][0] <= d:
                cur_eps = eps_steps[j][1]
                j += 1
            if cur_eps is None or not price or price <= 0:
                continue
            ey_trend.append({"period": d, "value": round(cur_eps / price * 100.0, 3)})
            g = growth_by_year.get(int(d[:4]), current_growth)
            if g is not None:
                fey_trend.append({"period": d, "value": round(cur_eps * (1.0 + g) / price * 100.0, 3)})
            last_eps = cur_eps

    # Snapshot from the latest daily point, so the headline matches the chart.
    if last_eps is not None and prices:
        as_of, price = prices[-1]
        ey = last_eps / price * 100.0
        fwd_eps = round(last_eps * (1.0 + current_growth), 2) if current_growth is not None else None
        fey = (fwd_eps / price * 100.0) if fwd_eps else None
        spread = (ey - treas_latest) if treas_latest is not None else None
        fwd_spread = (fey - treas_latest) if (fey is not None and treas_latest is not None) else None
        snapshot = {
            "earningsYield": round(ey, 3),
            "treasuryYield": round(treas_latest, 3) if treas_latest is not None else None,
            "spread": round(spread, 3) if spread is not None else None,
            "marketPe": round(price / last_eps, 2) if last_eps else None,
            "asOf": as_of,
            "nConstituents": None,
            "sp500Eps": round(last_eps, 2),
            "sp500Price": round(price, 2),
            "sp500ForwardEps": fwd_eps,
            "forwardEarningsYield": round(fey, 3) if fey is not None else None,
            "forwardSpread": round(fwd_spread, 3) if fwd_spread is not None else None,
            "analystGrowth": round(current_growth, 4) if current_growth is not None else None,
        }

    return {
        "earningsYieldTrend": ey_trend,
        "forwardEarningsYieldTrend": fey_trend,
        "treasuryYieldTrend": [{"period": d, "value": v} for d, v in treasury_trend],
        "treasurySeries": "DGS1 (1-Year Treasury)",
        "snapshot": snapshot,
    }


# ── Ported market-data economic metrics (CAPE / ERP / earnings yield / EPU / GPR)
# Each maps to a definition-library dropdown by exact ``name`` (see
# frontend/src/lib/economicDefinitions.ts). Reads from the dedicated market_data
# DB the refresh scheduler populates; an empty series renders as a
# "data source pending" dropdown, so this never raises.

_EPU_GPR_SPECS: tuple[tuple[str, str, str, str, str], ...] = (
    ("GEPUCURRENT", "Global Economic Policy Uncertainty", "monthly",
     "The Global Economic Policy Uncertainty (GEPU) index — a GDP-weighted average "
     "of national EPU indices built by Baker, Bloom & Davis from the frequency of "
     "newspaper coverage of economic-policy uncertainty (FRED: GEPUCURRENT).",
     "Spikes mark global policy shocks (elections, trade wars, pandemics). Sustained "
     "high readings tend to precede softer global investment and risk appetite."),
    ("USEPUINDXD", "US Economic Policy Uncertainty", "daily",
     "The US daily Economic Policy Uncertainty index (Baker, Bloom & Davis), from "
     "the share of newspaper articles discussing economic-policy uncertainty "
     "(FRED: USEPUINDXD).",
     "A fast, high-frequency fear gauge for US policy risk. Surges around fiscal "
     "standoffs, Fed surprises, and elections often coincide with equity drawdowns."),
    ("GPR", "Geopolitical Risk Index", "monthly",
     "The Geopolitical Risk (GPR) index of Caldara & Iacoviello — a newspaper-based "
     "measure of adverse geopolitical events and associated risks (wars, terrorism, "
     "tensions).",
     "Elevated GPR is associated with lower investment, higher oil prices, and "
     "flights to safety. Useful as a macro overlay alongside the EPU indices."),
)


def _marketdata_metrics() -> list[dict[str, Any]]:
    """Build the CAPE / earnings-yield / implied-ERP / EPU / GPR metrics from the
    dedicated market_data DB. Returns [] if the package/DB is unavailable."""
    if not MARKETDATA_OK or md_connect is None:
        return []
    out: list[dict[str, Any]] = []
    conn = md_connect()
    try:
        start = f"{MIN_YEAR}-01-01"

        # 51 — Shiller CAPE (PE10)
        cape_rows = conn.execute(
            "SELECT date, cape FROM shiller_sp500 "
            "WHERE cape IS NOT NULL AND cape > 0 AND date >= ? ORDER BY date",
            (start,),
        ).fetchall()
        out.append(metric(
            number=51, name="Shiller CAPE (PE10)", unit="x",
            frequency="monthly", display_type="line",
            trend=[(r[0], r[1]) for r in cape_rows],
            definition="Robert Shiller's cyclically adjusted price-to-earnings ratio "
                       "(CAPE / PE10): the S&P 500's real price divided by the average "
                       "of inflation-adjusted earnings over the trailing 10 years.",
            analysis="Smooths the business cycle out of the P/E. Readings well above the "
                     "long-run mean (~17) have historically been followed by lower 10-year "
                     "real returns.",
        ))

        # 23 — S&P 500 Earnings Yield (Damodaran EPS ÷ index level, annual)
        try:
            hist = md_damodaran.sp500_earnings_history(cache_dir=str(MD_CACHE_DIR))
        except Exception as exc:  # noqa: BLE001
            log.warning("_marketdata_metrics: Damodaran earnings history failed (metric 23): %s", exc)
            hist = []
        ey = [(f"{int(r['year'])}-12-31", round(r["earnings"] / r["index"] * 100.0, 3))
              for r in hist if r.get("index") and r.get("earnings")]
        out.append(metric(
            number=23, name="S&P 500 Earnings Yield", unit="%",
            frequency="annual", display_type="line",
            trend=ey,
            definition="The S&P 500's trailing earnings yield — Damodaran's published "
                       "index earnings divided by the index level (the inverse of the "
                       "index P/E).",
            analysis="Compared with the 1-year Treasury yield (the Fed model), a higher "
                     "earnings yield means equities look cheap relative to short-term bonds.",
        ))

        # 42 — Equity Risk Premium (implied, two-stage)
        erp_rows = conn.execute(
            "SELECT date, value FROM macro_series WHERE series_id='ERP_IMPLIED' ORDER BY date"
        ).fetchall()
        out.append(metric(
            number=42, name="Equity Risk Premium (implied)", unit="%",
            frequency="annual", display_type="line",
            trend=[(r[0], round(r[1] * 100.0, 3)) for r in erp_rows],
            definition="The forward-looking equity risk premium implied by discounting "
                       "the S&P 500's expected cash flows back to its current price "
                       "(Damodaran's two-stage method), minus the risk-free rate.",
            analysis="The extra annual return investors demand for holding equities over "
                     "Treasuries. A rising ERP signals greater risk aversion / cheaper stocks.",
        ))

        # 52/53/54 — EPU (global, US) + GPR
        for sid, name, freq, defn, ana in _EPU_GPR_SPECS:
            rows = conn.execute(
                "SELECT date, value FROM macro_series WHERE series_id = ? AND date >= ? ORDER BY date",
                (sid, start),
            ).fetchall()
            out.append(metric(
                number={"GEPUCURRENT": 52, "USEPUINDXD": 53, "GPR": 54}[sid],
                name=name, unit="", frequency=freq, display_type="line",
                trend=[(r[0], r[1]) for r in rows], definition=defn, analysis=ana,
            ))

        # 68 — S&P 500 Expected Return (Ilmanen building blocks): dividend yield
        # + real earnings growth + expected inflation + CAPE reversion.
        try:
            er_now = md_expected_returns.compute_expected_return(conn)
            er_hist = md_expected_returns.expected_return_series(conn)
        except Exception as exc:  # noqa: BLE001
            log.warning("_marketdata_metrics: expected-return block failed (metric 68): %s", exc)
            er_now, er_hist = None, []
        if er_now is not None:
            def _pct(v: float | None) -> float | None:
                return round(v * 100.0, 2) if v is not None else None
            vertical = [
                {"label": "Dividend yield", "value": _pct(er_now["dividendYield"]), "unit": "%"},
                {"label": "Real earnings growth (10y)", "value": _pct(er_now["realEarningsGrowth"]), "unit": "%"},
                {"label": "Expected inflation (10y breakeven)", "value": _pct(er_now["expectedInflation"]), "unit": "%"},
                {"label": "Valuation change (CAPE reversion)", "value": _pct(er_now["valuationChange"]), "unit": "%"},
                {"label": "CAPE now vs 30y median", "value": er_now["currentCape"], "unit": f"x vs {er_now['anchorCape30y']}x" if er_now["anchorCape30y"] else "x"},
            ]
            if er_now.get("expectedReturnConservative") is not None:
                vertical.append({"label": "Conservative (full-history anchor)",
                                 "value": _pct(er_now["expectedReturnConservative"]), "unit": "%/yr"})
            if er_now.get("partial"):
                vertical.append({"label": "Partial sum (a term is missing)", "value": 1, "unit": ""})
            out.append(metric(
                number=68, name="S&P 500 Expected Return (building blocks)", unit="%",
                frequency="annual", display_type="line",
                trend=[(d, round(v * 100.0, 2)) for d, v in er_hist],
                vertical=vertical,
                definition="The yearly return the S&P 500 offers from today's price over "
                           "the next ten years, built from four observable parts: the "
                           "dividend yield, the trailing growth of real index earnings, "
                           "the bond market's ten-year inflation expectation, and the "
                           "drift of the CAPE ratio back toward its thirty-year median "
                           "(Ilmanen, Expected Returns).",
                analysis="A forward number, not a forecast of any single year. When the "
                         "valuation term is deeply negative the market is priced for "
                         "returns below its own history, and stock selection has to work "
                         "harder. Compare it with the ten-year Treasury yield to judge "
                         "what owning stocks pays over waiting in bonds.",
            ))

        # 69 — AAII Asset Allocation Survey (stocks / bonds / cash).
        #
        # Deliberately NOT filtered by MIN_YEAR. The whole point of this series is
        # to show how households shift allocation across the cycle, and MIN_YEAR
        # (2012) contains a single two-month recession. Truncating here would drop
        # the 77% stock reading at the 2000 peak and the 40.8% / 44.8%-cash reading
        # at the March 2009 bottom, which are the observations that make the metric
        # worth showing. The series is monthly since 1987, so the full history is
        # ~464 points per variant: cheap enough to ship whole.
        # Guarded like the metric 23 and 68 blocks above: this function returns
        # `out` only at the end, so an exception here would discard every metric
        # already built (CAPE, ERP, EPU, GPR, expected return), not just this one.
        # All three series must be present and equally long before anything is
        # computed: a lopsided population would divide by zero in `_stat`.
        try:
            alloc: dict[str, list[tuple[str, float]]] = {}
            for key, sid in (("stocks", "AAII_ALLOC_STOCKS"),
                             ("bonds", "AAII_ALLOC_BONDS"),
                             ("cash", "AAII_ALLOC_CASH")):
                alloc[key] = [
                    (r[0], r[1]) for r in conn.execute(
                        "SELECT date, value FROM macro_series WHERE series_id = ? ORDER BY date",
                        (sid,),
                    ).fetchall()
                ]
            complete = (
                all(alloc[k] for k in ("stocks", "bonds", "cash"))
                and len({len(alloc[k]) for k in ("stocks", "bonds", "cash")}) == 1
            )
            if alloc["stocks"] and not complete:
                log.warning(
                    "_marketdata_metrics: AAII allocation is unevenly populated "
                    "(stocks=%d bonds=%d cash=%d), skipping metric 69",
                    len(alloc["stocks"]), len(alloc["bonds"]), len(alloc["cash"]),
                )
        except Exception as exc:  # noqa: BLE001
            log.warning("_marketdata_metrics: AAII allocation read failed (metric 69): %s", exc)
            alloc, complete = {"stocks": [], "bonds": [], "cash": []}, False
        if complete:
            def _stat(vals: list[float]) -> tuple[float, float]:
                n = len(vals)
                mean = sum(vals) / n
                latest = vals[-1]
                pct = sum(1 for v in vals if v < latest) / n * 100.0
                return mean, pct

            s_vals = [v for _, v in alloc["stocks"]]
            b_vals = [v for _, v in alloc["bonds"]]
            c_vals = [v for _, v in alloc["cash"]]
            s_mean, s_pct = _stat(s_vals)
            b_mean, _ = _stat(b_vals)
            c_mean, c_pct = _stat(c_vals)
            vertical = [
                {"label": "Stocks now", "value": round(s_vals[-1], 1), "unit": "%"},
                {"label": "Bonds now", "value": round(b_vals[-1], 1), "unit": "%"},
                {"label": "Cash now", "value": round(c_vals[-1], 1), "unit": "%"},
                {"label": "Stocks vs long-run average",
                 "value": round(s_vals[-1] - s_mean, 1),
                 "unit": f"pp vs {s_mean:.1f}% average"},
                {"label": "Bonds vs long-run average",
                 "value": round(b_vals[-1] - b_mean, 1),
                 "unit": f"pp vs {b_mean:.1f}% average"},
                {"label": "Cash vs long-run average",
                 "value": round(c_vals[-1] - c_mean, 1),
                 "unit": f"pp vs {c_mean:.1f}% average"},
                {"label": "Stock allocation percentile (since 1987)",
                 "value": round(s_pct), "unit": "of months are lower"},
                {"label": "Cash allocation percentile (since 1987)",
                 "value": round(c_pct), "unit": "of months are lower"},
            ]
            out.append(metric(
                number=69, name="AAII Asset Allocation Survey", unit="%",
                frequency="monthly", display_type="line",
                trend=[(d, round(v, 2)) for d, v in alloc["stocks"]],
                alt_trend=[(d, round(v, 2)) for d, v in alloc["cash"]],
                alt_unit="%",
                base_variant_label="Stocks", alt_variant_label="Cash",
                vertical=vertical,
                definition="The share of their own portfolios that members of the American "
                           "Association of Individual Investors report holding in stocks and "
                           "stock funds, bonds and bond funds, and cash. It is a monthly "
                           "survey of actual reported holdings rather than an opinion poll, "
                           "and it runs without a break since November 1987.",
                analysis="Read it against the long-run averages of roughly 62% stocks, 16% "
                         "bonds and 22% cash. Individual investors hold the most stock after "
                         "prices have already risen and the most cash after they have already "
                         "fallen, so extremes tend to mark the wrong moment: stock allocation "
                         "peaked at 77% in January 2000 and bottomed at 40.8% in March 2009, "
                         "the exact month cash peaked at 44.8%. Across the four recessions in "
                         "the record, stock allocation averages 54.8% during the recession "
                         "against 62.9% in expansions.",
            ))
    finally:
        conn.close()
    return out


def _sp500_valuation() -> dict[str, Any] | None:
    """Latest S&P-500 DCF / fair-value projection from the marketdata package."""
    if not MARKETDATA_OK or md_connect is None:
        return None
    conn = md_connect()
    try:
        proj = md_market_inputs.get_current_sp500_projection(conn, cache_dir=str(MD_CACHE_DIR))
        if proj is not None:
            # Augment with Damodaran's forward (projected) earnings + analyst growth.
            try:
                g = md_damodaran.current_analyst_growth(cache_dir=str(MD_CACHE_DIR))
                fwd = md_damodaran.current_sp500_forward_earnings(cache_dir=str(MD_CACHE_DIR))
                proj["analystGrowth"] = g
                proj["projectedEarnings"] = fwd
            except Exception as exc:  # noqa: BLE001
                log.warning("_sp500_valuation: Damodaran forward-earnings augment failed: %s", exc)
                proj["analystGrowth"] = None
                proj["projectedEarnings"] = None
        return proj
    except Exception as exc:  # noqa: BLE001
        log.warning("sp500 valuation failed: %s", exc)
        return None
    finally:
        conn.close()


# ── Extended economic metrics (Economic Metrics definition library) ──────────
# These map 1:1 to the verbatim definition docs the frontend renders inside each
# metric dropdown. Each is matched to its definition by its exact `name`. Series
# that aren't available on FRED (ISM PMI, AAII, BofA survey, sovereign ratings,
# crude inventory, China steel, etc.) are intentionally omitted here — the
# frontend shows a "data source pending" note while still rendering the doc.

def _by_month(obs: list[dict[str, Any]]) -> dict[tuple[int, int], float]:
    d: dict[tuple[int, int], float] = {}
    for o in obs:
        y, m, _ = o["date"].split("-")
        d[(int(y), int(m))] = o["value"]
    return d


def _ratio_exact(a: list[dict[str, Any]], b: list[dict[str, Any]], scale: float = 1.0) -> list[dict[str, Any]]:
    """a/b aligned on identical dates, multiplied by scale."""
    bd = {o["date"]: o["value"] for o in b}
    out: list[dict[str, Any]] = []
    for o in sorted(a, key=lambda x: x["date"]):
        bv = bd.get(o["date"])
        if bv:
            out.append({"date": o["date"], "value": o["value"] * scale / bv})
    return out


def _ratio_monthly(a: list[dict[str, Any]], b: list[dict[str, Any]], scale: float = 1.0) -> list[dict[str, Any]]:
    """a/b aligned by calendar month (for mixed FRED/Yahoo month-end dates)."""
    bm = _by_month(b)
    out: list[dict[str, Any]] = []
    for o in sorted(a, key=lambda x: x["date"]):
        y, m, _ = o["date"].split("-")
        bv = bm.get((int(y), int(m)))
        if bv:
            out.append({"date": o["date"], "value": o["value"] * scale / bv})
    return out


def _product_exact(a: list[dict[str, Any]], b: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """a*b aligned on identical dates."""
    bd = {o["date"]: o["value"] for o in b}
    out: list[dict[str, Any]] = []
    for o in sorted(a, key=lambda x: x["date"]):
        bv = bd.get(o["date"])
        if bv is not None:
            out.append({"date": o["date"], "value": o["value"] * bv})
    return out


def _scaled(obs: list[dict[str, Any]], factor: float) -> list[dict[str, Any]]:
    return [{"date": o["date"], "value": o["value"] * factor} for o in obs]


def _diff_exact(a: list[dict[str, Any]], b: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """a - b aligned on identical dates."""
    bd = {o["date"]: o["value"] for o in b}
    out: list[dict[str, Any]] = []
    for o in sorted(a, key=lambda x: x["date"]):
        bv = bd.get(o["date"])
        if bv is not None:
            out.append({"date": o["date"], "value": o["value"] - bv})
    return out


def _extended_economic_metrics(start: str, end: str) -> list[dict[str, Any]]:
    """Build the metrics that map to the definition library and aren't already
    in the core list. Empty series (failed/missing) yield empty trends, which the
    frontend renders as a 'data source pending' dropdown — so this never raises."""
    def F(sid: str) -> list[dict[str, Any]]:
        return filter_from(fred_fetch(sid, start, end), MIN_YEAR)

    out: list[dict[str, Any]] = []

    # 02 Employment
    out.append(metric(
        number=30, name="Total Nonfarm Payrolls", unit="", frequency="monthly", display_type="line",
        trend=trend_pairs(F("PAYEMS")),
        definition="Total nonfarm payroll employment, thousands of persons (FRED: PAYEMS, monthly).",
        analysis="The headline jobs count. Steady gains confirm expansion; outright declines have marked every recession.",
    ))
    # 50 Headline Unemployment Rate (U-3)
    out.append(metric(
        number=61, name="Unemployment Rate", unit="%", frequency="monthly", display_type="line",
        trend=trend_pairs(F("UNRATE")),
        definition="Civilian unemployment rate (U-3) — percent of the labor force without a job and actively looking (FRED: UNRATE, monthly).",
        analysis="The headline labor-market gauge. A 3-month average rising 0.5pp above its 12-month low (the Sahm rule) has flagged every postwar recession in real time.",
    ))
    # 10 Residential Housing Investment ($B → actual dollars)
    out.append(metric(
        number=31, name="Residential Fixed Investment ($B)", unit="$", frequency="quarterly", display_type="line",
        trend=trend_pairs(_scaled(F("PRFI"), 1e9)),
        definition="Private residential fixed investment, annual rate (FRED: PRFI, quarterly).",
        analysis="One of the most rate-sensitive, forward-looking parts of GDP. Turns down well before broad recessions.",
    ))
    # 11 Wages vs CPI — real average hourly earnings YoY
    ahe = fred_fetch("CES0500000003", start, end)
    cpi_all = fred_fetch("CPIAUCSL", start, end)
    cpi_by = {o["date"]: o["value"] for o in cpi_all}
    real_ahe = [{"date": o["date"], "value": o["value"] / cpi_by[o["date"]] * 100}
                for o in ahe if o["date"] in cpi_by and cpi_by[o["date"]]]
    out.append(metric(
        number=32, name="Real Avg Hourly Earnings YoY %", unit="%", frequency="monthly",
        display_type="line", is_rate_of_change=True,
        trend=trend_pairs(filter_from(build_yoy_series(real_ahe), MIN_YEAR)),
        level_trend=trend_pairs(filter_from(real_ahe, MIN_YEAR)), level_unit="",
        definition="Year-over-year change in real average hourly earnings (FRED: CES0500000003 deflated by CPIAUCSL).",
        analysis="Positive = wages outpacing prices (rising real purchasing power); negative = households falling behind inflation.",
    ))
    # 12 Consumer Sentiment
    out.append(metric(
        number=33, name="Consumer Sentiment (UMich)", unit="", frequency="monthly", display_type="line",
        trend=trend_pairs(F("UMCSENT")),
        definition="University of Michigan Index of Consumer Sentiment (FRED: UMCSENT, monthly).",
        analysis="Leading read on discretionary demand. Sharp drops precede pullbacks in big-ticket consumer spending.",
    ))
    # (10-Year Treasury Yield moved into the treasuryYields maturity switcher in economic().)
    # 15 Heavy Truck Sales
    out.append(metric(
        number=35, name="Heavy Truck Sales (SAAR)", unit="", frequency="monthly", display_type="line",
        trend=trend_pairs(F("HTRUCKSSAAR")),
        definition="Heavy-weight truck retail sales, millions of units (SAAR) (FRED: HTRUCKSSAAR, monthly).",
        analysis="A classic late-cycle tell — heavy truck sales roll over months before recessions begin.",
    ))
    # 16 Copper/Silver/Gold — copper price as representative
    out.append(metric(
        number=36, name="Copper Price", unit="$", frequency="monthly", display_type="line",
        trend=trend_pairs(F("PCOPPUSDM")),
        definition="Global copper price, USD per metric ton (FRED: PCOPPUSDM, monthly).",
        analysis="'Dr. Copper' — industrial demand barometer. Rising copper signals expanding global manufacturing.",
    ))
    # 17 Oil WTI
    out.append(metric(
        number=37, name="WTI Crude Oil", unit="$", frequency="daily", display_type="line",
        trend=trend_pairs(F("DCOILWTICO")),
        definition="West Texas Intermediate crude oil spot price, USD per barrel (FRED: DCOILWTICO, daily).",
        analysis="Core energy input cost. Spikes squeeze consumer/industrial margins and feed headline inflation.",
    ))
    # 18 US Dollar Index (advanced economies)
    out.append(metric(
        number=38, name="Broad USD Index (Adv. Economies)", unit="", frequency="daily", display_type="line",
        trend=trend_pairs(F("DTWEXAFEGS")),
        definition="Nominal Advanced Foreign Economies US Dollar Index (FRED: DTWEXAFEGS, daily).",
        analysis="Dollar strength vs developed-market peers. A strong USD shrinks US multinationals' translated earnings.",
    ))
    # 19 Capacity Utilization
    out.append(metric(
        number=39, name="Capacity Utilization", unit="%", frequency="monthly", display_type="line",
        trend=trend_pairs(F("TCU")),
        definition="Total capacity utilization, percent of capacity (FRED: TCU, monthly).",
        analysis="Above ~80% signals tightening capacity and pricing power; falling utilization warns of slack and disinflation.",
    ))
    # 20 Industrial Production
    out.append(metric(
        number=40, name="Industrial Production Index", unit="", frequency="monthly", display_type="line",
        trend=trend_pairs(F("INDPRO")),
        definition="Industrial Production Index, 2017=100 (FRED: INDPRO, monthly).",
        analysis="Real output of factories, mines, and utilities. Sustained declines coincide with industrial recessions.",
    ))
    # 21 GDP Output Gap (derived)
    gdpc1 = F("GDPC1")
    gdppot = fred_fetch("GDPPOT", start, end)
    pot_by = {o["date"]: o["value"] for o in gdppot}
    gap = [{"date": o["date"], "value": (o["value"] - pot_by[o["date"]]) / pot_by[o["date"]] * 100}
           for o in gdpc1 if o["date"] in pot_by and pot_by[o["date"]]]
    out.append(metric(
        number=41, name="GDP Output Gap", unit="%", frequency="quarterly",
        display_type="line", is_rate_of_change=True,
        trend=trend_pairs(filter_from(gap, MIN_YEAR)),
        definition="Output gap = (real GDP − potential GDP) / potential GDP × 100 (FRED: GDPC1, GDPPOT).",
        analysis="Positive = economy running hot (inflationary, late-cycle); negative = slack (disinflationary, early-cycle).",
    ))
    # 22 5-Year Breakeven
    out.append(metric(
        number=42, name="5-Year Breakeven Inflation", unit="%", frequency="daily", display_type="line",
        trend=trend_pairs(F("T5YIE")),
        definition="5-Year breakeven inflation rate, market-implied (FRED: T5YIE, daily).",
        analysis="The market's expected average inflation over 5 years. Drifting above ~2.5% pressures the Fed to stay restrictive.",
    ))
    # 24 U-6 Unemployment
    out.append(metric(
        number=43, name="U-6 Unemployment Rate", unit="%", frequency="monthly", display_type="line",
        trend=trend_pairs(F("U6RATE")),
        definition="U-6 underemployment rate — unemployed plus marginally attached plus part-time for economic reasons (FRED: U6RATE).",
        analysis="The broadest labor-slack gauge. A widening U6–U3 gap signals hidden weakness before the headline rate moves.",
    ))
    # 25 Labor Force Participation
    out.append(metric(
        number=44, name="Labor Force Participation Rate", unit="%", frequency="monthly", display_type="line",
        trend=trend_pairs(F("CIVPART")),
        definition="Civilian labor force participation rate, percent (FRED: CIVPART, monthly).",
        analysis="Structural supply of labor. Falling participation tightens the labor market even at a steady unemployment rate.",
    ))
    # 26 Retail Sales YoY
    out.append(metric(
        number=45, name="Retail Sales YoY %", unit="%", frequency="monthly",
        display_type="line", is_rate_of_change=True,
        trend=trend_pairs(filter_from(build_yoy_series(F("RSAFS")), MIN_YEAR)),
        level_trend=trend_pairs(F("RSAFS")), level_unit="$",
        definition="Year-over-year change in advance retail and food-services sales (FRED: RSAFS, monthly).",
        analysis="Direct read on consumer demand. Turning negative in real terms is an early recession warning.",
    ))
    # 27 Personal Savings Rate
    out.append(metric(
        number=46, name="Personal Savings Rate", unit="%", frequency="monthly", display_type="line",
        trend=trend_pairs(F("PSAVERT")),
        definition="Personal saving as a percentage of disposable personal income (FRED: PSAVERT, monthly).",
        analysis="Low savings = stretched consumers vulnerable to shocks; rising savings = caution that dampens discretionary demand.",
    ))
    # 28 Credit Spreads
    out.append(metric(
        number=47, name="High-Yield Credit Spread (OAS)", unit="%", frequency="daily", display_type="line",
        trend=trend_pairs(F("BAMLH0A0HYM2")),
        definition="ICE BofA US High-Yield option-adjusted spread, percentage points (FRED: BAMLH0A0HYM2, daily).",
        analysis="The market's real-time fear gauge for corporate credit. Blowouts above ~5–6% signal tightening financial conditions.",
    ))
    # 29 C&I Loans YoY
    out.append(metric(
        number=48, name="C&I Loans YoY %", unit="%", frequency="monthly",
        display_type="line", is_rate_of_change=True,
        trend=trend_pairs(filter_from(build_yoy_series(F("BUSLOANS")), MIN_YEAR)),
        level_trend=trend_pairs(F("BUSLOANS")), level_unit="$",
        definition="Year-over-year growth in commercial and industrial loans at all commercial banks (FRED: BUSLOANS, monthly).",
        analysis="Contracting C&I lending reflects tightening credit standards and falling business demand — a recession precursor.",
    ))
    # 56 Bank Loans & Leases — total bank lending (TOTLL) with a C&I large-bank variant (CIBOARD)
    out.append(metric(
        number=56, name="Bank Loans & Leases (YoY %)", unit="%", frequency="weekly",
        display_type="line", is_rate_of_change=True,
        trend=trend_pairs(filter_from(build_yoy_series(fred_fetch("TOTLL", start, end)), MIN_YEAR)),
        level_trend=trend_pairs(F("TOTLL")), level_unit="$",
        alt_trend=trend_pairs(filter_from(build_yoy_series(fred_fetch("CIBOARD", start, end)), MIN_YEAR)),
        alt_level_trend=trend_pairs(F("CIBOARD")), alt_unit="%",
        base_variant_label="Total loans & leases", alt_variant_label="C&I (large banks)",
        definition="Bank lending at US commercial banks. The base series is total loans and leases in bank credit (FRED: TOTLL, weekly); the variant is commercial and industrial loans at large domestically chartered banks (FRED: CIBOARD, weekly). Switch the series, then toggle Level for the dollar amount or YoY for the growth rate.",
        analysis="Total bank lending tends to push to record highs and accelerate late in a boom, when easy credit funds the very assets that are inflating. Watch for a level at new highs while the YoY rate is still rising (credit fueling the cycle), and for a sharp roll-over in the YoY rate (banks pulling back, which has preceded past slowdowns). The C&I variant is the business-lending slice and tends to turn before the total. Read it next to high-yield spreads and the savings rate before drawing conclusions; a high or rising level is not proof of trouble on its own.",
    ))
    # 31 Current Account % of GDP (derived, annualized)
    out.append(metric(
        number=49, name="Current Account % of GDP", unit="%", frequency="quarterly",
        display_type="line", is_rate_of_change=True,
        trend=trend_pairs(filter_from(_ratio_exact(F("IEABC"), F("GDP"), scale=0.4), MIN_YEAR)),
        definition="Balance on current account annualized as a percent of nominal GDP (FRED: IEABC, GDP).",
        analysis="Persistent deficits mean reliance on foreign capital inflows — a structural vulnerability when the dollar weakens.",
    ))
    # 32 Total Non-Financial Debt % of GDP (derived)
    out.append(metric(
        number=50, name="Total Non-Financial Debt % of GDP", unit="%", frequency="quarterly", display_type="line",
        trend=trend_pairs(filter_from(_ratio_exact(F("TODNS"), F("GDP"), scale=0.1), MIN_YEAR)),
        definition="Total nonfinancial-sector debt as a percent of nominal GDP (FRED: TODNS, GDP).",
        analysis="Total economy-wide leverage. Rising debt-to-GDP raises fragility and constrains future growth.",
    ))
    # 33 Global CB Balance Sheet — Fed proxy ($M → actual dollars)
    out.append(metric(
        number=51, name="Fed Balance Sheet ($M)", unit="$", frequency="monthly", display_type="line",
        trend=trend_pairs(resample_monthly(_scaled(F("WALCL"), 1e6))),
        definition="Federal Reserve total assets, used as a proxy for global central-bank liquidity (FRED: WALCL, weekly → monthly).",
        analysis="QE expands the balance sheet and lifts risk assets; QT drains liquidity and tightens financial conditions.",
    ))
    # 35 Treasury General Account ($M → actual dollars)
    out.append(metric(
        number=52, name="Treasury General Account ($M)", unit="$", frequency="monthly", display_type="line",
        trend=trend_pairs(resample_monthly(_scaled(F("WTREGEN"), 1e6))),
        definition="US Treasury General Account balance at the Fed (FRED: WTREGEN, weekly → monthly).",
        analysis="A rising TGA drains reserves from the banking system (liquidity headwind); a falling TGA injects liquidity.",
    ))
    # 37 VIX
    out.append(metric(
        number=53, name="VIX", unit="", frequency="daily", display_type="line",
        trend=trend_pairs(F("VIXCLS")),
        definition="CBOE Volatility Index — 30-day implied volatility on the S&P 500 (FRED: VIXCLS, daily).",
        analysis="Sub-15 = complacency; spikes above 30 mark fear and risk-off. Mean-reverts strongly after shocks.",
    ))
    # 39 Copper/Gold Ratio (derived, monthly)
    gold_m = filter_from(yahoo_monthly("GC=F", start, end), MIN_YEAR)
    silver_m = filter_from(yahoo_monthly("SI=F", start, end), MIN_YEAR)
    out.append(metric(
        number=54, name="Copper/Gold Ratio", unit="", frequency="monthly", display_type="line",
        trend=trend_pairs(_ratio_monthly(F("PCOPPUSDM"), gold_m)),
        definition="Ratio of the copper price to the gold price (FRED: PCOPPUSDM ÷ Yahoo GC=F).",
        analysis="Rising = growth/risk-on (industrial demand over safe-haven); falling = defensive, slowdown signal.",
    ))
    # 40 AUD/JPY (derived, daily)
    out.append(metric(
        number=55, name="AUD/JPY Exchange Rate", unit="", frequency="daily", display_type="line",
        trend=trend_pairs(_product_exact(F("DEXUSAL"), F("DEXJPUS"))),
        definition="Australian dollar per Japanese yen cross rate (FRED: DEXUSAL × DEXJPUS).",
        analysis="A classic risk-on/risk-off barometer — AUD/JPY rises with global risk appetite and falls in stress.",
    ))
    # 41 Gold/Silver Ratio (derived, monthly)
    out.append(metric(
        number=56, name="Gold/Silver Ratio", unit="", frequency="monthly", display_type="line",
        trend=trend_pairs(_ratio_monthly(gold_m, silver_m)),
        definition="Ratio of the gold price to the silver price (Yahoo GC=F ÷ SI=F, monthly).",
        analysis="Elevated ratios signal defensive, deflationary regimes; falling ratios accompany reflation and risk appetite.",
    ))
    # 45 30-Year Mortgage Rate
    out.append(metric(
        number=57, name="30-Year Mortgage Rate", unit="%", frequency="monthly", display_type="line",
        trend=trend_pairs(resample_monthly(F("MORTGAGE30US"))),
        definition="30-year fixed mortgage average rate (FRED: MORTGAGE30US, weekly → monthly).",
        analysis="The transmission of Fed policy into housing affordability. Rising rates freeze housing turnover and homebuilders.",
    ))
    # 48 Iron Ore Price
    out.append(metric(
        number=58, name="Iron Ore Price Index", unit="", frequency="monthly", display_type="line",
        trend=trend_pairs(F("PIORECRUSDM")),
        definition="Global price of iron ore, index (FRED: PIORECRUSDM, monthly).",
        analysis="A direct read on Chinese steel/construction demand — the swing factor for global materials and miners.",
    ))
    # 49 Population Growth — YoY %
    out.append(metric(
        number=59, name="US Population YoY %", unit="%", frequency="monthly",
        display_type="line", is_rate_of_change=True,
        trend=trend_pairs(filter_from(build_yoy_series(F("POPTHM")), MIN_YEAR)),
        level_trend=trend_pairs(F("POPTHM")), level_unit="",
        definition="Year-over-year change in the US total population (FRED: POPTHM, monthly).",
        analysis="The slow structural driver of trend demand and labor supply. Decelerating growth is a long-run headwind.",
    ))
    # 34 SOFR-OIS Spread — proxied as SOFR − EFFR (true OIS quotes aren't on FRED).
    # USD overnight index swaps float against the effective fed funds rate, so the
    # secured SOFR minus the unsecured policy rate (EFFR) captures the same
    # secured-funding-stress basis the SOFR-OIS spread is built to measure.
    out.append(metric(
        number=60, name="SOFR-OIS Spread (proxy)", unit="%", frequency="daily", display_type="line",
        trend=trend_pairs(_diff_exact(F("SOFR"), F("EFFR"))),
        definition="SOFR minus the effective federal funds rate, in percentage points (FRED: SOFR − EFFR). "
                   "A FRED-available proxy for the SOFR-OIS spread: USD overnight index swaps reference the "
                   "fed funds rate, so secured SOFR minus the unsecured policy rate (EFFR) captures the same "
                   "secured-funding-stress basis. True OIS quotes are not published on FRED.",
        analysis="Sits near zero in calm funding markets. Sharp positive spikes — e.g. the September 2019 repo "
                 "blow-up, where it jumped roughly 3 percentage points — flag a scramble for secured cash and "
                 "collateral, i.e. acute money-market stress that frequently forces Fed liquidity intervention.",
    ))
    # 66 10-Year Real Yield (TIPS) — the market real interest rate (DFII10).
    out.append(metric(
        number=66, name="10-Year Real Yield (TIPS)", unit="%", frequency="daily", display_type="line",
        trend=trend_pairs(F("DFII10")),
        definition="Yield on 10-year Treasury Inflation-Protected Securities at constant maturity "
                   "(FRED: DFII10, daily). This is the market real interest rate: the 10-year Treasury "
                   "yield net of expected inflation, equal to the nominal 10-year yield minus the "
                   "10-year breakeven inflation rate. Because TIPS principal is indexed to CPI, their "
                   "quoted yield is a real (inflation-adjusted) return.",
        analysis="The true cost of money and the single most important discount-rate input for "
                 "long-duration assets. Deeply negative real yields (2020-21) inflate equity and "
                 "housing valuations; a sharp move positive (2022) compresses them. Rising real yields "
                 "are a direct headwind for gold, long-duration growth stocks, and rate-sensitive sectors.",
    ))
    # 67 Net Liquidity — Fed balance sheet minus Treasury cash minus reverse repos.
    # WALCL and WTREGEN are in $M; RRPONTSYD (overnight reverse repos) is in $B — so
    # each is converted to actual dollars before differencing. All three are resampled
    # to month-end and aligned by calendar month.
    walcl_m = resample_monthly(F("WALCL"))
    tga_by = _by_month(resample_monthly(F("WTREGEN")))
    rrp_by = _by_month(resample_monthly(F("RRPONTSYD")))
    net_liq: list[dict[str, Any]] = []
    for o in walcl_m:
        y, mo, _ = o["date"].split("-")
        key = (int(y), int(mo))
        tga = tga_by.get(key)
        if tga is None:
            continue
        rrp = rrp_by.get(key, 0.0)  # ON RRP was negligible before the 2021 facility ramp
        net_liq.append({"date": o["date"], "value": o["value"] * 1e6 - tga * 1e6 - rrp * 1e9})
    out.append(metric(
        number=67, name="Net Liquidity ($)", unit="$", frequency="monthly", display_type="line",
        trend=trend_pairs(net_liq),
        definition="Net liquidity = Federal Reserve total assets minus the Treasury General Account "
                   "minus overnight reverse repos (FRED: WALCL − WTREGEN − RRPONTSYD, weekly → monthly). "
                   "WALCL and WTREGEN are reported in millions and RRPONTSYD in billions; all three are "
                   "converted to dollars before differencing. Subtracting the two largest reserve drains "
                   "from the balance sheet isolates the liquidity that actually reaches the banking system.",
        analysis="The cleanest single read on liquidity actually available to markets. Rising net "
                 "liquidity — QE, a falling TGA, or cash draining out of reverse repos back into reserves "
                 "— has tracked risk-asset strength closely; falling net liquidity — QT, a rising TGA, or "
                 "cash parked in reverse repos — tightens financial conditions even when the headline "
                 "balance sheet looks flat.",
    ))

    return out


# ── /api/economic ────────────────────────────────────────────────────────────
# Each metric is returned at its native FRED frequency so the frontend can
# render line charts (sub-annual) vs bar charts (annual) appropriately.
# For inflation/money-supply we return BOTH the level AND the YoY % so users
# see the price/number trend in addition to the rate of change.

@app.get("/api/economic")
# 30, not 10: the sector lens loads this alongside the Economic page's own
# fetch, and the route is already cached six hours, so the extra headroom
# costs nothing upstream.
@limiter.limit("30/minute")
@cached(ttl_seconds=6 * 3600, key_prefix="econ")
def economic(request: Request) -> dict[str, Any]:
    # Pull a year of buffer so YoY can compute on the first MIN_YEAR observation
    start = f"{MIN_YEAR - 1}-01-01"
    end = datetime.date.today().isoformat()

    # Core series — money, prices, rates, growth, debt, markets
    gdp_q = filter_from(fred_fetch("A191RL1Q225SBEA", start, end), MIN_YEAR)
    debt_a = filter_from(fred_fetch("GFDGDPA188S", start, end), MIN_YEAR)
    cpi_m = filter_from(fred_fetch("CPIAUCSL", start, end), MIN_YEAR)
    ppi_m = filter_from(fred_fetch("PPIACO", start, end), MIN_YEAR)
    m2_m = filter_from(fred_fetch("M2SL", start, end), MIN_YEAR)
    m1_m = filter_from(fred_fetch("M1SL", start, end), MIN_YEAR)
    m2_real_m = filter_from(fred_fetch("M2REAL", start, end), MIN_YEAR)
    m1_real_m = filter_from(real_money("M1SL", start, end), MIN_YEAR)
    yc_2y_d = filter_from(fred_fetch("T10Y2Y", start, end), MIN_YEAR)
    yc_3m_d = filter_from(fred_fetch("T10Y3M", start, end), MIN_YEAR)
    # Treasury constant-maturity yield LEVELS for the maturity switcher. DGS1 is
    # reused by the Fed-model earnings-yield comparison below.
    dgs3mo_d = filter_from(fred_fetch("DGS3MO", start, end), MIN_YEAR)
    dgs1_d = filter_from(fred_fetch("DGS1", start, end), MIN_YEAR)
    dgs2_d = filter_from(fred_fetch("DGS2", start, end), MIN_YEAR)
    dgs10_d = filter_from(fred_fetch("DGS10", start, end), MIN_YEAR)
    sp500_d_full = fred_fetch("SP500", start, end)  # full for ratios
    sp500_d = filter_from(sp500_d_full, MIN_YEAR)
    fx_debt_q = filter_from(fred_fetch("HBFIGDQ188S", start, end), MIN_YEAR)
    usd_index_d = filter_from(fred_fetch("DTWEXBGS", start, end), MIN_YEAR)
    trade_bal_m = filter_from(fred_fetch("BOPGSTB", start, end), MIN_YEAR)
    exports_q = filter_from(fred_fetch("EXPGSC1", start, end), MIN_YEAR)
    imports_q = filter_from(fred_fetch("IMPGSC1", start, end), MIN_YEAR)
    unemp_m = filter_from(fred_fetch("UNRATE", start, end), MIN_YEAR)
    import_px_m = filter_from(fred_fetch("IR", start, end), MIN_YEAR)

    # Derived
    cpi_yoy = filter_from(build_yoy_series(cpi_m), MIN_YEAR)
    ppi_yoy = filter_from(build_yoy_series(ppi_m), MIN_YEAR)
    m2_yoy = filter_from(build_yoy_series(m2_m), MIN_YEAR)
    m1_yoy = filter_from(build_yoy_series(m1_m), MIN_YEAR)
    m2_real_yoy = filter_from(build_yoy_series(m2_real_m), MIN_YEAR)
    m1_real_yoy = filter_from(build_yoy_series(m1_real_m), MIN_YEAR)
    usd_yoy = filter_from(build_yoy_series(usd_index_d), MIN_YEAR)
    exports_yoy = filter_from(build_yoy_series(exports_q), MIN_YEAR)
    imports_yoy = filter_from(build_yoy_series(imports_q), MIN_YEAR)
    sp500_yoy = filter_from(build_yoy_series(sp500_d), MIN_YEAR)
    import_px_yoy = filter_from(build_yoy_series(import_px_m), MIN_YEAR)

    # Money-adjusted SP500 + quarterly returns
    _sp_m2_raw, sp_m2_norm = adjusted_sp500("M2SL", sp500_d_full, start, end)
    _sp_m1_raw, sp_m1_norm = adjusted_sp500("M1SL", sp500_d_full, start, end)
    _sp_m2real_raw, sp_m2real_norm = adjusted_sp500("M2REAL", sp500_d_full, start, end)
    sp_m2_norm = filter_from(sp_m2_norm, MIN_YEAR)
    sp_m1_norm = filter_from(sp_m1_norm, MIN_YEAR)
    sp_m2real_norm = filter_from(sp_m2real_norm, MIN_YEAR)
    sp500_qret = filter_from(quarterly_returns(sp500_d_full), MIN_YEAR)

    # Bands cover the EARLIEST series on the page, not MIN_YEAR. Metric 69 (AAII
    # asset allocation) runs from 1987 and would otherwise shade only the COVID
    # recession, hiding the 1990, 2001 and 2008 cycles that are the whole reason
    # to plot it. Sending the extra bands is free for the 2012-start charts:
    # `visibleRecessions` clips them to each chart's own domain before rendering.
    recession_bands = fetch_recession_bands(_ECON_BANDS_START, end)

    metrics: list[dict[str, Any]] = [
        # Growth & employment
        metric(
            number=1, name="Real GDP Growth", unit="%", frequency="quarterly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(gdp_q),
            definition="Annualised inflation-adjusted change in total US economic output (FRED: A191RL1Q225SBEA, quarterly).",
            analysis="Above ~2.5% historically supports rising equity multiples. Two consecutive negative quarters marks technical recession.",
            vertical=[
                {"label": "Quarters above 2.5%", "value": sum(1 for o in gdp_q if o["value"] >= 2.5), "unit": ""},
                {"label": "Quarters in contraction", "value": sum(1 for o in gdp_q if o["value"] < 0), "unit": ""},
            ],
        ),
        metric(
            number=2, name="Unemployment Rate", unit="%", frequency="monthly",
            display_type="line",
            trend=trend_pairs(unemp_m),
            definition="Headline U-3 unemployment rate (FRED: UNRATE, monthly).",
            analysis="Sub-4% = tight labor market; wage pressure follows. Sahm Rule (≥0.5pp rise over 3-month avg) has triggered every US recession since 1970.",
        ),

        # Inflation — show BOTH level and YoY
        metric(
            number=3, name="CPI Level", unit="", frequency="monthly",
            display_type="line",
            trend=trend_pairs(cpi_m),
            definition="Consumer Price Index level (FRED: CPIAUCSL, monthly, 1982-84=100).",
            analysis="The underlying price level. Rising slope = inflation; flat = price stability; declining = deflation. The most-watched single price gauge in the world.",
        ),
        metric(
            number=4, name="CPI YoY Inflation", unit="%", frequency="monthly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(cpi_yoy),
            level_trend=trend_pairs(cpi_m), level_unit="",
            definition="Year-over-year change in CPI. The headline inflation print.",
            analysis="Persistently above 3% pressures central banks to keep rates restrictive. Below 1.5% signals deflation risk and weak nominal growth.",
        ),
        metric(
            number=5, name="PPI YoY Inflation", unit="%", frequency="monthly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(ppi_yoy),
            level_trend=trend_pairs(ppi_m), level_unit="",
            definition="YoY change in the Producer Price Index for all commodities (PPIACO). Leads CPI by 3-6 months.",
            analysis="Diverging PPI vs CPI implies margin pressure (PPI > CPI) or pricing power (CPI > PPI). Watch the gap.",
        ),

        # Money supply — level and YoY
        metric(
            number=6, name="M2 Money Supply ($B)", unit="$", frequency="monthly",
            display_type="line",
            trend=trend_pairs(m2_m),
            alt_trend=trend_pairs(m2_real_m), alt_unit="$",
            base_variant_label="Nominal", alt_variant_label="Real",
            definition="M2 money supply level in billions (FRED: M2SL, monthly). Toggle to Real for the inflation-adjusted series (FRED: M2REAL), which deflates M2 by CPI to show purchasing power.",
            analysis="The broadest commonly-tracked money aggregate. Rapid expansions historically precede asset-price inflation; rare contractions coincide with risk-off moves. The Real view strips out inflation — when Real M2 contracts, money is losing ground to prices even if nominal M2 is flat.",
        ),
        metric(
            number=7, name="M2 YoY %", unit="%", frequency="monthly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(m2_yoy),
            level_trend=trend_pairs(m2_m), level_unit="$",
            definition="Year-over-year change in M2.",
            analysis="Sustained growth above 6-7% historically precedes inflation. Contractions (negative YoY) are rare and often coincide with major risk-off moves.",
        ),

        # Rates / yield curve
        metric(
            number=8, name="10Y - 2Y Treasury Spread", unit="%", frequency="daily",
            display_type="line",
            trend=trend_pairs(yc_2y_d),
            definition="Spread between 10-year and 2-year US Treasury yields (T10Y2Y). The flagship yield-curve recession signal.",
            analysis="Inversions (negative spread) have preceded every US recession since 1955 — typically by 6-18 months. Signal works on inversion + steepening, not on inversion alone.",
        ),
        metric(
            number=9, name="10Y - 3M Treasury Spread", unit="%", frequency="daily",
            display_type="line",
            trend=trend_pairs(yc_3m_d),
            definition="Spread between 10-year and 3-month US Treasury yields (T10Y3M). NY Fed's preferred recession-probability driver.",
            analysis="More reliable than 10Y-2Y per NY Fed research. Persistent inversion (>3 months) raises recession probability above 30%.",
        ),

        # Debt
        metric(
            number=10, name="Federal Debt as % of GDP", unit="%", frequency="annual",
            display_type="bar",
            trend=trend_pairs(debt_a),
            definition="Gross US federal debt as a share of GDP (FRED: GFDGDPA188S, annual). Total fiscal leverage of the federal government.",
            analysis="Reinhart & Rogoff found growth slows materially above ~90% — though currency issuers have more rope. Watch the trajectory, not just the level.",
        ),
        metric(
            number=11, name="Foreign-Held Federal Debt % of GDP", unit="%", frequency="quarterly",
            display_type="line",
            trend=trend_pairs(fx_debt_q),
            definition="Federal debt held by foreign and international investors as % of GDP (HBFIGDQ188S, quarterly).",
            analysis="Falling means domestic absorption is rising — often a sign the US is monetising more of its own debt. Watch for reserve-currency-status shifts.",
        ),

        # Markets
        metric(
            number=12, name="S&P 500 Level", unit="", frequency="daily",
            display_type="line",
            trend=trend_pairs(sp500_d),
            definition="S&P 500 daily close (FRED: SP500).",
            analysis="The reference benchmark. Compare slope vs M2 growth — if S&P 500 outpaces money supply, multiple expansion is doing the heavy lifting.",
        ),
        metric(
            number=13, name="S&P 500 YoY %", unit="%", frequency="daily",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(sp500_yoy),
            level_trend=trend_pairs(sp500_d), level_unit="",
            definition="S&P 500 year-over-year change.",
            analysis="The cleanest single-line read on equity-market regime. Sustained >20% = euphoria; sustained <-20% = crisis. Mean-reverts strongly.",
        ),

        # Trade
        metric(
            number=14, name="Trade-Weighted USD Index", unit="", frequency="daily",
            display_type="line",
            trend=trend_pairs(usd_index_d),
            definition="Nominal Broad USD Index level (DTWEXBGS) — trade-weighted vs the basket of major US trading partners.",
            analysis="Rising USD tightens financial conditions for emerging markets and shrinks US multinationals' foreign earnings. Falling USD boosts exports.",
        ),
        metric(
            number=15, name="Trade-Weighted USD YoY %", unit="%", frequency="daily",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(usd_yoy),
            level_trend=trend_pairs(usd_index_d), level_unit="",
            definition="Year-over-year change in the trade-weighted USD index.",
            analysis="USD strength is the single biggest swing factor for ex-US earnings translation. >+8% headwind for multinationals; <-8% tailwind.",
        ),
        metric(
            number=16, name="Trade Balance ($M)", unit="$", frequency="monthly",
            display_type="line",
            trend=[(o["date"], o["value"] * 1e6) for o in trade_bal_m],  # BOPGSTB is in $M
            definition="Monthly trade balance in goods and services (BOPGSTB). Negative = trade deficit.",
            analysis="Persistent deficits financed by foreign capital inflows. Widening deficits + weak dollar = stress; narrowing deficits + strong dollar = competitiveness.",
        ),
        metric(
            number=62, name="Real Exports ($B)", unit="$", frequency="quarterly",
            display_type="line",
            trend=trend_pairs(exports_q),
            definition="Real exports of goods and services, billions of chained 2017 dollars at an annual rate (FRED: EXPGSC1, quarterly). The inflation-adjusted volume of US output sold abroad.",
            analysis="The level of US export volume — a direct read on global demand for American output. Rising exports signal expanding foreign demand and cushion the trade deficit; sustained declines alongside weakening industrial production confirm a trade-led slowdown. Toggle to YoY % for the momentum view.",
        ),
        metric(
            number=17, name="Real Exports YoY %", unit="%", frequency="quarterly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(exports_yoy),
            level_trend=trend_pairs(exports_q), level_unit="$",
            definition="YoY change in real exports of goods and services (EXPGSC1) — volume of US output sold abroad, chained 2017 dollars.",
            analysis="Direct read on global demand for US output. Contracting alongside weakening industrial production confirms recession.",
        ),
        metric(
            number=63, name="Real Imports ($B)", unit="$", frequency="quarterly",
            display_type="line",
            trend=trend_pairs(imports_q),
            definition="Real imports of goods and services, billions of chained 2017 dollars at an annual rate (FRED: IMPGSC1, quarterly). The inflation-adjusted volume of foreign goods and services purchased by US buyers.",
            analysis="The level of US import volume — a direct read on domestic demand. Rising imports reflect a strong US consumer but widen the trade deficit; falling imports typically coincide with slowing demand or recession. Pair with Real Exports for the real net-trade picture; toggle to YoY % for momentum.",
        ),
        metric(
            number=64, name="Real Imports YoY %", unit="%", frequency="quarterly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(imports_yoy),
            level_trend=trend_pairs(imports_q), level_unit="$",
            definition="YoY change in real imports of goods and services (FRED: IMPGSC1) — volume of foreign goods and services bought by US buyers, chained 2017 dollars.",
            analysis="A coincident gauge of US domestic demand: import growth booms in expansions and collapses in recessions (2008-09, 2020). Imports persistently outpacing exports drags the real net-trade contribution to GDP.",
        ),

        # NEW — additional money supply series
        metric(
            number=18, name="M1 Money Supply ($B)", unit="$", frequency="monthly",
            display_type="line",
            trend=trend_pairs(m1_m),
            definition="M1 money supply level in billions (FRED: M1SL, monthly). Cash + checking + reservable deposits — the narrowest money aggregate.",
            analysis="M1 shifts more violently than M2. Sudden M1 spikes often precede inflation; sustained contractions are rare but bearish for risk assets.",
        ),
        metric(
            number=19, name="M1 YoY %", unit="%", frequency="monthly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(m1_yoy),
            level_trend=trend_pairs(m1_m), level_unit="$",
            definition="Year-over-year change in M1.",
            analysis="More volatile than M2 YoY — the 2020 M1 spike was the largest in series history due to definitional changes + COVID stimulus.",
        ),
        metric(
            number=20, name="Real M2 ($B, inflation-adjusted)", unit="$", frequency="monthly",
            display_type="line",
            trend=trend_pairs(m2_real_m),
            definition="Real M2 money supply (FRED: M2REAL) — M2 deflated by CPI to remove inflation. Shows actual purchasing power held in money.",
            analysis="When Real M2 contracts, the money supply is losing ground to inflation — a tightening signal even if nominal M2 is flat.",
        ),
        metric(
            number=21, name="Real M2 YoY %", unit="%", frequency="monthly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(m2_real_yoy),
            level_trend=trend_pairs(m2_real_m), level_unit="$",
            definition="YoY change in real M2.",
            analysis="Negative readings = real purchasing power of money shrinking. Sustained negative real M2 growth historically coincides with risk-off periods.",
        ),
        metric(
            number=22, name="Real M1 (derived: M1/CPI×100)", unit="", frequency="monthly",
            display_type="line",
            trend=trend_pairs(m1_real_m),
            definition="Derived real M1 = M1SL / CPIAUCSL × 100. M1 adjusted for the price level — mirrors the matplotlib calc in economicmetrics.py.",
            analysis="Tracks pre- and post-2020 narrow money in real terms. The 2020 spike + 2022 contraction are visible.",
        ),
        metric(
            number=23, name="Real M1 YoY %", unit="%", frequency="monthly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(m1_real_yoy),
            level_trend=trend_pairs(m1_real_m), level_unit="",
            definition="YoY change in derived real M1.",
            analysis="Inflation-adjusted M1 growth. Combine with Real M2 YoY for the cleanest read on monetary tightening/easing.",
        ),

        # NEW — money-adjusted SP500 + quarterly returns
        metric(
            number=24, name="S&P 500 / M2 Normalised", unit="", frequency="daily",
            display_type="line",
            trend=trend_pairs(sp_m2_norm),
            definition="S&P 500 divided by M2 money supply, rebased to 100 at the start of the series. Strips out money-supply inflation from equity gains.",
            analysis="Rising = equities outpacing money-supply growth (real wealth creation). Falling = equity gains are mostly liquidity-driven, not earnings-driven.",
        ),
        metric(
            number=65, name="S&P 500 / Real M2 Normalised", unit="", frequency="daily",
            display_type="line",
            trend=trend_pairs(sp_m2real_norm),
            alt_trend=trend_pairs(sp_m2_norm), alt_unit="",
            base_variant_label="Real M2", alt_variant_label="Nominal M2",
            definition="S&P 500 divided by Real M2 money supply (FRED: M2REAL, M2 deflated by CPI), rebased to 100 at the start of the series. Weighting equities by the inflation-adjusted money stock isolates how the market has moved relative to real purchasing power, not just the nominal money printed. Toggle to Nominal M2 for the unadjusted S&P 500 / M2 ratio.",
            analysis="Rising = equities outpacing the real (inflation-adjusted) money supply — genuine real wealth creation rather than liquidity- or inflation-driven gains. Because Real M2 already removes CPI, a falling line here is a sharper warning that equity strength is leaning on monetary expansion. Compare against the Nominal M2 variant: when the two diverge, inflation is doing the work.",
        ),
        metric(
            number=25, name="S&P 500 / M1 Normalised", unit="", frequency="daily",
            display_type="line",
            trend=trend_pairs(sp_m1_norm),
            definition="S&P 500 / M1, rebased to 100. More volatile than the M2 version because M1 itself is more volatile.",
            analysis="The 2020 M1 redefinition + COVID liquidity surge makes this series tricky pre/post-2020 — use the M2 version for cleaner comparisons.",
        ),
        metric(
            number=26, name="S&P 500 Quarterly Return %", unit="%", frequency="quarterly",
            display_type="bar", is_rate_of_change=True,
            trend=trend_pairs(sp500_qret),
            definition="Quarter-over-quarter % return using the last trading day of each quarter as the close.",
            analysis="A clear regime view: streaks of green = bull market; clustered red = corrections. ±10% quarters are common; ±20%+ are crisis-level.",
        ),

        # NEW — PPI level + Import Price Index
        metric(
            number=27, name="PPI All Commodities (Index)", unit="", frequency="monthly",
            display_type="line",
            trend=trend_pairs(ppi_m),
            definition="Producer Price Index for all commodities level (FRED: PPIACO, monthly). The underlying price level for goods sold by US producers.",
            analysis="Steep climbs precede CPI moves by 3-6 months. Flat-to-declining PPI Level alongside falling input costs = margin tailwind for goods producers.",
        ),
        metric(
            number=28, name="Import Price Index", unit="", frequency="monthly",
            display_type="line",
            trend=trend_pairs(import_px_m),
            definition="FRED: IR — index of prices US importers pay for all commodities. Captures imported inflation directly.",
            analysis="Leads CPI by 1-3 months. Rising import prices + strong USD = unusual combo signalling foreign supply shocks rather than dollar weakness.",
        ),
        metric(
            number=29, name="Import Price Index YoY %", unit="%", frequency="monthly",
            display_type="line", is_rate_of_change=True,
            trend=trend_pairs(import_px_yoy),
            level_trend=trend_pairs(import_px_m), level_unit="",
            definition="Year-over-year change in the Import Price Index.",
            analysis="Strong leading indicator of headline CPI inflation. Sustained >5% prints often precede Fed-rate tightening cycles.",
        ),
    ]

    # ── Extended metrics mapped to the Economic Metrics definition library ────
    try:
        metrics.extend(_extended_economic_metrics(start, end))
    except Exception as e:  # noqa: BLE001
        log.warning("extended economic metrics failed: %s", e)

    # ── Ported market-data metrics (CAPE / earnings yield / ERP / EPU / GPR) ──
    try:
        metrics.extend(_marketdata_metrics())
    except Exception as e:  # noqa: BLE001
        log.warning("marketdata metrics failed: %s", e)

    # ── Commodities ─────────────────────────────────────────────────────────
    # Pull a curated set of FRED commodity series + Yahoo gold/silver.
    # Each commodity gets a price metric + a 12-month rolling volatility metric.
    commodity_specs: list[tuple[str, str, str, str]] = [
        # (db_label, fred_or_yahoo_id, unit_label, source)
        ("Copper",         "PCOPPUSDM",     "$ / metric ton",  "fred"),
        ("Gold",           "GC=F",          "$ / troy oz",     "yahoo"),
        ("Silver",         "SI=F",          "$ / troy oz",     "yahoo"),
        ("Wheat",          "PWHEAMTUSDM",   "$ / metric ton",  "fred"),
        ("WTI Crude",      "WTISPLC",       "$ / barrel",      "fred"),
        ("Brent Crude",    "POILBREUSDM",   "$ / barrel",      "fred"),
        ("Henry Hub NatGas", "MHHNGSP",     "$ / MMBtu",       "fred"),
        ("Heavy Trucks",   "HTRUCKSSAAR",   "000s units (SAAR)", "fred"),
    ]

    commodities_block: list[dict[str, Any]] = []
    for label, code, unit_lbl, source in commodity_specs:
        if source == "yahoo":
            prices = filter_from(yahoo_monthly(code, start, end), MIN_YEAR)
        else:
            prices = filter_from(fred_fetch(code, start, end), MIN_YEAR)
            # Most FRED commodity series are monthly already; ensure clean monthly
            prices = resample_monthly(prices) if prices else []
        if not prices:
            continue
        vol = rolling_log_vol(prices, window=12)
        commodities_block.append({
            "label": label,
            "ticker": code,
            "source": source,
            "unit": unit_lbl,
            "price": [{"period": o["date"], "value": float(o["value"])} for o in prices],
            "volatility12m": [{"period": o["date"], "value": float(o["value"])} for o in vol],
        })

    # ── Treasury maturity switcher (3M/1Y/2Y/10Y level yields) ───────────────
    treasury_yields = [
        metric(number=80, name="3-Month Treasury Yield", unit="%", frequency="daily",
               display_type="line", trend=trend_pairs(dgs3mo_d),
               definition="Market yield on US Treasury securities at 3-month constant maturity (FRED: DGS3MO, daily).",
               analysis="The front end of the curve — tracks Fed policy almost one-for-one. Its level versus longer maturities defines the curve's slope and inversion."),
        metric(number=81, name="1-Year Treasury Yield", unit="%", frequency="daily",
               display_type="line", trend=trend_pairs(dgs1_d),
               definition="Market yield on US Treasury securities at 1-year constant maturity (FRED: DGS1, daily).",
               analysis="A short rate pricing in roughly a year of expected Fed policy. Used as the risk-free benchmark in the earnings-yield (Fed-model) comparison below."),
        metric(number=82, name="2-Year Treasury Yield", unit="%", frequency="daily",
               display_type="line", trend=trend_pairs(dgs2_d),
               definition="Market yield on US Treasury securities at 2-year constant maturity (FRED: DGS2, daily).",
               analysis="The most policy-sensitive belly point — the market's read on the Fed path over two years. The 10Y-minus-2Y spread is the classic recession signal."),
        metric(number=83, name="10-Year Treasury Yield", unit="%", frequency="daily",
               display_type="line", trend=trend_pairs(dgs10_d),
               definition="10-year US Treasury constant-maturity yield (FRED: DGS10, daily).",
               analysis="The benchmark long rate. Rising yields pressure long-duration equities and rate-sensitive sectors."),
    ]
    fed_model = _build_fed_model(dgs1_d, sp500_d)
    sp500_valuation = _sp500_valuation()

    return {
        "section": "economic",
        "scopeKey": "global",
        "title": "Economic Analysis",
        "subtitle": f"FRED + Yahoo data back to {MIN_YEAR}, refreshed every 6 hours · {len(recession_bands)} NBER recession(s) shaded",
        "metrics": metrics,
        "recessionBands": recession_bands,
        "commodities": commodities_block,
        "treasuryYields": treasury_yields,
        "fedModel": fed_model,
        "sp500Valuation": sp500_valuation,
    }


# ── /api/credit-banks ────────────────────────────────────────────────────────
# Credit-cycle and banking-system health, grounded in Arnold Ziegel's
# "Fundamentals of Credit and Credit Analysis". This is the macro "Condition"
# (the third of the five C's) that constrains every obligor's debt capacity:
#   • Spreads      — the market's real-time price of default risk.
#   • Credit cycle — lending standards (SLOOS) + loan growth; easy credit late
#                    in a boom funds the very assets that later default.
#   • Asset quality— delinquencies / charge-offs = realised losses; the moment
#                    the borrower's operating cash flow (first way out) fails.
#   • Bank capital — Basel view: reserves cover expected loss, capital covers
#                    unexpected loss; confidence/liquidity is the dominant bank risk.
# Same SectionData contract as /api/economic. Empty series render as a
# "data source pending" dropdown, so a renamed/absent FRED id never breaks the page.

def _credit_bank_metrics(start: str, end: str) -> list[dict[str, Any]]:
    """Build the Credit & Banking metric list. Never raises: a failed FRED
    fetch yields an empty trend the frontend shows as 'data source pending'."""
    def level(number: int, name: str, sid: str, *, unit: str, freq: str,
              definition: str, analysis: str) -> dict[str, Any]:
        return metric(
            number=number, name=name, unit=unit, frequency=freq, display_type="line",
            trend=trend_pairs(filter_from(fred_fetch(sid, start, end), MIN_YEAR)),
            definition=definition, analysis=analysis,
        )

    def yoy_level(number: int, name: str, sid: str, *, freq: str, level_unit: str,
                  definition: str, analysis: str) -> dict[str, Any]:
        raw = fred_fetch(sid, start, end)
        return metric(
            number=number, name=name, unit="%", frequency=freq, display_type="line",
            is_rate_of_change=True,
            trend=trend_pairs(filter_from(build_yoy_series(raw), MIN_YEAR)),
            level_trend=trend_pairs(filter_from(raw, MIN_YEAR)), level_unit=level_unit,
            definition=definition, analysis=analysis,
        )

    return [
        # ── Credit cycle: the market price of default risk ───────────────────
        level(1, "High-Yield Credit Spread (OAS)", "BAMLH0A0HYM2", unit="%", freq="daily",
              definition="ICE BofA US High-Yield option-adjusted spread over Treasuries, percentage points (FRED: BAMLH0A0HYM2, daily).",
              analysis="Ziegel's 'risk rating' priced by the market in real time. Blowouts above ~5–6% mean investors are demanding a steep premium to bear corporate default risk — financial conditions are tightening and the second way out (refinancing) is closing."),
        level(2, "Investment-Grade Credit Spread (OAS)", "BAMLC0A0CM", unit="%", freq="daily",
              definition="ICE BofA US Corporate (investment-grade) option-adjusted spread over Treasuries, percentage points (FRED: BAMLC0A0CM, daily).",
              analysis="The IG spread widening toward the HY spread signals stress migrating up the quality ladder — the market re-rating even BBB-/Baa3 borderline names below Ziegel's investment-grade cutoff."),
        level(3, "Baa Corporate Spread over 10Y", "BAA10Y", unit="%", freq="daily",
              definition="Moody's seasoned Baa corporate bond yield minus the 10-year Treasury yield (FRED: BAA10Y, daily).",
              analysis="The longest credit-spread history available; a durable regime read on the compensation demanded for lower-investment-grade credit risk across cycles."),
        # ── Credit cycle: lending standards and loan growth ──────────────────
        level(4, "Net % of Banks Tightening C&I Standards", "DRTSCILM", unit="%", freq="quarterly",
              definition="Senior Loan Officer Opinion Survey — net percentage of banks tightening standards on C&I loans to large and middle-market firms (FRED: DRTSCILM, quarterly).",
              analysis="Ziegel warns underwriting laxity precedes the cycle turn. A positive net share tightening is banks pulling back credit; it leads slowdowns in business investment and loan growth by several quarters."),
        yoy_level(5, "Bank Credit (YoY %)", "TOTBKCR", freq="weekly", level_unit="$",
                  definition="Total bank credit at all US commercial banks — loans plus securities (FRED: TOTBKCR, weekly). Toggle Level for the dollar amount or YoY for the growth rate.",
                  analysis="Aggregate credit creation. Accelerating late in an expansion is the easy-credit phase Ziegel flags; a sharp YoY roll-over is banks de-risking, which has preceded past recessions."),
        yoy_level(6, "C&I Loans (YoY %)", "BUSLOANS", freq="monthly", level_unit="$",
                  definition="Commercial and industrial loans at all US commercial banks (FRED: BUSLOANS, monthly).",
                  analysis="Business-lending demand and supply. Contraction reflects tightening standards and weaker business investment — a classic recession precursor."),
        yoy_level(7, "Commercial Real Estate Loans (YoY %)", "CREACBM027NBOG", freq="monthly", level_unit="$",
                  definition="Commercial real estate loans at all US commercial banks (FRED: CREACBM027NBOG, monthly).",
                  analysis="CRE concentration caused the 1990s bank failures Ziegel cites. Rapid growth builds the concentration risk he calls 'perhaps the single most significant issue in credit-risk management.'"),
        yoy_level(8, "Consumer Loans (YoY %)", "CCLACBW027SBOG", freq="weekly", level_unit="$",
                  definition="Consumer loans at all US commercial banks (FRED: CCLACBW027SBOG, weekly).",
                  analysis="Household credit demand — the model-driven, score-based lending Ziegel describes. Overextension here (as in subprime) is the 'one way out' failure mode when collateral values reverse."),
        yoy_level(9, "Bank Deposits (YoY %)", "DPSACBW027SBOG", freq="weekly", level_unit="$",
                  definition="Deposits at all US commercial banks (FRED: DPSACBW027SBOG, weekly).",
                  analysis="The bank's funding base. Ziegel: the dominant bank risk is confidence/liquidity — a falling deposit base (a run) is the fear-of-running-out-of-cash channel that felled Northern Rock and Bear Stearns."),
        # ── Asset quality: realised losses (the first way out failing) ───────
        level(10, "Delinquency Rate, All Bank Loans", "DRALACBN", unit="%", freq="quarterly",
              definition="Delinquency rate on all loans and leases at all US commercial banks (FRED: DRALACBN, quarterly).",
              analysis="The share of loans where the borrower's operating cash flow (Ziegel's first way out) has already faltered. Rising delinquencies lead charge-offs and mark the down-leg of the credit cycle."),
        level(11, "Net Charge-Off Rate, All Loans", "CORALACBN", unit="%", freq="quarterly",
              definition="Net charge-off rate on all loans and leases at all US commercial banks (FRED: CORALACBN, quarterly).",
              analysis="Realised credit losses — the empirical counterpart to loss-given-default. Reserves are meant to cover this expected loss; a spike beyond reserves eats into capital (the Basel distinction Ziegel stresses)."),
        level(12, "Delinquency Rate, C&I Loans", "DRBLACBS", unit="%", freq="quarterly",
              definition="Delinquency rate on business (C&I) loans at all US commercial banks (FRED: DRBLACBS, quarterly).",
              analysis="Corporate-credit stress specifically. Read alongside the high-yield spread — market-priced risk (spread) versus realised deterioration (delinquency)."),
        level(13, "Delinquency Rate, Single-Family Mortgages", "DRSFRMACBS", unit="%", freq="quarterly",
              definition="Delinquency rate on single-family residential mortgages at all US commercial banks (FRED: DRSFRMACBS, quarterly).",
              analysis="The epicentre of Ziegel's 2008 case study: 'one way out' lending on rising home values collapsed when the cycle turned. The clearest gauge of household collateral stress."),
        # ── Bank capital & liquidity (Basel: solvency and confidence) ────────
        level(14, "Bank Equity to Total Assets", "EQTA", unit="%", freq="quarterly",
              definition="Total equity capital as a percent of total assets for all US banks (FRED: EQTA, quarterly).",
              analysis="Ziegel: banks require high leverage (equity ~8% of assets) because asset productivity is tiny — but that thin cushion is only safe if assets are genuinely liquid and high quality. This is the raw capital-adequacy read."),
        level(15, "Net Interest Margin, US Banks", "USNIM", unit="%", freq="quarterly",
              definition="Net interest margin for all US banks (FRED: USNIM, quarterly).",
              analysis="The bank's core spread revenue: interest earned minus cost of funds, per dollar of earning assets. A compressing NIM squeezes the thin margin that must absorb loan losses and fund the equity return."),
        level(16, "Reserves of Depository Institutions ($B)", "TOTRESNS", unit="$B", freq="monthly",
              definition="Total reserves of depository institutions, billions of dollars (FRED: TOTRESNS, monthly).",
              analysis="System liquidity held at the Fed. Draining reserves tightens the plumbing that lets banks meet withdrawals — the liquidity dimension of Ziegel's confidence risk."),
        level(17, "Financial Stress Index (St. Louis Fed)", "STLFSI4", unit="index", freq="weekly",
              definition="St. Louis Fed Financial Stress Index, standard deviations from normal; zero = average conditions (FRED: STLFSI4, weekly).",
              analysis="A composite of 18 spread/volatility series. Above zero = above-average systemic stress — the market-wide 'suppliers of liquidity fear they will run out of cash' condition that turns solvency problems into failures."),
    ]


@app.get("/api/credit-banks")
# Matched to /api/economic: the sector lens loads the two together.
@limiter.limit("30/minute")
@cached(ttl_seconds=6 * 3600, key_prefix="econ")
def credit_banks(request: Request) -> dict[str, Any]:
    start = f"{MIN_YEAR - 1}-01-01"
    end = datetime.date.today().isoformat()
    recession_bands = fetch_recession_bands(start, end)

    metrics: list[dict[str, Any]] = []
    try:
        metrics.extend(_credit_bank_metrics(start, end))
    except Exception as e:  # noqa: BLE001
        log.warning("credit-bank metrics failed: %s", e)

    return {
        "section": "credit",
        "scopeKey": "global",
        "title": "Credit & Banking",
        "subtitle": f"Credit-cycle and banking-system health · FRED data back to {MIN_YEAR}, refreshed every 6 hours · {len(recession_bands)} NBER recession(s) shaded",
        "metrics": metrics,
        "recessionBands": recession_bands,
        "commodities": [],
        "treasuryYields": [],
        "fedModel": None,
        "sp500Valuation": None,
    }


# ── /api/sector-etf/{sector} ─────────────────────────────────────────────────
# Yahoo Finance price history for the sector's SPDR index fund (XLK, XLF, ...).
# Wrapped in a 15-minute TTL cache so the whole history (incl. the latest price)
# refreshes at most every 15 minutes — the "updated every 15 minutes" cadence
# without redundant yfinance calls in between.

@app.get("/api/sector-etf/{sector}")
@limiter.limit("30/minute")
@cached(ttl_seconds=15 * 60, key_prefix="etf")
def sector_etf_endpoint(request: Request, sector: str = PathParam(pattern=GROUP_PATTERN)) -> dict[str, Any]:
    if not MARKETDATA_OK:
        return {"ticker": None, "label": None, "history": [], "latest": None, "asOf": None}
    tkr = md_sector_etf.ticker_for_sector(sector)
    if not tkr:
        raise HTTPException(404, f"No sector ETF mapped for '{sector}'")
    _series_id, label = md_sector_etf.SECTOR_ETFS.get(tkr, (None, tkr))
    history = md_sector_etf.fetch_price_history(tkr)
    latest_date, latest_val = md_sector_etf.latest_price(tkr)
    if latest_val is not None:
        if history and history[-1][0] == latest_date:
            history[-1] = (latest_date, latest_val)
        else:
            history.append((latest_date, latest_val))
    elif history:
        latest_date, latest_val = history[-1]
    return {
        "ticker": tkr,
        "label": label,
        "history": [{"period": d, "value": v} for d, v in history],
        "latest": latest_val,
        "asOf": latest_date,
    }


# Ranking payloads live until the next daily update invalidates the "db" prefix.
_RANKING_TTL_SECONDS = 24 * 60 * 60
# Industries with at least this many primary filers get their default ranking
# pre-built in the background, because a cold build takes longer than the
# frontend's 30s fetch timeout (Biotechnology, 1,100+ filers, is the worst).
_RANKING_WARM_MIN_COMPANIES = 500


def _warm_large_rankings() -> None:
    """Pre-build /api/comparative/{industry}/ranking (default filters) for the
    largest industries, sequentially on a daemon thread. Runs after startup and
    after every daily update, since both leave those entries cold."""
    try:
        big = [e["name"] for e in list_industries()
               if int(e.get("companies") or 0) >= _RANKING_WARM_MIN_COMPANIES]
    except Exception as e:  # noqa: BLE001 - a warm failure must never block anything
        log.warning("ranking warm: industry list failed: %s", e)
        return
    for name in big:
        t0 = time.time()
        try:
            _ranking_for_industry(name, False, None)
            log.info("ranking warm: %s ready in %.1fs", name, time.time() - t0)
        except Exception as e:  # noqa: BLE001
            log.warning("ranking warm (%s) failed: %s", name, e)
    log.info("ranking warm: %d large industries ready", len(big))


def _start_daemon(fn: Callable[[], None], disable_env: str) -> None:
    """Run one warm-up on a daemon thread, unless its env flag switches it off.

    Three warms were three copies of this. The flag each one reads stays as it
    was: the ranking warm is gated by DISABLE_BENCHMARK_WARM rather than a flag
    of its own, so setting that one variable still switches off both.
    """
    if os.environ.get(disable_env) == "1":
        return
    threading.Thread(target=fn, daemon=True).start()


def _start_ranking_warm() -> None:
    _start_daemon(_warm_large_rankings, "DISABLE_BENCHMARK_WARM")


def _warm_benchmark_matrices() -> None:
    """Pre-build the sector and industry matrices that back
    ``/api/individual/{ticker}/benchmarks``.

    That endpoint is cheap once those two aggregates are cached and expensive on a
    cold process, because the first call builds both. The RAG verification layer
    calls it with a 6-second client timeout, so on a freshly restarted backend the
    first verification found no evidence and correctly declined to act. Warming
    here costs nothing a user waits on: it runs on a daemon thread after startup,
    mirroring how ``start_all.ps1`` warms ``/api/economic``.
    """
    try:
        _sector_current_metrics()
        log.info("benchmark warm: sector matrix ready")
    except Exception as e:  # noqa: BLE001 - a warm failure must never block startup
        log.warning("benchmark warm (sector) failed: %s", e)
        return
    # The industry lens is per-sector and there are only ~11 of them, so warming
    # each is bounded. Failures are logged and skipped: a cold industry column
    # degrades the benchmark payload, it does not break it.
    try:
        sectors = [s.get("name") for s in (list_sectors() or []) if s.get("name")]
    except Exception as e:  # noqa: BLE001
        log.warning("benchmark warm: sector list failed: %s", e)
        return
    for name in sectors:
        try:
            _industry_metrics_for_sector(name)
        except Exception as e:  # noqa: BLE001
            log.warning("benchmark warm (industry/%s) failed: %s", name, e)
    log.info("benchmark warm: %d industry matrices ready", len(sectors))
    # Same thread, after the matrices: the rankings are the slow tail and
    # must not compete with the matrices for the interpreter.
    _warm_large_rankings()


@app.on_event("startup")
def _start_benchmark_warm() -> None:
    _start_daemon(_warm_benchmark_matrices, "DISABLE_BENCHMARK_WARM")


def _warm_connections_cache() -> None:
    """Pre-fill the connections sector_cache for the two heaviest sectors.

    Technology (3700+ peers) and Financial Services (2100+ peers) dominate
    cold-start latency; warming their panel + sector preload in a daemon
    thread cuts the first user request from ~5 s to ~0.5 s.  Mirrors the
    existing benchmark-matrix warm pattern.
    """
    time.sleep(5)  # let the benchmark warm start first
    heavy = ["Technology", "Financial Services"]
    from connections.sector_cache import preload_sector, get_industry_panel  # noqa: PLC0415
    from industry_structure.ranks import build_cross_industry_medians  # noqa: PLC0415
    warmed_years: set[int] = set()
    for sector_name in heavy:
        try:
            with db_conn() as conn:
                # Find the largest industry in this sector to warm its panel
                rows = conn.execute(
                    'SELECT industry, COUNT(*) AS n FROM tickers'
                    f" WHERE sector = ? AND {named_group_sql('industry')}"
                    ' GROUP BY industry ORDER BY n DESC LIMIT 3',
                    (sector_name,),
                ).fetchall()
                for row in rows:
                    panel = get_industry_panel(conn, row["industry"])
                    if panel:
                        preload_sector(conn, sector_name)
                        warmed_years.add(panel.fiscal_year)
                        log.info("connections warm: %s (%s) ready", sector_name, row["industry"])
                        break
        except Exception as e:  # noqa: BLE001 - never block startup
            log.warning("connections warm (%s) failed: %s", sector_name, e)
    # The cross-industry median table is the other cold cost of the first
    # /structure: about 1.1 s, paid once per fiscal year in play. Its TTL is
    # 60 minutes against the route cache's 30, so the two never expire out
    # of phase and leave one request to rebuild it.
    for year in sorted(warmed_years):
        try:
            with db_conn() as conn:
                build_cross_industry_medians(conn, year)
            log.info("connections warm: cross-industry medians %d ready", year)
        except Exception as e:  # noqa: BLE001 - never block startup
            log.warning("connections warm (ranks %s) failed: %s", year, e)
    log.info("connections warm: heavy sectors done")


@app.on_event("startup")
def _start_connections_warm() -> None:
    _start_daemon(_warm_connections_cache, "DISABLE_CONNECTIONS_WARM")


@app.on_event("startup")
def _start_marketdata_scheduler() -> None:
    """Start the in-process marketdata refresh daemon (CAPE/ERP/EPU/GPR/market
    inputs). Sector ETF prices are served live via the 15-min-cached endpoint
    above, so they are intentionally not part of this scheduler."""
    if not MARKETDATA_OK:
        return
    try:
        from marketdata.refresh import start_scheduler  # noqa: PLC0415
        start_scheduler(invalidate_cache)
    except Exception as e:  # noqa: BLE001
        log.warning("marketdata scheduler start failed: %s", e)


# ── /api/industries + /api/sectors ───────────────────────────────────────────

@app.get("/api/industries")
@cached(ttl_seconds=30 * 60, key_prefix="db")
def list_industries() -> list[dict[str, Any]]:
    with db_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT industry AS name, sector, COUNT(*) AS companies
            FROM tickers WHERE {named_group_sql('industry')}
            GROUP BY industry, sector
            """
        ).fetchall()
    # An industry can appear under more than one sector in the source data, so
    # assign it to its dominant sector (the one with the most listed companies)
    # and report the total company count across sectors.
    agg: dict[str, dict[str, Any]] = {}
    for r in rows:
        name = r["name"]
        companies = int(r["companies"])
        entry = agg.setdefault(name, {"name": name, "companies": 0, "sector": None, "_best": -1})
        entry["companies"] += companies
        if r["sector"] is not None and companies > entry["_best"]:
            entry["_best"] = companies
            entry["sector"] = r["sector"]
    servable = _servable_industries()
    out = [
        {"name": e["name"], "companies": e["companies"], "sector": e["sector"]}
        for e in agg.values() if e["name"] in servable
    ]
    out.sort(key=lambda e: (-e["companies"], e["name"]))
    return out


def _servable_industries() -> set[str]:
    """Industries the /api/comparative/{industry} family can actually serve.

    The list endpoint used to advertise every distinct tickers.industry, and
    the frontend turned each one into a link. Sixteen of them 404'd on click:
    industries whose only members are secondary listings (security_map
    is_primary = 0, e.g. a Swiss name via its London line), industries with no
    financials in the analysis window, an empty-string industry, and one name
    containing '/' that can never match the path parameter. Mirror the peer-set
    predicate the comparative queries use (primary listing, a year in window,
    a USD-convertible market cap) so the menu and the endpoints agree.
    """
    with db_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT DISTINCT t.industry
            FROM financials f JOIN tickers t ON t.ticker = f.Ticker
            LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"
            LEFT JOIN security_map s ON s.symbol = f.Ticker
            WHERE {named_group_sql('t.industry')}
              AND t.industry NOT LIKE '%/%'
              AND COALESCE(s.is_primary, 1) = 1
              AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
              AND CAST(f."Calendar Year" AS INTEGER) >= ?
              AND {_FX_SPOT_MC_SQL} IS NOT NULL
            """,
            (MIN_YEAR,),
        ).fetchall()
    return {r["industry"] for r in rows}


@app.get("/api/sectors")
@cached(ttl_seconds=30 * 60, key_prefix="db")
def list_sectors() -> list[dict[str, Any]]:
    with db_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT sector AS name, COUNT(*) AS companies
            FROM tickers WHERE {named_group_sql('sector')}
            GROUP BY sector ORDER BY companies DESC, sector
            """
        ).fetchall()
    return [{"name": r["name"], "companies": int(r["companies"])} for r in rows]


# ── Industry / Sector aggregates ─────────────────────────────────────────────

# (number, display_name, unit, db_col, stored_as, clip_low, clip_high, definition, analysis)
_GROUP_METRIC_DISPLAY: list[tuple[int, str, str, str, str, float, float, str, str]] = [
    (
        1, "Revenue Growth", "%", "Revenue Growth", "decimal", -1.0, 5.0,
        "Mean year-over-year revenue growth across all listed companies in the group, market-cap weighted.",
        "Compare against broader US growth (~5-7%). Sustained outperformance is the strongest signal the group is structurally expanding.",
    ),
    (
        2, "Gross Profit Ratio", "%", "Gross Profit Ratio", "decimal", -1.0, 1.0,
        "Average gross margin (Revenue − COGS) / Revenue. Reveals structural pricing power and cost discipline.",
        "Rising gross margin paired with rising revenue is the single cleanest fingerprint of a moat. Falling margin signals commoditisation.",
    ),
    (
        3, "Operating Income Ratio", "%", "Operating Income Ratio", "decimal", -2.0, 1.0,
        "Operating income as a % of revenue. The cleanest measure of operating efficiency before financing and tax effects.",
        "Rising operating margin while gross margin is flat = SG&A leverage. Falling both = cost inflation outpacing pricing power.",
    ),
    (
        4, "Net Income Ratio", "%", "Net Income Ratio", "decimal", -2.0, 1.0,
        "Net profit margin — bottom-line earnings as a % of revenue.",
        "Cross-check against operating income ratio. Large gaps point to non-operating items, tax engineering, or aggressive financing effects.",
    ),
    (
        5, "ROE", "%", "ROE", "decimal", -3.0, 3.0,
        "Return on Equity — Net income / shareholders' equity, market-cap weighted.",
        "Sustained ROE > 15% is one of the strongest predictors of long-term returns. Beware ROE inflated by leverage — decompose with DuPont.",
    ),
    (
        6, "ROIC", "%", "ROIC", "decimal", -3.0, 3.0,
        "Return on Invested Capital — NOPAT / (Equity + Debt).",
        "ROIC > WACC = the business creates value when it grows. ROIC < WACC = growth destroys value.",
    ),
    (
        7, "Debt To Equity", "x", "Debt To Equity", "as-is", -10.0, 10.0,
        "Total Debt / Total Equity. The standard leverage ratio.",
        "Above ~1.5x raises concern when interest coverage falls below 4x. Capital-intensive industries sustain higher levels by design.",
    ),
    (
        8, "Current Ratio", "x", "Current Ratio", "as-is", 0.0, 20.0,
        "Current Assets / Current Liabilities. Short-term liquidity buffer.",
        "Below 1.0 = working-capital squeeze risk. Excessively high (>3) can flag idle capital — but is benign for cash-rich tech.",
    ),
]


# FX-normalised size weight shared by the by-year group aggregates. Requires the
# query to carry `LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"`.
# USD / NULL currency -> 1.0 per unit; a known currency -> its usd_per_unit; an
# unknown currency -> NULL (the row drops from both numerator and denominator).
# A row's market cap is as-of its OWN fiscal year end, so it must be converted at
# THAT year's exchange rate. Using the spot rate for every year understates a 2016
# JPY filer by ~28% and a KRW filer by ~19% while inflating EUR/GBP by ~8% — a
# systematic mis-weighting between currency blocs that grows the further back the
# chart goes.
#
# Exception: the company's most recent stored year carries a SPOT cap (
# `refresh_market_caps` overwrites it every week), so pairing it with a spot FX
# rate is the correct as-of match. `_FX_SPOT_FROM_YEAR` is that boundary.
#
# Any query using _FX_WEIGHT_SQL MUST carry BOTH joins in _FX_JOIN_SQL.
_FX_SPOT_FROM_YEAR = MAX_YEAR - 1

_FX_JOIN_SQL = (
    ' LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"'
    " LEFT JOIN fx_rates_hist xh ON xh.currency = f.\"Reported Currency\""
    ' AND xh.year = CAST(f."Calendar Year" AS INTEGER)'
)

_FX_WEIGHT_SQL = (
    'f."Market Cap" * COALESCE('
    # historical years -> that year's rate
    f'CASE WHEN CAST(f."Calendar Year" AS INTEGER) < {_FX_SPOT_FROM_YEAR} '
    'THEN xh.usd_per_unit END, '
    # latest year (spot cap) / no historical rate -> spot
    'x.usd_per_unit, '
    # USD or unknown currency -> 1.0; anything else -> NULL (row drops out)
    "CASE WHEN f.\"Reported Currency\" = 'USD' "
    "OR f.\"Reported Currency\" IS NULL THEN 1.0 ELSE NULL END)"
)

# Spot-only sibling of _FX_WEIGHT_SQL for the peer-ranking queries, which size
# companies by their LATEST-year (spot) cap. Same currency contract: known
# currency -> spot rate; USD or NULL currency -> 1.0; unknown currency -> NULL
# (row drops out). ~1,865 tickers, mostly US OTC filers, carry a NULL Reported
# Currency; a bare `* x.usd_per_unit` turned every one of them into a NULL cap,
# and 48 industries made entirely of such filers 404'd on /api/comparative.
# Requires `LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"`.
_FX_SPOT_MC_SQL = (
    'f."Market Cap" * COALESCE(x.usd_per_unit, '
    "CASE WHEN f.\"Reported Currency\" = 'USD' "
    "OR f.\"Reported Currency\" IS NULL THEN 1.0 ELSE NULL END)"
)


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _by_year_with_groups(group_col: str) -> dict[int, dict[str, dict[str, Any]]]:
    """Market-cap weighted aggregates per (group, year), with SQL-level
    winsorisation. Cached for 30 minutes; invalidated by daily-update."""
    # FX-normalised size weight: convert each filer's Market Cap to USD before
    # weighting so a ¥/₩ cap is not summed against a $ cap at face value. USD and
    # NULL-currency rows weight at 1.0/unit; known currencies convert via the
    # fx_rates LEFT JOIN (alias `x`); an UNKNOWN currency has no rate, so the
    # COALESCE resolves to NULL, the whole weight is NULL, and that row drops from
    # both numerator and denominator (better than pretending a 1:1 rate). Metric
    # VALUES stay untouched — ratios are currency-neutral and never FX-converted.
    weight = _FX_WEIGHT_SQL
    select_parts: list[str] = []
    for tpl in _GROUP_METRIC_DISPLAY:
        col, clip_low, clip_high = tpl[3], tpl[5], tpl[6]
        clamped = f'MAX(MIN(f."{col}", {clip_high}), {clip_low})'
        select_parts.append(
            f'SUM(({clamped}) * ({weight})) / '
            f'NULLIF(SUM(({clamped}) * 0 + ({weight})), 0) AS "{col}"'
        )

    sql = f"""
        SELECT
            t.{group_col} AS grp,
            CAST(f."Calendar Year" AS INTEGER) AS yr,
            COUNT(DISTINCT f.Ticker) AS ticker_count,
            {", ".join(select_parts)}
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        LEFT JOIN security_map s ON s.symbol = f.Ticker{_FX_JOIN_SQL}
        WHERE t.{group_col} IS NOT NULL
          AND COALESCE(s.is_primary, 1) = 1
          AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
          AND CAST(f."Calendar Year" AS INTEGER) >= ?
          AND CAST(f."Calendar Year" AS INTEGER) <= ?
          -- Weight sanity: a negative cap flips the weighted mean's sign and a
          -- corrupt cap (one Wisesheets row carried 3.2e17) dominates a whole
          -- group-year. Bound the weight to (0, $100T-equivalent).
          AND f."Market Cap" > 0
          AND {_FX_WEIGHT_SQL} < {MAX_MARKET_CAP_USD}
        GROUP BY t.{group_col}, yr
        ORDER BY yr, t.{group_col}
    """
    metric_cols = [m[3] for m in _GROUP_METRIC_DISPLAY]
    out: dict[int, dict[str, dict[str, Any]]] = {}
    with db_conn() as conn:
        for row in conn.execute(sql, (MIN_YEAR, _max_year())).fetchall():
            yr = int(row["yr"])
            grp = row["grp"]
            entry: dict[str, Any] = {"_ticker_count": int(row["ticker_count"])}
            for col in metric_cols:
                v = row[col]
                entry[col] = float(v) if v is not None else None
            out.setdefault(yr, {})[grp] = entry
    return out


# ── Industry life-cycle stage (Porter, Competitive Strategy Ch.8) ─────────────
# Where an industry sits in its life decides what "good" looks like: an emerging
# industry should be reinvesting and can carry thin margins, a mature one should
# be returning cash, a declining one is judged on how it harvests. Classified
# from the same market-cap-weighted aggregates the industry page already shows.

_LIFECYCLE_MIN_YEARS = 3


def _lifecycle_from_series(
    growth: list[tuple[int, float]],
    margins: list[tuple[int, float]],
) -> dict[str, Any]:
    """Group life-cycle stage. The classifier itself lives in `individualanalysis`
    (so the single-company forecast can reuse it without a circular import); this
    wrapper adds the group-level reading and the survivorship caveat."""
    core = lifecycle_from_series(growth, margins)
    if not core.get("applicable"):
        return {"applicable": False,
                "reason": f"Fewer than {_LIFECYCLE_MIN_YEARS} usable years of industry history."}

    stage = core["stage"]
    cyclical = core["cyclicalSwings"]

    labels = {
        "emerging": "Emerging: demand is compounding fast and the winners are still being decided.",
        "growth": "Growth: expansion is strong and reinvestment still earns its keep.",
        "mature": "Mature: growth has settled near the economy's pace, so cash returns and share matter most.",
        "declining": "Declining: the industry is shrinking, so harvesting cash beats chasing growth.",
    }
    return {
        **core,
        "reading": labels[stage],
        "note": (
            ("Recent growth swings across a very wide range, so this reading may be "
             "tracking a price or demand cycle rather than the industry's age. Treat "
             "the stage with caution. " if cyclical else "")
            + "Classified from market-cap-weighted industry aggregates. These in-house "
              "averages include only companies that survived to today, which flatters "
              "the history a little."
        ),
    }


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _industry_growth_norms(ticker: str) -> dict[str, Any]:
    """Industry norms a single company's forecast leans on when its own numbers
    carry no signal (Damodaran Ch.11, Figure 11.6): the sales-to-capital ratio a
    young or loss-making firm should reinvest against, and the industry's revenue
    growth as a stand-in when the company has too little history of its own.
    Returns {} on any failure so the forecast simply falls back to its old
    behavior."""
    try:
        with db_conn() as conn:
            row = conn.execute(
                "SELECT sector, industry FROM tickers WHERE UPPER(ticker) = ?",
                (ticker.upper(),),
            ).fetchone()
        if not row or not row["sector"] or not row["industry"]:
            return {}
        matrix = _industry_metrics_for_sector(row["sector"])
        col = (matrix.get("data") or {}).get(row["industry"])
        if not col:
            return {}
        rev_g = col.get("revenueGrowth")       # matrix carries this as a percent
        op_margin = col.get("operatingMargin")  # ditto
        out: dict[str, Any] = {}
        if isinstance(rev_g, (int, float)):
            out["revenueGrowth"] = float(rev_g) / 100.0   # back to a decimal
        # The margin a loss-making company is expected to converge on. Its own
        # history is negative and would project losses forever, so the industry's
        # margin is the honest anchor (Damodaran, young-company valuation).
        if isinstance(op_margin, (int, float)) and op_margin > 0:
            out["operatingMargin"] = float(op_margin) / 100.0
        # Sales-to-capital is computed here rather than taken from the matrix
        # column, because the matrix's invested capital does NOT subtract cash.
        # Damodaran's ratio does, and the difference is the whole ballgame for a
        # cash-rich young company (see individualanalysis.sales_to_capital).
        s2c = _industry_sales_to_capital(row["industry"])
        if s2c:
            out["salesToInvestedCapital"] = s2c
        # The stable-phase return anchor (Ch.12): terminal ROIC moves toward the
        # industry median instead of persisting at the firm's own peak level.
        ind_roic = _industry_roic(row["industry"])
        if ind_roic:
            out["roic"] = ind_roic
        return out
    except Exception as exc:  # noqa: BLE001 — norms are a nicety, never a blocker
        log.warning("[api] industry growth norms for %s failed: %s", ticker, exc)
        return {}


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _industry_sales_to_capital(industry: str) -> Optional[float]:
    """Median cash-adjusted sales-to-capital across an industry's latest filings.

    The median, not the mean, because one company with a sliver of invested
    capital would otherwise drag the whole industry norm."""
    try:
        with db_conn() as conn:
            rows = conn.execute(
                """
                SELECT f."Revenue" AS rev,
                       f."Total Stockholders Equity" AS eq,
                       f."Total Debt" AS td,
                       f."Cash And Cash Equivalents" AS cash
                FROM financials f
                JOIN tickers t ON t.ticker = f.Ticker
                JOIN (SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) AS y
                      FROM financials
                      WHERE "Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
                      GROUP BY Ticker) last
                  ON last.Ticker = f.Ticker
                 AND CAST(f."Calendar Year" AS INTEGER) = last.y
                WHERE t.industry = ? AND f."Revenue" > 0 AND f."Market Cap" > 0
                """,
                (industry,),
            ).fetchall()
        vals: list[float] = []
        for r in rows:
            eq, td, cash, rev = r["eq"], r["td"] or 0.0, r["cash"] or 0.0, r["rev"]
            if eq is None or rev is None:
                continue
            capital = eq + td - cash
            if capital <= 0:
                continue
            s = rev / capital
            if 0.2 <= s <= 20.0:      # same sanity band the company-level ratio uses
                vals.append(s)
        if len(vals) < 3:
            return None
        vals.sort()
        mid = len(vals) // 2
        med = vals[mid] if len(vals) % 2 else (vals[mid - 1] + vals[mid]) / 2.0
        return round(med, 4)
    except Exception as exc:  # noqa: BLE001
        log.warning("[api] industry sales-to-capital for %s failed: %s", industry, exc)
        return None


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _industry_roic(industry: str) -> Optional[float]:
    """Median after-tax return on invested capital across an industry's latest
    filings. The stable-phase anchor Damodaran prescribes (Ch.12): a company's
    terminal return moves TOWARD the industry average rather than persisting at
    its own high-growth level forever.

    Deliberately uses the same book base as the engine's ROIC (equity + debt,
    NO cash subtraction — individualanalysis._invested_capital), so anchoring a
    terminal return to it never mixes two capital definitions."""
    try:
        with db_conn() as conn:
            rows = conn.execute(
                """
                SELECT f."Operating Income" AS op,
                       f."Total Stockholders Equity" AS eq,
                       f."Total Debt" AS td
                FROM financials f
                JOIN tickers t ON t.ticker = f.Ticker
                JOIN (SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) AS y
                      FROM financials
                      WHERE "Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
                      GROUP BY Ticker) last
                  ON last.Ticker = f.Ticker
                 AND CAST(f."Calendar Year" AS INTEGER) = last.y
                WHERE t.industry = ? AND f."Revenue" > 0 AND f."Market Cap" > 0
                """,
                (industry,),
            ).fetchall()
        vals: list[float] = []
        for r in rows:
            op, eq, td = r["op"], r["eq"], r["td"] or 0.0
            if op is None or eq is None or op <= 0:
                continue
            capital = eq + td
            if capital <= 0:
                continue
            roic = (op * (1.0 - MARGINAL_TAX_RATE)) / capital
            if 0.0 < roic <= 0.60:     # a 60%+ industry median is a data artefact
                vals.append(roic)
        if len(vals) < 3:
            return None
        vals.sort()
        mid = len(vals) // 2
        med = vals[mid] if len(vals) % 2 else (vals[mid - 1] + vals[mid]) / 2.0
        return round(med, 4)
    except Exception as exc:  # noqa: BLE001
        log.warning("[api] industry ROIC for %s failed: %s", industry, exc)
        return None


def _lifecycle_stage(group_col: str, group_name: str) -> Optional[dict[str, Any]]:
    """Life-cycle stage for one industry/sector from the cached by-year aggregates."""
    try:
        by_year = _by_year_with_groups(group_col)
    except Exception as exc:  # noqa: BLE001
        log.warning("lifecycle: aggregates unavailable for %s: %s", group_name, exc)
        return None
    growth: list[tuple[int, float]] = []
    margins: list[tuple[int, float]] = []
    for yr in sorted(by_year.keys()):
        grp = by_year[yr].get(group_name)
        if not grp or grp.get("_ticker_count", 0) < MIN_TICKERS_PER_GROUP_YEAR:
            continue
        g = grp.get("Revenue Growth")
        m = grp.get("Operating Income Ratio")
        if g is not None:
            growth.append((yr, float(g)))
        if m is not None:
            margins.append((yr, float(m)))
    return _lifecycle_from_series(growth, margins)


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _group_valuation(group_col: str) -> dict[str, dict[str, Any]]:
    """For each group (industry or sector), return CAPE + DCF + Value Score.
    Uses industry_averages.compute_cape / compute_dcf / score_and_rank.
    Cached because these are mildly expensive."""
    if not ANALYSIS_MODULES_OK:
        return {}
    try:
        db = get_db()
        cape = compute_cape(db, group_col)
        try:
            _macro = get_live_wacc_params()
            _rf, _erp = _macro.get("rf"), _macro.get("erp")
        except Exception:  # noqa: BLE001 — the group DCF falls back to module constants
            _rf = _erp = None
        dcf = compute_dcf(db, group_col, rf=_rf, erp=_erp)

        # Latest-year averages for value scoring
        if group_col == "industry":
            by_year = compute_industry_averages_by_year(db)
        else:
            by_year = compute_sector_averages_by_year(db)
        years = sorted(by_year.keys())
        latest_year = years[-1] if years else None

        # Score per group using the latest year's data
        scores: dict[str, float] = {}
        if latest_year is not None:
            scores = score_and_rank(by_year[latest_year], cape)

        # Combine
        all_groups: set[str] = set(cape.keys()) | set(dcf.keys()) | set(scores.keys())
        out: dict[str, dict[str, Any]] = {}
        for g in all_groups:
            d_entry = dcf.get(g) or {}
            out[g] = {
                "cape": cape.get(g),
                "dcfIntrinsic": d_entry.get("dcf_intrinsic"),
                "marginOfSafety": d_entry.get("margin_of_safety"),
                "fcfGrowthUsed": d_entry.get("avg_fcf_growth"),
                "valueScore": scores.get(g),
            }
        return out
    except Exception as exc:  # noqa: BLE001
        log.warning("[api] _group_valuation(%s) failed: %s", group_col, exc)
        return {}


# Stored/derived by-year columns the integrity questions read (decimal units).
# The derived names (Tax Burden, ROA, Financial Leverage) are always computed
# by industry_averages regardless of this list.
_INTEGRITY_COLS = [
    "Total Other Income Expenses Net", "Income Before Tax", "Income Quality",
    "Operating Income Ratio", "Operating Income", "Gross Profit Ratio",
    "Goodwill", "Net Income Growth", "Deferred Revenue", "Revenue Growth",
    "Receivables Growth", "ROE", "ROIC", "Net Income",
]


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _integrity_inputs(group_col: str) -> dict[str, dict[int, dict[str, Any]]]:
    """{group: {year: by-year aggregate row}} feeding the scorecard integrity
    questions (group_scoring.build_group_integrity). DECIMAL units, from the
    industry_averages by-year aggregation — a different methodology than the
    scorecard matrix, so this feeds the integrity time-series ONLY and never
    the displayed cells or their click-through history."""
    if not (ANALYSIS_MODULES_OK and GROUP_SCORING_OK):
        return {}
    try:
        db = get_db()
        fn = (compute_sector_averages_by_year if group_col == "sector"
              else compute_industry_averages_by_year)
        by_year = fn(db, metrics=_INTEGRITY_COLS, min_tickers=MIN_TICKERS_PER_GROUP_YEAR)
        out: dict[str, dict[int, dict[str, Any]]] = {}
        for yr, groups in by_year.items():
            for g, row in groups.items():
                out.setdefault(g, {})[int(yr)] = row
        return out
    except Exception as exc:  # noqa: BLE001
        log.warning("[api] _integrity_inputs(%s) failed: %s", group_col, exc)
        return {}


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _group_excess_return(group_col: str) -> dict[str, dict[str, Any]]:
    """Equity-side value creation per industry/sector (Damodaran, Ch.21).

    Computed PER COMPANY (each firm's own beta → CAPM cost of equity) then
    market-cap-weighted across the group — the same robust methodology as the
    sector-metrics panel, not the noisy all-history stored-column averages. For
    financials, ROIC/WACC are undefined (debt is raw material), so value creation
    is tested as ROE − cost of EQUITY. Raw ROE is reported but is NOT a verdict on
    its own; it is inflated by leverage. Returns per-group yearly trends for the
    excess return, ROE and Ke, plus the latest-year justified-vs-actual P/B and a
    bank-like flag."""
    import math
    cols = ["Revenue", "Net Income", "Total Assets", "Total Stockholders Equity",
            "Total Debt", "Market Cap", "Payout Ratio",
            "Interest Income", "Interest Expense"]
    sel = ", ".join(f'f."{c}"' for c in cols)
    sql = (
        f"SELECT f.Ticker, t.{group_col} AS grp, t.sector AS csec, {_cb_beta('t')}, "
        'CAST(f."Calendar Year" AS INTEGER) AS yr, ' + sel +
        " FROM financials f JOIN tickers t ON t.ticker = f.Ticker" + _cb_join() +
        f" WHERE {named_group_sql(f't.{group_col}')}"
        " AND f.\"Reported Currency\" = 'USD'"
        " AND f.\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"
        " AND CAST(f.\"Calendar Year\" AS INTEGER) >= ? AND f.\"Market Cap\" >= ?"
    )
    window_start = MAX_YEAR - 5
    try:
        with db_conn() as conn:
            rows = conn.execute(sql, (window_start, _SECTOR_MC_FLOOR)).fetchall()
    except Exception as exc:  # noqa: BLE001
        log.warning("[api] _group_excess_return(%s) query failed: %s", group_col, exc)
        return {}

    # (group, year) → market-cap-weighted accumulators; latest year tracked per group.
    acc: dict[tuple[str, int], dict[str, float]] = {}
    latest_yr: dict[str, int] = {}
    for r in rows:
        if not _sector_row_plausible(r):
            continue
        grp = r["grp"]; yr = int(r["yr"])
        ni = _sf(r, "Net Income"); eq = _sf(r, "Total Stockholders Equity")
        assets = _sf(r, "Total Assets"); mc = _sf(r, "Market Cap")
        if eq is None or eq <= 0 or mc is None or mc <= 0:
            continue
        beta = r["beta"]
        ke = _sector_capm(float(beta) if beta is not None else None)
        roe = ni / eq if ni is not None else None
        if roe is None or not math.isfinite(roe):
            continue
        roe = max(-1.0, min(1.0, roe))            # winsorise ±100%
        excess = roe - ke
        pb = max(0.0, min(20.0, mc / eq))
        lev = (assets / eq) if (assets is not None and assets > 0) else None
        payout = _sf(r, "Payout Ratio")
        payout = max(0.0, min(1.0, payout)) if payout is not None else None
        retention = (1.0 - payout) if payout is not None else 1.0
        g_eq = min(_live_rf(), max(0.0, retention * roe))
        just_pb = ((roe - g_eq) / (ke - g_eq)) if (ke > g_eq and roe > 0) else None

        # Net interest margin — spread-based lenders only (interest income ≥ 20%
        # of revenue), NII ÷ total assets, so the group average is not diluted.
        ii = _sf(r, "Interest Income"); ie = _sf(r, "Interest Expense")
        rev = _sf(r, "Revenue")
        nim = None
        if (r["csec"] == "Financial Services"
                and ii is not None and ii > 0 and ie is not None and ie > 0 and rev and rev > 0
                and assets is not None and assets > 0
                and (ii / rev) >= _NIM_MATERIALITY and (ie / ii) >= _NIM_FUNDING_MIN
                and (assets / eq) >= _NIM_LEVERAGE_MIN):
            nii = ii - ie
            if nii > 0:
                nim = max(-5.0, min(15.0, 100.0 * nii / assets))

        a = acc.setdefault((grp, yr), {
            "wRoe": 0.0, "wKe": 0.0, "wExcess": 0.0, "wPb": 0.0, "wJustPb": 0.0,
            "wLev": 0.0, "wNim": 0.0, "mc": 0.0, "mcJust": 0.0, "mcLev": 0.0,
            "mcNim": 0.0, "n": 0.0,
        })
        a["wRoe"] += roe * mc; a["wKe"] += ke * mc; a["wExcess"] += excess * mc
        a["wPb"] += pb * mc; a["mc"] += mc; a["n"] += 1
        if just_pb is not None and math.isfinite(just_pb):
            a["wJustPb"] += max(0.0, min(20.0, just_pb)) * mc; a["mcJust"] += mc
        if lev is not None and math.isfinite(lev):
            a["wLev"] += lev * mc; a["mcLev"] += mc
        if nim is not None:
            a["wNim"] += nim * mc; a["mcNim"] += mc
        latest_yr[grp] = max(latest_yr.get(grp, yr), yr)

    out: dict[str, dict[str, Any]] = {}
    groups = {g for (g, _y) in acc.keys()}
    for grp in groups:
        years = sorted(y for (g, y) in acc.keys() if g == grp)
        roe_tr: list[tuple[str, float]] = []
        ke_tr: list[tuple[str, float]] = []
        ex_tr: list[tuple[str, float]] = []
        nim_tr: list[tuple[str, float]] = []
        for y in years:
            a = acc[(grp, y)]
            if a["mc"] <= 0:
                continue
            roe_tr.append((str(y), round(100.0 * a["wRoe"] / a["mc"], 2)))
            ke_tr.append((str(y), round(100.0 * a["wKe"] / a["mc"], 2)))
            ex_tr.append((str(y), round(100.0 * a["wExcess"] / a["mc"], 2)))
            if a.get("mcNim", 0) > 0:
                nim_tr.append((str(y), round(a["wNim"] / a["mcNim"], 2)))
        ly = latest_yr.get(grp)
        a_last = acc.get((grp, ly), {})
        just_pb = (a_last["wJustPb"] / a_last["mcJust"]) if a_last.get("mcJust", 0) > 0 else None
        act_pb = (a_last["wPb"] / a_last["mc"]) if a_last.get("mc", 0) > 0 else None
        lev = (a_last["wLev"] / a_last["mcLev"]) if a_last.get("mcLev", 0) > 0 else None
        is_bank = lev is not None and BANK_LEVERAGE_THRESHOLD_API < lev <= 500.0
        out[grp] = {
            "roeTrend": roe_tr,
            "keTrend": ke_tr,
            "excessTrend": ex_tr,
            "nimTrend": nim_tr,
            "justifiedPB": round(just_pb, 2) if just_pb is not None else None,
            "actualPB": round(act_pb, 2) if act_pb is not None else None,
            "leverage": round(lev, 1) if lev is not None else None,
            "isBankLike": is_bank,
            "companies": int(a_last.get("n", 0)),
        }
    return out


# Assets/Equity above this flags a group as bank-like (mirrors industry_averages).
BANK_LEVERAGE_THRESHOLD_API = 8.0


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _group_derived_metrics(group_col: str, group_name: str) -> list[dict[str, Any]]:
    """Compute the 17 derived industry/sector metrics + selected stored EXCEL_COLUMNS
    metrics as time series. Returns metric dicts (frontend Metric shape)."""
    if not ANALYSIS_MODULES_OK:
        return []

    db = get_db()
    if group_col == "industry":
        by_year = compute_industry_averages_by_year(db)
    else:
        by_year = compute_sector_averages_by_year(db)

    # Filter to years where this group has data + reporting quality survives
    valid_years: list[int] = []
    prev_count: int | None = None
    for yr in sorted(by_year.keys()):
        grp_data = by_year[yr].get(group_name)
        if not grp_data:
            continue
        n = grp_data.get("_ticker_count", 0)
        if n < MIN_TICKERS_PER_GROUP_YEAR:
            continue
        if prev_count is not None and n < int(prev_count * 0.6):
            continue
        valid_years.append(yr)
        prev_count = n

    if not valid_years:
        return []

    # Select an interesting subset of derived + stored metrics worth surfacing
    # in the UI (full set is huge — 194+17 metrics)
    extra_metrics: list[tuple[int, str, str, str, str, float, float, str, str]] = [
        # number, name, unit, db_col, stored_as, clip_low, clip_high, definition, analysis
        (10, "Asset Turnover", "x", "Asset Turnover", "as-is", 0.0, 5.0,
         "Revenue / Total Assets. How efficiently the group converts assets into sales.",
         "Above 1.0 = capital-light businesses (software, services). Below 0.3 = capital-intensive (banks, utilities)."),
        (11, "ROA", "%", "ROA", "decimal", -1.0, 1.0,
         "Net Income / Total Assets. Asset profitability stripped of leverage effects.",
         "Sustained ROA > 7% is exceptional. Compare with ROE to spot leverage-driven returns."),
        (12, "R&D Intensity", "%", "R&D Intensity", "decimal", 0.0, 1.0,
         "R&D Expenses / Revenue. Innovation intensity proxy.",
         "Tech, pharma, biotech routinely >15%. Mature industries <2%. Rising R&D often precedes margin pressure."),
        (13, "Capital Intensity Ratio", "%", "Capital Intensity Ratio", "decimal", 0.0, 1.0,
         "PP&E / Total Assets. How much of the balance sheet is tied up in hard assets.",
         "Above 30% = capital-intensive (utilities, telco, energy). Below 10% = capital-light (software)."),
        (14, "Cash Conversion Cycle", "", "Cash Conversion Cycle", "as-is", -200.0, 365.0,
         "Days Sales Outstanding + Days Inventory − Days Payable. How long capital is tied up before becoming cash.",
         "Lower is better. Negative CCC (Apple, Costco) = supplier-financed growth."),
        (15, "Quick Ratio", "x", "Quick Ratio", "as-is", 0.0, 20.0,
         "(Current Assets − Inventory) / Current Liabilities. Liquidity stripped of inventory.",
         "Above 1.0 = comfortable. Below 0.5 = working-capital stress risk."),
        (16, "Financial Leverage (Assets/Equity)", "x", "Financial Leverage", "as-is", 0.0, 50.0,
         "Total Assets / Equity. Capital structure proxy. Banks structurally run 8-15x.",
         "Above 8x for non-bank companies is a flag. Decompose ROE: high financial leverage inflates ROE."),
        (17, "FCF to Revenue", "%", "FCF To Revenue", "decimal", -1.0, 1.0,
         "Free Cash Flow / Revenue. How much of every dollar of sales converts to cash for owners.",
         "Sustained >20% = exceptional. Below 5% = working capital or capex headwinds."),
        # 5-factor DuPont levers (the two not already shown as Operating Income Ratio,
        # Asset Turnover, Financial Leverage and Net Income Ratio above).
        (18, "DuPont · Tax Burden", "x", "Tax Burden", "as-is", -2.0, 2.0,
         "Net Income / Pre-tax Income (EBT), market-cap weighted. The tax-retention lever of the 5-factor DuPont.",
         "Higher = more pre-tax profit kept after tax. Full DuPont: ROE = Tax Burden × Interest Burden × EBIT Margin (Operating Income Ratio) × Asset Turnover × Financial Leverage."),
        (19, "DuPont · Interest Burden", "x", "Interest Burden", "as-is", -2.0, 2.0,
         "Pre-tax Income (EBT) / Operating Income (EBIT), market-cap weighted. The interest-burden lever of the 5-factor DuPont.",
         "Near 1.0 = little interest/non-operating drag; well below 1.0 = heavy interest expense eroding operating profit."),
    ]

    metrics_out: list[dict[str, Any]] = []
    for number, name, unit, db_col, stored_as, _lo, _hi, definition, analysis in extra_metrics:
        scale = 100.0 if (stored_as == "decimal" and unit == "%") else 1.0
        trend: list[tuple[str, float]] = []
        for yr in valid_years:
            grp_data = by_year[yr].get(group_name)
            if not grp_data:
                continue
            v = grp_data.get(db_col)
            if v is None:
                continue
            trend.append((str(yr), float(v) * scale))
        if len(trend) < 2:
            continue
        metrics_out.append(metric(
            number=number, name=name, unit=unit, trend=trend,
            definition=definition, analysis=analysis, vertical=[],
            frequency="annual", display_type="bar",
            is_rate_of_change=False,
        ))
    return metrics_out


def _group_section(
    group_col: str,
    group_name: str,
    section_key: str,
    title_suffix: str,
) -> dict[str, Any]:
    by_year = _by_year_with_groups(group_col)
    if not any(group_name in groups for groups in by_year.values()):
        raise HTTPException(404, f"No data for {group_col}={group_name}")

    # Drop partially-reported years (latest year often missing tickers)
    valid_years: list[int] = []
    prev_count: int | None = None
    for yr in sorted(by_year.keys()):
        grp_data = by_year[yr].get(group_name)
        if not grp_data:
            continue
        n = grp_data.get("_ticker_count", 0)
        if n < MIN_TICKERS_PER_GROUP_YEAR:
            continue
        if prev_count is not None and n < int(prev_count * 0.6):
            continue
        valid_years.append(yr)
        prev_count = n

    if not valid_years:
        raise HTTPException(404, f"No data for {group_col}={group_name}")

    last_yr = valid_years[-1]
    ticker_count = by_year[last_yr][group_name]["_ticker_count"]

    metrics: list[dict[str, Any]] = []
    for number, name, unit, db_col, stored_as, _lo, _hi, definition, analysis in _GROUP_METRIC_DISPLAY:
        scale = 100.0 if (stored_as == "decimal" and unit == "%") else 1.0
        trend: list[tuple[str, float]] = []
        for yr in valid_years:
            grp_data = by_year[yr].get(group_name)
            if not grp_data:
                continue
            v = grp_data.get(db_col)
            if v is None:
                continue
            trend.append((str(yr), float(v) * scale))

        # Vertical: latest year + cross-group context
        vertical: list[dict[str, Any]] = []
        is_growth_metric = name == "Revenue Growth"
        if trend:
            latest_v = trend[-1][1]
            other_groups: list[float] = []
            for grp, data in by_year[last_yr].items():
                if grp == group_name:
                    continue
                v = data.get(db_col)
                if v is None:
                    continue
                other_groups.append(float(v) * scale)
            if other_groups:
                peer_avg = sum(other_groups) / len(other_groups)
                rank = 1 + sum(1 for o in other_groups if o > latest_v)
                vertical.append({
                    "label": "vs peer avg",
                    "value": round(latest_v - peer_avg, 2),
                    "unit": unit if unit in {"%", "x"} else "",
                })
                vertical.append({
                    "label": f"Rank among {len(other_groups) + 1} peers",
                    "value": rank,
                    "unit": "",
                })
            vertical.append({
                "label": f"{ticker_count} companies in group",
                "value": ticker_count,
                "unit": "",
            })

        metrics.append(metric(
            number=number, name=name, unit=unit, trend=trend,
            definition=definition, analysis=analysis, vertical=vertical,
            frequency="annual", display_type="bar",
            is_rate_of_change=is_growth_metric,
        ))

    # NEW: CAPE + DCF + Value Score from industry_averages.py
    valuation_map = _group_valuation(group_col)
    valuation = valuation_map.get(group_name, {})

    # NEW: 17 additional derived metrics (Asset Turnover, R&D Intensity, etc.)
    extra_metrics = _group_derived_metrics(group_col, group_name)
    all_metrics = metrics + extra_metrics

    # NEW: equity-side value creation (Damodaran, Ch.21) — ROE − cost of equity,
    # the right test where ROIC/WACC are undefined (financials). Robust per-company
    # computation, market-cap-weighted. Raw ROE is shown but flagged as not a verdict.
    excess_map = _group_excess_return(group_col)
    er = excess_map.get(group_name)
    if er:
        base = len(all_metrics) + 1

        def _last(trend: list[tuple[str, float]]) -> float | None:
            return trend[-1][1] if trend else None

        # Peer context for the excess-return spread (latest year, cross-group).
        my_excess = _last(er.get("excessTrend", []))
        peers = [
            _last(v.get("excessTrend", []))
            for g, v in excess_map.items() if g != group_name
        ]
        peers = [p for p in peers if p is not None]
        ex_vertical: list[dict[str, Any]] = []
        if my_excess is not None and peers:
            peer_avg = sum(peers) / len(peers)
            rank = 1 + sum(1 for p in peers if p > my_excess)
            ex_vertical.append({"label": "vs peer avg", "value": round(my_excess - peer_avg, 2), "unit": "%"})
            ex_vertical.append({"label": f"Rank among {len(peers) + 1} groups", "value": rank, "unit": ""})
        bank_note = (" This group is bank-like (Assets/Equity "
                     f"≈ {er.get('leverage')}x), so this equity test — not ROIC/WACC — is the correct lens."
                     ) if er.get("isBankLike") else ""

        er_tiles = [
            metric(
                number=base, name="Excess Return (ROE − Ke)", unit="%",
                trend=er.get("excessTrend", []), vertical=ex_vertical,
                definition=("Market-cap-weighted average of each company's ROE minus its own CAPM cost "
                            "of equity (Damodaran, Investment Valuation, Ch.21). The direct equity "
                            "value-creation test: positive = shareholder value created (price-to-book "
                            "should exceed 1); negative = value destroyed. The equity-only twin of "
                            "ROIC − WACC, and the correct test for financials where debt is operating "
                            "raw material rather than a financing choice."),
                analysis=("Positive and widening is the signal that the group earns above its equity "
                          "hurdle." + bank_note),
            ),
            metric(
                number=base + 1, name="Cost of Equity (Ke)", unit="%",
                trend=er.get("keTrend", []),
                definition=("Market-cap-weighted CAPM cost of equity (the live 10-year Treasury yield plus beta times the live implied equity risk premium) across the "
                            "group. The hurdle ROE must clear to create value — the right benchmark for "
                            "banks and insurers, where a firm-level WACC cannot be defined."),
                analysis="The bar above (excess return) is ROE measured against this hurdle.",
            ),
            metric(
                number=base + 2, name="Return on Equity (ROE)", unit="%",
                trend=er.get("roeTrend", []),
                definition=("Market-cap-weighted Net Income ÷ Equity across the group. Shown for "
                            "completeness — but on its own ROE does NOT demonstrate value creation: it "
                            "is mechanically inflated by leverage (ROE = ROA × Assets/Equity), so a "
                            "thin-margin, highly-levered bank can post a high ROE while creating little. "
                            "Read it only against the cost of equity above."),
                analysis="Compare with Cost of Equity — the gap (excess return), not the level, is what matters.",
            ),
        ]
        if er.get("justifiedPB") is not None and er.get("actualPB") is not None:
            er_tiles.append(metric(
                number=base + 3, name="Justified P/B vs Actual", unit="x",
                trend=[(str(last_yr), er["actualPB"])],
                secondary_label=f"Justified {er['justifiedPB']}x",
                vertical=[
                    {"label": "Justified P/B = (ROE − g)/(Ke − g)", "value": er["justifiedPB"], "unit": "x"},
                    {"label": "Actual P/B", "value": er["actualPB"], "unit": "x"},
                ],
                definition=("Actual price-to-book against the P/B the fundamentals justify, "
                            "(ROE − g)/(Ke − g) (Damodaran, Ch.21). For financials, book value tracks "
                            "the market value of net assets, so P/B read against ROE − Ke is the core "
                            "relative-value lens. A low P/B is only cheap if it sits above the justified "
                            "level; a bank below book with ROE under its cost of equity is correctly priced."),
                analysis="Actual above justified = rich vs fundamentals; below = cheap.",
            ))
        # Net interest margin — only when the group actually contains spread lenders.
        nim_trend = er.get("nimTrend", [])
        if nim_trend:
            er_tiles.append(metric(
                number=base + 4, name="Net Interest Margin", unit="%",
                trend=nim_trend,
                definition=("Market-cap-weighted net interest income (interest income − interest "
                            "expense) ÷ total assets across the spread-based lenders in the group "
                            "(Damodaran, Ch.21). The core driver of bank profitability — the spread "
                            "between what banks earn on assets and pay for funding. A conservative "
                            "proxy: true NIM uses average earning assets, not total assets."),
                analysis=("Wider and stable is better; NIM tracks the rate cycle and the steepness of "
                          "the yield curve. Only lenders are included, so non-bank financials do not "
                          "dilute it."),
            ))
        all_metrics = all_metrics + er_tiles

    # Life-cycle stage (Porter Ch.8) — additive; None on any failure.
    try:
        lifecycle = _lifecycle_stage(group_col, group_name)
    except Exception as exc:  # noqa: BLE001
        log.warning("lifecycle failed for %s=%s: %s", group_col, group_name, exc)
        lifecycle = None

    # Scorecard value score + fired integrity questions — additive; None on
    # any failure. Sourced from the (cached) scorecard matrices so this page,
    # the matrix tables, and the AI data context all report the same numbers.
    scorecard = None
    if GROUP_SCORING_OK and group_scoring is not None:
        try:
            if group_col == "sector":
                mm = _sector_current_metrics()
                colx = (mm.get("data") or {}).get(group_name)
                peers = sum(1 for c in (mm.get("data") or {}).values()
                            if c.get("valueScore") is not None)
            else:
                mm = _industry_scorecard(group_name)
                colx = (mm.get("data") or {}).get(group_name)
                peers = mm.get("scorePeers")
            if colx is not None and colx.get("valueScore") is not None:
                scorecard = {
                    "valueScore": colx.get("valueScore"),
                    "rank": colx.get("scoreRank"),
                    "peers": peers,
                    "integrity": group_scoring.fired(colx.get("_integrity") or []),
                }
        except Exception as exc:  # noqa: BLE001
            log.warning("scorecard failed for %s=%s: %s", group_col, group_name, exc)

    return {
        "section": section_key,
        "scopeKey": group_name,
        "title": f"{group_name} — {title_suffix}",
        "subtitle": f"Market-cap weighted aggregates across {ticker_count} companies. Years {valid_years[0]}-{valid_years[-1]}.",
        "metrics": all_metrics,
        "recessionBands": [],
        "valuation": {
            "cape": valuation.get("cape"),
            "dcfIntrinsic": valuation.get("dcfIntrinsic"),
            "marginOfSafety": valuation.get("marginOfSafety"),
            "fcfGrowthUsed": valuation.get("fcfGrowthUsed"),
            "valueScore": valuation.get("valueScore"),
        },
        # Where this industry sits in its life (Porter, Competitive Strategy Ch.8)
        "lifecycle": lifecycle,
        # Scorecard value score + fired integrity questions (group_scoring)
        "scorecard": scorecard,
    }


@app.get("/api/industry/{industry}")
def industry_endpoint(industry: str = PathParam(pattern=GROUP_PATTERN)) -> dict[str, Any]:
    return _group_section("industry", urllib.parse.unquote(industry), "industry", "Industry Analysis")


@app.get("/api/sector/{sector}")
def sector_endpoint(sector: str = PathParam(pattern=GROUP_PATTERN)) -> dict[str, Any]:
    return _group_section("sector", urllib.parse.unquote(sector), "sector", "Sector Analysis")


# ── /api/sector-metrics ─ current-year pooled fundamentals matrix ─────────────
# Pooled (Σ numerator / Σ denominator) most-recent-year fundamentals for every
# sector, plus a full blended WACC. Powers the sector comparison table (metrics
# × sectors) and the per-sector panel. Universe: USD filers, market cap ≥ $1B,
# revenue > 0, with a market-cap-relative plausibility guard that drops corrupt
# source rows (e.g. mislabelled non-USD magnitudes).

_SECTOR_MC_FLOOR = 1e9
# Average matrices (sector / industries-within-sector / one-industry scorecard)
# include ALL filers, not just USD, so the per-sector sample is deep (≥500 names
# per sector, ≥100 per non-trivial industry). The floor is applied on the
# USD-converted market cap (via _mc_to_usd) so a $100M bar means the same thing
# in every currency — a local-currency SQL floor would compare apples to yen.
_AVG_MC_FLOOR_USD = 1e8     # $100M, applied to FX-converted market cap


def _usable_mc_weight(mc: float | None) -> bool:
    """Whether an FX-converted market cap may act as a weight.

    The floor keeps a shell company out of a sector average. The CEILING is
    the same bound ``industry_averages``' SQL applies (``MAX_MARKET_CAP_USD``)
    and the scorecard matrices had no equivalent, so rows such as BREN.JK at
    $477 trillion and GMKN.ME at $255 trillion carried thousands of times the
    weight of the largest real company and decided a whole sector's column.
    A row above the bound is DROPPED, never clamped.
    """
    return mc is not None and _AVG_MC_FLOOR_USD <= mc < MAX_MARKET_CAP_USD
# Fallback CAPM inputs for sector-level cost of equity, used ONLY when the live
# implied ERP (get_live_wacc_params) is unavailable. Previously the sector page
# hard-coded a 5.5% ERP that disagreed with the individual page's premium; both
# now read the same live implied ERP (Damodaran Ch.8) via _sector_wacc_params.
_SECTOR_RF = 0.045          # risk-free fallback (matches data/financial_db.py)
_SECTOR_ERP = 0.045         # equity-risk-premium fallback (matches FIXED_EQUITY_RISK_PREMIUM)


def _live_rf() -> float:
    """The LIVE risk-free rate for growth ceilings in rendered ratios (the
    justified P/B's perpetuity cap). The individual page already caps at the
    live rate; the scorecard matrices must not silently use a frozen 4.5%
    while the cost of equity beside them moves."""
    try:
        return float(get_live_wacc_params().get("rf") or _SECTOR_RF)
    except Exception:  # noqa: BLE001
        return _SECTOR_RF
# Sector Ke market-cap-weights many single-name betas; a corrupt/extreme beta on
# one large constituent could dominate the aggregate, so each is clamped to a
# plausible band before weighting (the individual page leaves beta unclamped).
_SECTOR_BETA_MIN, _SECTOR_BETA_MAX = 0.3, 3.0
# (column, max multiple of market cap) — drop the company row if exceeded.
_SECTOR_SANITY: list[tuple[str, float]] = [
    ("Total Assets", 60), ("Revenue", 50), ("Net Income", 25),
    ("Total Stockholders Equity", 30), ("Total Debt", 60),
]

# (key, label, unit, group, definition)
# Every metric is computed PER COMPANY (with the company's own beta + capital
# structure for WACC and EVA), then market-cap-weighted across the sector.
_SECTOR_METRIC_DEFS: list[tuple[str, str, str, str, str]] = [
    ("eva", "EVA (Economic Value Added)", "$", "Value creation",
     "Each company's EVA = NOPAT − (its own WACC) × Invested Capital, then market-cap-weighted across the sector. Dollar profit earned above the full cost of capital."),
    ("evaMargin", "EVA Margin", "%", "Value creation",
     "Each company's EVA ÷ Revenue, market-cap-weighted across the sector. Economic profit per dollar of sales."),
    ("roic", "ROIC", "%", "Value creation",
     "Each company's NOPAT ÷ Invested Capital (Equity + Debt), market-cap-weighted. Return earned on capital employed."),
    ("wacc", "WACC", "%", "Value creation",
     "Each company's full WACC — CAPM cost of equity (the live 10-year Treasury yield plus beta times the live implied equity risk premium) blended with its after-tax cost of debt — market-cap-weighted. The hurdle ROIC must clear."),
    ("roicWaccSpread", "ROIC − WACC Spread", "%", "Value creation",
     "ROIC minus WACC, market-cap-weighted across the group and derived from the weighted ROIC and weighted WACC so the three numbers reconcile. The core value-creation test. A positive spread means invested capital earns more than it costs, so growth builds value. A negative spread means returns sit below the cost of capital, so growth destroys it."),
    # Equity-side value creation (Damodaran, Ch.21). For financials, ROIC/WACC are
    # undefined (debt is raw material), so the test is ROE vs cost of EQUITY: value
    # is created only when ROE > Ke. Raw ROE alone does NOT prove value creation —
    # it is inflated by leverage (see the DuPont equity-multiplier lever).
    ("roeEquity", "ROE", "%", "Value creation (equity)",
     "Each company's Net Income ÷ Equity, market-cap-weighted. The return to shareholders — but on its own it is not a value-creation verdict (leverage inflates it); read it against the cost of equity below."),
    ("costOfEquity", "Cost of Equity (Ke)", "%", "Value creation (equity)",
     "Each company's CAPM cost of equity (the live 10-year Treasury yield plus beta times the live implied equity risk premium), market-cap-weighted. The equity hurdle rate — the right benchmark for banks and insurers, where ROIC/WACC are undefined because debt is operating raw material."),
    ("excessReturnEquity", "Excess Return (ROE − Ke)", "%", "Value creation (equity)",
     "Each company's ROE minus its cost of equity, market-cap-weighted (Damodaran, Ch.21). The direct equity value-creation test: positive = value created (P/B should exceed 1), negative = value destroyed. The equity-only twin of ROIC − WACC."),
    ("justifiedPB", "Justified P/B", "x", "Value creation (equity)",
     "Each company's (ROE − g)/(Ke − g), market-cap-weighted — the price-to-book the fundamentals warrant. Compare with actual P/B: a low P/B is only cheap if it sits above the justified level."),
    ("actualPB", "Actual P/B", "x", "Value creation (equity)",
     "Each company's Market Cap ÷ Book Equity, market-cap-weighted. For financials, book value tracks market value of net assets closely, so P/B (read against ROE − Ke) is the core relative-value lens."),
    ("peRatio", "P/E Ratio", "x", "Valuation",
     "Each company's Market Cap ÷ Net Income (profitable companies only), market-cap-weighted across the group. The price investors pay for each dollar of current earnings. A higher group P/E reflects optimism or higher expected growth, so comparing P/E across sectors shows where the market is paying up for a story and where it is cautious."),
    # Bank profitability — only spread-based lenders (interest income ≥ 20% of
    # revenue) are included, so the average is not diluted by card networks,
    # exchanges, or asset managers, where NIM is structurally ~0.
    ("netInterestMargin", "Net Interest Margin", "%", "Bank profitability",
     "Net interest income (interest income − interest expense) ÷ total assets, market-cap-weighted across the spread-based LENDERS in the group only (interest income ≥ 20% of revenue). The core driver of bank profitability — the spread between what a bank earns on assets and pays on funding. A conservative proxy: true NIM uses average earning assets, which the dataset does not break out."),
    ("dupontTaxBurden", "DuPont · Tax Burden (NI/EBT)", "x", "DuPont (ROE)",
     "Each company's Net Income ÷ Pre-tax Income (EBT), market-cap-weighted. Tax-retention lever of the 5-factor DuPont — the share of pre-tax profit that survives taxes."),
    ("dupontInterestBurden", "DuPont · Interest Burden (EBT/EBIT)", "x", "DuPont (ROE)",
     "Each company's Pre-tax Income ÷ Operating Income (EBIT), market-cap-weighted. Interest-burden lever — the share of operating profit that survives interest and non-operating items."),
    ("dupontEbitMargin", "DuPont · EBIT Margin (EBIT/Rev)", "%", "DuPont (ROE)",
     "Each company's Operating Income ÷ Revenue, market-cap-weighted. Operating-profitability lever. Tax × Interest × EBIT-margin = net margin."),
    ("dupontNetMargin", "DuPont · Net Profit Margin", "%", "DuPont (ROE)",
     "Each company's Net Income ÷ Revenue, market-cap-weighted. Profitability summary — equals Tax Burden × Interest Burden × EBIT Margin. Full 5-factor: ROE = Tax × Interest × EBIT-margin × Turnover × Multiplier."),
    ("dupontAssetTurnover", "DuPont · Asset Turnover", "x", "DuPont (ROE)",
     "Each company's Revenue ÷ Total Assets, market-cap-weighted. The efficiency lever."),
    ("dupontEquityMultiplier", "DuPont · Equity Multiplier", "x", "DuPont (ROE)",
     "Each company's Total Assets ÷ Equity, market-cap-weighted. The leverage lever."),
    ("operatingMargin", "Operating Margin", "%", "Margins",
     "Each company's Operating Income ÷ Revenue, market-cap-weighted. Core profitability before financing and tax."),
    ("netMargin", "Net Margin", "%", "Margins",
     "Each company's Net Income ÷ Revenue, market-cap-weighted. Bottom-line profitability."),
    ("revenueGrowth", "Revenue Growth", "%", "Growth",
     "Each company's year-over-year revenue growth, market-cap-weighted across the group. The aggregate top-line growth rate. Compare against the economy's own nominal growth (the Economic page carries the live GDP series)."),
    ("netIncomeGrowth", "Net Income Growth", "%", "Growth",
     "Each company's year-over-year net income growth, market-cap-weighted across the group. The aggregate bottom-line growth rate; it can swing far more than revenue because costs and one-off items move profit sharply."),
    ("operatingLeverage", "Operating Leverage (DOL)", "x", "Efficiency",
     "Each company's %Δ Operating Income ÷ %Δ Revenue (latest two years), market-cap-weighted. Above 1 = profits amplify revenue swings."),
    ("capexToDepreciation", "Capex / Depreciation", "x", "Efficiency",
     "Each company's Capital Expenditure ÷ Depreciation & Amortization, market-cap-weighted. Above 1 = investing beyond maintenance."),
    ("salesToInvestedCapital", "Sales / Invested Capital", "x", "Efficiency",
     "Each company's Revenue ÷ Invested Capital, market-cap-weighted. Capital productivity."),
    ("fcfToNetIncome", "FCF / Net Income", "x", "Cash quality",
     "Each company's Free Cash Flow ÷ Net Income (positive-earnings companies), market-cap-weighted. Earnings quality — how much profit converts to cash."),
    ("netDebtToOcf", "Net Debt / OCF", "x", "Leverage",
     "Each company's Net Debt ÷ Operating Cash Flow (positive-OCF companies), market-cap-weighted. Years to repay net debt. Lower is safer."),
    ("liabilitiesToEquity", "Liabilities / Equity", "x", "Leverage",
     "Each company's Total Liabilities ÷ Equity, market-cap-weighted. Total balance-sheet leverage."),
]

# The group Value Score, emitted as a scorecard-matrix ROW (one column per
# sector/industry) so the whole field is ranked side by side without clicking
# into each one. It is a GROUP-level score with no per-company value, so it is
# NOT part of _SECTOR_METRIC_DEFS / metric_keys (that drives per-company
# aggregation, clipping, and history — including it would null the score before
# _augment_matrix_scoring re-sets it). Each column already carries valueScore.
_SCORE_METRIC_DEF = (
    "valueScore", "Value Score", "n", "Value Score",
    "The scorecard's 0-100 value score for this group, blending the scorecard measures with "
    "the most weight on economic profit (the ROIC minus WACC spread and EVA margin). A higher "
    "score means the group screens as a stronger value creator than its peers. It is a "
    "screening rank, not a valuation. Click the score to open the full method.",
)


def _base_metric_dicts_with_score() -> list[dict[str, str]]:
    """`_SECTOR_METRIC_DEFS` as metric dicts, with the Value Score row spliced in
    immediately after the last 'Valuation'-group metric, so it renders one row
    below the valuation metrics on every scorecard matrix."""
    defs = list(_SECTOR_METRIC_DEFS)
    out: list[dict[str, str]] = []
    inserted = False
    for i, (k, lbl, u, grp, d) in enumerate(defs):
        out.append({"key": k, "label": lbl, "unit": u, "group": grp, "definition": d})
        next_group = defs[i + 1][3] if i + 1 < len(defs) else None
        if not inserted and grp == "Valuation" and next_group != "Valuation":
            sk, sl, su, sg, sd = _SCORE_METRIC_DEF
            out.append({"key": sk, "label": sl, "unit": su, "group": sg, "definition": sd})
            inserted = True
    if not inserted:  # defensive: no 'Valuation' group found → append at end
        sk, sl, su, sg, sd = _SCORE_METRIC_DEF
        out.append({"key": sk, "label": sl, "unit": su, "group": sg, "definition": sd})
    return out


_SECTOR_NEEDED_COLS = [
    "Revenue", "Operating Income", "Net Income", "Total Assets", "Total Stockholders Equity",
    "Total Liabilities", "Total Debt", "Net Debt", "Free Cash Flow", "Operating Cash Flow",
    "Capital Expenditure", "Depreciation And Amortization", "Income Before Tax",
    "Income Tax Expense", "Interest Expense", "Market Cap", "Payout Ratio",
    "Interest Income", "Revenue Growth", "Net Income Growth",
    # Needed so _mc_to_usd can FX-convert a non-USD filer's cap (the average
    # matrices now include all currencies, not just USD filers).
    "Reported Currency",
]

# Gates that identify a genuine spread-based lender (bank) for NIM. (1) interest
# income ÷ revenue screens out card networks, exchanges and asset managers; (2)
# interest expense ÷ interest income screens out cash-rich, low-revenue firms
# whose interest income is just yield on cash (no funded spread). Genuine lenders
# run ie/ii ≈ 0.3–0.7. Mirrors NIM_MATERIALITY / NIM_FUNDING_MIN in individualanalysis.
_NIM_MATERIALITY = 0.20        # interest income ÷ revenue
_NIM_FUNDING_MIN = 0.20        # interest expense ÷ interest income
_NIM_LEVERAGE_MIN = 4.0        # assets ÷ equity (a lender is leveraged; cash-rich firms ≈ 1x)


def _sector_wacc_params() -> tuple[float, float]:
    """(rf, erp) for sector-level CAPM — the SAME live implied ERP the individual
    page uses (Damodaran Ch.8) so sector and single-name cost of equity agree.
    Falls back to the _SECTOR_RF/_SECTOR_ERP constants when live params fail."""
    try:
        macro = get_live_wacc_params()
        return float(macro.get("rf") or _SECTOR_RF), float(macro.get("erp") or _SECTOR_ERP)
    except Exception:  # noqa: BLE001
        return _SECTOR_RF, _SECTOR_ERP


def _sector_capm(beta: float | None) -> float:
    """Sector-level CAPM: clamps the aggregate beta to a sane band, then routes
    through the single shared ``capm_discount_rate`` (market_fallback=True is
    the documented no-beta policy: beta = 1 at live rates, never a flat 10%)."""
    rf, erp = _sector_wacc_params()
    b = None if (beta is None or beta <= 0) else max(
        _SECTOR_BETA_MIN, min(_SECTOR_BETA_MAX, beta))
    return capm_discount_rate(b, rf=rf, erp=erp, market_fallback=True)


def _sf(row: Any, col: str) -> float | None:
    v = row[col]
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _sf_opt(row: Any, col: str) -> float | None:
    """Like ``_sf`` but returns None when the column isn't in the row's SELECT
    (instead of raising) — used for the optional per-share columns, which only the
    ranking's ``f.*`` query fetches."""
    try:
        v = row[col]
    except (IndexError, KeyError):
        return None
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


class _RowWithMarketCap:
    """Wrap a sqlite Row so "Market Cap" reads back as a live yfinance value while
    every other column passes through unchanged. Used by the bounded comparative
    Company Scorecard so the displayed cap and its cap-derived ratios (P/E, P/B,
    P/FCF) reflect today's market, not the stale filing-date cap."""

    __slots__ = ("_row", "_mc")

    def __init__(self, row: Any, market_cap: float) -> None:
        self._row = row
        self._mc = market_cap

    def __getitem__(self, key: str) -> Any:
        if key == "Market Cap":
            return self._mc
        return self._row[key]

    def keys(self) -> Any:
        return self._row.keys()


def _live_cap_in_row_currency(ticker: str, row: Any) -> float | None:
    """Today's market cap for ``ticker``, expressed in ``row``'s reporting
    currency, or None when it cannot be (so the caller keeps the stored cap).

    yfinance prices the LISTING, so the quote is in the listing's currency: a
    Taiwanese filer's US ADR quotes in USD against TWD statements. Dropping the
    raw quote into the row made every cap-derived ratio on that column wrong by
    the exchange rate, and `_mc_to_usd` then converted it a second time. This is
    the request-time twin of the conversion the weekly sweep does on write."""
    cap, quote_ccy = fetch_latest_market_cap_currency_yf(ticker)
    if cap is None or fx_convert is None:
        return None
    keys = row.keys()
    reporting_ccy = row["Reported Currency"] if "Reported Currency" in keys else None
    return fx_convert.convert_amount(cap, quote_ccy, reporting_ccy, _fx_rates())


def _sector_row_plausible(row: Any) -> bool:
    mc = _sf(row, "Market Cap")
    rev = _sf(row, "Revenue")
    if not mc or mc <= 0:
        return False
    if rev is None or rev <= 0:
        return False
    for col, mult in _SECTOR_SANITY:
        v = _sf(row, col)
        if v is not None and abs(v) > mult * mc:
            return False
    return True


# Per-company ratio winsorisation bounds (in display units) keep one extreme
# company from distorting the market-cap-weighted average. EVA (a dollar value)
# is left unclipped — the plausibility guard already removed corrupt rows.
_SECTOR_CLIP: dict[str, tuple[float, float]] = {
    "evaMargin": (-100.0, 100.0),
    "roic": (-100.0, 100.0),
    "wacc": (2.0, 25.0),
    "roicWaccSpread": (-100.0, 100.0),
    "roeEquity": (-100.0, 100.0),
    "costOfEquity": (2.0, 25.0),
    "excessReturnEquity": (-100.0, 100.0),
    "justifiedPB": (0.0, 20.0),
    "actualPB": (0.0, 20.0),
    "peRatio": (0.0, 100.0),
    "netInterestMargin": (-5.0, 15.0),
    "dupontTaxBurden": (-2.0, 2.0),
    "dupontInterestBurden": (-2.0, 2.0),
    "dupontEbitMargin": (-100.0, 100.0),
    "dupontNetMargin": (-100.0, 100.0),
    "dupontAssetTurnover": (0.0, 10.0),
    "dupontEquityMultiplier": (0.0, 40.0),
    "operatingMargin": (-100.0, 100.0),
    "netMargin": (-100.0, 100.0),
    "revenueGrowth": (-60.0, 150.0),
    "netIncomeGrowth": (-150.0, 200.0),
    "operatingLeverage": (-15.0, 15.0),
    "capexToDepreciation": (0.0, 15.0),
    "salesToInvestedCapital": (0.0, 20.0),
    "fcfToNetIncome": (-15.0, 15.0),
    "netDebtToOcf": (-15.0, 40.0),
    "liabilitiesToEquity": (0.0, 40.0),
}


@cached(ttl_seconds=24 * 3600, key_prefix="fx")
def _fx_rates() -> dict[str, float]:
    """{currency: USD-per-unit} from the fx_rates table, for converting a company's
    local-currency market cap to USD so peers are size-comparable."""
    db = get_db()
    try:
        return db.get_fx_rates() if db is not None else {}
    except Exception as exc:  # noqa: BLE001 — never let a missing table break a page
        log.warning("[api] fx rates unavailable: %s", exc)
        return {}


@cached(ttl_seconds=6 * 60 * 60, key_prefix="fxhist")
def _fx_hist() -> dict[tuple[str, int], float]:
    """{(currency, year): USD-per-unit} from fx_rates_hist — the rate at THAT
    year's end, so a historical market cap is weighted at the rate that applied
    when it was measured. Empty dict when the table is absent (the callers then
    fall back to the spot rate, i.e. pre-existing behaviour)."""
    try:
        with db_conn() as conn:
            rows = conn.execute(
                "SELECT currency, year, usd_per_unit FROM fx_rates_hist"
            ).fetchall()
    except (sqlite3.OperationalError, sqlite3.DatabaseError):
        return {}
    return {(r["currency"], int(r["year"])): float(r["usd_per_unit"])
            for r in rows if r["usd_per_unit"]}


def _mc_to_usd(latest: Any, mc: float | None) -> float | None:
    """Market cap converted to USD via the row's Reported Currency (1.0 when the
    currency is USD, unknown, or has no rate). Used for size ranking / weighting /
    display — NOT for ratios, which stay in the company's own currency.

    The rate is the one that applied at the row's OWN fiscal year end, so a 2016
    cap is not converted at today's rate (that understated a JPY filer by ~28%).
    The most recent year is the exception: its cap is refreshed to spot weekly,
    so it pairs with the spot rate (see _FX_SPOT_FROM_YEAR)."""
    if mc is None:
        return None
    keys = latest.keys()
    ccy = latest["Reported Currency"] if "Reported Currency" in keys else None
    if not ccy:
        return mc
    yr = latest["yr"] if "yr" in keys else None
    if yr is not None:
        try:
            y = int(yr)
        except (TypeError, ValueError):
            y = None
        if y is not None and y < _FX_SPOT_FROM_YEAR:
            rate = _fx_hist().get((ccy, y))
            if rate is not None:
                return mc * rate
    spot = _fx_rates().get(ccy)
    if spot is not None:
        return mc * spot
    if ccy == "USD":
        return mc
    # Non-USD currency absent from BOTH rate tables: drop the row (return None)
    # rather than pretend a 1:1 USD rate, matching the NULL-weight drop rule in
    # _FX_WEIGHT_SQL. Callers treat None as "exclude from size ranking/weighting".
    return None


# ── TTM substitution (Phase 4) ───────────────────────────────────────────────
# Overlay-eligible columns = EXCEL_COLUMNS metrics minus the two currency-bound
# absolute figures (Market Cap / Enterprise Value): the stored TTM snapshot's
# cap comes from yfinance .info and may be in a different currency than the
# annual row's Reported Currency, which _mc_to_usd relies on. Every other metric
# (income / balance / cash flow / currency-neutral ratios) overlays cleanly.
_TTM_METRIC_COLS = ttm_lib.metric_columns(EXCEL_COLUMNS) - {
    "Market Cap", "Enterprise Value",
}


def _ttm_row(ticker: str) -> Any | None:
    """The stored TTM snapshot row for `ticker` (financials_quarterly,
    Period='TTM'), or None when the table or the row is absent. Returns a
    sqlite3.Row (mapping access by column name)."""
    try:
        with db_conn() as conn:
            return conn.execute(
                "SELECT * FROM financials_quarterly "
                "WHERE Ticker = ? AND Period = 'TTM' LIMIT 1",
                (ticker.upper(),),
            ).fetchone()
    except sqlite3.OperationalError:
        return None  # table not created yet


def _latest_or_ttm(rs: list[Any], ticker: str) -> Any:
    """The effective 'latest' row for a company's per-metric calculation.

    off    -> the annual latest row (rs[0]) unchanged (byte-identical).
    on     -> annual overlaid with the stored TTM row's metric values (annual
              fallback when there is no TTM row or a null column).
    shadow -> annual unchanged; valuations never move (TTM via _ttm_row)."""
    latest = rs[0]
    if TTM_MODE == "on":
        return ttm_lib.choose_latest(latest, _ttm_row(ticker), "on",
                                     _TTM_METRIC_COLS)
    return latest  # off / shadow


def _company_metrics(latest: Any, prior: Any | None) -> dict[str, float | None]:
    """Every metric for a single company from its latest annual row (and prior
    year for operating leverage). Uses the company's OWN beta and capital
    structure for a per-company WACC and EVA. `_mc` carries the weight. Ratios
    return None when their denominator is non-positive (would be meaningless)."""
    rev = _sf(latest, "Revenue"); oi = _sf(latest, "Operating Income"); ni = _sf(latest, "Net Income")
    assets = _sf(latest, "Total Assets"); eq = _sf(latest, "Total Stockholders Equity")
    liab = _sf(latest, "Total Liabilities")
    td = _sf(latest, "Total Debt") or 0.0
    netdebt = _sf(latest, "Net Debt"); fcf = _sf(latest, "Free Cash Flow"); ocf = _sf(latest, "Operating Cash Flow")
    cap = _sf(latest, "Capital Expenditure"); da = _sf(latest, "Depreciation And Amortization")
    ibt = _sf(latest, "Income Before Tax"); tax = _sf(latest, "Income Tax Expense")
    ie = _sf(latest, "Interest Expense"); mc = _sf(latest, "Market Cap")
    ii = _sf(latest, "Interest Income")
    beta = latest["beta"]

    tr = max(0.0, min(0.45, tax / ibt)) if (ibt and ibt > 0 and tax is not None) else 0.21
    nopat = oi * (1 - tr) if oi is not None else None
    ic = (eq + td) if (eq is not None) else None

    # Per-company WACC = Ke·(E/V) + Kd·(1−tax)·(D/V).
    ke = _sector_capm(float(beta) if beta is not None else None)
    kd = max(0.02, min(0.12, abs(ie) / td)) if (ie is not None and td > 0) else 0.05
    E = mc if mc else 0.0
    V = E + td
    wacc = (ke * (E / V) + kd * (1 - tr) * (td / V)) if V > 0 else ke
    eva = (nopat - wacc * ic) if (nopat is not None and ic is not None) else None

    def r(n: float | None, d: float | None) -> float | None:
        if n is None or d is None or d <= 0:
            return None
        return n / d

    dol = None
    # Skip operating leverage when `latest` is a TTM overlay: comparing a
    # trailing-twelve-month OI/Revenue against the prior FULL fiscal year is a
    # mixed-period ratio (Phase 7 finding VAL-04).
    is_ttm_overlay = isinstance(latest, dict) and latest.get("_ttm_overlay")
    if prior is not None and not is_ttm_overlay:
        oi0 = _sf(prior, "Operating Income"); rev0 = _sf(prior, "Revenue")
        if oi0 and rev0 and rev is not None and oi is not None:
            rev_g = rev / rev0 - 1
            if rev_g != 0:
                dol = (oi / oi0 - 1) / rev_g

    def pct(x: float | None) -> float | None:
        return None if x is None else x * 100.0

    # Equity-side value creation (Damodaran, Ch.21). ROE vs cost of EQUITY is the
    # value test for financials, where ROIC/WACC are undefined. Justified P/B =
    # (ROE − g)/(Ke − g) with g = retention × ROE capped at the risk-free rate.
    roe = r(ni, eq)
    excess_equity = (roe - ke) if roe is not None else None
    payout = _sf(latest, "Payout Ratio")
    payout = max(0.0, min(1.0, payout)) if payout is not None else None
    actual_pb = r(mc, eq)
    justified_pb = None
    if roe is not None and roe > 0:
        retention = (1.0 - payout) if payout is not None else 1.0
        g_eq = min(_live_rf(), max(0.0, retention * roe))
        if ke > g_eq:
            justified_pb = (roe - g_eq) / (ke - g_eq)

    # Net interest margin — only for spread-based lenders (banks), so the sector
    # average is not diluted by non-lenders. NII ÷ total assets (proxy).
    nim = None
    sec_name = latest["sec"] if "sec" in latest.keys() else None
    if (sec_name == "Financial Services"
            and ii is not None and ii > 0 and rev and rev > 0 and ie is not None and ie > 0
            and assets and assets > 0 and eq and eq > 0
            and (ii / rev) >= _NIM_MATERIALITY and (ie / ii) >= _NIM_FUNDING_MIN
            and (assets / eq) >= _NIM_LEVERAGE_MIN):
        nii_v = ii - ie
        if nii_v > 0:
            nim = pct(nii_v / assets)

    roic_pct = pct(r(nopat, ic))
    wacc_pct = wacc * 100.0
    return {
        "eva": eva,
        "evaMargin": pct(r(eva, rev)),
        "roic": roic_pct,
        "wacc": wacc_pct,
        # Firm-level value-creation spread. Aggregated columns override this with
        # (weighted ROIC − weighted WACC) so the three displayed numbers reconcile;
        # in this per-company matrix it is the company's own ROIC − WACC.
        "roicWaccSpread": (roic_pct - wacc_pct) if roic_pct is not None else None,
        "roeEquity": pct(roe),
        "costOfEquity": ke * 100.0,
        "excessReturnEquity": pct(excess_equity),
        "justifiedPB": justified_pb,
        "actualPB": actual_pb,
        # Current market-cap-weighted P/E: price per dollar of earnings (loss-makers
        # excluded since P/E is meaningless on negative earnings).
        "peRatio": r(mc, ni),
        "netInterestMargin": nim,
        "dupontTaxBurden": r(ni, ibt),
        "dupontInterestBurden": r(ibt, oi),
        "dupontEbitMargin": pct(r(oi, rev)),
        "dupontNetMargin": pct(r(ni, rev)),
        "dupontAssetTurnover": r(rev, assets),
        "dupontEquityMultiplier": r(assets, eq),
        "operatingMargin": pct(r(oi, rev)),
        "netMargin": pct(r(ni, rev)),
        # YoY growth from FMP's stored growth columns (decimals → percent), the
        # same source the former per-sector revenue-growth lens used.
        "revenueGrowth": pct(_sf(latest, "Revenue Growth")),
        "netIncomeGrowth": pct(_sf(latest, "Net Income Growth")),
        "operatingLeverage": dol,
        "capexToDepreciation": r(abs(cap) if cap is not None else None, da),
        "salesToInvestedCapital": r(rev, ic),
        "fcfToNetIncome": r(fcf, ni),
        "netDebtToOcf": r(netdebt, ocf),
        "liabilitiesToEquity": r(liab, eq),
        # Per-share & flow figures — display-only (the ranking matrix shows them;
        # they are NOT scored). Read with _sf_opt since only the ranking's f.*
        # query selects the per-share columns.
        "revenue": rev,
        "revenuePerShare": _sf_opt(latest, "Revenue Per Share"),
        "eps": _sf_opt(latest, "EPS Diluted"),
        "operatingCashFlow": ocf,
        "ocfPerShare": _sf_opt(latest, "Operating Cash Flow Per Share"),
        "freeCashFlow": fcf,
        "fcfPerShare": _sf_opt(latest, "Free Cash Flow Per Share"),
        # USD-converted so the displayed market cap and the weighted-average weight
        # are comparable across currencies (ratios above stay in local currency).
        "_mc": _mc_to_usd(latest, mc),
    }


# ── Sector lens — sector-specific metrics for the industry comparison matrix ──
# Each sector gets extra metrics (Damodaran-grounded, computable from the
# financials columns) appended to the base matrix when comparing the industries
# WITHIN that sector. Direct columns carry a scale (FMP ratios are stored as
# decimals); derived metrics use a small named function. Aggregation is the
# same market-cap-weighted winsorised mean as the base matrix.

class _Lens(NamedTuple):
    key: str
    label: str
    unit: str                                   # "$" | "%" | "x" | "d" | "yrs"
    definition: str
    clip: tuple[float, float] | None
    col: str | None = None                      # direct financials column
    scale: float = 1.0                          # raw → display units
    fn: Callable[[Any, Any, list[Any]], float | None] | None = None
    cols: tuple[str, ...] = ()                  # extra SQL columns fn needs


def _lens_ev_ebitda(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    # Guarded recompute — the stored "Enterprise Value Over EBITDA" column goes
    # negative when EBITDA < 0, which is meaningless as a multiple.
    ev = _sf(latest, "Enterprise Value")
    ebitda = _sf(latest, "EBITDA")
    if ev is None or ebitda is None or ev <= 0 or ebitda <= 0:
        return None
    return ev / ebitda


def _lens_nd_ebitda(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    nd = _sf(latest, "Net Debt")
    ebitda = _sf(latest, "EBITDA")
    if nd is None or ebitda is None or ebitda <= 0:
        return None
    return nd / ebitda  # negative = net cash, kept


def _lens_pffo(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    mc = _sf(latest, "Market Cap")
    ni = _sf(latest, "Net Income")
    da = _sf(latest, "Depreciation And Amortization")
    if mc is None or mc <= 0 or ni is None or da is None:
        return None
    ffo = ni + da
    return mc / ffo if ffo > 0 else None


def _lens_cap_rate(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    ev = _sf(latest, "Enterprise Value")
    ebitda = _sf(latest, "EBITDA")
    if ev is None or ebitda is None or ev <= 0 or ebitda <= 0:
        return None
    return 100.0 * ebitda / ev


def _lens_fin_leverage(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    assets = _sf(latest, "Total Assets")
    eq = _sf(latest, "Total Stockholders Equity")
    if assets is None or eq is None or eq <= 0:
        return None
    return assets / eq


def _lens_sustainable_g(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    ni = _sf(latest, "Net Income")
    eq = _sf(latest, "Total Stockholders Equity")
    payout = _sf(latest, "Payout Ratio")
    if ni is None or eq is None or eq <= 0:
        return None
    retention = (1.0 - max(0.0, min(1.0, payout))) if payout is not None else 1.0
    return 100.0 * retention * (ni / eq)


def _lens_fcf_margin(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    fcf = _sf(latest, "Free Cash Flow")
    rev = _sf(latest, "Revenue")
    if fcf is None or rev is None or rev <= 0:
        return None
    return 100.0 * fcf / rev


def _lens_rule40(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    g = _sf(latest, "Revenue Growth")
    fm = _lens_fcf_margin(latest, prior, rows)
    if g is None or fm is None:
        return None
    return 100.0 * g + fm


def _lens_ccc(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    dso = _sf(latest, "Days Sales Outstanding")
    dio = _sf(latest, "Days Of Inventory On Hand")
    dpo = _sf(latest, "Days Payables Outstanding")
    if dso is None or dio is None or dpo is None:
        return None
    return dso + dio - dpo


def _lens_inv_turns(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    v = _sf(latest, "Inventory Turnover")
    # Zero means "no inventory" (services etc.) — excluding it keeps the
    # weighted mean a real turn rate instead of being diluted toward zero.
    return v if v is not None and v > 0 else None


def _lens_norm_ebitda_margin(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    vals = [v for r0 in rows if (v := _sf(r0, "EBITDA Ratio")) is not None]
    if not vals:
        return None
    return 100.0 * sum(vals) / len(vals)


def _lens_cash_runway(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    # Cash burners only (negative operating cash flow), mirroring the
    # lenders-only NIM pattern — profitable companies have no "runway".
    cash = _sf(latest, "Cash And Short Term Investments")
    ocf = _sf(latest, "Operating Cash Flow")
    if cash is None or ocf is None or ocf >= 0 or cash <= 0:
        return None
    return cash / -ocf


def _lens_peg(latest: Any, prior: Any, rows: list[Any]) -> float | None:
    raw = latest["peg"]
    try:
        v = float(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None
    return v if v is not None and v > 0 else None


_L_DIV_YIELD = _Lens(
    "divYield", "Dividend Yield", "%",
    "Each company's dividend yield, market-cap-weighted across the industry. The cash return to shareholders at current prices.",
    (0.0, 15.0), col="Dividend Yield", scale=100.0)
_L_PAYOUT = _Lens(
    "payoutRatio", "Payout Ratio", "%",
    "Each company's dividends ÷ net income, market-cap-weighted. Above 100% = paying out more than it earns (unsustainable without balance-sheet support).",
    (0.0, 200.0), col="Payout Ratio", scale=100.0)
_L_EV_EBITDA = _Lens(
    "evToEbitda", "EV / EBITDA", "x",
    "Each company's Enterprise Value ÷ EBITDA (positive-EBITDA companies only), market-cap-weighted. The standard capital-structure-neutral multiple for asset-heavy groups.",
    (0.0, 60.0), fn=_lens_ev_ebitda, cols=("Enterprise Value", "EBITDA"))
_L_ND_EBITDA = _Lens(
    "netDebtToEbitda", "Net Debt / EBITDA", "x",
    "Each company's Net Debt ÷ EBITDA (positive-EBITDA companies only), market-cap-weighted. Years of EBITDA to repay net debt; negative = net cash.",
    (-10.0, 15.0), fn=_lens_nd_ebitda, cols=("EBITDA",))
_L_INT_COV = _Lens(
    "interestCoverage", "Interest Coverage", "x",
    "Each company's EBIT ÷ interest expense, market-cap-weighted. How many times operating profit covers the interest bill.",
    (-10.0, 50.0), col="Interest Coverage")
_L_GROSS = _Lens(
    "grossMargin", "Gross Margin", "%",
    "Each company's (Revenue − COGS) ÷ Revenue, market-cap-weighted. Fridson: particularly important for retailers; a pricing-power / moat proxy.",
    (-50.0, 100.0), col="Gross Profit Ratio", scale=100.0)
_L_EBITDA_M = _Lens(
    "ebitdaMargin", "EBITDA Margin", "%",
    "Each company's EBITDA ÷ Revenue, market-cap-weighted. Core cash profitability before capital intensity.",
    (-100.0, 100.0), col="EBITDA Ratio", scale=100.0)
_L_CAPEX_REV = _Lens(
    "capexToRevenue", "Capex / Revenue", "%",
    "Each company's capital expenditure ÷ Revenue, market-cap-weighted. Capital intensity — how much of each sales dollar must be reinvested.",
    (0.0, 60.0), col="Capex To Revenue", scale=100.0)
# Revenue growth was promoted from a per-sector lens to a universal base metric
# (see _SECTOR_METRIC_DEFS "Growth" group) so every matrix shows it, alongside
# Net Income Growth. The old _L_REV_G lens is intentionally removed.
_L_FCF_YIELD = _Lens(
    "fcfYield", "FCF Yield", "%",
    "Each company's free cash flow ÷ market cap, market-cap-weighted. The cash return the business generates at current prices.",
    (-15.0, 25.0), col="Free Cash Flow Yield", scale=100.0)
_L_FCF_MARGIN = _Lens(
    "fcfMargin", "FCF Margin", "%",
    "Each company's free cash flow ÷ Revenue, market-cap-weighted. Cash profitability after all reinvestment.",
    (-50.0, 60.0), fn=_lens_fcf_margin)
_L_INV_TURNS = _Lens(
    "inventoryTurnover", "Inventory Turnover", "x",
    "Each company's COGS ÷ inventory (companies that carry inventory only), market-cap-weighted. Working-capital efficiency — faster turns tie up less cash.",
    (0.0, 40.0), fn=_lens_inv_turns, cols=("Inventory Turnover",))
_L_DIO = _Lens(
    "daysInventory", "Days Inventory (DIO)", "d",
    "Each company's days of inventory on hand, market-cap-weighted. How long stock sits before selling — rising DIO flags demand or obsolescence risk.",
    (0.0, 365.0), col="Days Of Inventory On Hand")
_L_CCC = _Lens(
    "cashConversionCycle", "Cash Conversion Cycle", "d",
    "Each company's DSO + DIO − DPO, market-cap-weighted. Days of operating cash tied up between paying suppliers and collecting from customers; negative = suppliers finance the business.",
    (-200.0, 400.0), fn=_lens_ccc,
    cols=("Days Sales Outstanding", "Days Of Inventory On Hand", "Days Payables Outstanding"))
_L_RD_REV = _Lens(
    "rdToRevenue", "R&D / Revenue", "%",
    "Each company's research & development ÷ Revenue, market-cap-weighted. Damodaran treats R&D as effectively cap-ex here — the reinvestment that builds the pipeline/platform.",
    (0.0, 60.0), col="Research And Development To Revenue", scale=100.0)
_L_SBC_REV = _Lens(
    "sbcToRevenue", "SBC / Revenue", "%",
    "Each company's stock-based compensation ÷ Revenue, market-cap-weighted. A dilution-quality flag — high SBC quietly transfers value from shareholders to employees.",
    (0.0, 30.0), col="Stock Based Compensation To Revenue", scale=100.0)
_L_EV_SALES = _Lens(
    "evToSales", "EV / Sales", "x",
    "Each company's Enterprise Value ÷ Revenue, market-cap-weighted. The revenue multiple — the standard lens for not-yet-profitable firms (Damodaran Ch.20).",
    (0.0, 40.0), col="EV To Sales")
_L_RULE40 = _Lens(
    "ruleOf40", "Rule of 40 (RevG% + FCF%)", "%",
    "Each company's revenue growth % plus FCF margin %, market-cap-weighted. The standard software screen: above 40 = healthy growth/profitability trade-off.",
    (-100.0, 150.0), fn=_lens_rule40, cols=("Revenue Growth",))
_L_PEG = _Lens(
    "peg", "PEG (where available)", "x",
    "Each company's PE ÷ expected growth, market-cap-weighted — where available (sparse in the current dataset, so many industries show no value).",
    (0.0, 10.0), fn=_lens_peg)
_L_INC_Q = _Lens(
    "incomeQuality", "Income Quality (OCF/NI)", "x",
    "Each company's operating cash flow ÷ net income, market-cap-weighted. Above 1 = earnings are backed by cash; well below 1 flags accrual-heavy profits.",
    (-5.0, 10.0), col="Income Quality")
_L_PTB = _Lens(
    "priceToTangibleBook", "P / Tangible Book", "x",
    "Each company's price ÷ tangible book value, market-cap-weighted. Note: the current dataset's tangible book equals book value (intangibles are not subtracted), so this presently mirrors P/B.",
    (0.0, 20.0), col="PTB Ratio")
_L_FIN_LEV = _Lens(
    "financialLeverage", "Financial Leverage (Assets/Equity)", "x",
    "Each company's Total Assets ÷ Equity, market-cap-weighted. The bank business-model proxy — spread lenders run 8-15x; it is the lever that turns thin NIMs into double-digit ROE.",
    (0.0, 40.0), fn=_lens_fin_leverage)
_L_SUST_G = _Lens(
    "sustainableGrowth", "Sustainable Growth g", "%",
    "Each company's retention ratio × ROE, market-cap-weighted (Damodaran Ch.21). Given the regulatory focus on capital, retained earnings determine how fast a financial firm can expand.",
    (-50.0, 50.0), fn=_lens_sustainable_g)
_L_PFFO = _Lens(
    "priceToFfo", "P / FFO", "x",
    "Each company's Market Cap ÷ FFO (Net Income + D&A, positive-FFO companies only), market-cap-weighted. The REIT-standard earnings multiple — P/E is distorted by property depreciation. Proxy: true FFO also excludes property-sale gains, which the dataset cannot isolate.",
    (0.0, 60.0), fn=_lens_pffo)
_L_CAP_RATE = _Lens(
    "impliedCapRate", "Implied Cap Rate (EBITDA/EV)", "%",
    "Each company's EBITDA ÷ Enterprise Value, market-cap-weighted. A crude NOI-on-value proxy — higher = the market prices the property income stream more cheaply.",
    (0.0, 20.0), fn=_lens_cap_rate, cols=("Enterprise Value", "EBITDA"))
_L_NORM_EBITDA = _Lens(
    "normEbitdaMargin", "Normalized EBITDA Margin (5y avg)", "%",
    "Each company's average EBITDA margin across its available years in the 5-year window, market-cap-weighted. Through-cycle profitability for cyclicals (Damodaran Ch.22) — read against the current-year margin to judge where the cycle sits.",
    (-100.0, 100.0), fn=_lens_norm_ebitda_margin, cols=("EBITDA Ratio",))
_L_RUNWAY = _Lens(
    "cashRunway", "Cash Runway (cash burners)", "yrs",
    "Each company's cash & short-term investments ÷ annual cash burn, market-cap-weighted across cash-burning companies (negative operating cash flow) ONLY — blank when the industry has no burners. Years before the average burner must raise capital.",
    (0.0, 20.0), fn=_lens_cash_runway, cols=("Cash And Short Term Investments",))

_LENS_ENERGY_MATERIALS: tuple[_Lens, ...] = (
    _L_EV_EBITDA, _L_EBITDA_M, _L_CAPEX_REV, _L_ND_EBITDA, _L_FCF_YIELD, _L_NORM_EBITDA,
)

# sector → lens metrics appended to the base matrix for that sector's
# industry comparison. Keys double as the endpoint's known-sector whitelist.
_SECTOR_LENS: dict[str, tuple[_Lens, ...]] = {
    "Financial Services": (_L_PTB, _L_FIN_LEV, _L_SUST_G, _L_DIV_YIELD, _L_PAYOUT),
    "Real Estate": (_L_PFFO, _L_CAP_RATE, _L_EV_EBITDA, _L_ND_EBITDA, _L_INT_COV, _L_DIV_YIELD, _L_PAYOUT),
    "Energy": _LENS_ENERGY_MATERIALS,
    "Basic Materials": _LENS_ENERGY_MATERIALS,
    "Technology": (_L_GROSS, _L_RD_REV, _L_SBC_REV, _L_EV_SALES, _L_RULE40, _L_FCF_MARGIN, _L_PEG),
    "Communication Services": (_L_EV_EBITDA, _L_EBITDA_M, _L_ND_EBITDA, _L_CAPEX_REV, _L_DIV_YIELD, _L_PAYOUT),
    "Consumer Cyclical": (_L_GROSS, _L_INV_TURNS, _L_DIO, _L_CCC),
    "Consumer Defensive": (_L_GROSS, _L_INV_TURNS, _L_CCC, _L_DIV_YIELD, _L_PAYOUT, _L_FCF_YIELD),
    "Industrials": (_L_INC_Q, _L_FCF_MARGIN, _L_CAPEX_REV, _L_CCC, _L_ND_EBITDA, _L_INT_COV),
    "Healthcare": (_L_RD_REV, _L_GROSS, _L_EV_SALES, _L_RUNWAY),
    "Utilities": (_L_DIV_YIELD, _L_PAYOUT, _L_EV_EBITDA, _L_ND_EBITDA, _L_INT_COV),
}


def _lens_company_metrics(sector: str, latest: Any, prior: Any, rows_desc: list[Any]) -> dict[str, float | None]:
    """Evaluate the sector's lens metrics for one company."""
    out: dict[str, float | None] = {}
    for lens in _SECTOR_LENS[sector]:
        if lens.fn is not None:
            out[lens.key] = lens.fn(latest, prior, rows_desc)
        else:
            v = _sf(latest, lens.col)
            out[lens.key] = v * lens.scale if v is not None else None
    return out


def _lens_extra_columns(sector: str) -> list[str]:
    """Financials columns the sector's lens needs beyond _SECTOR_NEEDED_COLS."""
    extra: list[str] = []
    for lens in _SECTOR_LENS[sector]:
        for c in ((lens.col,) if lens.col else ()) + lens.cols:
            if c not in _SECTOR_NEEDED_COLS and c not in extra:
                extra.append(c)
    return extra


def _aggregate_weighted_columns(
    by_group: dict[str, list[dict[str, float | None]]],
    years: dict[str, list[int]],
    mc_total: dict[str, float],
    metric_keys: list[str],
    clip: dict[str, tuple[float, float]],
) -> dict[str, dict[str, Any]]:
    """Market-cap-weighted, winsorised aggregation of per-company metrics into
    one column per group (a sector, or an industry within a sector)."""
    import math

    data: dict[str, dict[str, Any]] = {}
    for g, comps in by_group.items():
        col: dict[str, Any] = {}
        for key in metric_keys:
            lo_hi = clip.get(key)
            num = 0.0
            den = 0.0
            for c in comps:
                v = c.get(key)
                mc = c.get("_mc")
                # The same (0, $100T) bound the callers gate on, repeated here so
                # the weighting function is safe on its own: a corrupt cap that
                # reached this loop would dominate the group's whole column.
                if (v is None or mc is None or mc <= 0
                        or mc >= MAX_MARKET_CAP_USD or not math.isfinite(v)):
                    continue
                if lo_hi is not None:
                    v = max(lo_hi[0], min(lo_hi[1], v))
                num += v * mc
                den += mc
            col[key] = (num / den) if den > 0 else None
        # Derive additive spreads from their (already winsorised + weighted)
        # components so the displayed numbers reconcile: Excess Return = ROE − Ke.
        # Independently clipping the spread breaks the subtraction (e.g. a 152% ROE
        # and 142% excess both clip to 100, so 100 − Ke no longer equals 100).
        if "excessReturnEquity" in col:
            roe_v, ke_v = col.get("roeEquity"), col.get("costOfEquity")
            if roe_v is not None and ke_v is not None:
                col["excessReturnEquity"] = roe_v - ke_v
        # Same reconciliation for the ROIC − WACC spread: derive it from the
        # already-winsorised + weighted ROIC and WACC, not an independent average.
        if "roicWaccSpread" in col:
            roic_v, wacc_v = col.get("roic"), col.get("wacc")
            if roic_v is not None and wacc_v is not None:
                col["roicWaccSpread"] = roic_v - wacc_v
        ylist = sorted(years.get(g, []))
        col["_companies"] = len(comps)
        col["_year"] = ylist[len(ylist) // 2] if ylist else MAX_YEAR
        col["_marketCap"] = mc_total.get(g, 0.0)
        data[g] = col
    return data


# Sectors judged on the equity lens (ROE − Ke): ROIC/WACC/EVA are undefined
# there, and group_scoring swaps both its weight profile and its integrity
# reads accordingly.
_EQUITY_LENS_SECTORS = {"Financial Services", "Real Estate"}


def _per_year_columns(
    raw_tickers: dict[str, list[Any]],
    group: str,
    metric_keys: list[str],
    clip: dict[str, tuple[float, float]],
) -> dict[int, dict[str, Any]]:
    """{year: aggregated column} for one group — each year re-run through the
    SAME per-company → winsorised → market-cap-weighted pipeline as the
    displayed cell, so the clicked-cell chart and the cell agree on methodology.

    The per-year weight is that year's own market cap converted at THAT year's
    FX rate, and the roster is whoever existed in that year — including
    companies that have since delisted. That is the point: a 2016 average
    should contain the companies that were large in 2016."""
    per_year: dict[int, list[dict[str, float | None]]] = {}
    for _tk, rs in raw_tickers.items():
        by_yr = {int(r["yr"]): r for r in rs}
        for y, row in by_yr.items():
            cm = _company_metrics(row, by_yr.get(y - 1))
            mc = cm.get("_mc")
            if not _usable_mc_weight(mc):
                continue
            per_year.setdefault(y, []).append(cm)

    cols: dict[int, dict[str, Any]] = {}
    for y in sorted(per_year):
        comps = per_year[y]
        if len(comps) < MIN_TICKERS_PER_GROUP_YEAR:
            continue
        cols[y] = _aggregate_weighted_columns(
            {group: comps}, {group: [y] * len(comps)},
            {group: sum(c.get("_mc") or 0.0 for c in comps)},
            metric_keys, clip,
        )[group]
    return cols


def _history_from_columns(
    cols_by_year: dict[int, dict[str, Any]],
    metric_keys: list[str],
) -> dict[str, list[dict[str, Any]]]:
    """{metricKey: [{period, value}]} from per-year aggregated columns."""
    hist: dict[str, list[dict[str, Any]]] = {}
    for y in sorted(cols_by_year):
        col = cols_by_year[y]
        for k in metric_keys:
            v = col.get(k)
            if v is not None:
                hist.setdefault(k, []).append({"period": str(y), "value": v})
    # A one-point "history" charts as a single bar — not worth the click.
    return {k: pts for k, pts in hist.items() if len(pts) >= 2}


def _per_year_history(
    raw_tickers: dict[str, list[Any]],
    group: str,
    metric_keys: list[str],
    clip: dict[str, tuple[float, float]],
) -> dict[str, list[dict[str, Any]]]:
    """{metricKey: [{period, value}]} for one group (see _per_year_columns)."""
    return _history_from_columns(
        _per_year_columns(raw_tickers, group, metric_keys, clip), metric_keys)


def _augment_matrix_scoring(
    data: dict[str, dict[str, Any]],
    raw_by_group: dict[str, dict[str, list[Any]]],
    comps_by_group: dict[str, list[dict[str, float | None]]],
    metric_keys: list[str],
    clip: dict[str, tuple[float, float]],
    *,
    group_col: str,
    sector: str | None = None,
) -> None:
    """Additive scorecard fields on an aggregated matrix: per-group `_history`
    (5-year click-through series), `valueScore` / `scoreRank` (group_scoring
    engine — sector-profile-aware), and `_integrity` (the sixteen scorecard
    questions). Failure-isolated: any error leaves the matrix untouched."""
    if not GROUP_SCORING_OK or group_scoring is None:
        return
    try:
        cols_by_group_year: dict[str, dict[int, dict[str, Any]]] = {}
        for g, tickers in raw_by_group.items():
            col = data.get(g)
            if col is None:
                continue  # pruned (e.g. tiny industry) — nothing to augment
            cols_by_group_year[g] = _per_year_columns(tickers, g, metric_keys, clip)
            col["_history"] = _history_from_columns(cols_by_group_year[g], metric_keys)

        if sector is not None:
            scores = group_scoring.score_groups(data, sector=sector)
        else:
            scores = group_scoring.score_groups(
                data, sector_by_group={g: g for g in data})
        ranks = group_scoring.rank_groups(scores)
        for g, col in data.items():
            col["valueScore"] = scores.get(g)
            col["scoreRank"] = ranks.get(g)

        # ── Value Score history ──────────────────────────────────────────────
        # The score is peer-relative (0.70 level + 0.30 percentile against the
        # other groups), so a per-year score needs that year's WHOLE
        # cross-section — it cannot be computed one group at a time. Re-run the
        # same engine on each year's columns, so the chart and the cell are the
        # same number by construction.
        year_scores: dict[str, list[dict[str, Any]]] = {}
        all_years = sorted({y for c in cols_by_group_year.values() for y in c})
        for y in all_years:
            year_cols = {g: c[y] for g, c in cols_by_group_year.items() if y in c}
            if len(year_cols) < 2:
                continue  # a percentile against one peer is meaningless
            if sector is not None:
                ys = group_scoring.score_groups(year_cols, sector=sector)
            else:
                ys = group_scoring.score_groups(
                    year_cols, sector_by_group={g: g for g in year_cols})
            for g, sc in (ys or {}).items():
                if sc is not None:
                    year_scores.setdefault(g, []).append(
                        {"period": str(y), "value": sc})
        for g, pts in year_scores.items():
            if len(pts) >= 2 and data.get(g) is not None:
                data[g].setdefault("_history", {})["valueScore"] = pts

        inputs = _integrity_inputs(group_col)
        peers = {g: inputs[g] for g in data if g in inputs}
        for g, col in data.items():
            gi = inputs.get(g)
            if not gi:
                continue
            col["_integrity"] = group_scoring.build_group_integrity(
                g, gi,
                peers_by_year=peers,
                comps=comps_by_group.get(g),
                matrix_col=col,
                clip=clip,
                equity_lens=(sector or g) in _EQUITY_LENS_SECTORS,
            )
    except Exception as exc:  # noqa: BLE001
        log.warning("[api] scorecard scoring augment failed (%s): %s", group_col, exc)


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _sector_current_metrics() -> dict[str, Any]:
    sel = ", ".join(f'f."{c}"' for c in _SECTOR_NEEDED_COLS)
    sql = (
        f"SELECT f.Ticker, t.sector AS sec, {_cb_beta('t')}, "
        'CAST(f."Calendar Year" AS INTEGER) AS yr, ' + sel +
        " FROM financials f JOIN tickers t ON t.ticker = f.Ticker"
        " LEFT JOIN security_map s ON s.symbol = f.Ticker" + _cb_join() +
        f" WHERE {named_group_sql('t.sector')} AND COALESCE(s.is_primary, 1) = 1"
        " AND f.\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"
        " AND CAST(f.\"Calendar Year\" AS INTEGER) >= ? AND f.\"Market Cap\" > 0"
    )
    window_start = SCORECARD_HISTORY_START
    with db_conn() as conn:
        rows = conn.execute(sql, (window_start,)).fetchall()

    # Group plausible rows by ticker so each company gets its latest year (+ the
    # prior year for operating leverage).
    by_ticker: dict[str, list[Any]] = {}
    for r in rows:
        if not _sector_row_plausible(r):
            continue
        by_ticker.setdefault(r["Ticker"], []).append(r)

    metric_keys = [m[0] for m in _SECTOR_METRIC_DEFS]
    by_sector: dict[str, list[dict[str, float | None]]] = {}
    raw_by_sector: dict[str, dict[str, list[Any]]] = {}
    years: dict[str, list[int]] = {}
    mc_total: dict[str, float] = {}
    for _tk, rs in by_ticker.items():
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        # HISTORY roster: every company with rows in the window, including ones
        # that have since delisted. They belong in the years they existed — that
        # is the survivorship correction the charts exist to show.
        raw_by_sector.setdefault(rs[0]["sec"], {})[_tk] = rs

        # CURRENT column: only companies that have actually filed recently, so a
        # dead or dormant company cannot supply "latest" values to today's cell.
        if int(rs[0]["yr"]) < _CURRENT_MIN_YEAR:
            continue
        latest = _latest_or_ttm(rs, _tk)
        prior = rs[1] if len(rs) > 1 else None
        cm = _company_metrics(latest, prior)
        # Floor on the USD-converted cap so $100M means the same in every currency;
        # this also drops filers whose currency has no FX rate (cap → None).
        mc = cm.get("_mc")
        if not _usable_mc_weight(mc):
            continue
        s = latest["sec"]
        by_sector.setdefault(s, []).append(cm)
        years.setdefault(s, []).append(int(latest["yr"]))
        mc_total[s] = mc_total.get(s, 0.0) + mc

    data = _aggregate_weighted_columns(by_sector, years, mc_total, metric_keys, _SECTOR_CLIP)
    _augment_matrix_scoring(data, raw_by_sector, by_sector, metric_keys, _SECTOR_CLIP,
                            group_col="sector")

    sectors = sorted(data.keys(), key=lambda s: data[s].get("_marketCap", 0.0), reverse=True)
    return {
        "asOf": datetime.date.today().isoformat(),
        "universe": f"All filers · market cap ≥ ${_AVG_MC_FLOOR_USD / 1e6:.0f}M (USD-equivalent) · per-company metrics, market-cap-weighted · most recent fiscal year",
        "metrics": _base_metric_dicts_with_score(),
        "sectors": sectors,
        "data": data,
    }


@app.get("/api/sector-metrics")
@cached(ttl_seconds=30 * 60, key_prefix="db")
def sector_metrics_endpoint() -> dict[str, Any]:
    return _sector_current_metrics()


# ── /api/sector/{sector}/industry-metrics ─ industries-within-a-sector matrix ─
# The sector scorecard, one level down: the same per-company → market-cap-
# weighted pipeline, grouped by industry WITHIN one sector, plus that sector's
# lens metrics appended. Industry names ride in the `sectors` field so the
# frontend reuses SectorMetricsData / SectorMetricsTable unchanged.

@cached(ttl_seconds=30 * 60, key_prefix="db")
def _industry_metrics_for_sector(sector: str) -> dict[str, Any]:
    lens = _SECTOR_LENS[sector]
    cols = _SECTOR_NEEDED_COLS + _lens_extra_columns(sector)
    sel = ", ".join(f'f."{c}"' for c in cols)
    sql = (
        f"SELECT f.Ticker, t.sector AS sec, t.industry AS ind, {_cb_beta('t')}, t.peg AS peg, "
        'CAST(f."Calendar Year" AS INTEGER) AS yr, ' + sel +
        " FROM financials f JOIN tickers t ON t.ticker = f.Ticker"
        " LEFT JOIN security_map s ON s.symbol = f.Ticker" + _cb_join() +
        f" WHERE t.sector = ? AND {named_group_sql('t.industry')} AND COALESCE(s.is_primary, 1) = 1"
        " AND f.\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"
        " AND CAST(f.\"Calendar Year\" AS INTEGER) >= ? AND f.\"Market Cap\" > 0"
    )
    window_start = SCORECARD_HISTORY_START
    with db_conn() as conn:
        rows = conn.execute(sql, (sector, window_start)).fetchall()

    by_ticker: dict[str, list[Any]] = {}
    for r in rows:
        if not _sector_row_plausible(r):
            continue
        by_ticker.setdefault(r["Ticker"], []).append(r)

    metric_keys = [m[0] for m in _SECTOR_METRIC_DEFS] + [ln.key for ln in lens]
    clip = {**_SECTOR_CLIP, **{ln.key: ln.clip for ln in lens if ln.clip is not None}}

    by_industry: dict[str, list[dict[str, float | None]]] = {}
    raw_by_industry: dict[str, dict[str, list[Any]]] = {}
    years: dict[str, list[int]] = {}
    mc_total: dict[str, float] = {}
    for _tk, rs in by_ticker.items():
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        # History roster keeps delisted companies (see _sector_current_metrics).
        raw_by_industry.setdefault(rs[0]["ind"], {})[_tk] = rs

        if int(rs[0]["yr"]) < _CURRENT_MIN_YEAR:
            continue  # stale filer: history only, never the current column
        latest = _latest_or_ttm(rs, _tk)
        prior = rs[1] if len(rs) > 1 else None
        cm = _company_metrics(latest, prior)
        # Currency-neutral $100M floor on the FX-converted cap (drops no-FX filers).
        mc = cm.get("_mc")
        if not _usable_mc_weight(mc):
            continue
        cm.update(_lens_company_metrics(sector, latest, prior, rs))
        ind = latest["ind"]
        by_industry.setdefault(ind, []).append(cm)
        years.setdefault(ind, []).append(int(latest["yr"]))
        mc_total[ind] = mc_total.get(ind, 0.0) + mc

    data = _aggregate_weighted_columns(by_industry, years, mc_total, metric_keys, clip)

    # Drop tiny industries — a 1-2 company "aggregate" is just that company.
    dropped = sorted(
        (n for n, c in data.items() if c["_companies"] < MIN_TICKERS_PER_GROUP_YEAR),
        key=lambda n: data[n]["_marketCap"],
        reverse=True,
    )
    for n in dropped:
        del data[n]
    if not data:
        raise HTTPException(
            404, f"No industries with ≥{MIN_TICKERS_PER_GROUP_YEAR} companies in sector '{sector}'"
        )

    # Additive scorecard fields — industries ranked against their siblings
    # under the parent sector's weight profile (history keys stay the base
    # matrix set; lens metrics remain latest-year only).
    _augment_matrix_scoring(data, raw_by_industry, by_industry, metric_keys, clip,
                            group_col="industry", sector=sector)

    industries = sorted(data.keys(), key=lambda n: data[n].get("_marketCap", 0.0), reverse=True)
    return {
        "asOf": datetime.date.today().isoformat(),
        "universe": (
            f"All filers · market cap ≥ ${_AVG_MC_FLOOR_USD / 1e6:.0f}M (USD-equivalent) · {sector} industries with "
            f"≥{MIN_TICKERS_PER_GROUP_YEAR} companies · per-company metrics, market-cap-weighted · "
            "most recent fiscal year"
        ),
        "metrics": (
            _base_metric_dicts_with_score()
            + [
                {"key": ln.key, "label": ln.label, "unit": ln.unit,
                 "group": f"{sector} lens", "definition": ln.definition}
                for ln in lens
            ]
        ),
        "sectors": industries,
        "data": data,
        "sector": sector,
        "dropped": dropped,
    }


@app.get("/api/sector/{sector}/industry-metrics")
def sector_industry_metrics_endpoint(sector: str = PathParam(pattern=GROUP_PATTERN)) -> dict[str, Any]:
    decoded = urllib.parse.unquote(sector)
    if decoded not in _SECTOR_LENS:
        match = next((k for k in _SECTOR_LENS if k.lower() == decoded.lower()), None)
        if match is None:
            raise HTTPException(404, f"Unknown sector '{decoded}'")
        decoded = match
    return _industry_metrics_for_sector(decoded)


# ── /api/industry/{industry}/scorecard ─ one industry as a single column ───────
# The same per-company → market-cap-weighted pipeline as the industries-within-a-
# sector matrix, but collapsed to ONE column (this industry's aggregate), so the
# industry detail page can show the exact same scorecard metric set the sector
# page uses to compare industries. Reuses SectorMetricsPanel on the frontend.

@cached(ttl_seconds=30 * 60, key_prefix="db")
def _industry_scorecard(industry: str) -> dict[str, Any]:
    with db_conn() as conn:
        sec_row = conn.execute(
            "SELECT sector, COUNT(*) AS n FROM tickers"
            f" WHERE industry = ? AND {named_group_sql('sector')}"
            " GROUP BY sector ORDER BY n DESC LIMIT 1",
            (industry,),
        ).fetchone()
        sector = sec_row["sector"] if sec_row else None
        lens = _SECTOR_LENS.get(sector, ()) if sector else ()
        cols = _SECTOR_NEEDED_COLS + (_lens_extra_columns(sector) if lens else [])
        sel = ", ".join(f'f."{c}"' for c in cols)
        sql = (
            f"SELECT f.Ticker, t.sector AS sec, {_cb_beta('t')}, t.peg AS peg, "
            'CAST(f."Calendar Year" AS INTEGER) AS yr, ' + sel +
            " FROM financials f JOIN tickers t ON t.ticker = f.Ticker" + _cb_join() +
            " WHERE t.industry = ?"
            " AND f.\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"
            " AND CAST(f.\"Calendar Year\" AS INTEGER) >= ? AND f.\"Market Cap\" > 0"
        )
        window_start = SCORECARD_HISTORY_START
        rows = conn.execute(sql, (industry, window_start)).fetchall()

    by_ticker: dict[str, list[Any]] = {}
    for r in rows:
        if not _sector_row_plausible(r):
            continue
        by_ticker.setdefault(r["Ticker"], []).append(r)
    if not by_ticker:
        raise HTTPException(404, f"No companies for industry '{industry}'")

    metric_keys = [m[0] for m in _SECTOR_METRIC_DEFS] + [ln.key for ln in lens]
    clip = {**_SECTOR_CLIP, **{ln.key: ln.clip for ln in lens if ln.clip is not None}}
    comps: list[dict[str, float | None]] = []
    years: list[int] = []
    mc_total = 0.0
    for _tk, rs in by_ticker.items():
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        if int(rs[0]["yr"]) < _CURRENT_MIN_YEAR:
            continue  # stale filer: contributes to _history only, not the cell
        latest = _latest_or_ttm(rs, _tk)
        prior = rs[1] if len(rs) > 1 else None
        cm = _company_metrics(latest, prior)
        # Currency-neutral $100M floor on the FX-converted cap (drops no-FX filers).
        mc = cm.get("_mc")
        if not _usable_mc_weight(mc):
            continue
        if lens:
            cm.update(_lens_company_metrics(sector, latest, prior, rs))
        comps.append(cm)
        years.append(int(latest["yr"]))
        mc_total += mc
    if not comps:
        raise HTTPException(404, f"No companies for industry '{industry}'")

    data = _aggregate_weighted_columns(
        {industry: comps}, {industry: years}, {industry: mc_total}, metric_keys, clip
    )

    # Additive scorecard fields. History comes from this industry's own rows
    # (same methodology as the cell); the score/rank/integrity are COPIED from
    # the sibling matrix (cache hit) so this page and the sector page's
    # industry table always tell the same story. An industry pruned from the
    # sibling matrix (<3 companies) simply ships without a score.
    score_peers: int | None = None
    if GROUP_SCORING_OK and group_scoring is not None:
        try:
            col = data[industry]
            col["_history"] = _per_year_history(by_ticker, industry, metric_keys, clip)
            if sector:
                sib = _industry_metrics_for_sector(sector)
                sc = (sib.get("data") or {}).get(industry)
                if sc:
                    col["valueScore"] = sc.get("valueScore")
                    col["scoreRank"] = sc.get("scoreRank")
                    col["_integrity"] = sc.get("_integrity")
                    # The score is peer-relative, so its history can only be
                    # computed with the whole sector cross-section. Copy it from
                    # the sibling matrix rather than recomputing a lone-group
                    # score that would disagree with the displayed cell.
                    sib_vs = (sc.get("_history") or {}).get("valueScore")
                    if sib_vs:
                        col["_history"]["valueScore"] = sib_vs
                score_peers = len(sib.get("sectors") or [])
        except Exception as exc:  # noqa: BLE001
            log.warning("[api] industry scorecard scoring augment failed (%s): %s",
                        industry, exc)

    return {
        "asOf": datetime.date.today().isoformat(),
        "universe": (
            f"All filers · market cap ≥ ${_AVG_MC_FLOOR_USD / 1e6:.0f}M (USD-equivalent) · all {len(comps)} "
            f"companies in {industry} · per-company metrics, market-cap-weighted · most recent fiscal year"
        ),
        "scorePeers": score_peers,
        "metrics": (
            _base_metric_dicts_with_score()
            + [
                {"key": ln.key, "label": ln.label, "unit": ln.unit,
                 "group": f"{sector} lens", "definition": ln.definition}
                for ln in lens
            ]
        ),
        "sectors": [industry],
        "data": data,
        "sector": sector,
    }


@app.get("/api/industry/{industry}/scorecard")
# 30, not 10: the industry page fetches this once and the cross-stage AI block
# gathers it again under the same client cache key, so a reader walking a few
# industries inside one minute was hitting the limit on a route that is cached
# server side anyway (finding M2).
@limiter.limit("30/minute")
def industry_scorecard_endpoint(request: Request, industry: str = PathParam(pattern=GROUP_PATTERN)) -> dict[str, Any]:
    return _industry_scorecard(urllib.parse.unquote(industry))


def _beta_history(conn: sqlite3.Connection, tickers: list[str]) -> dict[str, dict[int, float]]:
    """{ticker: {year: beta}} from the precomputed beta_history table (empty if
    the table has not been built yet — see data/compute_beta_history.py)."""
    out: dict[str, dict[int, float]] = {}
    if not tickers:
        return out
    ph = ",".join("?" for _ in tickers)
    try:
        rows = conn.execute(
            f"SELECT ticker, year, beta FROM beta_history WHERE ticker IN ({ph})", tickers
        ).fetchall()
    except sqlite3.OperationalError:
        return out
    for r in rows:
        if r["beta"] is not None:
            out.setdefault(r["ticker"], {})[int(r["year"])] = float(r["beta"])
    return out


# ── /api/comparative/{industry}/company-metrics ─ per-company scorecard matrix ─
# The scorecard one more level down: columns are the industry's top companies
# (by market cap), rows are the base scorecard metrics plus the parent sector's
# lens — each value is the company's OWN number (no weighting, and no
# winsorisation: clipping protects a weighted mean, but here each column IS a
# single company, so the true value is shown). Ticker names ride in the
# `sectors` field so the frontend reuses SectorMetricsData / SectorMetricsTable.

@cached(ttl_seconds=30 * 60, key_prefix="db")
def _company_metrics_for_industry(industry: str, limit: int) -> dict[str, Any]:
    window_start = MAX_YEAR - 4
    with db_conn() as conn:
        # The industry's dominant sector picks the lens (same convention as
        # /api/industries for industries that span more than one sector).
        sec_row = conn.execute(
            "SELECT sector, COUNT(*) AS n FROM tickers"
            f" WHERE industry = ? AND {named_group_sql('sector')}"
            " GROUP BY sector ORDER BY n DESC LIMIT 1",
            (industry,),
        ).fetchone()
        sector = sec_row["sector"] if sec_row else None
        lens = _SECTOR_LENS.get(sector, ()) if sector else ()

        # Top companies by their LATEST-year market cap (SQLite's bare-column-
        # with-MAX picks the row of the max year), not the 5y max — a stale or
        # corrupt old-year cap must not outrank today's leaders. USD filers
        # only — foreign filers carry local-currency magnitudes that would both
        # crowd out the real top names and be dropped by the USD filter below
        # anyway. A NULL Reported Currency counts as USD (US OTC filers; same
        # contract as _FX_WEIGHT_SQL / _FX_SPOT_MC_SQL). Preferred-share series
        # (e.g. SPG-PJ) are excluded so a company can't appear twice.
        top_rows = conn.execute(
            """
            SELECT f.Ticker, f."Market Cap" AS mc,
                   MAX(CAST(f."Calendar Year" AS INTEGER)) AS yr
            FROM financials f JOIN tickers t ON t.ticker = f.Ticker
            LEFT JOIN security_map s ON s.symbol = f.Ticker
            WHERE t.industry = ?
              AND COALESCE(s.is_primary, 1) = 1
              AND COALESCE(f."Reported Currency", 'USD') = 'USD'
              AND f.Ticker NOT GLOB '*-P[A-Z]'
              AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
              AND CAST(f."Calendar Year" AS INTEGER) >= ?
            GROUP BY f.Ticker HAVING mc IS NOT NULL
            ORDER BY mc DESC LIMIT ?
            """,
            (industry, window_start, limit),
        ).fetchall()
        if not top_rows:
            raise HTTPException(404, f"No companies for industry '{industry}'")
        tickers = [r["Ticker"] for r in top_rows]

        cols = _SECTOR_NEEDED_COLS + (_lens_extra_columns(sector) if lens else [])
        sel = ", ".join(f'f."{c}"' for c in cols)
        placeholders = ",".join("?" for _ in tickers)
        sql = (
            f"SELECT f.Ticker, t.sector AS sec, {_cb_beta('t')}, t.peg AS peg, "
            'CAST(f."Calendar Year" AS INTEGER) AS yr, ' + sel +
            " FROM financials f JOIN tickers t ON t.ticker = f.Ticker" + _cb_join() +
            f" WHERE f.Ticker IN ({placeholders})"
            " AND COALESCE(f.\"Reported Currency\", 'USD') = 'USD'"
            " AND f.\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"
            " AND CAST(f.\"Calendar Year\" AS INTEGER) >= ?"
        )
        rows = conn.execute(sql, (*tickers, MIN_YEAR)).fetchall()
        beta_hist_all = _beta_history(conn, tickers)

    by_ticker: dict[str, list[Any]] = {}
    for r in rows:
        if not _sector_row_plausible(r):
            continue
        by_ticker.setdefault(r["Ticker"], []).append(r)

    data: dict[str, dict[str, Any]] = {}
    for tk in tickers:  # preserve market-cap order
        rs = by_ticker.get(tk)
        if not rs:
            continue
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = _latest_or_ttm(rs, tk)
        prior = rs[1] if len(rs) > 1 else None
        # Most-recent market cap: yfinance first (this bounded top-N set is small
        # enough to quote live), the stored filing-date cap as fallback. Only the
        # latest row is overridden — the per-year history below keeps each year's
        # own stored cap. The quote is converted into the row's reporting
        # currency first; an unresolvable pair keeps the stored cap.
        live_cap = _live_cap_in_row_currency(tk, latest)
        latest_eff = _RowWithMarketCap(latest, live_cap) if live_cap is not None else latest
        cm = _company_metrics(latest_eff, prior)
        if lens:
            cm.update(_lens_company_metrics(sector, latest_eff, prior, rs))
        mc = cm.pop("_mc", None)
        col: dict[str, Any] = dict(cm)
        col["marketCap"] = mc
        col["beta"] = _sf(latest, "beta")
        col["_companies"] = 1
        col["_year"] = int(latest["yr"])
        col["_marketCap"] = mc or 0.0

        # Per-metric year-by-year history so a comparative-matrix cell click can
        # show THIS company's trend. Base metrics come from re-running
        # _company_metrics per year; beta from the precomputed beta_history.
        asc = list(reversed(rs))
        hist: dict[str, list[dict[str, Any]]] = {}
        for j, row in enumerate(asc):
            prev = asc[j - 1] if j > 0 else None
            ym = _company_metrics(row, prev)
            yr = str(int(row["yr"]))
            for k, v in ym.items():
                if v is None:
                    continue
                key = "marketCap" if k == "_mc" else k
                hist.setdefault(key, []).append({"period": yr, "value": v})
        bh = beta_hist_all.get(tk)
        if bh:
            hist["beta"] = [{"period": str(y), "value": bh[y]} for y in sorted(bh)]
        col["_history"] = hist
        data[tk] = col
    if not data:
        raise HTTPException(404, f"No usable financials for industry '{industry}'")

    return {
        "asOf": datetime.date.today().isoformat(),
        "universe": (
            f"Top {len(data)} companies in {industry} by market cap · each column is one company's "
            "own most-recent-fiscal-year values (unweighted, unclipped) · click any value for its history"
        ),
        "metrics": (
            [
                {"key": "marketCap", "label": "Market Cap", "unit": "$", "group": "Company",
                 "definition": "Total market value of the company's shares (price times shares "
                               "outstanding) at the most recent fiscal year. The company's current size."},
                {"key": "beta", "label": "Beta", "unit": "b", "group": "Company",
                 "definition": "Sensitivity of the stock to the overall market (S&P 500), from a "
                               "regression of monthly returns. 1.0 moves with the market; above 1 is "
                               "more volatile, below 1 less. Click for the rolling-beta history."},
            ]
            + [
                {"key": k, "label": lbl, "unit": u, "group": grp, "definition": d}
                for (k, lbl, u, grp, d) in _SECTOR_METRIC_DEFS
            ]
            + [
                {"key": ln.key, "label": ln.label, "unit": ln.unit,
                 "group": f"{sector} lens", "definition": ln.definition}
                for ln in lens
            ]
        ),
        "sectors": [tk for tk in tickers if tk in data],
        "data": data,
        "sector": sector,
    }


@app.get("/api/comparative/{industry}/company-metrics")
@limiter.limit("30/minute")
def comparative_company_metrics_endpoint(
    request: Request,
    industry: str = PathParam(pattern=GROUP_PATTERN),
    limit: int = Query(default=8, ge=2, le=20),
) -> dict[str, Any]:
    return _company_metrics_for_industry(urllib.parse.unquote(industry), limit)


# ── /api/industry/{industry}/strategic-groups ─ Porter's strategic-group map ──
# Clusters the industry's largest companies into strategic groups on the two
# axes Porter's framework cares most about (profitability of the position and
# scale), split at the peer medians. Deterministic by construction: no random
# seeds, the same peers always land in the same quadrant. Leverage and growth
# arrive as badges rather than extra cluster dimensions, so the map stays
# readable while the story ("a leveraged challenger") survives.

_SG_QUADRANTS = {
    ("high", "high"): ("scale_leaders", "Scale Leaders"),
    ("high", "low"): ("premium_niche", "Premium Niche"),
    ("low", "high"): ("volume_incumbents", "Volume Incumbents"),
    ("low", "low"): ("challengers", "Challengers"),
}


def _median_of(values: list[float]) -> Optional[float]:
    vals = sorted(values)
    if not vals:
        return None
    mid = len(vals) // 2
    return vals[mid] if len(vals) % 2 else (vals[mid - 1] + vals[mid]) / 2.0


def _strategic_groups_from_metrics(cm: dict[str, Any]) -> dict[str, Any]:
    """Pure builder over a SectorMetricsData-shaped company panel."""
    import math

    tickers: list[str] = cm.get("sectors") or []
    data: dict[str, Any] = cm.get("data") or {}

    points: list[dict[str, Any]] = []
    unclassified: list[str] = []
    margins: list[float] = []
    mcaps: list[float] = []
    for tk in tickers:
        row = data.get(tk) or {}
        margin = row.get("operatingMargin")
        mcap = row.get("marketCap")
        if margin is None or mcap is None or mcap <= 0:
            unclassified.append(tk)
            continue
        margins.append(float(margin))
        mcaps.append(float(mcap))
        points.append({
            "ticker": tk,
            "operatingMargin": round(float(margin), 2),
            "marketCapUsd": float(mcap),
            "logMcap": round(math.log10(float(mcap)), 3),
            "leverage": row.get("liabilitiesToEquity"),
            "revenueGrowth": row.get("revenueGrowth"),
        })
    if len(points) < 4:
        return {"applicable": False,
                "reason": "Fewer than four companies carry both an operating margin and a market value, so a group map would not mean much."}

    margin_med = _median_of(margins)
    mcap_med = _median_of(mcaps)
    lev_med = _median_of([float(p["leverage"]) for p in points if p["leverage"] is not None])
    growth_med = _median_of([float(p["revenueGrowth"]) for p in points if p["revenueGrowth"] is not None])

    groups: dict[str, dict[str, Any]] = {}
    for key, label in _SG_QUADRANTS.values():
        groups[key] = {"key": key, "label": label, "members": []}
    for p in points:
        m_side = "high" if p["operatingMargin"] >= margin_med else "low"
        s_side = "high" if p["marketCapUsd"] >= mcap_med else "low"
        key, _ = _SG_QUADRANTS[(m_side, s_side)]
        badges: list[str] = []
        if lev_med is not None and p["leverage"] is not None and float(p["leverage"]) > lev_med:
            badges.append("leveraged")
        if growth_med is not None and p["revenueGrowth"] is not None and float(p["revenueGrowth"]) > growth_med:
            badges.append("fast-growing")
        p["group"] = key
        p["badges"] = badges
        groups[key]["members"].append(p["ticker"])

    return {
        "applicable": True,
        "axes": {
            "marginMedian": round(margin_med, 2),
            "mcapMedianUsd": mcap_med,
            "logMcapMedian": round(math.log10(mcap_med), 3) if mcap_med and mcap_med > 0 else None,
        },
        "points": points,
        "groups": [g for g in groups.values() if g["members"]],
        "unclassified": unclassified,
    }


# How many companies the map may plot. The peer medians that split the quadrants
# are recomputed over whatever set the caller asks for, so widening the set can
# move a company from one group to another. That is correct, not a bug: a strategic
# group is defined relative to the peers you are comparing against, and Porter's own
# advice in Ch.7 is to remap the industry more than one way before trusting it.
SG_LIMITS: tuple[int, ...] = (20, 40, 60, 100)
SG_DEFAULT_LIMIT = 20


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _strategic_groups_for_industry(industry: str, limit: int = SG_DEFAULT_LIMIT) -> dict[str, Any]:
    cm = _company_metrics_for_industry(industry, limit)
    out = _strategic_groups_from_metrics(cm)
    out["industry"] = industry
    out["asOf"] = cm.get("asOf")
    out["limit"] = limit
    # How many the industry could actually supply, so the UI can stop offering a
    # wider set once it is showing everything there is.
    out["available"] = len(cm.get("sectors") or [])
    out["limitOptions"] = list(SG_LIMITS)
    return out


@app.get("/api/industry/{industry}/strategic-groups")
# The company-count control invites several requests in quick succession: a reader
# comparing the map at 20, 40, 60 and 100 spends four of them in a few seconds, and
# Porter's advice to remap an industry more than one way is the whole point of the
# control. The old 6/minute cap made that flow fail silently with stale data on the
# chart. The response is cached for 30 minutes per (industry, limit), so a higher
# cap costs almost nothing.
@limiter.limit("40/minute")
def strategic_groups_endpoint(
    request: Request,
    industry: str = PathParam(pattern=GROUP_PATTERN),
    limit: int = Query(SG_DEFAULT_LIMIT, ge=8, le=100),
) -> dict[str, Any]:
    return _strategic_groups_for_industry(urllib.parse.unquote(industry), limit)


# ── /api/comparative/{industry}/ranking ─ the Per-Ticker Value Ranking ────────
# Shaped exactly like the company scorecard (SectorMetricsData) so it renders with
# the same table component: a leading Rank/Score/MoS/DCF group + every scorecard
# metric column, ranked by the value score, with per-cell history. Region (a
# developed-markets currency allowlist) and a minimum market-cap floor filter the
# ranking only — the scorecard is unchanged.

# Currency is the only reliable region signal in the dataset.
_DEVELOPED_CURRENCIES = (
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD",
    "SEK", "NOK", "DKK", "SGD", "HKD", "ILS",
)

# (key, label, unit, group, definition) — the leaderboard-specific leading columns.
_RANKING_COLS: list[tuple[str, str, str, str, str]] = [
    ("rank", "Rank", "#", "Ranking",
     "Position in the value ranking within the current (filtered) set — 1 is best. Rows are sorted by the value score."),
    ("score", "Value Score", "n", "Ranking",
     "A 0-100 business-quality score. Each weighted fundamental is mapped to an absolute level score "
     "(e.g. a higher ROIC-WACC spread or EVA margin scores higher; a lower P/FCF scores higher) and "
     "blended with a smaller peer-relative tilt, so the score reflects how good the business actually "
     "is — not just how it ranks against this particular set. Metric importance is weighted by sector "
     "(e.g. net interest margin for banks; economic profit — ROIC minus the cost of capital — dominates "
     "everywhere). Companies with negative profitability or negative economic profit are capped so they "
     "cannot rank high. Higher is better. Margin of safety is shown but deliberately not scored."),
    ("marginOfSafety", "Margin of Safety", "%", "Ranking",
     "DCF intrinsic value per share versus the current price, as a percent cushion. Shown for context only — "
     "intentionally NOT part of the value score, because a DCF-derived margin is highly assumption-sensitive."),
    ("dcfIntrinsic", "DCF / share", "$", "Ranking",
     "Discounted-cash-flow intrinsic value per share (FCFF firm model — the same engine as the individual page)."),
]

# Per-share & flow figures shown in the ranking matrix for context — display-only,
# NOT part of the value score. Values come from _company_metrics (read from the
# ranking's f.* query); each gets per-year history for the click-to-chart sidebar.
_PER_SHARE_DEFS: list[tuple[str, str, str, str, str]] = [
    ("revenue", "Revenue", "$", "Cash & per share",
     "Total reported revenue for the most recent fiscal year."),
    ("revenuePerShare", "Revenue / share", "$", "Cash & per share",
     "Revenue divided by diluted shares outstanding."),
    ("eps", "EPS (diluted)", "$", "Cash & per share",
     "Diluted earnings per share for the most recent fiscal year."),
    ("operatingCashFlow", "Operating Cash Flow", "$", "Cash & per share",
     "Cash generated by core operations (before capital expenditure) for the most recent fiscal year."),
    ("ocfPerShare", "OCF / share", "$", "Cash & per share",
     "Operating cash flow divided by diluted shares outstanding."),
    ("freeCashFlow", "Free Cash Flow", "$", "Cash & per share",
     "Operating cash flow minus capital expenditure for the most recent fiscal year."),
    ("fcfPerShare", "FCF / share", "$", "Cash & per share",
     "Free cash flow divided by diluted shares outstanding."),
]


@cached(ttl_seconds=_RANKING_TTL_SECONDS, key_prefix="db")
def _ranking_for_industry(industry: str, developed: bool, min_mcap: float | None) -> dict[str, Any]:
    """Per-Ticker Value Ranking as a SectorMetricsData payload (see header note).

    Cached under the "db" prefix so the daily update drops it; a large industry
    runs a reverse DCF per company (Semiconductors ~20s, Biotechnology ~40s),
    so a repeat view must never redo it. See _warm_large_rankings."""
    window_start = MAX_YEAR - 4
    mc_floor = (min_mcap * 1e9) if (min_mcap is not None and min_mcap > 0) else None
    cur_clause = ""
    cur_params: tuple[Any, ...] = ()
    if developed:
        cur_clause = ' AND f."Reported Currency" IN (%s)' % ",".join("?" * len(_DEVELOPED_CURRENCIES))
        cur_params = _DEVELOPED_CURRENCIES

    with db_conn() as conn:
        sec_row = conn.execute(
            "SELECT sector, COUNT(*) AS n FROM tickers"
            f" WHERE industry = ? AND {named_group_sql('sector')}"
            " GROUP BY sector ORDER BY n DESC LIMIT 1",
            (industry,),
        ).fetchone()
        sector = sec_row["sector"] if sec_row else None
        lens = _SECTOR_LENS.get(sector, ()) if sector else ()

        having = "HAVING mc IS NOT NULL" + (" AND mc >= ?" if mc_floor is not None else "")
        # Rank by USD-converted market cap so a ¥/₩/NT$ company isn't sized against a
        # $ company by raw number. Unknown/garbage currencies have no fx rate → mc is
        # NULL → dropped by `HAVING mc IS NOT NULL` (they can't be size-compared).
        # NULL currency is treated as USD (see _FX_SPOT_MC_SQL), not dropped.
        # mc_floor is already a USD threshold, so it now compares like-for-like too.
        top_sql = (
            f'SELECT f.Ticker, {_FX_SPOT_MC_SQL} AS mc,'
            ' MAX(CAST(f."Calendar Year" AS INTEGER)) AS yr'
            " FROM financials f JOIN tickers t ON t.ticker = f.Ticker"
            ' LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"'
            " LEFT JOIN security_map s ON s.symbol = f.Ticker"
            " WHERE t.industry = ?"
            " AND COALESCE(s.is_primary, 1) = 1"
            " AND f.Ticker NOT GLOB '*-P[A-Z]'"
            " AND f.\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"
            " AND CAST(f.\"Calendar Year\" AS INTEGER) >= ?"
            + cur_clause +
            " GROUP BY f.Ticker " + having +
            " ORDER BY mc DESC"
        )
        top_params: tuple[Any, ...] = (industry, window_start, *cur_params)
        if mc_floor is not None:
            top_params = (*top_params, mc_floor)
        top_rows = conn.execute(top_sql, top_params).fetchall()
        if not top_rows:
            raise HTTPException(404, f"No companies for industry '{industry}' with these filters")
        tickers = [r["Ticker"] for r in top_rows]

        placeholders = ",".join("?" for _ in tickers)
        full_sql = (
            'SELECT f.*, CAST(f."Calendar Year" AS INTEGER) AS yr,'
            f' {_cb_beta("t")}, t.peg AS peg,'
            ' t.name AS t_name, t.sector AS t_sector, t.industry AS t_industry'
            " FROM financials f JOIN tickers t ON t.ticker = f.Ticker" + _cb_join() +
            f" WHERE f.Ticker IN ({placeholders})"
            " AND f.\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"
            " AND CAST(f.\"Calendar Year\" AS INTEGER) >= ?"
            + cur_clause
        )
        rows = conn.execute(full_sql, (*tickers, MIN_YEAR, *cur_params)).fetchall()
        beta_hist_all = _beta_history(conn, tickers)

    by_ticker: dict[str, list[Any]] = {}
    for r in rows:
        if not _sector_row_plausible(r):
            continue
        by_ticker.setdefault(r["Ticker"], []).append(r)

    db = get_db()
    try:
        macro = get_live_wacc_params()
    except Exception as exc:  # noqa: BLE001 — fall back to default WACC inputs
        log.warning("[api] live WACC params failed for ranking %s: %s", industry, exc)
        macro = {"rf": None, "erp": None}

    # Read once for the whole build. The snapshot builder would otherwise open a
    # connection and re-read the same 45-row table for every one of the industry's
    # companies, which measured 535 ms on a 561-company cold build.
    fx_rates = _fx_rates()

    cmdata: dict[str, dict[str, Any]] = {}
    snaps: list[Any] = []
    for tk, rs in by_ticker.items():
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = _latest_or_ttm(rs, tk)
        if _sf(latest, "beta") is None:
            continue  # ranking uses stored betas only — skip a ticker that has none
        prior = rs[1] if len(rs) > 1 else None

        # Scorecard columns + per-year history (identical to the scorecard, but no
        # per-ticker live market-cap fetch — the ranking covers the whole industry).
        cm = _company_metrics(latest, prior)
        if lens:
            cm.update(_lens_company_metrics(sector, latest, prior, rs))
        mc = cm.pop("_mc", None)
        col: dict[str, Any] = dict(cm)
        col["marketCap"] = mc
        col["beta"] = _sf(latest, "beta")
        col["_companies"] = 1
        col["_year"] = int(latest["yr"])
        col["_marketCap"] = mc or 0.0

        asc = list(reversed(rs))
        hist: dict[str, list[dict[str, Any]]] = {}
        for j, row in enumerate(asc):
            prev = asc[j - 1] if j > 0 else None
            ym = _company_metrics(row, prev)
            yr = str(int(row["yr"]))
            for k, v in ym.items():
                if v is None:
                    continue
                key = "marketCap" if k == "_mc" else k
                hist.setdefault(key, []).append({"period": yr, "value": v})
        bh = beta_hist_all.get(tk)
        if bh:
            hist["beta"] = [{"period": str(y), "value": bh[y]} for y in sorted(bh)]
        col["_history"] = hist
        cmdata[tk] = col

        # Value score + DCF/MoS via the shared snapshot builder (DB-only, no live price).
        if db is not None:
            try:
                snap = build_comparative_snapshot(
                    tk, rs, db=db, rf=macro.get("rf"), erp=macro.get("erp"),
                    use_live_price=False, rates=fx_rates,
                )
            except Exception as exc:  # noqa: BLE001 — one bad ticker must not drop the table
                log.warning("[api] ranking snapshot for %s failed: %s", tk, exc)
                snap = None
            if snap is not None and snap.industry:
                snaps.append(snap)

    if not cmdata or not snaps:
        raise HTTPException(404, f"No usable companies for industry '{industry}' with these filters")

    scores = score_industry(snaps)
    # Sort by score descending, breaking ties on ticker ascending so the ranking
    # is deterministic. Without the secondary key, equal-score tickers came back
    # in DB-row order, which can change between runs (e.g. after a VACUUM).
    ranked = sorted(
        (s for s in snaps if s.ticker in cmdata),
        key=lambda s: (-scores.get(s.ticker, 0.0), s.ticker),
    )
    order: list[str] = []
    for i, s in enumerate(ranked, start=1):
        col = cmdata[s.ticker]
        col["rank"] = i
        col["score"] = round(scores.get(s.ticker, 0.0), 2)
        col["marginOfSafety"] = (s.margin_of_safety * 100) if s.margin_of_safety is not None else None
        col["dcfIntrinsic"] = s.dcf_intrinsic
        order.append(s.ticker)

    region = "US + developed markets" if developed else "all markets"
    floor_txt = f" · market cap ≥ ${min_mcap:g}B" if mc_floor is not None else ""
    return {
        "asOf": datetime.date.today().isoformat(),
        "universe": (
            f"{len(order)} companies in {industry} · {region}{floor_txt} · ranked by value score · "
            "each row is one company's own most-recent-fiscal-year values · click any value for its history"
        ),
        "metrics": (
            [{"key": k, "label": lbl, "unit": u, "group": grp, "definition": d}
             for (k, lbl, u, grp, d) in _RANKING_COLS]
            + [
                {"key": "marketCap", "label": "Market Cap", "unit": "$", "group": "Company",
                 "definition": "Total market value of the company's shares (price times shares outstanding) "
                               "at the most recent fiscal year."},
                {"key": "beta", "label": "Beta", "unit": "b", "group": "Company",
                 "definition": "Sensitivity of the stock to the overall market (S&P 500). 1.0 moves with the "
                               "market; above 1 is more volatile, below 1 less."},
            ]
            + [
                {"key": k, "label": lbl, "unit": u, "group": grp, "definition": d}
                for (k, lbl, u, grp, d) in _SECTOR_METRIC_DEFS
            ]
            + [
                {"key": ln.key, "label": ln.label, "unit": ln.unit,
                 "group": f"{sector} lens", "definition": ln.definition}
                for ln in lens
            ]
            + [
                {"key": k, "label": lbl, "unit": u, "group": grp, "definition": d}
                for (k, lbl, u, grp, d) in _PER_SHARE_DEFS
            ]
        ),
        "sectors": order,
        "data": cmdata,
        "sector": sector,
    }


def _without_cell_history(payload: dict[str, Any]) -> dict[str, Any]:
    """The same ranking payload with every cell's per-year ``_history`` dropped.

    A large industry's ranking is dominated by those arrays: Semiconductors is
    561 rows times ~48 metrics, each metric carrying a list of year/value pairs,
    so the full document runs to about ten megabytes while the values the table
    actually prints are a fraction of that. A caller that never opens a cell
    chart (the cross-stage AI block) asks for ``?history=0`` and gets the same
    shape without them.

    Returns a NEW dict: the payload it is handed is the ``@cached`` object that
    every other caller shares, and mutating it would silently delete the
    histories from the cached full form.
    """
    data = payload.get("data")
    if not isinstance(data, dict):
        return payload
    light = {
        ticker: ({k: v for k, v in col.items() if k != "_history"} if isinstance(col, dict) else col)
        for ticker, col in data.items()
    }
    return {**payload, "data": light}


@app.get("/api/comparative/{industry}/ranking")
@limiter.limit("30/minute")
def comparative_ranking_endpoint(
    request: Request,
    industry: str = PathParam(pattern=GROUP_PATTERN),
    developed: bool = Query(default=False),
    min_mcap: float | None = Query(default=None, ge=0),
    history: bool = Query(default=True),
) -> dict[str, Any]:
    payload = _ranking_for_industry(urllib.parse.unquote(industry), developed, min_mcap)
    return payload if history else _without_cell_history(payload)


# ── /api/comparative/{industry} ──────────────────────────────────────────────

_COMP_METRIC_DEFS: list[tuple[str, str, float | None, float | None]] = [
    # (db_col, stored_as, clip_low, clip_high)
    ("Revenue", "as-is", None, None),
    ("Gross Profit Ratio", "decimal", -1.0, 1.0),
    ("Operating Income Ratio", "decimal", -2.0, 1.0),
    ("Net Income Ratio", "decimal", -2.0, 1.0),
    ("ROE", "decimal", -3.0, 3.0),
    ("ROIC", "decimal", -3.0, 3.0),
    ("Free Cash Flow", "as-is", None, None),
    ("PE Ratio", "as-is", -200.0, 500.0),
]


@app.get("/api/comparative/{industry}")
@limiter.limit("30/minute")
@cached(ttl_seconds=30 * 60, key_prefix="db")
def comparative_endpoint(
    request: Request,
    industry: str = PathParam(pattern=GROUP_PATTERN),
    limit: int = Query(default=8, ge=2, le=20),
) -> dict[str, Any]:
    industry_decoded = urllib.parse.unquote(industry)
    with db_conn() as conn:
        # Rank the peer set by each company's LATEST-year market cap, not
        # MAX(Market Cap) across all years — the latter pulls a company's peak
        # historical cap, so a since-shrunken firm can displace current leaders
        # from the panel. SQLite's "bare column + single MAX()" rule makes `mc`
        # the value from the row holding MAX(year). Matches the latest-year
        # selection used by the ranking + company-metrics queries.
        top_rows = conn.execute(
            f"""
            SELECT f.Ticker, {_FX_SPOT_MC_SQL} AS mc,
                   MAX(CAST(f."Calendar Year" AS INTEGER)) AS yr
            FROM financials f JOIN tickers t ON t.ticker = f.Ticker
            LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"
            LEFT JOIN security_map s ON s.symbol = f.Ticker
            WHERE t.industry = ?
              AND COALESCE(s.is_primary, 1) = 1
              AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
              AND CAST(f."Calendar Year" AS INTEGER) >= ?
            GROUP BY f.Ticker HAVING mc IS NOT NULL
            ORDER BY mc DESC LIMIT ?
            """,
            (industry_decoded, MIN_YEAR, limit),
        ).fetchall()
        if not top_rows:
            raise HTTPException(404, f"No companies for industry '{industry_decoded}'")

        top_tickers = [r["Ticker"] for r in top_rows]
        placeholders = ",".join("?" for _ in top_tickers)
        metric_cols = [m[0] for m in _COMP_METRIC_DEFS]
        col_select = ", ".join(f'f."{c}"' for c in metric_cols)
        rows = conn.execute(
            f"""
            SELECT f.Ticker, CAST(f."Calendar Year" AS INTEGER) AS yr, {col_select}
            FROM financials f
            WHERE f.Ticker IN ({placeholders})
              AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
              AND CAST(f."Calendar Year" AS INTEGER) >= ?
              AND CAST(f."Calendar Year" AS INTEGER) <= ?
            ORDER BY yr
            """,
            (*top_tickers, MIN_YEAR, _max_year()),
        ).fetchall()

    metric_meta = {m[0]: m for m in _COMP_METRIC_DEFS}

    def transform(col: str, v: float) -> float:
        _, _stored, lo, hi = metric_meta[col]
        if lo is not None:
            v = max(v, lo)
        if hi is not None:
            v = min(v, hi)
        return v

    by_year_avg: dict[str, dict[int, list[float]]] = {c: {} for c in metric_cols}
    by_year_count: dict[int, set] = {}
    for r in rows:
        yr = int(r["yr"])
        by_year_count.setdefault(yr, set()).add(r["Ticker"])
        for c in metric_cols:
            v = r[c]
            if v is None:
                continue
            try:
                by_year_avg[c].setdefault(yr, []).append(transform(c, float(v)))
            except (TypeError, ValueError):
                continue

    threshold = max(2, int(len(top_tickers) * 0.6))
    valid_years_cmp: list[int] = sorted(
        yr for yr, tset in by_year_count.items() if len(tset) >= threshold
    )

    def avg_series(col: str) -> list[tuple[str, float]]:
        _, stored_as, _lo, _hi = metric_meta[col]
        scale = 100.0 if stored_as == "decimal" else 1.0
        out: list[tuple[str, float]] = []
        for yr in valid_years_cmp:
            vals = by_year_avg[col].get(yr, [])
            if not vals:
                continue
            out.append((str(yr), (sum(vals) / len(vals)) * scale))
        return out

    n = len(top_tickers)
    metrics_payload: list[dict[str, Any]] = [
        metric(number=1, name=f"Top {n} — Avg Revenue", unit="$",
               trend=avg_series("Revenue"),
               definition=f"Average annual revenue across the top {n} companies (by market cap) in {industry_decoded}.",
               analysis="If the top cohort's revenue compounds faster than the broader industry, capital is concentrating into the leaders — typical of winner-take-most markets.",
               vertical=[{"label": "Companies in cohort", "value": n, "unit": ""}]),
        metric(number=2, name=f"Top {n} — Avg Gross Margin", unit="%",
               trend=avg_series("Gross Profit Ratio"),
               definition="Mean gross margin across the top public companies. Higher = stronger brand / pricing power / scale.",
               analysis="Margin dispersion within a top cohort is a leading indicator of future stock performance. High-margin reinvestors usually win over a full cycle."),
        metric(number=3, name=f"Top {n} — Avg Operating Margin", unit="%",
               trend=avg_series("Operating Income Ratio"),
               definition="Mean operating margin across the cohort.",
               analysis="Compare to the industry average operating margin — the top cohort should comfortably outpace it."),
        metric(number=4, name=f"Top {n} — Avg ROE", unit="%",
               trend=avg_series("ROE"),
               definition="Mean return on equity across the cohort.",
               analysis="Sustained ROE > 15% in the top cohort is the empirical fingerprint of a high-quality industry."),
        metric(number=5, name=f"Top {n} — Avg ROIC", unit="%",
               trend=avg_series("ROIC"),
               definition="Mean return on invested capital across the cohort — strips out capital structure effects.",
               analysis="ROIC > 10-12% consistently means the industry's capital is genuinely productive."),
        metric(number=6, name=f"Top {n} — Avg Free Cash Flow", unit="$",
               trend=avg_series("Free Cash Flow"),
               definition="Average free cash flow per company across the cohort.",
               analysis="FCF growing faster than revenue = improving conversion. FCF lagging revenue = working capital or capex intensifying."),
        metric(number=7, name=f"Top {n} — Avg P/E (Trailing)", unit="x",
               trend=avg_series("PE Ratio"),
               definition="Average trailing twelve-month P/E ratio across the cohort.",
               analysis="Premium multiples only justified by durable growth + high incremental returns. Cheap multiples without those = value trap."),
    ]

    year_range = f"{valid_years_cmp[0]}-{valid_years_cmp[-1]}" if valid_years_cmp else f"{MIN_YEAR}-{MAX_YEAR}"

    # The per-ticker ranking now lives at /api/comparative/{industry}/ranking
    # (rendered as a ranked scorecard). Keep the key for response-shape stability.
    leaderboard: list[dict[str, Any]] = []

    return {
        "section": "comparative",
        "scopeKey": industry_decoded,
        "title": f"{industry_decoded} — Comparative Stock Analysis",
        "subtitle": f"Top {n} by market cap: {', '.join(top_tickers)}. Years {year_range}.",
        "metrics": metrics_payload,
        "recessionBands": [],
        "leaderboard": leaderboard,
        "rankedMetricColumns": list(RANKED_METRICS) if ANALYSIS_MODULES_OK else [],
        "displayMetricColumns": [
            {"key": k, "label": lab, "group": grp, "unit": u}
            for (k, lab, grp, u) in DISPLAY_METRICS
        ] if ANALYSIS_MODULES_OK else [],
    }


# ── /api/individual/{ticker} ─────────────────────────────────────────────────

# (number, display name, unit, db column, stored_as, definition, analysis)
_INDIVIDUAL_METRICS: list[tuple[int, str, str, str, str, str, str]] = [
    (1, "Revenue", "$", "Revenue", "as-is",
     "Total reported revenue for each fiscal year on file.",
     "The starting point. Growing revenue that consumes too much capital is not creating value — pair with ROIC trend."),
    (2, "Gross Profit", "$", "Gross Profit", "as-is",
     "Revenue minus cost of goods sold. The unit economics signal.",
     "Widening gross margin while revenue grows is one of the strongest leading indicators of long-term shareholder return."),
    (3, "Operating Income", "$", "Operating Income", "as-is",
     "Earnings from core operations before interest and tax.",
     "Compare growth to revenue growth. Faster ops growth = real operating leverage. Slower = SG&A bloat."),
    (4, "Net Income", "$", "Net Income", "as-is",
     "Profit after all costs, interest, and tax. Flows into book value.",
     "Cross-check against operating income — large divergences point to non-operating items or tax gymnastics."),
    (5, "EBITDA", "$", "EBITDA", "as-is",
     "Earnings before interest, taxes, depreciation, and amortisation.",
     "EBITDA growing faster than net income often signals capex-heavy reinvestment phase. Useful, but never use it as a cash proxy."),
    (6, "Operating Cash Flow", "$", "Operating Cash Flow", "as-is",
     "Cash generated by the core business before capex.",
     "OCF should track net income within a few years on average. Persistent OCF < NI is a yellow flag."),
    (7, "Free Cash Flow", "$", "Free Cash Flow", "as-is",
     "Operating cash flow minus capital expenditure. Available to return or reinvest.",
     "FCF growing at least as fast as net income is the gold standard. Diverging persistently = quality concern."),
    (8, "Total Assets", "$", "Total Assets", "as-is",
     "Everything the company owns at year-end.",
     "Rapidly growing assets without proportional earnings = capital is deployed but not yet productive."),
    (9, "Total Liabilities", "$", "Total Liabilities", "as-is",
     "Everything the company owes at year-end.",
     "Watch composition. Rising long-term debt is a capital-structure decision; rising payables can mask working-capital squeeze."),
    (10, "Total Stockholders Equity", "$", "Total Stockholders Equity", "as-is",
     "Book equity — net worth attributable to common shareholders.",
     "Falling equity despite positive earnings = aggressive buybacks or losses on AOCI. Investigate."),
    (11, "Return on Equity", "%", "ROE", "decimal",
     "Net income / shareholders' equity.",
     "Decompose with DuPont: ROE = Net Margin × Asset Turnover × Leverage."),
    (12, "Return on Invested Capital", "%", "ROIC", "decimal",
     "NOPAT / (Equity + Debt).",
     "ROIC > WACC = growth creates value. ROIC < WACC = growth destroys value."),
    (13, "Gross Profit Ratio", "%", "Gross Profit Ratio", "decimal",
     "Gross profit as a % of revenue.",
     "Rising margin = brand/scale/moat. Falling = commoditisation. Direction matters more than absolute level."),
    (14, "Operating Income Ratio", "%", "Operating Income Ratio", "decimal",
     "Operating margin — Operating Income / Revenue.",
     "Operating leverage in action: when margin rises faster than revenue, fixed costs are being scaled."),
    (15, "Debt to Equity", "x", "Debt To Equity", "as-is",
     "Total debt / total equity.",
     "Above 1.5x raises risk when interest coverage falls below 4x. Below 0.5x with positive ROIC is the conservative sweet spot."),
    (16, "Current Ratio", "x", "Current Ratio", "as-is",
     "Current assets / current liabilities.",
     "Below 1.0 = potential working-capital squeeze. Above 3.0 may flag idle capital."),
]


_MODEL_LABELS = {
    "fcff": "FCFF firm model",
    "nstage": "Revenue-driven n-stage FCFF",
    "ddm": "Dividend discount model",
}


def _valuation_block(snap: Any) -> dict[str, Any]:
    """The headline valuation payload. Legacy echoes the old per-share DCF and
    its module constants; the damodaran engine reports the CHOSEN MODEL's own
    discount rate, terminal growth, horizon and selection metadata — nothing
    rendered here is a constant the model never used."""
    if valuation_engine() == "legacy":
        return {
            "dcfIntrinsicPerShare": snap.dcf_intrinsic,
            "impliedPrice": snap.implied_price,
            "marginOfSafety": snap.margin_of_safety,
            "fcfGrowthUsed": snap.avg_fcf_growth,
            "priceComparison": getattr(snap, "price_comparison", None),
            "wacc": DCF_WACC,
            "terminalGrowth": DCF_TERMINAL_GROWTH,
            "projectionYears": DCF_PROJECTION_YEARS,
        }
    fc = snap.forecast if isinstance(getattr(snap, "forecast", None), dict) else None
    pc = getattr(snap, "price_comparison", None)
    # Belt and braces. The snapshot already leaves these empty when the quote
    # and the model value are different kinds of number (a receipt's US dollar
    # price against a per-ordinary-share value in the filer's own currency),
    # but this block is the one the page reads for its headline, so it refuses
    # the comparison here too rather than trusting a caller upstream.
    comparable = not (isinstance(pc, dict) and pc.get("applicable") is False)
    base = {
        "dcfIntrinsicPerShare": snap.dcf_intrinsic,
        "impliedPrice": snap.implied_price if comparable else None,
        "marginOfSafety": snap.margin_of_safety if comparable else None,
        "fcfGrowthUsed": snap.avg_fcf_growth,
        # The currencies the two figures are in, and why they could not be
        # compared when that is the case. Always present.
        "priceComparison": pc,
    }
    if not fc or fc.get("applicable") is False:
        # Financials: the dividend model carries the headline (JP Morgan rule).
        ddm = getattr(snap, "dividend_discount", None)
        if isinstance(ddm, dict) and ddm.get("applicable"):
            base.update({
                "wacc": ddm.get("costOfEquity"),
                "terminalGrowth": ddm.get("growthTerminal"),
                "projectionYears": ddm.get("horizonYears"),
                "model": "ddm",
                "modelLabel": _MODEL_LABELS["ddm"],
                "stageCount": ddm.get("recommendedStages"),
                "highGrowthYears": ddm.get("horizonYears"),
                "archetype": ddm.get("archetype"),
                "rationale": ddm.get("rationale"),
                "discountRate": ddm.get("costOfEquity"),
            })
            return base
        base.update({
            "wacc": None, "terminalGrowth": None, "projectionYears": None,
            "model": None, "modelLabel": None,
            # compute_forecast uses "notApplicableReason" for the sector guard
            # (financials/REITs) and "reason" for underivable growth — read both.
            "notApplicableReason": ((fc or {}).get("reason")
                                    or (fc or {}).get("notApplicableReason")),
        })
        return base
    assumptions = fc.get("assumptions") or {}
    sel = fc.get("valuationSelection") or {}
    track = sel.get("track")
    base.update({
        "wacc": assumptions.get("wacc"),
        "terminalGrowth": assumptions.get("revenueGrowthTerminal"),
        "projectionYears": assumptions.get("horizonYears"),
        "model": track,
        "modelLabel": _MODEL_LABELS.get(track),
        "stageCount": sel.get("recommendedStages"),
        "highGrowthYears": sel.get("highGrowthYears"),
        "archetype": sel.get("archetype"),
        "rationale": sel.get("rationale"),
        "discountRate": assumptions.get("wacc"),
    })
    return base


def _snapshot_to_dict(snap: Any) -> dict[str, Any]:
    """Serialize an IndividualSnapshot dataclass into a JSON-safe dict."""
    return {
        "ticker": snap.ticker,
        "name": snap.name,
        "sector": snap.sector,
        "industry": snap.industry,
        "latestYear": snap.latest_year,
        "years": snap.years,
        # Ratios — RoA, RoE, RoS, RoIC, AssetTurnover, GrossMargin, Current/Quick/DSC/IC/D2E/D2A
        "ratios": {
            k: (None if v is None else float(v))
            for k, v in snap.ratios.items()
        },
        # Per-share latest + YoY growth
        "perShare": {
            k: (None if v is None else float(v))
            for k, v in snap.per_share.items()
        },
        "perShareGrowth": {
            k: (None if v is None else float(v))
            for k, v in snap.per_share_growth.items()
        },
        # Cash generation history
        "cashGeneration": [
            {
                "year": y,
                "nopat": snap.nopat_history.get(y),
                "ocf": snap.ocf_history.get(y),
                "fcf": snap.fcf_history.get(y),
            }
            for y in snap.years
        ],
        # Intrinsic valuation headline. Under the damodaran engine every number
        # here is the CHOSEN MODEL'S actual value (the old block echoed module
        # constants — a 10% WACC and 3% terminal that the model never used).
        "valuation": _valuation_block(snap),
        # Whether the market quote and the model's per-ordinary-share value are
        # the same kind of number, plus both currencies. The page reads this to
        # decide between printing a margin of safety and saying why there is
        # none, and the AI block reads the quote currency off it rather than
        # making its own /api/quote call.
        "priceComparison": snap.price_comparison,
        # Horizontal analysis — {metric: {year: yoy_pct_decimal}}
        "horizontal": {
            "income": {m: {str(y): v for y, v in d.items() if v is not None}
                       for m, d in snap.horizontal_income.items()},
            "balance": {m: {str(y): v for y, v in d.items() if v is not None}
                        for m, d in snap.horizontal_balance.items()},
            "cashflow": {m: {str(y): v for y, v in d.items() if v is not None}
                         for m, d in snap.horizontal_cashflow.items()},
            "perShare": {m: {str(y): v for y, v in d.items() if v is not None}
                         for m, d in snap.horizontal_per_share.items()},
        },
        # Vertical analysis — common-size: {metric: {year: pct_of_base}} (3 statements)
        "vertical": {
            "income": {m: {str(y): v for y, v in d.items() if v is not None}
                       for m, d in snap.vertical_income.items()},
            "balance": {m: {str(y): v for y, v in d.items() if v is not None}
                        for m, d in snap.vertical_balance.items()},
            "cashflow": {m: {str(y): v for y, v in d.items() if v is not None}
                         for m, d in snap.vertical_cashflow.items()},
        },
        # Per-share level history — {metric: {year: level}}
        "perShareHistory": {
            m: {str(y): v for y, v in d.items() if v is not None}
            for m, d in snap.per_share_history.items()
        },
        # Forward FCFF forecast + valuation bridge + sensitivity + EVA (already JSON-safe)
        "forecast": snap.forecast,
        # Growth-viability due-diligence deck (already JSON-safe).
        "growthViability": snap.growth_viability,
        # Fundamental metric history — {metric_key: {year: value}} + column metadata
        "metricHistory": {
            m: {str(y): v for y, v in d.items() if v is not None}
            for m, d in snap.metric_history.items()
        },
        "metricMeta": [
            {"key": k, "label": lab, "group": grp, "unit": u}
            for (k, lab, grp, u) in DISPLAY_METRICS
        ],
        # Deep-value asset floors (Graham Number / NCAV / Net-Net)
        "valuationAnchors": snap.valuation_anchors,
        # Forensic earnings-quality block (Schilit, "Financial Shenanigans")
        "shenanigans": snap.shenanigans,
        # Residual-income (excess-return) valuation + justified P/B-vs-ROE anchor
        "residualIncome": snap.residual_income,
        # Two-stage dividend discount model (Damodaran Ch.21, Method 2 for financials)
        "dividendDiscount": snap.dividend_discount,
        # FCFE with regulatory-capital reinvestment (Damodaran Ch.21, Method 3)
        "fcfeRegulatory": snap.fcfe_regulatory,
        # Net interest margin + interest-spread decomposition (banks; Damodaran Ch.21)
        "bankProfitability": snap.bank_profitability,
        # Company credit analysis (Ziegel): synthetic rating, leverage/coverage/liquidity,
        # FCF debt capacity, natural-capital-structure check, bank track for financials
        "creditAnalysis": snap.credit_analysis,
        # R&D-capitalization adjustment (Damodaran Ch.9) for R&D-heavy firms
        "rndAdjusted": snap.rnd_adjusted,
        # Normalized-earnings bridge (Damodaran Ch.9): leases-as-debt, investment-
        # income removal (ex-financials), one-time normalization, goodwill/SBC
        "normalizedEarnings": snap.normalized_earnings,
        # Reported income-statement walk from the 10-K XBRL (how earnings were built)
        "earningsBridge": snap.earnings_bridge,
        # ESG block: numeric scores when available, else AI-qualitative marker
        "esg": snap.esg,
        # Management-compensation block: DEF 14A proxy link + SBC pay proxy
        "managementComp": snap.management_comp,
        # Value lenses beside the DCF (Greenwald EPV, Tobin's Q, Buffett owner earnings)
        "epv": snap.epv,
        "tobinsQ": snap.tobins_q,
        "ownerEarnings": snap.owner_earnings,
        # Capital spending split into upkeep and growth, 5 years plus the average
        "capexSplit": getattr(snap, "capex_split", None),
        # Capital base: goodwill share of invested capital + tangible-capital ROIC/EVA
        "capitalBase": snap.capital_base,
        # Business-events feed: recent 8-K/6-K filings (Lev & Gu Ch.4)
        "events": snap.events,
        # Extended (5-factor) DuPont decomposition of ROE
        "dupont": snap.dupont,
        # Leverage decomposition of ROE: ROE = ROIC + D/E × [ROIC − i(1−t)]
        "leverageRoe": snap.leverage_roe,
        # Uses of cash: what each year's operating cash flow was spent on. Net
        # borrowing and net divestitures ride in `sources`, never in `uses`.
        "usesOfCash": snap.uses_of_cash,
        # Business profile (plan 3.1): yfinance description, segments, 10-K extract
        "businessProfile": snap.business_profile,
        # Cost structure vs strategic group (plan 3.2)
        "costStructure": snap.cost_structure,
        # Generic competitive strategy with industry ranks (plan 3.3)
        "genericStrategy": snap.generic_strategy,
        # Moat direction and growth sustainability: figures only, no verdict
        "moatDirection": getattr(snap, "moat_direction", None),
        # Model vs free consensus vs the reader, next two fiscal years
        "nextTwoYears": getattr(snap, "next_two_years", None),
        # Verdict
        "verdict": {
            "qualityScore": snap.quality_score,
            "label": snap.verdict,
            "strengths": list(snap.strengths),
            "weaknesses": list(snap.weaknesses),
        },
    }


# ── /api/individual/{ticker}/benchmarks ─ industry + sector peer averages ────
# The definition sidebar's "you vs industry vs sector" block. Reuses the two
# cached scorecard matrices (the same market-cap-weighted, FX-weighted columns
# the Sector and Industry pages show) re-keyed onto the individual page's
# metric keys. The company's own latest-year value runs through the SAME
# _company_metrics path the matrices use, so all three numbers share units
# (percents already ×100) and methodology.
_BENCHMARK_KEY_MAP: dict[str, str] = {
    # individual DISPLAY_METRICS key -> matrix _SECTOR_METRIC_DEFS key
    "roic": "roic",
    "wacc": "wacc",
    "roic_wacc_spread": "roicWaccSpread",
    "eva_margin": "evaMargin",
    "roe": "roeEquity",
    "cost_of_equity": "costOfEquity",
    "excess_return": "excessReturnEquity",
    "justified_pb": "justifiedPB",
    "pb": "actualPB",
    "pe": "peRatio",
    "net_interest_margin": "netInterestMargin",
    "dupont_tax_burden": "dupontTaxBurden",
    "dupont_interest_burden": "dupontInterestBurden",
    "dupont_ebit_margin": "dupontEbitMargin",
    "net_margin": "netMargin",
    "asset_turnover": "dupontAssetTurnover",
    "equity_multiplier": "dupontEquityMultiplier",
    "operating_margin": "operatingMargin",
    "revenue_growth": "revenueGrowth",
    "net_income_growth": "netIncomeGrowth",
    "operating_leverage": "operatingLeverage",
    "capex_depreciation": "capexToDepreciation",
    "sales_invested_capital": "salesToInvestedCapital",
    "fcf_net_income": "fcfToNetIncome",
    "net_debt_ocf": "netDebtToOcf",
    "liabilities_equity": "liabilitiesToEquity",
}


def _bench_num(col: dict[str, Any], key: str) -> float | None:
    v = col.get(key)
    if not isinstance(v, (int, float)):
        return None
    f = float(v)
    return f if f == f and abs(f) != float("inf") else None


def _benchmark_payload(ticker: str, sector: str | None, industry: str | None,
                       company_col: dict[str, Any], industry_col: dict[str, Any],
                       sector_col: dict[str, Any]) -> dict[str, Any]:
    """Pure projection of the three matrix columns onto individual metric keys.
    Only metrics with at least one group benchmark are emitted; the company's
    own value may be None (the sidebar still shows the group context)."""
    defs = {k: (lbl, unit) for k, lbl, unit, _grp, _d in _SECTOR_METRIC_DEFS}
    metrics: dict[str, dict[str, Any]] = {}
    for ind_key, mx_key in _BENCHMARK_KEY_MAP.items():
        if mx_key not in defs:
            continue
        label, unit = defs[mx_key]
        ind_v = _bench_num(industry_col, mx_key)
        sec_v = _bench_num(sector_col, mx_key)
        if ind_v is None and sec_v is None:
            continue
        metrics[ind_key] = {
            "label": label,
            "unit": unit,
            "company": _bench_num(company_col, mx_key),
            "industry": ind_v,
            "sector": sec_v,
        }
    return {"ticker": ticker, "sector": sector, "industry": industry, "metrics": metrics}


def _company_benchmark_metrics(ticker: str) -> dict[str, Any]:
    """The company's own latest-year metric column, computed by the SAME
    _company_metrics path the matrices use so units and method match the
    group columns. Best effort: {} on any failure."""
    try:
        sel = ", ".join(f'f."{c}"' for c in _SECTOR_NEEDED_COLS)
        sql = (
            f"SELECT f.Ticker, t.sector AS sec, {_cb_beta('t')}, "
            'CAST(f."Calendar Year" AS INTEGER) AS yr, ' + sel +
            " FROM financials f JOIN tickers t ON t.ticker = f.Ticker"
            " LEFT JOIN security_map s ON s.symbol = f.Ticker" + _cb_join() +
            " WHERE UPPER(f.Ticker) = ?"
            " AND f.\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"
        )
        with db_conn() as conn:
            rows = conn.execute(sql, (ticker,)).fetchall()
        rs = [r for r in rows if _sector_row_plausible(r)]
        if not rs:
            return {}
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = _latest_or_ttm(rs, ticker)
        prior = rs[1] if len(rs) > 1 else None
        return _company_metrics(latest, prior)
    except Exception as exc:  # noqa: BLE001 — the company column is a nicety
        log.warning("[api] company benchmark column for %s failed: %s", ticker, exc)
        return {}


@app.get("/api/individual/{ticker}/benchmarks")
@limiter.limit("20/minute")
@cached(ttl_seconds=30 * 60, key_prefix="db")
def individual_benchmarks_endpoint(request: Request,
                                   ticker: str = PathParam(pattern=TICKER_PATTERN)) -> dict[str, Any]:
    tk = _resolve_symbol(ticker)
    with db_conn() as conn:
        meta = conn.execute(
            "SELECT sector, industry FROM tickers WHERE UPPER(ticker) = ?", (tk,),
        ).fetchone()
    sector = meta["sector"] if meta else None
    industry = meta["industry"] if meta else None

    industry_col: dict[str, Any] = {}
    sector_col: dict[str, Any] = {}
    if sector:
        # Both helpers are @cached for 30 min; after any sector/industry page
        # view (or a prior call here) these are dictionary lookups.
        try:
            if industry:
                matrix = _industry_metrics_for_sector(sector)
                industry_col = (matrix.get("data") or {}).get(industry) or {}
        except Exception as exc:  # noqa: BLE001 — a missing lens must not 500
            log.warning("[api] industry benchmark for %s (%s) failed: %s", tk, sector, exc)
        try:
            smatrix = _sector_current_metrics()
            sector_col = (smatrix.get("data") or {}).get(sector) or {}
        except Exception as exc:  # noqa: BLE001
            log.warning("[api] sector benchmark for %s (%s) failed: %s", tk, sector, exc)

    return _benchmark_payload(tk, sector, industry,
                              _company_benchmark_metrics(tk), industry_col, sector_col)


@app.get("/api/individual/{ticker}")
# 30, not 10: the company page and the cross-stage AI block both read this
# route, and a 429 here used to reach the reader as the simulated-data banner.
# The response is cached for thirty minutes, so the extra allowance costs
# nothing (finding M2).
@limiter.limit("30/minute")
@cached(ttl_seconds=30 * 60, key_prefix="db")
def individual_endpoint(request: Request, ticker: str = PathParam(pattern=TICKER_PATTERN)) -> dict[str, Any]:
    # Phase 2: fold an alias (GS-PA, BRK.B, MS-PO, GOOGL) onto its primary listing
    # BEFORE load_ticker_rows / the tickers + financials SELECTs, all of which key
    # off ticker_upper. _resolve_symbol also does the uppercase + dot->dash
    # normalize, so it fully replaces the old ticker.upper(); with security_map
    # absent it IS ticker.upper()-with-dots-dashed, i.e. unchanged behaviour.
    ticker_upper = _resolve_symbol(ticker)

    # Build full snapshot using the existing analysis pipeline (DCF, verdict,
    # ratios, horizontal/vertical, per-share). Returns None if no data.
    snap_dict: dict[str, Any] | None = None
    snap_error: str | None = None
    if ANALYSIS_MODULES_OK:
        try:
            db = get_db()
            rows_full = load_ticker_rows(db, ticker_upper)
            if rows_full:
                macro = get_live_wacc_params()
                hist_params = get_historical_wacc_params()
                try:
                    _gdp = get_nominal_gdp_growth().get("value")
                except Exception:  # noqa: BLE001 — the economy pace is garnish
                    _gdp = None
                snap = build_individual_snapshot(
                    ticker_upper, rows_full, db=db, rf=macro["rf"], erp=macro["erp"],
                    erp_method=macro.get("erpMethod"), hist_params=hist_params,
                    industry_norms=_industry_growth_norms(ticker_upper),
                    gdp_growth=_gdp)
                if snap is not None:
                    snap_dict = _snapshot_to_dict(snap)
        except Exception as exc:  # noqa: BLE001
            log.warning("[api] snapshot for %s failed: %s", ticker_upper, exc)
            snap_error = str(exc) or repr(exc)  # never empty — the marker must stay truthy

    with db_conn() as conn:
        meta = conn.execute(
            "SELECT name, sector, industry FROM tickers WHERE UPPER(ticker) = ?",
            (ticker_upper,),
        ).fetchone()

        cols = ["Total Assets", "Revenue"] + [m[3] for m in _INDIVIDUAL_METRICS]
        seen: set[str] = set()
        unique_cols: list[str] = []
        for c in cols:
            if c not in seen:
                seen.add(c)
                unique_cols.append(c)
        col_list = ", ".join(f'"{c}"' for c in unique_cols)
        rows = conn.execute(
            f"""
            SELECT CAST("Calendar Year" AS INTEGER) AS yr, {col_list}
            FROM financials
            WHERE UPPER(Ticker) = ?
              AND "Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
              AND CAST("Calendar Year" AS INTEGER) >= ?
              AND CAST("Calendar Year" AS INTEGER) <= ?
            ORDER BY yr
            """,
            (ticker_upper, MIN_YEAR, _max_year()),
        ).fetchall()

    if not rows:
        raise HTTPException(404, f"No financial data for ticker '{ticker_upper}' in {MIN_YEAR}-{_max_year()}")

    company_name = meta["name"] if meta else ticker_upper
    sector = meta["sector"] if meta else None
    industry = meta["industry"] if meta else None

    latest = rows[-1]
    latest_revenue = latest["Revenue"] if latest["Revenue"] is not None else 0
    latest_assets = latest["Total Assets"] if latest["Total Assets"] is not None else 0

    metrics_payload: list[dict[str, Any]] = []
    for number, name, unit, col, stored_as, definition, analysis in _INDIVIDUAL_METRICS:
        scale = 100.0 if (stored_as == "decimal" and unit == "%") else 1.0
        trend: list[tuple[str, float]] = []
        for r in rows:
            v = r[col]
            if v is None:
                continue
            try:
                trend.append((str(r["yr"]), float(v) * scale))
            except (TypeError, ValueError):
                continue

        latest_v = trend[-1][1] if trend else 0
        vertical: list[dict[str, Any]] = []

        if col in {"Revenue", "Gross Profit", "Operating Income", "Net Income",
                   "EBITDA", "Operating Cash Flow", "Free Cash Flow"} and latest_revenue:
            vertical.append({"label": "% of Revenue", "value": round((latest_v / latest_revenue) * 100, 2), "unit": "%"})
        if col in {"Total Assets", "Total Liabilities", "Total Stockholders Equity"} and latest_assets:
            vertical.append({"label": "% of Total Assets", "value": round((latest_v / latest_assets) * 100, 2), "unit": "%"})
        if len(trend) >= 2:
            prev, curr = trend[-2][1], trend[-1][1]
            if prev != 0:
                vertical.append({"label": "YoY change", "value": round(((curr - prev) / abs(prev)) * 100, 2), "unit": "%"})
        if len(trend) >= 6:
            sv, cv = trend[-6][1], trend[-1][1]
            # Both endpoints must be positive. A line item that has crossed into
            # negative territory (a company that swung to a loss) makes cv/sv
            # negative, and a negative base raised to the 1/5 power is a COMPLEX
            # number, which round() then refuses. The crash took down the whole
            # individual page for exactly the loss-making companies this section
            # is meant to serve. A CAGR across a sign change has no meaning anyway.
            if sv > 0 and cv > 0:
                vertical.append({"label": "5-yr CAGR", "value": round(((cv / sv) ** (1 / 5) - 1) * 100, 2), "unit": "%"})

        metrics_payload.append(metric(
            number=number, name=name, unit=unit, trend=trend,
            definition=definition, analysis=analysis, vertical=vertical,
            frequency="annual", display_type="bar",
        ))

    return {
        "section": "individual",
        "scopeKey": ticker_upper,
        "title": f"{ticker_upper} — {company_name}",
        "subtitle": f"{sector or 'Sector n/a'} · {industry or 'Industry n/a'} · Years {rows[0]['yr']}-{rows[-1]['yr']}",
        "metrics": metrics_payload,
        "recessionBands": [],
        # NEW: full analysis pipeline output from individualanalysis.py
        "analysis": snap_dict,
        # Distinguishes a crashed pipeline (message, short-TTL cached) from
        # analysis being None by design — None when the pipeline was healthy.
        "analysis_error": snap_error,
    }


# ── Live quote (yfinance) ────────────────────────────────────────────────────

@app.get("/api/quote/{ticker}")
@limiter.limit("60/minute")
def quote_endpoint(request: Request, ticker: str = PathParam(pattern=TICKER_PATTERN)) -> dict[str, Any]:
    """Live(-ish) quote from Yahoo Finance. Cached 15 minutes per ticker so
    repeated frontend polls don't hammer Yahoo."""
    return _quote_for(ticker)


@cached(ttl_seconds=15 * 60, key_prefix="quote")
def _quote_for(ticker: str) -> dict[str, Any]:
    """The quote fetch itself, keyed only by ticker.

    Split out of `quote_endpoint` so the BATCH route can reuse it: the batch
    used to call `quote_endpoint(sym)` positionally, which bound the symbol to
    the `request` parameter, threw on every symbol, and was swallowed by the
    batch's broad except — so /api/quotes always returned [] and the simulator
    silently priced nothing."""
    try:
        import yfinance as yf
    except ImportError:
        raise HTTPException(503, "yfinance not installed — run pip install yfinance")

    t = ticker.strip().upper()
    if not t:
        raise HTTPException(400, "ticker is required")

    try:
        yt = yf.Ticker(t)
        # fast_info is much faster than .info and returns ~15 key fields
        fi = yt.fast_info
    except Exception as exc:  # noqa: BLE001
        log.warning("yfinance quote failed for %s: %s", t, exc)
        raise HTTPException(502, f"yfinance lookup failed: {exc}")

    def _num(key: str) -> float | None:
        try:
            v = getattr(fi, key, None)
            if v is None:
                return None
            return float(v)
        except (TypeError, ValueError):
            return None

    price = _num("last_price")
    prev = _num("previous_close")
    if price is None and prev is None:
        # Yahoo didn't recognise the ticker
        raise HTTPException(404, f"No live quote available for '{t}' on Yahoo Finance")

    change = (price - prev) if (price is not None and prev is not None) else None
    change_pct = (change / prev * 100) if (change is not None and prev) else None

    return {
        "ticker": t,
        "price": price,
        "previousClose": prev,
        "dayChange": change,
        "dayChangePct": change_pct,
        "dayHigh": _num("day_high"),
        "dayLow": _num("day_low"),
        "yearHigh": _num("year_high"),
        "yearLow": _num("year_low"),
        "marketCap": _num("market_cap"),
        "volume": int(_num("last_volume") or 0) or None,
        "currency": getattr(fi, "currency", None) or "USD",
        "exchange": getattr(fi, "exchange", None),
        "fetchedAt": datetime.datetime.now().isoformat(),
        "cacheTtlSeconds": 15 * 60,
    }


# ── Symbol resolution (Phase 2 remediation: fold aliases onto primaries) ─────
# After the remediation applier writes `security_map` into financials.db, an
# alias symbol (a preferred/warrant/unit sibling or a dotted share class, e.g.
# GS-PA, BRK.B, MS-PO, GOOGL) is folded onto its CIK's primary listing so the
# API serves the primary's data. The map is built once and cached for the life
# of the process — a backend RESTART is the only thing that refreshes it (there
# is no in-process invalidation). If `security_map` is missing the map is None
# and every resolver call is an identity (uppercase + dot->dash) normalize, so
# behaviour is byte-for-byte what it was pre-remediation.

_symbol_alias_map: dict[str, str] | None = None
_symbol_alias_loaded = False
_symbol_alias_lock = threading.Lock()


def _load_symbol_alias_map() -> dict[str, str] | None:
    """Build {alias_symbol -> primary_symbol} from security_map, or None when the
    table is absent (pre-remediation DB). One JOIN of aliases (is_primary=0, has a
    cik) against their CIK's primary (is_primary=1). Best-effort: any SQL error
    degrades to None (identity resolution)."""
    try:
        with db_conn() as conn:
            exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='security_map'"
            ).fetchone()
            if exists is None:
                return None
            rows = conn.execute(
                """
                SELECT a.symbol AS alias, p.symbol AS primary_symbol
                FROM security_map AS a
                JOIN security_map AS p
                  ON p.cik = a.cik AND p.is_primary = 1
                WHERE a.is_primary = 0 AND a.cik IS NOT NULL
                  -- the all-zeros CIK is a placeholder, never an identity:
                  -- folding through it once mapped 637 real tickers onto one
                  -- arbitrary company (ABBV -> ZEO). Defense in depth against
                  -- a rebuilt map reintroducing it.
                  AND a.cik != '0000000000'
                """
            ).fetchall()
    except (sqlite3.OperationalError, sqlite3.DatabaseError, HTTPException):
        return None
    out: dict[str, str] = {}
    for r in rows:
        alias, primary = r["alias"], r["primary_symbol"]
        if alias and primary:
            out[str(alias).strip().upper()] = str(primary).strip().upper()
    return out


def _symbol_aliases() -> dict[str, str] | None:
    """Process-cached alias map. Caches BOTH the built map and the table-absent
    (None) outcome, so a missing security_map costs one probe, not one per call.
    Never invalidated in-process; a backend restart refreshes it."""
    global _symbol_alias_map, _symbol_alias_loaded
    if not _symbol_alias_loaded:
        with _symbol_alias_lock:
            if not _symbol_alias_loaded:
                _symbol_alias_map = _load_symbol_alias_map()
                _symbol_alias_loaded = True
    return _symbol_alias_map


def _resolve_symbol_core(
    symbol: str,
    alias_map: dict[str, str] | None,
    known: "set[str] | frozenset[str] | None" = None,
) -> str:
    """PURE symbol resolution (unit-tested). Uppercase, then dot->dash normalize
    UNLESS the dotted form is itself a known DB symbol, then map an alias to its
    primary via alias_map. A None map (table absent) or a symbol that is not an
    alias returns the normalized input unchanged.

    The dot->dash step exists for US share classes (BRK.B is stored as BRK-B).
    Exchange-suffixed listings keep their dot (LAR0.DE, 005930.KS, 6971.T:
    24.5k tickers with financials), so an unconditional replace sent every one
    of them to a symbol that does not exist and the individual page 404'd on
    companies the comparative pages were happily ranking. ``known`` is the set
    of DB tickers; when it is None (tests, table probe failed) the old
    behaviour applies."""
    upper = (symbol or "").strip().upper()
    normalized = upper if (known and upper in known) else upper.replace(".", "-")
    if not alias_map:
        return normalized
    return alias_map.get(upper, alias_map.get(normalized, normalized))


def _resolve_symbol(symbol: str) -> str:
    """Fold an alias symbol onto its primary listing (GS-PA -> GS, BRK.B -> BRK-A).
    Cheap: reads the process-cached alias map and known-symbol set. Falls back
    to the normalized input when security_map is absent or the symbol is not an
    alias. Both caches are process-lifetime — restart the backend to pick up a
    rebuilt security_map or newly ingested tickers."""
    return _resolve_symbol_core(symbol, _symbol_aliases(), _known_symbols())


_known_symbol_set: frozenset[str] | None = None
_known_symbol_loaded = False


def _known_symbols() -> frozenset[str] | None:
    """Process-cached uppercase set of tickers.ticker. Best-effort: any DB error
    caches None, which makes resolution fall back to unconditional dot->dash."""
    global _known_symbol_set, _known_symbol_loaded
    if not _known_symbol_loaded:
        with _symbol_alias_lock:
            if not _known_symbol_loaded:
                try:
                    with db_conn() as conn:
                        rows = conn.execute("SELECT ticker FROM tickers").fetchall()
                    _known_symbol_set = frozenset(
                        str(r["ticker"]).strip().upper() for r in rows if r["ticker"])
                except (sqlite3.OperationalError, sqlite3.DatabaseError, HTTPException):
                    _known_symbol_set = None
                _known_symbol_loaded = True
    return _known_symbol_set


# ── Ticker search ────────────────────────────────────────────────────────────

@app.get("/api/tickers/search")
@limiter.limit("60/minute")
def search_tickers(
    request: Request,
    q: str = Query(default="", max_length=64),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[dict[str, Any]]:
    q_clean = q.strip().upper()
    if len(q_clean) < 1:
        return []
    # Phase 2: fold aliases onto primaries. alias_map is {} when security_map is
    # absent, which makes every step below a no-op and preserves today's output.
    alias_map = _symbol_aliases() or {}
    resolved = _resolve_symbol(q_clean)
    pattern = f"{q_clean}%"
    # Fetch headroom so dropping alias rows can't starve the result set; trim to
    # `limit` after de-duping. Capped so a 1-char query can't scan the universe.
    fetch_limit = min(limit * 3, 60)
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT ticker, name, sector, industry
            FROM tickers
            WHERE UPPER(ticker) LIKE ? OR UPPER(name) LIKE ?
            ORDER BY
                CASE WHEN UPPER(ticker) = ? THEN 0
                     WHEN UPPER(ticker) LIKE ? THEN 1
                     ELSE 2 END,
                ticker
            LIMIT ?
            """,
            (pattern, f"%{q_clean}%", q_clean, pattern, fetch_limit),
        ).fetchall()
        # If the query was an alias (resolved to a different primary symbol), pull
        # that primary row directly so it can lead the list even when the alias
        # itself is no longer a tickers row after remediation.
        primary_row = None
        if resolved != q_clean:
            primary_row = conn.execute(
                "SELECT ticker, name, sector, industry FROM tickers WHERE UPPER(ticker) = ?",
                (resolved,),
            ).fetchone()

    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def _emit(r: sqlite3.Row) -> None:
        key = str(r["ticker"]).upper()
        if key in seen:
            return
        seen.add(key)
        out.append({"ticker": r["ticker"], "name": r["name"],
                    "sector": r["sector"], "industry": r["industry"]})

    if primary_row is not None:
        _emit(primary_row)
    for r in rows:
        # Skip alias rows (a ticker that maps to some OTHER primary): the primary
        # carries the data. Aliases are dropped by ticker only, so name-substring
        # matches still surface the primary (it shares the company name).
        if str(r["ticker"]).upper() in alias_map:
            continue
        _emit(r)
        if len(out) >= limit:
            break
    return out[:limit]


# ── Bottom-up beta inspection (verification / debug surface) ─────────────────

@app.get("/api/beta/{ticker}")
@limiter.limit("10/minute")
def beta_endpoint(
    request: Request,
    ticker: str = PathParam(pattern=TICKER_PATTERN),
    force: bool = Query(default=False),
) -> dict[str, Any]:
    """Full BetaResult for a ticker — method, confidence, D/E, coverage,
    per-segment components and warnings. Uncached on purpose: this is the
    inspection surface for the verification harness and the debug panel."""
    if not BETAS_OK or beta_engine is None:
        raise HTTPException(503, "betas package unavailable")
    db = get_db()
    if db is None:
        raise HTTPException(503, "financials.db unavailable")
    result = beta_engine.resolve_beta(ticker.strip().upper(), db, force=force)
    if result is None:
        raise HTTPException(404, f"no beta resolvable for '{ticker}'")
    out = result.to_dict()
    out["ticker"] = ticker.strip().upper()
    out["mode"] = beta_engine.beta_mode()
    return out


# ── Connections endpoint ───────────────────────────────────────────────────────

def _ticker_group(conn, tk: str) -> tuple[str | None, str | None, Any]:
    """``(sector, industry, peer set)`` for one ticker.

    The two company-profile routes below opened with the same six lines. The
    peer set comes from the shared 30-minute cache, whose one implementation
    lives in ``company_profile/common.py`` and is also what
    ``individualanalysis`` calls: a reader looking at the page and at these two
    routes sees ONE peer set, one fiscal year, and one set of strategic-group
    labels.

    ``industry`` comes back None when the warehouse has no industry for the
    ticker, and the caller answers with its own not-applicable line.
    """
    meta = conn.execute(
        "SELECT sector, industry FROM tickers WHERE UPPER(ticker) = ?", (tk,),
    ).fetchone()
    if not meta or not meta["industry"]:
        return None, None, None
    from company_profile.common import industry_peer_set  # noqa: PLC0415
    return meta["sector"], meta["industry"], industry_peer_set(conn, meta["industry"])


def _guarded_block(what: str, tk: str, build: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    """One cached payload, answered as a not-applicable line rather than a 500
    when it raises. A broken block must not take the page down with it."""
    try:
        return build()
    except Exception as exc:  # noqa: BLE001
        log.warning("[api] %s for %s failed: %s", what, tk, exc)
        return {"applicable": False, "reason": str(exc)}


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _rivals_payload(tk: str, rival_key: tuple[str, ...]) -> dict[str, Any]:
    """Cached body of the rivals route.

    ``rival_key`` is the SORTED tuple of resolved rival tickers, so ``A,B``
    and ``B,A`` are one cache entry rather than two, and the capability rows
    come back in a stable order. The company itself is always first in the
    table regardless."""
    with db_conn() as conn:
        sector, industry, now_peers = _ticker_group(conn, tk)
        if industry is None:
            return {"applicable": False, "reason": "Ticker not found"}
        if now_peers is None:
            return {"applicable": False, "reason": "No peer data available"}
        from company_profile.rivals import get_rival_capabilities, list_group_rivals
        if rival_key:
            return get_rival_capabilities(conn, tk, list(rival_key), now_peers, sector)
        return {
            "applicable": True,
            "ticker": tk,
            "industry": industry,
            "sector": sector,
            "fiscalYear": now_peers.fiscal_year,
            "peerCount": len(now_peers.peers),
            "groupRivals": list_group_rivals(tk, now_peers, sector),
        }


@app.get("/api/individual/{ticker}/rivals")
@limiter.limit("10/minute")
def individual_rivals_endpoint(
    request: Request,
    ticker: str = PathParam(pattern=TICKER_PATTERN),
    rivals: str = Query(default="", max_length=60),
) -> dict[str, Any]:
    """Capability table for the company + up to three rivals (plan 3.4)."""
    tk = _resolve_symbol(ticker)
    # Every rival goes through _resolve_symbol too: a reader typing BRK.B must
    # match the primary listing that carries the financials, exactly as the
    # company ticker does.
    rival_list = sorted({
        _resolve_symbol(r.strip()) for r in rivals.split(",") if r.strip()
    } - {tk})
    return _guarded_block("rivals", tk, lambda: _rivals_payload(tk, tuple(rival_list)))


# How many of the industry's companies the spread table ranks against. Every
# one of them costs a _company_metrics run and (inside
# _company_metrics_for_industry) one live market-cap quote, so it is bounded
# and reported back as `peerCount` rather than implied to be the whole
# industry. 20 is the ceiling the comparative endpoint already uses.
SPREADS_PEER_LIMIT = 20


def _spread_peer_columns(industry: str) -> dict[str, dict[str, Any]]:
    """{ticker: {individual_metric_key: display value}} for the industry.

    Re-keys the SAME per-company matrix columns the comparative scorecard and
    the benchmarks sidebar are built from, so every number in the spread table
    is produced by one function, ``_company_metrics``, in DISPLAY units
    (percents already x100). Nothing here rescales anything."""
    cm = _company_metrics_for_industry(industry, SPREADS_PEER_LIMIT)
    out: dict[str, dict[str, Any]] = {}
    for tk, col in (cm.get("data") or {}).items():
        out[str(tk).upper()] = {
            ind_key: col.get(mx_key) for ind_key, mx_key in _BENCHMARK_KEY_MAP.items()
        }
    return out


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _spreads_payload(tk: str) -> dict[str, Any]:
    """Cached body of the spread table (plan 5.2)."""
    with db_conn() as conn:
        sector, industry, now_peers = _ticker_group(conn, tk)
        if industry is None:
            return {"applicable": False, "reason": "Ticker not found"}

    peer_values = _spread_peer_columns(industry)
    # The company's own column, computed by the same _company_metrics path.
    # It is added explicitly because _company_metrics_for_industry takes the
    # top N by market cap and hard-filters to USD filers, so a smaller company
    # or a foreign filer (TSM reports in TWD) would otherwise be absent from
    # the set it is ranked in, and its rank would be null.
    company_col = _company_benchmark_metrics(tk)
    peer_values[tk] = {
        ind_key: company_col.get(mx_key)
        for ind_key, mx_key in _BENCHMARK_KEY_MAP.items()
    }
    if len(peer_values) <= 1:
        return {"applicable": False, "reason": "No peer data available"}

    # Group membership comes from the industry_structure peer set, the same
    # median split cost structure and the connections bundle use.
    group_label: str | None = None
    group_members: set[str] = set()
    fiscal_year: int | None = None
    if now_peers is not None:
        from company_profile.common import company_groups
        fiscal_year = now_peers.fiscal_year
        groups = company_groups(now_peers, sector)
        group_label = groups.get(tk)
        if group_label is not None:
            group_members = {
                t.upper() for t, g in groups.items() if g == group_label
            }

    industry_col: dict[str, Any] = {}
    sector_col: dict[str, Any] = {}
    try:
        matrix = _industry_metrics_for_sector(sector)
        industry_col = (matrix.get("data") or {}).get(industry) or {}
    except Exception as exc:  # noqa: BLE001 — a missing lens must not 500
        log.warning("[api] spreads industry column for %s failed: %s", tk, exc)
    try:
        smatrix = _sector_current_metrics()
        sector_col = (smatrix.get("data") or {}).get(sector) or {}
    except Exception as exc:  # noqa: BLE001
        log.warning("[api] spreads sector column for %s failed: %s", tk, exc)

    defs = {k: (lbl, unit) for k, lbl, unit, _grp, _d in _SECTOR_METRIC_DEFS}
    labels: dict[str, str] = {}
    units: dict[str, str | None] = {}
    industry_weighted: dict[str, Any] = {}
    sector_weighted: dict[str, Any] = {}
    for ind_key, mx_key in _BENCHMARK_KEY_MAP.items():
        if mx_key not in defs:
            continue
        labels[ind_key], units[ind_key] = defs[mx_key]
        industry_weighted[ind_key] = _bench_num(industry_col, mx_key)
        sector_weighted[ind_key] = _bench_num(sector_col, mx_key)

    from company_profile.spreads import build_spread_table
    return build_spread_table(
        tk, peer_values, group_members, labels, units,
        industry_weighted=industry_weighted,
        sector_weighted=sector_weighted,
        group_label=group_label,
        industry=industry,
        sector=sector,
        fiscal_year=fiscal_year,
    )


@app.get("/api/individual/{ticker}/spreads")
@limiter.limit("10/minute")
def individual_spreads_endpoint(
    request: Request,
    ticker: str = PathParam(pattern=TICKER_PATTERN),
) -> dict[str, Any]:
    """Benchmark spread table with company/industry/group medians (plan 5.2)."""
    tk = _resolve_symbol(ticker)
    return _guarded_block("spreads", tk, lambda: _spreads_payload(tk))


@app.get("/api/connections")
# 60/minute, matching the other read-only cached routes every stage page hits
# on load (/api/quote, /api/quotes, /api/tickers/search). At 10 a reader who
# opens four stage pages in a minute is throttled, and a cache HIT still
# spends a token.
@limiter.limit("60/minute")
@cached(ttl_seconds=30 * 60, key_prefix="db")
def connections_endpoint(
    request: Request,
    sector: str | None = Query(default=None, max_length=80),
    industry: str | None = Query(default=None, max_length=80),
    ticker: str | None = Query(default=None, max_length=12),
    scope: str | None = Query(default=None, max_length=16),
) -> dict[str, Any]:
    """Connection layer: economy, credit, sector, industry, company, exposures.

    ``scope=economy`` returns only the economy and credit blocks, for the
    pages that need the macro lines without an industry.
    """
    if scope is not None and scope != "economy":
        raise HTTPException(400, "scope must be 'economy'")
    if scope != "economy" and not sector and not industry and not ticker:
        raise HTTPException(400, "At least one of scope, sector, industry, or ticker is required")
    if ticker:
        ticker = _resolve_symbol(ticker)
    from connections.bundle import build_connections as _build_conn
    with db_conn() as conn:
        return _build_conn(
            conn,
            scope=scope,
            sector=urllib.parse.unquote(sector) if sector else None,
            industry=urllib.parse.unquote(industry) if industry else None,
            ticker=ticker,
        )


# ── FX rates + batch quotes (stock simulator) ────────────────────────────────

@app.get("/api/fx-rates")
def fx_rates_endpoint() -> dict[str, Any]:
    """{currency: USD-per-unit} for the paper-trading simulator to value a
    multi-currency portfolio in USD. Reuses the same cached table the comparative
    ranking uses; USD is always 1.0 even when the table is empty."""
    rates = dict(_fx_rates())
    rates.setdefault("USD", 1.0)
    asof: str | None = None
    try:
        with db_conn() as conn:
            row = conn.execute("SELECT MAX(asof) AS asof FROM fx_rates").fetchone()
            asof = row["asof"] if row is not None else None
    except sqlite3.OperationalError:
        asof = None
    return {"rates": rates, "asof": asof}


@app.get("/api/quotes")
@limiter.limit("60/minute")
def quotes_batch_endpoint(request: Request, tickers: str = Query(default="", max_length=650)) -> list[dict[str, Any]]:
    """Batch wrapper over /api/quote/{ticker} so the simulator can value a whole
    portfolio in one round-trip. Each ticker reuses the same 15-minute per-ticker
    cache. Unknown/failed tickers are skipped rather than failing the batch."""
    symbols = [s.strip().upper() for s in tickers.split(",") if s.strip()]
    # de-dupe while preserving order, cap to a sane limit
    seen: set[str] = set()
    ordered = [s for s in symbols if not (s in seen or seen.add(s))][:50]
    out: list[dict[str, Any]] = []
    failed: list[str] = []
    for sym in ordered:
        try:
            out.append(_quote_for(sym))
        except HTTPException:
            failed.append(sym)  # not found / upstream failure — leave unpriced
        except Exception as exc:  # noqa: BLE001 — one bad symbol must not sink the batch
            log.warning("batch quote failed for %s: %s", sym, exc)
            failed.append(sym)
    if failed and not out:
        # Every symbol failed: that is a systemic fault (bad wiring, yfinance
        # down), not "these tickers happen to be unpriced". Say so instead of
        # returning [] and letting the simulator render a silently empty book.
        log.error("batch quote: all %d symbols failed (%s)",
                  len(failed), ", ".join(failed[:5]))
    return out


# ── Industry structure endpoints ──────────────────────────────────────────────

@app.get("/api/industry/{industry}/structure")
# 60/minute, matching /api/quote and /api/tickers/search: read-only, cached
# for 30 minutes, and called on every Industry page load (finding M4).
@limiter.limit("60/minute")
@cached(ttl_seconds=30 * 60, key_prefix="db")
def industry_structure_endpoint(
    request: Request,
    industry: str = PathParam(pattern=GROUP_PATTERN),
) -> dict[str, Any]:
    """Full industry structure: concentration, entry/exit/rivalry evidence,
    share stability, evolution, environment indicators."""
    industry = urllib.parse.unquote(industry)
    from industry_structure.structure import build_industry_structure
    with db_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM tickers WHERE industry = ? LIMIT 1", (industry,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, f"industry '{industry}' not found")
        return build_industry_structure(conn, industry)


@app.get("/api/industry/{industry}/group-map")
@limiter.limit("60/minute")  # finding M4, as above
@cached(ttl_seconds=30 * 60, key_prefix="db")
def group_map_endpoint(
    request: Request,
    industry: str = PathParam(pattern=GROUP_PATTERN),
    x: str = Query(default="", max_length=60),
    y: str = Query(default="", max_length=60),
    limit: int = Query(SG_DEFAULT_LIMIT, ge=8, le=100),
) -> dict[str, Any]:
    """Porter strategic groups with proper axes, quadrants, ROIC, and
    share-return curve. Separate from the legacy strategic-groups endpoint."""
    industry = urllib.parse.unquote(industry)
    from industry_structure.groups import build_strategic_groups, build_share_return
    from connections.sector_cache import get_industry_panel
    from industry_structure.dimensions import AXIS_REGISTRY
    x_key = x if x else None
    y_key = y if y else None
    if x_key and x_key not in AXIS_REGISTRY:
        raise HTTPException(400, f"unknown axis key: {x_key}")
    if y_key and y_key not in AXIS_REGISTRY:
        raise HTTPException(400, f"unknown axis key: {y_key}")
    if x_key and y_key and x_key == y_key:
        raise HTTPException(400, "x and y axes must differ")
    with db_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM tickers WHERE industry = ? LIMIT 1", (industry,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, f"industry '{industry}' not found")
        panel = get_industry_panel(conn, industry)  # finding M1: shared panel
        result = build_strategic_groups(
            conn, industry,
            x_key=x_key,
            y_key=y_key,
            limit=limit,
            panel=panel,
        )
        result["shareReturn"] = build_share_return(conn, industry, panel=panel)
        result["limitOptions"] = list(SG_LIMITS)
        return result


@app.get("/api/industry/{industry}/value-system")
@limiter.limit("60/minute")  # finding M4, as above
@cached(ttl_seconds=30 * 60, key_prefix="db")
def value_system_endpoint(
    request: Request,
    industry: str = PathParam(pattern=GROUP_PATTERN),
    supplier: str = Query(default="", max_length=80),
    buyer: str = Query(default="", max_length=80),
) -> dict[str, Any]:
    """Value system: focal industry vs optional supplier/buyer."""
    industry = urllib.parse.unquote(industry)
    from industry_structure.value_system import build_value_system
    with db_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM tickers WHERE industry = ? LIMIT 1", (industry,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, f"industry '{industry}' not found")
        return build_value_system(
            conn, industry,
            supplier=urllib.parse.unquote(supplier) if supplier else None,
            buyer=urllib.parse.unquote(buyer) if buyer else None,
        )


@app.get("/api/sector/{sector}/profit-pool")
@limiter.limit("60/minute")  # finding M4, as above
@cached(ttl_seconds=30 * 60, key_prefix="db")
def profit_pool_endpoint(
    request: Request,
    sector: str = PathParam(pattern=GROUP_PATTERN),
) -> dict[str, Any]:
    """Sector profit pool: per-industry revenue/profit shares."""
    sector = urllib.parse.unquote(sector)
    from industry_structure.profit_pool import build_profit_pool
    with db_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM tickers WHERE sector = ? LIMIT 1", (sector,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, f"sector '{sector}' not found")
        return build_profit_pool(conn, sector)
