"""The fixed relationship-map questions. Never built from user input, except
the one company name a reader asks to have checked (``build_suggest_question``),
which is cleaned and inserted with ``replace``.

Only the company name and ticker are filled in, both from the ``tickers``
table, and both go through ``replace`` (not ``str.format``) so a brace in a
company name cannot break the template.
"""

from __future__ import annotations

import re

GROUP_KEYS = ("competitors", "substitutes", "suppliers", "customers", "entrants")
SUGGESTION_GROUPS = frozenset({"substitutes", "entrants"})

# Bumped when the question asks for new fields. Payloads saved before v2
# carry no "promptVersion" and read as 1; a ready map below this version may
# be rebuilt before the 24 hour cooldown (store.decide_build).
PROMPT_VERSION = 2

# The optional per-link fields each group asks for (v2). parse.py keeps a key
# only on links of its own group; every other key is dropped.
GROUP_FIELDS: dict[str, tuple[str, ...]] = {
    "competitors": ("strategy", "reportedAs"),
    "substitutes": ("pricePerformance", "switchingCost", "trend"),
    "suppliers": ("shareOfCosts", "alternatives", "switchingCost",
                  "shareOfSupplierRevenue", "integratesForward"),
    "customers": ("shareOfRevenue", "alternatives", "switchingCost", "makesInHouse"),
    "entrants": ("barrierResource", "modelDifference", "costOfCopying"),
}

# One rule line per group: the map question uses all of them, and the
# suggestion check quotes the one for the group asked about.
GROUP_RULES: dict[str, str] = {
    "competitors": (
        "A company is a competitor only if its product performs similarly, is used on the same "
        "occasions, and is sold in the same geographic market as {name}'s product. Prefer sources "
        "showing customers moving between the two. The same product sold in a different "
        "geographic market goes under entrants, not competitors."),
    "substitutes": "Substitutes meet the same customer need with a different product.",
    "suppliers": ("Suppliers include labor when it is a meaningful input (headcount, "
                  "unionization, scarce skills)."),
    "customers": ("For a customer that is not named in filings, name it \"A customer that is X% "
                  "of revenue\" with the filing as source."),
    "entrants": ("Entrants include companies from nearby industries that could enter by "
                 "acquisition, and suppliers or customers that could integrate forward or "
                 "backward; give the route in."),
}

# One sentence per group naming its v2 fields.
GROUP_FIELD_LINES: dict[str, str] = {
    "competitors": (
        "For each competitor give strategy (3 to 5 plain-word strategic dimensions, for example "
        "brand or price, channel, vertical integration, technology leader or follower) and "
        "reportedAs (\"whole company\" or \"segment X, about Y% of parent revenue\")."),
    "substitutes": ("For each substitute give pricePerformance (its price and performance "
                    "against {name}'s product), switchingCost and trend (whether buyers are "
                    "moving toward it)."),
    "suppliers": ("For each supplier give shareOfCosts (its share of {name}'s costs), "
                  "alternatives, switchingCost, shareOfSupplierRevenue (what share of the "
                  "supplier's revenue {name} is) and integratesForward (whether it could make "
                  "{name}'s product itself)."),
    "customers": ("For each customer give shareOfRevenue (its share of {name}'s revenue), "
                  "alternatives, switchingCost and makesInHouse (whether it makes some of the "
                  "product itself)."),
    "entrants": ("For each entrant give barrierResource (what lets it get past the barriers "
                 "cheaply), modelDifference (how its business model differs) and costOfCopying "
                 "(what {name} would lose by copying it)."),
}

_LINK_BASE = ('"name":str,"ticker":str|null,"product":str,"geography":str|null,'
              '"routeIn":str|null,"note":str|null,"source":{"title":str,"url":str}')


def link_shape(group: str) -> str:
    """The JSON shape of one link of ``group``, with its v2 fields."""
    extra = "".join(f',"{f}":str|null' for f in GROUP_FIELDS[group])
    return "{" + _LINK_BASE + extra + "}"


def _shape() -> str:
    parts = ",".join(f'"{g}":[{{"category":str,"links":[{link_shape(g)}]}}]' for g in GROUP_KEYS)
    return '{"groups":{' + parts + "}}"


QUESTION_TEMPLATE = (
    "Build the relationship map for {name} ({ticker}). Return ONE fenced json block and nothing "
    "that contradicts it.\n"
    "Groups: competitors, substitutes, suppliers, customers, entrants.\n"
    "Rules:\n"
    + "".join(f"- {GROUP_RULES[g]}\n" for g in GROUP_KEYS)
    + "- If a government body is a customer or supplier, or shapes substitutes or entry by "
    "regulation or subsidy, record it inside that group.\n"
    "- Group links into categories, each with up to 4 leading examples. Not every company. At "
    "most 8 categories per group.\n"
    "- Every link needs a source (title and https URL) the reader can open: a filing, company "
    "page, or reputable news. No source, no link.\n"
    + "".join(f"- {GROUP_FIELD_LINES[g]}\n" for g in GROUP_KEYS)
    + "- Each of these fields is a short plain-text phrase from a source, or null when no "
    "source says it.\n"
    "- Write switching cost as what the customer would lose by switching against what it would "
    "gain, not as high or low.\n"
    "- Give a public ticker only when you are sure of it; otherwise null.\n"
    "- Write in plain words. Do not use em dashes.\n"
    "JSON shape:\n" + _shape()
)

SUGGEST_TEMPLATE = (
    "Check whether {suggested} belongs in the {group} group of {name}'s relationship map, using "
    "the same rules as the map: {rule} {fields} Write switching cost as what the customer would "
    "lose by switching against what it would gain, not as high or low. Return ONE fenced json "
    "block: {\"link\": {shape}|null, \"category\": str|null, \"reason\": str}. Give a link only "
    "with a source the reader can open. If it does not belong, link is null and reason says why "
    "in one or two sentences. Write in plain words. Do not use em dashes."
)

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def clean_name(raw: str, max_len: int = 120) -> str:
    """Control characters replaced by spaces, trimmed, capped."""
    return _CONTROL.sub(" ", raw or "").strip()[:max_len].strip()


def build_question(name: str, ticker: str) -> str:
    """The fixed question with the company filled in."""
    company = clean_name(name or ticker) or ticker
    return QUESTION_TEMPLATE.replace("{name}", company).replace("{ticker}", ticker)


def build_suggest_question(suggested: str, group: str, name: str) -> str:
    """The fixed suggestion check. ``suggested`` is untrusted reader input:
    it is cleaned here and inserted LAST, so text it contains (say a literal
    ``{name}``) is never itself replaced."""
    company = clean_name(name)
    q = (SUGGEST_TEMPLATE
         .replace("{rule}", GROUP_RULES[group])
         .replace("{fields}", GROUP_FIELD_LINES[group])
         .replace("{shape}", link_shape(group))
         .replace("{group}", group)
         .replace("{name}", company))
    return q.replace("{suggested}", clean_name(suggested))
