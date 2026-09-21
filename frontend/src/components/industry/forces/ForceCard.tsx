// One force card: evidence tiles, then questions (via QualitativeBlock groups
// prop), then a ReasonedRating. Rule B: evidence first, questions, summary,
// rating last.

import type { TileDescriptor } from "../../../lib/industryStructureFormat";
import type { RuntimeGroup, SectionKey } from "../../../lib/types";
import { EvidenceTiles } from "./EvidenceTile";
import { QualitativeBlock } from "../../QualitativeBlock";
import { ReasonedRating } from "../../ReasonedRating";

interface ForceCardProps {
  title: string;
  tiles: TileDescriptor[];
  questionGroup: RuntimeGroup;
  section: SectionKey;
  scopeKey: string;
  dataContext: string;

  /** ReasonedRating props, or null for the factors card (no rating). */
  rating: {
    questionId: string;
    prompt: string;
    scaleLabel: string;
  } | null;
  /** Optional reference text shown beneath the tiles. */
  reference?: string;
  /** Optional introductory text above the questions. */
  intro?: string;
  children?: React.ReactNode;
}

export function ForceCard({
  title,
  tiles,
  questionGroup,
  section,
  scopeKey,
  dataContext,
  rating,
  reference,
  intro,
  children,
}: ForceCardProps) {
  return (
    <div className="panel p-5 space-y-4">
      <h4 className="font-display text-base font-semibold text-white">{title}</h4>

      {/* Evidence tiles */}
      {tiles.length > 0 && <EvidenceTiles tiles={tiles} />}

      {/* Reference text */}
      {reference && (
        <p className="text-xs text-white/45 leading-relaxed">{reference}</p>
      )}

      {/* Extra children (e.g. adjacent-industry tiles) */}
      {children}

      {/* Intro text (e.g. factors card) */}
      {intro && (
        <p className="text-xs text-white/50 leading-relaxed italic">{intro}</p>
      )}

      {/* Questions */}
      <QualitativeBlock
        section={section}
        scopeKey={scopeKey}
        groups={[questionGroup]}
        storageSuffix={`forces-${questionGroup.questions[0]?.id?.split(".").slice(0, 3).join("-") ?? "q"}`}
        hideHeader
        dataContext={dataContext}
      />

      {/* Summary prompt + rating */}
      {rating && (
        <ReasonedRating
          section={section}
          scopeKey={scopeKey}
          questionId={rating.questionId}
          prompt={rating.prompt}
          scaleLabel={rating.scaleLabel}
        />
      )}
    </div>
  );
}
