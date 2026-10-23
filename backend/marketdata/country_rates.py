"""Location-specific discount-rate inputs (Damodaran, "Estimating discount
rates", dcfrates.pdf):

  * the RISK-FREE RATE follows the CURRENCY of the cash flows (p.23: "The
    currency in which the cash flows are estimated should also be the currency
    in which the discount rate is estimated"), scaled from the US dollar rate
    by the inflation differential (p.42):
        rf_local = (1 + rf_USD) x (1 + inflation_local) / (1 + inflation_US) - 1
  * the EQUITY RISK PREMIUM follows the COUNTRY (p.55/64): mature-market ERP
    plus the country risk premium, entering the cost of equity as
    beta x (ERP + CRP).

Data: country_rates.json, built by remediation/country_rates/build_country_rates.py
from Damodaran's ctryprem file (CRP) and the IMF WEO (expected inflation).

ponytail: the country is the company's domicile (stated country, else listing
suffix, else reporting currency). Damodaran prefers a revenue-weighted CRP;
upgrade with segment_revenue geography when it is reliable enough.
"""
from __future__ import annotations

import json
import os
import unicodedata
from functools import lru_cache
from typing import Optional

_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "country_rates.json")
INFLATION_YEARS = 5           # average of the next five projection years
INFLATION_FLOOR = -0.01       # deflation projections are floored, not trusted

# yfinance / common spellings -> Damodaran spellings.
_COUNTRY_ALIASES = {
    "South Korea": "Korea", "Korea, Republic of": "Korea", "Macau": "Macao",
    "Czechia": "Czech Republic", "Türkiye": "Turkey", "Turkiye": "Turkey",
    "North Macedonia": "Macedonia", "Eswatini": "Swaziland", "Curaçao": "Curacao",
    "Jersey": "Jersey (States of)", "Guernsey": "Guernsey (States of)",
    "Bosnia & Herzegovina": "Bosnia and Herzegovina",
    "Trinidad & Tobago": "Trinidad and Tobago", "UAE": "United Arab Emirates",
    "Russian Federation": "Russia", "Viet Nam": "Vietnam",
}
# Places missing from the file: the country whose risk they carry.
_COUNTRY_PARENT = {"Puerto Rico": "United States", "Gibraltar": "United Kingdom",
                   "Monaco": "France", "British Virgin Islands": "United Kingdom"}

# Listing suffix -> country (the DB's stated country is empty for most rows).
_SUFFIX_COUNTRY = {
    "NS": "India", "BO": "India", "T": "Japan", "KS": "Korea", "KQ": "Korea",
    "SS": "China", "SZ": "China", "BJ": "China", "HK": "Hong Kong", "TW": "Taiwan",
    "TWO": "Taiwan", "L": "United Kingdom", "IL": "United Kingdom", "DE": "Germany",
    "F": "Germany", "PA": "France", "AS": "Netherlands", "BR": "Belgium",
    "MI": "Italy", "MC": "Spain", "LS": "Portugal", "SW": "Switzerland",
    "ST": "Sweden", "OL": "Norway", "CO": "Denmark", "HE": "Finland", "VI": "Austria",
    "IR": "Ireland", "AT": "Greece", "WA": "Poland", "PR": "Czech Republic",
    "BD": "Hungary", "IS": "Turkey", "TA": "Israel", "SR": "Saudi Arabia",
    "QA": "Qatar", "AE": "United Arab Emirates", "JO": "South Africa",
    "AX": "Australia", "NZ": "New Zealand", "TO": "Canada", "V": "Canada",
    "CN": "Canada", "NE": "Canada", "SA": "Brazil", "MX": "Mexico", "SN": "Chile",
    "BA": "Argentina", "CL": "Colombia", "LM": "Peru", "SI": "Singapore",
    "KL": "Malaysia", "BK": "Thailand", "JK": "Indonesia", "PS": "Philippines",
    "VN": "Vietnam", "KW": "Kuwait", "CA": "Egypt",
}

# Reporting currency -> IMF WEO key (the inflation the rate is scaled by).
_CURRENCY_IMF = {
    "USD": "USA", "CNY": "CHN", "JPY": "JPN", "TWD": "TWN", "INR": "IND",
    "AUD": "AUS", "EUR": "EURO", "CAD": "CAN", "HKD": "HKG", "GBP": "GBR",
    "THB": "THA", "KRW": "KOR", "IDR": "IDN", "SEK": "SWE", "CHF": "CHE",
    "BRL": "BRA", "ZAR": "ZAF", "MXN": "MEX", "SGD": "SGP", "MYR": "MYS",
    "NOK": "NOR", "DKK": "DNK", "PLN": "POL", "ILS": "ISR", "TRY": "TUR",
    "NZD": "NZL", "PHP": "PHL", "VND": "VNM", "SAR": "SAU", "AED": "ARE",
    "QAR": "QAT", "KWD": "KWT", "EGP": "EGY", "CLP": "CHL", "COP": "COL",
    "PEN": "PER", "ARS": "ARG", "CZK": "CZE", "HUF": "HUN", "RUB": "RUS",
    "PKR": "PAK", "NGN": "NGA", "KES": "KEN", "LKR": "LKA", "BDT": "BGD",
    "RON": "ROU", "ISK": "ISL",
}
# Currency -> home country, the last resort when nothing else names a country.
_CURRENCY_COUNTRY = {
    "USD": "United States", "CNY": "China", "JPY": "Japan", "TWD": "Taiwan",
    "INR": "India", "AUD": "Australia", "CAD": "Canada", "HKD": "Hong Kong",
    "GBP": "United Kingdom", "THB": "Thailand", "KRW": "Korea", "IDR": "Indonesia",
    "SEK": "Sweden", "CHF": "Switzerland", "BRL": "Brazil", "ZAR": "South Africa",
    "MXN": "Mexico", "SGD": "Singapore", "MYR": "Malaysia", "NOK": "Norway",
    "DKK": "Denmark", "PLN": "Poland", "ILS": "Israel", "TRY": "Turkey",
    "NZD": "New Zealand", "PHP": "Philippines", "VND": "Vietnam",
    "SAR": "Saudi Arabia", "AED": "United Arab Emirates", "EGP": "Egypt",
    "CLP": "Chile", "COP": "Colombia", "PEN": "Peru", "ARS": "Argentina",
    "CZK": "Czech Republic", "HUF": "Hungary", "RUB": "Russia",
    "EUR": "Germany",   # ponytail: euro filers with no listing suffix default to the core
}


@lru_cache(maxsize=1)
def _data() -> dict:
    with open(_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def _norm(name: str) -> str:
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().strip().lower()


@lru_cache(maxsize=1)
def _country_index() -> dict[str, str]:
    return {_norm(k): k for k in _data()["countries"]}


def resolve_country(ticker: Optional[str], stated: Optional[str],
                    currency: Optional[str]) -> tuple[Optional[str], str]:
    """(Damodaran country name, how it was found)."""
    idx = _country_index()
    candidates: list[tuple[Optional[str], str]] = [(stated, "stated country")]
    if ticker and "." in ticker:
        candidates.append((_SUFFIX_COUNTRY.get(ticker.rsplit(".", 1)[1].upper()), "listing suffix"))
    candidates.append((_CURRENCY_COUNTRY.get((currency or "").upper()), "reporting currency"))
    for name, how in candidates:
        if not name:
            continue
        name = _COUNTRY_PARENT.get(name, _COUNTRY_ALIASES.get(name, name))
        hit = idx.get(_norm(name))
        if hit:
            return hit, how
    return None, "unresolved"


def expected_inflation(currency: Optional[str], year: int) -> Optional[float]:
    """Average IMF projection for the next INFLATION_YEARS years, decimal."""
    key = _CURRENCY_IMF.get((currency or "").upper())
    series = _data()["inflation"].get(key or "", {})
    vals = [series[str(y)] for y in range(year + 1, year + 1 + INFLATION_YEARS) if str(y) in series]
    if not vals:
        return None
    return max(INFLATION_FLOOR, sum(vals) / len(vals) / 100.0)


def location_rates(ticker: Optional[str], stated_country: Optional[str],
                   currency: Optional[str], rf_usd: float, erp_us: float,
                   year: int) -> dict:
    """Risk-free rate in the reporting currency and the ERP for the company's
    country. US/USD inputs come back unchanged. Never raises; an unknown
    currency or country leaves that input at the US value and says so."""
    out = {"riskFreeRate": rf_usd, "equityRiskPremium": erp_us, "currency": currency,
           "country": None, "countrySource": "unresolved", "countryRiskPremium": 0.0,
           "expectedInflation": None, "expectedInflationUS": None, "adjusted": False,
           "crpAsOf": None, "notes": []}
    try:
        data = _data()
        out["crpAsOf"] = data.get("crpAsOf")
        cur = (currency or "USD").upper()
        pi_us = expected_inflation("USD", year)
        out["expectedInflationUS"] = pi_us
        if cur != "USD":
            pi = expected_inflation(cur, year)
            if pi is not None and pi_us is not None:
                out["riskFreeRate"] = (1 + rf_usd) * (1 + pi) / (1 + pi_us) - 1
                out["expectedInflation"] = pi
                out["adjusted"] = True
            else:
                out["notes"].append(f"no inflation projection for {cur}; US dollar rate kept")
        else:
            out["expectedInflation"] = pi_us
        country, how = resolve_country(ticker, stated_country, currency)
        out["country"], out["countrySource"] = country, how
        if country and country != "United States":
            # The live US ERP already prices the US's own (Aa1) spread, so
            # the premium added is the country's CRP net of the US one.
            crp = data["countries"][country]["crp"]
            crp_us = data["countries"].get("United States", {}).get("crp", 0.0)
            out["countryRiskPremium"] = crp - crp_us
            out["equityRiskPremium"] = erp_us + crp - crp_us
            out["adjusted"] = True
        elif not country:
            out["notes"].append("country not found; US equity risk premium kept")
    except Exception as exc:  # noqa: BLE001 — location is a refinement, never a blocker
        out["notes"].append(f"location rates unavailable: {exc}")
    return out
