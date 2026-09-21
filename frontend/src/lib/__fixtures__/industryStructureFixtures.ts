// Generated from the live endpoints on 2026-09-20.
// Regenerate with the throwaway script in lib/__scratch__ when the payload shape changes.

import type { IndustryStructure } from "../industryStructureApi";

export const SEMICONDUCTORS: IndustryStructure = {
  "applicable": true,
  "reason": null,
  "industry": "Semiconductors",
  "fiscalYear": 2025,
  "coverage": 0.9309,
  "firmCount": 512,
  "duplicateListingsDropped": 0,
  "netEntryWindow": [
    2020,
    2023
  ],
  "concentration": {
    "firmCount": 512,
    "cr4": {
      "value": 0.3264,
      "percentile": 0.19230769230769232
    },
    "cr8": {
      "value": 0.4737,
      "percentile": 0.19230769230769232
    },
    "hhi": {
      "value": 403.7,
      "percentile": 0.17132867132867133
    },
    "top10": [
      {
        "rank": 1,
        "ticker": "NVDA",
        "name": "NVIDIA Corporation",
        "revenueUsd": 130497000000,
        "share": 0.111513,
        "relativeShare": 1
      },
      {
        "rank": 2,
        "ticker": "TSM",
        "name": "Taiwan Semiconductor Manufacturing Company Limited",
        "revenueUsd": 119017927381.9551,
        "share": 0.101704,
        "relativeShare": 0.912
      },
      {
        "rank": 3,
        "ticker": "000660.KS",
        "name": "SK hynix Inc.",
        "revenueUsd": 68583180283.05075,
        "share": 0.058606,
        "relativeShare": 0.5256
      },
      {
        "rank": 4,
        "ticker": "AVGO",
        "name": "Broadcom Inc.",
        "revenueUsd": 63887000000,
        "share": 0.054593,
        "relativeShare": 0.4896
      },
      {
        "rank": 5,
        "ticker": "INTC",
        "name": "Intel Corporation",
        "revenueUsd": 52853000000,
        "share": 0.045164,
        "relativeShare": 0.405
      },
      {
        "rank": 6,
        "ticker": "QCOM",
        "name": "QUALCOMM Incorporated",
        "revenueUsd": 44284000000,
        "share": 0.037842,
        "relativeShare": 0.3393
      },
      {
        "rank": 7,
        "ticker": "ASML",
        "name": "ASML Holding N.V.",
        "revenueUsd": 37840030357.32507,
        "share": 0.032335,
        "relativeShare": 0.29
      },
      {
        "rank": 8,
        "ticker": "MU",
        "name": "Micron Technology, Inc.",
        "revenueUsd": 37378000000,
        "share": 0.03194,
        "relativeShare": 0.2864
      },
      {
        "rank": 9,
        "ticker": "3036.TW",
        "name": "WT Microelectronics Co., Ltd.",
        "revenueUsd": 36806334272.21328,
        "share": 0.031452,
        "relativeShare": 0.282
      },
      {
        "rank": 10,
        "ticker": "AMD",
        "name": "Advanced Micro Devices, Inc.",
        "revenueUsd": 34639000000,
        "share": 0.0296,
        "relativeShare": 0.2654
      }
    ]
  },
  "entryEvidence": {
    "ppeToRevenue": {
      "value": 0.3285,
      "percentile": 0.583916083916084
    },
    "capexToRevenue": {
      "value": 0.0551,
      "percentile": 0.7447552447552448
    },
    "rdToRevenue": {
      "value": 0.0566,
      "percentile": 0.9685314685314685
    },
    "sgaToRevenue": {
      "value": 0.0749,
      "percentile": 0.3881118881118881
    },
    "scaleSlope": 0.033297,
    "scaleR2": 0.1034,
    "scaleFirms": 462,
    "grossMarginMedian": {
      "value": 0.3321,
      "percentile": 0.548951048951049
    },
    "grossMarginIqr": 0.3024,
    "incumbentCashToAssets": {
      "value": 0.2701,
      "percentile": 0.9335664335664335
    },
    "netEntry5y": 38,
    "leaderCogsToRevenue5y": [
      {
        "ticker": "NVDA",
        "name": "NVIDIA Corporation",
        "years": [
          {
            "year": 2021,
            "value": 0.3766
          },
          {
            "year": 2022,
            "value": 0.3507
          },
          {
            "year": 2023,
            "value": 0.4307
          },
          {
            "year": 2024,
            "value": 0.2728
          },
          {
            "year": 2025,
            "value": 0.2501
          }
        ]
      },
      {
        "ticker": "TSM",
        "name": "Taiwan Semiconductor Manufacturing Company Limited",
        "years": [
          {
            "year": 2021,
            "value": 0.4837
          },
          {
            "year": 2022,
            "value": 0.4044
          },
          {
            "year": 2023,
            "value": 0.4564
          },
          {
            "year": 2024,
            "value": 0.4388
          },
          {
            "year": 2025,
            "value": 0.4011
          }
        ]
      },
      {
        "ticker": "000660.KS",
        "name": "SK hynix Inc.",
        "years": [
          {
            "year": 2021,
            "value": 0.5592
          },
          {
            "year": 2022,
            "value": 0.6498
          },
          {
            "year": 2023,
            "value": 1.0163
          },
          {
            "year": 2024,
            "value": 0.5192
          },
          {
            "year": 2025,
            "value": 0.3959
          }
        ]
      },
      {
        "ticker": "AVGO",
        "name": "Broadcom Inc.",
        "years": [
          {
            "year": 2021,
            "value": 0.4577
          },
          {
            "year": 2022,
            "value": 0.3799
          },
          {
            "year": 2023,
            "value": 0.3495
          },
          {
            "year": 2024,
            "value": 0.4276
          },
          {
            "year": 2025,
            "value": 0.3223
          }
        ]
      }
    ]
  },
  "exitEvidence": {
    "ppeToAssets": {
      "value": 0.1796,
      "percentile": 0.47202797202797203
    },
    "intangiblesToAssets": {
      "value": 0.0082,
      "percentile": 0.3811188811188811
    },
    "shareOfFirmsWithCapexBelowDepreciation": 0.5217
  },
  "rivalryEvidence": {
    "revenueCagr5y": {
      "value": 0.13,
      "percentile": 0.8286713286713286
    },
    "daToRevenue": {
      "value": 0.0516,
      "percentile": 0.6188811188811189
    },
    "revenueSpreadAmongTop10": 0.5576
  },
  "shareStability": {
    "top5ShareChange5y": 4.9277,
    "shareRankCorrelation5y": 0.9463
  },
  "evolution": {
    "netEntryWindow": [
      2020,
      2023
    ],
    "netEntryRule": "A firm counts as an exit only once its last reported year is 2 years behind fiscal 2025, or once security_map marks it delisted. Listings, not firm births. Coverage widened in 2019, which shows as a large one-off entry count that year.",
    "revenue": [
      {
        "year": 2016,
        "value": 414332333040
      },
      {
        "year": 2017,
        "value": 487301719877
      },
      {
        "year": 2018,
        "value": 563103279264
      },
      {
        "year": 2019,
        "value": 558334409170
      },
      {
        "year": 2020,
        "value": 611066462684
      },
      {
        "year": 2021,
        "value": 795779598637
      },
      {
        "year": 2022,
        "value": 934792501836
      },
      {
        "year": 2023,
        "value": 879692347353
      },
      {
        "year": 2024,
        "value": 999100363596
      },
      {
        "year": 2025,
        "value": 1170238974793
      }
    ],
    "growth": [
      {
        "year": 2017,
        "value": 0.1761
      },
      {
        "year": 2018,
        "value": 0.1556
      },
      {
        "year": 2019,
        "value": -0.0085
      },
      {
        "year": 2020,
        "value": 0.0944
      },
      {
        "year": 2021,
        "value": 0.3023
      },
      {
        "year": 2022,
        "value": 0.1747
      },
      {
        "year": 2023,
        "value": -0.0589
      },
      {
        "year": 2024,
        "value": 0.1357
      },
      {
        "year": 2025,
        "value": 0.1713
      }
    ],
    "firmCount": [
      {
        "year": 2016,
        "value": 385
      },
      {
        "year": 2017,
        "value": 404
      },
      {
        "year": 2018,
        "value": 414
      },
      {
        "year": 2019,
        "value": 508
      },
      {
        "year": 2020,
        "value": 529
      },
      {
        "year": 2021,
        "value": 536
      },
      {
        "year": 2022,
        "value": 537
      },
      {
        "year": 2023,
        "value": 544
      },
      {
        "year": 2024,
        "value": 550
      },
      {
        "year": 2025,
        "value": 512
      }
    ],
    "netEntry": [
      {
        "year": 2016,
        "value": 24
      },
      {
        "year": 2017,
        "value": 17
      },
      {
        "year": 2018,
        "value": 11
      },
      {
        "year": 2019,
        "value": 95
      },
      {
        "year": 2020,
        "value": 21
      },
      {
        "year": 2021,
        "value": 8
      },
      {
        "year": 2022,
        "value": 2
      },
      {
        "year": 2023,
        "value": 7
      }
    ],
    "hhi": [
      {
        "year": 2016,
        "value": 393.3
      },
      {
        "year": 2017,
        "value": 349.2
      },
      {
        "year": 2018,
        "value": 347.7
      },
      {
        "year": 2019,
        "value": 335.4
      },
      {
        "year": 2020,
        "value": 334.2
      },
      {
        "year": 2021,
        "value": 273
      },
      {
        "year": 2022,
        "value": 246.4
      },
      {
        "year": 2023,
        "value": 241.2
      },
      {
        "year": 2024,
        "value": 289.9
      },
      {
        "year": 2025,
        "value": 403.7
      }
    ],
    "grossMarginSpread": [
      {
        "year": 2016,
        "value": 0.2364
      },
      {
        "year": 2017,
        "value": 0.2314
      },
      {
        "year": 2018,
        "value": 0.2258
      },
      {
        "year": 2019,
        "value": 0.2425
      },
      {
        "year": 2020,
        "value": 0.2358
      },
      {
        "year": 2021,
        "value": 0.2436
      },
      {
        "year": 2022,
        "value": 0.2412
      },
      {
        "year": 2023,
        "value": 0.2645
      },
      {
        "year": 2024,
        "value": 0.2684
      },
      {
        "year": 2025,
        "value": 0.3024
      }
    ],
    "rdIntensitySpread": [
      {
        "year": 2016,
        "value": 0.1289
      },
      {
        "year": 2017,
        "value": 0.1222
      },
      {
        "year": 2018,
        "value": 0.1202
      },
      {
        "year": 2019,
        "value": 0.1328
      },
      {
        "year": 2020,
        "value": 0.1313
      },
      {
        "year": 2021,
        "value": 0.1201
      },
      {
        "year": 2022,
        "value": 0.1217
      },
      {
        "year": 2023,
        "value": 0.1612
      },
      {
        "year": 2024,
        "value": 0.1474
      },
      {
        "year": 2025,
        "value": 0.1603
      }
    ],
    "capexToDepreciation": [
      {
        "year": 2016,
        "value": 1.2117
      },
      {
        "year": 2017,
        "value": 1.2126
      },
      {
        "year": 2018,
        "value": 1.3501
      },
      {
        "year": 2019,
        "value": 1.2337
      },
      {
        "year": 2020,
        "value": 1.1383
      },
      {
        "year": 2021,
        "value": 1.4465
      },
      {
        "year": 2022,
        "value": 1.6195
      },
      {
        "year": 2023,
        "value": 1.4743
      },
      {
        "year": 2024,
        "value": 1.3261
      },
      {
        "year": 2025,
        "value": 1.4107
      }
    ],
    "revenueOverPpe": [
      {
        "year": 2016,
        "value": 2.0953
      },
      {
        "year": 2017,
        "value": 2.1662
      },
      {
        "year": 2018,
        "value": 2.1534
      },
      {
        "year": 2019,
        "value": 1.7797
      },
      {
        "year": 2020,
        "value": 1.7449
      },
      {
        "year": 2021,
        "value": 1.9391
      },
      {
        "year": 2022,
        "value": 1.8344
      },
      {
        "year": 2023,
        "value": 1.5192
      },
      {
        "year": 2024,
        "value": 1.5823
      },
      {
        "year": 2025,
        "value": 1.7355
      }
    ]
  },
  "environmentIndicators": {
    "hhi": 403.7,
    "cr4": 0.3264,
    "scaleSlope": 0.033297,
    "scaleR2": 0.1034,
    "revenueCagr5y": 0.13,
    "medianYearsOfHistory": 13,
    "growthFirst5y": 0.0944,
    "growthLast5y": 0.13,
    "capexToDepreciation": 1.4107,
    "inflationAdjusted5yRevenueChange": null,
    "netEntry5y": 38,
    "countries": null
  }
};

export const BANKS_REGIONAL: IndustryStructure = {
  "applicable": true,
  "reason": null,
  "industry": "Banks - Regional",
  "fiscalYear": 2025,
  "coverage": 0.9029,
  "firmCount": 651,
  "duplicateListingsDropped": 0,
  "netEntryWindow": [
    2020,
    2023
  ],
  "concentration": {
    "firmCount": 651,
    "cr4": {
      "value": 0.1437,
      "percentile": 0.01048951048951049
    },
    "cr8": {
      "value": 0.2351,
      "percentile": 0.01048951048951049
    },
    "hhi": {
      "value": 126.6,
      "percentile": 0.01048951048951049
    },
    "top10": [
      {
        "rank": 1,
        "ticker": "BNP.DE",
        "name": "BNP Paribas S.A.",
        "revenueUsd": 137997212397.69458,
        "share": 0.044314,
        "relativeShare": 1
      },
      {
        "rank": 2,
        "ticker": "SBER.ME",
        "name": "Sberbank of Russia",
        "revenueUsd": 134304438136.518,
        "share": 0.043128,
        "relativeShare": 0.9732
      },
      {
        "rank": 3,
        "ticker": "SGE.DE",
        "name": "Société Générale S.A.",
        "revenueUsd": 99800759032.01103,
        "share": 0.032048,
        "relativeShare": 0.7232
      },
      {
        "rank": 4,
        "ticker": "VTBR.ME",
        "name": "VTB Bank (public joint-stock company)",
        "revenueUsd": 75369675108.7904,
        "share": 0.024203,
        "relativeShare": 0.5462
      },
      {
        "rank": 5,
        "ticker": "ITUB",
        "name": "Itaú Unibanco Holding S.A.",
        "revenueUsd": 73582891625.38945,
        "share": 0.023629,
        "relativeShare": 0.5332
      },
      {
        "rank": 6,
        "ticker": "6178.T",
        "name": "Japan Post Holdings Co., Ltd.",
        "revenueUsd": 70619876732.67722,
        "share": 0.022678,
        "relativeShare": 0.5117
      },
      {
        "rank": 7,
        "ticker": "DBK.SW",
        "name": "Deutsche Bank AG",
        "revenueUsd": 70528201852.20242,
        "share": 0.022648,
        "relativeShare": 0.5111
      },
      {
        "rank": 8,
        "ticker": "BBAS3.SA",
        "name": "Banco do Brasil S.A.",
        "revenueUsd": 69945658455.26755,
        "share": 0.022461,
        "relativeShare": 0.5069
      },
      {
        "rank": 9,
        "ticker": "SBID.L",
        "name": "State Bank of India",
        "revenueUsd": 68172404833.71541,
        "share": 0.021892,
        "relativeShare": 0.494
      },
      {
        "rank": 10,
        "ticker": "601166.SS",
        "name": "Industrial Bank Co., Ltd.",
        "revenueUsd": 54058258361.6823,
        "share": 0.017359,
        "relativeShare": 0.3917
      }
    ]
  },
  "entryEvidence": {
    "ppeToRevenue": {
      "value": 0.1567,
      "percentile": 0.32517482517482516
    },
    "capexToRevenue": {
      "value": 0.0144,
      "percentile": 0.26223776223776224
    },
    "rdToRevenue": {
      "value": 0,
      "percentile": 0.3811188811188811
    },
    "sgaToRevenue": {
      "value": 0.1856,
      "percentile": 0.7727272727272727
    },
    "scaleSlope": 0.001573,
    "scaleR2": 0.0007,
    "scaleFirms": 587,
    "grossMarginMedian": {
      "value": 0.6173,
      "percentile": 0.8706293706293706
    },
    "grossMarginIqr": 0.2276,
    "incumbentCashToAssets": {
      "value": 0.0952,
      "percentile": 0.33916083916083917
    },
    "netEntry5y": 11,
    "leaderCogsToRevenue5y": [
      {
        "ticker": "BNP.DE",
        "name": "BNP Paribas S.A.",
        "years": [
          {
            "year": 2021,
            "value": 0.0954
          },
          {
            "year": 2022,
            "value": 0.2596
          },
          {
            "year": 2023,
            "value": 1.4057
          },
          {
            "year": 2024,
            "value": 1.3883
          },
          {
            "year": 2025,
            "value": 0.4225
          }
        ]
      },
      {
        "ticker": "SBER.ME",
        "name": "Sberbank of Russia",
        "years": [
          {
            "year": 2021,
            "value": 0.2529
          },
          {
            "year": 2022,
            "value": 0.4435
          },
          {
            "year": 2023,
            "value": 0
          },
          {
            "year": 2024,
            "value": 0
          },
          {
            "year": 2025,
            "value": 0.5976
          }
        ]
      },
      {
        "ticker": "SGE.DE",
        "name": "Société Générale S.A.",
        "years": [
          {
            "year": 2021,
            "value": 0.2141
          },
          {
            "year": 2022,
            "value": 0.3315
          },
          {
            "year": 2023,
            "value": 0.4909
          },
          {
            "year": 2024,
            "value": 0
          },
          {
            "year": 2025,
            "value": 0.3895
          }
        ]
      },
      {
        "ticker": "VTBR.ME",
        "name": "VTB Bank (public joint-stock company)",
        "years": [
          {
            "year": 2021,
            "value": 0
          },
          {
            "year": 2022,
            "value": 0
          },
          {
            "year": 2023,
            "value": 0
          },
          {
            "year": 2024,
            "value": 0
          },
          {
            "year": 2025,
            "value": 0.7486
          }
        ]
      }
    ]
  },
  "exitEvidence": {
    "ppeToAssets": {
      "value": 0.0083,
      "percentile": 0.10839160839160839
    },
    "intangiblesToAssets": {
      "value": 0.0006,
      "percentile": 0.16433566433566432
    },
    "shareOfFirmsWithCapexBelowDepreciation": 0.5289
  },
  "rivalryEvidence": {
    "revenueCagr5y": {
      "value": 0.131,
      "percentile": 0.8426573426573427
    },
    "daToRevenue": {
      "value": 0.0132,
      "percentile": 0.0944055944055944
    },
    "revenueSpreadAmongTop10": 0.3393
  },
  "shareStability": {
    "top5ShareChange5y": 1.2225,
    "shareRankCorrelation5y": 0.935
  },
  "evolution": {
    "netEntryWindow": [
      2020,
      2023
    ],
    "netEntryRule": "A firm counts as an exit only once its last reported year is 2 years behind fiscal 2025, or once security_map marks it delisted. Listings, not firm births. Coverage widened in 2019, which shows as a large one-off entry count that year.",
    "revenue": [
      {
        "year": 2016,
        "value": 1427921635292
      },
      {
        "year": 2017,
        "value": 1564805396038
      },
      {
        "year": 2018,
        "value": 1604273559452
      },
      {
        "year": 2019,
        "value": 1641431162280
      },
      {
        "year": 2020,
        "value": 1617858383943
      },
      {
        "year": 2021,
        "value": 1771691707219
      },
      {
        "year": 2022,
        "value": 2078567713125
      },
      {
        "year": 2023,
        "value": 2319681795992
      },
      {
        "year": 2024,
        "value": 2904552348821
      },
      {
        "year": 2025,
        "value": 3114083499667
      }
    ],
    "growth": [
      {
        "year": 2017,
        "value": 0.0959
      },
      {
        "year": 2018,
        "value": 0.0252
      },
      {
        "year": 2019,
        "value": 0.0232
      },
      {
        "year": 2020,
        "value": -0.0144
      },
      {
        "year": 2021,
        "value": 0.0951
      },
      {
        "year": 2022,
        "value": 0.1732
      },
      {
        "year": 2023,
        "value": 0.116
      },
      {
        "year": 2024,
        "value": 0.2521
      },
      {
        "year": 2025,
        "value": 0.0721
      }
    ],
    "firmCount": [
      {
        "year": 2016,
        "value": 689
      },
      {
        "year": 2017,
        "value": 697
      },
      {
        "year": 2018,
        "value": 696
      },
      {
        "year": 2019,
        "value": 710
      },
      {
        "year": 2020,
        "value": 715
      },
      {
        "year": 2021,
        "value": 715
      },
      {
        "year": 2022,
        "value": 716
      },
      {
        "year": 2023,
        "value": 721
      },
      {
        "year": 2024,
        "value": 721
      },
      {
        "year": 2025,
        "value": 651
      }
    ],
    "netEntry": [
      {
        "year": 2016,
        "value": 17
      },
      {
        "year": 2017,
        "value": 8
      },
      {
        "year": 2018,
        "value": 2
      },
      {
        "year": 2019,
        "value": 10
      },
      {
        "year": 2020,
        "value": 6
      },
      {
        "year": 2021,
        "value": 1
      },
      {
        "year": 2022,
        "value": 3
      },
      {
        "year": 2023,
        "value": 1
      }
    ],
    "hhi": [
      {
        "year": 2016,
        "value": 160.5
      },
      {
        "year": 2017,
        "value": 174.5
      },
      {
        "year": 2018,
        "value": 186.8
      },
      {
        "year": 2019,
        "value": 141.3
      },
      {
        "year": 2020,
        "value": 152.6
      },
      {
        "year": 2021,
        "value": 157.1
      },
      {
        "year": 2022,
        "value": 144.6
      },
      {
        "year": 2023,
        "value": 113.4
      },
      {
        "year": 2024,
        "value": 103.4
      },
      {
        "year": 2025,
        "value": 126.6
      }
    ],
    "grossMarginSpread": [
      {
        "year": 2016,
        "value": 0.1641
      },
      {
        "year": 2017,
        "value": 0.1721
      },
      {
        "year": 2018,
        "value": 0.2104
      },
      {
        "year": 2019,
        "value": 0.2302
      },
      {
        "year": 2020,
        "value": 0.2243
      },
      {
        "year": 2021,
        "value": 0.1117
      },
      {
        "year": 2022,
        "value": 0.1756
      },
      {
        "year": 2023,
        "value": 0.3825
      },
      {
        "year": 2024,
        "value": 0.2857
      },
      {
        "year": 2025,
        "value": 0.2276
      }
    ],
    "rdIntensitySpread": [
      {
        "year": 2016,
        "value": 0
      },
      {
        "year": 2017,
        "value": 0
      },
      {
        "year": 2018,
        "value": 0
      },
      {
        "year": 2019,
        "value": 0
      },
      {
        "year": 2020,
        "value": 0
      },
      {
        "year": 2021,
        "value": 0
      },
      {
        "year": 2022,
        "value": 0
      },
      {
        "year": 2023,
        "value": 0
      },
      {
        "year": 2024,
        "value": 0
      },
      {
        "year": 2025,
        "value": 0
      }
    ],
    "capexToDepreciation": [
      {
        "year": 2016,
        "value": 1.6572
      },
      {
        "year": 2017,
        "value": 1.3728
      },
      {
        "year": 2018,
        "value": 1.4955
      },
      {
        "year": 2019,
        "value": 1.2124
      },
      {
        "year": 2020,
        "value": 1.0255
      },
      {
        "year": 2021,
        "value": 1.3084
      },
      {
        "year": 2022,
        "value": 1.1025
      },
      {
        "year": 2023,
        "value": 1.3768
      },
      {
        "year": 2024,
        "value": 1.4165
      },
      {
        "year": 2025,
        "value": 1.5766
      }
    ],
    "revenueOverPpe": [
      {
        "year": 2016,
        "value": 4.0849
      },
      {
        "year": 2017,
        "value": 4.2903
      },
      {
        "year": 2018,
        "value": 4.2227
      },
      {
        "year": 2019,
        "value": 3.5655
      },
      {
        "year": 2020,
        "value": 3.4694
      },
      {
        "year": 2021,
        "value": 3.6359
      },
      {
        "year": 2022,
        "value": 4.2766
      },
      {
        "year": 2023,
        "value": 4.3474
      },
      {
        "year": 2024,
        "value": 5.2028
      },
      {
        "year": 2025,
        "value": 5.4084
      }
    ]
  },
  "environmentIndicators": {
    "hhi": 126.6,
    "cr4": 0.1437,
    "scaleSlope": 0.001573,
    "scaleR2": 0.0007,
    "revenueCagr5y": 0.131,
    "medianYearsOfHistory": 13,
    "growthFirst5y": 0.0362,
    "growthLast5y": 0.131,
    "capexToDepreciation": 1.5766,
    "inflationAdjusted5yRevenueChange": null,
    "netEntry5y": 11,
    "countries": null
  }
};

export const BANKS_DIVERSIFIED: IndustryStructure = {
  "applicable": true,
  "reason": null,
  "industry": "Banks - Diversified",
  "fiscalYear": 2025,
  "coverage": 0.9535,
  "firmCount": 40,
  "duplicateListingsDropped": 1,
  "netEntryWindow": [
    2020,
    2023
  ],
  "concentration": {
    "firmCount": 40,
    "cr4": {
      "value": 0.3355,
      "percentile": 0.22727272727272727
    },
    "cr8": {
      "value": 0.5854,
      "percentile": 0.46503496503496505
    },
    "hhi": {
      "value": 536.5,
      "percentile": 0.3111888111888112
    },
    "top10": [
      {
        "rank": 1,
        "ticker": "JPM",
        "name": "JPMorgan Chase & Co.",
        "revenueUsd": 279745000000,
        "share": 0.102877,
        "relativeShare": 1
      },
      {
        "rank": 2,
        "ticker": "601398.SS",
        "name": "Industrial & Commercial Bank of China Ltd.",
        "revenueUsd": 229372274955.8091,
        "share": 0.084352,
        "relativeShare": 0.8199
      },
      {
        "rank": 3,
        "ticker": "0939.HK",
        "name": "China Construction Bank Corporation",
        "revenueUsd": 201841898030.6387,
        "share": 0.074228,
        "relativeShare": 0.7215
      },
      {
        "rank": 4,
        "ticker": "1288.HK",
        "name": "Agricultural Bank of China Limited",
        "revenueUsd": 201406676252.3353,
        "share": 0.074068,
        "relativeShare": 0.72
      },
      {
        "rank": 5,
        "ticker": "BAC",
        "name": "Bank of America Corporation",
        "revenueUsd": 191567000000,
        "share": 0.070449,
        "relativeShare": 0.6848
      },
      {
        "rank": 6,
        "ticker": "BOCN.VI",
        "name": "Bank of China Limited",
        "revenueUsd": 180829449990.09372,
        "share": 0.0665,
        "relativeShare": 0.6464
      },
      {
        "rank": 7,
        "ticker": "C",
        "name": "Citigroup Inc.",
        "revenueUsd": 168302000000,
        "share": 0.061893,
        "relativeShare": 0.6016
      },
      {
        "rank": 8,
        "ticker": "SAN",
        "name": "Banco Santander, S.A.",
        "revenueUsd": 138878713565.588,
        "share": 0.051073,
        "relativeShare": 0.4964
      },
      {
        "rank": 9,
        "ticker": "WFC",
        "name": "Wells Fargo & Company",
        "revenueUsd": 123529000000,
        "share": 0.045428,
        "relativeShare": 0.4416
      },
      {
        "rank": 10,
        "ticker": "RY",
        "name": "Royal Bank of Canada",
        "revenueUsd": 99060286819.63683,
        "share": 0.03643,
        "relativeShare": 0.3541
      }
    ]
  },
  "entryEvidence": {
    "ppeToRevenue": {
      "value": 0.0926,
      "percentile": 0.24825174825174826
    },
    "capexToRevenue": {
      "value": 0.0163,
      "percentile": 0.2902097902097902
    },
    "rdToRevenue": {
      "value": 0,
      "percentile": 0.3811188811188811
    },
    "sgaToRevenue": {
      "value": 0.1634,
      "percentile": 0.6958041958041958
    },
    "scaleSlope": -0.003155,
    "scaleR2": 0.0043,
    "scaleFirms": 37,
    "grossMarginMedian": {
      "value": 0.5045,
      "percentile": 0.8076923076923077
    },
    "grossMarginIqr": 0.2178,
    "incumbentCashToAssets": {
      "value": 0.0941,
      "percentile": 0.3321678321678322
    },
    "netEntry5y": 2,
    "leaderCogsToRevenue5y": [
      {
        "ticker": "JPM",
        "name": "JPMorgan Chase & Co.",
        "years": [
          {
            "year": 2021,
            "value": -0.0288
          },
          {
            "year": 2022,
            "value": 0.2108
          },
          {
            "year": 2023,
            "value": 0.3835
          },
          {
            "year": 2024,
            "value": 0.4136
          },
          {
            "year": 2025,
            "value": 0.4009
          }
        ]
      },
      {
        "ticker": "601398.SS",
        "name": "Industrial & Commercial Bank of China Ltd.",
        "years": [
          {
            "year": 2021,
            "value": 0
          },
          {
            "year": 2022,
            "value": 0
          },
          {
            "year": 2023,
            "value": 0
          },
          {
            "year": 2024,
            "value": 0
          },
          {
            "year": 2025,
            "value": 0.5481
          }
        ]
      },
      {
        "ticker": "0939.HK",
        "name": "China Construction Bank Corporation",
        "years": [
          {
            "year": 2021,
            "value": 0
          },
          {
            "year": 2022,
            "value": 0
          },
          {
            "year": 2023,
            "value": -1.2624
          },
          {
            "year": 2024,
            "value": 0
          },
          {
            "year": 2025,
            "value": 0.5362
          }
        ]
      },
      {
        "ticker": "1288.HK",
        "name": "Agricultural Bank of China Limited",
        "years": [
          {
            "year": 2021,
            "value": 0.7736
          },
          {
            "year": 2022,
            "value": 0.9428
          },
          {
            "year": 2023,
            "value": -0.241
          },
          {
            "year": 2024,
            "value": 0
          },
          {
            "year": 2025,
            "value": 0.4659
          }
        ]
      }
    ]
  },
  "exitEvidence": {
    "ppeToAssets": {
      "value": 0.0041,
      "percentile": 0.08041958041958042
    },
    "intangiblesToAssets": {
      "value": 0.0026,
      "percentile": 0.24125874125874125
    },
    "shareOfFirmsWithCapexBelowDepreciation": 0.6571
  },
  "rivalryEvidence": {
    "revenueCagr5y": {
      "value": 0.1556,
      "percentile": 0.8916083916083916
    },
    "daToRevenue": {
      "value": 0.0182,
      "percentile": 0.13636363636363635
    },
    "revenueSpreadAmongTop10": 0.2905
  },
  "shareStability": {
    "top5ShareChange5y": 0.987,
    "shareRankCorrelation5y": 0.948
  },
  "evolution": {
    "netEntryWindow": [
      2020,
      2023
    ],
    "netEntryRule": "A firm counts as an exit only once its last reported year is 2 years behind fiscal 2025, or once security_map marks it delisted. Listings, not firm births. Coverage widened in 2019, which shows as a large one-off entry count that year.",
    "revenue": [
      {
        "year": 2016,
        "value": 1322311951135
      },
      {
        "year": 2017,
        "value": 1390151471418
      },
      {
        "year": 2018,
        "value": 1451268333188
      },
      {
        "year": 2019,
        "value": 1526194668274
      },
      {
        "year": 2020,
        "value": 1248973400967
      },
      {
        "year": 2021,
        "value": 1295606390531
      },
      {
        "year": 2022,
        "value": 1478519706448
      },
      {
        "year": 2023,
        "value": 2058372822595
      },
      {
        "year": 2024,
        "value": 2353944490798
      },
      {
        "year": 2025,
        "value": 2719227543867
      }
    ],
    "growth": [
      {
        "year": 2017,
        "value": 0.0513
      },
      {
        "year": 2018,
        "value": 0.044
      },
      {
        "year": 2019,
        "value": 0.0516
      },
      {
        "year": 2020,
        "value": -0.1816
      },
      {
        "year": 2021,
        "value": 0.0373
      },
      {
        "year": 2022,
        "value": 0.1412
      },
      {
        "year": 2023,
        "value": 0.3922
      },
      {
        "year": 2024,
        "value": 0.1436
      },
      {
        "year": 2025,
        "value": 0.1552
      }
    ],
    "firmCount": [
      {
        "year": 2016,
        "value": 39
      },
      {
        "year": 2017,
        "value": 39
      },
      {
        "year": 2018,
        "value": 40
      },
      {
        "year": 2019,
        "value": 40
      },
      {
        "year": 2020,
        "value": 41
      },
      {
        "year": 2021,
        "value": 42
      },
      {
        "year": 2022,
        "value": 42
      },
      {
        "year": 2023,
        "value": 43
      },
      {
        "year": 2024,
        "value": 42
      },
      {
        "year": 2025,
        "value": 40
      }
    ],
    "netEntry": [
      {
        "year": 2016,
        "value": 1
      },
      {
        "year": 2017,
        "value": 0
      },
      {
        "year": 2018,
        "value": 1
      },
      {
        "year": 2019,
        "value": 0
      },
      {
        "year": 2020,
        "value": 2
      },
      {
        "year": 2021,
        "value": 1
      },
      {
        "year": 2022,
        "value": 0
      },
      {
        "year": 2023,
        "value": -1
      }
    ],
    "hhi": [
      {
        "year": 2016,
        "value": 519.5
      },
      {
        "year": 2017,
        "value": 520.1
      },
      {
        "year": 2018,
        "value": 533.3
      },
      {
        "year": 2019,
        "value": 542.8
      },
      {
        "year": 2020,
        "value": 559.3
      },
      {
        "year": 2021,
        "value": 547.3
      },
      {
        "year": 2022,
        "value": 536.1
      },
      {
        "year": 2023,
        "value": 521.6
      },
      {
        "year": 2024,
        "value": 531.6
      },
      {
        "year": 2025,
        "value": 536.5
      }
    ],
    "grossMarginSpread": [
      {
        "year": 2016,
        "value": 0.2207
      },
      {
        "year": 2017,
        "value": 0.2499
      },
      {
        "year": 2018,
        "value": 0.3082
      },
      {
        "year": 2019,
        "value": 0.3547
      },
      {
        "year": 2020,
        "value": 0.3457
      },
      {
        "year": 2021,
        "value": 0.1984
      },
      {
        "year": 2022,
        "value": 0.3171
      },
      {
        "year": 2023,
        "value": 0.5453
      },
      {
        "year": 2024,
        "value": 0.5834
      },
      {
        "year": 2025,
        "value": 0.2178
      }
    ],
    "rdIntensitySpread": [
      {
        "year": 2016,
        "value": 0
      },
      {
        "year": 2017,
        "value": 0
      },
      {
        "year": 2018,
        "value": 0
      },
      {
        "year": 2019,
        "value": 0
      },
      {
        "year": 2020,
        "value": 0
      },
      {
        "year": 2021,
        "value": 0
      },
      {
        "year": 2022,
        "value": 0
      },
      {
        "year": 2023,
        "value": 0
      },
      {
        "year": 2024,
        "value": 0
      },
      {
        "year": 2025,
        "value": 0
      }
    ],
    "capexToDepreciation": [
      {
        "year": 2016,
        "value": 2.9497
      },
      {
        "year": 2017,
        "value": 2.2403
      },
      {
        "year": 2018,
        "value": 2.1703
      },
      {
        "year": 2019,
        "value": null
      },
      {
        "year": 2020,
        "value": 1.1742
      },
      {
        "year": 2021,
        "value": 0.8493
      },
      {
        "year": 2022,
        "value": 0.5785
      },
      {
        "year": 2023,
        "value": 1.1061
      },
      {
        "year": 2024,
        "value": 1.0297
      },
      {
        "year": 2025,
        "value": 1.0222
      }
    ],
    "revenueOverPpe": [
      {
        "year": 2016,
        "value": 4.4284
      },
      {
        "year": 2017,
        "value": 4.3953
      },
      {
        "year": 2018,
        "value": 4.5905
      },
      {
        "year": 2019,
        "value": 4.2224
      },
      {
        "year": 2020,
        "value": 3.7836
      },
      {
        "year": 2021,
        "value": 3.7485
      },
      {
        "year": 2022,
        "value": 4.1613
      },
      {
        "year": 2023,
        "value": 4.815
      },
      {
        "year": 2024,
        "value": 6.0938
      },
      {
        "year": 2025,
        "value": 7.1827
      }
    ]
  },
  "environmentIndicators": {
    "hhi": 536.5,
    "cr4": 0.3355,
    "scaleSlope": -0.003155,
    "scaleR2": 0.0043,
    "revenueCagr5y": 0.1556,
    "medianYearsOfHistory": 13,
    "growthFirst5y": -0.0116,
    "growthLast5y": 0.1556,
    "capexToDepreciation": 1.0222,
    "inflationAdjusted5yRevenueChange": null,
    "netEntry5y": 2,
    "countries": null
  }
};
