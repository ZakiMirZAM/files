# Reading picker copy, for owner review

Needs owner review.

**Status: final (writer).** Every ReadingPicker key carries the writer's text
word for word.
The `Placeholder` column below keeps the wording it had while the text was
being written; the approved registry at the foot of this file is the
machine-checked source. The keys are stable and the component reads nothing but
`lib/lensCopy.ts`, so the writer can replace any value without opening
`components/ReadingPicker.tsx`.

The ReadingPicker keys the writer supplied are `picker.latest`,
`picker.trend`, `picker.level`, `picker.undecided`, `picker.meaningToggle`,
`picker.orphan`, `picker.noTable`, `picker.rotationLine`, `picker.rotationSet`,
`picker.rising`, `picker.steady` and `picker.falling`. The writer wrote
`picker.rotationLine` with `{name}`; the builder's variable is `{row}`, so the
placeholder name is mapped and the rest of the sentence is verbatim.

The picker sits inside every metric dropdown on the Economic page and the Credit
and Banking page, between the metric's chart and its question deck. It opens as
ONE line with the reading already filled in, and a `change` link. The link
reveals what the picker used to show whole: three lines of evidence, the named
readings from that metric's own definition file as radio options, and, when the
metric has a Sector Rotation matrix row, a line offering to set that row's
direction.

Two rules hold for every string here:

1. The reading is filled from the owner's own thresholds, written out in
   `lib/readingRules/` and listed for review in `lib/readingRules.draft.md`. No
   string here names a reading, and where no rule decides the line says the
   reading is not determined rather than guessing one.
2. The reading options themselves are never written here. They are the owner's
   own Part 3 labels, rendered word for word.

## Two strings changed when the reading became automatic

`picker.intro` said "The app does not pick for you, because a number does not
name a regime", which the automatic fill makes untrue. It now says where the
reading came from and that the reader can change it. Eleven `picker.auto.*` keys
are new, and `picker.saveSignedOut` is new beside them. Nothing else was
touched.

## Where each key renders

| Key | Placeholder | Renders where, beside what | Fills |
|---|---|---|---|
| `picker.auto.line` | Reading now: {reading}, from the latest {value}, as of {period} | The one line under the chart, when a rule decided the reading on the latest observation. NEEDS OWNER REVIEW: the period is new. | `{reading}` is the owner's own Part 3 label; `{value}` is the figure the rule read, in the metric's unit; `{period}` is the year and month of that observation. |
| `picker.auto.lineYearOverYear` | Reading now: {reading}, from {value} year over year, as of {period} | The same line for a metric whose rules are written on the year-over-year change of a LEVEL series (economic 5, 9, 10, 20, and the one rule of 33 whose band is the year change). NEEDS OWNER REVIEW: new key. | `{value}` is that change as a signed percent, for example +6.95%. |
| `picker.auto.lineYearChange` | Reading now: {reading}, from a change of {value} over the year, as of {period} | The same line for the two rungs of economic 25 that are separated by the change in the rate over a year. NEEDS OWNER REVIEW: new key. | `{value}` is that change in the series own unit, signed. |
| `picker.auto.undetermined` | Reading now: not determined | The same line when no rule decided and the metric has no series at all. Nothing is guessed. | |
| `picker.auto.undeterminedLatest` | Reading now: not determined. Latest {value}, as of {period}. | The same line when the series has a latest figure but no readable direction. | `{value}` is the latest figure in the metric's unit. |
| `picker.auto.undeterminedFacts` | Reading now: not determined. Latest {value}, {direction}, as of {period}. | The same line when the series has both, so the reader sees the figures no rule covered. NEEDS OWNER REVIEW: the period is new. | `{direction}` is `picker.rising`, `picker.steady` or `picker.falling`. |
| `picker.auto.stale` | Reading now: not determined. The latest figure is from {period}. | The same line for a series the feed has stopped updating, such as credit 14 and 15, which both end in 2020. No reading is named, because naming one would date a 2020 figure today. NEEDS OWNER REVIEW: new key. | `{period}` is the year and month of the newest observation there is. |
| `picker.auto.chosen` | Reading now: {reading}, chosen by you | The same line when the reader has saved a pick, which wins over the automatic one. | `{reading}` is the saved label. |
| `picker.auto.change` | change | The link at the end of that line. It reveals the options. | |
| `picker.auto.close` | close | The same link once the options are open. | |
| `picker.auto.useAutomatic` | use the automatic reading | A second link, only beside a reading the reader chose. It clears the saved pick and the line goes back to the automatic reading. | |
| `picker.title` | Your reading | The picker's heading, shown once the options are open. | |
| `picker.intro` | The reading above is filled from the thresholds this metric's own definition states. Pick a different one here when you read the same figures another way. The evidence below is arithmetic on the series above it. | One sentence under the heading. | |
| `picker.latest` | Latest | Label on evidence line 1. The value beside it is the metric's latest figure with its unit and the period it is as of. | |
| `picker.latestUnavailable` | No series on this page for this metric. | Replaces evidence line 1's value when the dropdown has no chart. | |
| `picker.trend` | Trend | Label on evidence line 2. The value beside it is the word rising, stable or falling from the existing classifier. | |
| `picker.trendUnavailable` | Not derivable, {reason}. | Replaces evidence line 2's value when the classifier skips the series. | `{reason}` is one of the four `picker.skip.*` strings. |
| `picker.trendDetail` | {change} over the lookback, against a band of {band}. | Second half of evidence line 2, after the trend word. | `{change}` and `{band}` are already formatted figures. |
| `picker.level` | 10-year level, final (writer) | Label on evidence line 3. | |
| `picker.levelValue` | {percentile} of its last ten years. | Evidence line 3's value. | `{percentile}` is an ordinal, for example `63rd percentile`. |
| `picker.levelUnavailable` | Not enough history for a ten-year level. | Replaces evidence line 3's value. | |
| `picker.skip.noSeries` | there is no series behind this metric | Inside `picker.trendUnavailable`. | |
| `picker.skip.tooFewPoints` | the series is too short to compare | Inside `picker.trendUnavailable`. | |
| `picker.skip.staleSeries` | the series has not updated recently enough | Inside `picker.trendUnavailable`. | |
| `picker.skip.notDerivable` | the series cannot be read this way | Inside `picker.trendUnavailable`. | |
| `picker.undecided` | undecided, final (writer) | The first radio option, above the named readings. Selecting it clears the saved row. | |
| `picker.meaningToggle` | What it means | The small toggle beside each reading option; opening it shows the owner's own What it means cell. | |
| `picker.meaningHide` | Hide | The same toggle once open. | |
| `picker.saveError` | That pick did not save. Pick it again. | Under the options, only after a save that a signed-in reader could retry. | |
| `picker.saveSignedOut` | A reading is saved only when you are signed in. | Replaces `picker.saveError` when the save failed because the reader is signed out, where picking again could never work. NEEDS OWNER REVIEW: new key. | |
| `picker.orphan` | Your saved reading no longer matches this metric's readings. Pick again. | Above the options, when the saved answer matches no current reading label or key. | |
| `picker.noTable` | No reading options are available for this metric. final (writer) | Replaces the whole picker for a metric whose definition file does not conform. | |
| `picker.rotationLine` | Sector Rotation matrix row: {row}. Direction now: {direction}. | Under a saved pick, only for a metric that has a matrix row. | `{row}` is the matrix row's own name; `{direction}` is `picker.rising`, `picker.steady`, `picker.falling` or `picker.rotationUnset`. |
| `picker.rotationUnset` | not set | Fills `{direction}` when the matrix row has no reading yet. | |
| `picker.rotationSet` | Set the matrix direction | Label before the three buttons. | |
| `picker.rising` | rising | The first matrix button, and the trend word for a rising series. | |
| `picker.steady` | stable | The second matrix button, and the trend word for a flat series. The Sector Rotation page calls this state **stable**, so the placeholder matches that page rather than the word steady. | |
| `picker.falling` | falling | The third matrix button, and the trend word for a falling series. | |

## What the writer must not change

- The three matrix buttons must keep the wording the Sector Rotation page
  already uses, or the same state reads as two different things on two pages.
- No button may be preselected and no copy may suggest one, because a reading
  such as flat is neither rising nor falling.

## Approved copy registry (machine-checked)

`lensCopy.conformance.test.ts` compares this table against the module in both
directions.

| Key | Approved string |
|---|---|
| `picker.auto.line` | Reading now: {reading}, from the latest {value}, as of {period} |
| `picker.auto.lineYearOverYear` | Reading now: {reading}, from {value} year over year, as of {period} |
| `picker.auto.lineYearChange` | Reading now: {reading}, from a change of {value} over the year, as of {period} |
| `picker.auto.undetermined` | Reading now: not determined |
| `picker.auto.undeterminedLatest` | Reading now: not determined. Latest {value}, as of {period}. |
| `picker.auto.undeterminedFacts` | Reading now: not determined. Latest {value}, {direction}, as of {period}. |
| `picker.auto.stale` | Reading now: not determined. The latest figure is from {period}. |
| `picker.auto.chosen` | Reading now: {reading}, chosen by you |
| `picker.auto.change` | change |
| `picker.auto.close` | close |
| `picker.auto.useAutomatic` | use the automatic reading |
| `picker.title` | Your reading |
| `picker.intro` | The reading above is filled from the thresholds this metric's own definition states. Pick a different one here when you read the same figures another way. The evidence below is arithmetic on the series above it. |
| `picker.latest` | Latest |
| `picker.latestUnavailable` | No series on this page for this metric. |
| `picker.trend` | Trend |
| `picker.trendUnavailable` | Not derivable, {reason}. |
| `picker.trendDetail` | {change} over the lookback, against a band of {band}. |
| `picker.level` | 10-year level |
| `picker.levelValue` | {percentile} of its last ten years. |
| `picker.levelUnavailable` | Not enough history for a ten-year level. |
| `picker.skip.noSeries` | there is no series behind this metric |
| `picker.skip.tooFewPoints` | the series is too short to compare |
| `picker.skip.staleSeries` | the series has not updated recently enough |
| `picker.skip.notDerivable` | the series cannot be read this way |
| `picker.undecided` | undecided |
| `picker.meaningToggle` | What it means |
| `picker.meaningHide` | Hide |
| `picker.saveError` | That pick did not save. Pick it again. |
| `picker.saveSignedOut` | A reading is saved only when you are signed in. |
| `picker.orphan` | Your saved reading no longer matches this metric's readings. Pick again. |
| `picker.noTable` | No reading options are available for this metric. |
| `picker.rotationLine` | Sector Rotation matrix row: {row}. Direction now: {direction}. |
| `picker.rotationUnset` | not set |
| `picker.rotationSet` | Set the matrix direction |
| `picker.rising` | rising |
| `picker.steady` | stable |
| `picker.falling` | falling |
