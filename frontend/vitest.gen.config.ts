// Vitest config for the dataset generator only.
//
// `npm test` uses the default config and never sets GEN_METRIC_MAP, so the
// generator test skips there and writes nothing. This config sets the variable
// and narrows the run to the one generator file.

import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vite.config";

export default mergeConfig(
  base({ mode: "test", command: "serve" }),
  defineConfig({
    test: {
      include: ["scripts/genMetricSectorMap.gen.test.ts"],
      env: { GEN_METRIC_MAP: "1" },
    },
  }),
);
