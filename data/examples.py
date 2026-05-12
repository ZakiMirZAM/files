"""
examples.py

Demonstrates all major features of FinancialDB.
Run after ingesting at least one Excel file.
"""

from financial_db import FinancialDB

db = FinancialDB("financials.db")

# ── 1. Ingest Excel files ────────────────────────────────────────────────────
# Single file
# db.ingest_excel("AAPL.xlsx")

# Entire folder of Excel files
# db.ingest_directory("my_excel_folder/")


# ── 2. List what is in the database ─────────────────────────────────────────
tickers = db.list_tickers()
print("Tickers in DB:", tickers[:10])

# ── 3. Get all annual data for a company ────────────────────────────────────
# Returns a DataFrame indexed by Calendar Year
df = db.get("AAPL")
print(df[["Revenue", "Gross Profit", "Net Income", "Operating Cash Flow"]])

# ── 4. Get a specific year ───────────────────────────────────────────────────
row = db.get("AAPL", year=2023)
print(row)

# ── 5. Get a single metric (as Series or scalar) ────────────────────────────
revenue_series = db.get_metric("AAPL", "Revenue")
print(revenue_series)

revenue_2022 = db.get_metric("AAPL", "Revenue", year=2022)
print(f"AAPL 2022 Revenue: ${revenue_2022:,.0f}")

# ── 6. Get income statement / balance sheet / cash flow (yfinance-style) ────
inc = db.income_stmt("AAPL")       # columns = calendar years
bal = db.balance_sheet("AAPL")
cf  = db.cashflow("AAPL")
print(inc)

# ── 7. Sector / industry info ────────────────────────────────────────────────
print(db.info("AAPL"))
# {'name': 'Apple Inc.', 'sector': 'Technology', 'industry': 'Consumer Electronics'}

# ── 8. What years are covered for a ticker? ──────────────────────────────────
print(db.coverage("AAPL"))   # e.g. [2012, 2013, ..., 2025]

# ── 9. TTM data (live from yfinance, does NOT use DB) ───────────────────────
ttm = db.get_ttm("AAPL")
print(f"AAPL TTM Revenue:    ${ttm.get('Revenue'):,.0f}")
print(f"AAPL TTM Net Income: ${ttm.get('Net Income'):,.0f}")
print(f"AAPL TTM FCF:        ${ttm.get('Free Cash Flow'):,.0f}")
print(f"AAPL TTM P/E:        {ttm.get('PE Ratio'):.1f}x")
print(f"AAPL TTM EV/EBITDA:  {ttm.get('Enterprise Value Over EBITDA'):.1f}x")

# ── 10. Manual daily update ──────────────────────────────────────────────────
# db.update_ticker("AAPL")    # one ticker
# db.update_all()              # all tickers in DB
