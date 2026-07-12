---
name: metric-definitions
description: Generate one batch of individual-stock metric definitions for the analysis page dropdowns. Usage - /metric-definitions <batch number> (or a list of metric numbers like "002 005 014"). Sources the Obsidian vault via ask_vault.py, writes NNN-*.md files into frontend/src/content/individual/, and updates the 000-INDEX.md checklist.
---

# Metric Definitions Batch Generator

Generate one batch of metric definition files for the individual stock analysis page.
The argument is a batch number from the schedule (1 to 39), or an explicit list of
metric numbers. If no argument was given, ask which batch to run, showing the next
unchecked batch from the index.

## Single source of truth

Read `docs/prompts/metric-definitions-master-prompt-v2.md` FIRST and follow it exactly.
v2 is the current standard: a 9-part beginner template (old Parts 8 and 9 deleted),
strict beginner style (no em dashes, no analogies, no ambiguous pronouns, no excessive
commas, no imported credit-rating numbers), vault-first sourcing, and a Part 7 shape
that gives each pairing a three-sentence "why" and a three-sentence "what it tells you".
The gold-standard example is `frontend/src/content/individual/011-Interest-Coverage.md`;
read it in full and match its voice. The older 11-part file
`docs/prompts/metric-definitions-master-prompt.md` is superseded; do not follow it.
Do not paraphrase or shortcut v2's rules; this skill file only orchestrates.

Also read `frontend/src/content/individual/000-INDEX.md` to resolve the batch's exact
filenames and to confirm none of the batch's files already exist (if one exists, ask
before overwriting).

## Workflow

1. Resolve the batch to its metric numbers, exact filenames, and display titles from
   `000-INDEX.md`. Note which rows are marked long-form (Template B).
2. For each metric, query the Obsidian vault before writing, at least two queries per
   metric: `python C:\Users\Zaki_Mir\ask_vault.py "<metric> definition interpretation"`
   and `python C:\Users\Zaki_Mir\ask_vault.py "<metric> limitations manipulation sector"`.
   Read the full chapter files the results point to when a snippet is thin. Use
   reputable web sources only to verify formulas.
3. Write each definition following the master prompt's template and style rules. Write
   the file to `frontend/src/content/individual/<NNN-Exact-Name>.md` with the H1 set to
   the display title. Finish one metric completely before starting the next.
4. Check compliance per file before moving on against the v2 per-file checklist: exactly
   nine Part sections (plus 2b, 5b for long-form), no Part 8 buyer/seller or old Part 9
   management section, no em dashes, no analogies, no bare ambiguous pronouns, no
   sentence with more than two commas, no imported credit-rating spreads or unrelated
   numbers, no bullet points outside the Part 9 questions, examples in tables, Part 1
   defines before exemplifying, Part 7 uses the H3 + two-block shape (each block three
   or more sentences) and pairs only metrics from the v2 in-app list.
5. Update `frontend/src/content/individual/000-INDEX.md`: change `[ ]` to `[x]` for
   each completed row.
6. Run `npx tsc -p frontend --noEmit` from the repo root (or `npx tsc --noEmit` inside
   `frontend/`) to confirm the build still typechecks.
7. Report: files written, vault sources used per metric, and which page sections now
   show the new dropdowns. Remind the user the dropdown appears automatically; no code
   changes are needed.
