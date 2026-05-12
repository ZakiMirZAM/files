"""
financial_db.py

Core system for:
  1. Ingesting Excel sheets (your exact format) into a SQLite database
  2. Daily updates for new fiscal years via yfinance
  3. TTM (trailing twelve months) retrieval via yfinance
  4. A query API that mirrors yfinance's interface

Excel format assumed:
  A1       = Year label
  Row 2    = Column headers (Ticker, Name, Sector, ... all metrics)
  A3+      = Ticker column; data starts at B3

Usage:
  from financial_db import FinancialDB
  db = FinancialDB("financials.db")
  db.ingest_excel("AAPL.xlsx")          # one-time load
  db.update_all()                        # run daily
  df = db.get("AAPL")                    # all historical years
  df = db.get("AAPL", year=2023)         # specific year
  ttm = db.get_ttm("AAPL")              # live TTM via yfinance
  val = db.get_metric("AAPL", "Revenue", year=2022)
"""

import sqlite3
import os
import warnings
import pandas as pd
import yfinance as yf
from datetime import datetime, date
from pathlib import Path

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Column definitions
# ---------------------------------------------------------------------------

EXCEL_COLUMNS = [
    "Ticker", "Name", "Sector", "Industry", "Date", "Revenue",
    "Reported Currency", "Period", "Cik", "Filling Date", "Accepted Date",
    "Calendar Year", "Cost Of Revenue", "Gross Profit", "Gross Profit Ratio",
    "Research And Development Expenses", "General And Administrative Expenses",
    "Selling And Marketing Expenses", "Other Expenses", "Operating Expenses",
    "Cost And Expenses", "Interest Expense", "Depreciation And Amortization",
    "EBITDA", "EBITDA Ratio", "Operating Income", "Operating Income Ratio",
    "Total Other Income Expenses Net", "Income Before Tax",
    "Income Before Tax Ratio", "Income Tax Expense", "Interest Income",
    "Net Income", "Net Income Ratio", "EPS", "EPS Diluted",
    "Weighted Average Shs Out", "Weighted Average Shs Out Dil",
    "Selling General And Administrative Expenses", "Cash And Cash Equivalents",
    "Capital Lease Obligations", "Short Term Investments",
    "Cash And Short Term Investments", "Net Receivables", "Inventory",
    "Other Current Assets", "Total Current Assets",
    "Property Plant Equipment Net", "Goodwill", "Intangible Assets",
    "Goodwill And Intangible Assets", "Long Term Investments", "Tax Assets",
    "Other Non Current Assets", "Total Non Current Assets", "Other Assets",
    "Total Assets", "Account Payables", "Short Term Debt", "Tax Payables",
    "Deferred Revenue", "Other Current Liabilities", "Total Current Liabilities",
    "Long Term Debt", "Deferred Revenue Non Current",
    "Deferred Tax Liabilities Non Current", "Other Non Current Liabilities",
    "Total Non Current Liabilities", "Other Liabilities", "Total Liabilities",
    "Minority Interest", "Total Equity", "Total Liabilities and Total Equity",
    "Common Stock", "Preferred Stock", "Retained Earnings",
    "Accumulated Other Comprehensive Income Loss", "Other Total Stockholders Equity",
    "Total Stockholders Equity", "Total Liabilities And Stockholders Equity",
    "Total Investments", "Total Debt", "Net Debt", "Minority Interest Preferred Stock",
    "Deferred Income Tax", "Net Income Cashflow",
    "Depreciation and Amortization Cashflow", "Stock Based Compensation",
    "Change In Working Capital", "Accounts Receivables", "Accounts Payables",
    "Other Working Capital", "Other Non Cash Items",
    "Net Cash Provided By Operating Activities",
    "Investments In Property Plant And Equipment", "Acquisitions Net",
    "Purchases Of Investments", "Sales Maturities Of Investments",
    "Other Investing Activities", "Net Cash Used For Investing Activities",
    "Debt Repayment", "Common Stock Issued", "Common Stock Repurchased",
    "Dividends Paid", "Other Financing Activities",
    "Net Cash Used Provided By Financing Activities",
    "Effect Of Forex Changes On Cash", "Net Change In Cash",
    "Cash At End Of Period", "Cash At Beginning Of Period",
    "Operating Cash Flow", "Capital Expenditure", "Free Cash Flow",
    "Inventory Cashflow", "Revenue Per Share", "Net Income Per Share",
    "Operating Cash Flow Per Share", "Free Cash Flow Per Share", "Cash Per Share",
    "Book Value Per Share", "Tangible Book Value Per Share",
    "Shareholders Equity Per Share", "Interest Debt Per Share", "Market Cap",
    "Enterprise Value", "PE Ratio", "Price To Sales Ratio", "POCF Ratio",
    "PFCF Ratio", "PB Ratio", "PTB Ratio", "EV To Sales",
    "Enterprise Value Over EBITDA", "EV To Operating Cash Flow",
    "EV To Free Cash Flow", "Earnings Yield", "Free Cash Flow Yield",
    "Debt To Equity", "Debt To Assets", "Net Debt To EBITDA", "Current Ratio",
    "Interest Coverage", "Income Quality", "Dividend Yield", "Payout Ratio",
    "Sales General And Administrative To Revenue",
    "Research And Development To Revenue", "Intangibles To Total Assets",
    "Capex To Operating Cash Flow", "Capex To Revenue", "Capex To Depreciation",
    "Stock Based Compensation To Revenue", "Graham Number", "ROIC",
    "Return On Tangible Assets", "Graham Net Net", "Working Capital",
    "Tangible Asset Value", "Net Current Asset Value", "Average Receivables",
    "Average Payables", "Average Inventory", "Days Sales Outstanding",
    "Days Payables Outstanding", "Days Of Inventory On Hand",
    "Receivables Turnover", "Payables Turnover", "Inventory Turnover", "ROE",
    "Capex Per Share", "Dividend", "Revenue Growth", "Gross Profit Growth",
    "EBIT growth", "Operating Income Growth", "Net Income Growth", "EPS Growth",
    "EPS Diluted Growth", "Weighted Average Shares Growth",
    "Weighted Average Shares Diluted Growth", "Dividends Per Share Growth",
    "Operating Cash Flow Growth", "Free Cash Flow Growth",
    "Ten Y Revenue Growth Per Share", "Five Y Revenue Growth Per Share",
    "Three Y Revenue Growth Per Share", "Ten Y Operating CF Growth Per Share",
    "Five Y Operating CF Growth Per Share", "Three Y Operating CF Growth Per Share",
    "Ten Y Net Income Growth Per Share", "Five Y Net Income Growth Per Share",
    "Three Y Net Income Growth Per Share",
    "Ten Y Shareholders Equity Growth Per Share",
    "Five Y Shareholders Equity Growth Per Share",
    "Three Y Shareholders Equity Growth Per Share",
    "Ten Y Dividend Per Share Growth Per Share",
    "Five Y Dividend Per Share Growth Per Share",
    "Three Y Dividend Per Share Growth Per Share",
    "Receivables Growth", "Inventory Growth", "Asset Growth",
    "Book Value per Share Growth", "Debt Growth", "RD Expense Growth",
    "SGA Expenses Growth"
]

# Metrics yfinance can supply for annual/TTM updates
# Maps our column name -> yfinance key (income_stmt, balance_sheet, cashflow)
YF_INCOME_MAP = {
    "Revenue":                          "Total Revenue",
    "Cost Of Revenue":                  "Cost Of Revenue",
    "Gross Profit":                     "Gross Profit",
    "Research And Development Expenses":"Research And Development",
    "General And Administrative Expenses": "General And Administrative Expense",
    "Selling And Marketing Expenses":   "Selling And Marketing Expense",
    "Operating Expenses":               "Operating Expense",
    "Operating Income":                 "Operating Income",
    "Interest Expense":                 "Interest Expense",
    "EBITDA":                           "EBITDA",
    "Income Before Tax":                "Pretax Income",
    "Income Tax Expense":               "Tax Provision",
    "Net Income":                       "Net Income",
    "EPS":                              "Basic EPS",
    "EPS Diluted":                      "Diluted EPS",
    "Depreciation And Amortization":    "Reconciled Depreciation",
}

YF_BALANCE_MAP = {
    "Cash And Cash Equivalents":        "Cash And Cash Equivalents",
    "Short Term Investments":           "Other Short Term Investments",
    "Net Receivables":                  "Receivables",
    "Inventory":                        "Inventory",
    "Total Current Assets":             "Current Assets",
    "Property Plant Equipment Net":     "Net PPE",
    "Goodwill":                         "Goodwill",
    "Intangible Assets":                "Other Intangible Assets",
    "Total Assets":                     "Total Assets",
    "Account Payables":                 "Payables And Accrued Expenses",
    "Short Term Debt":                  "Current Debt And Capital Lease Obligation",
    "Total Current Liabilities":        "Current Liabilities",
    "Long Term Debt":                   "Long Term Debt And Capital Lease Obligation",
    "Total Liabilities":                "Total Liabilities Net Minority Interest",
    "Total Equity":                     "Stockholders Equity",
    "Total Stockholders Equity":        "Stockholders Equity",
    "Retained Earnings":                "Retained Earnings",
    "Total Debt":                       "Total Debt",
}

YF_CASHFLOW_MAP = {
    "Operating Cash Flow":              "Operating Cash Flow",
    "Capital Expenditure":              "Capital Expenditure",
    "Free Cash Flow":                   "Free Cash Flow",
    "Depreciation and Amortization Cashflow": "Depreciation And Amortization",
    "Stock Based Compensation":         "Stock Based Compensation",
    "Net Cash Provided By Operating Activities": "Operating Cash Flow",
    "Net Cash Used For Investing Activities":    "Investing Cash Flow",
    "Net Cash Used Provided By Financing Activities": "Financing Cash Flow",
}


# ---------------------------------------------------------------------------
# FinancialDB
# ---------------------------------------------------------------------------

class FinancialDB:
    """
    SQLite-backed store for annual financial data.
    Mirrors a yfinance-like query interface and supports live TTM data.
    """

    def __init__(self, db_path: str = "financials.db"):
        self.db_path = db_path
        self._init_db()

    # ------------------------------------------------------------------
    # DB setup
    # ------------------------------------------------------------------

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._connect() as conn:
            cols_sql = ",\n  ".join(
                f'"{c}" TEXT' if c in ("Ticker", "Name", "Sector", "Industry",
                                        "Date", "Reported Currency", "Period",
                                        "Cik", "Filling Date", "Accepted Date")
                else f'"{c}" REAL'
                for c in EXCEL_COLUMNS
                if c not in ("Ticker", "Calendar Year")
            )
            conn.execute(f"""
                CREATE TABLE IF NOT EXISTS financials (
                  Ticker TEXT NOT NULL,
                  "Calendar Year" INTEGER NOT NULL,
                  {cols_sql},
                  last_updated TEXT,
                  PRIMARY KEY (Ticker, "Calendar Year")
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tickers (
                  ticker TEXT PRIMARY KEY,
                  name TEXT,
                  sector TEXT,
                  industry TEXT,
                  last_updated TEXT
                )
            """)
            conn.commit()

    # ------------------------------------------------------------------
    # Excel ingestion
    # ------------------------------------------------------------------

    def ingest_excel(self, filepath: str, verbose: bool = True) -> int:
        """
        Load one Excel file in your format into the database.
        Returns number of rows inserted/updated.
        """
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(filepath)

        wb_dict = pd.read_excel(
            filepath,
            sheet_name=None,
            header=None,
            dtype=str
        )

        total = 0
        for sheet_name, raw in wb_dict.items():
            if raw.shape[0] < 3:
                continue

            # Row 1 (index 1) has column headers
            headers = raw.iloc[1].tolist()

            # Normalize headers to match EXCEL_COLUMNS (case-insensitive strip)
            header_map = {}
            for i, h in enumerate(headers):
                if pd.isna(h):
                    continue
                for col in EXCEL_COLUMNS:
                    if str(h).strip().lower() == col.strip().lower():
                        header_map[i] = col
                        break

            if not header_map:
                continue

            data_rows = raw.iloc[2:]  # Row index 2+ is data

            inserted = 0
            with self._connect() as conn:
                for _, row in data_rows.iterrows():
                    record = {}
                    for idx, col_name in header_map.items():
                        val = row.iloc[idx] if idx < len(row) else None
                        if pd.isna(val) or str(val).strip() in ("", "nan", "None"):
                            record[col_name] = None
                        else:
                            record[col_name] = str(val).strip()

                    ticker = record.get("Ticker")
                    cal_year = record.get("Calendar Year")

                    if not ticker or not cal_year:
                        continue

                    # Convert numeric fields
                    for col in EXCEL_COLUMNS:
                        if col in ("Ticker", "Name", "Sector", "Industry",
                                   "Date", "Reported Currency", "Period",
                                   "Cik", "Filling Date", "Accepted Date",
                                   "Calendar Year"):
                            continue
                        v = record.get(col)
                        if v is not None:
                            try:
                                record[col] = float(v)
                            except (ValueError, TypeError):
                                record[col] = None

                    record["last_updated"] = datetime.now().isoformat()

                    cols = ["Ticker", "Calendar Year"] + [
                        c for c in EXCEL_COLUMNS if c not in ("Ticker", "Calendar Year")
                    ] + ["last_updated"]

                    vals = [record.get(c) for c in cols]

                    placeholders = ", ".join(["?" for _ in cols])
                    col_sql = ", ".join([f'"{c}"' for c in cols])
                    update_sql = ", ".join([
                        f'"{c}" = excluded."{c}"'
                        for c in cols if c not in ("Ticker", "Calendar Year")
                    ])

                    conn.execute(f"""
                        INSERT INTO financials ({col_sql})
                        VALUES ({placeholders})
                        ON CONFLICT(Ticker, "Calendar Year") DO UPDATE SET {update_sql}
                    """, vals)

                    # Update tickers table
                    conn.execute("""
                        INSERT INTO tickers (ticker, name, sector, industry, last_updated)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(ticker) DO UPDATE SET
                          name = excluded.name,
                          sector = excluded.sector,
                          industry = excluded.industry,
                          last_updated = excluded.last_updated
                    """, [
                        ticker,
                        record.get("Name"),
                        record.get("Sector"),
                        record.get("Industry"),
                        datetime.now().isoformat()
                    ])

                    inserted += 1

                conn.commit()

            if verbose:
                print(f"  Sheet '{sheet_name}': {inserted} rows upserted")
            total += inserted

        return total

    def ingest_directory(self, folder: str, verbose: bool = True) -> int:
        """Load all .xlsx files in a folder."""
        folder = Path(folder)
        total = 0
        for f in sorted(folder.glob("*.xlsx")):
            if verbose:
                print(f"Ingesting {f.name}...")
            total += self.ingest_excel(str(f), verbose=verbose)
        return total

    # ------------------------------------------------------------------
    # yfinance annual update
    # ------------------------------------------------------------------

    def _fetch_yf_annual(self, ticker: str) -> list[dict]:
        """
        Pull annual financials from yfinance.
        Returns a list of dicts, one per fiscal year reported by yfinance.
        """
        t = yf.Ticker(ticker)
        try:
            inc  = t.income_stmt
            bal  = t.balance_sheet
            cf   = t.cashflow
            info = t.info
        except Exception as e:
            print(f"  yfinance error for {ticker}: {e}")
            return []

        # Collect all fiscal year-end dates yfinance has data for
        yf_years = {}  # year (int) -> fiscal year-end date string
        for df in [inc, bal, cf]:
            if df is not None and not df.empty:
                for col in df.columns:
                    try:
                        dt = pd.to_datetime(col)
                        yf_years[dt.year] = str(col)[:10]
                    except Exception:
                        pass

        if not yf_years:
            return []

        records = []
        for yr in sorted(yf_years):

            fiscal_date = yf_years[yr]

            def get_for_year(df, key, target_yr=yr):
                if df is None or df.empty or key not in df.index:
                    return None
                for col in df.columns:
                    try:
                        if pd.to_datetime(col).year == target_yr:
                            v = df.loc[key, col]
                            return float(v) if pd.notna(v) else None
                    except Exception:
                        pass
                return None

            rec = {
                "Ticker":        ticker.upper(),
                "Calendar Year": yr,
                "Date":          fiscal_date,
                "Period":        "FY",
                "Name":          info.get("longName"),
                "Sector":        info.get("sector"),
                "Industry":      info.get("industry"),
                "last_updated":  datetime.now().isoformat(),
            }

            for our_col, yf_key in YF_INCOME_MAP.items():
                rec[our_col] = get_for_year(inc, yf_key)

            for our_col, yf_key in YF_BALANCE_MAP.items():
                rec[our_col] = get_for_year(bal, yf_key)

            for our_col, yf_key in YF_CASHFLOW_MAP.items():
                if rec.get(our_col) is None:
                    rec[our_col] = get_for_year(cf, yf_key)

            # Derived ratios
            rev   = rec.get("Revenue")
            gp    = rec.get("Gross Profit")
            ni    = rec.get("Net Income")
            oi    = rec.get("Operating Income")
            ocf   = rec.get("Operating Cash Flow")
            capex = rec.get("Capital Expenditure")

            if rev and gp:
                rec["Gross Profit Ratio"] = gp / rev
            if rev and ni:
                rec["Net Income Ratio"] = ni / rev
            if rev and oi:
                rec["Operating Income Ratio"] = oi / rev
            if ocf and capex:
                rec["Free Cash Flow"] = rec.get("Free Cash Flow") or (ocf + capex)

            records.append(rec)

        return records

    def update_ticker(self, ticker: str, verbose: bool = True) -> int:
        """
        Check yfinance for fiscal years not yet in the database and insert them.
        Never modifies rows that already exist -- only adds genuinely new years.
        Returns the number of new year-rows inserted.
        """
        ticker = ticker.upper()

        # What years do we already have for this ticker?
        with self._connect() as conn:
            existing_years = {
                row[0] for row in conn.execute(
                    'SELECT "Calendar Year" FROM financials WHERE Ticker = ?',
                    [ticker]
                )
            }

        # What years does yfinance now report?
        yf_records = self._fetch_yf_annual(ticker)

        if not yf_records:
            return 0

        # Filter to only years that are not already stored
        new_records = [r for r in yf_records if r["Calendar Year"] not in existing_years]

        if not new_records:
            if verbose:
                print(f"  {ticker}: no new fiscal years found")
            return 0

        # Insert each genuinely new year
        with self._connect() as conn:
            for rec in new_records:
                cols = list(rec.keys())
                vals = [rec[c] for c in cols]
                col_sql     = ", ".join([f'"{c}"' for c in cols])
                placeholders = ", ".join(["?" for _ in cols])

                conn.execute(f"""
                    INSERT OR IGNORE INTO financials ({col_sql})
                    VALUES ({placeholders})
                """, vals)

                if verbose:
                    print(f"  {ticker}: added {rec['Calendar Year']} "
                          f"(fiscal year ending {rec.get('Date', 'unknown')})")

            # Update tickers table with latest info
            if yf_records:
                latest = yf_records[-1]
                conn.execute("""
                    INSERT INTO tickers (ticker, name, sector, industry, last_updated)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                      name         = excluded.name,
                      sector       = excluded.sector,
                      industry     = excluded.industry,
                      last_updated = excluded.last_updated
                """, [
                    ticker,
                    latest.get("Name"),
                    latest.get("Sector"),
                    latest.get("Industry"),
                    datetime.now().isoformat()
                ])

            conn.commit()

        return len(new_records)

    def update_all(self, verbose: bool = True) -> dict:
        """
        Run update_ticker for every ticker in the database.
        Only adds new fiscal years -- never overwrites existing data.
        Returns a dict of ticker -> number of new years added.
        """
        with self._connect() as conn:
            tickers = [
                row[0] for row in conn.execute(
                    "SELECT DISTINCT ticker FROM tickers ORDER BY ticker"
                )
            ]

        if verbose:
            print(f"Checking {len(tickers)} tickers for new fiscal year data...")

        results = {}
        for t in tickers:
            try:
                n = self.update_ticker(t, verbose=verbose)
                results[t] = n
            except Exception as e:
                if verbose:
                    print(f"  {t} failed: {e}")
                results[t] = -1

        new_years_total = sum(v for v in results.values() if v > 0)
        if verbose:
            print(f"Update complete. {new_years_total} new year-rows added across "
                  f"{len(tickers)} tickers.")

        return results

    # ------------------------------------------------------------------
    # TTM (trailing twelve months) via yfinance -- never uses DB
    # ------------------------------------------------------------------

    def get_ttm(self, ticker: str) -> dict:
        """
        Pull trailing twelve months data directly from yfinance.
        Returns a flat dict of metric -> value.
        Covers income statement, balance sheet, cash flow, and ratios from info.
        """
        t = yf.Ticker(ticker)
        try:
            inc  = t.quarterly_income_stmt
            bal  = t.quarterly_balance_sheet
            cf   = t.quarterly_cashflow
            info = t.info
        except Exception as e:
            raise RuntimeError(f"yfinance error for {ticker}: {e}")

        def ttm_sum(df, key):
            """Sum last 4 quarters."""
            if df is None or df.empty or key not in df.index:
                return None
            row = df.loc[key].dropna()
            if len(row) == 0:
                return None
            last4 = row.iloc[:4]
            return float(last4.sum())

        def latest(df, key):
            """Most recent quarter value (for balance sheet items)."""
            if df is None or df.empty or key not in df.index:
                return None
            row = df.loc[key].dropna()
            return float(row.iloc[0]) if not row.empty else None

        result = {
            "Ticker":   ticker.upper(),
            "Period":   "TTM",
            "Date":     date.today().isoformat(),
        }

        # Income statement -- sum last 4 quarters
        for our_col, yf_key in YF_INCOME_MAP.items():
            result[our_col] = ttm_sum(inc, yf_key)

        # Balance sheet -- most recent quarter (snapshot)
        for our_col, yf_key in YF_BALANCE_MAP.items():
            result[our_col] = latest(bal, yf_key)

        # Cash flow -- sum last 4 quarters
        for our_col, yf_key in YF_CASHFLOW_MAP.items():
            if result.get(our_col) is None:
                result[our_col] = ttm_sum(cf, yf_key)

        # Additional live metrics from info
        info_fields = {
            "Market Cap":           "marketCap",
            "Enterprise Value":     "enterpriseValue",
            "PE Ratio":             "trailingPE",
            "Price To Sales Ratio": "priceToSalesTrailing12Months",
            "PB Ratio":             "priceToBook",
            "EPS":                  "trailingEps",
            "Dividend Yield":       "dividendYield",
            "Current Ratio":        "currentRatio",
            "Debt To Equity":       "debtToEquity",
            "ROE":                  "returnOnEquity",
            "ROIC":                 "returnOnAssets",
            "Operating Cash Flow":  "operatingCashflow",
            "Free Cash Flow":       "freeCashflow",
            "Revenue":              "totalRevenue",
            "Gross Profit":         "grossProfits",
            "EBITDA":               "ebitda",
        }

        for our_col, info_key in info_fields.items():
            if result.get(our_col) is None:
                v = info.get(info_key)
                if v is not None:
                    try:
                        result[our_col] = float(v)
                    except (ValueError, TypeError):
                        pass

        # Derived ratios
        rev = result.get("Revenue")
        gp  = result.get("Gross Profit")
        ni  = result.get("Net Income")
        oi  = result.get("Operating Income")

        if rev and gp:
            result["Gross Profit Ratio"] = gp / rev
        if rev and ni:
            result["Net Income Ratio"] = ni / rev
        if rev and oi:
            result["Operating Income Ratio"] = oi / rev

        ocf   = result.get("Operating Cash Flow")
        capex = result.get("Capital Expenditure")
        ebitda = result.get("EBITDA")

        if ocf and capex:
            result["Free Cash Flow"] = result.get("Free Cash Flow") or (ocf + capex)

        ev = result.get("Enterprise Value")
        if ev and ebitda:
            result["Enterprise Value Over EBITDA"] = ev / ebitda
        if ev and rev:
            result["EV To Sales"] = ev / rev
        if ev and ocf:
            result["EV To Operating Cash Flow"] = ev / ocf

        return result

    # ------------------------------------------------------------------
    # Query API (mirrors yfinance style)
    # ------------------------------------------------------------------

    def get(
        self,
        ticker: str,
        year: int = None,
        metrics: list[str] = None,
        as_dict: bool = False
    ) -> pd.DataFrame | dict:
        """
        Retrieve annual data for a ticker.

        Parameters
        ----------
        ticker  : Stock ticker (e.g. "AAPL")
        year    : Optional -- return only a specific calendar year
        metrics : Optional list of column names to return; all if None
        as_dict : If True, returns dict instead of DataFrame

        Returns
        -------
        DataFrame indexed by Calendar Year, or dict if as_dict=True
        """
        ticker = ticker.upper()
        where = ['Ticker = ?']
        params = [ticker]

        if year is not None:
            where.append('"Calendar Year" = ?')
            params.append(year)

        if metrics:
            select_cols = ', '.join(
                ['"Calendar Year"'] +
                [f'"{m}"' for m in metrics if m in EXCEL_COLUMNS]
            )
        else:
            select_cols = '*'

        sql = f"""
            SELECT {select_cols}
            FROM financials
            WHERE {' AND '.join(where)}
            ORDER BY "Calendar Year"
        """

        with self._connect() as conn:
            df = pd.read_sql_query(sql, conn, params=params)

        if df.empty:
            return {} if as_dict else df

        df = df.set_index("Calendar Year")
        df.index = df.index.astype(int)

        # Drop system columns from output
        for col in ["Ticker", "last_updated"]:
            if col in df.columns:
                df = df.drop(columns=[col])

        return df.to_dict() if as_dict else df

    def get_metric(
        self,
        ticker: str,
        metric: str,
        year: int = None
    ) -> pd.Series | float:
        """
        Retrieve a single metric for a ticker.

        Returns a scalar if year is specified, otherwise a Series indexed by year.
        """
        df = self.get(ticker, year=year, metrics=[metric])
        if df.empty:
            return None
        s = df[metric] if metric in df.columns else pd.Series(dtype=float)
        return float(s.iloc[0]) if year is not None and not s.empty else s

    def income_stmt(self, ticker: str) -> pd.DataFrame:
        """Return income statement metrics for all years, columns = years."""
        metrics = list(YF_INCOME_MAP.keys())
        df = self.get(ticker, metrics=metrics)
        return df[metrics].T if not df.empty else df

    def balance_sheet(self, ticker: str) -> pd.DataFrame:
        """Return balance sheet metrics for all years, columns = years."""
        metrics = list(YF_BALANCE_MAP.keys())
        df = self.get(ticker, metrics=metrics)
        return df[metrics].T if not df.empty else df

    def cashflow(self, ticker: str) -> pd.DataFrame:
        """Return cash flow metrics for all years, columns = years."""
        metrics = list(YF_CASHFLOW_MAP.keys())
        df = self.get(ticker, metrics=metrics)
        return df[metrics].T if not df.empty else df

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def list_tickers(self) -> list[str]:
        with self._connect() as conn:
            return [
                row[0] for row in conn.execute("SELECT ticker FROM tickers ORDER BY ticker")
            ]

    def coverage(self, ticker: str) -> list[int]:
        """Return list of calendar years available for a ticker."""
        with self._connect() as conn:
            return [
                row[0] for row in conn.execute(
                    'SELECT "Calendar Year" FROM financials WHERE Ticker = ? ORDER BY "Calendar Year"',
                    [ticker.upper()]
                )
            ]

    def info(self, ticker: str) -> dict:
        """Return name, sector, industry for a ticker."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT name, sector, industry FROM tickers WHERE ticker = ?",
                [ticker.upper()]
            ).fetchone()
        if row:
            return {"name": row[0], "sector": row[1], "industry": row[2]}
        return {}