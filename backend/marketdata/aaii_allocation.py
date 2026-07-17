"""
marketdata/aaii_allocation.py

The **AAII Asset Allocation Survey** — a monthly survey of AAII members on how
their own portfolios are split across stocks, bonds and cash. History starts in
November 1987, which is what makes it worth carrying: it spans four NBER
recessions, the dot-com peak and the 2009 bottom.

Three series land in ``macro_series`` (``source='AAII'``, ``unit='%'``):

  * ``AAII_ALLOC_STOCKS``  — stock funds + individual stocks
  * ``AAII_ALLOC_BONDS``   — bond funds + individual bonds
  * ``AAII_ALLOC_CASH``    — cash (savings, money market, CDs)

Why this module has no downloader
---------------------------------
Every other source in this package fetches over HTTP. This one deliberately does
not. ``aaii.com`` sits behind an Imperva/Incapsula bot WAF that answers 403 to
any non-browser client — verified from a residential IP with a full Chrome
header set, on the survey page, on the ``.xls`` path and even on ``robots.txt``.
``cached_download`` would fail every time, so the workbook is **supplied by
hand**: drop it in ``backend/data_manual/`` and this module ingests it. The
scheduler re-reads the file whenever its mtime moves, so refreshing the metric
means replacing the file, nothing more.

The date column cannot be trusted
---------------------------------
AAII's own workbook mislabels Feb-Dec 2006 and Feb-Dec 2007 with 2005 month-end
dates (a fill error: 2005 appears 34 times, 2006 and 2007 once each). The row
*order* is correct and the sheet is dense, one row per month, so dates are
rebuilt positionally from the first row. :func:`_rebuild_dates` refuses to guess
unless the row count exactly matches the month span it claims to cover, so a
future file with a genuine gap fails loudly instead of silently shifting every
observation. See :func:`parse_workbook`.
"""

from __future__ import annotations

import datetime as _dt
import logging
import sqlite3
from pathlib import Path
from typing import NamedTuple

from . import BACKEND_DIR
from .schema import ensure_external_schema

log = logging.getLogger("marketdata.aaii_allocation")

# Where a hand-downloaded workbook is looked for, in order.
MANUAL_DIR = BACKEND_DIR / "data_manual"
SOURCE_FILENAMES: tuple[str, ...] = (
    "aaii_asset_allocation.xls",
    "aaii_asset_allocation.xlsx",
    "asset.xls",
)

SHEET_NAME = "AAII Asset Allocation Survey"
SOURCE = "AAII"

STOCKS_SERIES = "AAII_ALLOC_STOCKS"
BONDS_SERIES = "AAII_ALLOC_BONDS"
CASH_SERIES = "AAII_ALLOC_CASH"

SERIES_LABELS: dict[str, str] = {
    STOCKS_SERIES: "AAII Asset Allocation Survey — Stocks (%)",
    BONDS_SERIES: "AAII Asset Allocation Survey — Bonds (%)",
    CASH_SERIES: "AAII Asset Allocation Survey — Cash (%)",
}

# The survey's first month. Used only to sanity-check the parsed workbook.
SURVEY_START = (1987, 11)

# The five granular header labels, left of the "Total" column. Each is unique in
# that range; to their right AAII repeats "Stocks"/"Bonds"/"Cash" for the rolled
# up block, which is why every lookup here is bounded by the Total column.
_H_STOCK_FUNDS = "stock funds"
_H_STOCKS = "stocks"
_H_BOND_FUNDS = "bond funds"
_H_BONDS = "bonds"
_H_CASH = "cash"
_H_TOTAL = "total"

# AAII rounds its published roll-ups to 0.1pp, so the components we add up should
# never drift further than that from the roll-up block. Anything larger means the
# column mapping is wrong and we should not publish the series.
_ROLLUP_TOLERANCE_PP = 0.11

# The components are rounded independently and do not always total exactly 100.
# Observed range across the full history is 99.8-100.1, so anything outside this
# band means we parsed the wrong columns.
_SUM_MIN_PP, _SUM_MAX_PP = 99.0, 101.0


class AllocRow(NamedTuple):
    """One month of the survey, as percentages (70.2 == 70.2%)."""

    date: str  # ISO YYYY-MM-01
    stocks: float
    bonds: float
    cash: float


def _norm(v: object) -> str:
    return str(v).strip().lower()


def find_source_file(path: str | Path | None = None) -> Path | None:
    """Return the workbook to ingest, or None when nothing has been dropped in."""
    if path is not None:
        p = Path(path)
        return p if p.is_file() else None
    for name in SOURCE_FILENAMES:
        p = MANUAL_DIR / name
        if p.is_file():
            return p
    return None


def _month_index(year: int, month: int) -> int:
    return year * 12 + (month - 1)


def _from_month_index(idx: int) -> str:
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}-01"


def _rebuild_dates(first: object, last: object, n_rows: int) -> list[str]:
    """Rebuild a dense monthly date axis positionally, or refuse.

    AAII's date column is unreliable (see the module docstring), but the sheet is
    ordered and has exactly one row per month. That makes position, not the label,
    the trustworthy key — *provided* the sheet really is dense. The row count must
    equal the span implied by the first and last labels; if it does not, the file
    has a real gap (or a corrupt endpoint) and guessing would silently shift every
    observation onto the wrong month, so we raise instead.
    """
    for end, raw in (("first", first), ("last", last)):
        if not (hasattr(raw, "year") and hasattr(raw, "month")):
            raise ValueError(f"AAII workbook: {end} date cell is not a date: {raw!r}")

    start_idx = _month_index(first.year, first.month)  # type: ignore[attr-defined]
    end_idx = _month_index(last.year, last.month)  # type: ignore[attr-defined]

    if start_idx != _month_index(*SURVEY_START):
        raise ValueError(
            f"AAII workbook: expected the survey to start {SURVEY_START[0]}-{SURVEY_START[1]:02d}, "
            f"got {_from_month_index(start_idx)[:7]}"
        )
    span = end_idx - start_idx + 1
    if span != n_rows:
        raise ValueError(
            f"AAII workbook: {n_rows} rows but {_from_month_index(start_idx)[:7]}.."
            f"{_from_month_index(end_idx)[:7]} spans {span} months. The sheet is no longer "
            "one dense row per month, so dates cannot be rebuilt positionally. Inspect the "
            "file before ingesting."
        )
    return [_from_month_index(i) for i in range(start_idx, end_idx + 1)]


def _locate_columns(header: list[object]) -> dict[str, int]:
    """Map the five granular component columns, bounded by the Total column."""
    norm = [_norm(h) for h in header]
    try:
        total_idx = norm.index(_H_TOTAL)
    except ValueError:
        raise ValueError("AAII workbook: no 'Total' column in the header row") from None

    left = norm[:total_idx]
    cols: dict[str, int] = {}
    for key in (_H_STOCK_FUNDS, _H_STOCKS, _H_BOND_FUNDS, _H_BONDS, _H_CASH):
        try:
            cols[key] = left.index(key)
        except ValueError:
            raise ValueError(
                f"AAII workbook: no '{key}' column left of 'Total' (header: {left!r})"
            ) from None
    cols[_H_TOTAL] = total_idx
    return cols


def parse_workbook(path: str | Path) -> list[AllocRow]:
    """Parse the AAII workbook into monthly percentage rows.

    Values in the sheet are fractions (0.702), returned here as percentages
    (70.2). Roll-ups are summed from the five granular components rather than
    read from AAII's roll-up block, then cross-checked against that block.
    """
    import pandas as pd  # noqa: PLC0415  (heavy; imported on use like the sibling modules)

    path = Path(path)
    engine = "openpyxl" if path.suffix.lower() == ".xlsx" else "xlrd"
    raw = pd.read_excel(path, sheet_name=SHEET_NAME, engine=engine, header=None)

    # Find the header row (the one naming the granular columns), then take every
    # row under it whose first cell is a real date.
    header_idx = next(
        (i for i in range(min(12, len(raw)))
         if any(_norm(v) == _H_STOCK_FUNDS for v in raw.iloc[i].tolist())),
        None,
    )
    if header_idx is None:
        raise ValueError("AAII workbook: could not find the header row ('Stock Funds')")

    cols = _locate_columns(raw.iloc[header_idx].tolist())
    body = raw.iloc[header_idx + 1:]
    dates = pd.to_datetime(body[0], errors="coerce")
    body = body[dates.notna()]
    if body.empty:
        raise ValueError("AAII workbook: no dated rows under the header")
    labels = pd.to_datetime(body[0]).tolist()

    iso_dates = _rebuild_dates(labels[0], labels[-1], len(body))

    rows: list[AllocRow] = []
    for iso, (_, r) in zip(iso_dates, body.iterrows()):
        try:
            stocks = (float(r[cols[_H_STOCK_FUNDS]]) + float(r[cols[_H_STOCKS]])) * 100.0
            bonds = (float(r[cols[_H_BOND_FUNDS]]) + float(r[cols[_H_BONDS]])) * 100.0
            cash = float(r[cols[_H_CASH]]) * 100.0
        except (TypeError, ValueError):
            raise ValueError(f"AAII workbook: non-numeric allocation on {iso}") from None
        if not all(v == v for v in (stocks, bonds, cash)):  # NaN check
            raise ValueError(f"AAII workbook: missing allocation on {iso}")
        total = stocks + bonds + cash
        if not (_SUM_MIN_PP <= total <= _SUM_MAX_PP):
            raise ValueError(
                f"AAII workbook: {iso} components total {total:.2f}%, outside "
                f"{_SUM_MIN_PP}-{_SUM_MAX_PP}%. Wrong columns?"
            )
        rows.append(AllocRow(iso, round(stocks, 4), round(bonds, 4), round(cash, 4)))

    _verify_against_rollups(raw, header_idx, cols, rows)
    return rows


def _verify_against_rollups(raw, header_idx: int, cols: dict[str, int],
                            rows: list[AllocRow]) -> None:
    """Cross-check our summed components against AAII's own roll-up block.

    Best-effort: the roll-up columns repeat the names "Stocks"/"Bonds"/"Cash" to
    the right of "Total". If they are not where we expect, skip the check rather
    than fail the ingest — the sum and span guards already cover a bad mapping.
    """
    header = [_norm(v) for v in raw.iloc[header_idx].tolist()]
    right = header[cols[_H_TOTAL] + 1:]
    try:
        s_i = cols[_H_TOTAL] + 1 + right.index(_H_STOCKS)
        b_i = cols[_H_TOTAL] + 1 + right.index(_H_BONDS)
        c_i = cols[_H_TOTAL] + 1 + right.index(_H_CASH)
    except ValueError:
        log.debug("AAII: no roll-up block to cross-check against")
        return

    body = raw.iloc[header_idx + 1:]
    import pandas as pd  # noqa: PLC0415

    body = body[pd.to_datetime(body[0], errors="coerce").notna()]
    worst = 0.0
    for row, (_, r) in zip(rows, body.iterrows()):
        for ours, idx in ((row.stocks, s_i), (row.bonds, b_i), (row.cash, c_i)):
            try:
                theirs = float(r[idx]) * 100.0
            except (TypeError, ValueError):
                continue
            if theirs == theirs:
                worst = max(worst, abs(ours - theirs))
    if worst > _ROLLUP_TOLERANCE_PP:
        raise ValueError(
            f"AAII workbook: our component sums differ from AAII's published roll-ups "
            f"by up to {worst:.3f}pp (tolerance {_ROLLUP_TOLERANCE_PP}pp). Column mapping "
            "is probably wrong."
        )
    log.debug("AAII: roll-up cross-check worst deviation %.4fpp", worst)


def store(conn: sqlite3.Connection, rows: list[AllocRow]) -> dict[str, int]:
    """Upsert the three series into ``macro_series``. Returns rows written each.

    All three series land or none of them do. The three ``executemany`` calls share
    one implicit transaction, so a failure partway through (a locked DB, an I/O
    error) would otherwise leave, say, stocks written and bonds missing. That
    partial state does not stay harmless: ``run_due`` reuses ONE connection for
    every task in a tick, so a later task's ``conn.commit()`` would sweep the
    orphaned rows in, and a lopsided AAII population is exactly what the metric
    reader cannot compute a percentile from. Roll back and re-raise instead.
    """
    if not rows:
        return {STOCKS_SERIES: 0, BONDS_SERIES: 0, CASH_SERIES: 0}
    ensure_external_schema(conn)
    now = _dt.datetime.now().isoformat(timespec="seconds")
    out: dict[str, int] = {}
    try:
        for series_id, pick in (
            (STOCKS_SERIES, lambda r: r.stocks),
            (BONDS_SERIES, lambda r: r.bonds),
            (CASH_SERIES, lambda r: r.cash),
        ):
            conn.executemany(
                """
                INSERT INTO macro_series (series_id, date, value, source, label, unit, fetched_at)
                VALUES (?, ?, ?, ?, ?, '%', ?)
                ON CONFLICT(series_id, date) DO UPDATE SET
                    value=excluded.value, source=excluded.source,
                    label=excluded.label, unit=excluded.unit, fetched_at=excluded.fetched_at
                """,
                [(series_id, r.date, pick(r), SOURCE, SERIES_LABELS[series_id], now) for r in rows],
            )
            out[series_id] = len(rows)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return out


def _last_ingest_mtime(conn: sqlite3.Connection) -> float | None:
    row = conn.execute(
        "SELECT MAX(fetched_at) FROM macro_series WHERE series_id = ?", (STOCKS_SERIES,)
    ).fetchone()
    if not row or not row[0]:
        return None
    try:
        return _dt.datetime.fromisoformat(row[0]).timestamp()
    except ValueError:
        return None


def refresh_aaii_allocation(
    conn: sqlite3.Connection, *, path: str | Path | None = None, force: bool = False
) -> dict[str, object]:
    """Ingest the hand-dropped workbook if it is new (or ``force``).

    Never raises on a missing file: the metric simply stays at whatever is already
    in the DB, and the dropdown shows its definition with no chart.
    """
    src = find_source_file(path)
    if src is None:
        return {"status": "no source file", "searched": str(MANUAL_DIR), "rows": 0}

    if not force:
        last = _last_ingest_mtime(conn)
        if last is not None and src.stat().st_mtime <= last:
            return {"status": "up to date", "file": src.name, "rows": 0}

    rows = parse_workbook(src)
    counts = store(conn, rows)
    return {
        "status": "ingested",
        "file": src.name,
        "rows": len(rows),
        "first": rows[0].date,
        "last": rows[-1].date,
        "series": counts,
    }
