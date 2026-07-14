"""READ-ONLY decomposition of the sector Value Score.

Replays group_scoring.score_groups on the live matrix and prints, per sector,
exactly what each metric contributed. Changes nothing.

Usage:
    python remediation/explain_score.py [sector ...]
"""

import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import group_scoring as gs  # noqa: E402
from comparitivestockanalysis import LEVEL_BLEND  # noqa: E402

BASE = "http://localhost:8000"


def fetch() -> dict:
    with urllib.request.urlopen(f"{BASE}/api/sector-metrics", timeout=300) as r:
        return json.load(r)


def main() -> None:
    payload = fetch()
    data = payload["data"]
    inputs = {g: gs.scoring_inputs(col) for g, col in data.items()}
    profiles = {g: gs.weights_for(g) for g in data}
    all_metrics = sorted({k for p in profiles.values() for k in p})

    peers = {
        m: gs._peer_percentiles(
            {g: inputs[g].get(m) for g in data}, m in gs._LOWER_IS_BETTER)
        for m in all_metrics
    }

    ranked = sorted(data.items(),
                    key=lambda kv: -(kv[1].get("valueScore") or 0))
    print(f"{'SECTOR':<24}{'SCORE':>7}{'RANK':>6}")
    for g, col in ranked:
        print(f"{g:<24}{col.get('valueScore'):>7}{col.get('scoreRank'):>6}")

    targets = sys.argv[1:] or [ranked[0][0], ranked[-1][0]]
    for g in targets:
        if g not in data:
            print(f"\n(no sector '{g}')")
            continue
        prof, inp = profiles[g], inputs[g]
        print("\n" + "=" * 78)
        print(f"  {g}   score {data[g].get('valueScore')}   "
              f"profile: {'sector-specific' if g in gs.GROUP_WEIGHTS_BY_SECTOR else 'default'}")
        print("=" * 78)
        print(f"  {'metric':<20}{'value':>9}{'level':>7}{'peer':>7}"
              f"{'blend':>7}{'wt':>5}{'contrib':>9}{'share':>8}")
        total_w = 0.0
        contribs: list[tuple[str, float, float]] = []
        for m in sorted(prof, key=lambda k: -prof[k]):
            v = inp.get(m)
            w = prof[m]
            if v is None:
                print(f"  {m:<20}{'n/a':>9}{'':>7}{'':>7}{'':>7}{w:>5}"
                      f"{'excluded':>9}")
                continue
            lvl = gs._level_score(m, v)
            pr = peers[m].get(g)
            blend = (LEVEL_BLEND * lvl + (1 - LEVEL_BLEND) * (pr if pr is not None else lvl)
                     if lvl is not None else pr)
            contribs.append((m, blend * w, w))
            total_w += w
            print(f"  {m:<20}{v:>9.2f}{lvl:>7.1f}"
                  f"{(pr if pr is not None else float('nan')):>7.1f}"
                  f"{blend:>7.1f}{w:>5.1f}{blend * w:>9.1f}", end="")
            print()
        composite = sum(c for _, c, _ in contribs) / total_w if total_w else 0.0
        print("  " + "-" * 74)
        print(f"  weighted composite = {composite:.2f}")
        print()
        print("  where the score comes from (share of the weighted total):")
        tot = sum(c for _, c, _ in contribs)
        for m, c, w in sorted(contribs, key=lambda x: -x[1]):
            bar = "#" * int(round(c / tot * 50))
            print(f"    {m:<20}{c / tot * 100:>5.1f}%  {bar}")

    # How much of the DEFAULT profile is valuation vs business quality?
    print("\n" + "=" * 78)
    print("  WHAT THE DEFAULT PROFILE ACTUALLY MEASURES")
    print("=" * 78)
    dw = gs.DEFAULT_GROUP_WEIGHTS
    total = sum(dw.values())
    buckets = {
        "economic profit / returns": ["roicWaccSpread", "evaMargin",
                                      "excessReturnEquity"],
        "margins & cash quality": ["dupontEbitMargin", "fcfToNetIncome"],
        "cost of capital": ["wacc"],
        "growth": ["revenueGrowth"],
        "balance-sheet risk": ["netDebtToOcf"],
        "VALUATION (price paid)": ["pbGap"],
    }
    for name, keys in buckets.items():
        w = sum(dw.get(k, 0.0) for k in keys)
        print(f"  {name:<28}{w:>5.1f} / {total:.1f}  = {w / total * 100:>5.1f}%")


if __name__ == "__main__":
    main()
