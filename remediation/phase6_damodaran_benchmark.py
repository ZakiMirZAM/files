"""Phase 6 DAMODARAN BENCHMARK ingest for the financials-DB remediation.

Builds an external, survivorship-free industry benchmark table
(``damodaran_benchmark``) beside the in-house sector/industry averages. The
in-house aggregates are survivorship- and look-ahead-biased; Aswath Damodaran's
by-industry-group datasets (NYU Stern) are the free, canonical *unbiased*
source, so this table is the authoritative comparison point for margins, cost of
capital, multiples and returns.

Datasets (current snapshot from ``.../pc/datasets/`` and, with ``--hist``, the
archived yearly files from ``.../pc/archives/``):

  margin.xls   -> operating_margin (pre-tax unadjusted), net_margin
  wacc.xls     -> wacc (cost of capital), cost_of_equity
  pedata.xls   -> pe (current PE), peg
  roe.xls      -> roe (unadjusted)

Design decisions
----------------
* Download + cache is delegated to :func:`marketdata.http_cache.cached_download`
  (browser UA, atomic writes, stale-cache fallback), sharing the ``backend/
  data_cache`` dir and the ``damodaran_<file>`` filename convention already used
  by ``betas/damodaran_industry.py``.
* Parsing MIRRORS ``betas/damodaran_industry.py``: locate the header row by
  scanning the first 20 rows for an "Industry" column, then fuzzy-map each
  metric to a column by case-insensitive substring (first match by column index
  wins). Damodaran's workbooks carry shifting multi-row preambles (wacc.xls puts
  its header on row 18); the row scan absorbs that.
* Archive naming MIRRORS the betas engine: ``<stem><YY>.xls`` under the archives
  base (e.g. ``margin20.xls`` for 2020). A year that 404s is logged and skipped
  so one missing file never aborts the sweep.
* Industry->Damodaran-group mapping REUSES the alias machinery in
  ``betas/damodaran_industry.py`` (imported, never duplicated).

The script takes ``db_path`` as a required positional argument (no default) and
writes ``damodaran_benchmark`` via INSERT OR REPLACE, so re-ingesting a year
restates it in place. Standalone: imports from ``backend/`` packages only.

Usage
-----
    python phase6_damodaran_benchmark.py <db_path> --current
    python phase6_damodaran_benchmark.py <db_path> --hist 2015 2025
    python phase6_damodaran_benchmark.py <db_path> --current --hist 2020 2025
"""

from __future__ import annotations

import argparse
import datetime as _dt
import io
import logging
import os
import sqlite3
import sys

# ── standalone import wiring (backend/ packages) ──────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
_BACKEND = os.path.join(_ROOT, "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from betas.damodaran_industry import alias_industry  # noqa: E402  (reuse aliases)
from marketdata.http_cache import cached_download  # noqa: E402

logger = logging.getLogger("phase6_damodaran_benchmark")

JOB_NAME = "phase6_damodaran_benchmark"

_BASE = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/"
# Archived prior-year files mirror the betas engine: same stems + 2-digit year
# under the archives base (margin20.xls for 2020). A 404 is logged and skipped.
_ARCHIVE_BASE = "https://pages.stern.nyu.edu/~adamodar/pc/archives/"


# filename -> [(canonical_metric, [header substrings in priority order])].
# Fragments match case-insensitively by substring on the located header row; the
# first matching column (lowest index) wins, so plainer labels are listed so
# that they resolve before their qualified siblings ("Cost of Capital" before
# "Cost of Capital (Local Currency)"; "Net Margin" is distinct from "Gross").
_DATASETS: dict[str, list[tuple[str, list[str]]]] = {
    "margin.xls": [
        ("operating_margin", [
            "pre-tax unadjusted operating margin",
            "after-tax unadjusted operating margin",
            "pre-tax, pre-stock compensation operating margin",
            "operating margin",
        ]),
        ("net_margin", ["net margin"]),
    ],
    "wacc.xls": [
        ("wacc", ["cost of capital"]),
        ("cost_of_equity", ["cost of equity"]),
    ],
    "pedata.xls": [
        ("pe", ["current pe", "trailing pe", "forward pe"]),
        ("peg", ["peg ratio", "peg"]),
    ],
    "roe.xls": [
        ("roe", ["roe (unadjusted)", "roe"]),
    ],
}

# The metrics the API contract promises for every industry (missing -> None).
BENCHMARK_METRICS: tuple[str, ...] = (
    "operating_margin", "net_margin", "wacc", "cost_of_equity", "pe", "roe",
)

# Skip these aggregate pseudo-rows that appear at the top/bottom of the sheets.
_SKIP_NAMES = frozenset({
    "", "nan", "total market", "total market (without financials)",
    "total market (without financial)", "all firms",
})

_HEADER_SCAN_ROWS = 20


# ── schema ────────────────────────────────────────────────────────────────────
def ensure_benchmark_schema(conn: sqlite3.Connection) -> None:
    """Idempotently create the ``damodaran_benchmark`` table + index."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS damodaran_benchmark (
            year         INTEGER NOT NULL,
            dam_industry TEXT    NOT NULL,
            metric       TEXT    NOT NULL,
            value        REAL,
            source       TEXT,
            fetched_at   TEXT,
            PRIMARY KEY (year, dam_industry, metric)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_damodaran_benchmark_industry "
        "ON damodaran_benchmark(dam_industry)"
    )
    conn.commit()


# ── parsing (mirrors betas/damodaran_industry.py) ─────────────────────────────
def _norm(s: object) -> str:
    return str(s).strip().lower()


def _read_sheet(
    filename: str, *, base: str, force: bool, max_age_days: float,
    cache_dir: str | None,
):
    """Return the first usable sheet as a header-less DataFrame, or None.

    Failure isolation: a missing pandas/xlrd, a download failure with no cache,
    or an unreadable workbook all return None so the caller records zero rows
    rather than raising.
    """
    try:
        import pandas as pd  # noqa: PLC0415  (heavy, import lazily)
    except ImportError:
        logger.warning("pandas/xlrd unavailable; cannot parse %s", filename)
        return None
    result = cached_download(
        base + filename, f"damodaran_{filename}",
        cache_dir=cache_dir, max_age_days=max_age_days, force=force,
    )
    if result.data is None:
        logger.warning("download failed for %s: %s", filename, result.error)
        return None
    if result.stale:
        logger.info("serving stale cache for %s (%s)", filename, result.error)
    for sheet in ("Industry Averages", 0):
        try:
            return pd.read_excel(io.BytesIO(result.data), sheet_name=sheet,
                                 header=None, engine="xlrd")
        except Exception as exc:  # noqa: BLE001 — try next sheet, then give up
            logger.debug("sheet %r of %s unreadable: %s", sheet, filename, exc)
            continue
    logger.warning("no readable sheet in %s", filename)
    return None


def _find_header_row(df) -> int | None:
    for i in range(min(_HEADER_SCAN_ROWS, len(df))):
        cells = [_norm(c) for c in df.iloc[i].tolist()]
        if any(c.startswith("industry") for c in cells):
            return i
    return None


def extract_rows(df, metric_map: list[tuple[str, list[str]]]) -> dict[str, dict[str, float]]:
    """Parse a loaded sheet into ``{industry_group: {metric: value}}``.

    The sheet may be a current OR an archived file — the layout is identical.
    """
    if df is None:
        return {}
    hdr = _find_header_row(df)
    if hdr is None:
        return {}
    headers = [_norm(c) for c in df.iloc[hdr].tolist()]

    ind_col = next((j for j, h in enumerate(headers)
                    if h.startswith("industry")), None)
    if ind_col is None:
        return {}

    resolved: dict[str, int] = {}
    for metric, fragments in metric_map:
        for frag in fragments:
            j = next((jj for jj, h in enumerate(headers)
                      if frag in h and jj != ind_col), None)
            if j is not None:
                resolved[metric] = j
                break
        if metric not in resolved:
            logger.debug("no column matched metric %s", metric)

    out: dict[str, dict[str, float]] = {}
    for i in range(hdr + 1, len(df)):
        row = df.iloc[i].tolist()
        name = row[ind_col] if ind_col < len(row) else None
        if name is None or _norm(name) in _SKIP_NAMES:
            continue
        metrics: dict[str, float] = {}
        for metric, j in resolved.items():
            if j >= len(row):
                continue
            try:
                v = float(row[j])
            except (ValueError, TypeError):
                continue
            if v == v:  # not NaN
                metrics[metric] = v
        if metrics:
            out[str(name).strip()] = metrics
    return out


def _archive_name(filename: str, year: int) -> str:
    stem = filename[:-4] if filename.endswith(".xls") else filename
    return f"{stem}{year % 100:02d}.xls"


# ── persistence ────────────────────────────────────────────────────────────────
def _persist(
    conn: sqlite3.Connection, year: int,
    parsed: dict[str, dict[str, float]], source: str,
) -> int:
    """INSERT OR REPLACE one file's rows for one year. Returns rows written."""
    now = _dt.datetime.now().isoformat(timespec="seconds")
    n = 0
    for dam_industry, metrics in parsed.items():
        for metric, value in metrics.items():
            conn.execute(
                """INSERT OR REPLACE INTO damodaran_benchmark
                       (year, dam_industry, metric, value, source, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                [year, dam_industry, metric, value, source, now],
            )
            n += 1
    return n


def ingest_current(
    conn: sqlite3.Connection, *, year: int | None = None, force: bool = False,
    max_age_days: float = 30.0, cache_dir: str | None = None,
) -> dict[str, int]:
    """Download + parse + persist the CURRENT datasets, stamped with ``year``
    (defaults to the current calendar year). Returns ``{filename: rows}``."""
    ensure_benchmark_schema(conn)
    stamp_year = year if year is not None else _dt.date.today().year
    results: dict[str, int] = {}
    for filename, metric_map in _DATASETS.items():
        df = _read_sheet(filename, base=_BASE, force=force,
                         max_age_days=max_age_days, cache_dir=cache_dir)
        parsed = extract_rows(df, metric_map)
        rows = _persist(conn, stamp_year, parsed, f"damodaran:{filename}")
        results[filename] = rows
        logger.info("current %s -> %d industries, %d rows",
                    filename, len(parsed), rows)
    conn.commit()
    return results


def ingest_history(
    conn: sqlite3.Connection, years, *, force: bool = False,
    max_age_days: float = 90.0, cache_dir: str | None = None,
) -> dict[int, int]:
    """Download + parse + persist the ARCHIVED yearly files for ``years``. Each
    (file, year) is failure-isolated; a 404/missing archive contributes zero.
    Returns ``{year: rows}``."""
    ensure_benchmark_schema(conn)
    results: dict[int, int] = {}
    for year in years:
        total = 0
        for filename, metric_map in _DATASETS.items():
            archive = _archive_name(filename, year)
            try:
                df = _read_sheet(archive, base=_ARCHIVE_BASE, force=force,
                                 max_age_days=max_age_days, cache_dir=cache_dir)
                parsed = extract_rows(df, metric_map)
            except Exception as exc:  # noqa: BLE001 — one bad file must not abort
                logger.warning("archive %s (%d) failed: %s", archive, year, exc)
                parsed = {}
            total += _persist(conn, year, parsed, f"damodaran:archive:{archive}")
        results[year] = total
        logger.info("archive year %d -> %d rows", year, total)
        conn.commit()
    return results


# ── mapping helper: our tickers-table industry -> Damodaran group -> benchmark ──
def resolve_dam_industry(
    conn: sqlite3.Connection, industry: str | None, year: int,
) -> str | None:
    """Resolve one of our (yfinance-style) industry labels to the exact
    ``dam_industry`` key present in ``damodaran_benchmark`` for ``year``.

    Resolution order mirrors ``damodaran_industry.industry_benchmark``: alias
    (yfinance -> Damodaran group) then the raw label, each tried exact
    (case-insensitive) then fuzzy substring. Returns None if nothing matches.
    The module-level ``alias_industry`` is referenced by name so tests can
    monkeypatch it.
    """
    if not industry:
        return None
    alias = alias_industry(industry)
    candidates = ([alias] if alias else []) + [industry]
    for name in candidates:
        row = conn.execute(
            """SELECT dam_industry FROM damodaran_benchmark
               WHERE year = ? AND lower(dam_industry) = lower(?) LIMIT 1""",
            [year, name],
        ).fetchone()
        if row:
            return row[0]
    for name in candidates:
        row = conn.execute(
            """SELECT dam_industry FROM damodaran_benchmark
               WHERE year = ?
                 AND (lower(dam_industry) LIKE '%'||lower(?)||'%'
                      OR lower(?) LIKE '%'||lower(dam_industry)||'%')
               ORDER BY length(dam_industry) LIMIT 1""",
            [year, name, name],
        ).fetchone()
        if row:
            return row[0]
    return None


def benchmark_for(
    conn: sqlite3.Connection, industry: str, year: int,
) -> dict[str, float | None]:
    """Return the Damodaran benchmark for one of our industries in ``year``.

    Always returns every key in :data:`BENCHMARK_METRICS`; a metric absent from
    the table (or an unmapped industry) is None. This is the read path the API
    layer calls to attach a ``benchmark`` block to /api/industry responses.
    """
    metrics: dict[str, float | None] = {m: None for m in BENCHMARK_METRICS}
    dam = resolve_dam_industry(conn, industry, year)
    if dam is None:
        return metrics
    # Nearest available year <= requested (falling back to the earliest year
    # after it): the current snapshot is stamped with the CALENDAR year of the
    # ingest, so an exact-match read goes dark for the most recent completed
    # fiscal year (Phase 7 finding REM-5).
    row = conn.execute(
        """SELECT MAX(year) FROM damodaran_benchmark
           WHERE dam_industry = ? AND year <= ?""",
        [dam, year],
    ).fetchone()
    eff_year = row[0] if row and row[0] is not None else None
    if eff_year is None:
        row = conn.execute(
            """SELECT MIN(year) FROM damodaran_benchmark
               WHERE dam_industry = ?""",
            [dam],
        ).fetchone()
        eff_year = row[0] if row and row[0] is not None else None
    if eff_year is None:
        return metrics
    for metric, value in conn.execute(
        """SELECT metric, value FROM damodaran_benchmark
           WHERE year = ? AND dam_industry = ?""",
        [eff_year, dam],
    ).fetchall():
        if metric in metrics and value is not None:
            metrics[metric] = float(value)
    return metrics


# ── CLI ────────────────────────────────────────────────────────────────────────
def _record_job_run(conn: sqlite3.Connection) -> None:
    """Best-effort stamp into job_runs (table may not exist in a bare test DB)."""
    now = _dt.datetime.now().isoformat(timespec="seconds")
    try:
        conn.execute(
            """INSERT INTO job_runs (job, last_run) VALUES (?, ?)
               ON CONFLICT(job) DO UPDATE SET last_run=excluded.last_run""",
            [JOB_NAME, now],
        )
        conn.commit()
    except sqlite3.OperationalError:
        logger.debug("job_runs table absent; skipping run stamp")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest Damodaran by-industry benchmarks into "
                    "damodaran_benchmark (survivorship-free industry averages).")
    parser.add_argument("db_path", help="path to the writable financials DB")
    parser.add_argument("--current", action="store_true",
                        help="ingest the current-snapshot datasets (year = "
                             "current calendar year)")
    parser.add_argument("--hist", nargs=2, type=int, metavar=("Y1", "Y2"),
                        help="ingest archived yearly files for the inclusive "
                             "range Y1..Y2")
    parser.add_argument("--force", action="store_true",
                        help="ignore cache freshness and re-download")
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if not args.current and not args.hist:
        logger.error("nothing to do: pass --current and/or --hist Y1 Y2")
        return 2

    conn = sqlite3.connect(args.db_path)
    try:
        if args.current:
            res = ingest_current(conn, force=args.force)
            logger.info("current ingest: %s (total %d rows)",
                        res, sum(res.values()))
        if args.hist:
            y1, y2 = sorted(args.hist)
            years = range(y1, y2 + 1)
            res = ingest_history(conn, years, force=args.force)
            logger.info("history ingest: %s (total %d rows)",
                        res, sum(res.values()))
        _record_job_run(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
