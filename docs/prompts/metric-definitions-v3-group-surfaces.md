# Master Prompt v3 — Comparative / Industry / Sector Metric Definitions

This extends v2 (`metric-definitions-master-prompt-v2.md`) for three new analysis
surfaces. v2's nine-part template and ALL its style rules still apply unchanged (no em
dashes, no analogies, no ambiguous pronouns, no excessive commas, no imported
credit-rating numbers, beginner vocabulary, definition before examples, examples in
tables, vault-first sourcing). This file only states what changes per surface.

Gold-standard examples, read the matching one in full before writing:
- Comparative: `frontend/src/content/comparative/205-Return-On-Equity.md`
- Industry: `frontend/src/content/industry/305-Return-On-Equity.md`
- Sector: `frontend/src/content/sector/405-Return-On-Equity.md`

## The three surfaces

1. COMPARATIVE — comparing the large companies WITHIN one industry against each other
   (a ranked leaderboard and a company scorecard). The reader is choosing the best
   company in an industry. Numbers are per company at the latest year.
2. INDUSTRY — judging ONE whole industry, as a market-cap-weighted aggregate across its
   companies. The reader is deciding whether the industry itself is attractive.
3. SECTOR — judging ONE whole sector (a group of related industries), as a
   market-cap-weighted aggregate. The reader is deciding which broad part of the
   economy to favor.

## Per-surface adaptation of the nine parts

Same nine `## Part N:` headings, but re-pointed to the surface's altitude:

- Part 1 Definition: define the metric in plain words, THEN say what it means at this
  altitude (across companies in an industry / as an industry aggregate / as a sector
  aggregate). Keep the level table.
- Part 2 How it is calculated: the formula line, the inputs, AND how this surface forms
  the number (per company and ranked, for comparative; market-cap-weighted across the
  group, for industry and sector).
- Part 3 retitled by surface:
  - Comparative: `## Part 3: Why this metric is used to compare companies`
  - Industry:    `## Part 3: Why this metric is used to judge an industry`
  - Sector:      `## Part 3: Why this metric is used to judge a sector`
- Part 4 retitled by surface:
  - Comparative: `## Part 4: What makes one company's number differ from another's`
  - Industry:    `## Part 4: What influences the industry aggregate`
  - Sector:      `## Part 4: What influences the sector aggregate`
- Part 5 retitled by surface (this REPLACES v2's "by industry and sector"):
  - Comparative: `## Part 5: How to compare companies on this metric`
  - Industry:    `## Part 5: How this industry compares with other industries`
  - Sector:      `## Part 5: How this sector compares with other sectors`
- Part 6 Reading the historical trend:
  - Comparative: how each company's series moves and how the RANKING shifts over time
    (durability of a leader, who is climbing).
  - Industry / Sector: how the market-cap-weighted aggregate trends, separating the
    business cycle from a structural change.
- Part 7 Metrics to read alongside it: SAME shape as v2 (H3 per pairing, a three-plus
  sentence "**Why read the two together.**" and a three-plus sentence "**What the
  combination tells you.**"). Pair ONLY with metrics that appear on the SAME surface
  (see the surface's 000-INDEX). Frame the pairing at the surface's altitude.
- Part 8 Limitations: at the surface's altitude (ranking traps for comparative;
  aggregate/composition traps for industry and sector).
- Part 9 retitled `## Part 9: Precise qualitative questions`, with questions pointed at
  the surface's decision:
  - Comparative: which company in the industry to pick and why.
  - Industry: the industry's structure, moat, cycle, and durability.
  - Sector: sector attractiveness, rotation, macro sensitivity, and composition.

## Sourcing (vault first, emphasized)

For every metric run at least two `ask_vault.py` queries, and add a surface-specific
query, for example:
`python -X utf8 C:\Users\Zaki_Mir\ask_vault.py "<metric> comparable companies analysis peer ranking" -k 8 --per-chapter 2`
`python -X utf8 C:\Users\Zaki_Mir\ask_vault.py "<metric> industry analysis competitive structure" -k 8 --per-chapter 2`
`python -X utf8 C:\Users\Zaki_Mir\ask_vault.py "<metric> sector rotation macro" -k 8 --per-chapter 2`
Vault texts that carry this material: Investment Banking (Comparable Companies
Analysis), Damodaran Investment Valuation (Relative Valuation, Ch.17-18), Applied
Corporate Finance, Investment Analysis 11th ed. (Porter's five forces, industry
analysis), Strategic Value Investing, Global Investing (Global Sectors and Industries),
The Little Book That Builds Wealth (moats). Read the full chapters when snippets are
thin. Reputable web only to confirm formulas. General knowledge last.

## Numbering and output location

- Comparative: `frontend/src/content/comparative/2NN-Title.md` (201-299)
- Industry:    `frontend/src/content/industry/3NN-Title.md`    (301-399)
- Sector:      `frontend/src/content/sector/4NN-Title.md`      (401-499)

The exact number, filename, title, and the one-line "what this is on this surface"
note for every metric live in each folder's `000-INDEX.md`. Use the title there as the
H1. Punctuation a filename cannot carry (slashes, parentheses) is handled by
LABEL_ALIASES / TITLE_OVERRIDES in `frontend/src/lib/surfaceDefinitions.ts`.

## Per-file compliance checklist

Same as v2, plus: Part 3, 4, 5, 9 use the surface-specific titles above; Part 7 pairs
only with metrics from the SAME surface's index; every cross-reference and example is
framed at the surface's altitude (company-vs-company, industry-vs-industry, or
sector-vs-sector), not at the single-company altitude.
