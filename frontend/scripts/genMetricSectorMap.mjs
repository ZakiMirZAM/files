// Entry point for `npm run gen:metric-map`.
//
// The real generator is genMetricSectorMap.gen.test.ts beside this file. It is
// TypeScript and reads the definition markdown through Vite's raw glob, so it
// runs under vitest; that keeps exactly one parser implementation shared by the
// generator, the parser unit tests and the sync test. This file only launches
// it, so the script name in the generated header stays true.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vitest", "run", "--config", "vitest.gen.config.ts"],
  { cwd: frontend, stdio: "inherit" },
);

process.exit(result.status ?? 1);
