// Regenerated verbatim from the live GET /api/connections payload
// (JPM, September 2026). Exposure rows are trimmed to the
// first five. Do not hand-edit: re-fetch and regenerate instead.

import type { ConnectionsData } from "../connectionsTypes";

export const jpmFixture = {
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
    "name": "Financial Services",
    "fiscalYear": 2025,
    "coverage": 0.8707,
    "firmCount": 2181,
    "duplicateListingsDropped": 8,
    "nullIndustryRowsDropped": 0,
    "valueScore": null,
    "valueRank": null,
    "sectorCount": null,
    "medianInterestCoverage": null,
    "medianNetDebtToEbitda": null,
    "shareCoverageBelow2": null,
    "firmsWithInterest": 1847,
    "revenueChange2020": 0.0296,
    "grossMargin": {
      "2020": null,
      "2021": null,
      "2022": null,
      "2023": null
    },
    "medianOperatingMargin": 0.2214,
    "medianOperatingMargin5yAgo": 0.2181,
    "isFinancial": true,
    "notApplicable": {
      "medianInterestCoverage": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
      "medianNetDebtToEbitda": "Deposits and other funding sit in debt while EBITDA excludes the interest those liabilities earn, so net debt to EBITDA has no comparable meaning.",
      "shareCoverageBelow2": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
      "grossMargin": "Banks and insurers report no cost of revenue, so the stored gross margin is 1.0 by construction rather than a measure of pricing."
    }
  },
  "industry": {
    "name": "Banks - Diversified",
    "sector": "Financial Services",
    "fiscalYear": 2025,
    "coverage": 0.9535,
    "firmCount": 40,
    "duplicateListingsDropped": 1,
    "cr4": 0.3355,
    "hhi": 536.5,
    "top5ShareChange5y": 0.99,
    "top5ShareChangeFirmsCompared": 5,
    "revenueCagr5y": 0.1556,
    "medianInterestCoverage": null,
    "medianNetDebtToEbitda": null,
    "shareCoverageBelow2": null,
    "firmsWithInterest": 37,
    "revenueChange2020": -0.0921,
    "grossMargin": {
      "2020": null,
      "2021": null,
      "2022": null,
      "2023": null
    },
    "medianOperatingMargin": 0.204,
    "medianOperatingMargin5yAgo": 0.2353,
    "sectorFiscalYear": 2025,
    "shareOfSectorRevenue": 0.229998,
    "shareOfSectorProfit": 0.262941,
    "shareOfSectorRevenue5yAgo": 0.173885,
    "shareOfSectorProfit5yAgo": 0.252006,
    "isFinancial": true,
    "notApplicable": {
      "medianInterestCoverage": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
      "medianNetDebtToEbitda": "Deposits and other funding sit in debt while EBITDA excludes the interest those liabilities earn, so net debt to EBITDA has no comparable meaning.",
      "shareCoverageBelow2": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
      "grossMargin": "Banks and insurers report no cost of revenue, so the stored gross margin is 1.0 by construction rather than a measure of pricing."
    }
  },
  "company": {
    "ticker": "JPM",
    "name": "JPMorgan Chase & Co.",
    "sector": "Financial Services",
    "industry": "Banks - Diversified",
    "fiscalYear": 2025,
    "reportingCurrency": "USD",
    "totalDebt": 942378000000,
    "totalDebtUsd": 942378000000,
    "operatingIncome": 72595000000,
    "operatingIncomeUsd": 72595000000,
    "interestPerPoint": null,
    "interestPerPointUsd": null,
    "interestPerPointPctOfOperatingIncome": null,
    "interestCoverage": null,
    "syntheticRating": null,
    "revenueChange2020": -0.0889,
    "grossMargin": {
      "2020": null,
      "2021": null,
      "2022": null,
      "2023": null
    },
    "growth": {
      "companyCagr5y": 0.15351,
      "industryCagr5y": 0.155605,
      "industryPoints": 0.155605,
      "sharePoints": -0.002095,
      "companyCagrUnrounded": 0.15351049,
      "shareNow": 0.102877,
      "shareThen": 0.10396,
      "years": 5
    },
    "margin": {
      "company": 0.259505,
      "companyUnrounded": 0.25950419,
      "industryMedian": 0.204047,
      "groupMedian": 0.248513,
      "industryPart": 0.204047,
      "groupPart": 0.044467,
      "companyPart": 0.010991,
      "group": "High SG&A intensity, high PP&E intensity",
      "firmCount": 40
    },
    "group": {
      "label": "High SG&A intensity, high PP&E intensity",
      "firmCount": 12,
      "medianPreTaxRoic": 0.0444,
      "rankByPreTaxRoic": 5,
      "axes": [
        "brandService",
        "capitalIntensity"
      ]
    },
    "isFinancial": true,
    "notApplicable": {
      "interestCoverage": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
      "syntheticRating": "The synthetic rating is read off an interest-coverage table calibrated on non-financial firms, so it misreads a bank or insurer.",
      "interestPerPoint": "A one point rise in borrowing costs passes through a bank's asset side as well as its liabilities, so the debt times one point figure is not an upper bound on the earnings hit.",
      "interestPerPointUsd": "A one point rise in borrowing costs passes through a bank's asset side as well as its liabilities, so the debt times one point figure is not an upper bound on the earnings hit.",
      "interestPerPointPctOfOperatingIncome": "A one point rise in borrowing costs passes through a bank's asset side as well as its liabilities, so the debt times one point figure is not an upper bound on the earnings hit.",
      "grossMargin": "Banks and insurers report no cost of revenue, so the stored gross margin is 1.0 by construction rather than a measure of pricing."
    }
  },
  "exposures": [
    {
      "ticker": "JPM",
      "name": "JPMorgan Chase & Co.",
      "revenueUsd": 279745000000,
      "interestCoverage": null,
      "netDebtToEbitda": null,
      "interestPerPointPctOfOperatingIncome": null,
      "revenueChange2020": -0.0889,
      "grossMarginChange2020to2022": null,
      "operatingLeverage": -1.001,
      "shareChange5y": -0.11,
      "roicMinusWacc": null,
      "isFinancial": true,
      "notApplicable": {
        "interestCoverage": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
        "netDebtToEbitda": "Deposits and other funding sit in debt while EBITDA excludes the interest those liabilities earn, so net debt to EBITDA has no comparable meaning.",
        "interestPerPointPctOfOperatingIncome": "A one point rise in borrowing costs passes through a bank's asset side as well as its liabilities, so the debt times one point figure is not an upper bound on the earnings hit.",
        "grossMarginChange2020to2022": "Banks and insurers report no cost of revenue, so the stored gross margin is 1.0 by construction rather than a measure of pricing."
      }
    },
    {
      "ticker": "601398.SS",
      "name": "Industrial & Commercial Bank of China Ltd.",
      "revenueUsd": 229372274956,
      "interestCoverage": null,
      "netDebtToEbitda": null,
      "interestPerPointPctOfOperatingIncome": null,
      "revenueChange2020": 0.0012,
      "grossMarginChange2020to2022": null,
      "operatingLeverage": -0.105,
      "shareChange5y": 1.28,
      "roicMinusWacc": null,
      "isFinancial": true,
      "notApplicable": {
        "interestCoverage": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
        "netDebtToEbitda": "Deposits and other funding sit in debt while EBITDA excludes the interest those liabilities earn, so net debt to EBITDA has no comparable meaning.",
        "interestPerPointPctOfOperatingIncome": "A one point rise in borrowing costs passes through a bank's asset side as well as its liabilities, so the debt times one point figure is not an upper bound on the earnings hit.",
        "grossMarginChange2020to2022": "Banks and insurers report no cost of revenue, so the stored gross margin is 1.0 by construction rather than a measure of pricing."
      }
    },
    {
      "ticker": "0939.HK",
      "name": "China Construction Bank Corporation",
      "revenueUsd": 201841898031,
      "interestCoverage": null,
      "netDebtToEbitda": null,
      "interestPerPointPctOfOperatingIncome": null,
      "revenueChange2020": 0.0703,
      "grossMarginChange2020to2022": null,
      "operatingLeverage": -0.031,
      "shareChange5y": -1.56,
      "roicMinusWacc": null,
      "isFinancial": true,
      "notApplicable": {
        "interestCoverage": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
        "netDebtToEbitda": "Deposits and other funding sit in debt while EBITDA excludes the interest those liabilities earn, so net debt to EBITDA has no comparable meaning.",
        "interestPerPointPctOfOperatingIncome": "A one point rise in borrowing costs passes through a bank's asset side as well as its liabilities, so the debt times one point figure is not an upper bound on the earnings hit.",
        "grossMarginChange2020to2022": "Banks and insurers report no cost of revenue, so the stored gross margin is 1.0 by construction rather than a measure of pricing."
      }
    },
    {
      "ticker": "1288.HK",
      "name": "Agricultural Bank of China Limited",
      "revenueUsd": 201406676252,
      "interestCoverage": null,
      "netDebtToEbitda": null,
      "interestPerPointPctOfOperatingIncome": null,
      "revenueChange2020": -0.2114,
      "grossMarginChange2020to2022": null,
      "operatingLeverage": -0.127,
      "shareChange5y": 1.52,
      "roicMinusWacc": null,
      "isFinancial": true,
      "notApplicable": {
        "interestCoverage": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
        "netDebtToEbitda": "Deposits and other funding sit in debt while EBITDA excludes the interest those liabilities earn, so net debt to EBITDA has no comparable meaning.",
        "interestPerPointPctOfOperatingIncome": "A one point rise in borrowing costs passes through a bank's asset side as well as its liabilities, so the debt times one point figure is not an upper bound on the earnings hit.",
        "grossMarginChange2020to2022": "Banks and insurers report no cost of revenue, so the stored gross margin is 1.0 by construction rather than a measure of pricing."
      }
    },
    {
      "ticker": "BAC",
      "name": "Bank of America Corporation",
      "revenueUsd": 191567000000,
      "interestCoverage": null,
      "netDebtToEbitda": null,
      "interestPerPointPctOfOperatingIncome": null,
      "revenueChange2020": -0.1746,
      "grossMarginChange2020to2022": null,
      "operatingLeverage": -64.043,
      "shareChange5y": -0.46,
      "roicMinusWacc": null,
      "isFinancial": true,
      "notApplicable": {
        "interestCoverage": "Interest expense is a bank's cost of funding, not a fixed charge covered out of operating income, so interest coverage does not measure the same thing here.",
        "netDebtToEbitda": "Deposits and other funding sit in debt while EBITDA excludes the interest those liabilities earn, so net debt to EBITDA has no comparable meaning.",
        "interestPerPointPctOfOperatingIncome": "A one point rise in borrowing costs passes through a bank's asset side as well as its liabilities, so the debt times one point figure is not an upper bound on the earnings hit.",
        "grossMarginChange2020to2022": "Banks and insurers report no cost of revenue, so the stored gross margin is 1.0 by construction rather than a measure of pricing."
      }
    }
  ]
} as const satisfies ConnectionsData;
