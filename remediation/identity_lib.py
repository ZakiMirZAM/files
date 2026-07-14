"""Pure identity/symbol helpers for the Phase 2 security remediation.

Stdlib only, no DB access. Every function is deterministic so it can be unit
tested in isolation (see backend/test_identity_lib.py).

Symbol conventions in this project:
  - The DB (`financials.Ticker`, `tickers.ticker`) and the SEC universe files
    use the dash form for US share classes and preferreds: BRK-B, GS-PA.
  - yfinance also uses the dash form for US class shares (BRK-B) but keeps the
    international exchange suffix on a dot: 7203.T, VOD.L, RELIANCE.NS.
  - FMP (the original fundamentals vendor) uses the dash form as stored.
"""

import re

# International exchange suffixes yfinance keeps on a dot (never a share class).
# Kept uppercase; membership test upper-cases the candidate first.
KNOWN_EXCHANGE_SUFFIXES: frozenset[str] = frozenset({
    "T", "L", "NS", "BO", "HK", "SS", "SZ", "TO", "V", "CN", "NE", "AX",
    "PA", "DE", "F", "BE", "MU", "SG", "HM", "DU", "MI", "MC", "AS", "BR",
    "LS", "SW", "VX", "ST", "OL", "HE", "CO", "IC", "VI", "WA", "PR", "BD",
    "AT", "SA", "MX", "KS", "KQ", "TW", "TWO", "JK", "KL", "BK", "SI", "NZ",
    "TA", "SR", "QA", "IS", "JO", "RG", "VS", "TL", "ME", "IR", "CR",
})

_PREFERRED_RE = re.compile(r"^[A-Z0-9]+-P[A-Z]?$")
_WARRANT_RE = re.compile(r"-W[TS]$")
_UNIT_RE = re.compile(r"-UN?$")


def classify_kind(symbol: str) -> str:
    """Classify a ticker into 'common' | 'preferred' | 'warrant' | 'unit'.

    Rules (in precedence order):
      - '-WT' / '-WS' suffix       -> warrant
      - '-U' / '-UN' suffix        -> unit
      - '^BASE-P[A-Z]?$' pattern   -> preferred (GS-PA, WFC-P, BAC-PP)
      - anything else (incl. BASE-A / BASE-B share classes) -> common
    """
    s = symbol.upper().strip()
    if _WARRANT_RE.search(s):
        return "warrant"
    if _UNIT_RE.search(s):
        return "unit"
    if _PREFERRED_RE.match(s):
        return "preferred"
    return "common"


def norm_dot_dash(symbol: str) -> str:
    """Upper-case a symbol and convert every dot to a dash: 'brk.b' -> 'BRK-B'."""
    return symbol.upper().strip().replace(".", "-")


def yf_symbol_guess(symbol: str, exchange: str | None = None) -> str:
    """Best-effort yfinance symbol.

    A dot followed by a known 1-3 char exchange suffix is an international
    listing and is preserved unchanged ('7203.T', 'VOD.L'). A single-letter
    class dot converts to a dash ('BRK.B' -> 'BRK-B'). Anything already in dash
    form is upper-cased and returned as-is. `exchange` is accepted for future
    disambiguation but the suffix set is authoritative today.
    """
    s = symbol.upper().strip()
    if "." not in s:
        return s
    head, _, suffix = s.rpartition(".")
    if suffix in KNOWN_EXCHANGE_SUFFIXES:
        return s
    if len(suffix) == 1:  # single-letter US share class -> dash
        return f"{head}-{suffix}"
    return s


def pad_cik(cik: int | str | None) -> str | None:
    """Zero-pad a CIK to the 10-digit SEC form. None stays None.

    Accepts an int (886982), a bare string ('886982'), or an already-padded
    string ('0000886982'). Blank / non-numeric input returns None.
    """
    if cik is None:
        return None
    s = str(cik).strip()
    if not s.isdigit():
        return None
    return s.zfill(10)
