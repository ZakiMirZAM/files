// Automatic readings, economic definition files 19 to 35.
//
// The second half of ECONOMIC_RULES_A. The contract every rule in both halves
// obeys, and the helpers they share, are in economicAHelpers.ts;
// economicA.ts joins the two halves back together under the name every
// importer already uses. Nothing here was rewritten when the file was split.

import { LEVEL_BY_BAND } from "./types";
import type { MetricRules } from "./types";
import {
  atLow,
  atHigh,
  flat,
  inUpperHalf,
  rapidYearGrowth,
} from "./economicAHelpers";

export const ECONOMIC_RULES_A2: MetricRules[] = [
  {
    surface: "economic",
    defNumber: 19,
    metricName: "Capacity Utilization",
    rules: [
      {
        reading: "High and rising (above 80%)",
        when: (f) => f.latest > 80 && f.trend !== "falling",
        rule: "Utilization above 80 percent, and not falling.",
        source: "High and rising (above 80%)",
        gapNote: `A neutral direction, or one the reader could not call, is accepted because the level is inside the label's own band of above 80 percent. Uncovered on purpose: utilization above 80 percent while falling. ${LEVEL_BY_BAND}`,
      },
      {
        reading: "Moderate (76 to 80%)",
        when: (f) => f.latest >= 76 && f.latest <= 80,
        rule: "Utilization from 76 to 80 percent.",
        source: "Moderate (76 to 80%)",
      },
      {
        reading: "Low and rising (below 76%, recovering)",
        when: (f) => f.latest < 76 && f.trend === "rising",
        rule: "Utilization below 76 percent and rising.",
        source: "Low and rising (below 76%, recovering)",
        gapNote: LEVEL_BY_BAND,
      },
      {
        reading: "Low and falling (below 76%, declining)",
        when: (f) => f.latest < 76 && f.trend !== "rising",
        rule: "Utilization below 76 percent and not rising.",
        source: "Low and falling (below 76%, declining)",
        gapNote: `A neutral direction, or one the reader could not call, is accepted because the level is inside the label's own band of below 76 percent. The recovering reading needs an actual rise, which is the owner's own wording. ${LEVEL_BY_BAND}`,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 20,
    metricName: "Industrial Production Index",
    reads: "yoyChangePct",
    rules: [
      {
        reading: "Rising strongly (above 3% year over year)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct > 3,
        rule: "Industrial output up more than 3 percent on the year.",
        source: "above 3% year over year",
        gapNote:
          "Direction word not tested: the reading is the year over year percent of the index, so the owner's own band of above 3 percent IS the strong rise. The six month direction of the index is a different horizon.",
      },
      {
        reading: "Rising moderately (1 to 3% year over year)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct >= 1 && f.yoyChangePct <= 3,
        rule: "Industrial output up 1 to 3 percent on the year.",
        source: "1 to 3% year over year",
        gapNote:
          "Direction word not tested: the owner's own band of 1 to 3 percent on the year IS the moderate rise. The six month direction of the index is a different horizon.",
      },
      {
        reading: "Flat (near zero growth)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct >= 0 && f.yoyChangePct < 1,
        rule: "Industrial output up 0 to 1 percent on the year.",
        source: "Flat (near zero growth)",
        gapNote:
          "Direction word not tested: flat here IS the band, near zero growth on the year. Near zero is given 0 to 1 percent, meeting the 1 to 3 reading above it and the negative reading below it.",
      },
      {
        reading: "Falling (negative year over year)",
        when: (f) => f.yoyChangePct !== null && f.yoyChangePct < 0,
        rule: "Industrial output lower than a year earlier.",
        source: "Falling (negative year over year)",
        gapNote:
          "Direction word not tested: a negative year change IS industrial output falling. The direction reader measures the index over six months, a different horizon from the owner's own band.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 21,
    metricName: "GDP Output Gap",
    rules: [
      {
        reading: "Deeply negative (large slack, well below potential)",
        when: (f) => f.latest < -0.5 && f.trend !== "rising",
        rule: "Output gap below -0.5 percent of potential and not closing.",
        source: "Deeply negative (large slack, well below potential)",
        gapNote:
          "The owner gives no number for deeply. It is read as a gap below the near zero band that is not closing, since the owner's only other negative reading is the closing one.",
      },
      {
        reading: "Negative and closing (slack shrinking)",
        when: (f) => f.latest < -0.5 && f.trend === "rising",
        rule: "Output gap below -0.5 percent of potential and rising toward zero.",
        source: "Negative and closing (slack shrinking)",
      },
      {
        reading: "Near zero (at potential)",
        when: (f) => f.latest >= -0.5 && f.latest <= 0.5,
        rule: "Output gap from -0.5 to 0.5 percent of potential.",
        source: "Near zero (at potential)",
        gapNote:
          "Near zero is given the band -0.5 to 0.5 percent of potential. The owner gives no width, and without one the positive reading would start at zero and the near zero reading would have no room.",
      },
      {
        reading: "Positive (above potential, overheating)",
        when: (f) => f.latest > 0.5,
        rule: "Output gap above 0.5 percent of potential.",
        source: "Positive (above potential, overheating)",
        gapNote: `The owner's positive reading starts above zero. The edge is moved to 0.5 so the near zero band has width. ${LEVEL_BY_BAND} An output gap above potential IS overheating whatever the last ten years of gaps looked like.`,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 22,
    metricName: "5-Year Breakeven Inflation",
    rules: [
      {
        reading: "Rising above the target (above 2.5% and climbing)",
        when: (f) => f.latest > 2.5 && f.trend !== "falling",
        rule: "Breakeven above 2.5 percent, and not falling.",
        source: "above 2.5% and climbing",
        gapNote:
          "A neutral direction, or one the reader could not call, is accepted because the level is inside the label's own band of above 2.5 percent. Uncovered on purpose: a breakeven above 2.5 percent while falling.",
      },
      {
        reading: "Around the target (2 to 2.5%, stable)",
        when: (f) => f.latest >= 2 && f.latest <= 2.5 && flat(f),
        rule: "Breakeven from 2 to 2.5 percent, and neither rising nor falling.",
        source: "Around the target (2 to 2.5%, stable)",
        gapNote:
          "The band 2 to 2.5 defines around the target, not stability, so the word stable is binding and only a flat direction reads here. Uncovered on purpose: a breakeven from 2 to 2.5 percent while rising or falling, which is what the series does today.",
      },
      {
        reading: "Falling toward or below target (declining)",
        when: (f) => f.latest >= 1 && f.latest < 2 && f.trend !== "rising",
        rule: "Breakeven from 1 up to 2 percent, and not rising.",
        source: "Falling toward or below target (declining)",
        gapNote:
          "Read as the below target half of the owner's either-or, given the band 1 to 2 percent, which sits between the deflation fear reading under it and the target band over it and is territory no other label names. The word declining is binding, so a rising breakeven never reads here, and a neutral direction is accepted only because the level is inside that band. Uncovered on purpose: a breakeven from 1 to 2 percent while rising.",
      },
      {
        reading: "Falling sharply or negative (deflation fear)",
        when: (f) => f.latest < 1,
        rule: "Breakeven below 1 percent.",
        source: "The market expects very low or negative inflation",
        gapNote:
          "Direction word not tested: this is the or negative half of the owner's own either-or, a level that carries no movement claim, so a breakeven this low holds whichever way the last six months moved. Very low is given below 1 percent, so the around the target band at 2 to 2.5 and the below target band at 1 to 2 sit above it.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 23,
    metricName: "S&P 500 Earnings Yield",
    rules: [],
    undetermined: [
      {
        reading: "Earnings yield well above bond yield (large equity premium)",
        why: "The reading is the gap between the earnings yield and the bond yield. This metric carries the earnings yield alone, so the gap cannot be formed from it.",
      },
      {
        reading: "Earnings yield moderately above bond yield (normal premium)",
        why: "Needs the bond yield to form the premium. This metric carries the earnings yield alone.",
      },
      {
        reading: "Earnings yield near bond yield (thin premium)",
        why: "Needs the bond yield to form the premium. This metric carries the earnings yield alone.",
      },
      {
        reading: "Earnings yield below bond yield (negative premium)",
        why: "Needs the bond yield to form the premium. This metric carries the earnings yield alone.",
      },
    ],
  },
  {
    surface: "economic",
    defNumber: 24,
    metricName: "U-6 Unemployment Rate",
    rules: [
      {
        reading: "Low (near historical lows, little slack)",
        when: (f) => f.trend !== "rising" && atLow(f),
        rule: "U-6 in the bottom fifth of its trailing ten years and not rising.",
        source: "Low (near historical lows, little slack)",
        gapNote:
          "Near historical lows is read as the bottom fifth of the trailing ten years, the app's own low-level band. A falling rate that is already there reads here rather than as Falling, because the owner describes this one as the state and that one as the move.",
      },
      {
        reading: "Falling (slack shrinking)",
        when: (f) => f.trend === "falling" && !atLow(f),
        rule: "U-6 falling, with the level above the bottom fifth of its trailing ten years.",
        source: "Falling (slack shrinking)",
      },
      {
        reading: "Elevated and stable (notable slack)",
        when: (f) => flat(f) && inUpperHalf(f),
        rule: "U-6 neither rising nor falling, with the level in the upper half of its trailing ten years.",
        source: "Elevated and stable (notable slack)",
        gapNote:
          "The owner gives no number for elevated, so the rule requires only that the rate is not in the lower half of its own trailing ten years. It used to take any steady rate outside the bottom fifth, which let it fire at the 46th percentile of that window and call the middle of the range elevated. Uncovered on purpose: a steady rate in the lower half of its trailing ten years but above the bottom fifth, and a steady rate on a series too short for a ten year percentile, because neither can be called elevated.",
      },
      {
        reading: "Rising (slack increasing)",
        when: (f) => f.trend === "rising",
        rule: "U-6 rising.",
        source: "Rising (slack increasing)",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 25,
    metricName: "Labor Force Participation Rate",
    rules: [
      {
        reading: "Rising (more people entering the workforce)",
        when: (f) => f.trend === "rising",
        rule: "Participation rising.",
        source: "Rising (more people entering the workforce)",
      },
      {
        reading: "Stable at a healthy level",
        when: (f) => flat(f),
        rule: "Participation neither rising nor falling.",
        source: "Stable at a healthy level",
        gapNote:
          "The healthy level half is dropped because the owner gives no level. The reading also holds when the direction reader cannot call a direction.",
      },
      {
        reading: "Falling slowly (gradual decline)",
        when: (f) =>
          f.trend === "falling" && !(f.yoyChangeAbs !== null && f.yoyChangeAbs <= -0.5),
        rule: "Participation falling, but down less than 0.5 percentage points on the year.",
        source: "Falling slowly (gradual decline)",
        reads: "yoyChangeAbs",
        gapNote:
          "The owner gives no pace. The split against the rapid decline is set at a fall of 0.5 percentage points or more over the year, the same 0.5 point move the owner treats as a turning labor market on definition 2, Employment. The owner should rule on that number.",
      },
      {
        reading: "Falling sharply (rapid decline)",
        when: (f) => f.trend === "falling" && f.yoyChangeAbs !== null && f.yoyChangeAbs <= -0.5,
        rule: "Participation falling and down 0.5 percentage points or more on the year.",
        source: "Falling sharply (rapid decline)",
        reads: "yoyChangeAbs",
        gapNote:
          "The owner gives no pace. Rapid is set at a fall of 0.5 percentage points or more over the year, borrowed from the owner's own 0.5 point turn on definition 2, Employment.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 26,
    metricName: "Retail Sales YoY %",
    rules: [
      {
        reading: "Growing strongly (above 5% year over year)",
        when: (f) => f.latest > 5,
        rule: "Retail sales up more than 5 percent on the year.",
        source: "above 5% year over year",
      },
      {
        reading: "Growing moderately (2 to 5% year over year)",
        when: (f) => f.latest >= 2 && f.latest <= 5,
        rule: "Retail sales up 2 to 5 percent on the year.",
        source: "2 to 5% year over year",
      },
      {
        reading: "Flat or slowing (near zero to 2% year over year)",
        when: (f) => f.latest >= 0 && f.latest < 2,
        rule: "Retail sales up 0 to 2 percent on the year.",
        source: "near zero to 2% year over year",
        gapNote:
          "Direction word not tested: this series already is the year over year percent, so the owner's own band of near zero to 2 percent IS what flat or slowing means here. Growth inside it reads this way whatever the growth rate did over the last six months.",
      },
      {
        reading: "Falling (negative year over year in real terms)",
        when: (f) => f.latest < 0,
        rule: "Retail sales lower than a year earlier.",
        source: "Falling (negative year over year in real terms)",
        gapNote:
          "Direction word not tested: this series already is the year over year percent, so a negative reading IS retail sales falling. The payload series is nominal retail sales growth, so the test is on the nominal figure, and the owner's in real terms qualifier needs a price series this metric does not carry.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 27,
    metricName: "Personal Savings Rate",
    rules: [
      {
        reading: "Low (below 4%, households spending freely)",
        when: (f) => f.latest < 4 && f.trend !== "rising",
        rule: "Savings rate below 4 percent and not rising.",
        source: "Low (below 4%, households spending freely)",
        gapNote: LEVEL_BY_BAND,
      },
      {
        reading: "Moderate (4 to 8%, balanced)",
        when: (f) => f.latest >= 4 && f.latest <= 8 && f.trend !== "rising",
        rule: "Savings rate from 4 to 8 percent and not rising.",
        source: "Moderate (4 to 8%, balanced)",
      },
      {
        reading: "Rising (households pulling back to save)",
        when: (f) => f.latest <= 8 && f.trend === "rising",
        rule: "Savings rate rising, from a level at or below 8 percent.",
        source: "Rising (households pulling back to save)",
        gapNote:
          "The owner gives no level for this reading, so it takes any rising rate below the High band. It is placed ahead of the Low and Moderate bands because the owner describes those two as settled states, spending freely and balanced, while this one is the move.",
      },
      {
        reading: "High (above 8%, defensive households)",
        when: (f) => f.latest > 8,
        rule: "Savings rate above 8 percent.",
        source: "High (above 8%, defensive households)",
        gapNote: LEVEL_BY_BAND,
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 28,
    metricName: "High-Yield Credit Spread (OAS)",
    rules: [
      {
        reading: "Narrow (tight spreads, low risk premium)",
        when: (f) => f.trend !== "rising" && atLow(f),
        rule: "Spread not widening, with the level in the bottom fifth of its trailing ten years.",
        source: "Narrow (tight spreads, low risk premium)",
        gapNote:
          "The owner gives no spread level. Narrow is read as the bottom fifth of the trailing ten years, the app's own low-level band.",
      },
      {
        reading: "Normal (moderate spreads)",
        when: (f) => f.trend !== "rising" && !atLow(f),
        rule: "Spread not widening, with the level above the bottom fifth of its trailing ten years.",
        source: "Normal (moderate spreads)",
        gapNote:
          "Typical levels are read as everything that is not narrow and not widening. The reading also holds when the direction reader cannot call a direction.",
      },
      {
        reading: "Widening (rising risk premium)",
        when: (f) => f.trend === "rising" && !atHigh(f),
        rule: "Spread rising, with the level below the top fifth of its trailing ten years.",
        source: "Widening (rising risk premium)",
      },
      {
        reading: "Sharply widening (spread blowout, crisis levels)",
        when: (f) => f.trend === "rising" && atHigh(f),
        rule: "Spread rising into the top fifth of its trailing ten years.",
        source: "spreads spiking to levels seen in financial crises",
        gapNote:
          "The owner gives no crisis number. Crisis levels are read as the top fifth of the trailing ten years, the app's own high-level band, reached while the spread is still widening.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 29,
    metricName: "C&I Loans YoY %",
    rules: [
      {
        reading: "Strong growth (above 8% year over year)",
        when: (f) => f.latest > 8,
        rule: "Business loans up more than 8 percent on the year.",
        source: "above 8% year over year",
      },
      {
        reading: "Moderate growth (3 to 8% year over year)",
        when: (f) => f.latest >= 3 && f.latest <= 8,
        rule: "Business loans up 3 to 8 percent on the year.",
        source: "3 to 8% year over year",
      },
      {
        reading: "Slowing or flat (near zero growth)",
        when: (f) => f.latest >= 0 && f.latest < 3,
        rule: "Business loans up 0 to 3 percent on the year.",
        source: "Slowing or flat (near zero growth)",
        gapNote:
          "Direction word not tested: this series already is the year over year percent, so near zero growth IS the band. Near zero is given 0 to 3 percent, meeting the 3 to 8 reading above it and the negative reading below it.",
      },
      {
        reading: "Contracting (negative year over year)",
        when: (f) => f.latest < 0,
        rule: "Business loans lower than a year earlier.",
        source: "Contracting (negative year over year)",
        gapNote:
          "Direction word not tested: this series already is the year over year percent, so a negative reading IS the loan book contracting. The direction reader measures the growth rate, not the loan balance.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 30,
    metricName: "Trade Balance ($M)",
    rules: [],
    undetermined: [
      {
        reading: "Deficit narrowing on rising exports",
        why: "The balance shows only whether the deficit narrowed or widened. Which side moved needs the exports and imports series, which this metric does not carry, so this reading cannot be told apart from a deficit narrowing on falling imports.",
      },
      {
        reading: "Deficit widening on rising imports",
        why: "Cannot be told apart from a deficit widening on falling exports without the exports and imports series.",
      },
      {
        reading: "Deficit widening on falling exports",
        why: "Cannot be told apart from a deficit widening on rising imports without the exports and imports series.",
      },
      {
        reading: "Deficit narrowing on falling imports",
        why: "Cannot be told apart from a deficit narrowing on rising exports without the exports and imports series.",
      },
    ],
  },
  {
    surface: "economic",
    defNumber: 31,
    metricName: "Current Account % of GDP",
    rules: [
      {
        reading: "Large deficit (more negative than 4% of GDP)",
        when: (f) => f.latest < -4,
        rule: "Current account below -4 percent of GDP.",
        source: "more negative than 4% of GDP",
      },
      {
        reading: "Moderate deficit (2 to 4% of GDP)",
        when: (f) => f.latest >= -4,
        rule: "Current account at or above -4 percent of GDP.",
        source: "Moderate deficit (2 to 4% of GDP)",
        gapNote:
          "The band is widened above -2 percent, so a deficit smaller than 2 percent of GDP or a surplus lands here. Neither fits any other label, since the owner's two remaining readings turn on which side of the account moved.",
      },
    ],
    undetermined: [
      {
        reading: "Narrowing deficit on stronger exports",
        why: "The deficit narrowing is testable, but which side moved is not. Exports and foreign earnings are different series from this metric's current account ratio, so this reading cannot be told apart from a deficit narrowing on weak domestic demand.",
      },
      {
        reading: "Narrowing deficit on weak domestic demand",
        why: "Cannot be told apart from a deficit narrowing on stronger exports without the import and export series.",
      },
    ],
  },
  {
    surface: "economic",
    defNumber: 32,
    metricName: "Total Non-Financial Debt % of GDP",
    rules: [
      {
        reading: "High and rising rapidly (above 250% and climbing)",
        when: (f) => f.latest > 250 && f.trend === "rising",
        rule: "Debt above 250 percent of GDP and rising.",
        source: "above 250% and climbing",
        gapNote: LEVEL_BY_BAND,
      },
      {
        reading: "High and stable (elevated but not rising)",
        when: (f) => f.latest > 250 && flat(f),
        rule: "Debt above 250 percent of GDP and neither rising nor falling.",
        source: "High and stable (elevated but not rising)",
        gapNote: `Elevated takes the owner's own 250 percent edge from the reading above it. It also holds when the direction reader cannot call a direction. ${LEVEL_BY_BAND}`,
      },
      {
        reading: "Moderate (in a sustainable range)",
        when: (f) => f.latest <= 250 && f.trend !== "falling",
        rule: "Debt at or below 250 percent of GDP and not falling.",
        source: "Moderate (in a sustainable range)",
        gapNote:
          "A sustainable range is given as at or below 250 percent, the edge the owner sets for the two High readings. A rising ratio below that edge stays here, because the owner's rising reading is explicitly above 250 percent.",
      },
      {
        reading: "Deleveraging (debt falling relative to output)",
        when: (f) => f.trend === "falling",
        rule: "Debt falling relative to output.",
        source: "Deleveraging (debt falling relative to output)",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 33,
    metricName: "Fed Balance Sheet ($M)",
    rules: [
      {
        reading: "Expanding rapidly (central banks injecting liquidity)",
        when: (f) => rapidYearGrowth(f) && f.trend === "rising",
        rule: "Balance sheet rising and up more than 10 percent on the year.",
        source: "Expanding rapidly (central banks injecting liquidity)",
        // The only rule of this metric whose band is the year change. The other
        // three are decided by the direction reader on the LEVEL series, so
        // they print the level: a balance sheet the reader calls falling over
        // six months can still be up on the year, and "Contracting, from +8%
        // year over year" would be a line that argues with itself.
        reads: "yoyChangePct",
        gapNote:
          "The owner gives no pace here. Rapidly is set at more than 10 percent year over year, the rate the owner calls rapid expansion for the money supply on definition 5, M2 Money Supply. Because that band is borrowed rather than the owner's own for this metric, an actual rise is required as well. The series is also the Fed balance sheet alone, not the global aggregate the reading names. The owner should rule on both. Uncovered on purpose: a balance sheet up more than 10 percent on the year whose six month direction reads flat.",
      },
      {
        reading: "Expanding moderately (gradual liquidity addition)",
        when: (f) => f.trend === "rising" && !rapidYearGrowth(f),
        rule: "Balance sheet rising, but up 10 percent or less on the year.",
        source: "Expanding moderately (gradual liquidity addition)",
      },
      {
        reading: "Stable (balance sheets flat)",
        when: (f) => flat(f) && !rapidYearGrowth(f),
        rule: "Balance sheet neither rising nor falling, and up 10 percent or less on the year.",
        source: "Stable (balance sheets flat)",
        gapNote:
          "The word flat is binding, so only a flat direction reads here. A balance sheet up more than 10 percent on the year is excluded as well, since that is not a flat balance sheet whatever the six month direction says.",
      },
      {
        reading: "Contracting (central banks withdrawing liquidity)",
        when: (f) => f.trend === "falling",
        rule: "Balance sheet falling.",
        source: "Contracting (central banks withdrawing liquidity)",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 34,
    metricName: "SOFR-OIS Spread (proxy)",
    rules: [
      {
        reading: "Narrow (calm funding markets)",
        when: (f) => f.trend !== "rising" && !atHigh(f),
        rule: "Spread not widening, with the level below the top fifth of its trailing ten years.",
        source: "Narrow (calm funding markets)",
        gapNote:
          "The owner gives no spread level. Calm is read as anything below the top fifth of the trailing ten years that is not widening, the app's own high-level band used in reverse.",
      },
      {
        reading: "Modestly elevated (mild funding strain)",
        when: (f) => f.trend !== "rising" && atHigh(f),
        rule: "Spread in the top fifth of its trailing ten years but not widening.",
        source: "Modestly elevated (mild funding strain)",
        gapNote:
          "Elevated is read as the top fifth of the trailing ten years. Mild is read as the strain no longer building, which is the difference the owner draws against the widening reading.",
      },
      {
        reading: "Widening (building funding stress)",
        when: (f) => f.trend === "rising" && !atHigh(f),
        rule: "Spread rising, with the level below the top fifth of its trailing ten years.",
        source: "Widening (building funding stress)",
      },
      {
        reading: "Spiking (acute funding crisis)",
        when: (f) => f.trend === "rising" && atHigh(f),
        rule: "Spread rising into the top fifth of its trailing ten years.",
        source: "The spread is spiking to levels seen in financial crises",
        gapNote:
          "The owner gives no crisis number. Crisis levels are read as the top fifth of the trailing ten years, reached while the spread is still widening.",
      },
    ],
    undetermined: [],
  },
  {
    surface: "economic",
    defNumber: 35,
    metricName: "Treasury General Account ($M)",
    rules: [
      {
        reading: "Drawing down sharply (account falling, adding liquidity)",
        when: (f) => f.trend === "falling",
        rule: "Account balance falling.",
        source: "Drawing down sharply (account falling, adding liquidity)",
        gapNote:
          "The sharply half is dropped. The owner gives no moderate drawdown reading, so every falling balance lands here.",
      },
      {
        reading: "Stable (account steady)",
        when: (f) => flat(f),
        rule: "Account balance neither rising nor falling.",
        source: "Stable (account steady)",
      },
      {
        reading: "Building moderately (account rising, draining liquidity)",
        when: (f) => f.trend === "rising" && !atHigh(f),
        rule: "Account balance rising, with the level below the top fifth of its trailing ten years.",
        source: "Building moderately (account rising, draining liquidity)",
      },
      {
        reading: "Building sharply (account rising fast, draining liquidity heavily)",
        when: (f) => f.trend === "rising" && atHigh(f),
        rule: "Account balance rising into the top fifth of its trailing ten years.",
        source: "Building sharply (account rising fast, draining liquidity heavily)",
        gapNote:
          "The owner gives no pace. Rising fast is read as a rise that has taken the balance into the top fifth of its trailing ten years, the app's own high-level band, which is where a heavy drain leaves it.",
      },
    ],
    undetermined: [],
  },
];
