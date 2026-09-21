"""Financial-sector guard for credit and margin figures (finding H7).

Interest coverage, a synthetic rating, the one-point interest stress, net
debt to EBITDA and gross margin are meaningless for banks and insurers: a
bank's interest expense is cost of goods, not a fixed charge, and a bank
has no cost of revenue so its "gross margin" reads 1.0.

This mirrors the shape of ``individualanalysis._FCFF_GUARD_SECTORS`` /
``fcff_applicable``: the figure is returned as ``None`` and the block
carries ``isFinancial: true`` plus a ``notApplicable`` map naming the
reason per field. No replacement bank metric is invented here.

The module sits at backend level, not inside ``connections/``, because the
industry-structure payload needs the same predicate and the same reasons.
``connections/financial_guard.py`` re-exports everything for the callers
that already import from there.

There is ONE predicate, ``is_financial(sector, industry, *,
include_real_estate)``. The keyword is required because the two callers
genuinely differ:

* the connections and structure blocks pass ``False``. Net debt to EBITDA
  is computed for Real Estate everywhere else in the app
  (``individualanalysis`` L4717 applies no sector guard to it), so nulling
  it here would disagree with the rest of the page.
* an FCFF firm model misprices a REIT, so that guard covers Real Estate
  and the ``reit`` keyword as well. ``individualanalysis`` still carries
  its own copy; folding it in is a separate change set.
"""

from __future__ import annotations

from typing import Any, Optional

# Sector whose credit ratios do not carry their usual meaning.
FINANCIAL_SECTORS = frozenset({"Financial Services"})

# Industry keywords, matched case-insensitively.
FINANCIAL_INDUSTRY_KEYWORDS = ("bank", "insurance", "mortgage", "capital markets")

# Only reached when ``include_real_estate=True``.
REAL_ESTATE_SECTORS = frozenset({"Real Estate"})
REAL_ESTATE_INDUSTRY_KEYWORDS = ("reit",)

_COVERAGE_REASON = (
    "Interest expense is a bank's cost of funding, not a fixed charge covered "
    "out of operating income, so interest coverage does not measure the same "
    "thing here."
)
_RATING_REASON = (
    "The synthetic rating is read off an interest-coverage table calibrated on "
    "non-financial firms, so it misreads a bank or insurer."
)
_STRESS_REASON = (
    "A one point rise in borrowing costs passes through a bank's asset side as "
    "well as its liabilities, so the debt times one point figure is not an "
    "upper bound on the earnings hit."
)
_NDE_REASON = (
    "Deposits and other funding sit in debt while EBITDA excludes the interest "
    "those liabilities earn, so net debt to EBITDA has no comparable meaning."
)
_GROSS_MARGIN_REASON = (
    "Banks and insurers report no cost of revenue, so the stored gross margin "
    "is 1.0 by construction rather than a measure of pricing."
)
_COGS_REASON = (
    "Banks and insurers report no cost of revenue, so the cost of goods over "
    "revenue line is empty rather than low."
)
_DEFAULT_SPREAD_REASON = (
    "The spread shown is the model's fallback, because a lender's interest "
    "coverage cannot be read off the table built for non-financial companies."
)

# field name -> reason, for every figure the guard nulls.
NOT_APPLICABLE_REASONS: dict[str, str] = {
    "interestCoverage": _COVERAGE_REASON,
    "medianInterestCoverage": _COVERAGE_REASON,
    "shareCoverageBelow2": _COVERAGE_REASON,
    "syntheticRating": _RATING_REASON,
    # The lender's rating block keeps a NUMBER in ``spread``, because the cost
    # of debt still needs one. It is the model's fallback, not a reading off
    # this bank's coverage, and nothing in the payload said so.
    "defaultSpread": _DEFAULT_SPREAD_REASON,
    "interestPerPoint": _STRESS_REASON,
    "interestPerPointUsd": _STRESS_REASON,
    "interestPerPointPctOfOperatingIncome": _STRESS_REASON,
    "netDebtToEbitda": _NDE_REASON,
    "medianNetDebtToEbitda": _NDE_REASON,
    "grossMargin": _GROSS_MARGIN_REASON,
    "grossMarginChange2020to2022": _GROSS_MARGIN_REASON,
    # Industry-structure payload (the same families, under their own keys).
    "grossMarginMedian": _GROSS_MARGIN_REASON,
    "grossMarginIqr": _GROSS_MARGIN_REASON,
    "grossMarginSpread": _GROSS_MARGIN_REASON,
    "leaderCogsToRevenue5y": _COGS_REASON,
    # company_profile payloads (cost structure + generic strategy). Same two
    # families again, under the keys those blocks emit. A bank's stored "Cost
    # Of Revenue" is not empty, it is the vendor folding funding cost into the
    # line, so these read as a 40 percent cost ratio rather than as nothing.
    "cogsToRevenue": _COGS_REASON,
    "costOfGoodsPlusSgaToRevenue": _COGS_REASON,
    "grossMarginGap": _GROSS_MARGIN_REASON,
    "companyGrossMargin": _GROSS_MARGIN_REASON,
    "industryMedianGrossMargin": _GROSS_MARGIN_REASON,
}

# The company-block fields the guard nulls.
COMPANY_GUARDED_FIELDS = (
    "interestCoverage",
    "syntheticRating",
    "interestPerPoint",
    "interestPerPointUsd",
    "interestPerPointPctOfOperatingIncome",
)

# The industry/sector-block fields the guard nulls.
GROUP_GUARDED_FIELDS = (
    "medianInterestCoverage",
    "medianNetDebtToEbitda",
    "shareCoverageBelow2",
)

# The exposure-row fields the guard nulls.
EXPOSURE_GUARDED_FIELDS = (
    "interestCoverage",
    "netDebtToEbitda",
    "interestPerPointPctOfOperatingIncome",
    "grossMarginChange2020to2022",
)

# company_profile/cost_structure.py — the one line a lender does not report.
# The other four (SG&A, R&D, D&A, operating margin) are real for a bank and
# stay, so the table keeps its shape and only the cost-of-revenue row goes
# blank.
COST_STRUCTURE_GUARDED_FIELDS = (
    "cogsToRevenue",
)

# company_profile/generic_strategy.py — both blocks built on cost of revenue.
GENERIC_STRATEGY_GUARDED_FIELDS = (
    "costOfGoodsPlusSgaToRevenue",
    "grossMarginGap",
)

# individualanalysis' credit block, bank track. The synthetic rating is read
# off an interest-coverage table calibrated on non-financials, and the coverage
# that feeds it is a bank's cost of funding, so both go.
CREDIT_BANK_GUARDED_FIELDS = (
    "syntheticRating",
    "interestCoverage",
    # Not nulled: the rating block keeps a numeric ``spread`` because the cost
    # of debt needs one. This marks it as the model's fallback rather than a
    # figure read off the bank, which the payload used to leave the reader (and
    # the cross-stage AI context) to infer.
    "defaultSpread",
)


def is_financial(
    sector: Optional[str],
    industry: Optional[str],
    *,
    include_real_estate: bool,
) -> bool:
    """Whether credit ratios lose their meaning for this sector/industry.

    ``include_real_estate`` decides whether Real Estate and the ``reit``
    keyword count; see the module docstring for why the two callers differ.
    """
    sectors = FINANCIAL_SECTORS
    keywords = FINANCIAL_INDUSTRY_KEYWORDS
    if include_real_estate:
        sectors = sectors | REAL_ESTATE_SECTORS
        keywords = keywords + REAL_ESTATE_INDUSTRY_KEYWORDS
    if sector and sector.strip() in sectors:
        return True
    ind = (industry or "").lower()
    return any(k in ind for k in keywords)


def not_applicable_map(fields: tuple[str, ...]) -> dict[str, str]:
    """``{field: reason}`` for the given guarded fields."""
    return {f: NOT_APPLICABLE_REASONS[f] for f in fields if f in NOT_APPLICABLE_REASONS}


def apply_guard(
    block: dict,
    fields: tuple[str, ...],
    *,
    financial: bool,
    year_maps: tuple[str, ...] = (),
) -> dict:
    """Null ``fields`` in ``block`` and attach the guard markers.

    ``year_maps`` names fields that hold a ``{year: value}`` dict rather than
    a scalar. Their values are nulled and the year keys kept, so the payload
    shape never changes (finding M9).

    Returns the same dict (mutated) so it can be used inline.
    """
    block["isFinancial"] = bool(financial)
    if not financial:
        block.setdefault("notApplicable", {})
        return block
    present = tuple(f for f in fields if f in block)
    for f in present:
        block[f] = None
    present_maps = tuple(f for f in year_maps if f in block)
    for f in present_maps:
        current: Any = block[f] or {}
        block[f] = {k: None for k in current}
    block["notApplicable"] = not_applicable_map(present + present_maps)
    return block
