# Connections Copy: Final Wording (Draft File)

This is a working file for the cross-stage layer's text. It is not imported by
the app. Each string has been through: question-maker checklist, humanizer pass,
duplicate check.

The Carried Forward panel, the peer exposure table and the old connect-deck
questions were removed, so their strings are gone from this file. The connect
deck's own questions and titles now live in `connectQuestions.draft.md`.

---

## 1.5 StageGoalPanel texts

| Key | Final text |
|---|---|
| `goal.economic` | What to settle here: how the economy is generating growth, where rates, inflation, and credit stand, and which sectors that favors. The sector pages carry your matrix result forward. |
| `goal.credit` | What to settle here: whether companies can borrow and refinance easily. Sector, industry, and company pages show their debt figures beside these readings. |
| `goal.sector` | What to settle here: whether the economy is helping this sector, where profit sits along its chain, and which industries deserve a closer look. |
| `goal.industry` | What to settle here: why this industry earns what it earns (the five forces, the barriers, the strategic groups) and where its structure is heading. |
| `goal.comparative` | What to settle here: which group each company belongs to, who is exposed to what, and which companies earn more than their group. |
| `goal.company` | What to settle here: how this company competes, how much of its result comes from its industry, its group, and itself, and whether the valuation agrees. |

No duplicates found. These are panel statements.

---

## 1.6 NextStagePanel headings

| Key | Final text |
|---|---|
| `next.economic` | Next: the eleven sectors, ordered by your Sector Rotation matrix total |
| `next.sector` | Next: industries in this sector, ordered by share of operating profit |
| `next.industry` | Next: the largest companies in this industry |
| `next.comparative` | Next: individual company pages |
| `next.company` | Next: the Final Review |

No duplicates found.

---

## 1.6b NextStagePanel notes

| Key | Final text |
|---|---|
| `next.note.noRotation` | No readings set on your Sector Rotation matrix. Set them at the Rotation page to see these sorted by your total. |

No duplicates found. This is a guidance note shown when no rotation readings exist.

---

## Added during build (needs owner review)

| Key | Final text | Reason it was added |
|---|---|---|
| `next.note.noRotation` | No readings set on your Sector Rotation matrix. Set them at the Rotation page to see these sorted by your total. | Shown in the NextStagePanel when no rotation readings exist. |
| `panel.eyebrow` | Connections | Was an inline literal in the panel components. Moved here so every string of the layer lives in one module. |
| `unavailable.figure` | not available | M6. Replaces the bare "n/a" a formatter used to emit. Every sentence picks a variant instead, so this should never render; the tests assert that. |
| `unavailable.noneList` | none | M6. Replaces the literal "(none)" in the rotation item list. |
| `unavailable.noMatrix` | no matrix readings set | M6. Replaces the literal "(no matrix)" in deck data contexts. |
| `unavailable.noChange` | did not change | H5. Used where a signed one-off change rounds to zero. |
| `unavailable.noChangeRate` | did not change | H5. Used where a signed compound rate rounds to zero. |
| `goal.report` | What to settle here: whether every stage still agrees once they are read together, and whether the case holds against your own written policy rather than against the company alone. | M5. The Report page had no stage goal, so its top order did not match the other pages. |
| `next.note.noIndustries` | No industries have been returned for this sector yet. Pick one from the industry list instead. | M6. Replaces an inline literal in NextStagePanel.tsx. |
| `next.note.noCompanies` | No companies have been returned for this industry yet. Search for one by ticker instead. | M6. Replaces two inline literals in NextStagePanel.tsx. |
| `next.link.compareAll` | Compare all companies in {industry} | M6. Was an inline literal. |
| `next.link.finalReview` | Go to the Final Review | M6. Was an inline literal. |
| `report.picker.eyebrow` | Review a specific company | M6. Was an inline literal in ReportPage.tsx. |
| `report.picker.placeholder` | AAPL | M6. Was an inline literal. |
| `report.picker.load` | Load | M6. Was an inline literal. |
| `report.picker.reviewing` | Reviewing: | M6. Was an inline literal. |
| `report.picker.notFound` | No company was found under that ticker. Check the spelling, or pick one from the list as you type. | Improvement 2. The picker validates free text against the ticker search before fetching. |
| `synthesis.eyebrow` | Your Connect Synthesis Answers | M6. Was an inline literal in SynthesisReview.tsx. |
| `synthesis.intro` | These are the synthesis answers you wrote on each stage's Connect deck. Read them before answering the review questions below. | M6. Was an inline literal. |
| `synthesis.loading` | Loading your saved answer | M4. The component could not tell a pending query from an unanswered question. |
| `synthesis.unanswered.sector` | Not yet answered. Open the sector page and answer the synthesis question in its Connect deck. | M4 and M6. The old line built the stage name by splitting the label on a colon. |
| `synthesis.unanswered.industry` | Not yet answered. Open the industry page and answer the synthesis question in its Connect deck. | M4 and M6. |
| `synthesis.unanswered.comparative` | Not yet answered. Open the comparative page and answer the synthesis question in its Connect deck. | Review Extra. Placeholder. Needs owner wording. The Comparative stage writes a synthesis answer of its own and the Final Review was not showing it, so the reader saw three of their four synthesis answers. Worded to match the three rows beside it. |
| `synthesis.unanswered.company` | Not yet answered. Open the company page and answer the synthesis question in its Connect deck. | M4 and M6. |
| `peer.heading` | Peer ranking | Part 4. Placeholder heading over the company page's copy of the ranking table. Needs owner wording. |
| `peer.comparativeHeading` | Per-Ticker Value Ranking | Part 4. The Comparative page's existing heading, moved here when both pages were put on one component. Unchanged wording. |
| `peer.wholeIndustry` | Whole industry | Part 4. Left half of the company page's toggle over the ranking. |
| `peer.groupOnly` | Its strategic group only | Part 4. Right half of that toggle. It filters the table to the company's strategic group. |
| `peer.notRanked` | This company is not in the ranked list below. The ranking covers the companies in its industry that the filters leave in. | Part 4. Shown instead of an error when the company itself is not among the ranked rows. The ranking payload carries no reason field, so the line states the rule rather than guessing the cause. |
| `peer.developedOnly` | US / developed only | Review L. Placeholder. Needs owner wording. Was an inline literal in PeerRankingTable.tsx; the wording is unchanged. It also names the toggle beside it, which had no accessible name of its own. |
| `peer.minMcap` | Min mkt cap | Review L. Placeholder. Needs owner wording. Was an inline literal in PeerRankingTable.tsx; the wording is unchanged. |
| `peer.billions` | $B | Review L. Placeholder. Needs owner wording. The unit shown inside the market cap box. Was an inline literal; the wording is unchanged. |
| `peer.loading` | Loading value ranking… | Review L. Placeholder. Needs owner wording. The skeleton's label while the ranking loads. Was an inline literal; the wording is unchanged. |
| `peer.noneAfterFilters` | No companies are left once these filters are applied. Lower the market cap floor, or turn off the developed markets filter, to see the ranking again. | Review M6. Placeholder. Needs owner wording. A filtered ranking with no rows answers 404, which the table read as "empty" and rendered as nothing at all under two live filters. |
| `exposure.group` | Exposure | Part 4. Name of the extra column group appended to the Comparative ranking table. |
| `exposure.label.interestPerPoint` | Interest per point of rate, share of operating income | Part 4. Placeholder column label. Needs owner wording. |
| `exposure.label.revenueChange2020` | Revenue change, fiscal 2020 | Part 4. Placeholder column label. Needs owner wording. |
| `exposure.label.grossMarginChange` | Gross margin change, 2020 to 2022 | Part 4. Placeholder column label. Needs owner wording. |
| `exposure.label.shareChange5y` | Share change, five years | Part 4. Placeholder column label. Needs owner wording. |
| `exposure.definition.interestPerPoint` | The extra interest a one point rise in rates would cost, measured against operating income. Reported for the twenty largest companies in the industry by revenue. | Part 4. The column's hover definition. There is no numbered markdown definition for these four columns yet, so the header is plain text rather than a sidebar link. |
| `exposure.definition.revenueChange2020` | The change in revenue in fiscal 2020 against the year before. Reported for the twenty largest companies in the industry by revenue. | Part 4. As above. |
| `exposure.definition.grossMarginChange` | The change in gross margin between 2020 and 2022, in percentage points. Reported for the twenty largest companies in the industry by revenue. | Part 4. As above. |
| `exposure.definition.shareChange5y` | The change in the company's share of the industry's revenue over five years, in percentage points. Reported for the twenty largest companies in the industry by revenue. | Part 4. As above. |

---

## Approved copy registry (machine-checked)

| Key | Approved text |
|---|---|
| `unavailable.figure` | not available |
| `unavailable.noneList` | none |
| `unavailable.noMatrix` | no matrix readings set |
| `unavailable.noChange` | did not change |
| `unavailable.noChangeRate` | did not change |
| `panel.eyebrow` | Connections |
| `goal.economic` | What to settle here: how the economy is generating growth, where rates, inflation, and credit stand, and which sectors that favors. The sector pages carry your matrix result forward. |
| `goal.credit` | What to settle here: whether companies can borrow and refinance easily. Sector, industry, and company pages show their debt figures beside these readings. |
| `goal.sector` | What to settle here: whether the economy is helping this sector, where profit sits along its chain, and which industries deserve a closer look. |
| `goal.industry` | What to settle here: why this industry earns what it earns (the five forces, the barriers, the strategic groups) and where its structure is heading. |
| `goal.comparative` | What to settle here: which group each company belongs to, who is exposed to what, and which companies earn more than their group. |
| `goal.company` | What to settle here: how this company competes, how much of its result comes from its industry, its group, and itself, and whether the valuation agrees. |
| `goal.report` | What to settle here: whether every stage still agrees once they are read together, and whether the case holds against your own written policy rather than against the company alone. |
| `next.economic` | Next: the eleven sectors, ordered by your Sector Rotation matrix total |
| `next.sector` | Next: industries in this sector, ordered by share of operating profit |
| `next.industry` | Next: the largest companies in this industry |
| `next.comparative` | Next: individual company pages |
| `next.company` | Next: the Final Review |
| `next.note.noRotation` | No readings set on your Sector Rotation matrix. Set them at the Rotation page to see these sorted by your total. |
| `next.note.noIndustries` | No industries have been returned for this sector yet. Pick one from the industry list instead. |
| `next.note.noCompanies` | No companies have been returned for this industry yet. Search for one by ticker instead. |
| `next.link.finalReview` | Go to the Final Review |
| `peer.heading` | Peer ranking |
| `peer.comparativeHeading` | Per-Ticker Value Ranking |
| `peer.wholeIndustry` | Whole industry |
| `peer.groupOnly` | Its strategic group only |
| `peer.notRanked` | This company is not in the ranked list below. The ranking covers the companies in its industry that the filters leave in. |
| `peer.developedOnly` | US / developed only |
| `peer.minMcap` | Min mkt cap |
| `peer.billions` | $B |
| `peer.loading` | Loading value ranking… |
| `peer.noneAfterFilters` | No companies are left once these filters are applied. Lower the market cap floor, or turn off the developed markets filter, to see the ranking again. |
| `exposure.group` | Exposure |
| `exposure.label.interestPerPoint` | Interest per point of rate, share of operating income |
| `exposure.label.revenueChange2020` | Revenue change, fiscal 2020 |
| `exposure.label.grossMarginChange` | Gross margin change, 2020 to 2022 |
| `exposure.label.shareChange5y` | Share change, five years |
| `exposure.definition.interestPerPoint` | The extra interest a one point rise in rates would cost, measured against operating income. Reported for the twenty largest companies in the industry by revenue. |
| `exposure.definition.revenueChange2020` | The change in revenue in fiscal 2020 against the year before. Reported for the twenty largest companies in the industry by revenue. |
| `exposure.definition.grossMarginChange` | The change in gross margin between 2020 and 2022, in percentage points. Reported for the twenty largest companies in the industry by revenue. |
| `exposure.definition.shareChange5y` | The change in the company's share of the industry's revenue over five years, in percentage points. Reported for the twenty largest companies in the industry by revenue. |
| `report.picker.eyebrow` | Review a specific company |
| `report.picker.placeholder` | AAPL |
| `report.picker.load` | Load |
| `report.picker.reviewing` | Reviewing: |
| `report.picker.notFound` | No company was found under that ticker. Check the spelling, or pick one from the list as you type. |
| `synthesis.eyebrow` | Your Connect Synthesis Answers |
| `synthesis.intro` | These are the synthesis answers you wrote on each stage's Connect deck. Read them before answering the review questions below. |
| `synthesis.loading` | Loading your saved answer |
| `synthesis.unanswered.sector` | Not yet answered. Open the sector page and answer the synthesis question in its Connect deck. |
| `synthesis.unanswered.industry` | Not yet answered. Open the industry page and answer the synthesis question in its Connect deck. |
| `synthesis.unanswered.comparative` | Not yet answered. Open the comparative page and answer the synthesis question in its Connect deck. |
| `synthesis.unanswered.company` | Not yet answered. Open the company page and answer the synthesis question in its Connect deck. |
