"""The SQL fragment every group query has to carry, written once.

The warehouse holds BOTH a NULL sector or industry and an empty-string one, and
a query that tests only for NULL lets the blank through as a group of its own:
the sector list grew a nameless eleventh row, and the industry averages grew a
nameless industry that every blank-labelled company was averaged into.

The fragment was typed out at eighteen call sites across ``api.py``,
``industry_averages.py``, ``comparitivestockanalysis.py``,
``connections/bundle.py`` and the two ``industry_structure`` modules, so
dropping the TRIM half at one of them was a one-character mistake nobody would
see in review. ``backend/test_blank_group_guard.py`` asserts that every group
query goes through here.

Dependency free on purpose: the modules that need it sit in three different
packages and one of them is imported by the others.
"""

from __future__ import annotations


def named_group_sql(col: str) -> str:
    """``<col> IS NOT NULL AND TRIM(<col>) <> ''`` for a column expression.

    ``col`` is written exactly as the query spells it, table alias included:
    ``named_group_sql("t.industry")``, ``named_group_sql("sector")``.
    """
    return f"{col} IS NOT NULL AND TRIM({col}) <> ''"
