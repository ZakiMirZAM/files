// Payload metric name to definition number, for the two macro surfaces.
//
// It is the same lookup the sidebar chart makes: a definition file states the
// exact backend series name it charts, so the name is the join. The maps used
// to live in lib/stageContext/classification.ts, which also pulls in the whole
// generated metric-sector dataset (about a megabyte). The automatic-readings
// engine needs the two maps and nothing else from that module, so they live
// here, where the only imports are the two small definition libraries.
// classification.ts re-exports them, so its own importers are unaffected.

import { CREDIT_METRIC_DEFS } from "./creditDefinitions";
import { ECONOMIC_METRIC_DEFS } from "./economicDefinitions";

function byName(defs: { number: number; chartMetricName?: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of defs) {
    if (d.chartMetricName && !out.has(d.chartMetricName)) out.set(d.chartMetricName, d.number);
  }
  return out;
}

/** Payload metric name -> economic definition number. */
export const ECONOMIC_DEF_BY_NAME: Map<string, number> = byName(ECONOMIC_METRIC_DEFS);

/** Payload metric name -> credit definition number. */
export const CREDIT_DEF_BY_NAME: Map<string, number> = byName(CREDIT_METRIC_DEFS);
