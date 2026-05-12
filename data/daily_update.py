"""
daily_update.py

Run this script once per day (e.g. via cron or Task Scheduler) to pull new
fiscal year data from yfinance into the database.

Usage:
    python daily_update.py                        # update all tickers
    python daily_update.py --ticker AAPL MSFT     # update specific tickers
    python daily_update.py --db path/to/custom.db

Cron example (runs at 7 AM ET on weekdays):
    0 7 * * 1-5 /usr/bin/python3 /path/to/daily_update.py >> /path/to/update.log 2>&1
"""

import argparse
from datetime import datetime
from financial_db import FinancialDB


def main():
    parser = argparse.ArgumentParser(description="Daily yfinance update for FinancialDB")
    parser.add_argument("--db",     default="financials.db", help="Path to SQLite database")
    parser.add_argument("--ticker", nargs="+",               help="Specific tickers to update")
    parser.add_argument("--quiet",  action="store_true",     help="Suppress per-row output")
    args = parser.parse_args()

    verbose = not args.quiet
    db = FinancialDB(args.db)

    print(f"[{datetime.now().isoformat()}] Starting daily update...")

    if args.ticker:
        for t in args.ticker:
            db.update_ticker(t, verbose=verbose)
    else:
        results = db.update_all(verbose=verbose)
        new_rows = sum(v for v in results.values() if v > 0)
        print(f"[{datetime.now().isoformat()}] Done. {new_rows} new year-rows added across {len(results)} tickers.")


if __name__ == "__main__":
    main()
