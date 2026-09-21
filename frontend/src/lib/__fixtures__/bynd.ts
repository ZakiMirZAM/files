// Regenerated verbatim from the live GET /api/connections payload
// (BYND, September 2026). Exposure rows are trimmed to the
// first five. Do not hand-edit: re-fetch and regenerate instead.

import type { ConnectionsData } from "../connectionsTypes";

export const byndFixture = {
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
    "name": "Consumer Defensive",
    "fiscalYear": 2025,
    "coverage": 0.8475,
    "firmCount": 1468,
    "duplicateListingsDropped": 4,
    "nullIndustryRowsDropped": 1,
    "valueScore": null,
    "valueRank": null,
    "sectorCount": null,
    "medianInterestCoverage": 4.9,
    "medianNetDebtToEbitda": 0.71,
    "shareCoverageBelow2": 0.3297,
    "firmsWithInterest": 1365,
    "revenueChange2020": 0.0207,
    "grossMargin": {
      "2020": 0.2843,
      "2021": 0.2782,
      "2022": 0.275,
      "2023": 0.2757
    },
    "medianOperatingMargin": 0.0577,
    "medianOperatingMargin5yAgo": 0.061,
    "isFinancial": false,
    "notApplicable": {}
  },
  "industry": {
    "name": "Packaged Foods",
    "sector": "Consumer Defensive",
    "fiscalYear": 2025,
    "coverage": 0.8406,
    "firmCount": 485,
    "duplicateListingsDropped": 0,
    "cr4": 0.2556,
    "hhi": 281,
    "top5ShareChange5y": 0.67,
    "top5ShareChangeFirmsCompared": 5,
    "revenueCagr5y": 0.0498,
    "medianInterestCoverage": 5.39,
    "medianNetDebtToEbitda": 0.63,
    "shareCoverageBelow2": 0.2976,
    "firmsWithInterest": 457,
    "revenueChange2020": 0.0276,
    "grossMargin": {
      "2020": 0.2535,
      "2021": 0.2429,
      "2022": 0.2247,
      "2023": 0.2386
    },
    "medianOperatingMargin": 0.0523,
    "medianOperatingMargin5yAgo": 0.0583,
    "sectorFiscalYear": 2025,
    "shareOfSectorRevenue": 0.149816,
    "shareOfSectorProfit": null,
    "shareOfSectorRevenue5yAgo": 0.183904,
    "shareOfSectorProfit5yAgo": 0.203422,
    "isFinancial": false,
    "notApplicable": {}
  },
  "company": {
    "ticker": "BYND",
    "name": "Beyond Meat, Inc.",
    "sector": "Consumer Defensive",
    "industry": "Packaged Foods",
    "fiscalYear": 2025,
    "reportingCurrency": "USD",
    "totalDebt": 507972000,
    "totalDebtUsd": 507972000,
    "operatingIncome": -233346000,
    "operatingIncomeUsd": -233346000,
    "interestPerPoint": 5079720,
    "interestPerPointUsd": 5079720,
    "interestPerPointPctOfOperatingIncome": null,
    "interestCoverage": -16.63,
    "syntheticRating": "C/D",
    "revenueChange2020": 0.3655,
    "grossMargin": {
      "2020": 0.300588763,
      "2021": 0.25238003,
      "2022": -0.046888166,
      "2023": -0.240712805
    },
    "growth": {
      "companyCagr5y": -0.077943,
      "industryCagr5y": 0.049824,
      "industryPoints": 0.049824,
      "sharePoints": -0.127767,
      "companyCagrUnrounded": -0.07794234,
      "shareNow": 0.000266,
      "shareThen": 0.000504,
      "years": 5
    },
    "margin": {
      "company": -0.847003,
      "companyUnrounded": -0.84700322,
      "industryMedian": 0.052338,
      "groupMedian": 0.008816,
      "industryPart": 0.052338,
      "groupPart": -0.043522,
      "companyPart": -0.855819,
      "group": "High SG&A intensity, high cost vs peers",
      "firmCount": 485
    },
    "group": {
      "label": "High SG&A intensity, high cost vs peers",
      "firmCount": 79,
      "medianPreTaxRoic": 0.0213,
      "rankByPreTaxRoic": 71,
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
      "ticker": "NESN.SW",
      "name": "Nestlé S.A.",
      "revenueUsd": 110222929037,
      "interestCoverage": 8.46,
      "netDebtToEbitda": 2.98,
      "interestPerPointPctOfOperatingIncome": 0.0405,
      "revenueChange2020": -0.0881,
      "grossMarginChange2020to2022": -3.85,
      "operatingLeverage": 1.277,
      "shareChange5y": -2.28,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "JBSS32.SA",
      "name": "Jbs N.V.",
      "revenueUsd": 86184182000,
      "interestCoverage": 2.48,
      "netDebtToEbitda": 2.77,
      "interestPerPointPctOfOperatingIncome": 0.055,
      "revenueChange2020": null,
      "grossMarginChange2020to2022": null,
      "operatingLeverage": -0.427,
      "shareChange5y": null,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "300999.SZ",
      "name": "Yihai Kerry Arawana Holdings Co., Ltd",
      "revenueUsd": 36410980761,
      "interestCoverage": null,
      "netDebtToEbitda": 4.76,
      "interestPerPointPctOfOperatingIncome": 0.1631,
      "revenueChange2020": 0.1416,
      "grossMarginChange2020to2022": -5,
      "operatingLeverage": 16.922,
      "shareChange5y": -0.07,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "BSN.DE",
      "name": "Danone S.A.",
      "revenueUsd": 31603148967,
      "interestCoverage": 5.9,
      "netDebtToEbitda": 4.33,
      "interestPerPointPctOfOperatingIncome": 0.0514,
      "revenueChange2020": -0.0659,
      "grossMarginChange2020to2022": -2.01,
      "operatingLeverage": 38.244,
      "shareChange5y": -0.34,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "MBRF3.SA",
      "name": "MBRF Global Foods Company S.A.",
      "revenueUsd": 31371470924,
      "interestCoverage": 0.86,
      "netDebtToEbitda": 5.41,
      "interestPerPointPctOfOperatingIncome": 0.1321,
      "revenueChange2020": null,
      "grossMarginChange2020to2022": null,
      "operatingLeverage": -0.539,
      "shareChange5y": null,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    }
  ]
} as const satisfies ConnectionsData;
