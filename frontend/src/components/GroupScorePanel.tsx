import type { SectionKey, SectorMetricsData } from "../lib/types";
import { colIntegrity, buildIntegrityDeck, formatSectorValue } from "../lib/sectorMetrics";
import { getPageAiContext } from "../lib/aiContextStore";
import { openDefinition } from "../lib/definitionPanelStore";
import { QualitativeBlock } from "./QualitativeBlock";
import { ScoreExplainer } from "./ScoreExplainer";
import { cn } from "../lib/cn";

// The Value Score definition number per surface (sector 435, industry 323).
const SCORE_DEF: Partial<Record<SectionKey, number>> = { sector: 435, industry: 323 };

interface GroupScorePanelProps {
  data: SectorMetricsData;
  /** Column to read, and the scope answers persist under (the sector or industry name). */
  group: string;
  section: SectionKey;
  /** Human label for the header sentence ("Technology sector", "Semiconductors"). */
  subject: string;
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-gain-strong";
  if (score >= 50) return "text-gold";
  if (score >= 25) return "text-white/70";
  return "text-loss";
}

/**
 * The scorecard's value verdict for one sector or industry: a slim score and
 * rank line, a collapsible explanation of how the score is built, and the
 * integrity checks rendered as a standing, answerable question deck (text box,
 * autosave, and Explain using AI, exactly like every other qualitative
 * question in the app). The score itself is compared across peers in the
 * scorecard matrix row; this panel is the per-group detail beneath it.
 */
export function GroupScorePanel({ data, group, section, subject }: GroupScorePanelProps) {
  const col = data.data[group];
  const score = col?.["valueScore"];
  const rank = col?.["scoreRank"];
  const checks = colIntegrity(col) ?? [];

  if (!col || (score == null && checks.length === 0)) return null;

  const peers =
    data.scorePeers ??
    Object.values(data.data).filter((c) => c?.["valueScore"] != null).length;
  const variant = section === "industry" ? "industry" : "sector";
  const peerNoun = section === "sector" ? "sectors" : "industries";
  const deck = buildIntegrityDeck(checks, group, getPageAiContext().dataContext);
  const defNum = SCORE_DEF[section];

  return (
    <section className="panel p-5 space-y-5" data-tour="group-score">
      {/* Slim score + rank header. The score is also a comparison row in the
          scorecard matrix; here it is the anchor for the detail below it. */}
      <div className="border-b border-gold/15 pb-4">
        <p className="eyebrow">Value Discipline</p>
        <h3 className="font-display text-xl md:text-2xl font-semibold text-white mt-1">
          Scorecard Verdict
        </h3>
        {score != null && (
          <p className="text-sm text-white/60 mt-1.5">
            {subject} scores{" "}
            {defNum != null ? (
              <button
                type="button"
                onClick={() => openDefinition(defNum)}
                title="What is the Value Score?"
                className={cn(
                  "font-mono font-semibold rounded-sm px-1 -mx-0.5",
                  "cursor-pointer transition-shadow hover:ring-1 hover:ring-gold/40",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-gold",
                  scoreColor(score),
                )}
              >
                {formatSectorValue(score, "n")} / 100
              </button>
            ) : (
              <span className={cn("font-mono font-semibold", scoreColor(score))}>
                {formatSectorValue(score, "n")} / 100
              </span>
            )}
            {rank != null && peers > 0 && (
              <>
                , ranking #{rank} of {peers} {peerNoun}
              </>
            )}
            .
          </p>
        )}
      </div>

      <ScoreExplainer variant={variant} />

      {/* Integrity checks as a standing, answerable question deck. */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <p className="eyebrow">Integrity Questions</p>
            <h4 className="font-display text-lg font-semibold text-white mt-0.5">
              Do the numbers hold up?
            </h4>
          </div>
        </div>
        <QualitativeBlock
          section={section}
          scopeKey={group}
          groups={deck}
          storageSuffix="integrity"
          hideHeader
        />
      </div>
    </section>
  );
}
