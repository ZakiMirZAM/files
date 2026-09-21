// The one door to the cross-stage data block.
//
// `stageContext.ts` assembles every metric of every earlier stage, which is a
// large module and several network calls. Nothing here is loaded with the page:
// every import below is dynamic, so the block arrives only when a reader clicks
// "Explain using AI", and the modules land in their own chunks.
//
// The glob is how the stageContext import survives the module being absent:
// Vite resolves it at build time and simply returns no entry, rather than
// failing the build. A caller gets an empty string and the AI answers on the
// page's own figures.
//
// The automatic readings ride along. They are decided from the two macro
// payloads the block loads anyway, through the SAME cache keys and the same
// loaders (lib/stageContext/sources.ts), so asking for them here costs no
// extra request: whichever call runs first fills the shared cache and the other
// reads it. The reader's own saved READING picks are NOT overlaid, because they
// live in Convex behind React hooks and there is no client reachable from here;
// a manual pick therefore wins on the page and the block carries the automatic
// reading.
//
// Their earlier CONCLUSIONS and their value-system picks do reach the block,
// through `reader`: the component that owns the click has the Convex client, so
// it reads them at click time and hands them over. Three decks name them
// outright ("the reader's own five forces answers and ratings"), and for a
// while the block carried none of it.

// The three shapes below are declared in the lazy half and re-exported here,
// so a caller that needs only the names imports this module and never touches
// the dataset chunk behind it. `export type ... from` is erased at build time,
// exactly as the type-only import above it is.
import type { StageContextOptions, StageReadings } from "./stageContext/types";

export type { StageKind, StageSubject } from "./stageContext/types";
export type { SavedAnswerRow as SavedAnswer } from "./stageContext/readerNotes";
import type { StageKind, StageSubject } from "./stageContext/types";
import type { SavedAnswerRow as SavedAnswer } from "./stageContext/readerNotes";

interface StageContextModule {
  buildStageContext?: (
    stage: StageKind,
    subject: StageSubject,
    options?: StageContextOptions,
  ) => Promise<string>;
}

const MODULES = import.meta.glob("./stageContext.ts") as Record<
  string,
  () => Promise<unknown>
>;

/**
 * The automatic reading of every economic and credit metric, or undefined when
 * either half could not be worked out. Never throws: a failure here must cost
 * the block its readings, not its figures.
 */
export async function automaticReadings(): Promise<StageReadings | undefined> {
  try {
    const [sources, engine] = await Promise.all([
      import("./stageContext/sources"),
      import("./readingRules/engine"),
    ]);
    const [economic, credit] = await Promise.all([
      sources.load.economic(),
      sources.load.credit(),
    ]);
    return engine.automaticReadingsFromPayloads(
      economic.ok ? economic.value : null,
      credit.ok ? credit.value : null,
    );
  } catch {
    return undefined;
  }
}

/**
 * What the caller reads out of Convex at click time and hands along.
 *
 * The Convex client lives in the React tree, so nothing in this module can
 * reach it; the component that owns the click supplies the reader, and this
 * module decides which scopes to ask for once the subject's names are known.
 * Anything missing costs the block that part and nothing else.
 */
export interface ReaderContribution {
  /** Reads the reader's saved answers for these scopes, or throws. */
  readAnswers?: (scopes: { section: string; scopeKey: string }[]) => Promise<SavedAnswer[]>;
  /** The question being asked right now, which is never handed back. */
  excludeQuestionId?: string;
}

/**
 * The reader's earlier conclusions and their value-system picks, or nothing.
 *
 * Never throws and never blocks the figures: signed out, offline, or a Convex
 * error all cost the block its notes and leave every number in place.
 */
async function readerOptions(
  stage: StageKind,
  subject: StageSubject,
  reader: ReaderContribution,
  signal?: AbortSignal,
): Promise<Partial<StageContextOptions>> {
  if (!reader.readAnswers) return {};
  try {
    const [sources, notes] = await Promise.all([
      import("./stageContext/sources"),
      import("./stageContext/readerNotes"),
    ]);
    // Cached, so the bundle's own resolve a moment later costs nothing.
    const named = await sources.resolveSubject(stage, subject, signal);
    const rows = await reader.readAnswers(notes.noteScopes(named));
    const text = notes.formatReaderNotes(rows, reader.excludeQuestionId);
    const picks = notes.picksFromRows(rows, named.industry);
    return {
      ...(text ? { readerNotes: text } : {}),
      ...(picks.supplier || picks.buyer ? { valueSystemPicks: picks } : {}),
    };
  } catch {
    return {};
  }
}

/** The cross-stage figures for one subject, or "" when they are unavailable. */
export async function loadStageContext(
  stage: StageKind,
  subject: StageSubject,
  reader: ReaderContribution = {},
  signal?: AbortSignal,
): Promise<string> {
  const load = MODULES["./stageContext.ts"];
  if (!load) return "";
  try {
    // The readings and the reader's notes need none of the lazy module, and
    // that module pulls a dataset chunk of the better part of a megabyte. Both
    // are started before it is awaited rather than after it has landed, so the
    // two macro payloads and the Convex read travel alongside the download
    // instead of queueing behind it. Neither promise can reject: each swallows
    // its own failure and answers with nothing, so an early return below leaves
    // no rejection unhandled.
    const readingsAsked = automaticReadings();
    const readerAsked = readerOptions(stage, subject, reader, signal);
    const mod = (await load()) as StageContextModule;
    if (typeof mod.buildStageContext !== "function") return "";
    const [readings, fromReader] = await Promise.all([readingsAsked, readerAsked]);
    const options: StageContextOptions = {
      ...(readings ? { automaticReadings: readings } : {}),
      ...fromReader,
      ...(signal ? { signal } : {}),
    };
    return (await mod.buildStageContext(stage, subject, options)) ?? "";
  } catch {
    return "";
  }
}
