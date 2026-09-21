// Regenerated verbatim from the live GET /api/connections payload
// (ind_semis, September 2026). Exposure rows are trimmed to the
// first five. Do not hand-edit: re-fetch and regenerate instead.

import type { ConnectionsData } from "../connectionsTypes";

export const semiconductorsFixture = {
  "economy": {
    "tenYearYield": {
      "value": 4.94,
      "change12m": 0.88,
      "asOf": "2026-09-17",
      "priorDate": "2025-09-17",
      "priorValue": 4.06,
      "stale": false,
      "reason": null
    },
    "oneYearYield": {
      "value": 4.4,
      "change12m": 0.8,
      "asOf": "2026-09-17",
      "priorDate": "2025-09-17",
      "priorValue": 3.6,
      "stale": false,
      "reason": null
    },
    "curveSlope": 0.54,
    "breakeven10y": {
      "value": 2.33,
      "change12m": -0.05,
      "asOf": "2026-09-18",
      "priorDate": "2025-09-18",
      "priorValue": 2.38,
      "stale": false,
      "reason": null
    }
  },
  "credit": {
    "highYieldSpread": {
      "value": 2.7,
      "change12m": -0.09,
      "asOf": "2026-09-17",
      "priorDate": "2025-09-17",
      "priorValue": 2.79,
      "stale": false,
      "reason": null
    },
    "investmentGradeSpread": {
      "value": 0.78,
      "change12m": 0.02,
      "asOf": "2026-09-17",
      "priorDate": "2025-09-17",
      "priorValue": 0.76,
      "stale": false,
      "reason": null
    },
    "baaSpread": {
      "value": 1.44,
      "change12m": -0.26,
      "asOf": "2026-09-17",
      "priorDate": "2025-09-17",
      "priorValue": 1.7,
      "stale": false,
      "reason": null
    }
  },
  "sector": {
    "name": "Technology",
    "fiscalYear": 2025,
    "coverage": 0.8734,
    "firmCount": 3737,
    "duplicateListingsDropped": 1,
    "nullIndustryRowsDropped": 1,
    "valueScore": null,
    "valueRank": null,
    "sectorCount": null,
    "medianInterestCoverage": 4.11,
    "medianNetDebtToEbitda": -0.25,
    "shareCoverageBelow2": 0.4245,
    "firmsWithInterest": 3164,
    "revenueChange2020": 0.0584,
    "grossMargin": {
      "2020": 0.3145,
      "2021": 0.3273,
      "2022": 0.3192,
      "2023": 0.3057
    },
    "medianOperatingMargin": 0.0393,
    "medianOperatingMargin5yAgo": 0.063,
    "isFinancial": false,
    "notApplicable": {}
  },
  "industry": {
    "name": "Semiconductors",
    "sector": "Technology",
    "fiscalYear": 2025,
    "coverage": 0.9309,
    "firmCount": 512,
    "duplicateListingsDropped": 0,
    "cr4": 0.3264,
    "hhi": 403.7,
    "top5ShareChange5y": 4.93,
    "top5ShareChangeFirmsCompared": 5,
    "revenueCagr5y": 0.13,
    "medianInterestCoverage": 8.27,
    "medianNetDebtToEbitda": -0.4,
    "shareCoverageBelow2": 0.3844,
    "firmsWithInterest": 411,
    "revenueChange2020": 0.1207,
    "grossMargin": {
      "2020": 0.3275,
      "2021": 0.3662,
      "2022": 0.3693,
      "2023": 0.3037
    },
    "medianOperatingMargin": 0.0637,
    "medianOperatingMargin5yAgo": 0.0946,
    "sectorFiscalYear": 2025,
    "shareOfSectorRevenue": 0.162647,
    "shareOfSectorProfit": 0.30966,
    "shareOfSectorRevenue5yAgo": 0.134102,
    "shareOfSectorProfit5yAgo": 0.230633,
    "isFinancial": false,
    "notApplicable": {}
  },
  "company": null,
  "exposures": [
    {
      "ticker": "NVDA",
      "name": "NVIDIA Corporation",
      "revenueUsd": 130497000000,
      "interestCoverage": 329.77,
      "netDebtToEbitda": 0.02,
      "interestPerPointPctOfOperatingIncome": 0.0013,
      "revenueChange2020": -0.0681,
      "grossMarginChange2020to2022": 2.94,
      "operatingLeverage": 1.287,
      "shareChange5y": 9.36,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "TSM",
      "name": "Taiwan Semiconductor Manufacturing Company Limited",
      "revenueUsd": 119017927382,
      "interestCoverage": null,
      "netDebtToEbitda": -0.63,
      "interestPerPointPctOfOperatingIncome": 0.0055,
      "revenueChange2020": 0.2516,
      "grossMarginChange2020to2022": 6.46,
      "operatingLeverage": 1.469,
      "shareChange5y": 3.32,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "000660.KS",
      "name": "SK hynix Inc.",
      "revenueUsd": 68583180283,
      "interestCoverage": null,
      "netDebtToEbitda": -0.21,
      "interestPerPointPctOfOperatingIncome": 0.0047,
      "revenueChange2020": 0.1819,
      "grossMarginChange2020to2022": 1.13,
      "operatingLeverage": 2.163,
      "shareChange5y": 2.18,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "AVGO",
      "name": "Broadcom Inc.",
      "revenueUsd": 63887000000,
      "interestCoverage": 7.94,
      "netDebtToEbitda": 1.41,
      "interestPerPointPctOfOperatingIncome": 0.0256,
      "revenueChange2020": 0.0571,
      "grossMarginChange2020to2022": 15.33,
      "operatingLeverage": 2.811,
      "shareChange5y": 1.55,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "INTC",
      "name": "Intel Corporation",
      "revenueUsd": 52853000000,
      "interestCoverage": -0.02,
      "netDebtToEbitda": 2.25,
      "interestPerPointPctOfOperatingIncome": null,
      "revenueChange2020": 0.082,
      "grossMarginChange2020to2022": -13.4,
      "operatingLeverage": -213.695,
      "shareChange5y": -8.23,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    }
  ]
} as const satisfies ConnectionsData;
