"""
betas/bottom_up.py — the beta resolution chain (Ch. 8 bottom-up beta + fallbacks).

    L1 bottom_up_ev_sales   segments x Damodaran βu, weights = revenue x EV/Sales
    L2 bottom_up_revenue    same, plain revenue weights
    L3 bottom_up_single     the firm's whole industry via the alias map
    L4 inhouse_industry     in-house per-industry unlevered average (n>=5)
    L5 regression_stored    tickers.beta as imported (never clamped)
    L6 sector_damodaran     equal-weighted Damodaran sector beta
    L7 market_default       1.0

Guards (the fallback mechanism for an inaccurate beta): mapped-segment revenue
coverage >= 70%; segment-sum/consolidated sanity in [0.6, 1.15]; firm D/E from
Total Debt / Market Cap with Damodaran industry D/E as the flagged fallback;
plausibility clamp [0.2, 3.0] on bottom-up outputs; divergence-vs-regression
flag at |Δ| > 0.75. Every guard trip and skipped level lands in ``warnings``
and the result is persisted to ``computed_betas`` with full provenance.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import sqlite3
from dataclasses import asdict, dataclass, replace
from pathlib import Path

from . import classify, segment_store
from .damodaran_industry import DamodaranIndustryData
from .formulas import (
    SegmentWeight,
    clamp_beta,
    ev_sales_weights,
    relever_beta,
    revenue_weights,
    weighted_unlevered_beta,
)
from .schema import ensure_betas_schema

DEFAULT_TAX_RATE = 0.21
COVERAGE_MIN = 0.70
SEGMENT_SUM_BAND = (0.60, 1.15)
DIVERGENCE_FLAG = 0.75
RECOMPUTE_AGE_DAYS = 30
HIGH_CONF_MIN_MAP = 0.8   # min per-segment map confidence required to stamp "high"
LOW_CONF_MAX_MAP = 0.5    # a 0.4 parent-fallback mapping (or worse) forces "low"


@dataclass(frozen=True)
class BetaComponent:
    segment: str            # segment name, or "<firm>"/"<sector>" for L3/L4/L6
    industry: str
    weight: float
    unlevered_beta: float
    ev_sales: float | None
    revenue: float | None
    map_source: str         # alias | keyword | llm | manual | ticker_industry


@dataclass(frozen=True)
class BetaResult:
    value: float
    unlevered: float | None
    method: str
    confidence: str
    de_ratio: float | None
    de_source: str | None
    tax_rate: float
    coverage: float | None
    components: tuple[BetaComponent, ...]
    warnings: tuple[str, ...]
    regression_beta: float | None
    asof: str

    def to_dict(self) -> dict:
        d = asdict(self)
        d["components"] = [asdict(c) for c in self.components]
        d["warnings"] = list(self.warnings)
        return d


def _db_path(db) -> str:
    """Accept a FinancialDB instance, a path-like, or a string."""
    return str(getattr(db, "db_path", db))


def _connect(db) -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(db))
    conn.row_factory = sqlite3.Row
    return conn


def _norm_de(raw: float | None) -> float | None:
    """Damodaran's D/E column drifts between decimal (0.25) and percent (25.3)
    across vintages; normalize to decimal."""
    if raw is None or raw < 0:
        return None
    return raw / 100.0 if raw > 5.0 else raw


_ADR_SIBLINGS: dict[str, str] | None = None


def _adr_sibling(ticker: str) -> str | None:
    """US ADR sibling for a local-exchange listing (adr_mapping.json at repo
    root). A dual listing is the same firm, so its beta is the sibling's beta."""
    global _ADR_SIBLINGS
    if _ADR_SIBLINGS is None:
        path = Path(__file__).resolve().parent.parent.parent / "adr_mapping.json"
        try:
            matches = json.loads(path.read_text(encoding="utf-8")).get("matches", {})
            _ADR_SIBLINGS = {k.upper(): str(v["us"]).upper()
                             for k, v in matches.items() if v.get("us")}
        except (OSError, json.JSONDecodeError, TypeError):
            _ADR_SIBLINGS = {}
    return _ADR_SIBLINGS.get(ticker)


# ── resolver ──────────────────────────────────────────────────────────────────

def resolve_beta(ticker: str, db, *, tax_rate: float = DEFAULT_TAX_RATE,
                 allow_network: bool = True, force: bool = False) -> BetaResult | None:
    """Resolve a levered beta for ``ticker`` through the L1..L7 chain.

    ``db`` is a FinancialDB (or a path to financials.db). ``allow_network=False``
    restricts the chain to already-cached data (no EDGAR, no LLM). The result is
    persisted to computed_betas; a fresh stored row short-circuits unless
    ``force`` or its inputs changed.
    """
    t = ticker.strip().upper()
    if not t:
        return None
    with _connect(db) as conn:
        ensure_betas_schema(conn)

        info = conn.execute(
            "SELECT name, sector, industry, beta FROM tickers WHERE ticker = ?",
            [t]).fetchone()
        name = info["name"] if info else None
        sector = info["sector"] if info else None
        industry = info["industry"] if info else None
        regression = None
        if info and info["beta"] is not None:
            try:
                regression = float(info["beta"])
            except (TypeError, ValueError):
                regression = None

        latest = conn.execute(
            'SELECT "Calendar Year" AS year, "Total Debt" AS debt,'
            '       "Market Cap" AS mcap, "Revenue" AS revenue, "Cik" AS cik'
            "  FROM financials WHERE Ticker = ?"
            '  ORDER BY CAST("Calendar Year" AS INTEGER) DESC LIMIT 1',
            [t]).fetchone()

        # Dual listing with no local data at all -> resolve the US ADR sibling
        # (same firm, same beta) and record the proxy in provenance.
        if info is None and latest is None:
            sibling = _adr_sibling(t)
            if sibling and sibling != t:
                proxied = resolve_beta(sibling, db, tax_rate=tax_rate,
                                       allow_network=allow_network, force=force)
                if proxied is not None:
                    result = replace(
                        proxied,
                        warnings=proxied.warnings + (f"adr_sibling_proxy={sibling}",))
                    _persist(conn, t, result, _inputs_hash(conn, t, None))
                    return result

        inputs_hash = _inputs_hash(conn, t, latest)
        if not force:
            cached = _load_cached(conn, t, inputs_hash)
            if cached is not None:
                return cached

        result = _resolve(conn, t, name=name, sector=sector, industry=industry,
                          regression=regression, latest=latest, tax_rate=tax_rate,
                          allow_network=allow_network)
        _persist(conn, t, result, inputs_hash)
        return result


def get_beta_fast(ticker: str, db) -> float | None:
    """DB-only read of the resolver's stored output — never touches the network
    or the LLM. None means the universe warm-up has not covered this ticker."""
    try:
        with _connect(db) as conn:
            row = conn.execute(
                "SELECT beta FROM computed_betas WHERE ticker = ?",
                [ticker.strip().upper()]).fetchone()
    except sqlite3.OperationalError:
        return None
    return float(row["beta"]) if row and row["beta"] is not None else None


def get_result_fast(ticker: str, db) -> dict | None:
    """Full stored provenance row as a dict (for shadow-mode surfacing)."""
    try:
        with _connect(db) as conn:
            row = conn.execute(
                "SELECT * FROM computed_betas WHERE ticker = ?",
                [ticker.strip().upper()]).fetchone()
    except sqlite3.OperationalError:
        return None
    if row is None:
        return None
    d = dict(row)
    for key in ("components_json", "warnings_json"):
        try:
            d[key.replace("_json", "")] = json.loads(d.pop(key) or "[]")
        except json.JSONDecodeError:
            d[key.replace("_json", "")] = []
    return d


# ── the chain ─────────────────────────────────────────────────────────────────

def _resolve(conn: sqlite3.Connection, t: str, *, name: str | None,
             sector: str | None, industry: str | None, regression: float | None,
             latest, tax_rate: float, allow_network: bool) -> BetaResult:
    dam = DamodaranIndustryData()
    warnings: list[str] = []
    asof = _dt.date.today().isoformat()

    firm_de = None
    if latest is not None:
        debt = latest["debt"]
        mcap = latest["mcap"]
        if debt is not None and mcap is not None and mcap > 0 and debt >= 0:
            firm_de = float(debt) / float(mcap)

    def finish(bu: float, *, method: str, confidence: str, de: float | None,
               de_source: str, coverage: float | None,
               components: list[BetaComponent]) -> BetaResult:
        bl = relever_beta(bu, de, tax_rate) if de is not None else bu
        bl, clamped = clamp_beta(bl)
        if clamped:
            warnings.append(f"clamped_from={relever_beta(bu, de or 0.0, tax_rate):.3f}")
            confidence = "low"
        if regression is not None and abs(bl - regression) > DIVERGENCE_FLAG:
            warnings.append("diverges_from_regression")
        return BetaResult(
            value=round(bl, 4), unlevered=round(bu, 4), method=method,
            confidence=confidence, de_ratio=de, de_source=de_source,
            tax_rate=tax_rate, coverage=coverage,
            components=tuple(components), warnings=tuple(warnings),
            regression_beta=regression, asof=asof)

    # ── L1/L2: segment bottom-up ────────────────────────────────────────────
    seg_result = _segment_bottom_up(
        conn, t, dam, name=name, industry=industry, latest=latest,
        allow_network=allow_network, warnings=warnings)
    if seg_result is not None:
        bu, method, coverage, components, any_llm, de_from_dam, min_map_conf = seg_result
        de, de_source = firm_de, "firm_market"
        if de is None:
            de, de_source = de_from_dam, "damodaran_industry"
            warnings.append("de_from_damodaran_industry")
        if (method == "bottom_up_ev_sales" and not any_llm
                and de_source == "firm_market"
                and min_map_conf is not None and min_map_conf >= HIGH_CONF_MIN_MAP):
            confidence = "high"
        elif min_map_conf is not None and min_map_conf < LOW_CONF_MAX_MAP:
            confidence = "low"
        else:
            confidence = "medium"
        if de is not None:
            return finish(bu, method=method, confidence=confidence, de=de,
                          de_source=de_source, coverage=coverage,
                          components=components)
        warnings.append("skip_L1L2_no_de")

    # ── L3: single-industry bottom-up ───────────────────────────────────────
    if industry:
        bench = dam.industry_benchmark(conn, industry)
        bu = bench.get("unlevered_beta") if bench else None
        if bu is not None:
            de, de_source = firm_de, "firm_market"
            if de is None:
                de, de_source = _norm_de(bench.get("de_ratio")), "damodaran_industry"
                warnings.append("de_from_damodaran_industry")
            if de is not None:
                comp = [BetaComponent("<firm>", bench.industry, 1.0, bu,
                                      bench.get("ev_sales"), None, "ticker_industry")]
                confidence = "high" if de_source == "firm_market" else "medium"
                return finish(bu, method="bottom_up_single", confidence=confidence,
                              de=de, de_source=de_source, coverage=None,
                              components=comp)
        warnings.append("skip_L3_no_damodaran_industry")
    else:
        warnings.append("skip_L3_no_industry")

    # ── L4: in-house industry unlevered average ─────────────────────────────
    if industry:
        try:
            rows = conn.execute(
                "SELECT year, unlevered_beta FROM industry_beta_history "
                "WHERE industry = ? ORDER BY year DESC LIMIT 1", [industry]).fetchall()
        except sqlite3.OperationalError:
            rows = []
        if rows and rows[0]["unlevered_beta"] is not None and firm_de is not None:
            bu = float(rows[0]["unlevered_beta"])
            comp = [BetaComponent("<firm>", industry, 1.0, bu, None, None,
                                  "ticker_industry")]
            return finish(bu, method="inhouse_industry", confidence="medium",
                          de=firm_de, de_source="firm_market", coverage=None,
                          components=comp)
        warnings.append("skip_L4_no_inhouse_industry_beta")

    # ── L5: stored regression beta (as-is, unclamped per existing spec) ─────
    if regression is not None:
        return BetaResult(
            value=regression, unlevered=None, method="regression_stored",
            confidence="medium", de_ratio=firm_de,
            de_source="firm_market" if firm_de is not None else None,
            tax_rate=tax_rate, coverage=None, components=(),
            warnings=tuple(warnings), regression_beta=regression, asof=asof)
    warnings.append("skip_L5_no_stored_beta")

    # ── L6: Damodaran sector aggregate ──────────────────────────────────────
    if sector:
        bench = dam.sector_benchmark(conn, sector)
        bu = bench.get("unlevered_beta") if bench else None
        if bu is not None:
            de = firm_de if firm_de is not None else _norm_de(bench.get("de_ratio"))
            de_source = "firm_market" if firm_de is not None else "damodaran_industry"
            if de is not None:
                comp = [BetaComponent("<sector>", sector, 1.0, bu, None, None,
                                      "ticker_industry")]
                return finish(bu, method="sector_damodaran", confidence="low",
                              de=de, de_source=de_source, coverage=None,
                              components=comp)
        warnings.append("skip_L6_no_sector_benchmark")

    # ── L7: market default ───────────────────────────────────────────────────
    warnings.append("market_default_used")
    return BetaResult(
        value=1.0, unlevered=None, method="market_default", confidence="low",
        de_ratio=firm_de, de_source="firm_market" if firm_de is not None else None,
        tax_rate=tax_rate, coverage=None, components=(),
        warnings=tuple(warnings), regression_beta=regression, asof=asof)


def _map_confidence(conn, ticker: str, segment: str) -> float | None:
    """Stored classification confidence for one (ticker, segment); None if absent.
    ``source`` alone can't tell a 0.4 parent-fallback from a 0.8 keyword hit."""
    try:
        row = conn.execute(
            "SELECT confidence FROM segment_industry_map "
            "WHERE ticker = ? AND segment_norm = ?",
            [ticker.upper(), classify._norm(segment)]).fetchone()
    except sqlite3.OperationalError:
        return None
    return float(row[0]) if row and row[0] is not None else None


def _segment_bottom_up(conn, t: str, dam: DamodaranIndustryData, *,
                       name: str | None, industry: str | None, latest,
                       allow_network: bool, warnings: list[str]):
    """L1/L2 shared machinery. Returns (bu, method, coverage, components,
    any_llm, de_from_damodaran, min_map_conf) or None to fall through."""
    cik = None
    if latest is not None and latest["cik"]:
        digits = "".join(ch for ch in str(latest["cik"]) if ch.isdigit())
        cik = digits.zfill(10) if digits else None
    if cik is None:
        warnings.append("skip_L1L2_no_cik")
        return None

    stored = segment_store.latest_segments(conn, cik)
    if stored is None:
        warnings.append("skip_L1L2_no_segments")
        return None
    _fy, rows = stored

    sum_ratio = segment_store.segment_sum_ratio(rows)
    if sum_ratio is None:
        warnings.append("no_consolidated_sanity")
    elif not (SEGMENT_SUM_BAND[0] <= sum_ratio <= SEGMENT_SUM_BAND[1]):
        warnings.append(f"skip_L1L2_segment_sum_ratio={sum_ratio:.2f}")
        return None

    # Classify each segment (cache first; LLM only when network is allowed).
    mapped: list[tuple[segment_store.SegmentRow, str, str]] = []  # (row, group, source)
    any_llm = False
    map_confidences: list[float] = []
    for row in rows:
        cached = classify.get_cached(conn, t, row.segment)
        if cached is not None:
            group, source = cached
        elif allow_network:
            group = classify.classify_segment(
                conn, ticker=t, segment=row.segment, company_name=name,
                company_industry=industry, allow_llm=True)
            refreshed = classify.get_cached(conn, t, row.segment)
            source = refreshed[1] if refreshed else "llm"
        else:
            group, source = None, "uncached"
        if group:
            mapped.append((row, group, source))
            any_llm = any_llm or source == "llm"
            conf = _map_confidence(conn, t, row.segment)
            if conf is not None:
                map_confidences.append(conf)
    min_map_conf = min(map_confidences) if map_confidences else None

    consolidated = rows[0].consolidated_revenue
    total_rev = consolidated if consolidated and consolidated > 0 else sum(
        r.revenue for r in rows if r.revenue > 0)
    if not total_rev or total_rev <= 0:
        warnings.append("skip_L1L2_no_revenue_total")
        return None
    coverage = sum(r.revenue for r, _, _ in mapped if r.revenue > 0) / total_rev
    if coverage < COVERAGE_MIN:
        warnings.append(f"skip_L1L2_coverage={coverage:.2f}")
        return None

    # Damodaran metrics per mapped group.
    benches = {}
    for _row, group, _src in mapped:
        if group not in benches:
            benches[group] = dam.industry_benchmark(conn, group)
    missing_bu = [g for g, b in benches.items()
                  if b is None or b.get("unlevered_beta") is None]
    if missing_bu:
        warnings.append("skip_L1L2_missing_unlevered:" + ",".join(missing_bu))
        return None

    def build(weights: list[SegmentWeight], method: str):
        by_name = {f"{r.segment}": (r, g, s) for r, g, s in mapped}
        betas = {}
        components = []
        for w in weights:
            row, group, source = by_name[w.segment]
            bench = benches[group]
            bu_i = bench.get("unlevered_beta")
            betas[w.segment] = bu_i
            components.append(BetaComponent(
                segment=row.segment, industry=group, weight=round(w.weight, 4),
                unlevered_beta=bu_i, ev_sales=bench.get("ev_sales"),
                revenue=row.revenue, map_source=source))
        bu = weighted_unlevered_beta(weights, betas)
        if bu is None:
            return None
        de_dam = _weighted_dam_de(weights, {s: benches[g] for _r, g, _s in mapped
                                            for s in [_r.segment]})
        return bu, method, round(coverage, 4), components, any_llm, de_dam, min_map_conf

    # L1: EV/Sales value weights when every group has the multiple.
    if all(benches[g].get("ev_sales") for _r, g, _s in mapped):
        weights = ev_sales_weights([
            (r.segment, r.revenue, benches[g].get("ev_sales")) for r, g, _s in mapped])
        if weights:
            built = build(weights, "bottom_up_ev_sales")
            if built:
                return built
    else:
        warnings.append("L1_degraded_no_ev_sales")

    # L2: plain revenue weights.
    weights = revenue_weights([(r.segment, r.revenue) for r, _g, _s in mapped])
    if weights:
        built = build(weights, "bottom_up_revenue")
        if built:
            return built
    warnings.append("skip_L1L2_no_weights")
    return None


def _weighted_dam_de(weights: list[SegmentWeight], bench_by_segment) -> float | None:
    """Segment-weighted Damodaran industry D/E (the fallback when the firm has
    no usable market cap)."""
    total = 0.0
    for w in weights:
        bench = bench_by_segment.get(w.segment)
        de = _norm_de(bench.get("de_ratio")) if bench else None
        if de is None:
            return None
        total += w.weight * de
    return total


# ── persistence ───────────────────────────────────────────────────────────────

def _inputs_hash(conn: sqlite3.Connection, t: str, latest) -> str:
    parts = [t]
    if latest is not None:
        parts += [str(latest["year"]), str(latest["debt"]), str(latest["mcap"]),
                  str(latest["revenue"]), str(latest["cik"])]
    try:
        row = conn.execute("SELECT MAX(asof) FROM damodaran_industry").fetchone()
        parts.append(str(row[0] if row else None))
        seg = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(revenue), 0) FROM segment_revenue s "
            "JOIN financials f ON f.Ticker = ? "
            "WHERE s.cik = printf('%010d', CAST(f.\"Cik\" AS INTEGER))", [t]).fetchone()
        parts.append(f"{seg[0]}:{seg[1]}")
        maps = conn.execute(
            "SELECT COUNT(*), COALESCE(GROUP_CONCAT(industry), '') FROM ("
            "  SELECT industry FROM segment_industry_map WHERE ticker = ? "
            "  ORDER BY segment_norm)", [t]).fetchone()
        parts.append(f"{maps[0]}:{maps[1]}")
    except sqlite3.OperationalError:
        pass
    return hashlib.sha1("|".join(parts).encode()).hexdigest()


def _load_cached(conn: sqlite3.Connection, t: str, inputs_hash: str) -> BetaResult | None:
    try:
        row = conn.execute("SELECT * FROM computed_betas WHERE ticker = ?",
                           [t]).fetchone()
    except sqlite3.OperationalError:
        return None
    if row is None or row["inputs_hash"] != inputs_hash:
        return None
    try:
        computed_at = _dt.datetime.fromisoformat(row["computed_at"])
        if (_dt.datetime.now() - computed_at).days > RECOMPUTE_AGE_DAYS:
            return None
    except (TypeError, ValueError):
        return None
    try:
        components = tuple(BetaComponent(**c)
                           for c in json.loads(row["components_json"] or "[]"))
        result_warnings = tuple(json.loads(row["warnings_json"] or "[]"))
    except (json.JSONDecodeError, TypeError):
        components, result_warnings = (), ()
    return BetaResult(
        value=float(row["beta"]),
        unlevered=float(row["unlevered"]) if row["unlevered"] is not None else None,
        method=row["method"], confidence=row["confidence"],
        de_ratio=row["de_ratio"], de_source=row["de_source"],
        tax_rate=row["tax_rate"], coverage=row["coverage"],
        components=components, warnings=result_warnings,
        regression_beta=row["regression_beta"],
        asof=(row["computed_at"] or "")[:10])


def _persist(conn: sqlite3.Connection, t: str, r: BetaResult, inputs_hash: str) -> None:
    divergence = (abs(r.value - r.regression_beta)
                  if r.regression_beta is not None else None)
    conn.execute(
        """INSERT INTO computed_betas
               (ticker, beta, unlevered, method, confidence, de_ratio, de_source,
                tax_rate, coverage, regression_beta, divergence,
                components_json, warnings_json, inputs_hash, computed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ticker) DO UPDATE SET
               beta=excluded.beta, unlevered=excluded.unlevered,
               method=excluded.method, confidence=excluded.confidence,
               de_ratio=excluded.de_ratio, de_source=excluded.de_source,
               tax_rate=excluded.tax_rate, coverage=excluded.coverage,
               regression_beta=excluded.regression_beta,
               divergence=excluded.divergence,
               components_json=excluded.components_json,
               warnings_json=excluded.warnings_json,
               inputs_hash=excluded.inputs_hash, computed_at=excluded.computed_at""",
        [t, r.value, r.unlevered, r.method, r.confidence, r.de_ratio, r.de_source,
         r.tax_rate, r.coverage, r.regression_beta, divergence,
         json.dumps([asdict(c) for c in r.components]),
         json.dumps(list(r.warnings)),
         inputs_hash, _dt.datetime.now().isoformat(timespec="seconds")])
    conn.commit()


# ── historical per-year bottom-up betas ──────────────────────────────────────

def historical_bottom_up(ticker: str, db, year_de: dict[int, float | None], *,
                         tax_rate: float = DEFAULT_TAX_RATE) -> dict[int, float]:
    """Per-year bottom-up betas for the historical WACC/EVA trend charts:
    that year's Damodaran industry unlevered beta (nearest archived year <=,
    from damodaran_industry_hist) relevered at that year's firm D/E.

    ``year_de`` maps calendar year -> market D/E from the financials rows the
    caller already holds (None entries are skipped). Returns {} when the
    ticker's industry has no Damodaran mapping, so the caller keeps the
    regression beta_history series for those years.
    """
    t = ticker.strip().upper()
    out: dict[int, float] = {}
    with _connect(db) as conn:
        info = conn.execute(
            "SELECT industry FROM tickers WHERE ticker = ?", [t]).fetchone()
        industry = info["industry"] if info else None
        if not industry:
            return {}
        dam = DamodaranIndustryData()
        bu_by_year: dict[int, float | None] = {}
        for year, de in sorted(year_de.items()):
            if de is None or de < 0:
                continue
            if year not in bu_by_year:
                bench = dam.industry_benchmark(conn, industry, year=year)
                bu_by_year[year] = bench.get("unlevered_beta") if bench else None
            bu = bu_by_year[year]
            if bu is None:
                continue
            bl, _clamped = clamp_beta(relever_beta(bu, de, tax_rate))
            out[year] = round(bl, 4)
    return out


# ── warm-up ───────────────────────────────────────────────────────────────────

def warm_universe(*, tickers: list[str] | None = None, force: bool = False,
                  db_path: str | Path | None = None) -> dict[str, int]:
    """Resolve betas for many tickers (default: whole tickers table), counting
    resolution methods. Network-enabled — run before flipping BETA_RESOLVER on."""
    from .refresh import DB_PATH  # noqa: PLC0415 — avoid import cycle at module load

    path = str(db_path or DB_PATH)
    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        if tickers is None:
            tickers = [r[0] for r in conn.execute(
                "SELECT ticker FROM tickers ORDER BY ticker").fetchall()]
    stats: dict[str, int] = {}
    for t in tickers:
        try:
            result = resolve_beta(t, path, force=force)
            key = result.method if result else "none"
        except Exception:  # noqa: BLE001 — one bad ticker must not stop the sweep
            key = "error"
        stats[key] = stats.get(key, 0) + 1
    return stats
