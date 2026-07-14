# Phase 4 patch — `data/financial_db.py` (QUARTERLY + TTM store)

Apply these Edit blocks in order. Each `old_string` is copied verbatim from the
current file. Nothing here touches existing annual (`financials`) behavior — the
new table and methods are strictly additive.

Summary of the four additions:
- **A.** `_init_db` creates `financials_quarterly` (same columns as `financials`,
  PK `(Ticker, "Calendar Year", Period)`) on every `FinancialDB()` init, so new
  and existing DBs both gain the table.
- **B.** `save_quarters(ticker)` fetches yfinance quarterly statements and stores
  one `Q1..Q4` row per fiscal quarter (`INSERT OR IGNORE`, additive).
- **C.** `save_ttm(ticker)` upserts the rolling `get_ttm` snapshot as a
  `Period='TTM'` row (`ON CONFLICT ... DO UPDATE`, restates on each call).
- **D.** `derive_q4(ticker)` back-fills a missing Q4 from `FY − (Q1+Q2+Q3)` for
  flow columns and copies balance-sheet columns from the FY row.

A module constant `FLOW_COLUMNS` and a fetch helper `_fetch_yf_quarterly`
(monkeypatchable in tests) support B/D.

---

## Edit 1 — add `FLOW_COLUMNS` constant (after `YF_CASHFLOW_MAP`)

```
old_string:
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
```

```
new_string:
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

# Flow (period-cumulative) columns for Q4 derivation: a full-year value minus the
# first three quarters. Balance-sheet columns are point-in-time snapshots and are
# copied from the FY row instead (see derive_q4).
FLOW_COLUMNS = (
    "Revenue", "Cost Of Revenue", "Gross Profit", "Operating Income",
    "Net Income", "Operating Cash Flow", "Capital Expenditure",
    "Free Cash Flow", "Income Tax Expense", "Interest Expense",
    "Research And Development Expenses",
)
```

---

## Edit 2 — `_init_db`: create `financials_quarterly`

Insert the new `CREATE TABLE` between the `financials` table and the `tickers`
table. The `q_cols_sql` builder mirrors the `financials` builder but also
excludes `Period` (which becomes a NOT NULL PK column declared explicitly).

```
old_string:
                  last_updated TEXT,
                  PRIMARY KEY (Ticker, "Calendar Year")
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tickers (
```

```
new_string:
                  last_updated TEXT,
                  PRIMARY KEY (Ticker, "Calendar Year")
                )
            """)

            # Quarterly + TTM store. Same columns as `financials` but keyed by
            # (Ticker, Calendar Year, Period) so Q1-Q4/TTM rows coexist with the
            # annual (FY) warehouse without touching it. Period is a NOT NULL PK
            # column here, so it is declared explicitly and excluded from the
            # generated column list. Created on every init so existing DBs gain
            # the table too.
            q_cols_sql = ",\n  ".join(
                f'"{c}" TEXT' if c in ("Name", "Sector", "Industry", "Date",
                                        "Reported Currency", "Cik",
                                        "Filling Date", "Accepted Date")
                else f'"{c}" REAL'
                for c in EXCEL_COLUMNS
                if c not in ("Ticker", "Calendar Year", "Period")
            )
            conn.execute(f"""
                CREATE TABLE IF NOT EXISTS financials_quarterly (
                  Ticker TEXT NOT NULL,
                  "Calendar Year" INTEGER NOT NULL,
                  Period TEXT NOT NULL,
                  {q_cols_sql},
                  last_updated TEXT,
                  PRIMARY KEY (Ticker, "Calendar Year", Period)
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS tickers (
```

---

## Edit 3 — add `_fetch_yf_quarterly`, `save_quarters`, `save_ttm`, `derive_q4`

Insert the four methods between `get_ttm`'s `return result` and the Query API
section comment.

```
old_string:
        return result

    # ------------------------------------------------------------------
    # Query API (mirrors yfinance style)
    # ------------------------------------------------------------------
```

```
new_string:
        return result

    # ------------------------------------------------------------------
    # Quarterly + TTM store (financials_quarterly) -- additive, never touches
    # the annual financials warehouse.
    # ------------------------------------------------------------------

    def _fetch_yf_quarterly(self, ticker: str) -> dict:
        """Fetch quarterly income/balance/cashflow statements from yfinance.

        Returned as {'inc': df, 'bal': df, 'cf': df, 'info': dict}. Isolated in
        its own method so tests can monkeypatch it with synthetic frames
        (network-free)."""
        t = yf.Ticker(ticker)
        return {
            "inc":  t.quarterly_income_stmt,
            "bal":  t.quarterly_balance_sheet,
            "cf":   t.quarterly_cashflow,
            "info": t.info,
        }

    def save_quarters(self, ticker: str, verbose: bool = True) -> int:
        """Store one row per fiscal quarter in financials_quarterly.

        Period is 'Q1'..'Q4' assigned by end-date order WITHIN each calendar
        year; Calendar Year is the calendar year of the quarter-end date. Rows
        are additive (INSERT OR IGNORE) and gated by is_valid_year_period.
        Returns the number of rows actually inserted."""
        ticker = ticker.upper()
        try:
            data = self._fetch_yf_quarterly(ticker)
        except Exception as e:  # noqa: BLE001 -- isolate per-ticker fetch failures
            if verbose:
                print(f"  {ticker}: quarterly fetch failed: {e}")
            return 0

        inc, bal, cf = data.get("inc"), data.get("bal"), data.get("cf")

        # Every distinct quarter-end date across the three statements.
        q_dates = set()
        for df in (inc, bal, cf):
            if df is not None and not df.empty:
                for col in df.columns:
                    try:
                        q_dates.add(pd.to_datetime(col))
                    except Exception:  # noqa: BLE001 -- skip non-date columns
                        pass
        if not q_dates:
            return 0

        # Assign Period by end-date order within each calendar year.
        ordered = sorted(q_dates)
        counter: dict[int, int] = {}
        period_by_date: dict = {}
        for dt in ordered:
            counter[dt.year] = counter.get(dt.year, 0) + 1
            period_by_date[dt] = f"Q{min(counter[dt.year], 4)}"

        def val(df, key, target_dt):
            if df is None or df.empty or key not in df.index:
                return None
            for col in df.columns:
                try:
                    if pd.to_datetime(col) == target_dt:
                        v = df.loc[key, col]
                        return float(v) if pd.notna(v) else None
                except Exception:  # noqa: BLE001 -- skip unparseable columns
                    pass
            return None

        records = []
        for dt in ordered:
            period = period_by_date[dt]
            if not is_valid_year_period(dt.year, period):
                continue
            rec = {
                "Ticker":        ticker,
                "Calendar Year": dt.year,
                "Period":        period,
                "Date":          dt.date().isoformat(),
                "last_updated":  datetime.now().isoformat(),
            }
            for our_col, yf_key in YF_INCOME_MAP.items():
                rec[our_col] = val(inc, yf_key, dt)
            for our_col, yf_key in YF_BALANCE_MAP.items():
                rec[our_col] = val(bal, yf_key, dt)
            for our_col, yf_key in YF_CASHFLOW_MAP.items():
                if rec.get(our_col) is None:
                    rec[our_col] = val(cf, yf_key, dt)
            records.append(rec)

        if not records:
            return 0

        q_cols = set(EXCEL_COLUMNS) | {"last_updated"}
        inserted = 0
        with self._connect() as conn:
            for rec in records:
                cols = [c for c in rec.keys() if c in q_cols]
                vals = [rec[c] for c in cols]
                col_sql = ", ".join(f'"{c}"' for c in cols)
                ph = ", ".join("?" for _ in cols)
                cur = conn.execute(
                    f"INSERT OR IGNORE INTO financials_quarterly ({col_sql}) "
                    f"VALUES ({ph})", vals)
                inserted += cur.rowcount
            conn.commit()

        if verbose:
            print(f"  {ticker}: stored {inserted} quarter rows")
        return inserted

    def save_ttm(self, ticker: str, verbose: bool = True) -> bool:
        """Compute the live TTM snapshot (get_ttm) and upsert it into
        financials_quarterly with Period='TTM'. Calendar Year is the year of the
        TTM Date. The TTM row is a rolling snapshot, so ON CONFLICT restates it.
        Only columns in EXCEL_COLUMNS are stored. Returns True on write."""
        ticker = ticker.upper()
        try:
            ttm = self.get_ttm(ticker)
        except Exception as e:  # noqa: BLE001 -- isolate per-ticker fetch failures
            if verbose:
                print(f"  {ticker}: TTM fetch failed: {e}")
            return False
        if not ttm:
            return False

        ttm_date = ttm.get("Date") or date.today().isoformat()
        try:
            cal_year = int(str(ttm_date)[:4])
        except (TypeError, ValueError):
            cal_year = date.today().year
        if not is_valid_year_period(cal_year, "TTM"):
            return False

        rec = {k: v for k, v in ttm.items() if k in EXCEL_COLUMNS}
        rec["Ticker"] = ticker
        rec["Calendar Year"] = cal_year
        rec["Period"] = "TTM"
        rec["last_updated"] = datetime.now().isoformat()

        q_cols = set(EXCEL_COLUMNS) | {"last_updated"}
        cols = [c for c in rec.keys() if c in q_cols]
        col_sql = ", ".join(f'"{c}"' for c in cols)
        ph = ", ".join("?" for _ in cols)
        update_cols = [c for c in cols
                       if c not in ("Ticker", "Calendar Year", "Period")]
        set_sql = ", ".join(f'"{c}" = excluded."{c}"' for c in update_cols)
        with self._connect() as conn:
            conn.execute(
                f'INSERT INTO financials_quarterly ({col_sql}) VALUES ({ph}) '
                f'ON CONFLICT(Ticker, "Calendar Year", Period) '
                f'DO UPDATE SET {set_sql}',
                [rec[c] for c in cols])
            conn.commit()

        if verbose:
            print(f"  {ticker}: TTM snapshot saved ({cal_year})")
        return True

    def derive_q4(self, ticker: str, verbose: bool = True) -> int:
        """Back-fill the missing Q4 row for each fiscal year that has Q1-Q3 in
        financials_quarterly but no Q4. Flow columns = FY - (Q1+Q2+Q3);
        balance-sheet columns copy the FY row. INSERT OR IGNORE. Returns the
        number of Q4 rows created."""
        ticker = ticker.upper()
        flow_cols = list(FLOW_COLUMNS)
        bal_cols = list(YF_BALANCE_MAP.keys())
        q_cols = set(EXCEL_COLUMNS) | {"last_updated"}
        created = 0
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            fy_rows = conn.execute(
                'SELECT * FROM financials WHERE Ticker = ?', (ticker,)
            ).fetchall()
            for fy in fy_rows:
                try:
                    cal_year = int(fy["Calendar Year"])
                except (TypeError, ValueError, KeyError):
                    continue
                q_rows = conn.execute(
                    'SELECT Period, ' +
                    ", ".join(f'"{c}"' for c in flow_cols) +
                    ' FROM financials_quarterly '
                    'WHERE Ticker = ? AND "Calendar Year" = ? '
                    "AND Period IN ('Q1','Q2','Q3','Q4')",
                    (ticker, cal_year)).fetchall()
                periods = {r["Period"] for r in q_rows}
                if not {"Q1", "Q2", "Q3"}.issubset(periods) or "Q4" in periods:
                    continue
                q123 = {r["Period"]: r for r in q_rows}
                rec = {
                    "Ticker":        ticker,
                    "Calendar Year": cal_year,
                    "Period":        "Q4",
                    "Date":          fy["Date"] if "Date" in fy.keys() else None,
                    "last_updated":  datetime.now().isoformat(),
                }
                for col in flow_cols:
                    fy_val = fy[col] if col in fy.keys() else None
                    if fy_val is None:
                        rec[col] = None
                        continue
                    partial = 0.0
                    ok = True
                    for p in ("Q1", "Q2", "Q3"):
                        v = q123[p][col]
                        if v is None:
                            ok = False
                            break
                        partial += float(v)
                    rec[col] = (float(fy_val) - partial) if ok else None
                for col in bal_cols:
                    rec[col] = fy[col] if col in fy.keys() else None

                cols = [c for c in rec.keys() if c in q_cols]
                col_sql = ", ".join(f'"{c}"' for c in cols)
                ph = ", ".join("?" for _ in cols)
                cur = conn.execute(
                    f"INSERT OR IGNORE INTO financials_quarterly ({col_sql}) "
                    f"VALUES ({ph})", [rec[c] for c in cols])
                created += cur.rowcount
            conn.commit()

        if verbose:
            print(f"  {ticker}: derived {created} Q4 rows")
        return created

    # ------------------------------------------------------------------
    # Query API (mirrors yfinance style)
    # ------------------------------------------------------------------
```

---

## Notes / invariants preserved

- All four methods use `self._connect()` (no schema change to the connect
  helper) and set `row_factory = sqlite3.Row` locally only where they read rows
  by name (`derive_q4`).
- `save_quarters`/`derive_q4` count real inserts via `cursor.rowcount`
  (`INSERT OR IGNORE` → 1 on insert, 0 on conflict), so the PK dedup is
  observable by the caller.
- `is_valid_year_period` gates every write (Phase 1 ingest guard).
- No existing method is modified; `financials` (annual) rows are never read for
  writing except in `derive_q4`, which only READS the FY row to compute Q4.
