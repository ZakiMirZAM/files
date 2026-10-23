"""The fixed relationship-map question. Never built from user input.

Only the company name and ticker are filled in, both from the ``tickers``
table, and both go through ``replace`` (not ``str.format``) so a brace in a
company name cannot break the template.
"""

from __future__ import annotations

import re

GROUP_KEYS = ("competitors", "substitutes", "suppliers", "customers", "entrants")
SUGGESTION_GROUPS = frozenset({"substitutes", "entrants"})

QUESTION_TEMPLATE = """Build the relationship map for {name} ({ticker}). Return ONE fenced json block and nothing that contradicts it.
Groups: competitors, substitutes, suppliers, customers, entrants.
Rules:
- A company is a competitor only if its product performs similarly, is used on the same occasions, and is sold in the same geographic market as {name}'s product. Prefer sources showing customers moving between the two.
- The same product sold in a different geographic market goes under entrants, not competitors.
- Substitutes meet the same customer need with a different product.
- Suppliers include labor when it is a meaningful input (headcount, unionization, scarce skills).
- If a government body is a customer or supplier, or shapes substitutes or entry by regulation or subsidy, record it inside that group.
- Entrants include companies from nearby industries that could enter by acquisition, and suppliers or customers that could integrate forward or backward; give the route in.
- Group links into categories, each with up to 4 leading examples. Not every company. At most 8 categories per group.
- Every link needs a source (title and https URL) the reader can open: a filing, company page, or reputable news. No source, no link.
- For a customer that is not named in filings, name it "A customer that is X% of revenue" with the filing as source.
- Give a public ticker only when you are sure of it; otherwise null.
- Write in plain words. Do not use em dashes.
JSON shape (substitutes, suppliers, customers and entrants use the same list shape as competitors):
{"groups":{"competitors":[{"category":str,"links":[{"name":str,"ticker":str|null,"product":str,"geography":str|null,"routeIn":str|null,"note":str|null,"source":{"title":str,"url":str}}]}],"substitutes":[...],"suppliers":[...],"customers":[...],"entrants":[...]}}"""

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def build_question(name: str, ticker: str) -> str:
    """The fixed question with the company filled in."""
    clean_name = _CONTROL.sub(" ", name or ticker).strip()[:120] or ticker
    return QUESTION_TEMPLATE.replace("{name}", clean_name).replace("{ticker}", ticker)
