// Regenerated verbatim from the live GET /api/connections payload
// (LULU, September 2026). Exposure rows are trimmed to the
// first five. Do not hand-edit: re-fetch and regenerate instead.

import type { ConnectionsData } from "../connectionsTypes";

export const luluFixture = {
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
    "name": "Apparel - Retail",
    "sector": "Consumer Cyclical",
    "fiscalYear": 2024,
    "coverage": 1,
    "firmCount": 119,
    "duplicateListingsDropped": 0,
    "cr4": 0.5374,
    "hhi": 954.6,
    "top5ShareChange5y": 1.12,
    "top5ShareChangeFirmsCompared": 5,
    "revenueCagr5y": 0.0495,
    "medianInterestCoverage": 3.33,
    "medianNetDebtToEbitda": 0.55,
    "shareCoverageBelow2": 0.4144,
    "firmsWithInterest": 111,
    "revenueChange2020": -0.142,
    "grossMargin": {
      "2020": 0.4426,
      "2021": 0.4765,
      "2022": 0.481,
      "2023": 0.4828
    },
    "medianOperatingMargin": 0.059,
    "medianOperatingMargin5yAgo": 0.0473,
    "sectorFiscalYear": 2025,
    "shareOfSectorRevenue": 0.013962,
    "shareOfSectorProfit": 0.022925,
    "shareOfSectorRevenue5yAgo": 0.026511,
    "shareOfSectorProfit5yAgo": 0.026833,
    "isFinancial": false,
    "notApplicable": {}
  },
  "company": {
    "ticker": "LULU",
    "name": "Lululemon Athletica Inc.",
    "sector": "Consumer Cyclical",
    "industry": "Apparel - Retail",
    "fiscalYear": 2024,
    "reportingCurrency": "USD",
    "totalDebt": 1575791000,
    "totalDebtUsd": 1575791000,
    "operatingIncome": 2505697000,
    "operatingIncomeUsd": 2505697000,
    "interestPerPoint": 15757910,
    "interestPerPointUsd": 15757910,
    "interestPerPointPctOfOperatingIncome": 0.0063,
    "interestCoverage": null,
    "syntheticRating": null,
    "revenueChange2020": 0.1062,
    "grossMargin": {
      "2020": 0.559758912,
      "2021": 0.576759773,
      "2022": 0.553890639,
      "2023": 0.583141999
    },
    "growth": {
      "companyCagr5y": 0.195726,
      "industryCagr5y": 0.049543,
      "industryPoints": 0.049543,
      "sharePoints": 0.146183,
      "companyCagrUnrounded": 0.19572565,
      "shareNow": 0.040757,
      "shareThen": 0.019623,
      "years": 5
    },
    "margin": {
      "company": 0.236651,
      "companyUnrounded": 0.2366516,
      "industryMedian": 0.058961,
      "groupMedian": 0.046517,
      "industryPart": 0.058961,
      "groupPart": -0.012444,
      "companyPart": 0.190134,
      "group": "High SG&A intensity, low cost vs peers",
      "firmCount": 119
    },
    "group": {
      "label": "High SG&A intensity, low cost vs peers",
      "firmCount": 40,
      "medianPreTaxRoic": 0.0502,
      "rankByPreTaxRoic": 2,
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
      "ticker": "TJX",
      "name": "The TJX Companies, Inc.",
      "revenueUsd": 54217000000,
      "interestCoverage": 73.38,
      "netDebtToEbitda": 0.99,
      "interestPerPointPctOfOperatingIncome": 0.0216,
      "revenueChange2020": 0.0704,
      "grossMarginChange2020to2022": 0.04,
      "operatingLeverage": 2.249,
      "shareChange5y": 1.65,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "ITX.WA",
      "name": "Industria de Diseño Textil, S.A.",
      "revenueUsd": 44749070868,
      "interestCoverage": 21.56,
      "netDebtToEbitda": -0.11,
      "interestPerPointPctOfOperatingIncome": 0.0076,
      "revenueChange2020": -0.2787,
      "grossMarginChange2020to2022": -1.08,
      "operatingLeverage": 1.543,
      "shareChange5y": 1.07,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "ROST",
      "name": "Ross Stores, Inc.",
      "revenueUsd": 21129219000,
      "interestCoverage": 40.79,
      "netDebtToEbitda": 0.29,
      "interestPerPointPctOfOperatingIncome": 0.022,
      "revenueChange2020": -0.2187,
      "grossMarginChange2020to2022": 3.91,
      "operatingLeverage": 3.262,
      "shareChange5y": 0.22,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "9983.T",
      "name": "Fast Retailing Co., Ltd.",
      "revenueUsd": 19505303463,
      "interestCoverage": 43.72,
      "netDebtToEbitda": -1.03,
      "interestPerPointPctOfOperatingIncome": 0.0098,
      "revenueChange2020": -0.123,
      "grossMarginChange2020to2022": 3.87,
      "operatingLeverage": 2.244,
      "shareChange5y": 0.41,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    },
    {
      "ticker": "GAP",
      "name": "The Gap, Inc.",
      "revenueUsd": 15086000000,
      "interestCoverage": 12.78,
      "netDebtToEbitda": 1.82,
      "interestPerPointPctOfOperatingIncome": 0.0492,
      "revenueChange2020": -0.1577,
      "grossMarginChange2020to2022": 0.22,
      "operatingLeverage": 74.499,
      "shareChange5y": -2.27,
      "roicMinusWacc": null,
      "isFinancial": false,
      "notApplicable": {}
    }
  ]
} as const satisfies ConnectionsData;
