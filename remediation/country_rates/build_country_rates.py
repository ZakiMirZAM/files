"""Build backend/marketdata/country_rates.json: country risk premiums and
expected inflation for location-specific discount rates.

Sources (both free, both refreshed twice a year by their publishers):
  * Damodaran, "Risk Premiums for Other Markets" (ctryprem*.xlsx), sheet
    "ERPs by country": rating-based country risk premium (column F) for 157
    rated countries plus the 21-country frontier block (PRS-based CRP).
    The current file name is read from datacurrent.html; pass --xlsx to use a
    local copy.
  * IMF World Economic Outlook DataMapper, indicator PCPIPCH (average consumer
    price inflation, annual percent, projections to five years out).

    python -P remediation/country_rates/build_country_rates.py [--xlsx PATH] [--imf PATH]
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import os
import re
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), "backend", "marketdata", "country_rates.json")
DATA_PAGE = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html"
BASE = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/"
IMF = "https://www.imf.org/external/datamapper/api/v1/PCPIPCH"
UA = {"User-Agent": "IntrinsicFinEd research (zamzaki08@gmail.com)"}


def _get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def _latest_ctryprem_url() -> str:
    html = _get(DATA_PAGE).decode("latin-1")
    names = re.findall(r"datasets/(ctryprem[A-Za-z0-9]*\.xlsx)", html)
    return BASE + (names[0] if names else "ctryprem.xlsx")


def parse_ctryprem(blob: bytes) -> dict:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(blob), data_only=True, read_only=True)
    rows = list(wb["ERPs by country"].iter_rows(values_only=True))
    asof = rows[1][1]
    countries: dict[str, dict] = {}
    i = 8
    while i < len(rows) and not (rows[i][0] and str(rows[i][0]).startswith("Frontier")):
        r = rows[i]
        if r[0] and isinstance(r[5], (int, float)):
            countries[str(r[0]).strip()] = {"crp": round(float(r[5]), 6), "rating": r[2], "basis": "rating"}
        i += 1
    # Frontier block: its own header row, then Country | PRS | ERP | CRP | Default spread.
    for r in rows[i + 2:]:
        if not r[0] or not isinstance(r[3], (int, float)):
            break
        countries[str(r[0]).strip()] = {"crp": round(float(r[3]), 6), "rating": None, "basis": "PRS score"}
    return {"asof": asof.date().isoformat() if hasattr(asof, "date") else str(asof), "countries": countries}


def parse_imf(blob: bytes) -> dict:
    vals = json.loads(blob)["values"]["PCPIPCH"]
    year = dt.date.today().year
    keep = [str(y) for y in range(year, year + 6)]
    return {k: {y: v[y] for y in keep if y in v} for k, v in vals.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx")
    ap.add_argument("--imf")
    args = ap.parse_args()
    if args.xlsx:
        blob, src = open(args.xlsx, "rb").read(), os.path.basename(args.xlsx)
    else:
        src = _latest_ctryprem_url()
        blob = _get(src)
    crp = parse_ctryprem(blob)
    imf_blob = open(args.imf, "rb").read() if args.imf else _get(IMF)
    out = {
        "builtAt": dt.date.today().isoformat(),
        "crpAsOf": crp["asof"],
        "crpSource": f"Damodaran, Risk Premiums for Other Markets ({src})",
        "inflationSource": "IMF World Economic Outlook, PCPIPCH (average consumer prices, annual %)",
        "countries": crp["countries"],
        "inflation": parse_imf(imf_blob),
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, sort_keys=True, ensure_ascii=False)
    print(f"wrote {OUT}: {len(out['countries'])} countries, {len(out['inflation'])} inflation keys")


if __name__ == "__main__":
    main()
