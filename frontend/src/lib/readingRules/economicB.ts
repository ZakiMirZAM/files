// Automatic readings, economic definition files 36 to 69.
//
// The rules themselves live in two halves, because one file of them ran past
// the 800 line limit this repo keeps:
//
//   economicBHelpers.ts   the contract every rule obeys, and the shared helpers
//   economicB1.ts         definitions 36 to 55
//   economicB2.ts         definitions 56 to 69
//
// This module exists so that every importer, and the test file, keep reading
// one name. The split moved text and nothing else. RATE_BAND_DEFINED is
// re-exported here because the test file reads it from this module.

import { ECONOMIC_RULES_B1 } from "./economicB1";
import { ECONOMIC_RULES_B2 } from "./economicB2";
import type { MetricRules } from "./types";

export { RATE_BAND_DEFINED } from "./economicBHelpers";

export const ECONOMIC_RULES_B: MetricRules[] = [...ECONOMIC_RULES_B1, ...ECONOMIC_RULES_B2];
