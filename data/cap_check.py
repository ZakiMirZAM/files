"""cap_check.py — check a stored market cap against an independent price.

The workbook's vendor builds `Market Cap` as (its own period-end price) x
(weighted average shares). For most rows that is right. For some it is not:
a price that missed a share consolidation, a cap left in the listing currency
inside a row whose statements are in another currency, a plain corrupt price.
The statements of those rows are fine. Only the price side is wrong, so only
the price side is touched here: `Market Cap`, `Enterprise Value` and the
ratios built from them. Revenue, profit, assets, debt and cash flow are never
written, which is why the valuation models (they read statements) do not move.

Three independent figures are compared for each annual row, all in USD:

  S  stored      the cap in the warehouse
  E  expected    Yahoo close at the period end x the row's own share count
                 x the FX rate of that date (same formula as the vendor, with
                 an independent price)
  C  chained     today's cap x (close then / close now): what the cap would
                 be with today's share count. It ignores issuance and
                 buybacks, so it is only an ARBITER (within a factor of 3),
                 never a value that is stored.

Decision (`decide`):

  S ~ E                      keep     the two sources agree
  S !~ E, E ~ C              replace  with E: price x shares, the exact method
  S !~ E, S ~ C              keep     Yahoo's price or the share count is off
  S !~ E, neither ~ C        clear    nothing verifies the stored value
  S !~ E, no C               replace  only when S is impossible and E is not
  no E                       keep     nothing to compare with

Every change is written to `cap_check_audit` with the old value, so it can be
reversed. The network lives in `fetch_prices` alone; `decide`, `expected_cap`
and `recompute_price_ratios` are pure.
"""

from __future__ import annotations

import bisect
import sqlite3
from typing import Optional

AGREE_BAND = 0.25          # S and E agree within 25 percent
ARBITER_FACTOR = 3.0       # "~ C" means within a factor of 3
WIDE_ARBITER_FACTOR = 10.0  # second look when neither value is within 3
MAX_PRICE_AGE_DAYS = 10    # a close this far before the period end still counts

AUDIT_DDL = """
CREATE TABLE IF NOT EXISTS cap_check_audit (
    ticker    TEXT NOT NULL,
    year      INTEGER NOT NULL,
    date      TEXT,
    stored    REAL,
    expected  REAL,
    chained   REAL,
    action    TEXT NOT NULL,      -- keep | replace | clear | no_price
    reason    TEXT NOT NULL,
    PRIMARY KEY (ticker, year)
)
"""


# ── pure logic ───────────────────────────────────────────────────────────────

def _within(a: Optional[float], b: Optional[float], factor: float) -> bool:
    if a is None or b is None or a <= 0 or b <= 0:
        return False
    r = a / b
    return (1.0 / factor) <= r <= factor


def agrees(stored: Optional[float], expected: Optional[float]) -> bool:
    if stored is None or expected is None or stored <= 0 or expected <= 0:
        return False
    return abs(stored / expected - 1.0) <= AGREE_BAND


IMPOSSIBLE_MULTIPLE = 200.0     # of BOTH revenue and book equity
IMPOSSIBLE_FLOOR = 1e10         # below this a wrong cap cannot move a total
IMPOSSIBLE_CEILING = 1e13       # 10 trillion USD: twice the largest company ever


def worst_multiple(cap: Optional[float], revenue: Optional[float],
                   equity: Optional[float]) -> Optional[float]:
    """The larger of price-to-sales and price-to-book (absolute values), or
    None when neither can be formed."""
    if not cap or cap <= 0:
        return None
    m = [cap / abs(x) for x in (revenue, equity) if x]
    return max(m) if m else None


def replacement_is_no_worse(stored: Optional[float], value: Optional[float],
                            revenue: Optional[float], equity: Optional[float]) -> bool:
    """False when a replacement would put a LESS credible cap in the cell:
    its worst multiple is above 200 and also above the stored value's. A
    correction must never move a believable figure to an unbelievable one
    (Naspers: stored at 77x sales, the share-history figure at 781x)."""
    new, old = worst_multiple(value, revenue, equity), worst_multiple(stored, revenue, equity)
    if new is None or new <= IMPOSSIBLE_MULTIPLE:
        return True
    return old is None or new <= old


def is_impossible(cap: Optional[float], revenue: Optional[float],
                  equity: Optional[float]) -> bool:
    """A cap no real company has. Same rule as the SQL in
    `usd_ingest.quarantine_impossible_caps` (a test compares the two).

    At least 10 billion dollars AND more than 200 times BOTH revenue and book
    equity (absolute values; a missing one counts as failing, but not both
    missing: then nothing can be judged). A real company fails at most one:
    a buy-back company has almost no equity but real sales, a pre-revenue
    company has almost no sales but real equity."""
    if cap is None:
        return False
    if cap >= IMPOSSIBLE_CEILING:
        return True
    if cap < IMPOSSIBLE_FLOOR or (revenue is None and equity is None):
        return False
    ps_bad = revenue is None or cap > IMPOSSIBLE_MULTIPLE * abs(revenue)
    pb_bad = equity is None or cap > IMPOSSIBLE_MULTIPLE * abs(equity)
    return ps_bad and pb_bad


def decide(stored: Optional[float], expected: Optional[float],
           chained: Optional[float], revenue: Optional[float] = None,
           equity: Optional[float] = None) -> tuple[str, Optional[float], str]:
    """(action, value to store, reason). `value` is None for keep/no_price and
    for clear (which stores NULL)."""
    if expected is None or expected <= 0:
        return "no_price", None, "no independent price for the period end"
    if stored is None or stored <= 0:
        # an empty or quarantined cell: fill it when the new value is credible
        if is_impossible(expected, revenue, equity):
            return "no_price", None, "independent value is impossible too"
        if chained is not None and _within(expected, chained, ARBITER_FACTOR):
            return "replace", expected, "empty cell filled with price x shares"
        return "no_price", None, "independent value is not confirmed by today's cap"
    if agrees(stored, expected):
        return "keep", None, "stored value agrees with price x shares"
    if chained is not None and chained > 0:
        e_ok = _within(expected, chained, ARBITER_FACTOR)
        s_ok = _within(stored, chained, ARBITER_FACTOR)
        if e_ok and not s_ok:
            return "replace", expected, "price x shares fits today's cap, stored value does not"
        if s_ok and not e_ok:
            return "keep", None, "stored value fits today's cap, price x shares does not"
        if e_ok and s_ok:
            return "keep", None, "both fit today's cap within a factor of 3"
        # Neither is within 3x. The chained figure ignores share issuance, so
        # for a company that issued heavily it can be several times off while
        # price x shares is right. When price x shares is within 10x of it and
        # the stored value is not, the stored value is the wrong one.
        if (_within(expected, chained, WIDE_ARBITER_FACTOR)
                and not _within(stored, chained, WIDE_ARBITER_FACTOR)):
            return "replace", expected, \
                "price x shares is within 10x of today's cap, stored value is not"
        return "clear", None, "neither value fits today's cap"
    if is_impossible(stored, revenue, equity) and not is_impossible(expected, revenue, equity):
        return "replace", expected, "stored value is impossible, price x shares is not"
    return "keep", None, "values differ and nothing arbitrates"


SPLIT_FAR = 20.0     # stored P/S this many times away from the anchor: suspect
SPLIT_NEAR = 5.0     # raw-price P/S within this factor of the anchor: credible


def split_factor_after(splits: list[tuple[str, float]], day: str) -> float:
    """Product of the split ratios dated AFTER `day`. Yahoo closes are adjusted
    for every later split, so (adjusted close x this factor) is the price that
    actually traded on `day`. 4:1 split -> 4.0; 1:100 consolidation -> 0.01."""
    f = 1.0
    for when, ratio in splits:
        if when > day and ratio and ratio > 0:
            f *= ratio
    return f


def split_candidate(stored: Optional[float], expected_raw: Optional[float],
                    revenue: Optional[float], anchor_ps: Optional[float]
                    ) -> Optional[float]:
    """The cap to store when the row's SHARE COUNT was never restated for a
    later split or consolidation, else None.

    The vendor multiplies a split-ADJUSTED price by the row's share count. That
    is right when the share count was restated too (Apple) and wrong by the
    whole split ratio when it was not (a 1:100 consolidation makes the cap 100
    times too big). Yahoo's adjusted close reproduces the same error, so price
    x shares cannot catch it. The company's own price-to-sales in the years
    after its last split can: the row is corrected only when the stored cap
    sits more than 20x away from that anchor AND the cap at the price that
    actually traded sits within 5x of it."""
    if not stored or not expected_raw or not revenue or not anchor_ps:
        return None
    if stored <= 0 or expected_raw <= 0 or revenue <= 0 or anchor_ps <= 0:
        return None
    if _within(stored / revenue, anchor_ps, SPLIT_FAR):
        return None
    if not _within(expected_raw / revenue, anchor_ps, SPLIT_NEAR):
        return None
    return expected_raw


MAX_SHARES_AGE_DAYS = 200


def shares_on(dates: list[str], counts: list[float], day: str) -> Optional[float]:
    """Yahoo's share count as it stood on or before `day` (at most 200 days
    earlier), or None."""
    if not dates or not day:
        return None
    i = bisect.bisect_right(dates, day) - 1
    if i < 0:
        return None
    from datetime import date
    if (date.fromisoformat(day) - date.fromisoformat(dates[i])).days > MAX_SHARES_AGE_DAYS:
        return None
    return counts[i]


def restatement_verdict(evidence: list[tuple]) -> Optional[str]:
    """'raw' when the vendor left the company's share counts as originally
    reported, 'restated' when it adjusted them for later splits, None when
    nothing tells.

    `evidence` is one (row share count, Yahoo share count of that date, split
    factor after that date) per row. Only rows that precede a split can tell
    (factor != 1). A row whose count matches Yahoo's as-of count is raw; one
    that matches Yahoo's count times the factor is restated. A vendor treats a
    company one way, so one clear row decides for the company; if the rows
    contradict each other the answer is None and nothing is changed."""
    raw = restated = other = 0
    for row_shares, asof_shares, factor in evidence:
        if not row_shares or not asof_shares or not factor:
            continue
        if 0.8 <= factor <= 1.25:          # no split after this row, or too small to tell
            continue
        r = row_shares / asof_shares
        if 0.75 <= r <= 1.33:
            raw += 1
        elif 0.75 <= r / factor <= 1.33:
            restated += 1
        else:
            # neither: the vendor restated SOME of the later events (a real
            # split) and not others (a spin-off Yahoo records as a split).
            # General Electric is the case. Nothing can be inferred for the
            # years the share history does not reach.
            other += 1
    # One odd row (a weighted average distorted by a mid-year issue) must not
    # veto a clear picture, so the verdict needs a 3-to-1 majority over the
    # rows that fit neither reading, and no row at all of the opposite reading.
    if raw and not restated and raw >= 3 * other:
        return "raw"
    if restated and not raw and restated >= 3 * other:
        return "restated"
    return None


def exact_is_confirmed(stored: Optional[float], exact: Optional[float],
                       revenue: Optional[float], anchor_ps: Optional[float],
                       chained: Optional[float]) -> bool:
    """True when a second, independent witness backs the 'traded price x
    shares of the date' figure against the stored one.

    The figure is only as good as Yahoo's share history, and for some markets
    that history is split-ADJUSTED rather than as-of. Then a correct stored cap
    would be multiplied by the whole split ratio. Two witnesses can tell:
    * the company's own price-to-sales in the years after its last split
      (`anchor_ps`): the figure must be nearer to it than the stored cap is;
    * failing that, today's cap chained back by price (`chained`): the figure
      must be within a factor of 3 of it.
    With neither witness the stored value stays."""
    if not exact or exact <= 0:
        return False
    if anchor_ps and anchor_ps > 0 and revenue and revenue > 0:
        import math
        d_new = abs(math.log((exact / revenue) / anchor_ps))
        if not stored or stored <= 0:
            return d_new <= math.log(SPLIT_NEAR)
        return d_new < abs(math.log((stored / revenue) / anchor_ps))
    if chained and chained > 0:
        return _within(exact, chained, ARBITER_FACTOR)
    return False


def close_on(dates: list[str], closes: list[float], day: str) -> Optional[float]:
    """Last close on or before `day` (ISO), at most MAX_PRICE_AGE_DAYS old."""
    i = bisect.bisect_right(dates, day) - 1
    if i < 0:
        return None
    from datetime import date
    age = (date.fromisoformat(day) - date.fromisoformat(dates[i])).days
    if age > MAX_PRICE_AGE_DAYS:
        return None
    return closes[i]


def expected_cap(close: Optional[float], shares: Optional[float],
                 usd_per_quote: Optional[float]) -> Optional[float]:
    if not close or not shares or not usd_per_quote or close <= 0 or shares <= 0:
        return None
    return close * shares * usd_per_quote


# Each price-built column as a function of the row with a corrected cap.
# `None` means "leave NULL". EV follows the vendor: cap + total debt - cash and
# cash equivalents (verified against untouched rows by `formula_check`).
def _div(a, b):
    return a / b if (a is not None and b not in (None, 0)) else None


def recompute_price_ratios(row: dict, cap: Optional[float]) -> dict:
    """The price-built columns of `row` for a corrected `cap`. With `cap=None`
    every one of them is None (the row is cleared)."""
    if cap is None:
        return {c: None for c in PRICE_COLUMNS}
    debt = row.get("Total Debt")
    cash = row.get("Cash And Cash Equivalents")
    ev = cap + (debt or 0.0) - (cash or 0.0) if (debt is not None or cash is not None) else None
    equity = row.get("Total Stockholders Equity")
    ni, rev = row.get("Net Income"), row.get("Revenue")
    ocf, fcf = row.get("Operating Cash Flow"), row.get("Free Cash Flow")
    div_paid = row.get("Dividends Paid")
    return {
        "Market Cap": cap,
        "Enterprise Value": ev,
        "PE Ratio": _div(cap, ni),
        "Price To Sales Ratio": _div(cap, rev),
        "POCF Ratio": _div(cap, ocf),
        "PFCF Ratio": _div(cap, fcf),
        "PB Ratio": _div(cap, equity),
        # the vendor's "PTB Ratio" equals its "PB Ratio" on every row of the
        # warehouse (measured: 20,000 of 20,000), so the same formula keeps a
        # corrected row consistent with the untouched ones
        "PTB Ratio": _div(cap, equity),
        "EV To Sales": _div(ev, rev),
        "Enterprise Value Over EBITDA": _div(ev, row.get("EBITDA")),
        "EV To Operating Cash Flow": _div(ev, ocf),
        "EV To Free Cash Flow": _div(ev, fcf),
        "Earnings Yield": _div(ni, cap),
        "Free Cash Flow Yield": _div(fcf, cap),
        "Dividend Yield": _div(abs(div_paid), cap) if div_paid is not None else None,
    }


PRICE_COLUMNS = (
    "Market Cap", "Enterprise Value", "PE Ratio", "Price To Sales Ratio",
    "POCF Ratio", "PFCF Ratio", "PB Ratio", "PTB Ratio", "EV To Sales",
    "Enterprise Value Over EBITDA", "EV To Operating Cash Flow",
    "EV To Free Cash Flow", "Earnings Yield", "Free Cash Flow Yield",
    "Dividend Yield",
)

_INPUT_COLUMNS = (
    "Total Debt", "Cash And Cash Equivalents", "Total Stockholders Equity",
    "Goodwill And Intangible Assets", "Net Income", "Revenue",
    "Operating Cash Flow", "Free Cash Flow", "Dividends Paid", "EBITDA",
    "Weighted Average Shs Out",
)


# ── database side ────────────────────────────────────────────────────────────

def suspicious_tickers(conn: sqlite3.Connection) -> dict[str, str]:
    """{ticker: why it is checked}. Four tests, all on annual rows."""
    out: dict[str, str] = {}

    def add(sql: str, why: str) -> None:
        for (t,) in conn.execute(sql):
            out.setdefault(t, why)

    add("SELECT DISTINCT ticker FROM usd_ingest_cap_quarantine", "impossible cap")
    # statements filed in USD on a listing that does not trade in USD: the cap
    # may have been left in the listing currency
    add("""SELECT DISTINCT Ticker FROM financials
           WHERE "Source Currency" = 'USD' AND instr(Ticker, '.') > 0""",
        "USD filer on a non-US listing")
    add("""SELECT DISTINCT Ticker FROM financials
           WHERE "Market Cap" >= 1e9
             AND "Price To Sales Ratio" > 100 AND "PB Ratio" > 100""",
        "extreme price multiples")
    # implied price moves 8x between adjacent years while revenue moves < 3x
    add("""SELECT DISTINCT a.Ticker
           FROM financials a JOIN financials b
             ON b.Ticker = a.Ticker AND b."Calendar Year" = a."Calendar Year" + 1
           WHERE a."Market Cap" >= 5e8 AND b."Market Cap" > 0
             AND a."Weighted Average Shs Out" > 0 AND b."Weighted Average Shs Out" > 0
             AND a.Revenue > 0 AND b.Revenue > 0
             AND b.Revenue / a.Revenue BETWEEN 0.33 AND 3
             AND ( (b."Market Cap" / b."Weighted Average Shs Out")
                   / (a."Market Cap" / a."Weighted Average Shs Out") > 8
                OR (b."Market Cap" / b."Weighted Average Shs Out")
                   / (a."Market Cap" / a."Weighted Average Shs Out") < 0.125 )""",
        "price jump without a revenue change")
    # A wrong cap on a LARGE company is what moves a sector total, so every
    # company that ever shows 20 billion dollars or more is checked.
    add("""SELECT DISTINCT Ticker FROM financials WHERE "Market Cap" >= 2e10""",
        "large cap")
    # one extreme multiple is enough above a billion
    add("""SELECT DISTINCT Ticker FROM financials
           WHERE "Market Cap" >= 1e9
             AND ("Price To Sales Ratio" > 50 OR "PB Ratio" > 50)""",
        "one extreme price multiple")
    # the cap itself moves 5x between adjacent years
    add("""SELECT DISTINCT a.Ticker
           FROM financials a JOIN financials b
             ON b.Ticker = a.Ticker AND b."Calendar Year" = a."Calendar Year" + 1
           WHERE (a."Market Cap" >= 1e9 OR b."Market Cap" >= 1e9)
             AND a."Market Cap" > 0 AND b."Market Cap" > 0
             AND (b."Market Cap" / a."Market Cap" > 5
                  OR b."Market Cap" / a."Market Cap" < 0.2)""",
        "cap moves 5x in a year")
    return out


def fetch_prices(ticker: str) -> Optional[dict]:
    """{'currency', 'dates', 'closes', 'cap_now', 'close_now'} from Yahoo, or
    None. Closes are split-adjusted and NOT dividend-adjusted, which is what a
    cap needs. The only network call in this module."""
    import yfinance as yf

    t = yf.Ticker(ticker)
    try:
        h = t.history(start="2007-06-01", auto_adjust=False)
    except Exception:  # noqa: BLE001 — one bad ticker must not stop the sweep
        return None
    if h is None or h.empty:
        return None
    closes = h["Close"].dropna()
    closes = closes[closes > 0]
    if closes.empty:
        return None
    try:
        meta = t.history_metadata or {}
    except Exception:  # noqa: BLE001
        meta = {}
    currency = meta.get("currency")
    cap_now = None
    try:
        fi = t.fast_info
        cap_now = getattr(fi, "market_cap", None)
        currency = currency or getattr(fi, "currency", None)
    except Exception:  # noqa: BLE001
        pass
    splits = []
    if "Stock Splits" in h.columns:
        sp = h["Stock Splits"]
        splits = [(ts.strftime("%Y-%m-%d"), float(v)) for ts, v in sp[sp > 0].items()]
    share_dates: list[str] = []
    share_counts: list[float] = []
    if splits:      # one more request, only for a company that ever split
        try:
            sh = t.get_shares_full(start="2007-06-01")
            if sh is not None and len(sh):
                sh = sh[~sh.index.duplicated(keep="last")].dropna()
                share_dates = [ts.strftime("%Y-%m-%d") for ts in sh.index]
                share_counts = [float(v) for v in sh.values]
        except Exception:  # noqa: BLE001 — the anchor rule is the fallback
            pass
    return {
        "currency": currency,
        "splits": splits,
        "share_dates": share_dates,
        "share_counts": share_counts,
        "dates": [ts.strftime("%Y-%m-%d") for ts in closes.index],
        "closes": [float(v) for v in closes.values],
        "cap_now": float(cap_now) if cap_now else None,
        "close_now": float(closes.values[-1]),
    }


def check_ticker(conn: sqlite3.Connection, ticker: str, prices: Optional[dict],
                 rates: dict, spot: dict, apply: bool = True) -> dict:
    """Check every annual row of `ticker` against `prices`, write the audit
    rows and (with `apply`) the corrections. Returns action counts."""
    from data import usd_ingest

    conn.execute(AUDIT_DDL)
    cols = ("Calendar Year", "Date", "Market Cap") + _INPUT_COLUMNS
    col_sql = ", ".join(f'"{c}"' for c in cols)
    rows = [dict(zip(cols, r)) for r in conn.execute(
        f'SELECT {col_sql} FROM financials WHERE Ticker = ? ORDER BY "Calendar Year"',
        (ticker,))]
    quarantined = {y: cap for y, cap in conn.execute(
        "SELECT year, market_cap FROM usd_ingest_cap_quarantine "
        "WHERE ticker = ? AND period = 'FY'", (ticker,))}
    changed_before = {(ticker, y): s for y, s in conn.execute(
        "SELECT year, stored FROM cap_check_audit "
        "WHERE ticker = ? AND action IN ('replace', 'clear')", (ticker,))}
    counts: dict[str, int] = {}

    usd_now = None
    if prices and prices.get("currency"):
        from data.fx_convert import usd_per_unit
        usd_now = usd_per_unit(prices["currency"], spot)   # USD -> 1.0, GBp -> /100

    splits = (prices or {}).get("splits") or []
    computed = []
    for row in rows:
        day = (row["Date"] or "")[:10]
        expected = chained = expected_raw = None
        if prices and day:
            close = close_on(prices["dates"], prices["closes"], day)
            rate = (usd_ingest.usd_rate(prices["currency"], day, rates)
                    if prices.get("currency") else None)
            expected = expected_cap(close, row["Weighted Average Shs Out"], rate)
            factor = split_factor_after(splits, day)
            if expected is not None and factor != 1.0:
                expected_raw = expected * factor
            if close and prices.get("cap_now") and usd_now and prices["close_now"] > 0:
                chained = prices["cap_now"] * usd_now * close / prices["close_now"]
        computed.append((row, day, expected, chained, expected_raw))

    # Anchor: the company's own price-to-sales in the years after its last
    # split, where the stored cap and price x shares agree.
    anchor_ps = None
    if splits:
        last_split = max(d for d, _ in splits)
        ps = sorted(
            row["Market Cap"] / row["Revenue"]
            for row, day, expected, _c, _r in computed
            if day > last_split and row["Revenue"] and row["Revenue"] > 0
            and agrees(row["Market Cap"], expected))
        if ps:
            anchor_ps = ps[len(ps) // 2]

    # Direct evidence beats the anchor: Yahoo's own share-count history holds
    # the count as it stood on each date. Where a row's share count equals it,
    # the vendor did NOT restate that row for the later split.
    verdict = restatement_verdict([
        (row["Weighted Average Shs Out"],
         shares_on((prices or {}).get("share_dates") or [],
                   (prices or {}).get("share_counts") or [], day),
         split_factor_after(splits, day))
        for row, day, _e, _c, _r in computed if day])

    share_dates = (prices or {}).get("share_dates") or []
    share_counts = (prices or {}).get("share_counts") or []

    for row, day, expected, chained, expected_raw in computed:
        year = row["Calendar Year"]
        stored = row["Market Cap"]
        was_quarantined = year in quarantined

        # The definition of a market cap: the price that traded x the shares
        # that existed. Available for a row that precedes a split when Yahoo
        # has the share count of that date, or when the company's rows are
        # known to hold unrestated counts.
        exact = None
        vendor_shares = row["Weighted Average Shs Out"]
        if expected_raw and vendor_shares:
            asof = shares_on(share_dates, share_counts, day)
            if asof:
                exact = expected_raw * asof / vendor_shares
            elif verdict == "raw":
                exact = expected_raw

        if exact is not None:
            if is_impossible(exact, row["Revenue"], row["Total Stockholders Equity"]):
                action, value, reason = "keep", None, "exact value is impossible; nothing changed"
            elif stored is None or stored <= 0:
                if exact_is_confirmed(None, exact, row["Revenue"], anchor_ps, chained):
                    action, value, reason = "replace", exact, \
                        "empty cell filled with traded price x shares of the date"
                else:
                    action, value, reason = "no_price", None, \
                        "traded price x shares is not confirmed; cell left empty"
            elif not exact_is_confirmed(stored, exact, row["Revenue"], anchor_ps, chained):
                action, value, reason = "keep", None, (
                    "traded price x shares is not confirmed by the company's own "
                    "price-to-sales or by today's cap; stored value kept")
            elif _within(stored, exact, ARBITER_FACTOR):
                action, value, reason = "keep", None, \
                    "stored value is within a factor of 3 of traded price x shares of the date"
            else:
                action, value, reason = "replace", exact, (
                    "share count was not restated for a later split or "
                    "consolidation; cap taken at the price that traded")
            expected = exact
        else:
            action, value, reason = decide(
                stored, expected, chained, row["Revenue"], row["Total Stockholders Equity"])
            if (action == "keep" and agrees(stored, expected) and expected_raw
                    and verdict is None):
                # no share history at all: the company's own P/S is the fallback
                fixed = split_candidate(stored, expected_raw, row["Revenue"], anchor_ps)
                if fixed is not None:
                    action, value = "replace", fixed
                    reason = ("share count was not restated for a later split or "
                              "consolidation; cap taken at the price that traded")
        # A replacement must itself be a cap a real company can have. The
        # share history of some markets is not as-of data, and a chained
        # figure can be far off; neither may put an impossible value in.
        if action == "replace" and is_impossible(
                value, row["Revenue"], row["Total Stockholders Equity"]):
            if is_impossible(stored, row["Revenue"], row["Total Stockholders Equity"]):
                action, value, reason = "clear", None,                     "stored value and independent value are both impossible"
            elif stored is None or stored <= 0:
                action, value, reason = "no_price", None,                     "independent value is impossible; cell left empty"
            else:
                action, value, reason = "keep", None,                     "independent value is impossible; stored value kept"
        elif action == "replace" and stored and stored > 0 and not replacement_is_no_worse(
                stored, value, row["Revenue"], row["Total Stockholders Equity"]):
            action, value, reason = "keep", None,                 "independent value is less credible than the stored value; stored value kept"
        if action in ("keep", "no_price") and is_impossible(
                stored, row["Revenue"], row["Total Stockholders Equity"]):
            action, value, reason = "clear", None,                 "stored value is impossible and nothing replaces it"
        if was_quarantined and action == "replace":
            reason = "quarantined cap restored: " + reason
        counts[action] = counts.get(action, 0) + 1
        # The audit's `stored` is the value BEFORE any correction. On a re-run
        # the cell already holds a corrected value, so the first recorded
        # original is kept; otherwise the change could not be reversed.
        original = quarantined.get(year, stored)
        if (ticker, year) in changed_before:
            original = changed_before[(ticker, year)]
        conn.execute(
            "INSERT OR REPLACE INTO cap_check_audit VALUES (?,?,?,?,?,?,?,?)",
            (ticker, year, day or None, original, expected, chained, action, reason))
        if apply and action in ("replace", "clear"):
            new = recompute_price_ratios(row, value if action == "replace" else None)
            sets = ", ".join(f'"{c}" = ?' for c in PRICE_COLUMNS)
            conn.execute(
                f'UPDATE financials SET {sets} WHERE Ticker = ? AND "Calendar Year" = ?',
                [new[c] for c in PRICE_COLUMNS] + [ticker, year])
    return counts


def formula_check(conn: sqlite3.Connection, sample: int = 20000) -> dict[str, float]:
    """Share of untouched rows on which each recompute formula reproduces the
    vendor's stored value within 1 percent. Run before trusting a formula."""
    cols = ("Market Cap",) + PRICE_COLUMNS[1:] + _INPUT_COLUMNS
    col_sql = ", ".join(f'"{c}"' for c in cols)
    hits = {c: [0, 0] for c in PRICE_COLUMNS[1:]}
    for r in conn.execute(
            f'SELECT {col_sql} FROM financials WHERE "Market Cap" > 0 '
            f'AND "Source Currency" IS NOT NULL ORDER BY random() LIMIT ?', (sample,)):
        row = dict(zip(cols, r))
        new = recompute_price_ratios(row, row["Market Cap"])
        for c in hits:
            old = row[c]
            if old in (None, 0) or new[c] is None:
                continue
            hits[c][1] += 1
            if abs(new[c] / old - 1.0) <= 0.01:
                hits[c][0] += 1
    return {c: (h / n if n else float("nan")) for c, (h, n) in hits.items()}


# ── sweep ────────────────────────────────────────────────────────────────────

PROGRESS_DDL = """
CREATE TABLE IF NOT EXISTS cap_check_progress (
    ticker TEXT PRIMARY KEY,
    why    TEXT,
    result TEXT
)
"""


def run(db_path: str, apply: bool = True, limit: Optional[int] = None,
        only: Optional[list[str]] = None, pause: float = 0.0,
        workers: int = 6) -> dict:
    """Check every suspicious ticker of `db_path` (a COPY). Resumable: a ticker
    with a row in `cap_check_progress` is skipped. One commit per ticker."""
    import json
    import time
    from pathlib import Path

    from data import usd_ingest
    from data.financial_db import fx_rates_from

    if Path(db_path).resolve().name.lower() == "financials.db":
        raise ValueError("refusing the live financials.db: check a copy, then swap")
    conn = sqlite3.connect(db_path, timeout=120)
    conn.execute(PROGRESS_DDL)
    conn.execute(AUDIT_DDL)
    rates = usd_ingest.load_rates(conn)
    spot = fx_rates_from(conn)
    todo = suspicious_tickers(conn)
    if only:
        todo = {t: todo.get(t, "requested") for t in only}
    done = {t for (t,) in conn.execute("SELECT ticker FROM cap_check_progress")}
    queue = [t for t in sorted(todo) if t not in done][:limit]
    total: dict[str, int] = {}
    print(f"suspicious: {len(todo)}   already done: {len(done)}   this run: {len(queue)}",
          flush=True)
    # The downloads are the slow part and they are independent, so they run in
    # a small thread pool. Every database write stays on this thread, in ticker
    # order, so the result is the same as a serial run.
    from concurrent.futures import ThreadPoolExecutor

    pool = ThreadPoolExecutor(max_workers=workers)
    fetched = pool.map(fetch_prices, queue)
    for i, (ticker, prices) in enumerate(zip(queue, fetched), 1):
        counts = check_ticker(conn, ticker, prices, rates, spot, apply=apply)
        for k, v in counts.items():
            total[k] = total.get(k, 0) + v
        # A dry run and a failed download are not a finished check: the
        # ticker must come up again on the next run.
        if apply and prices is not None:
            conn.execute("INSERT OR REPLACE INTO cap_check_progress VALUES (?,?,?)",
                         (ticker, todo[ticker], json.dumps(counts)))
        conn.commit()
        if i % 100 == 0:
            print(f"  {i}/{len(queue)}  {total}", flush=True)
        if pause:
            time.sleep(pause)
    pool.shutdown()
    conn.execute(
        "INSERT INTO job_runs(job, last_run) VALUES('cap_check', datetime('now')) "
        "ON CONFLICT(job) DO UPDATE SET last_run=excluded.last_run")
    conn.commit()
    conn.close()
    print(f"done: {total}", flush=True)
    return total


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("db_path")
    ap.add_argument("--dry-run", action="store_true", help="audit only, change nothing")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--only", nargs="+", metavar="TICKER")
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    run(a.db_path, apply=not a.dry_run, limit=a.limit, only=a.only, workers=a.workers)
