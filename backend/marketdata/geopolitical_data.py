"""
marketdata/geopolitical_data.py  (ported from valuation_debug/data_sources/geopolitical_data.py)

The "conflict and market-psychology" layer — free academic indices:

  * **GPR** — the Geopolitical Risk Index (Caldara & Iacoviello). Newspaper-based
    measure of geopolitical tension, monthly. Source: the authors' site (``.xls``).
  * **EPU** — Economic Policy Uncertainty (Baker, Bloom & Davis). The US daily
    index is ``USEPUINDXD`` and the global index ``GEPUCURRENT`` on FRED, so both
    are fetched through :class:`FredClient` (robust JSON).

Both land in ``macro_series`` (``source='GPR'``/``'EPU'``). GPR degrades
gracefully — a missing feed simply yields no GPR rows.
"""

from __future__ import annotations

import datetime as _dt
import io
import sqlite3

from .fred_client import FredClient
from .http_cache import cached_download
from .schema import ensure_external_schema

GPR_MONTHLY_URL = "https://www.matteoiacoviello.com/gpr_files/data_gpr_export.xls"
GPR_SERIES_ID = "GPR"
GPR_LABEL = "Geopolitical Risk Index (Caldara-Iacoviello)"

# EPU series available straight from FRED.
EPU_FRED_SERIES = (
    ("USEPUINDXD", "Economic Policy Uncertainty (US, daily)"),
    ("GEPUCURRENT", "Global Economic Policy Uncertainty (current GDP weights)"),
)


def _norm(s: object) -> str:
    return str(s).strip().lower()


def fetch_gpr_monthly(
    *, cache_dir: str | None = None, force: bool = False, max_age_days: float = 30.0
) -> list[tuple[str, float]]:
    """Return [(ISO-date, GPR value)] for the headline monthly GPR index.

    Best-effort: needs ``xlrd`` to read the ``.xls``. Returns [] on any failure.
    """
    try:
        import pandas as pd  # noqa: PLC0415
    except ImportError:
        return []
    result = cached_download(
        GPR_MONTHLY_URL, "gpr_monthly.xls",
        cache_dir=cache_dir, max_age_days=max_age_days, force=force,
    )
    if result.data is None:
        return []
    try:
        df = pd.read_excel(io.BytesIO(result.data), engine="xlrd")
    except Exception:  # noqa: BLE001
        return []

    cols = {_norm(c): c for c in df.columns}
    gpr_col = cols.get("gpr") or next(
        (c for k, c in cols.items() if k == "gpr"), None
    )
    date_col = (cols.get("month") or cols.get("date") or cols.get("monthdate")
                or list(df.columns)[0])
    if gpr_col is None:
        return []

    out: list[tuple[str, float]] = []
    for _, row in df.iterrows():
        iso = _coerce_date(row[date_col])
        if iso is None:
            continue
        try:
            v = float(row[gpr_col])
        except (ValueError, TypeError):
            continue
        if v == v:  # not NaN
            out.append((iso, v))
    out.sort(key=lambda t: t[0])
    return out


def _coerce_date(raw: object) -> str | None:
    """Coerce a GPR date cell (datetime, 'YYYYMM', or '1999m1') to ISO YYYY-MM-01."""
    if raw is None:
        return None
    for attr in ("year", "month"):
        if not hasattr(raw, attr):
            break
    else:
        try:
            return f"{raw.year:04d}-{raw.month:02d}-01"  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            pass
    s = str(raw).strip()
    if "m" in s.lower():  # '1999m1'
        y, _, m = s.lower().partition("m")
        if y.isdigit() and m.isdigit():
            return f"{int(y):04d}-{int(m):02d}-01"
    digits = s.split(".")[0]
    if digits.isdigit() and len(digits) == 6:  # 'YYYYMM'
        return f"{digits[:4]}-{digits[4:6]}-01"
    if len(s) >= 7 and s[4] in "-/":
        try:
            return f"{int(s[:4]):04d}-{int(s[5:7]):02d}-01"
        except ValueError:
            return None
    return None


def _store(conn: sqlite3.Connection, series_id: str, label: str, source: str,
           obs: list[tuple[str, float]]) -> int:
    if not obs:
        return 0
    ensure_external_schema(conn)
    now = _dt.datetime.now().isoformat(timespec="seconds")
    conn.executemany(
        """
        INSERT INTO macro_series (series_id, date, value, source, label, unit, fetched_at)
        VALUES (?, ?, ?, ?, ?, 'index', ?)
        ON CONFLICT(series_id, date) DO UPDATE SET
            value=excluded.value, source=excluded.source,
            label=excluded.label, fetched_at=excluded.fetched_at
        """,
        [(series_id, d, v, source, label, now) for d, v in obs],
    )
    conn.commit()
    return len(obs)


def refresh_geopolitical(
    conn: sqlite3.Connection,
    *,
    fred: FredClient | None = None,
    cache_dir: str | None = None,
    force: bool = False,
) -> dict[str, int]:
    """Fetch + persist GPR (best-effort) and EPU (via FRED). Returns row counts."""
    results: dict[str, int] = {}
    # GPR — best effort.
    try:
        gpr = fetch_gpr_monthly(cache_dir=cache_dir, force=force)
        results[GPR_SERIES_ID] = _store(conn, GPR_SERIES_ID, GPR_LABEL, "GPR", gpr)
    except Exception:  # noqa: BLE001
        results[GPR_SERIES_ID] = 0

    # EPU — robust via FRED JSON.
    fred = fred or FredClient(cache_dir=cache_dir)
    for series_id, label in EPU_FRED_SERIES:
        try:
            obs = fred.fetch_series(series_id, "1990-01-01", force=force)
            results[series_id] = _store(
                conn, series_id, label, "EPU",
                [(o.date, o.value) for o in obs],
            )
        except Exception:  # noqa: BLE001
            results[series_id] = 0
    return results
