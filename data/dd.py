from financial_db import FinancialDB

db = FinancialDB("financials.db")

revenue_2025 = db.get_metric("AAPL", "Total Assets", year=2012)
print(revenue_2025)