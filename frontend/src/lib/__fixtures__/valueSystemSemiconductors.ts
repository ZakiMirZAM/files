// Generated from the live endpoints on 2026-09-20.
// Regenerate with the throwaway script in lib/__scratch__ when the payload shape changes.

import type { ValueSystemData } from "../groupMapApi";

export const VALUE_SYSTEM_SEMICONDUCTORS: ValueSystemData = {
  "focal": {
    "applicable": true,
    "reason": null,
    "industry": "Semiconductors",
    "fiscalYear": 2025,
    "firmCount": 512,
    "thinPeerSet": false,
    "duplicateListingsDropped": 0,
    "hhi": 403.7,
    "hhiFiveYearsAgo": 334.2,
    "medianOperatingMargin": 0.0637,
    "revenueCagr5y": 0.13,
    "daysPayableByYear": [
      {
        "year": 2021,
        "value": 60.99
      },
      {
        "year": 2022,
        "value": 49.64
      },
      {
        "year": 2023,
        "value": 50.76
      },
      {
        "year": 2024,
        "value": 52.82
      },
      {
        "year": 2025,
        "value": 51.61
      }
    ],
    "daysReceivableByYear": [
      {
        "year": 2021,
        "value": 75.15
      },
      {
        "year": 2022,
        "value": 69.72
      },
      {
        "year": 2023,
        "value": 72.86
      },
      {
        "year": 2024,
        "value": 78.2
      },
      {
        "year": 2025,
        "value": 77.51
      }
    ]
  },
  "supplier": null,
  "buyer": null
};

/** A partner industry with a single reporting company. */
export const VALUE_SYSTEM_THIN_PARTNER: ValueSystemData = {
  "focal": {
    "applicable": true,
    "reason": null,
    "industry": "Semiconductors",
    "fiscalYear": 2025,
    "firmCount": 512,
    "thinPeerSet": false,
    "duplicateListingsDropped": 0,
    "hhi": 403.7,
    "hhiFiveYearsAgo": 334.2,
    "medianOperatingMargin": 0.0637,
    "revenueCagr5y": 0.13,
    "daysPayableByYear": [
      {
        "year": 2021,
        "value": 60.99
      },
      {
        "year": 2022,
        "value": 49.64
      },
      {
        "year": 2023,
        "value": 50.76
      },
      {
        "year": 2024,
        "value": 52.82
      },
      {
        "year": 2025,
        "value": 51.61
      }
    ],
    "daysReceivableByYear": [
      {
        "year": 2021,
        "value": 75.15
      },
      {
        "year": 2022,
        "value": 69.72
      },
      {
        "year": 2023,
        "value": 72.86
      },
      {
        "year": 2024,
        "value": 78.2
      },
      {
        "year": 2025,
        "value": 77.51
      }
    ]
  },
  "supplier": {
    "applicable": true,
    "reason": null,
    "industry": "Semiconductor Equipment & Materials",
    "fiscalYear": 2025,
    "firmCount": 1,
    "thinPeerSet": true,
    "duplicateListingsDropped": 0,
    "hhi": 10000,
    "hhiFiveYearsAgo": 10000,
    "medianOperatingMargin": -0.4444,
    "revenueCagr5y": 0.0439
  },
  "buyer": null
};

/** An industry with tickers but no financial rows. */
export const VALUE_SYSTEM_EMPTY: ValueSystemData = {
  "focal": {
    "applicable": false,
    "reason": "No peer data found for this industry",
    "industry": "Banking Services",
    "fiscalYear": null,
    "firmCount": 0,
    "thinPeerSet": true,
    "duplicateListingsDropped": 0,
    "hhi": null,
    "hhiFiveYearsAgo": null,
    "medianOperatingMargin": null,
    "revenueCagr5y": null,
    "daysPayableByYear": [],
    "daysReceivableByYear": []
  },
  "supplier": null,
  "buyer": null
};
