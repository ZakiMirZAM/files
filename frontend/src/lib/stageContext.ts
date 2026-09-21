// One block of plain text carrying every metric of every earlier stage, for the
// tutor behind an "Explain using AI" button.
//
// It is called only from a click handler, through a dynamic import, so the
// generated definition dataset it reaches for never lands in the page bundle:
//
//   const { buildStageContext } = await import("../lib/stageContext");
//   const block = await buildStageContext("company", { ticker, sector, industry });
//
// Passing the sector and industry a page already knows saves one round trip.
// Every source is fetched in parallel through the app's shared cache, each with
// a ninety second wait, and any one of them failing costs that section one
// "Not loaded" line and nothing else. No mock data ever reaches the block.
//
// The real work lives in lib/stageContext/: the serializers there take payloads
// as arguments and are pure, so every line in the block is testable without a
// network.

import { buildBlock } from "./stageContext/assemble";
import { loadStageBundle } from "./stageContext/bundle";
import type { StageContextOptions, StageKind, StageSubject } from "./stageContext/types";

export type { StageKind, StageSubject, StageContextOptions };
export type { StageReadings, ValueSystemPicks } from "./stageContext/types";
export { SIZE_CAP_BYTES } from "./stageContext/assemble";

/**
 * The cross-stage data block for one subject.
 *
 * `stage` decides how far the block reaches: credit carries the economy alone
 * plus the eleven sectors' financing, sector adds the sector section, industry
 * adds the industry section, comparative adds the peer ranking, and company
 * adds the company itself.
 */
export async function buildStageContext(
  stage: StageKind,
  subject: StageSubject,
  options?: StageContextOptions,
): Promise<string> {
  return (await buildStageContextDetailed(stage, subject, options)).text;
}

/** The same block with the size it measured and what the cap gave up, for a
 *  caller that wants to report either. */
export async function buildStageContextDetailed(
  stage: StageKind,
  subject: StageSubject,
  options?: StageContextOptions,
): Promise<{ text: string; bytes: number; dropped: string[] }> {
  const bundle = await loadStageBundle(stage, subject, options ?? {});
  return buildBlock(bundle);
}
