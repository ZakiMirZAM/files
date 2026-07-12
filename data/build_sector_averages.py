"""
Market-cap-weighted sector averages by year (2012-2025) from financials.db.

Read-only on the database. Writes data/sector_averages.csv.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "financials.db"
OUT_PATH = Path(__file__).resolve().parent / "sector_averages.csv"

YEAR_START, YEAR_END = 2012, 2025

# WACC assumptions (DB has no beta / Rf / ERP).
RISK_FREE_RATE = 0.04
EQUITY_RISK_PREMIUM = 0.05
ASSUMED_BETA = 1.0
COST_OF_EQUITY = RISK_FREE_RATE + ASSUMED_BETA * EQUITY_RISK_PREMIUM  # 9%
MAX_TAX_RATE = 0.35

# Winsorization bounds, applied within each (sector, year, metric).
WINSOR_LOW, WINSOR_HIGH = 0.01, 0.99

SOURCE_COLUMNS = [
    "Ticker", "Calendar Year", "Sector", "Market Cap",
    "Net Income", "Total Assets", "Total Stockholders Equity",
    "Revenue", "Total Debt", "Interest Expense",
    "Income Tax Expense", "Income Before Tax",
    "ROE", "ROIC",
    "Gross Profit Ratio",
    "Revenue Growth", "Gross Profit Growth", "Net Income Growth",
    "EPS Growth",
    "PFCF Ratio",
    "Free Cash Flow", "Free Cash Flow Growth", "Free Cash Flow Per Share",
    "Operating Cash Flow Growth", "Operating Cash Flow Per Share",
]

# Metrics in output order. Keys are column names after compute_derived().
METRICS = [
    "ROE",
    "ROA",
    "ROIC",
    "WACC",
    "Revenue/Assets",
    "Assets/Equity",
    "Revenue Growth",
    "Gross Profit Ratio",
    "Gross Profit Growth",
    "Net Income Growth",
    "EPS Growth",
    "PFCF Ratio",
    "Free Cash Flow Growth",
    "Free Cash Flow Per Share",
    "Operating Cash Flow Growth",
    "Operating Cash Flow Per Share",
    "FCF/Revenue",
]

# Friendlier names for the CSV header.
OUTPUT_NAMES = {
    "Gross Profit Ratio": "Gross Profit Margin",
    "PFCF Ratio": "Price to FCF",
}


def load_data(conn: sqlite3.Connection) -> pd.DataFrame:
    quoted = ", ".join(f'"{c}"' for c in SOURCE_COLUMNS)
    sql = f"""
        SELECT {quoted}
        FROM financials
        WHERE "Calendar Year" BETWEEN ? AND ?
          AND Sector IS NOT NULL
          AND Sector != ''
          AND "Market Cap" IS NOT NULL
          AND "Market Cap" > 0
    """
    return pd.read_sql_query(sql, conn, params=(YEAR_START, YEAR_END))


def compute_derived(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Effective tax rate, clamped. Fall back to MAX_TAX_RATE when pretax income <= 0
    # so a loss-making company doesn't get a negative or absurd implied tax rate.
    tax_rate = (df["Income Tax Expense"] / df["Income Before Tax"]).clip(0, MAX_TAX_RATE)
    tax_rate = tax_rate.where(df["Income Before Tax"] > 0, MAX_TAX_RATE)

    pretax_kd = df["Interest Expense"] / df["Total Debt"]
    pretax_kd = pretax_kd.where(df["Total Debt"] > 0)
    after_tax_kd = pretax_kd * (1 - tax_rate)

    E = df["Market Cap"]
    D = df["Total Debt"].clip(lower=0).fillna(0)
    V = E + D
    wE, wD = E / V, D / V
    df["WACC"] = wE * COST_OF_EQUITY + wD * after_tax_kd.fillna(0)

    df["ROA"] = df["Net Income"] / df["Total Assets"]
    df["Revenue/Assets"] = df["Revenue"] / df["Total Assets"]
    df["Assets/Equity"] = df["Total Assets"] / df["Total Stockholders Equity"]
    df["FCF/Revenue"] = df["Free Cash Flow"] / df["Revenue"]

    # Invalidate ratios whose denominator is non-positive (economically meaningless).
    bad_assets = df["Total Assets"] <= 0
    df.loc[bad_assets, ["ROA", "Revenue/Assets", "Assets/Equity"]] = np.nan
    df.loc[df["Total Stockholders Equity"] <= 0, "Assets/Equity"] = np.nan
    df.loc[df["Revenue"] <= 0, "FCF/Revenue"] = np.nan

    return df


def winsorize(series: pd.Series, low: float = WINSOR_LOW, high: float = WINSOR_HIGH) -> pd.Series:
    clean = series.dropna()
    if clean.empty:
        return series
    lo, hi = clean.quantile([low, high]).to_numpy()
    return series.clip(lower=lo, upper=hi)


def weighted_avg(values: pd.Series, weights: pd.Series) -> float:
    mask = values.notna() & weights.notna() & (weights > 0)
    if not mask.any():
        return float("nan")
    v = values[mask].to_numpy(dtype=float)
    w = weights[mask].to_numpy(dtype=float)
    total = w.sum()
    if total == 0:
        return float("nan")
    return float(np.sum(v * w) / total)


def compute_sector_averages(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (sector, year), group in df.groupby(["Sector", "Calendar Year"], dropna=False):
        row: dict[str, object] = {
            "Sector": sector,
            "Calendar Year": int(year),
            "n_companies": int(group["Ticker"].nunique()),
        }
        for metric in METRICS:
            wins = winsorize(group[metric])
            out_name = OUTPUT_NAMES.get(metric, metric)
            row[out_name] = weighted_avg(wins, group["Market Cap"])
        rows.append(row)
    return pd.DataFrame(rows).sort_values(["Sector", "Calendar Year"]).reset_index(drop=True)


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"financials.db not found at {DB_PATH}")
    uri = f"file:{DB_PATH.as_posix()}?mode=ro"
    with sqlite3.connect(uri, uri=True) as conn:
        raw = load_data(conn)
    derived = compute_derived(raw)
    averages = compute_sector_averages(derived)
    averages.to_csv(OUT_PATH, index=False)
    print(f"Wrote {len(averages)} sector-year rows to {OUT_PATH}")
    print(
        f"Sectors: {averages['Sector'].nunique()} | "
        f"Years: {averages['Calendar Year'].min()}-{averages['Calendar Year'].max()}"
    )


if __name__ == "__main__":
    main()
