// Automatic readings, economic definition files 01 to 18.
//
// The first half of ECONOMIC_RULES_A. The contract every rule in both halves
// obeys, and the helpers they share, are in economicAHelpers.ts;
// economicA.ts joins the two halves back together under the name every
// importer already uses. Nothing here was rewritten when the file was split.

import { LEVEL_BY_BAND } from "./types";
import type { MetricRules } from "./types";
import {
  atLow,
  atHigh,
  flat,
  dollarSharpRise,
  inUpperHalf,
} from "./economicAHelpers";

/**
 * Definition 11's series already IS a year-over-year percent, so a movement
 * word inside one of its parentheticals names the owner's own band on that
 * percent, exactly as on definitions 8, 9, 10, 20, 26 and 29. The note says so
 * where the owner can read it, and direction.test.ts reads the marker.
 */
const WAGES_NOT_TESTED =
  "Direction word not tested: the delivered series is already the year-over-year percent change in real average hourly earnings, so the movement word in the parenthetical describes that percent's own band and not the slope of the delivered line.";

export const ECONOMIC_RULES_A1: MetricRules[] = [
  {
    surface: "economic",
    defNumber: 1,
    metricName: "Real GDP Growth",
    rules: [
      {
        reading: "Above 3% and accelerating",
        when: (f) => f.latest > 3 && f.trend !== "falling",
        rule: "Growth above 3 percent, and not decelerating.",
        source: "Above 3% and accelerating",
        gapNote:
          "A neutral direction, or one the reader could not call, is accepted because the level is inside the label's own band of above 3 percent. Uncovered on purpose: growth above 3 percent while decelerating.",
      },
      {
        reading: "Around 2% (trend growth)",
        when: (f) => f.latest >= 2 && f.latest <= 3,
        rule: "Growth from 2 to 3 percent.",
        source: "Around 2% (trend growth)",
        gapNote:
          "Around 2% is given the band 2 to 3 percent, which meets the 0% to 2% reading below it and the above 3% reading above it.",
      },
      {
        reading: "0% to 2% and decelerating",
        when: (f) => f.latest >= 0 && f.latest < 2 && f.trend !== "rising",
        rule: "Growth from 0 up to 2 percent, and not accelerating.",
        source: "0% to 2% and decelerating",
        gapNote:
          "A neutral direction, or one the reader could not call, is accepted because the level is inside the label's own band of 0 to 2 percent. Uncovered on purpose: growth from 0 to 2 percent while accelerating, and a single negative quarter, which the contraction reading excludes by asking for two.",
      },
      {
        reading: "Negative (two or more quarters)",
        when: (f) => f.latest < 0 && f.consecutiveNegative >= 2,
        rule: "Growth negative, and negative for two or more quarters in a row.",
        source: "Negative (two or more quarters)",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 2,
    metricName: "Total Nonfarm Payrolls",
    rules: [],
    undetermined: [
      {
        reading: "Unemployment falling below 4% with strong monthly payroll gains above 200,000",
        why: "The label leads with an unemployment level and direction, and this metric carries Total Nonfarm Payrolls, a different series. The payroll half alone cannot establish the label, so firing on it would put an unemployment claim on the page that nothing here measured.",
      },
      {
        reading:
          "Unemployment stable around 4 to 5% with moderate monthly payroll gains between 100,000 and 200,000",
        why: "The label leads with an unemployment level, which this metric's series cannot test. A payroll gain inside the owner's band says nothing about whether unemployment is in the 4 to 5 percent band.",
      },
      {
        reading: "Unemployment rising from a recent low by 0.5 percentage points or more",
        why: "The whole reading is about the unemployment rate, which is a different series from this metric's Total Nonfarm Payrolls. It carries no payroll clause to test.",
      },
      {
        reading: "Unemployment above 6% with payroll losses",
        why: "The label leads with an unemployment level above 6 percent, which this series cannot test. A single month of payroll losses is common at 4 percent unemployment, so firing on the payroll half alone would put a recession reading on a healthy labor market.",
      },
    ],
  },
  {
    surface: "economic",
    defNumber: 3,
    metricName: "CPI YoY Inflation",
    rules: [
      {
        reading: "Above 4% and rising",
        when: (f) => f.latest > 4 && f.trend !== "falling",
        rule: "Inflation above 4 percent, and not falling.",
        source: "Above 4% and rising",
        gapNote:
          "A neutral direction, or one the reader could not call, is accepted because the level is inside the label's own band of above 4 percent. Uncovered on purpose: inflation above 4 percent while falling, which no label of this metric names.",
      },
      {
        reading: "2 to 3% and stable",
        when: (f) => f.latest >= 1 && f.latest <= 4 && flat(f),
        rule: "Inflation from 1 to 4 percent and neither rising nor falling.",
        source: "2 to 3% and stable",
        gapNote:
          "The band is widened from 2 to 3 out to 1 to 4, into territory no other label names. The word stable is binding, because the sibling reading at the same band differs only by direction, so a rising or falling series never reads here. Uncovered on purpose: inflation from 1 to 4 percent while rising, the case that used to report as stable.",
      },
      {
        reading: "2 to 3% and falling",
        when: (f) => f.latest >= 1 && f.latest <= 4 && f.trend === "falling",
        rule: "Inflation from 1 to 4 percent and falling.",
        source: "2 to 3% and falling",
        gapNote:
          "The band is widened from 2 to 3 out to 1 to 4, to match the stable reading it is split from. The word falling is binding, so an actual decline is required.",
      },
      {
        reading: "Below 1% or negative (deflation)",
        when: (f) => f.latest < 1,
        rule: "Inflation below 1 percent.",
        source: "Below 1% or negative (deflation)",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 4,
    metricName: "PPI YoY Inflation",
    rules: [
      {
        reading: "Above 5% and rising",
        when: (f) => f.latest > 5 && f.trend !== "falling",
        rule: "Producer price inflation above 5 percent, and not falling.",
        source: "Above 5% and rising",
        gapNote:
          "A neutral direction, or one the reader could not call, is accepted because the level is inside the label's own band of above 5 percent. A falling reading above 5 percent goes to the next reading, whose label offers falling as its own alternative.",
      },
      {
        reading: "1 to 3% (stable)",
        when: (f) => f.latest >= 1 && f.latest <= 5 && flat(f),
        rule: "Producer price inflation from 1 to 5 percent, and neither rising nor falling.",
        source: "1 to 3% (stable)",
        gapNote:
          "The band is widened from 1 to 3 up to 1 to 5, into territory no other label names. The word stable is binding. Uncovered on purpose: producer price inflation from 1 to 5 percent while rising.",
      },
      {
        reading: "Near zero or falling",
        when: (f) => (f.latest < 1 || f.trend === "falling") && f.consecutiveNegative < 3,
        rule: "Producer price inflation below 1 percent, or falling at any level, with fewer than three negative months in a row.",
        source: "Near zero or falling",
        gapNote:
          "Direction word not tested: the label is the owner's own either-or, and the near zero half is a band on a year over year rate that carries no movement claim, so a reading below 1 percent holds whichever way the growth rate is moving. The falling half IS tested, as an actual decline at any level. The reading also holds a negative stretch shorter than three months.",
      },
      {
        reading: "Negative for 3 or more months",
        when: (f) => f.latest < 0 && f.consecutiveNegative >= 3,
        rule: "Producer price inflation negative for three or more months in a row.",
        source: "Negative for 3 or more months",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 5,
    metricName: "M2 Money Supply ($B)",
    reads: "yoyChangePct",
    rules: [
      {
        reading: "Year-over-year growth above 10% (rapid expansion)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct > 10,
        rule: "M2 up more than 10 percent on the year.",
        source: "Year-over-year growth above 10% (rapid expansion)",
      },
      {
        reading: "Year-over-year growth 4 to 6% (moderate, sustainable)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct >= 4 && f.yoyChangePct <= 10,
        rule: "M2 up 4 to 10 percent on the year.",
        source: "Year-over-year growth 4 to 6% (moderate, sustainable)",
        gapNote:
          "The band is widened from 4 to 6 up to 4 to 10, so it meets the above 10% reading above it.",
      },
      {
        reading: "Year-over-year growth 0 to 4% (slow)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct >= 0 && f.yoyChangePct < 4,
        rule: "M2 up 0 to 4 percent on the year.",
        source: "Year-over-year growth 0 to 4% (slow)",
      },
      {
        reading: "Year-over-year contraction (negative growth, rare)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct < 0,
        rule: "M2 lower than a year earlier.",
        source: "Year-over-year contraction (negative growth, rare)",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 6,
    metricName: "10Y - 2Y Treasury Spread",
    rules: [
      {
        reading: "Steeply upward sloping (10-year well above short rates, gap above 1.5 points)",
        when: (f) => f.latest > 1.5,
        rule: "Spread above 1.5 percentage points.",
        source: "gap above 1.5 points",
      },
      {
        reading: "Moderately upward sloping (gap between 0 and 1.5 points)",
        when: (f) => f.latest > 0.25 && f.latest <= 1.5,
        rule: "Spread from 0.25 up to 1.5 percentage points.",
        source: "gap between 0 and 1.5 points",
        gapNote:
          "The lower edge is moved from 0 to 0.25 so the flat reading has a band of its own. Without it the flat reading sits inside this one and could never fire.",
      },
      {
        reading: "Flat (short and long rates nearly equal)",
        when: (f) => f.latest >= 0 && f.latest <= 0.25,
        rule: "Spread from 0 to 0.25 percentage points.",
        source: "Flat (short and long rates nearly equal)",
        gapNote:
          "The word flat here is the shape of the curve, which the label's own parenthetical defines as short and long rates nearly equal, so it is a level test and the direction of the series never contradicts it. The owner's What it means gives no number, so nearly equal is given 0 to 0.25 percentage points, a quarter point being one policy step. This is the one band taken from territory another label names, because the owner's Moderately upward sloping runs from 0 and would otherwise leave this reading no room. The upper edge is inclusive here and exclusive there, so exactly one reading fires at 0.25. The lower edge stays at zero because the owner defines inverted as short rates above long rates, a negative spread.",
      },
      {
        reading: "Inverted (short rates above long rates)",
        when: (f) => f.latest < 0,
        rule: "Spread below zero.",
        source: "Inverted (short rates above long rates)",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 7,
    metricName: "Trade-Weighted USD Index",
    rules: [
      {
        reading: "Rising sharply (dollar strengthening more than 5% over six months)",
        when: (f) => dollarSharpRise(f) && f.trend !== "falling",
        rule: "Index up more than 5 percent over six months, and not falling.",
        source: "dollar strengthening more than 5% over six months",
        gapNote:
          "A neutral direction, or one the reader could not call, is accepted because the level of the move is inside the label's own band of more than 5 percent over six months.",
      },
      {
        reading: "Rising moderately (dollar gradually appreciating)",
        when: (f) => !dollarSharpRise(f) && f.trend === "rising",
        rule: "Index rising, but by 5 percent or less over six months.",
        source: "Rising moderately (dollar gradually appreciating)",
      },
      {
        reading: "Stable (dollar trading in a narrow range)",
        when: (f) => !dollarSharpRise(f) && flat(f),
        rule: "Index neither rising nor falling, and not up more than 5 percent over six months.",
        source: "Stable (dollar trading in a narrow range)",
        gapNote:
          "A narrow range is a trend claim with no number of its own, so the word stable is binding and only a flat direction reads here. The sharp move is excluded as well, since a rise of more than 5 percent is not a narrow range whatever the direction reader says.",
      },
      {
        reading: "Falling (dollar weakening)",
        when: (f) => f.trend === "falling",
        rule: "Index falling.",
        source: "Falling (dollar weakening)",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 8,
    metricName: "Real Exports YoY %",
    rules: [
      {
        reading: "Rising strongly (above 4% year over year)",
        when: (f) => f.latest > 4,
        rule: "Real exports up more than 4 percent on the year.",
        source: "above 4% year over year",
        gapNote:
          "Direction word not tested: this series already is the year over year percent, so the owner's own band of above 4 percent IS the rise. Exports up more than 4 percent on the year are rising strongly whatever the growth rate itself did over the last six months.",
      },
      {
        reading: "Rising moderately (1 to 4% year over year)",
        when: (f) => f.latest >= 1 && f.latest <= 4,
        rule: "Real exports up 1 to 4 percent on the year.",
        source: "1 to 4% year over year",
        gapNote:
          "Direction word not tested: this series already is the year over year percent, so the owner's own band of 1 to 4 percent IS the rise, and the six month direction of the growth rate is a different question.",
      },
      {
        reading: "Flat (near zero growth)",
        when: (f) => f.latest >= 0 && f.latest < 1,
        rule: "Real exports up 0 to 1 percent on the year.",
        source: "Flat (near zero growth)",
        gapNote:
          "Direction word not tested: flat here IS the band, near zero growth on a year over year series. Near zero is given 0 to 1 percent, meeting the 1 to 4 reading above it and the negative reading below it.",
      },
      {
        reading: "Falling (negative year over year)",
        when: (f) => f.latest < 0,
        rule: "Real exports lower than a year earlier.",
        source: "Falling (negative year over year)",
        gapNote:
          "Direction word not tested: this series already is the year over year percent, so a negative reading IS exports falling. The direction reader measures the growth rate, not the level of exports.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 9,
    metricName: "Import Price Index",
    reads: "yoyChangePct",
    rules: [
      {
        reading: "Falling (negative year over year)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct < 0,
        rule: "Import prices lower than a year earlier.",
        source: "Falling (negative year over year)",
        gapNote:
          "Direction word not tested: the reading is the year over year percent of the index, so a negative year change IS import prices falling. The direction reader measures the index over six months, a different horizon from the owner's own band.",
      },
      {
        reading: "Stable (near flat)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct >= 0 && f.yoyChangePct < 1,
        rule: "Import prices up 0 to 1 percent on the year.",
        source: "Stable (near flat)",
        gapNote:
          "Direction word not tested: near flat here IS the band, a year over year change close to zero. Near flat is given 0 to 1 percent, meeting the 1 to 4 reading above it and the negative reading below it.",
      },
      {
        reading: "Rising moderately (1 to 4% year over year)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct >= 1 && f.yoyChangePct <= 4,
        rule: "Import prices up 1 to 4 percent on the year.",
        source: "1 to 4% year over year",
        gapNote:
          "Direction word not tested: the owner's own band of 1 to 4 percent on the year IS the rise. The six month direction of the index is a different horizon and does not contradict it.",
      },
      {
        reading: "Rising sharply (above 4% year over year)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct > 4,
        rule: "Import prices up more than 4 percent on the year.",
        source: "above 4% year over year",
        gapNote:
          "Direction word not tested: the owner's own band of above 4 percent on the year IS the sharp rise. The six month direction of the index is a different horizon and does not contradict it.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 10,
    metricName: "Residential Fixed Investment ($B)",
    reads: "yoyChangePct",
    rules: [
      {
        reading: "Rising strongly (above 5% year over year)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct > 5,
        rule: "Housing investment up more than 5 percent on the year.",
        source: "above 5% year over year",
        gapNote:
          "Direction word not tested: the reading is the year over year percent of the series, so the owner's own band of above 5 percent IS the strong rise. The six month direction of the level is a different horizon.",
      },
      {
        reading: "Rising moderately (1 to 5% year over year)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct >= 1 && f.yoyChangePct <= 5,
        rule: "Housing investment up 1 to 5 percent on the year.",
        source: "1 to 5% year over year",
        gapNote:
          "Direction word not tested: the owner's own band of 1 to 5 percent on the year IS the moderate rise. The six month direction of the level is a different horizon.",
      },
      {
        reading: "Flat (near zero growth)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct >= 0 && f.yoyChangePct < 1,
        rule: "Housing investment up 0 to 1 percent on the year.",
        source: "Flat (near zero growth)",
        gapNote:
          "Direction word not tested: flat here IS the band, near zero growth on the year. Near zero is given 0 to 1 percent, meeting the 1 to 5 reading above it and the negative reading below it.",
      },
      {
        reading: "Falling (negative year over year)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct < 0,
        rule: "Housing investment lower than a year earlier.",
        source: "Falling (negative year over year)",
        gapNote:
          "Direction word not tested: a negative year change IS housing investment falling. The direction reader measures the level over six months, a different horizon from the owner's own band.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 11,
    metricName: "Real Avg Hourly Earnings YoY %",
    rules: [
      {
        reading: "Strongly positive (real wages rising above 1.5%)",
        when: (f) => f.latest > 1.5,
        rule: "Real wages up more than 1.5 percent on the year.",
        source: "real wages rising above 1.5%",
        gapNote: `${WAGES_NOT_TESTED} "rising above 1.5%" is the owner's own band on that percent, and real wages up more than 1.5 percent on the year ARE rising, whichever way that percent is itself moving over six months.`,
      },
      {
        reading: "Mildly positive (real wages flat to slightly up, 0 to 1.5%)",
        when: (f) => f.latest >= 0 && f.latest <= 1.5,
        rule: "Real wages up 0 to 1.5 percent on the year.",
        source: "real wages flat to slightly up, 0 to 1.5%",
        gapNote: `${WAGES_NOT_TESTED} "flat to slightly up" is the owner's own 0 to 1.5 band on that percent, and the words name the band rather than the slope of the delivered line.`,
      },
      {
        reading: "Slightly negative (prices growing modestly faster than wages)",
        when: (f) => f.latest < 0 && f.latest >= -1.5,
        rule: "Real wages down by up to 1.5 percent on the year.",
        source: "Slightly negative (prices growing modestly faster than wages)",
        gapNote:
          "The owner numbers only the positive side, 0 to 1.5 and above 1.5. The two negative readings are given the mirror of those bands, so slightly negative runs from 0 down to -1.5 percent and strongly negative sits below -1.5 percent.",
      },
      {
        reading: "Strongly negative (prices growing well above wages)",
        when: (f) => f.latest < -1.5,
        rule: "Real wages down more than 1.5 percent on the year.",
        source: "Strongly negative (prices growing well above wages)",
        gapNote:
          "Mirror of the owner's 1.5 percent edge on the positive side, since no number is given for the negative side.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 12,
    metricName: "Consumer Sentiment (UMich)",
    rules: [
      {
        reading: "High and rising (well above the long-run average)",
        when: (f) => f.trend === "rising" && atHigh(f),
        rule: "Sentiment rising, with the level in the top fifth of its trailing ten years.",
        source: "High and rising (well above the long-run average)",
        gapNote:
          "The owner gives no number for the long-run average, so well above it is read as the top fifth of the trailing ten years, the app's own high-level band.",
      },
      {
        reading: "Moderate and stable (near the long-run average)",
        when: (f) => flat(f) && !atLow(f) && !atHigh(f),
        rule: "Sentiment neither rising nor falling, with the level in the middle three fifths of its trailing ten years.",
        source: "Moderate and stable (near the long-run average)",
        gapNote:
          "The word stable is binding, so only a flat direction reads here. Near the long-run average is read as the middle of the trailing ten years, since the top fifth and the bottom fifth are the bands the other readings name. Uncovered on purpose: a steady level in the top fifth, and sentiment rising while the level is not in the top fifth.",
      },
      {
        reading: "Declining (falling from prior levels)",
        when: (f) => f.trend === "falling" && !atLow(f),
        rule: "Sentiment falling, with the level above the bottom fifth of its trailing ten years.",
        source: "Declining (falling from prior levels)",
        gapNote:
          "A falling reading that is already in the bottom fifth goes to the Low reading instead, because the owner describes that one as the deeply depressed state rather than the move into it.",
      },
      {
        reading: "Low (deeply depressed, near recession levels)",
        when: (f) => atLow(f),
        rule: "Sentiment in the bottom fifth of its trailing ten years.",
        source: "Low (deeply depressed, near recession levels)",
        gapNote:
          "The owner gives no number for recession levels, so it is read as the bottom fifth of the trailing ten years, the app's own low-level band.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 13,
    metricName: "10-Year Treasury Yield",
    rules: [
      {
        reading: "10-year rate rising",
        when: (f) => f.trend === "rising",
        rule: "The 10-year yield is rising.",
        source: "10-year rate rising",
      },
      {
        reading: "Rates broadly falling",
        when: (f) => f.trend === "falling",
        rule: "The 10-year yield is falling.",
        source: "Interest rates are declining across maturities",
        gapNote:
          "Read off the 10-year yield alone, because this metric carries one series. Whether the fall is broad across maturities cannot be checked here.",
      },
      {
        reading: "Rates stable at moderate levels",
        when: (f) => flat(f),
        rule: "The 10-year yield is neither rising nor falling.",
        source: "Interest rates are steady across maturities",
        gapNote:
          "Only the steady half is tested. The owner gives no number for a moderate level, so direction alone decides, and the reading also holds when the direction reader cannot call a direction.",
      },
    ],
    undetermined: [
      {
        reading: "Short rates (3-month, 2-year) rising sharply",
        why: "The reading names the 3-month and 2-year rates, which are different series from this metric's 10-year yield. Nothing in the label can be tested against the 10-year alone.",
      },
    ],
  },
  {
    surface: "economic",
    defNumber: 14,
    metricName: "ISM Manufacturing PMI",
    rules: [
      {
        reading: "Strong expansion (above 55 and rising)",
        when: (f) => f.latest > 55 && f.trend !== "falling",
        rule: "Index above 55, and not falling.",
        source: "above 55 and rising",
        gapNote:
          "A neutral direction, or one the reader could not call, is accepted because the level is inside the label's own band of above 55. Uncovered on purpose: the index above 55 while falling.",
      },
      {
        reading: "Modest expansion (50 to 55)",
        when: (f) => f.latest >= 50 && f.latest <= 55,
        rule: "Index from 50 to 55.",
        source: "Modest expansion (50 to 55)",
      },
      {
        reading: "Contraction beginning (45 to 50)",
        when: (f) => f.latest >= 45 && f.latest < 50,
        rule: "Index from 45 up to 50.",
        source: "Contraction beginning (45 to 50)",
      },
      {
        reading: "Deep contraction (below 45)",
        when: (f) => f.latest < 45,
        rule: "Index below 45.",
        source: "Deep contraction (below 45)",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 15,
    metricName: "Heavy Truck Sales (SAAR)",
    rules: [
      {
        reading: "Rising strongly (sales accelerating to high levels)",
        when: (f) => f.trend === "rising" && inUpperHalf(f),
        rule: "Sales rising, with the level in the upper half of their trailing ten years.",
        source: "Rising strongly (sales accelerating to high levels)",
        gapNote:
          "The owner gives no number for high levels, so the rule requires only that sales are not in the lower half of their own trailing ten years. It fired for a while against sales at the 26th percentile of that window, which is not a high level by any reading of the word. Uncovered on purpose: sales rising from the bottom half of their trailing ten years, and sales rising on a series too short for a ten year percentile, because neither can be called high.",
      },
      {
        reading: "Stable at healthy levels",
        when: (f) => flat(f),
        rule: "Sales neither rising nor falling.",
        source: "Stable at healthy levels",
        gapNote:
          "The healthy levels half is dropped because the owner gives no level. The reading also holds when the direction reader cannot call a direction.",
      },
      {
        reading: "Declining from prior levels",
        when: (f) => f.trend === "falling" && !atLow(f),
        rule: "Sales falling, with the level above the bottom fifth of its trailing ten years.",
        source: "Declining from prior levels",
      },
      {
        reading: "Falling sharply (deep decline)",
        when: (f) => f.trend === "falling" && atLow(f),
        rule: "Sales falling into the bottom fifth of their trailing ten years.",
        source: "Falling sharply (deep decline)",
        gapNote:
          "The owner gives no number for a deep decline, so it is read as a fall that has taken sales into the bottom fifth of the trailing ten years, the app's own low-level band.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 16,
    metricName: "Copper Price",
    rules: [],
    undetermined: [
      {
        reading: "Copper rising, all three trending up",
        why: "The reading is a joint condition on copper, silver and gold. This metric carries the copper price alone, and copper rising cannot tell this reading apart from copper rising while gold is flat.",
      },
      {
        reading: "Copper rising, gold flat",
        why: "Needs the gold series to tell it apart from all three trending up. This metric carries the copper price alone.",
      },
      {
        reading: "Gold rising, copper flat or falling",
        why: "The discriminating half is gold rising, which is a different series from this metric's copper price.",
      },
      {
        reading: "All three falling",
        why: "Needs silver and gold to confirm. Copper falling alone also fits the gold rising, copper flat or falling reading.",
      },
    ],
  },
  {
    surface: "economic",
    defNumber: 17,
    metricName: "WTI Crude Oil",
    rules: [],
    undetermined: [
      {
        reading: "Rising on strong demand (above prior range, demand-driven)",
        why: "The price series gives the direction but not the cause. Demand-driven and supply-driven are the only thing separating this reading from the supply disruption reading, and the cause cannot be read off the price.",
      },
      {
        reading: "Rising on supply disruption (spike from cut supply)",
        why: "Separated from the demand-driven rise only by the cause of the move, which the price series alone cannot establish.",
      },
      {
        reading: "Falling on weak demand (declining, demand-driven)",
        why: "Separated from the oversupply reading only by the cause of the move, which the price series alone cannot establish.",
      },
      {
        reading: "Falling on oversupply (declining, supply-driven)",
        why: "Separated from the weak demand reading only by the cause of the move, which the price series alone cannot establish.",
      },
    ],
  },
  {
    surface: "economic",
    defNumber: 18,
    metricName: "Broad USD Index (Adv. Economies)",
    rules: [
      {
        reading: "Rising sharply (dollar strengthening rapidly against majors)",
        when: (f) => dollarSharpRise(f) && f.trend !== "falling",
        rule: "Index up more than 5 percent over six months, and not falling.",
        source: "Rising sharply (dollar strengthening rapidly against majors)",
        gapNote:
          "The owner gives no pace here. Rapidly is set at more than 5 percent over six months, the owner's own wording for the same move on definition 7, Trade Weighted Index: dollar strengthening more than 5% over six months. The owner should rule on whether that number belongs here too. A neutral direction is accepted only because that borrowed band is met.",
      },
      {
        reading: "Rising moderately (gradual appreciation)",
        when: (f) => !dollarSharpRise(f) && f.trend === "rising",
        rule: "Index rising, but by 5 percent or less over six months.",
        source: "Rising moderately (gradual appreciation)",
      },
      {
        reading: "Stable (trading in a narrow range)",
        when: (f) => !dollarSharpRise(f) && flat(f),
        rule: "Index neither rising nor falling, and not up more than 5 percent over six months.",
        source: "Stable (trading in a narrow range)",
        gapNote:
          "A narrow range is a trend claim with no number of its own, so the word stable is binding and only a flat direction reads here. The sharp move is excluded as well, since a rise of more than 5 percent is not a narrow range.",
      },
      {
        reading: "Falling (dollar weakening against majors)",
        when: (f) => f.trend === "falling",
        rule: "Index falling.",
        source: "Falling (dollar weakening against majors)",
      },
    ],
    undetermined: [],
  },
];
