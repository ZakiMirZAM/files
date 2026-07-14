"""Phase 3b: delisted-company fundamentals backfill.

Reconstructs annual (FY) fundamentals for S&P 500 / S&P 400 constituents that
were REMOVED from their index (acquisitions, bankruptcies, take-privates) and
so are missing from the yfinance-fed warehouse. All data comes from SEC EDGAR
(company search + XBRL companyfacts) plus Stooq end-of-year closes for market
cap. Nothing here writes the DB: the orchestrator ingests the staged output.

Subcommands
-----------
  plan    Parse both index changes tables -> removals since 2012, drop the ones
          that still have >= 8 data-years in the DB (still-listed demotions),
          resolve each remaining name -> CIK via EDGAR company search, and write
          phase3b_targets.json ({targets, unresolved, counts}).

  fetch --limit N
          For up to N resolved targets not yet checkpointed, pull companyfacts,
          map us-gaap/dei facts to our columns for FY 2012..death, compute market
          cap from Stooq, and append rows to phase3b_staged.jsonl (+ meta records
          to phase3b_meta.jsonl). Resumable via phase3b_checkpoint.json.

  stats   Summarize phase3b_staged.jsonl.

Usage
-----
    python remediation/phase3b_delisted.py plan  <db_path>
    python remediation/phase3b_delisted.py fetch <db_path> --limit 50
    python remediation/phase3b_delisted.py stats <db_path>

<db_path> is REQUIRED (no default) and is only read (never written) by plan.
SEC etiquette: UA 'IntrinsicFinEd admin@intrinsicfined.org', <= 8 req/s.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)                      # identity_lib
sys.path.insert(0, os.path.join(ROOT, "data"))  # financial_db

import identity_lib  # noqa: E402
from financial_db import EXCEL_COLUMNS, is_valid_year_period  # noqa: E402

# ── files ─────────────────────────────────────────────────────────────────────
SP500_HTML = os.path.join(HERE, "sp500_constituents.html")
SP400_HTML = os.path.join(HERE, "sp400_constituents.html")
TARGETS_JSON = os.path.join(HERE, "phase3b_targets.json")
STAGED_JSONL = os.path.join(HERE, "phase3b_staged.jsonl")
META_JSONL = os.path.join(HERE, "phase3b_meta.jsonl")
CHECKPOINT_JSON = os.path.join(HERE, "phase3b_checkpoint.json")

# ── constants ───────────────────────────────────────────────────────────────
USER_AGENT = "IntrinsicFinEd admin@intrinsicfined.org"
MIN_SEC_INTERVAL = 1.0 / 8.0          # <= 8 req/s
HTTP_TIMEOUT = 30.0
SINCE_YEAR = 2012                     # backfill window floor
STILL_LISTED_YEARS = 8               # >= this many DB years -> not delisted
MATCH_THRESHOLD = 0.72               # fuzzy name-match acceptance
FY_MIN_DAYS, FY_MAX_DAYS = 300, 400  # annual duration window
NEAR_FYE_MAX_DAYS = 120              # dei shares must be within this of FYE

_CORP_SUFFIXES = (
    "INCORPORATED", "INC", "CORPORATION", "CORP", "COMPANY", "COMPANIES", "CO",
    "LIMITED", "LTD", "LLC", "LP", "PLC", "HOLDINGS", "HOLDING", "GROUP",
    "CLASS A", "CLASS B", "CLASS C", "THE", "SA", "NV", "AG", "TRUST",
)
_SUFFIX_RE = re.compile(
    r"\b(" + "|".join(re.escape(s) for s in _CORP_SUFFIXES) + r")\b")
_FOOTNOTE_RE = re.compile(r"\[[^\]]*\]")


def normalize_name(name: str) -> str:
    """Upper-case, drop corporate suffixes and punctuation, collapse spaces.

    'Conagra Brands, Inc.' and 'CONAGRA BRANDS INC.' both -> 'CONAGRA BRANDS'.
    """
    s = (name or "").upper()
    s = re.sub(r"/[A-Z]{1,3}/", " ", s)        # /DE/ state-of-incorp markers
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = _SUFFIX_RE.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


# ── HTTP with SEC rate limiting ───────────────────────────────────────────────

class _RateLimiter:
    """Simple wall-clock spacer so sec.gov hits stay under 8 req/s."""

    def __init__(self, min_interval: float) -> None:
        self._min = min_interval
        self._last = 0.0

    def wait(self) -> None:
        gap = self._min - (time.monotonic() - self._last)
        if gap > 0:
            time.sleep(gap)
        self._last = time.monotonic()


_sec_limiter = _RateLimiter(MIN_SEC_INTERVAL)


def http_get(url: str, *, rate_limited: bool = True,
             retries: int = 2) -> bytes | None:
    """GET bytes with the SEC contact UA. Returns None on 404 / repeated error.

    Only sec.gov hosts are paced by the limiter; Stooq is a different host and
    passes rate_limited=False.
    """
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        if rate_limited:
            _sec_limiter.wait()
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            last_err = exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_err = exc
        time.sleep(0.5 * (attempt + 1))
    print(f"  http_get failed: {url} ({last_err})", file=sys.stderr)
    return None


# ── EDGAR company-name search (atom) ─────────────────────────────────────────

_EDGAR_SEARCH = (
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany"
    "&company={q}&type=10-K&dateb=&owner=include&count=10&output=atom")


def _atom_candidates(xml_bytes: bytes) -> list[tuple[str, str | None]]:
    """(cik, conformed_name|None) pairs from an EDGAR company-search atom feed.

    A unique match renders one top-level <company-info> with a real
    <conformed-name>; an ambiguous match renders several <entry> blocks whose
    per-entry name is an EDGAR 'ARRAY(0x..)' rendering bug, so name is None.
    """
    try:
        text = xml_bytes.decode("utf-8", "replace")
        text = re.sub(r'\sxmlns="[^"]*"', "", text, count=1)
        root = ET.fromstring(text)
    except (ET.ParseError, ValueError):
        return []
    out: list[tuple[str, str | None]] = []
    for info in root.iter("company-info"):
        cik_el = info.find("cik")
        if cik_el is None or not (cik_el.text or "").strip():
            continue
        name_el = info.find("conformed-name")
        name = (name_el.text or "").strip() if name_el is not None else None
        if name and name.startswith("ARRAY("):
            name = None
        out.append((cik_el.text.strip(), name))
    return out


def resolve_cik(ticker: str, name: str) -> dict | None:
    """Resolve a removed security name to a CIK via EDGAR, fuzzy-matched.

    Returns {cik, matched_name, confidence} or None when nothing clears the
    threshold. Tries the full security name, then the suffix-stripped name.
    """
    for query in _dedupe([name, normalize_name(name)]):
        if not query:
            continue
        data = http_get(_EDGAR_SEARCH.format(q=urllib.parse.quote(query)))
        if not data:
            continue
        cands = _atom_candidates(data)
        best = _best_candidate(name, cands)
        if best:
            return best
        named = [c for c in cands if c[1]]
        if not named and len(cands) == 1:  # single nameless hit -> weak accept
            return {"cik": identity_lib.pad_cik(cands[0][0]),
                    "matched_name": None, "confidence": 0.5}
    return None


def _best_candidate(name: str, cands: list[tuple[str, str | None]]) -> dict | None:
    """Highest-ratio named candidate at/above MATCH_THRESHOLD, else None."""
    target = normalize_name(name)
    best: dict | None = None
    for cik, cand_name in cands:
        if not cand_name:
            continue
        ratio = SequenceMatcher(None, target, normalize_name(cand_name)).ratio()
        if ratio >= MATCH_THRESHOLD and (best is None or ratio > best["confidence"]):
            best = {"cik": identity_lib.pad_cik(cik),
                    "matched_name": cand_name, "confidence": round(ratio, 3)}
    return best


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        if it and it not in seen:
            seen.add(it)
            out.append(it)
    return out


# ── plan: parse index changes tables ─────────────────────────────────────────

@dataclass(frozen=True)
class Removal:
    ticker: str
    name: str
    removed: str          # ISO effective date
    reason: str


def _parse_changes(html_path: str) -> list[Removal]:
    """Removals (since SINCE_YEAR) from a Wikipedia index changes table."""
    import pandas as pd  # local import: pandas is heavy, only plan needs it

    tables = pd.read_html(html_path)
    changes = tables[1]                        # table[1] is the changes table
    date_col = changes.columns[0]              # ('Effective Date',..) or ('Date',..)
    out: list[Removal] = []
    for _, row in changes.iterrows():
        ticker = _cell(row, ("Removed", "Ticker"))
        if not ticker:
            continue                           # pure addition row
        eff = pd.to_datetime(row[date_col], errors="coerce")
        if pd.isna(eff) or eff.year < SINCE_YEAR:
            continue
        name = _cell(row, ("Removed", "Security")) or ticker
        reason = _FOOTNOTE_RE.sub("", _cell(row, ("Reason", "Reason")) or "").strip()
        out.append(Removal(ticker=ticker.strip().upper(), name=name.strip(),
                            removed=eff.date().isoformat(), reason=reason))
    return out


def _cell(row, key) -> str:
    """Stringified MultiIndex cell, '' for NaN/missing."""
    try:
        val = row[key]
    except KeyError:
        return ""
    if val is None:
        return ""
    s = str(val).strip()
    return "" if s.lower() in ("nan", "none", "") else s


def _dedupe_removals(removals: list[Removal]) -> list[Removal]:
    """Keep the most recent removal per ticker (re-added then re-removed)."""
    latest: dict[str, Removal] = {}
    for r in removals:
        cur = latest.get(r.ticker)
        if cur is None or r.removed > cur.removed:
            latest[r.ticker] = r
    return sorted(latest.values(), key=lambda r: r.removed)


def _data_years(con: sqlite3.Connection, ticker: str) -> int:
    """Distinct FY count for a ticker and its security_map primary (max of both)."""
    def _count(sym: str) -> int:
        row = con.execute(
            'SELECT COUNT(DISTINCT "Calendar Year") FROM financials WHERE Ticker=?',
            (sym,)).fetchone()
        return int(row[0]) if row else 0

    years = _count(ticker)
    primary = _primary_symbol(con, ticker)
    if primary and primary != ticker:
        years = max(years, _count(primary))
    return years


def _primary_symbol(con: sqlite3.Connection, ticker: str) -> str | None:
    """Follow a security_map alias to its cik's primary symbol, if any."""
    row = con.execute(
        "SELECT cik, is_primary FROM security_map WHERE symbol=?",
        (ticker,)).fetchone()
    if not row or not row[0]:
        return None
    if row[1]:                                 # already primary
        return ticker
    prim = con.execute(
        "SELECT symbol FROM security_map WHERE cik=? AND is_primary=1",
        (row[0],)).fetchone()
    return prim[0] if prim else None


def cmd_plan(db_path: str) -> None:
    removals = _dedupe_removals(
        _parse_changes(SP500_HTML) + _parse_changes(SP400_HTML))
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    delisted = [r for r in removals
                if _data_years(con, r.ticker) < STILL_LISTED_YEARS]
    con.close()
    print(f"removal events (since {SINCE_YEAR}, deduped): {len(removals)}")
    print(f"excluded (>= {STILL_LISTED_YEARS} DB years): "
          f"{len(removals) - len(delisted)}")
    print(f"delisted candidates to resolve:              {len(delisted)}")

    targets: list[dict] = []
    unresolved: list[dict] = []
    for i, r in enumerate(delisted, 1):
        match = resolve_cik(r.ticker, r.name)
        base = {"ticker": r.ticker, "name": r.name,
                "removed": r.removed, "reason": r.reason}
        if match and match.get("cik"):
            targets.append({**base, **match})
        else:
            unresolved.append(base)
        if i % 25 == 0:
            print(f"  resolved {i}/{len(delisted)} ...", file=sys.stderr)

    payload = {
        "generated_at": _dt.datetime.now().isoformat(timespec="seconds"),
        "counts": {"removals": len(removals), "delisted": len(delisted),
                   "resolved": len(targets), "unresolved": len(unresolved)},
        "targets": targets,
        "unresolved": unresolved,
    }
    with open(TARGETS_JSON, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    print(f"resolved: {len(targets)}   unresolved: {len(unresolved)}")
    print(f"wrote {TARGETS_JSON}")


# ── companyfacts -> our columns (pure, unit-tested) ───────────────────────────
# (concepts in priority order, target columns, is_flow(=duration), negate)
CONCEPT_SPEC: tuple[tuple[list[str], list[str], bool, bool], ...] = (
    (["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"],
     ["Revenue"], True, False),
    (["CostOfRevenue"], ["Cost Of Revenue"], True, False),
    (["GrossProfit"], ["Gross Profit"], True, False),
    (["OperatingIncomeLoss"], ["Operating Income"], True, False),
    (["NetIncomeLoss"], ["Net Income"], True, False),
    (["ResearchAndDevelopmentExpense"],
     ["Research And Development Expenses"], True, False),
    (["IncomeTaxExpenseBenefit"], ["Income Tax Expense"], True, False),
    (["InterestExpense"], ["Interest Expense"], True, False),
    (["Assets"], ["Total Assets"], False, False),
    (["Liabilities"], ["Total Liabilities"], False, False),
    (["StockholdersEquity"], ["Total Stockholders Equity", "Total Equity"],
     False, False),
    (["CashAndCashEquivalentsAtCarryingValue"],
     ["Cash And Cash Equivalents"], False, False),
    (["LongTermDebt"], ["Long Term Debt"], False, False),
    (["NetCashProvidedByUsedInOperatingActivities"],
     ["Operating Cash Flow"], True, False),
    (["PaymentsToAcquirePropertyPlantAndEquipment"],
     ["Capital Expenditure"], True, True),
)
_FY_FORMS = ("10-K", "10-K/A")


def _days_between(start: str, end: str) -> int | None:
    try:
        return (_dt.date.fromisoformat(end) - _dt.date.fromisoformat(start)).days
    except (ValueError, TypeError):
        return None


def _fy_facts_by_year(usd_facts: list[dict], *, is_flow: bool,
                      start_year: int, end_year: int | None) -> dict[int, dict]:
    """FY 10-K facts keyed by end-date year; latest 'filed' wins (restatements)."""
    by_year: dict[int, dict] = {}
    for f in usd_facts:
        if f.get("form") not in _FY_FORMS or f.get("fp") != "FY":
            continue
        end = f.get("end")
        if not end or len(end) < 4 or not end[:4].isdigit():
            continue
        year = int(end[:4])
        if year < start_year or (end_year is not None and year > end_year):
            continue
        if is_flow:
            days = _days_between(f.get("start", ""), end)
            if days is None or not (FY_MIN_DAYS <= days <= FY_MAX_DAYS):
                continue
        prev = by_year.get(year)
        if prev is None or f.get("filed", "") > prev.get("filed", ""):
            by_year[year] = f
    return by_year


def _apply_concept(rows: dict[int, dict], node: dict, targets: list[str],
                   *, is_flow: bool, negate: bool,
                   start_year: int, end_year: int | None) -> None:
    """Fill target columns for one concept node (USD units only, gaps only)."""
    usd = (node.get("units") or {}).get("USD")   # non-USD units are skipped
    if not usd:
        return
    for year, fact in _fy_facts_by_year(
            usd, is_flow=is_flow, start_year=start_year, end_year=end_year).items():
        val = fact.get("val")
        if val is None:
            continue
        row = rows.setdefault(year, {})
        row.setdefault("Date", fact.get("end"))
        for col in targets:
            row.setdefault(col, -val if negate else val)  # higher priority wins


def _extract_shares(dei: dict, rows: dict[int, dict]) -> None:
    """Attach period-end shares outstanding nearest each FYE as row['_shares']."""
    node = dei.get("EntityCommonStockSharesOutstanding")
    facts = (node.get("units") or {}).get("shares") if node else None
    if not facts:
        return
    dated = [(f["end"], f["val"]) for f in facts
             if f.get("form") in _FY_FORMS and f.get("end") and f.get("val")]
    for year, row in rows.items():
        fye = row.get("Date")
        if not fye:
            continue
        nearest = _nearest_share(dated, fye)
        if nearest is not None:
            row["_shares"] = nearest


def _nearest_share(dated: list[tuple[str, float]], fye: str) -> float | None:
    """Share count whose date is closest to (within NEAR_FYE_MAX_DAYS of) FYE."""
    best_val: float | None = None
    best_gap = NEAR_FYE_MAX_DAYS + 1
    for end, val in dated:
        gap = _days_between(fye, end)
        if gap is None:
            gap = _days_between(end, fye)
        if gap is None:
            continue
        gap = abs(gap)
        if gap < best_gap:
            best_gap, best_val = gap, val
    return best_val


def map_companyfacts(facts: dict, cik: str, name: str, *,
                     start_year: int = SINCE_YEAR,
                     end_year: int | None = None) -> dict[int, dict]:
    """Map an XBRL companyfacts payload to FY financials rows keyed by year.

    Each row uses exact `financials` column names, adds the scalar identity
    fields (Period/Cik/Reported Currency/Calendar Year/Name), computes Free Cash
    Flow, and carries period-end shares in '_shares' (not a DB column). Only USD
    units are consumed; non-USD-only concepts are dropped.
    """
    usgaap = (facts.get("facts") or {}).get("us-gaap") or {}
    dei = (facts.get("facts") or {}).get("dei") or {}
    rows: dict[int, dict] = {}
    for concepts, targets, is_flow, negate in CONCEPT_SPEC:
        for concept in concepts:               # priority order; gaps-only fill
            node = usgaap.get(concept)
            if node:
                _apply_concept(rows, node, targets, is_flow=is_flow,
                               negate=negate, start_year=start_year,
                               end_year=end_year)
    _extract_shares(dei, rows)
    return _finalize_rows(rows, cik, name)


def _finalize_rows(rows: dict[int, dict], cik: str, name: str) -> dict[int, dict]:
    """Add identity scalars + Free Cash Flow; drop invalid years."""
    padded = identity_lib.pad_cik(cik)
    out: dict[int, dict] = {}
    for year, row in rows.items():
        if not is_valid_year_period(year, "FY"):
            continue
        ocf = row.get("Operating Cash Flow")
        capex = row.get("Capital Expenditure")
        if ocf is not None and capex is not None:
            row.setdefault("Free Cash Flow", ocf + capex)  # capex already negated
        row.update({"Ticker": None, "Name": name, "Sector": None,
                    "Industry": None, "Period": "FY", "Cik": padded,
                    "Reported Currency": "USD", "Calendar Year": year})
        out[year] = row
    return out


# ── Stooq end-of-year close -> market cap ─────────────────────────────────────

_STOOQ = ("https://stooq.com/q/d/l/?s={sym}.us"
          "&d1={d1}&d2={d2}&i=d")


def _stooq_symbol(ticker: str) -> str:
    return identity_lib.norm_dot_dash(ticker).lower().replace("-", "-")


def fetch_stooq_closes(ticker: str, fye_dates: list[str]) -> dict[str, float]:
    """{iso_date: close} for the daily series spanning the requested FYE dates.

    404 / empty (very dead names) returns {} so market cap falls back to NULL.
    """
    if not fye_dates:
        return {}
    lo = min(fye_dates)
    hi = max(fye_dates)
    d1 = (_dt.date.fromisoformat(lo) - _dt.timedelta(days=30)).strftime("%Y%m%d")
    d2 = _dt.date.fromisoformat(hi).strftime("%Y%m%d")
    url = _STOOQ.format(sym=urllib.parse.quote(_stooq_symbol(ticker)), d1=d1, d2=d2)
    data = http_get(url, rate_limited=False)
    if not data:
        return {}
    closes: dict[str, float] = {}
    for line in data.decode("utf-8", "replace").splitlines()[1:]:
        parts = line.split(",")
        if len(parts) < 5:
            continue
        try:
            closes[parts[0]] = float(parts[4])
        except ValueError:
            continue
    return closes


def _close_on_or_before(closes: dict[str, float], fye: str,
                        window_days: int = 10) -> float | None:
    """Close on FYE or the most recent trading day within `window_days` before."""
    try:
        day = _dt.date.fromisoformat(fye)
    except ValueError:
        return None
    for back in range(window_days + 1):
        key = (day - _dt.timedelta(days=back)).isoformat()
        if key in closes:
            return closes[key]
    return None


def _attach_market_caps(ticker: str, rows: dict[int, dict],
                        failures: dict[str, int]) -> None:
    """Set 'Market Cap' (USD) = shares x FYE close; NULL + log when unavailable."""
    fye_dates = [r["Date"] for r in rows.values() if r.get("Date")]
    closes = fetch_stooq_closes(ticker, fye_dates)
    if not closes:
        failures["stooq_no_prices"] = failures.get("stooq_no_prices", 0) + 1
    for row in rows.values():
        shares = row.get("_shares")
        close = _close_on_or_before(closes, row.get("Date", "")) if closes else None
        row["Market Cap"] = (shares * close
                             if shares is not None and close is not None else None)


# ── fetch command ─────────────────────────────────────────────────────────────

_COMPANYFACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"


@dataclass
class Checkpoint:
    done: list[str] = field(default_factory=list)
    failed: dict[str, str] = field(default_factory=dict)

    @classmethod
    def load(cls) -> "Checkpoint":
        if not os.path.exists(CHECKPOINT_JSON):
            return cls()
        with open(CHECKPOINT_JSON, encoding="utf-8") as fh:
            raw = json.load(fh)
        return cls(done=raw.get("done", []), failed=raw.get("failed", {}))

    def save(self) -> None:
        with open(CHECKPOINT_JSON, "w", encoding="utf-8") as fh:
            json.dump({"done": self.done, "failed": self.failed}, fh, indent=2)


def _stage_rows(rows: dict[int, dict]) -> list[dict]:
    """Order columns per EXCEL_COLUMNS, drop private keys, one dict per FY row."""
    staged: list[dict] = []
    for year in sorted(rows):
        row = rows[year]
        staged.append({col: row.get(col) for col in EXCEL_COLUMNS})
    return staged


def _process_target(target: dict, failures: dict[str, int]) -> list[dict] | None:
    """Fetch + map + market-cap one target. None on hard failure (logged)."""
    cik = target["cik"]
    data = http_get(_COMPANYFACTS.format(cik=cik))
    if not data:
        failures["no_companyfacts"] = failures.get("no_companyfacts", 0) + 1
        return None
    try:
        facts = json.loads(data)
    except json.JSONDecodeError:
        failures["bad_json"] = failures.get("bad_json", 0) + 1
        return None
    death = int(target["removed"][:4]) if target.get("removed") else None
    rows = map_companyfacts(facts, cik, target.get("name") or "",
                            start_year=SINCE_YEAR, end_year=death)
    if not rows:
        failures["no_fy_facts"] = failures.get("no_fy_facts", 0) + 1
        return None
    _attach_market_caps(target["ticker"], rows, failures)
    return _stage_rows(rows)


def cmd_fetch(db_path: str, limit: int) -> None:
    if not os.path.exists(TARGETS_JSON):
        raise SystemExit(f"targets not found: {TARGETS_JSON} (run 'plan' first)")
    with open(TARGETS_JSON, encoding="utf-8") as fh:
        targets = json.load(fh).get("targets", [])
    ckpt = Checkpoint.load()
    pending = [t for t in targets if t["cik"] not in ckpt.done][:limit]
    print(f"targets: {len(targets)}   done: {len(ckpt.done)}   "
          f"this run: {len(pending)}")

    failures: dict[str, int] = {}
    staged_n = 0
    with open(STAGED_JSONL, "a", encoding="utf-8") as staged_fh, \
            open(META_JSONL, "a", encoding="utf-8") as meta_fh:
        for i, target in enumerate(pending, 1):
            try:
                rows = _process_target(target, failures)
            except Exception as exc:  # noqa: BLE001 — one bad filer must not stop the sweep
                print(f"  ERROR {target['ticker']}: {exc}", file=sys.stderr)
                ckpt.failed[target["cik"]] = str(exc)
                rows = None
            if rows:
                for row in rows:
                    staged_fh.write(json.dumps(row) + "\n")
                    staged_n += 1
                meta_fh.write(json.dumps({
                    "ticker": target["ticker"], "name": target.get("name"),
                    "cik": target["cik"], "removed": target.get("removed"),
                    "reason": target.get("reason")}) + "\n")
            ckpt.done.append(target["cik"])
            if i % 10 == 0:
                ckpt.save()
                print(f"  processed {i}/{len(pending)} ...", file=sys.stderr)
    ckpt.save()
    print(f"staged rows appended: {staged_n}")
    if failures:
        print("failures: " + ", ".join(f"{k}={v}" for k, v in sorted(failures.items())))


# ── stats command ─────────────────────────────────────────────────────────────

def cmd_stats(_db_path: str) -> None:
    if not os.path.exists(STAGED_JSONL):
        print("no staged file yet")
        return
    tickers: set[str] = set()
    ciks: set[str] = set()
    years: list[int] = []
    with_mc = missing_sector = total = 0
    with open(STAGED_JSONL, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            total += 1
            ciks.add(row.get("Cik"))
            if row.get("Ticker"):
                tickers.add(row["Ticker"])
            year = row.get("Calendar Year")
            if isinstance(year, int):
                years.append(year)
            if row.get("Market Cap") is not None:
                with_mc += 1
            if not row.get("Sector"):
                missing_sector += 1
    print(f"staged rows:            {total}")
    print(f"distinct CIKs:          {len(ciks)}")
    print(f"distinct tickers:       {len(tickers)}")
    if years:
        print(f"year range:             {min(years)}..{max(years)}")
    print(f"rows with Market Cap:   {with_mc}")
    print(f"rows missing Sector:    {missing_sector} (flagged for classification)")
    if os.path.exists(META_JSONL):
        reasons: dict[str, int] = {}
        with open(META_JSONL, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    reason = json.loads(line).get("reason") or "(none)"
                    reasons[reason] = reasons.get(reason, 0) + 1
        print("removal reasons:")
        for reason, n in sorted(reasons.items(), key=lambda kv: -kv[1])[:10]:
            print(f"  {n:4d}  {reason[:70]}")


# ── CLI ─────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 1
    command, db_path = argv[1], argv[2]
    if command == "plan":
        cmd_plan(db_path)
    elif command == "fetch":
        limit = _parse_limit(argv[3:])
        cmd_fetch(db_path, limit)
    elif command == "stats":
        cmd_stats(db_path)
    else:
        print(f"unknown command: {command!r}", file=sys.stderr)
        print(__doc__)
        return 1
    return 0


def _parse_limit(extra: list[str]) -> int:
    if "--limit" in extra:
        idx = extra.index("--limit")
        if idx + 1 < len(extra) and extra[idx + 1].isdigit():
            return int(extra[idx + 1])
    raise SystemExit("fetch requires --limit N")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
