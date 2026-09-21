// Automatic readings, economic definition files 36 to 55.
//
// The first half of ECONOMIC_RULES_B. The contract every rule in both halves
// obeys, the shared ladders and every quoted sentence are in
// economicBHelpers.ts; economicB.ts joins the two halves back together under
// the name every importer already uses. Nothing here was rewritten when the
// file was split.

import { LEVEL_BY_BAND, levelNote } from "./types";
import type { MetricRules } from "./types";
import {
  HIGH_PCT,
  LOW_PCT,
  SPIKE_PCT,
  atOrAbove,
  atOrBelow,
  inBand,
  inHalfOpen,
  NOT_TESTED_NOTE,
  rate,
  levelLadder,
  SHARP_GAP,
  directionLadder,
  allUndetermined,
  SPREAD_SIGN,
  EXTREME_CUTS,
  SEASONAL_GAP,
  RISING_SPLIT_GAP,
} from "./economicBHelpers";

export const ECONOMIC_RULES_B1: MetricRules[] = [
  {
    surface: "economic",
    defNumber: 36,
    metricName: "Bull-Bear Spread (AAII)",
    rules: [
      {
        reading: "Extreme optimism (bulls far exceed bears)",
        when: (f) => f.latest > 0 && atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The spread is positive and sits at or above the ${HIGH_PCT}th percentile of its trailing ten years.`,
        source: SPREAD_SIGN,
        gapNote: `The owner gives the sign but no number for "far exceed". ${EXTREME_CUTS}`,
      },
      {
        reading: "Mild optimism (bulls modestly exceed bears)",
        when: (f) => f.latest > 0 && !atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The spread is positive and has not reached the ${HIGH_PCT}th percentile of its trailing ten years.`,
        source: SPREAD_SIGN,
      },
      {
        reading: "Mild pessimism (bears modestly exceed bulls)",
        when: (f) => f.latest <= 0 && !atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The spread is zero or negative and has not reached the bottom ${LOW_PCT} percent of its trailing ten years.`,
        source: SPREAD_SIGN,
        gapNote:
          "A spread of exactly zero means neither camp exceeds the other, which none of the four labels describes. It is folded into the mild pessimism band because at zero the bulls do not exceed the bears.",
      },
      {
        reading: "Extreme pessimism (bears far exceed bulls)",
        when: (f) => f.latest <= 0 && atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The spread is zero or negative and sits at or below the ${LOW_PCT}th percentile of its trailing ten years.`,
        source: SPREAD_SIGN,
        gapNote: `The owner gives the sign but no number for "far exceed". ${EXTREME_CUTS} ${levelNote(
          `the extreme this label names is the BOTTOM of the series, not the top, and the rule already requires the bottom fifth of the trailing ten years.`,
        )}`,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 37,
    metricName: "VIX",
    rules: levelLadder([
      "Low (calm markets, below typical levels)",
      "Moderate (normal volatility)",
      "Elevated (rising fear)",
      "Spiking (acute fear, crisis levels)",
    ]),
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 38,
    metricName: "Bank of America Global Fund Manager Survey (Cash Allocation)",
    rules: [
      {
        reading: "High cash (managers defensive, well above average)",
        when: (f) => atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The cash share sits at or above the ${HIGH_PCT}th percentile of its trailing ten years.`,
        source: "High cash (managers defensive, well above average)",
        gapNote: `The owner's four bands are two steps above the average and two below it. The average is taken as the median of the trailing ten years, so the inner split is the 50th percentile, and "well above" and "well below" take the top and bottom fifth, the cuts the app's own Sector Rotation reader uses for an extreme level.`,
      },
      {
        reading: "Above average cash (modestly cautious)",
        when: (f) => inHalfOpen(f.percentile10y, 50, HIGH_PCT),
        rule: `The cash share sits at or above the 50th percentile of its trailing ten years and below the ${HIGH_PCT}th.`,
        source: "Above average cash (modestly cautious)",
        gapNote: `The average is taken as the median of the trailing ten years, so this band runs from the 50th percentile up to the ${HIGH_PCT}th.`,
      },
      {
        reading: "Below average cash (modestly confident)",
        when: (f) => inHalfOpen(f.percentile10y, LOW_PCT, 50),
        rule: `The cash share sits at or above the ${LOW_PCT}th percentile of its trailing ten years and below the 50th.`,
        source: "Below average cash (modestly confident)",
        gapNote: `The average is taken as the median of the trailing ten years, so this band runs from the ${LOW_PCT}th percentile up to the 50th.`,
      },
      {
        reading: "Low cash (managers fully invested, well below average)",
        when: (f) => f.percentile10y !== null && f.percentile10y < LOW_PCT,
        rule: `The cash share sits below the ${LOW_PCT}th percentile of its trailing ten years.`,
        source: "Low cash (managers fully invested, well below average)",
        gapNote: `"Well below average" takes the bottom fifth of the trailing ten years, the cut the app's own Sector Rotation reader uses for an extreme level. Uncovered on purpose: a series too short for a ten year percentile, because every one of the owner's four labels is placed against the average.`,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 39,
    metricName: "Copper/Gold Ratio",
    rules: directionLadder([
      "Rising (copper outperforming gold)",
      "Stable at a high level",
      "Falling (gold outperforming copper)",
      "Falling sharply (gold strongly outperforming)",
    ]),
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 40,
    metricName: "AUD/JPY Exchange Rate",
    rules: directionLadder([
      "Rising (risk-on, Australian dollar gaining)",
      "Stable at a high level",
      "Falling (risk-off, yen gaining)",
      "Falling sharply (acute risk-off, yen surging)",
    ]),
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 41,
    metricName: "Gold/Silver Ratio",
    rules: [
      {
        reading: "High (gold strongly outperforming silver)",
        when: (f) => f.trend !== "rising" && f.trend !== "falling" && atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The direction reader does not call the ratio rising or falling and its level sits at or above the ${HIGH_PCT}th percentile of its trailing ten years.`,
        source: "High (gold strongly outperforming silver)",
        gapNote: `The owner's two end rungs are level statements and his two middle rungs are direction statements, so the direction decides first and the level rungs take the ratio the reader calls stable. High and Low then take the top and bottom fifth of the trailing ten years, the cuts the app's own Sector Rotation reader uses for an extreme level.`,
      },
      {
        reading: "Rising (gold gaining on silver)",
        when: (f) => f.trend === "rising",
        rule: "The shipped direction reader calls the ratio rising, which is gold gaining on silver.",
        source: "Rising (gold gaining on silver)",
      },
      {
        reading: "Falling (silver gaining on gold)",
        when: (f) => f.trend === "falling",
        rule: "The shipped direction reader calls the ratio falling, which is silver gaining on gold.",
        source: "Falling (silver gaining on gold)",
      },
      {
        reading: "Low (silver strongly outperforming gold)",
        when: (f) => f.trend !== "rising" && f.trend !== "falling" && atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The direction reader does not call the ratio rising or falling and its level sits at or below the ${LOW_PCT}th percentile of its trailing ten years.`,
        source: "Low (silver strongly outperforming gold)",
        gapNote: `Low takes the bottom fifth of the trailing ten years, the cut the app's own Sector Rotation reader uses for an extreme level. Uncovered on purpose: a stable ratio in the middle three fifths of its range, which none of the owner's four labels describes.`,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 42,
    metricName: "Equity Risk Premium (implied)",
    rules: [
      {
        reading: "High (generous premium, stocks cheap vs bonds)",
        when: (f) => f.latest >= 0 && atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The premium is not negative and sits at or above the ${HIGH_PCT}th percentile of its trailing ten years.`,
        source:
          "The premium is interpreted as a valuation and relative-attractiveness gauge, with a high premium meaning stocks offer generous compensation for their risk and appear attractive, and a low premium meaning stocks offer little extra reward and appear expensive relative to bonds.",
        gapNote: `Zero is the owner's only number here, and it separates the bottom rung. High and Low take the top and bottom fifth of the trailing ten years, the cuts the app's own Sector Rotation reader uses for an extreme level.`,
      },
      {
        reading: "Moderate (normal premium)",
        when: (f) => f.latest >= 0 && inBand(f.percentile10y, LOW_PCT, HIGH_PCT),
        rule: `The premium is not negative and sits between the ${LOW_PCT}th and ${HIGH_PCT}th percentiles of its trailing ten years.`,
        source: "Moderate (normal premium)",
      },
      {
        reading: "Low (thin premium, stocks expensive vs bonds)",
        when: (f) => f.latest >= 0 && atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The premium is not negative and sits at or below the ${LOW_PCT}th percentile of its trailing ten years.`,
        source: "Low (thin premium, stocks expensive vs bonds)",
        gapNote: `Uncovered on purpose: a premium at or above zero on a series too short for a ten year percentile, because the three non-negative bands are all placed against its own range.`,
      },
      {
        reading: "Negative or very low (stocks offer little or no premium)",
        when: (f) => f.latest < 0,
        rule: "The premium is below zero.",
        source: "Negative or very low (stocks offer little or no premium)",
        gapNote: `The owner gives "negative" and no number for "very low", so the rule fires on a negative premium only. A premium that is thin but still positive reads as the Low rung above. ${LEVEL_BY_BAND} Zero is the owner's own number, and a premium below it is little or no premium whatever the last ten years held.`,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 43,
    metricName: "Sovereign Credit Rating",
    rules: [],
    undetermined: allUndetermined(
      [
        "High and stable (top-tier rating, stable outlook)",
        "High with negative outlook (top rating, deteriorating trajectory)",
        "Downgrade within investment grade",
        "Downgrade to or near speculative grade",
      ],
      "Every reading of this metric is a letter grade, an agency outlook, or a rating action. None of those is a number on a time series, and the payload carries no series for this metric at all.",
    ),
  },
  {
    surface: "economic",
    defNumber: 44,
    metricName: "Bank Net Interest Margin",
    rules: [
      {
        reading: "Widening (margins expanding)",
        when: (f) => f.trend === "rising",
        rule: "The shipped direction reader calls the margin rising.",
        source: "Widening (margins expanding)",
      },
      {
        reading: "Stable at healthy levels",
        when: (f) => f.trend === "neutral" && !atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The direction reader calls the margin stable and its level has not reached the bottom ${LOW_PCT} percent of its trailing ten years.`,
        source: "Stable at healthy levels",
        gapNote: `The owner does not say what level counts as healthy, so the rule tests only that the margin is stable and is not sitting in the bottom fifth of its trailing ten years, because a margin stable at a ten year low is not healthy. The owner should rule on what healthy means here. Uncovered on purpose: a margin the reader calls stable inside that bottom fifth, and a margin whose direction cannot be read at all.`,
      },
      {
        reading: "Compressing (margins narrowing)",
        when: (f) => f.trend === "falling" && !atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The direction reader calls the margin falling and its level has not reached the bottom ${LOW_PCT} percent of its trailing ten years.`,
        source: "Compressing (margins narrowing)",
        gapNote: SHARP_GAP,
      },
      {
        reading: "Sharply compressing (margins squeezed hard)",
        when: (f) => f.trend === "falling" && atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The direction reader calls the margin falling and its level sits at or below the ${LOW_PCT}th percentile of its trailing ten years.`,
        source: "Sharply compressing (margins squeezed hard)",
        gapNote: SHARP_GAP,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 45,
    metricName: "30-Year Mortgage Rate",
    rules: [
      {
        reading: "Falling (rates declining, affordability improving)",
        when: (f) => f.trend === "falling",
        rule: "The shipped direction reader calls the rate falling.",
        source: "Falling (rates declining, affordability improving)",
      },
      {
        reading: "Low and stable (rates steady at affordable levels)",
        when: (f) => f.trend === "neutral" && atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The direction reader calls the rate stable and its level sits at or below the ${LOW_PCT}th percentile of its trailing ten years.`,
        source: "Low and stable (rates steady at affordable levels)",
        gapNote: `The owner's only stable reading names a low level, so the rule requires the bottom fifth of the trailing ten years. Uncovered on purpose: a rate the reader calls stable above that bottom fifth, and a rate whose direction cannot be read at all. Neither has a reading in the owner's table.`,
      },
      {
        reading: "Rising (rates climbing, affordability deteriorating)",
        when: (f) => f.trend === "rising" && !atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The direction reader calls the rate rising and its level has not reached the top ${100 - HIGH_PCT} percent of its trailing ten years.`,
        source: "Rising (rates climbing, affordability deteriorating)",
        gapNote: RISING_SPLIT_GAP,
      },
      {
        reading: "Rising sharply (rates spiking, affordability collapsing)",
        when: (f) => f.trend === "rising" && atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The direction reader calls the rate rising and its level sits at or above the ${HIGH_PCT}th percentile of its trailing ten years.`,
        source: "Rising sharply (rates spiking, affordability collapsing)",
        gapNote: RISING_SPLIT_GAP,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 46,
    metricName: "US Crude Oil Inventory",
    rules: [
      {
        reading: "Drawing down sharply (inventories falling well below seasonal norms)",
        when: (f) => f.trend === "falling" && atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The direction reader calls inventories falling and the level sits at or below the ${LOW_PCT}th percentile of its trailing ten years.`,
        source: "Drawing down sharply (inventories falling well below seasonal norms)",
        gapNote: `${SEASONAL_GAP} The owner should rule on whether that is an acceptable stand-in.`,
      },
      {
        reading: "Drawing down moderately (inventories declining)",
        when: (f) => f.trend === "falling" && !atOrBelow(f.percentile10y, LOW_PCT),
        rule: `The direction reader calls inventories falling and the level has not reached the bottom ${LOW_PCT} percent of its trailing ten years.`,
        source: "Drawing down moderately (inventories declining)",
        gapNote: `Uncovered on purpose: inventories the direction reader calls stable, and inventories whose direction cannot be read at all. All four of the owner's readings are a draw or a build, so neither has a reading, which is a hole in his table rather than a rule that failed.`,
      },
      {
        reading: "Building moderately (inventories rising)",
        when: (f) => f.trend === "rising" && !atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The direction reader calls inventories rising and the level has not reached the top ${100 - HIGH_PCT} percent of its trailing ten years.`,
        source: "Building moderately (inventories rising)",
      },
      {
        reading: "Building sharply (inventories rising well above seasonal norms)",
        when: (f) => f.trend === "rising" && atOrAbove(f.percentile10y, HIGH_PCT),
        rule: `The direction reader calls inventories rising and the level sits at or above the ${HIGH_PCT}th percentile of its trailing ten years.`,
        source: "Building sharply (inventories rising well above seasonal norms)",
        gapNote: SEASONAL_GAP,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 47,
    metricName: "China Monthly Steel Production",
    rules: directionLadder([
      "Rising strongly (production accelerating)",
      "Stable at high levels",
      "Declining (production falling)",
      "Falling sharply (production contracting)",
    ]),
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 48,
    metricName: "Iron Ore Price Index",
    rules: directionLadder(
      [
        "Rising strongly (price climbing well above prior range)",
        "Stable at high levels",
        "Declining (price falling)",
        "Falling sharply (price collapsing)",
      ],
      `The parenthetical "well above prior range" is not tested separately: this is the owner's only rising reading, so a rising price reads here whatever its level.`,
    ),
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 49,
    metricName: "US Population YoY %",
    rules: [
      {
        reading: "Strong growth (above 1% annually)",
        when: (f) => rate(f) > 1,
        rule: "Population growth is above 1 percent a year.",
        source: "Strong growth (above 1% annually)",
      },
      {
        reading: "Moderate growth (0.5 to 1% annually)",
        when: (f) => rate(f) >= 0.5 && rate(f) <= 1,
        rule: "Population growth is from 0.5 to 1 percent a year, both ends included.",
        source: "Moderate growth (0.5 to 1% annually)",
        gapNote: `The owner's bands share the 0.5 endpoint with the slow band. It is assigned here, to the higher band. The 1 endpoint is unambiguous because the strong band is written as above 1 percent.`,
      },
      {
        reading: "Slow growth (0 to 0.5% annually)",
        when: (f) => rate(f) >= 0 && rate(f) < 0.5,
        rule: "Population growth is from zero up to but not including 0.5 percent a year.",
        source: "Slow growth (0 to 0.5% annually)",
      },
      {
        reading: "Declining (negative growth, population shrinking)",
        when: (f) => rate(f) < 0,
        rule: "Population growth is below zero.",
        source: "Declining (negative growth, population shrinking)",
        gapNote: `${NOT_TESTED_NOTE} A growth rate that is negative but climbing is still a shrinking population.`,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 51,
    metricName: "Shiller CAPE (PE10)",
    rules: [],
    undetermined: allUndetermined(
      [
        "Low (cheap vs history)",
        "Around the long-run mean",
        "High (expensive vs history)",
        "Extreme (near historical highs)",
      ],
      "All four readings are placed against the full CAPE record, and the delivered series starts in 2012 and holds no month below 20.55. Neither the long-run mean nor a level that is cheap against history can be computed from these points, and a percentile of the delivered ten years would call a CAPE of 21 cheap when it is above the full record's mean. The owner should either state the CAPE level for each band or the app should deliver the full record.",
    ),
  },
  {
    surface: "economic",
    defNumber: 52,
    metricName: "Global Economic Policy Uncertainty",
    rules: levelLadder([
      "Low (stable global policy)",
      "Moderate (normal uncertainty)",
      "High (elevated global uncertainty)",
      "Spiking (policy shock)",
    ]),
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 53,
    metricName: "US Economic Policy Uncertainty",
    rules: levelLadder([
      "Low (stable US policy)",
      "Moderate (normal uncertainty)",
      "High (elevated US uncertainty)",
      "Spiking (policy shock)",
    ]),
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 54,
    metricName: "Geopolitical Risk Index",
    rules: levelLadder([
      "Low (calm geopolitics)",
      "Moderate (normal tension)",
      "High (elevated geopolitical risk)",
      "Spiking (conflict shock)",
    ]),
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 55,
    metricName: "S&P 500 / Real M2 Normalised",
    rules: [
      {
        reading: "Rising steadily (equities outpacing real money)",
        when: (f) => f.trend === "rising" && !atOrAbove(f.percentile10y, SPIKE_PCT),
        rule: `The direction reader calls the index rising and its level has not reached the ${SPIKE_PCT}th percentile of its trailing ten years.`,
        source: "Rising steadily (equities outpacing real money)",
        gapNote: `The owner's fourth reading is a level statement that can hold while the index is rising, falling or flat, so the level is tested first and the three direction readings take everything below it.`,
      },
      {
        reading: "Flat or gently rising (market tracking real money)",
        when: (f) => f.trend === "neutral" && !atOrAbove(f.percentile10y, SPIKE_PCT),
        rule: `The direction reader calls the index stable, which is where a gentle rise inside the reader's neutral band lands, and its level has not reached the ${SPIKE_PCT}th percentile of its trailing ten years.`,
        source: "Flat or gently rising (market tracking real money)",
      },
      {
        reading: "Falling while nominal index rises (liquidity-driven advance)",
        when: (f) => f.trend === "falling" && !atOrAbove(f.percentile10y, SPIKE_PCT),
        rule: `The direction reader calls the index falling and its level has not reached the ${SPIKE_PCT}th percentile of its trailing ten years.`,
        source: "Falling while nominal index rises (liquidity-driven advance)",
        gapNote: `The second half of the label, that the nominal S&P 500 is rising at the same time, is a different series and is NOT tested. The rule fires on a falling ratio alone, so it would also fire in the rare case where both the ratio and the nominal index are falling. The owner should rule on this.`,
      },
      {
        reading: "Extended far above historical range (rich valuation)",
        when: (f) => atOrAbove(f.percentile10y, SPIKE_PCT),
        rule: `The level sits at or above the ${SPIKE_PCT}th percentile of its trailing ten years.`,
        source: "Extended far above historical range (rich valuation)",
        gapNote: `"Far above historical range" takes the top twentieth of the trailing ten years. That cut is not the owner's number and should be ruled on. The delivered series is rebased to 100 at its own start, so its range is the delivered record and nothing longer. Uncovered on purpose: a series below that top twentieth whose direction cannot be read at all.`,
      },
    ],
    undetermined: [],
  },
];
