"""
betas/edgar_client.py — SEC EDGAR 10-K business-segment revenue ingestion.

Flow per ticker (all fetches through marketdata's cached_download):

    ticker -> CIK            financials."Cik" column first, else the SEC's
                             company_tickers.json mapping (cached 30 days)
    CIK -> newest 10-K       data.sec.gov/submissions/CIK##########.json (7 days)
    accession -> instance    the filing dir's index.json, then the extracted
                             XBRL instance (*_htm.xml) — immutable, cached forever
    instance -> segments     stdlib ElementTree parse: FY-duration facts carrying
                             us-gaap:StatementBusinessSegmentsAxis (fallback
                             srt:ProductOrServiceAxis), consolidated total from
                             the same concept without dimensions

Etiquette: SEC requires a declared contact User-Agent and asks for <=10 req/s;
a module-level limiter paces actual network hits to ~8/s. Cache hits don't sleep.

Foreign filers (no CIK / no 10-K — e.g. 20-F filers like TSM) simply store
nothing, and the resolver falls through to the single-industry level (L3).
"""

from __future__ import annotations

import datetime as _dt
import json
import re
import sqlite3
import threading
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from marketdata.http_cache import cached_download

from . import segment_store

SEC_USER_AGENT = "IntrinsicFinEd/1.0 zakizamzaki08@gmail.com"

_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
_FILING_INDEX_URL = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession_nodash}/index.json"
_FILING_FILE_URL = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession_nodash}/{name}"

# Revenue concepts in priority order (us-gaap local names).
_REVENUE_CONCEPTS = (
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
)

_BUSINESS_AXIS = "StatementBusinessSegmentsAxis"
_PRODUCT_AXIS = "ProductOrServiceAxis"
# The one companion axis a segment context may carry (with this member).
_CONSOLIDATION_AXIS = "ConsolidationItemsAxis"
_OPERATING_MEMBER = "OperatingSegmentsMember"

# FY-length duration window (days) — annual periods, tolerant of 52/53-week years.
_FY_MIN_DAYS, _FY_MAX_DAYS = 330, 430

_MIN_NETWORK_INTERVAL = 1.0 / 8.0  # ~8 req/s, under SEC's 10/s ceiling
_last_network_hit = 0.0
_network_lock = threading.Lock()


def _fetch(url: str, cache_name: str, *, max_age_days: float, force: bool = False) -> bytes | None:
    """cached_download with the SEC contact UA + network pacing."""
    global _last_network_hit
    with _network_lock:
        wait = _MIN_NETWORK_INTERVAL - (time.monotonic() - _last_network_hit)
        if wait > 0:
            time.sleep(wait)
        result = cached_download(
            url, cache_name, max_age_days=max_age_days, force=force,
            user_agent=SEC_USER_AGENT,
        )
        if not result.from_cache:
            _last_network_hit = time.monotonic()
        return result.data


# ── ticker -> CIK ─────────────────────────────────────────────────────────────

def cik_for_ticker(conn: sqlite3.Connection, ticker: str) -> str | None:
    """10-digit zero-padded CIK, from financials."Cik" first, then the SEC map."""
    t = ticker.strip().upper()
    try:
        row = conn.execute(
            'SELECT "Cik" FROM financials WHERE Ticker = ? AND "Cik" IS NOT NULL '
            'ORDER BY "Calendar Year" DESC LIMIT 1', [t]).fetchone()
        if row and row[0]:
            digits = re.sub(r"\D", "", str(row[0]))
            if digits:
                return digits.zfill(10)
    except sqlite3.OperationalError:
        pass

    data = _fetch(_TICKER_MAP_URL, "sec_company_tickers.json", max_age_days=30.0)
    if not data:
        return None
    try:
        mapping = json.loads(data)
    except json.JSONDecodeError:
        return None
    for entry in mapping.values():
        if str(entry.get("ticker", "")).upper() == t:
            return str(entry.get("cik_str", "")).zfill(10)
    return None


# ── submissions -> newest 10-K ────────────────────────────────────────────────

@dataclass(frozen=True)
class TenK:
    accession: str          # e.g. "0000320193-24-000123"
    period_end: str         # ISO date the filing reports on
    fiscal_year: int


def latest_10k(cik: str, *, force: bool = False) -> TenK | None:
    data = _fetch(_SUBMISSIONS_URL.format(cik=cik), f"sec_submissions_{cik}.json",
                  max_age_days=7.0, force=force)
    if not data:
        return None
    try:
        sub = json.loads(data)
        recent = sub["filings"]["recent"]
        forms = recent["form"]
        accessions = recent["accessionNumber"]
        report_dates = recent["reportDate"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return None
    for i, form in enumerate(forms):
        if form in ("10-K", "10-K/A"):
            period_end = report_dates[i] or ""
            try:
                fy = int(period_end[:4])
            except ValueError:
                continue
            return TenK(accessions[i], period_end, fy)
    return None


# ── DEF 14A proxy statement (executive compensation, Item 402) ────────────────

@dataclass(frozen=True)
class ProxyFiling:
    accession: str
    filed_date: str


def latest_def14a(cik: str, *, force: bool = False) -> ProxyFiling | None:
    """Newest DEF 14A proxy statement (holds the Summary Compensation Table and
    pay-vs-performance disclosure). Reuses the cached submissions JSON."""
    data = _fetch(_SUBMISSIONS_URL.format(cik=cik), f"sec_submissions_{cik}.json",
                  max_age_days=7.0, force=force)
    if not data:
        return None
    try:
        recent = json.loads(data)["filings"]["recent"]
        forms = recent["form"]
        accessions = recent["accessionNumber"]
        filed = recent["filingDate"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return None
    for i, form in enumerate(forms):
        if form == "DEF 14A":
            return ProxyFiling(accessions[i], filed[i] or "")
    return None


def _primary_doc_url(cik: str, accession: str) -> str | None:
    """The primary HTML document in a filing directory (the readable proxy), not
    the SEC index page."""
    cik_int = str(int(cik))
    nodash = accession.replace("-", "")
    data = _fetch(
        _FILING_INDEX_URL.format(cik_int=cik_int, accession_nodash=nodash),
        f"sec_index_{nodash}.json", max_age_days=36500.0,
    )
    if not data:
        return None
    try:
        items = json.loads(data)["directory"]["item"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return None
    htmls = [
        it.get("name", "") for it in items
        if it.get("name", "").lower().endswith((".htm", ".html"))
        and "index" not in it.get("name", "").lower()
    ]
    if not htmls:
        return None
    return _FILING_FILE_URL.format(cik_int=cik_int, accession_nodash=nodash, name=htmls[0])


def get_def14a(conn: sqlite3.Connection, ticker: str, *, force: bool = False) -> dict | None:
    """Locate the latest DEF 14A proxy for a ticker: {url, filedDate, accession}.
    Best-effort; None for foreign filers / missing proxies."""
    cik = cik_for_ticker(conn, ticker)
    if cik is None:
        return None
    proxy = latest_def14a(cik, force=force)
    if proxy is None:
        return None
    url = _primary_doc_url(cik, proxy.accession)
    if url is None:
        return None
    return {"url": url, "filedDate": proxy.filed_date, "accession": proxy.accession}


# ── Latest periodic filings: 10-K (annual) and 10-Q (quarterly) ───────────────
# The reports an investor actually reads to analyze a company, rather than the
# stream of 8-K material-event notices that matter mostly to existing holders.
# The feed surfaces only the most recent annual report and the most recent
# quarterly report. Foreign filers (no 10-K/10-Q) fall back to the 20-F or 40-F
# annual report so the section is not empty for ADRs. The submissions JSON this
# module already caches lists every recent filing, so the feed costs no extra call.

_ANNUAL_FORMS = ("10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A")
_QUARTERLY_FORMS = ("10-Q", "10-Q/A")
_EVENT_FORMS = _ANNUAL_FORMS + _QUARTERLY_FORMS


def _filing_bucket(form: str):
    """Group a form into the annual or quarterly bucket (or None)."""
    if form in _ANNUAL_FORMS:
        return "annual"
    if form in _QUARTERLY_FORMS:
        return "quarterly"
    return None


def _latest_per_bucket(events: list[dict]) -> list[dict]:
    """From a newest-first list, keep the most recent annual and quarterly filing."""
    out: list[dict] = []
    seen: set[str] = set()
    for e in events:
        bucket = _filing_bucket(e["form"])
        if bucket is None or bucket in seen:
            continue
        seen.add(bucket)
        out.append(e)
        if len(seen) >= 2:
            break
    return out

# 8-K item codes -> plain English (SEC Form 8-K instructions). 6-Ks carry none.
EVENT_ITEM_LABELS = {
    "1.01": "Material agreement signed",
    "1.02": "Material agreement terminated",
    "1.03": "Bankruptcy or receivership",
    "2.01": "Acquisition or disposal completed",
    "2.02": "Results announced",
    "2.03": "New debt or obligation",
    "2.04": "Debt acceleration triggered",
    "2.05": "Exit or disposal costs",
    "2.06": "Material impairment",
    "3.01": "Listing standard notice",
    "3.02": "Unregistered share sale",
    "4.01": "Auditor change",
    "4.02": "Past financials can no longer be relied on",
    "5.01": "Change in control",
    "5.02": "Officer or director change",
    "5.03": "Charter or bylaw change",
    "5.07": "Shareholder vote results",
    "7.01": "Regulation FD disclosure",
    "8.01": "Other material event",
    "9.01": "Financial statements and exhibits",
}


def _ensure_events_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS edgar_events (
               cik TEXT NOT NULL, accession TEXT NOT NULL, form TEXT,
               filing_date TEXT, report_date TEXT, items TEXT,
               primary_doc TEXT, updated TEXT,
               PRIMARY KEY (cik, accession))"""
    )


def _event_dict(cik: str, accession: str, form: str, filing_date: str,
                report_date: str, items: str, primary_doc: str) -> dict:
    cik_int = str(int(cik))
    nodash = accession.replace("-", "")
    url = (_FILING_FILE_URL.format(cik_int=cik_int, accession_nodash=nodash,
                                   name=primary_doc)
           if primary_doc else None)
    codes = [c.strip() for c in (items or "").split(",") if c.strip()]
    return {
        "accession": accession,
        "form": form,
        "filingDate": filing_date,
        "reportDate": report_date or None,
        "items": codes,
        "itemLabels": [EVENT_ITEM_LABELS.get(c, c) for c in codes],
        "url": url,
    }


def recent_events(conn: sqlite3.Connection, ticker: str, *, limit: int = 8,
                  force: bool = False) -> list[dict]:
    """The most recent annual (10-K) and quarterly (10-Q) filing for one ticker,
    newest first, from the cached submissions JSON, mirrored into ``edgar_events``
    so repeat loads and offline runs stay instant. Foreign filers fall back to the
    20-F/40-F annual report. Empty list for non-EDGAR tickers. ``limit`` bounds the
    mirror fallback scan only; the returned list holds at most one filing per bucket."""
    _ensure_events_table(conn)
    cik = cik_for_ticker(conn, ticker)
    if cik is None:
        return []

    data = _fetch(_SUBMISSIONS_URL.format(cik=cik), f"sec_submissions_{cik}.json",
                  max_age_days=7.0, force=force)
    events: list[dict] = []
    if data:
        try:
            recent = json.loads(data)["filings"]["recent"]
            forms = recent["form"]
            collected: list[dict] = []
            for i, form in enumerate(forms):
                if form not in _EVENT_FORMS:
                    continue
                collected.append(_event_dict(
                    cik, recent["accessionNumber"][i], form,
                    recent["filingDate"][i] or "", recent["reportDate"][i] or "",
                    recent.get("items", [""] * len(forms))[i] or "",
                    recent.get("primaryDocument", [""] * len(forms))[i] or "",
                ))
                # Filings are newest-first, so a modest scan already contains the
                # latest annual and quarterly report.
                if len(collected) >= 40:
                    break
            events = _latest_per_bucket(collected)
        except (json.JSONDecodeError, KeyError, TypeError, IndexError):
            events = []

    if events:
        conn.executemany(
            "INSERT OR REPLACE INTO edgar_events (cik, accession, form, filing_date,"
            " report_date, items, primary_doc, updated)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            [(cik, e["accession"], e["form"], e["filingDate"], e["reportDate"] or "",
              ",".join(e["items"]), (e["url"] or "").rsplit("/", 1)[-1]) for e in events],
        )
        conn.commit()
        return events

    # Network/parse failure: serve the latest annual/quarterly from the mirror.
    # Old 8-K/6-K rows may linger from before the switch; _latest_per_bucket skips
    # them because they belong to no annual or quarterly bucket.
    rows = conn.execute(
        "SELECT accession, form, filing_date, report_date, items, primary_doc"
        " FROM edgar_events WHERE cik = ? ORDER BY filing_date DESC LIMIT ?",
        (cik, max(limit, 20)),
    ).fetchall()
    mirror = [_event_dict(cik, r[0], r[1], r[2], r[3], r[4], r[5]) for r in rows]
    return _latest_per_bucket(mirror)


# ── accession -> XBRL instance document ──────────────────────────────────────

def _instance_url(cik: str, accession: str) -> str | None:
    """Locate the extracted XBRL instance (*_htm.xml) in the filing directory."""
    cik_int = str(int(cik))
    nodash = accession.replace("-", "")
    data = _fetch(
        _FILING_INDEX_URL.format(cik_int=cik_int, accession_nodash=nodash),
        f"sec_index_{nodash}.json", max_age_days=36500.0,  # filings are immutable
    )
    if not data:
        return None
    try:
        items = json.loads(data)["directory"]["item"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return None
    names = [it.get("name", "") for it in items]
    candidates = [n for n in names if n.endswith("_htm.xml")]
    if not candidates:
        # Older filings ship a plain .xml instance named after the report.
        candidates = [n for n in names
                      if n.endswith(".xml") and not n.endswith(("_cal.xml", "_def.xml",
                                                                "_lab.xml", "_pre.xml"))
                      and "FilingSummary" not in n]
    if not candidates:
        return None
    return _FILING_FILE_URL.format(cik_int=cik_int, accession_nodash=nodash,
                                   name=candidates[0])


def fetch_instance(cik: str, accession: str) -> bytes | None:
    url = _instance_url(cik, accession)
    if url is None:
        return None
    nodash = accession.replace("-", "")
    return _fetch(url, f"sec_instance_{nodash}.xml", max_age_days=36500.0)


# ── XBRL instance parsing ─────────────────────────────────────────────────────

def _local(tag: str) -> str:
    """Strip the namespace from an ElementTree tag or QName-ish attribute."""
    if "}" in tag:
        tag = tag.rsplit("}", 1)[1]
    if ":" in tag:
        tag = tag.rsplit(":", 1)[1]
    return tag


def _de_camel(member: str) -> str:
    """'IntelligentEdgeMember' -> 'Intelligent Edge'; keeps acronym runs intact."""
    name = _local(member)
    for suffix in ("SegmentMember", "Member"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break
    name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name)
    name = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", name)
    return name.strip() or _local(member)


@dataclass(frozen=True)
class ParsedSegments:
    axis: str                      # 'business' | 'product'
    segments: dict[str, float]
    consolidated: float | None
    unit: str | None
    concept: str


def parse_segment_revenue(xml_bytes: bytes, period_end: str) -> ParsedSegments | None:
    """Extract per-segment FY revenue from an XBRL instance document.

    Segment fact = FY-length duration context ending on ``period_end`` whose
    dimensions contain the business-segments axis (fallback: product axis),
    optionally the operating-segments consolidation member, and nothing else.
    Consolidated = same concept, same period, no dimensions at all.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return None

    # Pass 1 — contexts: id -> (is_fy_period, dims {axis_local: member_local}).
    contexts: dict[str, dict[str, str]] = {}
    fy_contexts: set[str] = set()
    for elem in root:
        if _local(elem.tag) != "context":
            continue
        ctx_id = elem.get("id")
        if not ctx_id:
            continue
        start = end = None
        dims: dict[str, str] = {}
        for child in elem.iter():
            local = _local(child.tag)
            if local == "startDate":
                start = (child.text or "").strip()
            elif local == "endDate":
                end = (child.text or "").strip()
            elif local == "explicitMember":
                axis = child.get("dimension", "")
                dims[_local(axis)] = _local((child.text or "").strip())
        if not (start and end and end == period_end):
            continue
        try:
            days = (_dt.date.fromisoformat(end) - _dt.date.fromisoformat(start)).days
        except ValueError:
            continue
        if _FY_MIN_DAYS <= days <= _FY_MAX_DAYS:
            fy_contexts.add(ctx_id)
            contexts[ctx_id] = dims

    if not fy_contexts:
        return None

    # Pass 2 — revenue facts by concept, bucketed into segment/consolidated.
    facts: dict[str, list[tuple[str, float, str | None]]] = {c: [] for c in _REVENUE_CONCEPTS}
    for elem in root:
        concept = _local(elem.tag)
        if concept not in facts:
            continue
        ctx = elem.get("contextRef")
        if ctx not in fy_contexts:
            continue
        try:
            value = float((elem.text or "").strip())
        except ValueError:
            continue
        facts[concept].append((ctx, value, elem.get("unitRef")))

    def _extract(axis_local: str) -> ParsedSegments | None:
        for concept in _REVENUE_CONCEPTS:
            segments: dict[str, float] = {}
            consolidated: float | None = None
            unit: str | None = None
            for ctx, value, unit_ref in facts[concept]:
                dims = contexts[ctx]
                if not dims:
                    # Dimensionless FY fact = the consolidated total.
                    if consolidated is None or value > consolidated:
                        consolidated = value
                    continue
                extra = {a: m for a, m in dims.items()
                         if a not in (axis_local, _CONSOLIDATION_AXIS)}
                if extra:
                    continue  # geography / elimination / customer axes etc.
                if _CONSOLIDATION_AXIS in dims and dims[_CONSOLIDATION_AXIS] != _OPERATING_MEMBER:
                    continue  # intersegment eliminations, reconciling items
                member = dims.get(axis_local)
                if not member:
                    continue
                label = _de_camel(member)
                # A member can appear in multiple equivalent contexts; keep one.
                if label not in segments or value > segments[label]:
                    segments[label] = value
                    unit = unit or unit_ref
            if len(segments) >= 2:
                return ParsedSegments(
                    axis="business" if axis_local == _BUSINESS_AXIS else "product",
                    segments=segments, consolidated=consolidated,
                    unit=unit, concept=concept,
                )
        return None

    return _extract(_BUSINESS_AXIS) or _extract(_PRODUCT_AXIS)


# ── full income statement + operating-lease facts (Damodaran Ch.9) ────────────
# Dimensionless FY-duration (flow) and instant (stock) us-gaap facts, used to show
# the user how reported earnings were built and to source the Ch.9-faithful debt
# value of OPERATING leases (the OperatingLeaseLiability tag is the discounted PV
# of future lease payments — Damodaran's "debt value of leases" — and is NOT part
# of yfinance's Total Debt).

# us-gaap local name -> output key. Order within a value group encodes priority.
_INCOME_CONCEPTS: tuple[tuple[str, str], ...] = (
    ("RevenueFromContractWithCustomerExcludingAssessedTax", "revenue"),
    ("RevenueFromContractWithCustomerIncludingAssessedTax", "revenue"),
    ("Revenues", "revenue"),
    ("SalesRevenueNet", "revenue"),
    ("CostOfGoodsAndServicesSold", "costOfRevenue"),
    ("CostOfRevenue", "costOfRevenue"),
    ("GrossProfit", "grossProfit"),
    ("ResearchAndDevelopmentExpense", "researchAndDevelopment"),
    ("SellingGeneralAndAdministrativeExpense", "sellingGeneralAdministrative"),
    ("OperatingExpenses", "operatingExpenses"),
    ("OperatingIncomeLoss", "operatingIncome"),
    ("InterestExpenseNonoperating", "interestExpense"),
    ("InterestExpense", "interestExpense"),
    ("IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "pretaxIncome"),
    ("IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments", "pretaxIncome"),
    ("IncomeTaxExpenseBenefit", "incomeTaxExpense"),
    ("NetIncomeLoss", "netIncome"),
)
_LEASE_CONCEPTS: tuple[tuple[str, str], ...] = (
    ("OperatingLeaseLiability", "operatingLeaseLiability"),
    ("OperatingLeaseLiabilityCurrent", "operatingLeaseLiabilityCurrent"),
    ("OperatingLeaseLiabilityNoncurrent", "operatingLeaseLiabilityNoncurrent"),
    ("OperatingLeaseCost", "operatingLeaseCost"),
    ("LesseeOperatingLeaseLiabilityPaymentsDue", "leasePaymentsUndiscounted"),
    ("FinanceLeaseLiability", "financeLeaseLiability"),
)


@dataclass(frozen=True)
class FinancialFacts:
    period_end: str
    fiscal_year: int | None
    income: dict[str, float]      # revenue, costOfRevenue, operatingIncome, netIncome, …
    leases: dict[str, float]      # operatingLeaseLiability, operatingLeaseCost, …


def _document_period_end(root: ET.Element) -> str | None:
    for elem in root.iter():
        if _local(elem.tag) == "DocumentPeriodEndDate":
            return (elem.text or "").strip() or None
    return None


def _eligible_dimensionless_contexts(root: ET.Element, period_end: str) -> set[str]:
    """Context ids that are dimensionless AND either an FY-duration ending on
    ``period_end`` (income-statement flows) or an instant at ``period_end``
    (balance-sheet stocks)."""
    out: set[str] = set()
    for elem in root:
        if _local(elem.tag) != "context":
            continue
        cid = elem.get("id")
        if not cid:
            continue
        if any(_local(c.tag) == "explicitMember" for c in elem.iter()):
            continue  # segment / dimensional context — not the consolidated fact
        start = end = instant = None
        for child in elem.iter():
            local = _local(child.tag)
            if local == "startDate":
                start = (child.text or "").strip()
            elif local == "endDate":
                end = (child.text or "").strip()
            elif local == "instant":
                instant = (child.text or "").strip()
        if instant == period_end:
            out.add(cid)
        elif start and end == period_end:
            try:
                days = (_dt.date.fromisoformat(end) - _dt.date.fromisoformat(start)).days
            except ValueError:
                continue
            if _FY_MIN_DAYS <= days <= _FY_MAX_DAYS:
                out.add(cid)
    return out


def parse_financial_facts(xml_bytes: bytes, period_end: str | None = None) -> FinancialFacts | None:
    """Extract the consolidated income-statement lines and operating-lease facts
    from an XBRL instance (dimensionless facts at the reporting period)."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return None
    period_end = period_end or _document_period_end(root)
    if not period_end:
        return None
    eligible = _eligible_dimensionless_contexts(root, period_end)
    if not eligible:
        return None

    raw: dict[str, float] = {}
    for elem in root:
        concept = _local(elem.tag)
        if elem.get("contextRef") not in eligible:
            continue
        if concept in raw:
            continue
        try:
            raw[concept] = float((elem.text or "").strip())
        except (ValueError, TypeError):
            continue

    def _collect(mapping: tuple[tuple[str, str], ...]) -> dict[str, float]:
        out: dict[str, float] = {}
        for concept, key in mapping:
            if key not in out and concept in raw:
                out[key] = raw[concept]
        return out

    income = _collect(_INCOME_CONCEPTS)
    leases = _collect(_LEASE_CONCEPTS)
    if not income and not leases:
        return None
    try:
        fy: int | None = int(period_end[:4])
    except (ValueError, TypeError):
        fy = None
    return FinancialFacts(period_end=period_end, fiscal_year=fy, income=income, leases=leases)


def operating_lease_pv(facts: FinancialFacts | None) -> float | None:
    """The Ch.9-faithful debt value of operating leases: the discounted operating
    lease liability (or current + non-current parts). None when unavailable."""
    if facts is None:
        return None
    lz = facts.leases
    if lz.get("operatingLeaseLiability") is not None:
        return lz["operatingLeaseLiability"]
    cur = lz.get("operatingLeaseLiabilityCurrent")
    noncur = lz.get("operatingLeaseLiabilityNoncurrent")
    if cur is not None or noncur is not None:
        return (cur or 0.0) + (noncur or 0.0)
    return None


def fetch_financial_facts(conn: sqlite3.Connection, ticker: str, *, force: bool = False) -> FinancialFacts | None:
    """Newest 10-K consolidated income statement + operating-lease facts for one
    ticker. Best-effort; returns None for foreign filers / missing data."""
    cik = cik_for_ticker(conn, ticker)
    if cik is None:
        return None
    tenk = latest_10k(cik, force=force)
    if tenk is None:
        return None
    instance = fetch_instance(cik, tenk.accession)
    if instance is None:
        return None
    return parse_financial_facts(instance, tenk.period_end)


def _ensure_xbrl_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS xbrl_financials (
               cik TEXT NOT NULL, fy INTEGER NOT NULL, period_end TEXT,
               income_json TEXT, leases_json TEXT, updated TEXT,
               PRIMARY KEY (cik, fy))"""
    )


def get_financial_facts(conn: sqlite3.Connection, ticker: str, *, force: bool = False) -> FinancialFacts | None:
    """DB-cached financial facts: reads the ``xbrl_financials`` table first so
    repeat page loads are instant/offline, fetching from SEC only on a miss (or
    ``force``). Any failure returns None — the caller then falls back to the
    on-balance-sheet lease figure."""
    _ensure_xbrl_table(conn)
    cik = cik_for_ticker(conn, ticker)
    if cik is None:
        return None
    if not force:
        row = conn.execute(
            "SELECT period_end, fy, income_json, leases_json FROM xbrl_financials "
            "WHERE cik = ? ORDER BY fy DESC LIMIT 1", (cik,),
        ).fetchone()
        if row is not None:
            # Freshness gate (mirrors ingest_ticker): serve the cached row only
            # when it is not behind a newer 10-K; otherwise fall through to fetch.
            tenk = latest_10k(cik)
            if tenk is None or tenk.fiscal_year <= row[1]:
                return FinancialFacts(
                    period_end=row[0], fiscal_year=row[1],
                    income=json.loads(row[2] or "{}"), leases=json.loads(row[3] or "{}"),
                )
    facts = fetch_financial_facts(conn, ticker, force=force)
    if facts is None:
        return None
    conn.execute(
        "INSERT OR REPLACE INTO xbrl_financials (cik, fy, period_end, income_json, "
        "leases_json, updated) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        (cik, facts.fiscal_year or 0, facts.period_end,
         json.dumps(facts.income), json.dumps(facts.leases)),
    )
    conn.commit()
    return facts


# ── top-level per-ticker ingestion ────────────────────────────────────────────

def ingest_ticker(conn: sqlite3.Connection, ticker: str, *, force: bool = False) -> str:
    """Fetch + parse + store the newest 10-K's segment revenue for one ticker.
    Returns a status string for logging/stats."""
    cik = cik_for_ticker(conn, ticker)
    if cik is None:
        return "no_cik"
    tenk = latest_10k(cik, force=force)
    if tenk is None:
        return "no_10k"
    if not force and segment_store.stored_fy(conn, cik) == tenk.fiscal_year:
        return "current"
    instance = fetch_instance(cik, tenk.accession)
    if instance is None:
        return "no_instance"
    parsed = parse_segment_revenue(instance, tenk.period_end)
    if parsed is None:
        return "no_segments"
    segment_store.upsert_segments(
        conn, cik=cik, fy=tenk.fiscal_year, axis=parsed.axis,
        segments=parsed.segments, consolidated_revenue=parsed.consolidated,
        accession=tenk.accession, unit=parsed.unit,
    )
    return f"stored_{parsed.axis}_{len(parsed.segments)}"


def warm_universe(conn: sqlite3.Connection, *, tickers: list[str] | None = None,
                  force: bool = False) -> dict[str, int]:
    """Ingest segment data for many tickers. Defaults to every ticker in the
    tickers table. Per-ticker failures are counted, never raised."""
    if tickers is None:
        rows = conn.execute("SELECT ticker FROM tickers ORDER BY ticker").fetchall()
        tickers = [r[0] for r in rows]
    stats: dict[str, int] = {}
    for t in tickers:
        try:
            status = ingest_ticker(conn, t, force=force)
        except Exception:  # noqa: BLE001 — one bad filing must not stop the sweep
            status = "error"
        key = status.split("_")[0] if status.startswith("stored") else status
        stats[key] = stats.get(key, 0) + 1
    return stats
