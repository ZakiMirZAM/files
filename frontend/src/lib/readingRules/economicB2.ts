// Automatic readings, economic definition files 56 to 69.
//
// The second half of ECONOMIC_RULES_B. The contract every rule in both halves
// obeys, the shared ladders and every quoted sentence are in
// economicBHelpers.ts; economicB.ts joins the two halves back together under
// the name every importer already uses. Nothing here was rewritten when the
// file was split.

import { levelNote } from "./types";
import type { MetricRules } from "./types";
import {
  HIGH_PCT,
  LOW_PCT,
  LOWER_THIRD_PCT,
  UPPER_THIRD_PCT,
  atOrAbove,
  atOrBelow,
  inBand,
  NOT_TESTED_NOTE,
  rate,
  recordPercentile,
  allUndetermined,
  CAUSE_WHY,
  AAII_AVERAGES,
  RATE_SPLIT_GAP,
  AAII_BAND_GAP,
  AAII_CASH_GAP,
} from "./economicBHelpers";

export const ECONOMIC_RULES_B2: MetricRules[] = [
  {
    surface: "economic",
    defNumber: 56,
    metricName: "Bank Loans & Leases (YoY %)",
    rules: [
      {
        reading: "Strong growth (above 8% year over year)",
        when: (f) => rate(f) > 8,
        rule: "Credit growth is above 8 percent year over year.",
        source: "Strong growth (above 8% year over year)",
      },
      {
        reading: "Moderate growth (3 to 8% year over year)",
        when: (f) => rate(f) >= 3 && rate(f) <= 8,
        rule: "Credit growth is from 3 to 8 percent year over year, both ends included.",
        source: "Moderate growth (3 to 8% year over year)",
      },
      {
        reading: "Slowing or flat (near zero growth)",
        when: (f) => rate(f) >= 0 && rate(f) < 3,
        rule: "Credit growth is from zero up to but not including 3 percent year over year.",
        source: "Slowing or flat (near zero growth)",
        gapNote: `The owner names this band "near zero growth" and gives no upper edge. Its neighbours are the 3 to 8 percent band above and the negative band below, so it takes everything from zero up to 3 percent. The owner should rule on whether 3 percent is still near zero. ${NOT_TESTED_NOTE}`,
      },
      {
        reading: "Contracting (negative year over year)",
        when: (f) => rate(f) < 0,
        rule: "Credit growth is below zero year over year.",
        source: "Contracting (negative year over year)",
        gapNote: `${NOT_TESTED_NOTE} A year over year figure that is negative but climbing is still a contraction.`,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 57,
    metricName: "Copper Price",
    rules: [],
    undetermined: allUndetermined(
      [
        "Rising on strong demand (above prior range, demand-driven)",
        "Rising on supply disruption (spike from cut supply)",
        "Falling on weak demand (declining, demand-driven)",
        "Falling on oversupply (declining, supply-driven)",
      ],
      CAUSE_WHY,
    ),
  },
  {
    surface: "economic",
    defNumber: 58,
    metricName: "Gold",
    rules: [],
    undetermined: allUndetermined(
      [
        "Rising on falling real rates",
        "Rising on inflation fear",
        "Rising on fear and financial stress",
        "Falling on rising real rates or a strong dollar",
      ],
      "Each label names the driver of the move, and each driver is a different series: the 10-year real yield, the breakeven inflation rate, a stress or fear gauge, and the dollar index. The gold price alone cannot tell three simultaneous rising readings apart.",
    ),
  },
  {
    surface: "economic",
    defNumber: 59,
    metricName: "Silver",
    rules: [],
    undetermined: allUndetermined(
      [
        "Rising and outperforming gold (gold-silver ratio falling)",
        "Rising alongside gold on fear or falling real rates",
        "Falling and underperforming gold (gold-silver ratio rising)",
        "Falling on rising real rates or a strong dollar",
      ],
      "Three of the four readings are decided by silver's move against GOLD, and the fourth by real rates or the dollar. All of those are different series, so the silver price alone decides none of them.",
    ),
  },
  {
    surface: "economic",
    defNumber: 60,
    metricName: "Wheat",
    rules: [
      {
        reading: "Stable within a normal range",
        when: (f) => f.trend === "neutral" && inBand(f.percentile10y, LOW_PCT, HIGH_PCT),
        rule: `The direction reader calls the price stable and its level sits between the ${LOW_PCT}th and ${HIGH_PCT}th percentiles of its trailing ten years.`,
        source: "Stable within a normal range",
        gapNote: `"Normal range" takes the middle three fifths of the trailing ten years, bounded by the cuts the app's own Sector Rotation reader uses for an extreme level. Uncovered on purpose: a price that is flat but parked at an extreme, which is not a normal range, and every rising or falling price, whose reading the owner decides by a cause this series cannot show.`,
      },
    ],
    undetermined: allUndetermined(
      [
        "Rising on supply shock (spike from weather or conflict)",
        "Rising on strong demand (above prior range, demand-driven)",
        "Falling on abundant harvest (declining, supply-driven)",
      ],
      CAUSE_WHY,
    ),
  },
  {
    surface: "economic",
    defNumber: 61,
    metricName: "WTI Crude Oil",
    rules: [],
    undetermined: allUndetermined(
      [
        "Rising on strong demand (above prior range, demand-driven)",
        "Rising on supply disruption (spike from cut supply)",
        "Falling on weak demand (declining, demand-driven)",
        "Falling on oversupply (declining, supply-driven)",
      ],
      CAUSE_WHY,
    ),
  },
  {
    surface: "economic",
    defNumber: 62,
    metricName: "Brent Crude",
    rules: [],
    undetermined: allUndetermined(
      [
        "Rising on strong demand (above prior range, demand-driven)",
        "Rising on geopolitical or supply disruption (spike from cut supply)",
        "Falling on weak demand (declining, demand-driven)",
        "Falling on oversupply (declining, supply-driven)",
      ],
      CAUSE_WHY,
    ),
  },
  {
    surface: "economic",
    defNumber: 63,
    metricName: "Henry Hub NatGas",
    rules: [
      {
        reading: "Stable within a normal seasonal range",
        when: (f) => f.trend === "neutral" && inBand(f.percentile10y, LOW_PCT, HIGH_PCT),
        rule: `The direction reader calls the price stable and its level sits between the ${LOW_PCT}th and ${HIGH_PCT}th percentiles of its trailing ten years.`,
        source: "Stable within a normal seasonal range",
        gapNote: `"Normal range" takes the middle three fifths of the trailing ten years. The word "seasonal" is NOT tested: the facts carry no seasonal adjustment, and gas is the most seasonal series in the set, so the owner should rule on whether a plain ten year band is acceptable here. Uncovered on purpose: a price that is flat but parked at an extreme, and every rising or falling price, whose reading the owner decides by a cause this series cannot show.`,
      },
    ],
    undetermined: allUndetermined(
      [
        "Rising on cold weather or strong demand (above prior range, demand-driven)",
        "Rising on supply tightness or export pull (spike from low storage or LNG demand)",
        "Falling on mild weather or abundant storage (declining, supply-driven)",
      ],
      CAUSE_WHY,
    ),
  },
  {
    surface: "economic",
    defNumber: 64,
    metricName: "S&P 500 Earnings Yield",
    rules: [],
    undetermined: allUndetermined(
      [
        "Wide positive spread (earnings yield well above the 1-year Treasury)",
        "Narrow positive spread (earnings yield only modestly above the 1-year Treasury)",
        "Negative spread (the 1-year Treasury out-yields stocks)",
      ],
      "Every reading is about the SPREAD between two series, the S&P 500 earnings yield and the 1-year Treasury yield. The payload carries the two separately and no combined spread metric, and a set of facts describes one series. Deliver the spread as its own series and the three readings become a sign test plus one band.",
    ),
  },
  {
    surface: "economic",
    defNumber: 65,
    metricName: "S&P 500 Fair Value and Implied Return",
    rules: [],
    undetermined: allUndetermined(
      [
        "Clearly undervalued (high implied return, wide implied premium)",
        "Near fair value (implied return close to baseline)",
        "Clearly overvalued (low implied return, thin implied premium)",
      ],
      "This metric arrives as the sp500Valuation snapshot, a set of scalars (impliedReturn, baselineRequiredReturn, overUnderValuationPct) rather than a series, so there is no latest, no trend and no percentile to test. The readings also compare two of those scalars to each other, which no single series expresses.",
    ),
  },
  {
    surface: "economic",
    defNumber: 66,
    metricName: "10-Year Real Yield (TIPS)",
    rules: [
      {
        reading: "Deeply negative (real yield well below zero)",
        when: (f) => f.trend !== "rising" && f.latest < 0,
        rule: "The real yield is below zero and the direction reader does not call it rising.",
        source: "Deeply negative (real yield well below zero)",
        gapNote: `Zero is the owner's number. His next band up begins "modestly above zero", so every reading below zero is folded into this one and "well below" is not tested separately.`,
      },
      {
        reading: "Low but positive (real yield modestly above zero)",
        when: (f) =>
          f.trend !== "rising" && f.latest >= 0 && !atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The real yield is at or above zero, the direction reader does not call it rising, and the level has not reached the top ${100 - HIGH_PCT} percent of its trailing ten years.`,
        source: "Low but positive (real yield modestly above zero)",
        gapNote: levelNote(
          `"low but positive" is placed by the owner's own zero edge below it and by the High positive rung above it, which takes the top fifth of the trailing ten years. What is left is this reading, so the word describes the gap between his own two cuts rather than a claim about the last ten years.`,
        ),
      },
      {
        reading: "Rising sharply (real yield climbing fast)",
        when: (f) => f.trend === "rising",
        rule: "The shipped direction reader calls the real yield rising.",
        source: "Rising sharply (real yield climbing fast)",
        gapNote: `This is the owner's only reading that names a direction, so a rising real yield reads here whatever its level, and "sharply" is not tested separately. The three level readings are therefore read on a yield that is not rising.`,
      },
      {
        reading: "High positive (real yield elevated and steady)",
        when: (f) => f.trend === "neutral" && f.latest >= 0 && atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The real yield is at or above zero, the direction reader calls it steady, and the level sits at or above the ${HIGH_PCT}th percentile of its trailing ten years.`,
        source: "High positive (real yield elevated and steady)",
        gapNote: `"Elevated" takes the top fifth of the trailing ten years, the cut the app's own Sector Rotation reader uses for an extreme level. "Steady" is taken at its word, so the rule does not fire on a falling yield. Uncovered on purpose: a real yield at or above zero, in that top fifth, that the reader calls falling, and the same with no direction readable at all.`,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 67,
    metricName: "Net Liquidity ($)",
    rules: [
      {
        reading: "Rising strongly (net liquidity expanding fast)",
        when: (f) => f.trend === "rising" && atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The direction reader calls net liquidity rising and its level sits at or above the ${HIGH_PCT}th percentile of its trailing ten years.`,
        source: "Rising strongly (net liquidity expanding fast)",
        gapNote: RATE_SPLIT_GAP,
      },
      {
        reading: "Rising moderately (net liquidity drifting up)",
        when: (f) => f.trend === "rising" && !atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The direction reader calls net liquidity rising and its level has not reached the top ${100 - HIGH_PCT} percent of its trailing ten years.`,
        source: "Rising moderately (net liquidity drifting up)",
        gapNote: RATE_SPLIT_GAP,
      },
      {
        reading: "Flat (net liquidity steady)",
        when: (f) => f.trend === "neutral",
        rule: "The shipped direction reader calls net liquidity stable.",
        source: "Flat (net liquidity steady)",
        gapNote: `Uncovered on purpose: a series whose direction cannot be read at all, because all five of the owner's readings name a direction.`,
      },
      {
        reading: "Falling moderately (net liquidity draining)",
        when: (f) => f.trend === "falling" && !atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The direction reader calls net liquidity falling and its level has not reached the bottom ${LOW_PCT} percent of its trailing ten years.`,
        source: "Falling moderately (net liquidity draining)",
        gapNote: RATE_SPLIT_GAP,
      },
      {
        reading: "Falling sharply (net liquidity draining heavily)",
        when: (f) => f.trend === "falling" && atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The direction reader calls net liquidity falling and its level sits at or below the ${LOW_PCT}th percentile of its trailing ten years.`,
        source: "Falling sharply (net liquidity draining heavily)",
        gapNote: RATE_SPLIT_GAP,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 68,
    metricName: "S&P 500 Expected Return (building blocks)",
    rules: [
      {
        reading: "High reading with a positive valuation term",
        when: (f) => {
          const p = recordPercentile(f);
          return p !== null && p >= UPPER_THIRD_PCT;
        },
        rule: "The latest expected return sits in the top third of the whole delivered record.",
        source: "High reading with a positive valuation term",
        gapNote: `The owner gives three ordered bands and no cut points, so the record is split in even thirds. The whole delivered record is used rather than the trailing ten years because the owner's middle band names "the long-run average" and the series runs from 2003. The second half of each label, the sign and size of the valuation term, is a component shown beside the metric rather than part of its series, so it is NOT tested.`,
      },
      {
        reading: "Near the long-run average with a small valuation term",
        when: (f) => {
          const p = recordPercentile(f);
          return p !== null && p >= LOWER_THIRD_PCT && p < UPPER_THIRD_PCT;
        },
        rule: "The latest expected return sits in the middle third of the whole delivered record.",
        source: "Near the long-run average with a small valuation term",
        gapNote: `Even thirds of the whole delivered record. A mean plus or minus one standard deviation band was rejected because three outlying years drag the mean up and would park nineteen of the twenty three delivered years in this one band.`,
      },
      {
        reading: "Low reading with a deeply negative valuation term",
        when: (f) => {
          const p = recordPercentile(f);
          return p !== null && p < LOWER_THIRD_PCT;
        },
        rule: "The latest expected return sits in the bottom third of the whole delivered record.",
        source: "Low reading with a deeply negative valuation term",
        gapNote: `Uncovered on purpose: a delivered record of fewer than eight points, which cannot be ranked against itself.`,
      },
    ],
    undetermined: [
      {
        reading: "Partial (a building block is missing)",
        why: "The app marks a reading partial when one of the four blocks is unavailable. The facts carry only the summed series, which cannot tell a complete sum from an incomplete one, so this reading cannot be detected and one of the three level readings will fire instead.",
      },
    ],
  },
  {
    surface: "economic",
    defNumber: 69,
    metricName: "AAII Asset Allocation Survey",
    rules: [
      {
        reading:
          "Stock share far above average with cash near record lows (roughly 72 percent or more in stocks, under 15 percent in cash)",
        when: (f) => f.latest >= 72,
        rule: "The stock share is 72 percent or more.",
        source:
          "Stock share far above average with cash near record lows (roughly 72 percent or more in stocks, under 15 percent in cash)",
        gapNote: `${AAII_CASH_GAP} ${levelNote(
          `the record lows in this label belong to the CASH share, a different series the facts do not carry. The stock share half is placed by the owner's own 72 percent cut.`,
        )}`,
      },
      {
        reading: "Stock share modestly above average with cash below average",
        when: (f) => f.latest > 67 && f.latest < 72,
        rule: "The stock share is above 67 percent and below 72 percent.",
        source: AAII_AVERAGES,
        gapNote: `${AAII_BAND_GAP} ${AAII_CASH_GAP}`,
      },
      {
        reading: "Stock, bond and cash shares all near their long-run averages",
        when: (f) => f.latest >= 57 && f.latest <= 67,
        rule: "The stock share is from 57 to 67 percent, the owner's 62 percent long-run average plus or minus 5 points.",
        source: AAII_AVERAGES,
        gapNote: `${AAII_BAND_GAP} The bond and cash halves of the label are not tested either, because the facts carry the stock share only.`,
      },
      {
        reading: "Stock share below average with cash above average",
        when: (f) => f.latest > 52 && f.latest < 57,
        rule: "The stock share is above 52 percent and below 57 percent.",
        source: AAII_AVERAGES,
        gapNote: `Runs from the owner's own 52 percent cut up to the near-average band. ${AAII_CASH_GAP}`,
      },
      {
        reading:
          "Stock share far below average with cash far above average (roughly 52 percent or less in stocks, over 30 percent in cash)",
        when: (f) => f.latest <= 52,
        rule: "The stock share is 52 percent or less.",
        source:
          "Stock share far below average with cash far above average (roughly 52 percent or less in stocks, over 30 percent in cash)",
        gapNote: AAII_CASH_GAP,
      },
    ],
    undetermined: [],
  },
];
