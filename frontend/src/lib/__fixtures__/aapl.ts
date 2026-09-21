// Regenerated verbatim from the live GET /api/connections payload
// (AAPL, September 2026). Exposure rows are trimmed to the
// first five. Do not hand-edit: re-fetch and regenerate instead.

import type { ConnectionsData } from "../connectionsTypes";

export const aaplFixture = {
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
    "name": "Consumer Electronics",
    "sector": "Technology",
    "fiscalYear": 2025,
    "coverage": 0.9149,
    "firmCount": 129,
    "duplicateListingsDropped": 0,
    "cr4": 0.7317,
    "hhi": 2072.3,
    "top5ShareChange5y": 0.85,
    "top5ShareChangeFirmsCompared": 5,
    "revenueCagr5y": 0.0856,
    "medianInterestCoverage": 2.58,
    "medianNetDebtToEbitda": 0,
    "shareCoverageBelow2": 0.4741,
    "firmsWithInterest": 116,
    "revenueChange2020": 0.0343,
    "grossMargin": {
      "2020": 0.2415,
      "2021": 0.2321,
      "2022": 0.2344,
      "2023": 0.2502
    },
    "medianOperatingMargin": 0.0231,
    "medianOperatingMargin5yAgo": 0.0458,
    "sectorFiscalYear": 2025,
    "shareOfSectorRevenue": 0.15215,
    "shareOfSectorProfit": 0.192731,
    "shareOfSectorRevenue5yAgo": 0.156618,
    "shareOfSectorProfit5yAgo": 0.217107,
    "isFinancial": false,
    "notApplicable": {}
  },
  "company": {
    "ticker": "AAPL",
    "name": "Apple Inc.",
    "sector": "Technology",
    "industry": "Consumer Electronics",
    "fiscalYear": 2025,
    "reportingCurrency": "USD",
    "totalDebt": 112377000000,
    "totalDebtUsd": 112377000000,
    "operatingIncome": 133050000000,
    "operatingIncomeUsd": 133050000000,
    "interestPerPoint": 1123770000,
    "interestPerPointUsd": 1123770000,
    "interestPerPointPctOfOperatingIncome": 0.0084,
    "interestCoverage": null,
    "syntheticRating": null,
    "revenueChange2020": 0.0551,
    "grossMargin": {
      "2020": 0.382332477,
      "2021": 0.417793596,
      "2022": 0.433096306,
      "2023": 0.441311296
    },
    "growth": {
      "companyCagr5y": 0.083214,
      "industryCagr5y": 0.085562,
      "industryPoints": 0.085562,
      "sharePoints": -0.002348,
      "companyCagrUnrounded": 0.08321326,
      "shareNow": 0.380146,
      "shareThen": 0.384636,
      "years": 5
    },
    "margin": {
      "company": 0.319708,
      "companyUnrounded": 0.319708,
      "industryMedian": 0.02312,
      "groupMedian": 0.039194,
      "industryPart": 0.02312,
      "groupPart": 0.016074,
      "companyPart": 0.280514,
      "group": "High R&D intensity, high value-added share",
      "firmCount": 129
    },
    "group": {
      "label": "High R&D intensity, high value-added share",
      "firmCount": 36,
      "medianPreTaxRoic": 0.0208,
      "rankByPreTaxRoic": 1,
      "axes": [
        "techLeadership",
        "verticalIntegration"
      ]
    },
    "isFinancial": false,
    "notApplicable": {}
  },
  "exposures": [
    {
      "ticker": "AAPL",
      "name": "Apple Inc.",
      "revenueUsd": 416161000000,
      "interestCoverage": null,
      "netDebtToEbitda": 0.53,
      "interestPerPointPctOfOperatingIncome": 0.0084,
      "revenueChange2020": 0.0551,
      "grossMarginChange2020to2022": 5.08,
      "operatingLeverage": 1.242,
      "shareChange5y": -0.45,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "SMSD.IL",
      "name": "Samsung Electronics Co., Ltd.",
      "revenueUsd": 235517628921,
      "interestCoverage": 71.97,
      "netDebtToEbitda": -0.32,
      "interestPerPointPctOfOperatingIncome": 0.0066,
      "revenueChange2020": 0.0278,
      "grossMarginChange2020to2022": -1.86,
      "operatingLeverage": 3.054,
      "shareChange5y": -1.91,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "SONY",
      "name": "Sony Group Corporation",
      "revenueUsd": 81425642914,
      "interestCoverage": 34.56,
      "netDebtToEbitda": 0.46,
      "interestPerPointPctOfOperatingIncome": 0.0297,
      "revenueChange2020": -0.0468,
      "grossMarginChange2020to2022": -1.04,
      "operatingLeverage": -42.617,
      "shareChange5y": 0.16,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "81810.HK",
      "name": "Xiaomi Corporation",
      "revenueUsd": 67925345166,
      "interestCoverage": 13.18,
      "netDebtToEbitda": 0.12,
      "interestPerPointPctOfOperatingIncome": 0.0075,
      "revenueChange2020": null,
      "grossMarginChange2020to2022": null,
      "operatingLeverage": 3.824,
      "shareChange5y": null,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "066575.KS",
      "name": "LG Electronics Inc.",
      "revenueUsd": 62973640959,
      "interestCoverage": 4.13,
      "netDebtToEbitda": 0.85,
      "interestPerPointPctOfOperatingIncome": 0.0563,
      "revenueChange2020": -0.0682,
      "grossMarginChange2020to2022": -3.86,
      "operatingLeverage": -16.397,
      "shareChange5y": 0.01,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    }
  ]
} as const satisfies ConnectionsData;
