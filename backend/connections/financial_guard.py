"""Re-export of the backend-level financial guard, for the connections callers.

The guard moved to ``backend/financial_guard.py`` so the industry-structure
payload can use the same predicate and the same reasons. This module keeps
the old import path working and pins the one choice connections makes:
Real Estate is NOT guarded here, because net debt to EBITDA is computed for
Real Estate everywhere else in the app.
"""

from __future__ import annotations

from typing import Optional

from financial_guard import (  # noqa: F401 — re-exported for the old path
    COMPANY_GUARDED_FIELDS,
    EXPOSURE_GUARDED_FIELDS,
    FINANCIAL_INDUSTRY_KEYWORDS,
    FINANCIAL_SECTORS,
    GROUP_GUARDED_FIELDS,
    NOT_APPLICABLE_REASONS,
    apply_guard,
    not_applicable_map,
)
from financial_guard import is_financial as _is_financial


def is_financial(sector: Optional[str], industry: Optional[str]) -> bool:
    """Whether credit ratios lose their meaning for this sector/industry."""
    return _is_financial(sector, industry, include_real_estate=False)
