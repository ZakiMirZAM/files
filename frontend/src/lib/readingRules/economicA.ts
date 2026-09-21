// Automatic readings for economic definition files 01 to 35.
//
// The rules themselves live in two halves, because one file of them ran past
// the 800 line limit this repo keeps:
//
//   economicAHelpers.ts   the contract every rule obeys, and the shared helpers
//   economicA1.ts         definitions 01 to 18
//   economicA2.ts         definitions 19 to 35
//
// This module exists so that every importer, and the test file, keep reading
// one name. The split moved text and nothing else.

import { ECONOMIC_RULES_A1 } from "./economicA1";
import { ECONOMIC_RULES_A2 } from "./economicA2";
import type { MetricRules } from "./types";

export const ECONOMIC_RULES_A: MetricRules[] = [...ECONOMIC_RULES_A1, ...ECONOMIC_RULES_A2];
