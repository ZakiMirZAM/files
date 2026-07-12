"""Generate one annual CSV file per year (2012-2025) in ~/Downloads/excelfilesdb.

Layout per file (1-based row / column refs mirror Excel's grid):
  Row 1: year in A1, rest empty
  Row 2: 207 metric headers across A2..GY2 (Ticker .. SGA Expenses Growth)
  Seven formula rows at rows 3, 5001, 10001, 15001, 20001, 25001, 30001:
    Column B: =WISEPRICE(A{start}:A{end},B2:F2)
    Column G: =WISE(A{start}:A{end},G2:GY2,A1)
  Block ranges: A3:A5000, A5001:A10000, A10001:A15000, A15001:A20000,
                A20001:A25000, A25001:A30000, A30001:A31206
  All other rows up to row 31206 are blank.

CSV note: formula cells contain commas, so csv.writer will quote them
("=WISEPRICE(A3:A5000,B2:F2)"). Excel may or may not evaluate these as live
formulas depending on the import path (double-click usually evaluates;
Power Query / "From Text" usually keeps them as text).
"""

import csv
from pathlib import Path

OUTPUT_DIR = Path.home() / "Downloads" / "excelfilesdb"

METRICS = [
    "Ticker", "Name", "Sector", "Industry", "Exchange", "Country", "Date",
    "Cik", "Reported Currency", "Period", "Revenue", "Filling Date",
    "Accepted Date", "Calendar Year", "Cost Of Revenue", "Gross Profit",
    "Gross Profit Ratio", "Research And Development Expenses",
    "General And Administrative Expenses", "Selling And Marketing Expenses",
    "Other Expenses", "Operating Expenses", "Cost And Expenses",
    "Interest Expense", "Depreciation And Amortization", "EBITDA",
    "EBITDA Ratio", "Operating Income", "Operating Income Ratio",
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
    "Deferred Revenue", "Other Current Liabilities",
    "Total Current Liabilities", "Long Term Debt",
    "Deferred Revenue Non Current", "Deferred Tax Liabilities Non Current",
    "Other Non Current Liabilities", "Total Non Current Liabilities",
    "Other Liabilities", "Total Liabilities", "Minority Interest",
    "Total Equity", "Total Liabilities and Total Equity", "Common Stock",
    "Preferred Stock", "Retained Earnings",
    "Accumulated Other Comprehensive Income Loss",
    "Other Total Stockholders Equity", "Total Stockholders Equity",
    "Total Liabilities And Stockholders Equity", "Total Investments",
    "Total Debt", "Net Debt", "Minority Interest Preferred Stock",
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
    "Operating Cash Flow Per Share", "Free Cash Flow Per Share",
    "Cash Per Share", "Book Value Per Share", "Tangible Book Value Per Share",
    "Shareholders Equity Per Share", "Interest Debt Per Share", "Market Cap",
    "Enterprise Value", "PE Ratio", "Price To Sales Ratio", "POCF Ratio",
    "PFCF Ratio", "PB Ratio", "PTB Ratio", "EV To Sales",
    "Enterprise Value Over EBITDA", "EV To Operating Cash Flow",
    "EV To Free Cash Flow", "Earnings Yield", "Free Cash Flow Yield",
    "Debt To Equity", "Debt To Assets", "Net Debt To EBITDA", "Current Ratio",
    "Interest Coverage", "Income Quality", "Dividend Yield", "Payout Ratio",
    "Sales General And Administrative To Revenue",
    "Research And Development To Revenue", "Intangibles To Total Assets",
    "Capex To Operating Cash Flow", "Capex To Revenue",
    "Capex To Depreciation", "Stock Based Compensation To Revenue",
    "Graham Number", "ROIC", "Return On Tangible Assets", "Graham Net Net",
    "Working Capital", "Tangible Asset Value", "Net Current Asset Value",
    "Average Receivables", "Average Payables", "Average Inventory",
    "Days Sales Outstanding", "Days Payables Outstanding",
    "Days Of Inventory On Hand", "Receivables Turnover", "Payables Turnover",
    "Inventory Turnover", "ROE", "Capex Per Share", "Dividend",
    "Revenue Growth", "Gross Profit Growth", "EBIT growth",
    "Operating Income Growth", "Net Income Growth", "EPS Growth",
    "EPS Diluted Growth", "Weighted Average Shares Growth",
    "Weighted Average Shares Diluted Growth", "Dividends Per Share Growth",
    "Operating Cash Flow Growth", "Free Cash Flow Growth",
    "Ten Y Revenue Growth Per Share", "Five Y Revenue Growth Per Share",
    "Three Y Revenue Growth Per Share", "Ten Y Operating CF Growth Per Share",
    "Five Y Operating CF Growth Per Share",
    "Three Y Operating CF Growth Per Share",
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
    "SGA Expenses Growth",
]
assert len(METRICS) == 207, f"expected 207 metrics, got {len(METRICS)}"

# {formula_row: range_end}
BLOCKS = {
    3:     5000,
    5001:  10000,
    10001: 15000,
    15001: 20000,
    20001: 25000,
    25001: 30000,
    30001: 31206,
}

LAST_ROW = 31206


def write_csv(year: int, path: Path) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)

        # Row 1: year in column A
        w.writerow([year])

        # Row 2: 207 headers across A2..GY2
        w.writerow(METRICS)

        # Rows 3..LAST_ROW
        for row in range(3, LAST_ROW + 1):
            if row in BLOCKS:
                end = BLOCKS[row]
                cells = [""] * 7  # A..G
                cells[1] = f"=WISEPRICE(A{row}:A{end},B2:F2)"
                cells[6] = f"=WISE(A{row}:A{end},G2:GY2,A1)"
                w.writerow(cells)
            else:
                w.writerow([])


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for year in range(2012, 2026):
        path = OUTPUT_DIR / f"{year}.csv"
        write_csv(year, path)
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
