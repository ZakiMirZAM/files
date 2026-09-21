"""Leaf helpers shared by the connections package.

``_safe_float`` was written out six times (bundle, episodes, exposures,
leverage, sector_links, splits) with the same body. It lives here once.

It is deliberately NOT ``company_profile.common.safe_float``: that variant
also drops NaN and infinity, which would change what this package emits for
a row carrying a non-finite value, so adopting it here is a behaviour change
rather than a reuse.
"""

from __future__ import annotations

from typing import Any, Optional


def _safe_float(v: Any) -> Optional[float]:
    """``float(v)`` or ``None``."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _nz(v: Optional[float]) -> Optional[float]:
    """Normalize negative zero to zero (finding LOW)."""
    if v is None:
        return None
    return 0.0 if v == 0 else v
