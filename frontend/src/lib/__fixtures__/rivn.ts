// Regenerated verbatim from the live GET /api/connections payload
// (RIVN, September 2026). Exposure rows are trimmed to the
// first five. Do not hand-edit: re-fetch and regenerate instead.

import type { ConnectionsData } from "../connectionsTypes";

export const rivnFixture = {
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
    "name": "Consumer Cyclical",
    "fiscalYear": 2025,
    "coverage": 0.8223,
    "firmCount": 3186,
    "duplicateListingsDropped": 11,
    "nullIndustryRowsDropped": 0,
    "valueScore": null,
    "valueRank": null,
    "sectorCount": null,
    "medianInterestCoverage": 3.27,
    "medianNetDebtToEbitda": 0.95,
    "shareCoverageBelow2": 0.4192,
    "firmsWithInterest": 2984,
    "revenueChange2020": -0.0667,
    "grossMargin": {
      "2020": 0.2725,
      "2021": 0.2747,
      "2022": 0.2732,
      "2023": 0.2799
    },
    "medianOperatingMargin": 0.0481,
    "medianOperatingMargin5yAgo": 0.0452,
    "isFinancial": false,
    "notApplicable": {}
  },
  "industry": {
    "name": "Auto - Manufacturers",
    "sector": "Consumer Cyclical",
    "fiscalYear": 2025,
    "coverage": 0.95,
    "firmCount": 112,
    "duplicateListingsDropped": 2,
    "cr4": 0.3674,
    "hhi": 553.9,
    "top5ShareChange5y": 0.37,
    "top5ShareChangeFirmsCompared": 5,
    "revenueCagr5y": 0.0741,
    "medianInterestCoverage": 2.03,
    "medianNetDebtToEbitda": 0.55,
    "shareCoverageBelow2": 0.4722,
    "firmsWithInterest": 108,
    "revenueChange2020": -0.0412,
    "grossMargin": {
      "2020": 0.1685,
      "2021": 0.1788,
      "2022": 0.1725,
      "2023": 0.177
    },
    "medianOperatingMargin": 0.0237,
    "medianOperatingMargin5yAgo": 0.0349,
    "sectorFiscalYear": 2025,
    "shareOfSectorRevenue": 0.308526,
    "shareOfSectorProfit": 0.172561,
    "shareOfSectorRevenue5yAgo": 0.288732,
    "shareOfSectorProfit5yAgo": 0.214018,
    "isFinancial": false,
    "notApplicable": {}
  },
  "company": {
    "ticker": "RIVN",
    "name": "Rivian Automotive, Inc.",
    "sector": "Consumer Cyclical",
    "industry": "Auto - Manufacturers",
    "fiscalYear": 2025,
    "reportingCurrency": "USD",
    "totalDebt": 6651000000,
    "totalDebtUsd": 6651000000,
    "operatingIncome": -3585000000,
    "operatingIncomeUsd": -3585000000,
    "interestPerPoint": 66510000,
    "interestPerPointUsd": 66510000,
    "interestPerPointPctOfOperatingIncome": null,
    "interestCoverage": -13.08,
    "syntheticRating": "C/D",
    "revenueChange2020": null,
    "grossMargin": {
      "2020": null,
      "2021": -8.454545455,
      "2022": -1.883594692,
      "2023": -0.457825891
    },
    "growth": null,
    "margin": {
      "company": -0.665491,
      "companyUnrounded": -0.665491,
      "industryMedian": 0.023688,
      "groupMedian": -0.174578,
      "industryPart": 0.023688,
      "groupPart": -0.198266,
      "companyPart": -0.490913,
      "group": "High SG&A intensity, high cost vs peers",
      "firmCount": 112
    },
    "group": {
      "label": "High SG&A intensity, high cost vs peers",
      "firmCount": 23,
      "medianPreTaxRoic": -0.1095,
      "rankByPreTaxRoic": 13,
      "axes": [
        "brandService",
        "costPosition"
      ]
    },
    "isFinancial": false,
    "notApplicable": {}
  },
  "exposures": [
    {
      "ticker": "VOW.WA",
      "name": "Volkswagen AG",
      "revenueUsd": 372886577477,
      "interestCoverage": 8.77,
      "netDebtToEbitda": 4.95,
      "interestPerPointPctOfOperatingIncome": 0.1632,
      "revenueChange2020": -0.1178,
      "grossMarginChange2020to2022": 1.23,
      "operatingLeverage": 35.409,
      "shareChange5y": -0.04,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "TM",
      "name": "Toyota Motor Corporation",
      "revenueUsd": 301874584666,
      "interestCoverage": 25.15,
      "netDebtToEbitda": 3.61,
      "interestPerPointPctOfOperatingIncome": 0.0809,
      "revenueChange2020": -0.0098,
      "grossMarginChange2020to2022": 0.96,
      "operatingLeverage": -1.596,
      "shareChange5y": 1.03,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "F",
      "name": "Ford Motor Company",
      "revenueUsd": 187267000000,
      "interestCoverage": 2.02,
      "netDebtToEbitda": 16.91,
      "interestPerPointPctOfOperatingIncome": 0.6618,
      "revenueChange2020": -0.1845,
      "grossMarginChange2020to2022": 5.88,
      "operatingLeverage": -40.905,
      "shareChange5y": 0.11,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "GM",
      "name": "General Motors Company",
      "revenueUsd": 185019000000,
      "interestCoverage": 4,
      "netDebtToEbitda": 6.25,
      "interestPerPointPctOfOperatingIncome": 0.4478,
      "revenueChange2020": -0.1075,
      "grossMarginChange2020to2022": 2.22,
      "operatingLeverage": 59.756,
      "shareChange5y": 0.27,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "BMW.WA",
      "name": "Bayerische Motoren Werke AG",
      "revenueUsd": 154584724519,
      "interestCoverage": 36.69,
      "netDebtToEbitda": 4.71,
      "interestPerPointPctOfOperatingIncome": 0.1077,
      "revenueChange2020": -0.0501,
      "grossMarginChange2020to2022": 3.51,
      "operatingLeverage": 2.135,
      "shareChange5y": -0.4,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    }
  ]
} as const satisfies ConnectionsData;
