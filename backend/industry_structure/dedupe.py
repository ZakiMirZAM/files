"""Cross-listing de-duplication for a peer-year (finding H2).

One issuer listed on two exchanges files one set of consolidated figures,
so both lines carry the same revenue and would be counted twice in every
share, CR4 and HHI. The collapse rule lives here, apart from the loaders,
because it has its own set of edge cases.

The rule (tightened after the false positives below):

* the two rows must agree on Revenue, Reported Currency and Calendar Year,
  and on Net Income where both report it;
* their EXCHANGE SUFFIXES must differ. Two DIFFERENT listed companies that
  consolidate to the same figures sit on the SAME exchange, typically an
  operating company and its holding company (111770.KS Youngone Corporation
  against 009970.KS Youngone Holdings; 383220.KS F&F against 007700.KS F&F
  Holdings; 161890.KS against 024720.KS Kolmar). A true cross-listing sits
  on two different exchanges (ICK.VI against 601398.SS, AEG against
  AGN.AS). A symbol with no suffix is the US market;
* they must not carry two different non-null ``security_map.cik`` values.
  Two CIKs are two SEC registrants, whatever the figures say.

The functions are duck-typed over ``industry_structure.peers.Peer`` rather
than importing it, so ``peers`` can import this module without a cycle.
"""

from __future__ import annotations

from typing import Any, Optional


def _market_cap_usd(peer: Any) -> Optional[float]:
    mc = peer.ratios.get("Market Cap")
    if mc is None:
        return None
    try:
        return float(mc) * peer.usd_per_unit
    except (TypeError, ValueError):
        return None


def exchange_suffix(ticker: str) -> str:
    """The exchange suffix of a symbol; "" for the US market.

    ``security_map.exchange`` is the authoritative answer but is not carried
    on the peer rows; the suffix after the last dot is the same signal and
    needs no extra join. A US share class uses a dash (BRK-B), so the dot
    never fires on one.
    """
    return ticker.rsplit(".", 1)[1].upper() if "." in ticker else ""


def _looks_us_listed(ticker: str) -> bool:
    """A bare symbol (no exchange suffix) is the SEC-registered line."""
    return exchange_suffix(ticker) == ""


def _dedupe_key(peer: Any) -> Optional[tuple[Any, ...]]:
    rev = peer.ratios.get("Revenue")
    if rev is None:
        return None
    # The industry is part of the key on a SECTOR-wide load: two listings of
    # one issuer always share an industry, so including it stops an exact
    # revenue coincidence between two different industries from collapsing
    # two real firms into one. It is None on an industry-scoped load, where
    # every row already shares the industry.
    return (peer.industry, float(rev), peer.reported_currency, peer.calendar_year)


def _net_income_compatible(a: Any, b: Any) -> bool:
    """Same Net Income, or at least one side does not report it."""
    na = a.ratios.get("Net Income")
    nb = b.ratios.get("Net Income")
    if na is None or nb is None:
        return True
    try:
        return float(na) == float(nb)
    except (TypeError, ValueError):
        return True


def _cik_compatible(a: Any, b: Any) -> bool:
    """False only when both sides name a CIK and the two differ."""
    ca = getattr(a, "cik", None)
    cb = getattr(b, "cik", None)
    if ca is None or cb is None:
        return True
    return str(ca) == str(cb)


def same_issuer(a: Any, b: Any) -> bool:
    """Whether two rows of one key are two listings of one issuer."""
    if exchange_suffix(a.ticker) == exchange_suffix(b.ticker):
        return False
    if not _cik_compatible(a, b):
        return False
    return _net_income_compatible(a, b)


def dedupe_listings(peers: list[Any]) -> tuple[list[Any], int]:
    """Collapse cross-listed lines of one issuer inside an industry-year.

    The surviving line is the one with the larger USD market cap; ties fall
    back to the SEC-registered (suffix-free) symbol, then to the
    alphabetically first ticker, so the choice is deterministic.

    Returns ``(kept_peers, dropped_count)``. Order of the kept peers
    follows the input.
    """
    groups: dict[tuple[Any, ...], list[Any]] = {}
    ungrouped: list[Any] = []
    for p in peers:
        key = _dedupe_key(p)
        if key is None:
            ungrouped.append(p)
            continue
        groups.setdefault(key, []).append(p)

    keep: set[int] = {id(p) for p in ungrouped}
    dropped = 0
    for members in groups.values():
        if len(members) == 1:
            keep.add(id(members[0]))
            continue
        # Partition members into issuer clusters. A row joins a cluster only
        # when it is the same issuer as EVERY member already in it.
        clusters: list[list[Any]] = []
        for p in members:
            for cluster in clusters:
                if all(same_issuer(p, q) for q in cluster):
                    cluster.append(p)
                    break
            else:
                clusters.append([p])
        for cluster in clusters:
            winner = sorted(
                cluster,
                key=lambda p: (
                    -(_market_cap_usd(p) if _market_cap_usd(p) is not None else -1.0),
                    not _looks_us_listed(p.ticker),
                    p.ticker,
                ),
            )[0]
            keep.add(id(winner))
            dropped += len(cluster) - 1

    return ([p for p in peers if id(p) in keep], dropped)
