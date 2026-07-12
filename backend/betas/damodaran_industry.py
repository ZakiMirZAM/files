"""
betas/damodaran_industry.py  (ported from valuation_debug/data_sources/damodaran_data.py)

Aswath Damodaran's by-industry-group benchmark datasets (NYU Stern) — the free,
canonical source of *unbiased* industry average unlevered betas, D/E ratios and
EV/Sales multiples. These are the building blocks of the Chapter 8 bottom-up
beta: the in-house universe supplies the firm's segments and capital structure,
Damodaran supplies each business's unlevered beta (already corrected for cash)
and the EV/Sales multiple used to value-weight multi-segment firms.

Scope of the port: only the ``beta`` and NEW ``ps`` (price/EV-to-sales) datasets
plus the yearly archives — the wacc/margin/pe/roe datasets stay in
valuation_debug. The market-level ERP files remain in marketdata/damodaran_market.py.

Robustness: Damodaran publishes ``.xls`` workbooks with shifting multi-row
headers. The parser locates the header row by scanning for an "Industry"
column and fuzzy-maps columns by substring; if a layout drifts or ``xlrd`` is
missing it returns empty and the resolver falls through to the next level —
nothing here is on the critical path.
"""

from __future__ import annotations

import datetime as _dt
import io
import sqlite3
from dataclasses import dataclass

from marketdata.http_cache import cached_download

from .schema import ensure_betas_schema

_BASE = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/"
# Archived prior-year files: same stems + 2-digit year (betas20.xls). Verified live.
_ARCHIVE_BASE = "https://pages.stern.nyu.edu/~adamodar/pc/archives/"

# dataset -> (filename, [(canonical_metric, [header fragments in priority order])])
# Fragments match case-insensitively by substring on the located header row;
# the first matching column wins.
_DATASETS: dict[str, tuple[str, list[tuple[str, list[str]]]]] = {
    "beta": ("betas.xls", [
        ("levered_beta", ["beta"]),
        ("unlevered_beta", ["unlevered beta corrected", "unlevered beta"]),
        ("de_ratio", ["d/e ratio", "d/e"]),
        ("cash_pct_firm", ["cash/firm", "cash/ firm"]),
    ]),
    # Price/EV-to-sales multiples — the L1 value weights (segment revenue x EV/Sales).
    "ps": ("psdata.xls", [
        ("ev_sales", ["ev/ sales", "ev/sales"]),
        ("price_sales", ["price/ sales", "price/sales"]),
    ]),
}

# ── Name reconciliation: yfinance GICS-style names -> Damodaran's 94 groups ────
# Keys are lowercased yfinance industry names; values are the exact Damodaran
# group. Only confident correspondences are included — ambiguous names fall
# through rather than mis-map. (Ported verbatim; ~87% universe coverage.)
_INDUSTRY_ALIASES: dict[str, str] = {
    # Technology
    "software - application": "Software (System & Application)",
    "software - infrastructure": "Software (System & Application)",
    "information technology services": "Computer Services",
    "computer hardware": "Computers/Peripherals",
    "hardware, equipment & parts": "Computers/Peripherals",
    "consumer electronics": "Electronics (Consumer & Office)",
    "electronic components": "Electronics (General)",
    "electronics & computer distribution": "Retail (Distributors)",
    "scientific & technical instruments": "Electronics (General)",
    "semiconductors": "Semiconductor",
    "semiconductor equipment & materials": "Semiconductor Equip",
    "solar": "Green & Renewable Energy",
    "communication equipment": "Telecom. Equipment",
    "internet content & information": "Software (Internet)",
    # Healthcare
    "biotechnology": "Drugs (Biotechnology)",
    "drug manufacturers - general": "Drugs (Pharmaceutical)",
    "drug manufacturers - specialty & generic": "Drugs (Pharmaceutical)",
    "medical - devices": "Healthcare Products",
    "medical devices": "Healthcare Products",
    "medical - instruments & supplies": "Healthcare Products",
    "medical instruments & supplies": "Healthcare Products",
    "diagnostics & research": "Healthcare Products",
    "medical - care facilities": "Hospitals/Healthcare Facilities",
    "medical care facilities": "Hospitals/Healthcare Facilities",
    "medical - distribution": "Healthcare Support Services",
    "medical - healthcare plans": "Healthcare Support Services",
    "health information services": "Heathcare Information and Technology",
    # Financials
    "banks - regional": "Banks (Regional)",
    "banks - diversified": "Bank (Money Center)",
    "banks": "Banks (Regional)",
    "asset management": "Investments & Asset Management",
    "financial - capital markets": "Brokerage & Investment Banking",
    "capital markets": "Brokerage & Investment Banking",
    "financial - credit services": "Financial Svcs. (Non-bank & Insurance)",
    "credit services": "Financial Svcs. (Non-bank & Insurance)",
    "financial - mortgages": "Financial Svcs. (Non-bank & Insurance)",
    "financial - diversified": "Financial Svcs. (Non-bank & Insurance)",
    "financial - data & stock exchanges": "Brokerage & Investment Banking",
    "insurance - life": "Insurance (Life)",
    "insurance - property & casualty": "Insurance (Prop/Cas.)",
    "insurance - diversified": "Insurance (General)",
    "insurance - specialty": "Insurance (General)",
    "insurance - reinsurance": "Reinsurance",
    "insurance brokers": "Insurance (General)",
    "shell companies": "Financial Svcs. (Non-bank & Insurance)",
    # Energy
    "oil & gas integrated": "Oil/Gas (Integrated)",
    "oil & gas e&p": "Oil/Gas (Production and Exploration)",
    "oil & gas exploration & production": "Oil/Gas (Production and Exploration)",
    "oil & gas midstream": "Oil/Gas Distribution",
    "oil & gas refining & marketing": "Oil/Gas (Integrated)",
    "oil & gas equipment & services": "Oilfield Svcs/Equip.",
    "oil & gas drilling": "Oilfield Svcs/Equip.",
    "thermal coal": "Coal & Related Energy",
    "coking coal": "Coal & Related Energy",
    # Consumer cyclical
    "auto - manufacturers": "Auto & Truck",
    "auto manufacturers": "Auto & Truck",
    "auto - parts": "Auto Parts",
    "auto parts": "Auto Parts",
    "auto - dealerships": "Retail (Automotive)",
    "auto & truck dealerships": "Retail (Automotive)",
    "specialty retail": "Retail (Special Lines)",
    "internet retail": "Retail (Special Lines)",
    "apparel - retail": "Retail (Special Lines)",
    "apparel - manufacturers": "Apparel",
    "apparel manufacturing": "Apparel",
    "footwear & accessories": "Shoe",
    "textile manufacturing": "Apparel",
    "discount stores": "Retail (General)",
    "department stores": "Retail (General)",
    "home improvement retail": "Retail (Building Supply)",
    "home improvement": "Retail (Building Supply)",
    "residential construction": "Homebuilding",
    "furnishings, fixtures & appliances": "Furn/Home Furnishings",
    "restaurants": "Restaurant/Dining",
    "lodging": "Hotel/Gaming",
    "resorts & casinos": "Hotel/Gaming",
    "gambling": "Hotel/Gaming",
    "travel services": "Hotel/Gaming",
    "leisure": "Recreation",
    # Consumer defensive
    "packaged foods": "Food Processing",
    "confectioners": "Food Processing",
    "farm products": "Farming/Agriculture",
    "agricultural inputs": "Farming/Agriculture",
    "beverages - non-alcoholic": "Beverage (Soft)",
    "beverages - brewers": "Beverage (Alcoholic)",
    "beverages - wineries & distilleries": "Beverage (Alcoholic)",
    "household & personal products": "Household Products",
    "food distribution": "Food Wholesalers",
    "grocery stores": "Retail (Grocery and Food)",
    "tobacco": "Tobacco",
    # Industrials
    "industrial - machinery": "Machinery",
    "industrial machinery": "Machinery",
    "specialty industrial machinery": "Machinery",
    "farm & heavy construction machinery": "Machinery",
    "agricultural - machinery": "Machinery",
    "electrical equipment & parts": "Electrical Equipment",
    "engineering & construction": "Engineering/Construction",
    "aerospace & defense": "Aerospace/Defense",
    "airlines": "Air Transport",
    "railroads": "Transportation (Railroads)",
    "trucking": "Trucking",
    "marine shipping": "Shipbuilding & Marine",
    "integrated freight & logistics": "Transportation",
    "waste management": "Environmental & Waste Services",
    "pollution & treatment controls": "Environmental & Waste Services",
    "building products & equipment": "Building Materials",
    "specialty business services": "Business & Consumer Services",
    "consulting services": "Business & Consumer Services",
    "staffing & employment services": "Business & Consumer Services",
    "security & protection services": "Business & Consumer Services",
    "rental & leasing services": "Business & Consumer Services",
    "conglomerates": "Diversified",
    "tools & accessories": "Machinery",
    # Basic materials
    "chemicals": "Chemical (Diversified)",
    "chemicals - specialty": "Chemical (Specialty)",
    "specialty chemicals": "Chemical (Specialty)",
    "agricultural - chemicals": "Chemical (Basic)",
    "steel": "Steel",
    "gold": "Precious Metals",
    "silver": "Precious Metals",
    "other precious metals": "Precious Metals",
    "copper": "Metals & Mining",
    "aluminum": "Metals & Mining",
    "other industrial metals & mining": "Metals & Mining",
    "industrial materials": "Metals & Mining",
    "paper & paper products": "Paper/Forest Products",
    "lumber & wood production": "Paper/Forest Products",
    "packaging & containers": "Packaging & Container",
    "building materials": "Building Materials",
    # Communication services
    "advertising agencies": "Advertising",
    "broadcasting": "Broadcasting",
    "entertainment": "Entertainment",
    "publishing": "Publishing & Newspapers",
    "telecom services": "Telecom. Services",
    "telecommunications services": "Telecom. Services",
    # Utilities (both the "Utilities - X" and shortened "X" yfinance variants)
    "utilities - regulated electric": "Utility (General)",
    "utilities - regulated gas": "Utility (General)",
    "utilities - diversified": "Utility (General)",
    "utilities - regulated water": "Utility (Water)",
    "utilities - independent power producers": "Power",
    "utilities - renewable": "Power",
    "regulated electric": "Utility (General)",
    "regulated gas": "Utility (General)",
    "regulated water": "Utility (Water)",
    "independent power producers": "Power",
    "renewable utilities": "Power",
    # Real estate
    "real estate - services": "Real Estate (Operations & Services)",
    "real estate - development": "Real Estate (Development)",
    "real estate - diversified": "Real Estate (General/Diversified)",
    "reit - mortgage": "R.E.I.T.",
    "reit - retail": "R.E.I.T.",
    "reit - residential": "R.E.I.T.",
    "reit - office": "R.E.I.T.",
    "reit - industrial": "R.E.I.T.",
    "reit - healthcare facilities": "R.E.I.T.",
    "reit - hotel & motel": "R.E.I.T.",
    "reit - specialty": "R.E.I.T.",
    "reit - diversified": "R.E.I.T.",
    # Education
    "education & training services": "Education",
}

# GICS sector -> composing Damodaran groups (equal-weighted sector benchmark;
# Damodaran publishes at industry granularity only). Keys = in-house sector labels.
_SECTOR_TO_DAMODARAN: dict[str, list[str]] = {
    "Technology": [
        "Computers/Peripherals", "Computer Services", "Semiconductor",
        "Semiconductor Equip", "Software (System & Application)",
        "Software (Internet)", "Software (Entertainment)",
        "Electronics (General)", "Electronics (Consumer & Office)",
        "Information Services"],
    "Financial Services": [
        "Bank (Money Center)", "Banks (Regional)", "Brokerage & Investment Banking",
        "Investments & Asset Management", "Financial Svcs. (Non-bank & Insurance)",
        "Insurance (General)", "Insurance (Life)", "Insurance (Prop/Cas.)",
        "Reinsurance"],
    "Healthcare": [
        "Drugs (Pharmaceutical)", "Drugs (Biotechnology)", "Healthcare Products",
        "Healthcare Support Services", "Hospitals/Healthcare Facilities",
        "Heathcare Information and Technology"],
    "Energy": [
        "Oil/Gas (Integrated)", "Oil/Gas (Production and Exploration)",
        "Oil/Gas Distribution", "Oilfield Svcs/Equip.", "Coal & Related Energy",
        "Green & Renewable Energy"],
    "Consumer Cyclical": [
        "Apparel", "Auto & Truck", "Auto Parts", "Retail (Special Lines)",
        "Retail (General)", "Retail (Automotive)", "Retail (Building Supply)",
        "Retail (Distributors)", "Hotel/Gaming", "Restaurant/Dining",
        "Recreation", "Homebuilding", "Furn/Home Furnishings", "Shoe",
        "Rubber& Tires"],
    "Consumer Defensive": [
        "Beverage (Alcoholic)", "Beverage (Soft)", "Food Processing",
        "Food Wholesalers", "Household Products", "Retail (Grocery and Food)",
        "Tobacco"],
    "Industrials": [
        "Aerospace/Defense", "Machinery", "Electrical Equipment",
        "Engineering/Construction", "Construction Supplies", "Air Transport",
        "Transportation", "Trucking", "Transportation (Railroads)",
        "Shipbuilding & Marine", "Environmental & Waste Services",
        "Business & Consumer Services", "Office Equipment & Services"],
    "Basic Materials": [
        "Chemical (Basic)", "Chemical (Diversified)", "Chemical (Specialty)",
        "Metals & Mining", "Steel", "Precious Metals", "Paper/Forest Products",
        "Packaging & Container", "Building Materials"],
    "Communication Services": [
        "Advertising", "Broadcasting", "Cable TV", "Entertainment",
        "Publishing & Newspapers", "Telecom (Wireless)", "Telecom. Services",
        "Telecom. Equipment"],
    "Utilities": ["Utility (General)", "Utility (Water)", "Power"],
    "Real Estate": [
        "R.E.I.T.", "Real Estate (Development)",
        "Real Estate (General/Diversified)", "Real Estate (Operations & Services)",
        "Retail (REITs)"],
}


@dataclass(frozen=True)
class IndustryBenchmark:
    """Damodaran benchmark metrics for one industry group (subset may be None)."""

    industry: str
    region: str
    metrics: dict[str, float]

    def get(self, metric: str) -> float | None:
        return self.metrics.get(metric)


def _norm(s: object) -> str:
    return str(s).strip().lower()


def alias_industry(industry: str | None) -> str | None:
    """Map a yfinance industry label to its Damodaran group, or None."""
    if not industry:
        return None
    return _INDUSTRY_ALIASES.get(_norm(industry))


def all_group_names(conn: sqlite3.Connection) -> list[str]:
    """Every Damodaran industry group present in the current snapshot (for the
    LLM classification prompt and response validation)."""
    try:
        rows = conn.execute(
            "SELECT DISTINCT industry FROM damodaran_industry "
            "WHERE dataset = 'beta' ORDER BY industry").fetchall()
    except sqlite3.OperationalError:
        return []
    return [r[0] for r in rows]


class DamodaranIndustryData:
    """Loader/parser/persistence for Damodaran's industry benchmark files."""

    def __init__(self, *, region: str = "US", cache_dir: str | None = None) -> None:
        self.region = region
        self.cache_dir = cache_dir

    # ── parsing ──────────────────────────────────────────────────────────────
    def _read_xls(self, filename: str, *, force: bool, max_age_days: float,
                  base: str = _BASE):
        """Return a pandas DataFrame of the first sheet, or None on any failure."""
        try:
            import pandas as pd  # noqa: PLC0415
        except ImportError:
            return None
        result = cached_download(
            base + filename, f"damodaran_{filename}",
            cache_dir=self.cache_dir, max_age_days=max_age_days, force=force,
        )
        if result.data is None:
            return None
        for sheet in ("Industry Averages", 0):
            try:
                return pd.read_excel(io.BytesIO(result.data), sheet_name=sheet,
                                     header=None, engine="xlrd")
            except Exception:  # noqa: BLE001 — try next sheet / give up
                continue
        return None

    @staticmethod
    def _find_header_row(df) -> int | None:
        for i in range(min(20, len(df))):
            cells = [_norm(c) for c in df.iloc[i].tolist()]
            if any(c.startswith("industry") for c in cells):
                return i
        return None

    def _extract_benchmarks(self, df, metric_map) -> list[IndustryBenchmark]:
        """Turn a loaded sheet (current OR archived — same layout) into
        per-industry benchmarks."""
        if df is None:
            return []
        hdr = self._find_header_row(df)
        if hdr is None:
            return []
        headers = [_norm(c) for c in df.iloc[hdr].tolist()]

        ind_col = next((j for j, h in enumerate(headers)
                        if h.startswith("industry")), None)
        if ind_col is None:
            return []

        resolved: dict[str, int] = {}
        for metric, fragments in metric_map:
            for frag in fragments:
                j = next((jj for jj, h in enumerate(headers)
                          if frag in h and jj != ind_col), None)
                if j is not None:
                    resolved[metric] = j
                    break

        out: list[IndustryBenchmark] = []
        for i in range(hdr + 1, len(df)):
            row = df.iloc[i].tolist()
            name = row[ind_col]
            if name is None or _norm(name) in ("", "nan", "total market",
                                               "total market (without financials)"):
                continue
            metrics: dict[str, float] = {}
            for metric, j in resolved.items():
                try:
                    v = float(row[j])
                except (ValueError, TypeError, IndexError):
                    continue
                if v == v:  # not NaN
                    metrics[metric] = v
            if metrics:
                out.append(IndustryBenchmark(str(name).strip(), self.region, metrics))
        return out

    def parse_dataset(
        self, dataset: str, *, force: bool = False, max_age_days: float = 30.0
    ) -> list[IndustryBenchmark]:
        """Parse the CURRENT Damodaran dataset into per-industry benchmarks."""
        if dataset not in _DATASETS:
            return []
        filename, metric_map = _DATASETS[dataset]
        df = self._read_xls(filename, force=force, max_age_days=max_age_days)
        return self._extract_benchmarks(df, metric_map)

    def parse_dataset_year(
        self, dataset: str, year: int, *, force: bool = False, max_age_days: float = 90.0
    ) -> list[IndustryBenchmark]:
        """Parse an ARCHIVED prior-year dataset (e.g. betas20.xls for 2020)."""
        if dataset not in _DATASETS:
            return []
        filename, metric_map = _DATASETS[dataset]
        stem = filename[:-4] if filename.endswith(".xls") else filename
        archive_name = f"{stem}{year % 100:02d}.xls"
        df = self._read_xls(archive_name, force=force, max_age_days=max_age_days,
                            base=_ARCHIVE_BASE)
        return self._extract_benchmarks(df, metric_map)

    # ── persistence ──────────────────────────────────────────────────────────
    def refresh(
        self, conn: sqlite3.Connection, *, datasets: list[str] | None = None,
        force: bool = False,
    ) -> dict[str, int]:
        """Parse and persist the requested datasets. Returns {dataset: rows}."""
        ensure_betas_schema(conn)
        asof = _dt.date.today().isoformat()
        results: dict[str, int] = {}
        for dataset in (datasets or list(_DATASETS)):
            benchmarks = self.parse_dataset(dataset, force=force)
            n = 0
            for b in benchmarks:
                for metric, value in b.metrics.items():
                    conn.execute(
                        """
                        INSERT INTO damodaran_industry
                            (region, industry, dataset, metric, value, asof)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(region, industry, dataset, metric)
                        DO UPDATE SET value=excluded.value, asof=excluded.asof
                        """,
                        [b.region, b.industry, dataset, metric, value, asof],
                    )
                    n += 1
            results[dataset] = n
        conn.commit()
        return results

    def refresh_history(
        self, conn: sqlite3.Connection, *, years, datasets: list[str] | None = None,
        force: bool = False,
    ) -> dict[int, int]:
        """Parse + persist the ARCHIVED yearly files into damodaran_industry_hist,
        giving an unbiased benchmark for every historical year. Each (dataset,
        year) is failure-isolated — a missing archive contributes nothing."""
        ensure_betas_schema(conn)
        results: dict[int, int] = {}
        for year in years:
            now = _dt.datetime.now().isoformat(timespec="seconds")
            n = 0
            for dataset in (datasets or list(_DATASETS)):
                try:
                    benchmarks = self.parse_dataset_year(dataset, year, force=force)
                except Exception:  # noqa: BLE001 — one bad file must not abort the rest
                    benchmarks = []
                for b in benchmarks:
                    for metric, value in b.metrics.items():
                        conn.execute(
                            """INSERT INTO damodaran_industry_hist
                                   (region, industry, dataset, metric, year, value, fetched_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)
                               ON CONFLICT(region, industry, dataset, metric, year)
                               DO UPDATE SET value=excluded.value, fetched_at=excluded.fetched_at""",
                            [b.region, b.industry, dataset, metric, year, value, now],
                        )
                        n += 1
            results[year] = n
            conn.commit()
        return results

    # ── reads / derived ──────────────────────────────────────────────────────
    def industry_benchmark(
        self, conn: sqlite3.Connection, industry: str, *, year: int | None = None,
    ) -> IndustryBenchmark | None:
        """Damodaran metrics for an industry. ``year=None`` = current snapshot;
        a year reads the nearest archived year <= it. Resolution order: alias
        (yfinance -> Damodaran) then exact then fuzzy."""
        if not industry:
            return None
        alias = _INDUSTRY_ALIASES.get(_norm(industry))
        for name in ([alias] if alias else []) + [industry]:
            bench = self._lookup_industry(conn, name, year=year)
            if bench is not None:
                return bench
        return None

    def _lookup_industry(
        self, conn: sqlite3.Connection, industry: str, *, fuzzy: bool = True,
        year: int | None = None,
    ) -> IndustryBenchmark | None:
        """Exact (optionally then fuzzy) lookup of one Damodaran group.
        ``fuzzy=False`` is used for sector aggregation so a group can't be
        double-counted under a similar name."""
        if year is not None:
            return self._lookup_industry_hist(conn, industry, year, fuzzy=fuzzy)
        try:
            rows = conn.execute(
                """SELECT industry, dataset, metric, value FROM damodaran_industry
                   WHERE region = ? AND lower(industry) = lower(?)""",
                [self.region, industry],
            ).fetchall()
            if not rows and fuzzy:  # fuzzy: substring either direction
                rows = conn.execute(
                    """SELECT industry, dataset, metric, value FROM damodaran_industry
                       WHERE region = ? AND (lower(industry) LIKE '%'||lower(?)||'%'
                                          OR lower(?) LIKE '%'||lower(industry)||'%')""",
                    [self.region, industry, industry],
                ).fetchall()
        except sqlite3.OperationalError:
            return None
        return self._rows_to_benchmark(rows)

    def _lookup_industry_hist(
        self, conn: sqlite3.Connection, industry: str, year: int, *, fuzzy: bool = True,
    ) -> IndustryBenchmark | None:
        """Historical lookup: the nearest archived year <= ``year``."""
        try:
            row = conn.execute(
                """SELECT MAX(year) FROM damodaran_industry_hist
                   WHERE region=? AND lower(industry)=lower(?) AND year<=?""",
                [self.region, industry, year]).fetchone()
            matched, yr = industry, (row[0] if row else None)
            if yr is None and fuzzy:
                row = conn.execute(
                    """SELECT industry, MAX(year) FROM damodaran_industry_hist
                       WHERE region=? AND year<=?
                         AND (lower(industry) LIKE '%'||lower(?)||'%'
                              OR lower(?) LIKE '%'||lower(industry)||'%')
                       GROUP BY industry ORDER BY MAX(year) DESC LIMIT 1""",
                    [self.region, year, industry, industry]).fetchone()
                if row:
                    matched, yr = row[0], row[1]
            if yr is None:
                return None
            rows = conn.execute(
                """SELECT industry, dataset, metric, value FROM damodaran_industry_hist
                   WHERE region=? AND lower(industry)=lower(?) AND year=?""",
                [self.region, matched, yr]).fetchall()
        except sqlite3.OperationalError:
            return None
        return self._rows_to_benchmark(rows)

    def _rows_to_benchmark(self, rows) -> IndustryBenchmark | None:
        if not rows:
            return None
        name = rows[0][0]
        metrics: dict[str, float] = {}
        for _name, _dataset, metric, value in rows:
            if value is not None:
                metrics[metric] = float(value)
        return IndustryBenchmark(name, self.region, metrics)

    def sector_benchmark(
        self, conn: sqlite3.Connection, sector: str, *, year: int | None = None,
    ) -> IndustryBenchmark | None:
        """Equal-weighted sector benchmark averaged over the composing Damodaran
        groups. None if the sector is unknown or none of its groups are present."""
        groups = _SECTOR_TO_DAMODARAN.get(sector)
        if not groups:
            return None
        acc: dict[str, float] = {}
        cnt: dict[str, int] = {}
        for g in groups:
            b = self._lookup_industry(conn, g, fuzzy=False, year=year)
            if b is None:
                continue
            for k, v in b.metrics.items():
                acc[k] = acc.get(k, 0.0) + v
                cnt[k] = cnt.get(k, 0) + 1
        if not acc:
            return None
        metrics = {k: acc[k] / cnt[k] for k in acc}
        return IndustryBenchmark(sector, self.region, metrics)
