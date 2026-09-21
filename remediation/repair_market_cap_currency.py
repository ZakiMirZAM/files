"""Repair market caps that were written in the QUOTE currency into a row
denominated in the REPORTING currency.

``FinancialDB.refresh_market_caps`` and ``data/market_cap_refresh.py`` used to
write ``yfinance fast_info.market_cap`` straight into ``financials."Market Cap"``
for each ticker's latest year. That number is denominated in the currency of the
LISTING, not of the filer: TSM's US ADR quotes in USD while TSM reports in TWD,
so its 2025 row held 2.21e12 next to 2024's 2.79e13, and every consumer then
multiplied it by the TWD rate a second time (a $69B company on a 1.3x P/E with a
7263% margin of safety). The same thing happened the other way round on venues
that quote in minor units: the LSE quotes pence, so every GBP filer's cap came
back a hundred times too large.

The writers are fixed. This script repairs the rows they already wrote.

Detection is NETWORK-FREE by default and rests on one fact about the warehouse:
the stored ratio columns (``PE Ratio``, ``PB Ratio``, ``Price To Sales Ratio``,
``POCF Ratio``) were computed by the source export from the FISCAL-YEAR-END cap
in the REPORTING currency, and they reconcile with that cap to ten significant
figures on every year the sweep did not overwrite. So

    anchor = PE Ratio x Net Income  (median across the available ratio pairs)

is an independent reading of the cap in the row's own currency, and

    L = ln(anchor / stored cap)

is the log gap the currency has to explain. For each candidate quote currency Q
(the row's own currency, USD, and whatever the ticker's exchange suffix trades
in, minor units included) the gap Q would explain is ``ln(rate[Q] / rate[R])``.
The residual is a price move between the export's snapshot and the sweep, so the
best candidate has to fit within a tolerance and every other candidate has to be
far outside it:

  CERTAIN  one non-R candidate fits within --fit, the runner-up is at least
           --sep away, and the prior year's (untouched) cap agrees that the
           correction makes the year-on-year change more plausible, not less.
           Only these are changed by --apply.
  UNSURE   a non-R candidate is the best fit but a second one is close enough to
           be plausible. Near-parity currencies (EUR, GBP, CHF, CAD, AUD against
           USD) land here by construction, because an 8-month price move is the
           same size as the exchange rate. ``--verify-yf`` settles them.

There is NO ``Stock Price`` column in ``financials`` (it has 206 columns, and
the only price-shaped one is ``Price To Sales Ratio``). ``SELECT "Stock Price"``
returns the string 'Stock Price' on every row because SQLite falls back to
treating an unknown double-quoted identifier as a string literal, so a probe
written that way reports a column that does not exist. No price column is
available as evidence here.

False positives are measurable. The 5,028 plain US symbols reporting USD cannot
carry this bug, so running the same windows against their ln(anchor/stored)
gives the rate at which honest price moves would be mistaken for a currency: a
spurious candidate at a USD-into-CNY separation would claim 1.37% of them, at a
pence separation 0.32%, and at a EUR-into-USD separation none at all (nothing
that close ever clears --sep).

Usage:
    # dry run (the default): prints a summary and writes a CSV, changes nothing
    python remediation/repair_market_cap_currency.py financials.db

    # confirm the inferred quote currency over the network, flagged tickers only
    python remediation/repair_market_cap_currency.py financials.db --verify-yf

    # repair the CERTAIN rows (reversible: old values go to market_cap_repair_audit)
    python remediation/repair_market_cap_currency.py financials.db --apply
"""

from __future__ import annotations

import argparse
import csv
import datetime
import math
import os
import sqlite3
import statistics
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

import _jobs  # noqa: E402
import fx_convert  # noqa: E402
from financial_db import _fi_attr, fx_rates_from  # noqa: E402

JOB_NAME = "market_cap_currency_repair"

AUDIT_DDL = """
CREATE TABLE IF NOT EXISTS market_cap_repair_audit (
  ticker              TEXT    NOT NULL,
  year                INTEGER NOT NULL,
  old_cap             REAL,
  new_cap             REAL,
  quote_currency      TEXT,
  reporting_currency  TEXT,
  repaired_at         TEXT    NOT NULL
)
"""

# ln of the largest price move the detector will absorb as noise, and the
# minimum separation the runner-up candidate must have. Measured against the
# rows that CANNOT carry this bug (plain US tickers reporting USD, whose only
# candidate is USD itself): their ln(anchor/stored) has p5 = -0.80, p95 = +0.69,
# p1 = -1.57, p99 = +1.79. So --fit 0.8 absorbs about 90% of honest price moves
# and --sep 1.6 keeps roughly 99% of them from reaching a verdict at all.
DEFAULT_FIT = 0.80
DEFAULT_SEP = 1.60

# Exchange suffix -> the currencies that venue can quote a line in. USD is added
# to every candidate set separately (depositary lines are quoted in USD on many
# venues, and an unsuffixed symbol is a US listing).
SUFFIX_CURRENCIES: dict[str, tuple[str, ...]] = {
    "L": ("GBp", "GBP", "EUR"),     # London: pence, pounds, and EUR lines
    "IL": ("GBp", "GBP"),           # London international order book
    "TA": ("ILA", "ILS"),           # Tel Aviv: agorot
    "JO": ("ZAc", "ZAR"),           # Johannesburg: cents
    "HK": ("HKD",),
    "ME": ("RUB",),
    "T": ("JPY",), "JP": ("JPY",),
    "TW": ("TWD",), "TWO": ("TWD",),
    "KS": ("KRW",), "KQ": ("KRW",),
    "NS": ("INR",), "BO": ("INR",),
    "SS": ("CNY",), "SZ": ("CNY",),
    "SI": ("SGD",), "AX": ("AUD",), "NZ": ("NZD",),
    "TO": ("CAD",), "V": ("CAD",), "CN": ("CAD",), "NE": ("CAD",),
    "SW": ("CHF",), "VX": ("CHF",),
    "ST": ("SEK",), "OL": ("NOK",), "CO": ("DKK",), "HE": ("EUR",), "IC": ("ISK",),
    "DE": ("EUR",), "F": ("EUR",), "BE": ("EUR",), "MU": ("EUR",), "SG": ("EUR",),
    "HM": ("EUR",), "DU": ("EUR",), "VI": ("EUR",), "PA": ("EUR",), "AS": ("EUR",),
    "BR": ("EUR",), "MI": ("EUR",), "MC": ("EUR",), "LS": ("EUR",), "IR": ("EUR",),
    "AT": ("EUR",), "RG": ("EUR",), "TL": ("EUR",), "VS": ("EUR",),
    "SA": ("BRL",), "MX": ("MXN",), "BA": ("ARS",), "SN": ("CLP",), "CL": ("COP",),
    "BK": ("THB",), "JK": ("IDR",), "KL": ("MYR",), "PS": ("PHP",), "VN": ("VND",),
    "IS": ("TRY",), "WA": ("PLN",), "PR": ("CZK",), "BD": ("HUF",),
    "SR": ("SAR",), "QA": ("QAR",), "AE": ("AED",), "TV": ("ILS",),
    "CA": ("EGP",), "NG": ("NGN",), "RO": ("RON",),
}

# (ratio column, the figure it divides) — a stored ratio times its base
# reconstructs the cap the export saw, in the reporting currency.
RATIO_PAIRS = (
    ("PE Ratio", "Net Income"),
    ("PB Ratio", "Total Stockholders Equity"),
    ("Price To Sales Ratio", "Revenue"),
    ("POCF Ratio", "Operating Cash Flow"),
)

CSV_FIELDS = [
    "ticker", "year", "reported_currency", "stored_cap", "quote_currency",
    "corrected_cap", "fx_factor", "anchor_cap", "anchor_sources", "ln_gap",
    "residual", "runner_up", "runner_up_residual", "classification",
    "prior_year", "prior_cap", "prior_year_check", "corrected_over_prior",
    "stored_over_prior", "stored_usd", "corrected_usd", "evidence",
]


# ── evidence ────────────────────────────────────────────────────────────────

def suffix_of(ticker: str) -> str:
    """``"ICK.VI"`` -> ``"VI"``; a symbol with no dot is a US listing -> ``""``."""
    return ticker.rsplit(".", 1)[1].upper() if "." in ticker else ""


def candidate_currencies(ticker: str, reporting: str) -> list[str]:
    """Quote currencies this listing could plausibly be priced in, reporting
    currency first (the "nothing is wrong" hypothesis)."""
    out = [reporting]
    for c in ("USD",) + SUFFIX_CURRENCIES.get(suffix_of(ticker), ()):
        if c not in out:
            out.append(c)
    return out


def anchor_cap(row: sqlite3.Row) -> tuple[float | None, str]:
    """The fiscal-year-end cap the stored ratio columns imply, in the row's own
    currency, plus which ratios supplied it. Only positive pairs are used: a
    loss-making year's PE is negative and reconstructs nothing."""
    caps: list[float] = []
    used: list[str] = []
    for ratio, base in RATIO_PAIRS:
        a, b = row[ratio], row[base]
        if a is None or b is None:
            continue
        try:
            a, b = float(a), float(b)
        except (TypeError, ValueError):
            continue
        if a > 0 and b > 0:
            caps.append(a * b)
            used.append(ratio.split()[0])
    if not caps:
        return None, ""
    return statistics.median(caps), "+".join(used)


def classify_row(row, rates, *, fit=DEFAULT_FIT, sep=DEFAULT_SEP) -> dict | None:
    """One row's verdict, or None when the row carries no currency finding."""
    stored = row["mc"]
    reporting = row["ccy"]
    if stored is None or stored <= 0:
        return None
    norm_r = fx_convert.normalize_currency(reporting)
    if norm_r is None:
        return None  # junk Reported Currency: nothing to convert INTO
    anchor, sources = anchor_cap(row)
    if anchor is None or anchor <= 0:
        return None

    gap = math.log(anchor / stored)
    scored: list[tuple[float, str, float]] = []   # (|residual|, currency, factor)
    for cand in candidate_currencies(row["Ticker"], reporting):
        factor_amount = fx_convert.convert_amount(1.0, cand, reporting, rates)
        if factor_amount is None:
            continue
        scored.append((abs(gap - math.log(factor_amount)), cand, factor_amount))
    if len(scored) < 2:
        return None  # only the no-op candidate has a rate: nothing to compare
    scored.sort()
    best_res, best_ccy, best_factor = scored[0]
    second_res, second_ccy, _ = scored[1]

    if best_ccy == reporting:
        return None          # the stored cap already reads as its own currency
    if best_res > fit:
        return None          # no currency explains the gap; a price move or junk

    corrected = stored * best_factor
    prior_cap = row["prior_cap"]
    r_usd = fx_convert.usd_per_unit(reporting, rates) or 0.0

    prior_check = _prior_year_check(stored, corrected, prior_cap)
    evidence = (
        f"{sources} imply {anchor:.4g} {reporting} at FY end; stored {stored:.4g} "
        f"x {best_factor:.6g} ({best_ccy}->{reporting}) = {corrected:.4g}; "
        f"residual {gap - math.log(best_factor):+.2f} in log terms, "
        f"next candidate {second_ccy} is {second_res:.2f} away; "
        f"prior-year cap {prior_check}"
    )
    certain = second_res >= sep and prior_check != "contradicts"
    return {
        "ticker": row["Ticker"],
        "year": int(row["yr"]),
        "reported_currency": reporting,
        "stored_cap": stored,
        "quote_currency": best_ccy,
        "corrected_cap": corrected,
        "fx_factor": best_factor,
        "anchor_cap": anchor,
        "anchor_sources": sources,
        "ln_gap": round(gap, 4),
        "residual": round(gap - math.log(best_factor), 4),
        "runner_up": second_ccy,
        "runner_up_residual": round(second_res, 4),
        "classification": "CERTAIN" if certain else "UNSURE",
        "prior_year": row["prior_year"],
        "prior_cap": prior_cap,
        "prior_year_check": prior_check,
        "corrected_over_prior": (corrected / prior_cap) if prior_cap else None,
        "stored_over_prior": (stored / prior_cap) if prior_cap else None,
        "stored_usd": stored * r_usd,
        "corrected_usd": corrected * r_usd,
        "evidence": evidence,
    }


# ── data access ─────────────────────────────────────────────────────────────

LATEST_SQL = """
SELECT f.Ticker, CAST(f."Calendar Year" AS INTEGER) AS yr,
       f."Reported Currency" AS ccy, f."Market Cap" AS mc,
       f."PE Ratio", f."Net Income", f."PB Ratio", f."Total Stockholders Equity",
       f."Price To Sales Ratio", f."Revenue",
       f."POCF Ratio", f."Operating Cash Flow",
       (SELECT CAST(c."Calendar Year" AS INTEGER) FROM financials c
         WHERE c.Ticker = f.Ticker AND c."Market Cap" > 0
           AND CAST(c."Calendar Year" AS INTEGER) < CAST(f."Calendar Year" AS INTEGER)
         ORDER BY CAST(c."Calendar Year" AS INTEGER) DESC LIMIT 1) AS prior_year,
       (SELECT c."Market Cap" FROM financials c
         WHERE c.Ticker = f.Ticker AND c."Market Cap" > 0
           AND CAST(c."Calendar Year" AS INTEGER) < CAST(f."Calendar Year" AS INTEGER)
         ORDER BY CAST(c."Calendar Year" AS INTEGER) DESC LIMIT 1) AS prior_cap
FROM financials f
JOIN (SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) AS my FROM financials
      WHERE CAST("Calendar Year" AS INTEGER) BETWEEN 1900 AND 2100
      GROUP BY Ticker) m
  ON m.Ticker = f.Ticker AND CAST(f."Calendar Year" AS INTEGER) = m.my
WHERE f."Market Cap" IS NOT NULL AND f."Market Cap" > 0
"""


def load_rates(conn: sqlite3.Connection) -> dict[str, float]:
    """The fx_rates table, read the one way the data layer reads it."""
    return fx_rates_from(conn)


def _prior_year_check(stored: float, corrected: float,
                      prior_cap: float | None) -> str:
    """Second opinion on one correction: "supports", "contradicts" or "none".

    The prior year's cap was never touched by the sweep, so it is in the
    reporting currency. A real repair moves the year-on-year change TOWARDS
    something a company can actually do; a correction that turns a 1.5x year
    into a 47x year is the detector fitting noise, so it loses CERTAIN. Both
    the scan and the yfinance re-verification ask the same question, so they
    ask it here.
    """
    if not prior_cap:
        return "none"
    before = abs(math.log(stored / prior_cap))
    after = abs(math.log(corrected / prior_cap))
    return "supports" if after < before else "contradicts"


def scan(conn: sqlite3.Connection, *, fit=DEFAULT_FIT, sep=DEFAULT_SEP,
         limit: int | None = None) -> list[dict]:
    """Every latest-year row whose stored cap reads as another currency."""
    conn.row_factory = sqlite3.Row
    rates = load_rates(conn)
    if not rates:
        raise SystemExit("fx_rates is empty: nothing can be converted.")
    findings = []
    for row in conn.execute(LATEST_SQL):
        verdict = classify_row(row, rates, fit=fit, sep=sep)
        if verdict is not None:
            findings.append(verdict)
            if limit and len(findings) >= limit:
                break
    findings.sort(key=lambda f: -(f["corrected_usd"] or 0.0))
    return findings


# ── optional network confirmation ───────────────────────────────────────────

def _recompute(f: dict, quote_ccy: str, rates: dict[str, float]) -> bool:
    """Rebuild a finding around a KNOWN quote currency. False when that currency
    cannot be converted into the row's reporting currency."""
    factor = fx_convert.convert_amount(1.0, quote_ccy, f["reported_currency"], rates)
    if factor is None:
        return False
    corrected = f["stored_cap"] * factor
    r_usd = fx_convert.usd_per_unit(f["reported_currency"], rates) or 0.0
    prior = f["prior_cap"]
    f.update({
        "quote_currency": quote_ccy,
        "fx_factor": factor,
        "corrected_cap": corrected,
        "residual": round(f["ln_gap"] - math.log(factor), 4),
        "corrected_usd": corrected * r_usd,
        "corrected_over_prior": (corrected / prior) if prior else None,
        "prior_year_check": _prior_year_check(f["stored_cap"], corrected, prior),
    })
    return True


def verify_with_yfinance(findings: list[dict], rates: dict[str, float], *,
                         throttle: float = 0.4, verbose: bool = True) -> None:
    """Ask yfinance for each flagged ticker's actual quote currency and let that
    answer settle the verdict. Only the flagged tickers are fetched, one request
    each, rate limited.

    A confirmation upgrades UNSURE to CERTAIN. A contradiction is authoritative
    too: when the quote currency turns out to be the row's OWN currency the
    finding is dismissed (``NOT-A-BUG``), and when it is some third currency the
    correction is recomputed around it."""
    try:
        import yfinance as yf  # noqa: PLC0415 — keeps the dry run import-light
    except Exception as exc:  # noqa: BLE001
        print(f"  --verify-yf unavailable ({exc}); leaving verdicts as they are")
        return

    seen: dict[str, str | None] = {}
    for i, f in enumerate(findings, 1):
        tk = f["ticker"]
        if tk not in seen:
            ccy = None
            try:
                # FastInfo is not a dict and not a plain object; _fi_attr is the
                # one reader that handles both (a bare getattr or a .get() can
                # report a confident None on a symbol that does have a quote).
                raw = _fi_attr(yf.Ticker(tk).fast_info, "currency")
                ccy = str(raw) if raw else None
            except Exception:  # noqa: BLE001 — one bad symbol never stops the pass
                ccy = None
            seen[tk] = ccy
            if throttle:
                time.sleep(throttle)
            if verbose and i % 50 == 0:
                print(f"  [verify] {i}/{len(findings)}", flush=True)
        reported = seen[tk]
        if reported is None:
            f["evidence"] += " | yfinance gave no quote currency"
            continue
        norm = fx_convert.normalize_currency(reported)
        if norm == fx_convert.normalize_currency(f["quote_currency"]):
            f["classification"] = "CERTAIN"
            f["evidence"] += f" | yfinance confirms the quote currency is {reported}"
        elif norm is not None and norm == fx_convert.normalize_currency(
                f["reported_currency"]):
            f["classification"] = "NOT-A-BUG"
            f["evidence"] += (f" | yfinance says this line is quoted in "
                              f"{reported}, the row's own currency")
        elif _recompute(f, reported, rates):
            f["classification"] = "CERTAIN"
            f["evidence"] += (f" | yfinance says the quote currency is "
                              f"{reported}; the correction was rebuilt around it")
        else:
            f["classification"] = "UNSURE"
            f["evidence"] += (f" | yfinance says the quote currency is {reported}, "
                              f"which has no rate")


# ── output ──────────────────────────────────────────────────────────────────

def write_csv(findings: list[dict], path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        w.writeheader()
        for f in findings:
            w.writerow({k: f.get(k) for k in CSV_FIELDS})


def summarise(findings: list[dict], *, top: int = 20) -> None:
    certain = [f for f in findings if f["classification"] == "CERTAIN"]
    unsure = [f for f in findings if f["classification"] == "UNSURE"]
    dismissed = [f for f in findings if f["classification"] == "NOT-A-BUG"]
    print(f"\nflagged rows: {len(findings)}   CERTAIN: {len(certain)}   "
          f"UNSURE: {len(unsure)}   dismissed by yfinance: {len(dismissed)}")

    pairs: dict[tuple[str, str], list[int]] = {}
    for f in findings:
        if f["classification"] == "NOT-A-BUG":
            continue
        key = (f["reported_currency"], f["quote_currency"])
        pairs.setdefault(key, [0, 0])
        pairs[key][0 if f["classification"] == "CERTAIN" else 1] += 1
    print("\nreported currency <- quote currency        CERTAIN  UNSURE")
    for (r, q), (c, u) in sorted(pairs.items(), key=lambda kv: -(kv[1][0] + kv[1][1])):
        print(f"  {r:>4s} rows holding a {q:<4s} cap          {c:7d} {u:7d}")

    print(f"\ntop {top} by corrected USD market cap")
    print(f"  {'ticker':<11s} {'yr':>4s} {'ccy':>4s} {'quote':>5s} "
          f"{'stored USD':>14s} {'corrected USD':>15s}  verdict")
    for f in findings[:top]:
        print(f"  {f['ticker']:<11s} {f['year']:>4d} {f['reported_currency']:>4s} "
              f"{f['quote_currency']:>5s} {f['stored_usd']:>14.4g} "
              f"{f['corrected_usd']:>15.4g}  {f['classification']}")


# ── apply ───────────────────────────────────────────────────────────────────

def apply_repairs(conn: sqlite3.Connection, findings: list[dict]) -> int:
    """Write the CERTAIN corrections in ONE short transaction, after copying the
    old values into ``market_cap_repair_audit`` so every change is reversible."""
    certain = [f for f in findings if f["classification"] == "CERTAIN"]
    if not certain:
        return 0
    stamp = datetime.datetime.now().isoformat(timespec="seconds")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute(AUDIT_DDL)
    _jobs.ensure_job_runs(conn)
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.executemany(
            "INSERT INTO market_cap_repair_audit "
            "(ticker, year, old_cap, new_cap, quote_currency, reporting_currency,"
            " repaired_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(f["ticker"], f["year"], f["stored_cap"], f["corrected_cap"],
              f["quote_currency"], f["reported_currency"], stamp) for f in certain])
        conn.executemany(
            'UPDATE financials SET "Market Cap" = ? '
            'WHERE Ticker = ? AND CAST("Calendar Year" AS INTEGER) = ?',
            [(f["corrected_cap"], f["ticker"], f["year"]) for f in certain])
        _jobs.upsert_job_run(conn, JOB_NAME, stamp, commit=False)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return len(certain)


# ── cli ─────────────────────────────────────────────────────────────────────

def _parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("db_path")
    p.add_argument("--apply", action="store_true",
                   help="write the CERTAIN corrections (default is a DRY RUN)")
    p.add_argument("--verify-yf", action="store_true",
                   help="confirm the quote currency over the network, flagged "
                        "tickers only, rate limited")
    p.add_argument("--fit", type=float, default=DEFAULT_FIT,
                   help="how far the corrected cap may sit from the ratio anchor, "
                        "in log terms. 1.2 additionally catches the largest "
                        "Indonesian and Russian rows, whose residual is 0.96 to "
                        "1.12, at a false-positive cost that the control "
                        "population puts at 0.04 percent for IDR-sized "
                        "separations and 1.73 rather than 1.37 percent for "
                        "USD-into-CNY ones")
    p.add_argument("--sep", type=float, default=DEFAULT_SEP,
                   help="how far the runner-up candidate must be to earn CERTAIN")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--top", type=int, default=20)
    p.add_argument("--out", default=None,
                   help="CSV path (default tmp/market_cap_currency_<stamp>.csv)")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv)
    if not os.path.exists(args.db_path):
        print(f"DB not found: {args.db_path}", file=sys.stderr)
        return 2

    # The dry run never opens the file for writing.
    uri = f"file:{args.db_path}?mode=ro" if not args.apply else args.db_path
    conn = sqlite3.connect(uri, uri=not args.apply, timeout=30.0)
    try:
        findings = scan(conn, fit=args.fit, sep=args.sep, limit=args.limit)
        if args.verify_yf:
            verify_with_yfinance(findings, load_rates(conn))
            findings.sort(key=lambda f: -(f["corrected_usd"] or 0.0))

        out = args.out or os.path.join(
            "tmp", f"market_cap_currency_"
                   f"{datetime.date.today().isoformat()}.csv")
        write_csv(findings, out)
        summarise(findings, top=args.top)
        print(f"\nCSV: {out}")

        if not args.apply:
            certain = sum(1 for f in findings if f["classification"] == "CERTAIN")
            print(f"\nDRY RUN — nothing written. --apply would change {certain} rows.")
            return 0
        n = apply_repairs(conn, findings)
        print(f"\nAPPLIED — {n} rows repaired; old values in market_cap_repair_audit.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
