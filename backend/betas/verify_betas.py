"""
betas/verify_betas.py — the accuracy-verification harness (acceptance gates 2-6).

Compares the resolver's betas against the stored regression betas and against
Damodaran's published industry levered betas, cross-sectionally over every
ticker that has a stored regression beta (the baseline population used by
data/validate_beta_methods.py, whose conventions this reuses: PLAUSIBLE=(0,3),
CSV/JSON outputs under tmp/).

Usage (from backend/):
    python -m betas.verify_betas                 # cross-sectional study
    python -m betas.verify_betas --impact        # + CoE/WACC/DCF deltas
    python -m betas.verify_betas --panel         # diverse-company debug panel

Resolution runs with allow_network=False — the study measures what the warmed
caches deliver, which is exactly what request paths will see.
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

from .bottom_up import resolve_beta
from .damodaran_industry import DamodaranIndustryData
from .refresh import DB_PATH, _connect

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TMP_DIR = _REPO_ROOT / "tmp"

PLAUSIBLE = (0.0, 3.0)  # matches data/validate_beta_methods.py

# The diverse debug panel: US multi-segment, US single-industry across sectors,
# and international/ADR names (expected L3/L4 via the alias map).
DEBUG_PANEL: list[tuple[str, str]] = [
    ("AAPL", "US multi-segment tech (geographic operating segments)"),
    ("MSFT", "US multi-segment tech (business segments)"),
    ("HPE", "US multi-segment tech (no stored regression beta)"),
    ("HON", "US conglomerate"),
    ("AMZN", "US retail/cloud mix (hard classification)"),
    ("BA", "the book's own Boeing example"),
    ("JPM", "US money-center bank (regulatory leverage case)"),
    ("JNJ", "US healthcare"),
    ("UNH", "US healthcare plans"),
    ("XOM", "US integrated oil"),
    ("WMT", "US staples retail"),
    ("COST", "US staples retail"),
    ("CAT", "US industrials"),
    ("NEE", "US regulated utility"),
    ("AMT", "US REIT"),
    ("DIS", "US communication services"),
    ("TSM", "Taiwan ADR (20-F filer, expected L3)"),
    ("2330.TW", "Taiwan local listing (sparse tickers row)"),
    ("005930.KS", "Korea local listing"),
    ("7203.T", "Japan local listing"),
    ("ASML", "Europe ADR (Netherlands)"),
    ("SAP", "Europe ADR (Germany)"),
    ("BABA", "China ADR"),
    ("VALE", "Brazil ADR (emerging market)"),
]


def _tickers_with_regression(conn) -> list[tuple[str, str | None, float]]:
    rows = conn.execute(
        "SELECT ticker, industry, beta FROM tickers "
        "WHERE beta IS NOT NULL ORDER BY ticker").fetchall()
    return [(r[0], r[1], float(r[2])) for r in rows]


def cross_section(*, limit: int | None = None) -> dict:
    """Criteria 2-5: implausibility, |Δ vs Damodaran levered|, dispersion, levels."""
    dam = DamodaranIndustryData()
    with _connect() as conn:
        population = _tickers_with_regression(conn)
        if limit:
            population = population[:limit]

        methods: Counter[str] = Counter()
        implausible_reg = implausible_new = 0
        deltas_vs_dam: list[float] = []
        by_industry_reg: dict[str, list[float]] = defaultdict(list)
        by_industry_new: dict[str, list[float]] = defaultdict(list)
        divergences: list[dict] = []
        detail_rows: list[dict] = []
        dam_levered_cache: dict[str, float | None] = {}

        for ticker, industry, reg in population:
            result = resolve_beta(ticker, str(DB_PATH), allow_network=False)
            if result is None:
                methods["none"] += 1
                continue
            methods[result.method] += 1

            if not (PLAUSIBLE[0] < reg < PLAUSIBLE[1]):
                implausible_reg += 1
            if not (PLAUSIBLE[0] < result.value < PLAUSIBLE[1]):
                implausible_new += 1

            if industry:
                if industry not in dam_levered_cache:
                    bench = dam.industry_benchmark(conn, industry)
                    dam_levered_cache[industry] = (
                        bench.get("levered_beta") if bench else None)
                dam_lev = dam_levered_cache[industry]
                if dam_lev is not None and result.method.startswith("bottom_up"):
                    deltas_vs_dam.append(abs(result.value - dam_lev))
                by_industry_reg[industry].append(reg)
                by_industry_new[industry].append(result.value)

            if abs(result.value - reg) > 0.75:
                divergences.append({
                    "ticker": ticker, "industry": industry,
                    "regression": reg, "resolved": result.value,
                    "method": result.method,
                    "components": [c.industry for c in result.components],
                    "warnings": list(result.warnings)})
            detail_rows.append({
                "ticker": ticker, "industry": industry, "regression": reg,
                "resolved": result.value, "method": result.method,
                "confidence": result.confidence, "coverage": result.coverage})

        # Within-industry cross-sectional dispersion (industries with n>=5) and
        # the SE-of-average argument (SE_avg ~ sd/sqrt(n) vs the single sd).
        disp_reg, disp_new, se_ratios = [], [], []
        for ind, regs in by_industry_reg.items():
            news = by_industry_new[ind]
            if len(regs) >= 5:
                sd_reg = statistics.pstdev(regs)
                sd_new = statistics.pstdev(news)
                disp_reg.append(sd_reg)
                disp_new.append(sd_new)
                if sd_reg > 0:
                    se_ratios.append((sd_reg / (len(regs) ** 0.5)) / sd_reg)

        n = len(detail_rows)
        med_disp_reg = statistics.median(disp_reg) if disp_reg else None
        med_disp_new = statistics.median(disp_new) if disp_new else None
        summary = {
            "population": n,
            "methods": dict(methods),
            "implausible_regression_pct": round(100 * implausible_reg / n, 2) if n else None,
            "implausible_resolved_pct": round(100 * implausible_new / n, 2) if n else None,
            "median_abs_delta_vs_damodaran_levered":
                round(statistics.median(deltas_vs_dam), 4) if deltas_vs_dam else None,
            "p90_abs_delta_vs_damodaran_levered":
                round(sorted(deltas_vs_dam)[int(0.9 * len(deltas_vs_dam))], 4)
                if deltas_vs_dam else None,
            "median_within_industry_sd_regression": round(med_disp_reg, 4) if med_disp_reg else None,
            "median_within_industry_sd_resolved": round(med_disp_new, 4) if med_disp_new else None,
            "dispersion_reduction_pct":
                round(100 * (1 - med_disp_new / med_disp_reg), 1)
                if med_disp_reg and med_disp_new else None,
            "median_se_ratio_avg_vs_single":
                round(statistics.median(se_ratios), 3) if se_ratios else None,
            "divergences_gt_075": len(divergences),
        }

    TMP_DIR.mkdir(exist_ok=True)
    with open(TMP_DIR / "beta_verify_cross_section.json", "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "divergences": divergences}, f, indent=2)
    with open(TMP_DIR / "beta_verify_cross_section.csv", "w", newline="",
              encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(detail_rows[0].keys()))
        writer.writeheader()
        writer.writerows(detail_rows)
    return summary


def impact(*, dcf_sample: int = 300) -> dict:
    """Criterion 6: CoE/WACC deltas for the population, DCF delta on a sample."""
    sys.path.insert(0, str(_REPO_ROOT / "data"))
    sys.path.insert(0, str(_REPO_ROOT / "backend"))
    from financial_db import capm_discount_rate  # noqa: PLC0415

    with _connect() as conn:
        population = _tickers_with_regression(conn)

    coe_deltas_bp: list[float] = []
    rows_out: list[dict] = []
    for ticker, _industry, reg in population:
        result = resolve_beta(ticker, str(DB_PATH), allow_network=False)
        if result is None or result.method == "regression_stored":
            continue
        coe_old = capm_discount_rate(reg)
        coe_new = capm_discount_rate(result.value)
        delta_bp = (coe_new - coe_old) * 10_000
        coe_deltas_bp.append(abs(delta_bp))
        rows_out.append({"ticker": ticker, "beta_old": reg,
                         "beta_new": result.value,
                         "coe_delta_bp": round(delta_bp, 1),
                         "method": result.method})

    med = statistics.median(coe_deltas_bp) if coe_deltas_bp else None
    tail = [r for r in rows_out if abs(r["coe_delta_bp"]) > 300]
    summary = {
        "tickers_with_changed_beta": len(coe_deltas_bp),
        "median_abs_coe_delta_bp": round(med, 1) if med else None,
        "pct_over_300bp": round(100 * len(tail) / len(coe_deltas_bp), 1)
        if coe_deltas_bp else None,
        "dcf_sample_note": f"DCF re-run scoped to top {dcf_sample} by |delta| "
                           "(compute_forecast is ~0.1s/name)",
    }
    TMP_DIR.mkdir(exist_ok=True)
    with open(TMP_DIR / "beta_verify_impact.json", "w", encoding="utf-8") as f:
        json.dump({"summary": summary,
                   "tail_over_300bp": sorted(tail, key=lambda r: -abs(r["coe_delta_bp"]))},
                  f, indent=2)
    with open(TMP_DIR / "beta_verify_impact.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["ticker", "beta_old", "beta_new",
                                               "coe_delta_bp", "method"])
        writer.writeheader()
        writer.writerows(rows_out)
    return summary


def debug_panel() -> list[dict]:
    """Acceptance gate 8: the diverse industries+geographies panel, with the
    full provenance for manual inspection. Writes tmp/beta_debug_panel.md."""
    out: list[dict] = []
    lines = ["# Bottom-up beta — diverse debug panel", "",
             "| Ticker | Case | Beta | Method | Conf | D/E (src) | Coverage | Warnings |",
             "|---|---|---|---|---|---|---|---|"]
    for ticker, case in DEBUG_PANEL:
        r = resolve_beta(ticker, str(DB_PATH), allow_network=False)
        if r is None:
            lines.append(f"| {ticker} | {case} | — | unresolvable | — | — | — | — |")
            out.append({"ticker": ticker, "case": case, "result": None})
            continue
        de = f"{r.de_ratio:.3f} ({r.de_source})" if r.de_ratio is not None else "—"
        cov = f"{r.coverage:.2f}" if r.coverage is not None else "—"
        warn = "; ".join(r.warnings) if r.warnings else ""
        lines.append(f"| {ticker} | {case} | {r.value:.3f} | {r.method} | "
                     f"{r.confidence} | {de} | {cov} | {warn} |")
        entry = r.to_dict()
        entry["ticker"], entry["case"] = ticker, case
        out.append(entry)
        if r.components:
            lines.append("")
            for c in r.components:
                lines.append(f"  - `{ticker}` {c.segment} -> {c.industry} "
                             f"(w={c.weight:.3f}, bu={c.unlevered_beta:.3f}, {c.map_source})")
            lines.append("")
    TMP_DIR.mkdir(exist_ok=True)
    (TMP_DIR / "beta_debug_panel.md").write_text("\n".join(lines), encoding="utf-8")
    with open(TMP_DIR / "beta_debug_panel.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    return out


def _cli() -> int:
    ap = argparse.ArgumentParser(description="Bottom-up beta verification harness")
    ap.add_argument("--impact", action="store_true")
    ap.add_argument("--panel", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    if args.panel:
        rows = debug_panel()
        print(f"[panel] {len(rows)} names -> tmp/beta_debug_panel.md")
        return 0
    summary = cross_section(limit=args.limit)
    print("[cross-section]")
    for k, v in summary.items():
        print(f"  {k:44s} {v}")
    if args.impact:
        imp = impact()
        print("[impact]")
        for k, v in imp.items():
            print(f"  {k:44s} {v}")
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
