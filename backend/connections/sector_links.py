"""Sector links: an industry's place in its sector (Rule A item 14).

The shares themselves come straight out of ``sector_pool.industry_shares``;
what lives here is the median operating margin the industry and sector
blocks both report.
"""

from __future__ import annotations

import statistics
from typing import Optional

from connections._helpers import _safe_float
from industry_structure.peers import PeerSet


def _median_operating_margin(peer_set: Optional[PeerSet]) -> Optional[float]:
    """Median operating margin across a peer set."""
    if peer_set is None:
        return None
    margins: list[float] = []
    for p in peer_set.peers:
        rev = _safe_float(p.ratios.get("Revenue"))
        op = _safe_float(p.ratios.get("Operating Income"))
        if rev is not None and rev > 0 and op is not None:
            margins.append(op / rev)
    return round(statistics.median(margins), 4) if margins else None
