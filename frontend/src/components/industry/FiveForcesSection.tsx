// Main orchestrator for the Five Competitive Forces (plan 2.3).
// Diagram + force cards + radar chart + factors card + synthesis question.
// State tracks which card is open; URL hash links to a force.

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { IndustryStructure } from "../../lib/industryStructureApi";
import type { RuntimeGroup, SectionKey } from "../../lib/types";
import {
  buildEntryTiles,
  buildRivalryTiles,
} from "../../lib/industryStructureFormat";
import {
  buildEntryQuestions,
  buildRivalryQuestions,
  buildSubstitutesQuestions,
  buildBuyersQuestions,
  buildSuppliersQuestions,
  buildFactorsQuestions,
  FIVE_FORCES_TITLE,
  FORCE_TITLES,
  SCALE_LABELS,
  SUMMARY_PROMPTS,
  HHI_REFERENCE,
  SHARE_STABILITY_REFERENCE,
  FACTORS_INTRO,
  FORCES_SYNTHESIS,
  FORCES_SYNTHESIS_TITLE,
  FINANCIAL_INDUSTRY_NOTE,
  netEntryWindowSentence,
  duplicateListingsSentence,
} from "../../lib/industryForcesCopy";
import { compoundRateValue } from "../../lib/industryStructureFormat";
import { LeaderCogsTable } from "./forces/LeaderCogsTable";
import { ForcesDiagram } from "./forces/ForcesDiagram";
import { ForceCard } from "./forces/ForceCard";
import { ForcesRadar } from "./forces/ForcesRadar";
import { QualitativeBlock } from "../QualitativeBlock";
import { decodeReasonedRating } from "../ReasonedRating";
import { SubstitutesPicker } from "./forces/SubstitutesPicker";
import { AdjacentIndustryTiles } from "./forces/AdjacentIndustryTiles";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type ForceKey = "entry" | "rivalry" | "substitutes" | "buyers" | "suppliers";

const FORCE_KEYS: ForceKey[] = ["entry", "rivalry", "substitutes", "buyers", "suppliers"];

const FORCE_RATING_IDS: Record<ForceKey, string> = {
  entry: "ind.forces.entry.rating",
  rivalry: "ind.forces.rivalry.rating",
  substitutes: "ind.forces.substitutes.rating",
  buyers: "ind.forces.buyers.rating",
  suppliers: "ind.forces.suppliers.rating",
};

// The question decks that take no arguments are the same objects on every
// render, so they are built once here rather than memoized per component.
const FORCE_GROUPS: Record<ForceKey, RuntimeGroup> = {
  entry: { title: FORCE_TITLES.entry, questions: buildEntryQuestions() },
  rivalry: { title: FORCE_TITLES.rivalry, questions: buildRivalryQuestions() },
  substitutes: { title: FORCE_TITLES.substitutes, questions: buildSubstitutesQuestions() },
  buyers: { title: FORCE_TITLES.buyers, questions: buildBuyersQuestions() },
  suppliers: { title: FORCE_TITLES.suppliers, questions: buildSuppliersQuestions() },
};

const SYNTHESIS_GROUP: RuntimeGroup = {
  title: FORCES_SYNTHESIS_TITLE,
  questions: [FORCES_SYNTHESIS],
};

interface FiveForcesSectionProps {
  structure: IndustryStructure;
  industry: string;
  section: SectionKey;
  dataContext: string;
}

export function FiveForcesSection({
  structure,
  industry,
  section,
  dataContext,
}: FiveForcesSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the only record of which card is open. Mirroring it in state
  // meant two sources of truth and an effect to keep them together.
  const forceParam = searchParams.get("force") as ForceKey | null;
  const activeForce: ForceKey | null =
    forceParam && FORCE_KEYS.includes(forceParam) ? forceParam : null;

  const handleSelectForce = useCallback(
    (force: ForceKey) => {
      setSearchParams(
        (p) => {
          const np = new URLSearchParams(p);
          if (np.get("force") === force) np.delete("force");
          else np.set("force", force);
          return np;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Build tiles.
  const entryTiles = useMemo(() => buildEntryTiles(structure), [structure]);
  const rivalryTiles = useMemo(() => buildRivalryTiles(structure), [structure]);

  // The factors question quotes revenue growth. revenueCagr5y is a natural-log
  // rate, so it becomes the compound rate before it reaches the copy.
  const growthPhrase = useMemo(() => {
    const compound = compoundRateValue(structure.rivalryEvidence.revenueCagr5y?.value);
    if (compound == null) return "did not change measurably";
    const rounded = Number(compound.toFixed(1));
    if (rounded === 0) return "did not change measurably";
    return `${rounded > 0 ? "grew" : "shrank"} ${Math.abs(rounded).toFixed(1)} percent a year`;
  }, [structure]);

  // Notes that travel with the entry evidence.
  const entryNotes = useMemo(() => {
    const parts = [
      netEntryWindowSentence(structure.entryEvidence.netEntryWindow),
      duplicateListingsSentence(structure.concentration.duplicateListingsDropped),
      structure.isFinancial ? FINANCIAL_INDUSTRY_NOTE : null,
    ].filter((p): p is string => Boolean(p));
    return parts.join(" ");
  }, [structure]);

  const factorsGroup: RuntimeGroup = useMemo(
    () => ({ title: FORCE_TITLES.factors, questions: buildFactorsQuestions(growthPhrase) }),
    [growthPhrase],
  );

  // Read saved ratings for the radar.
  const answers = useQuery(api.qualitative.getAnswersForScope, {
    section,
    scopeKey: industry,
  });

  const ratings = useMemo(() => {
    const result: Partial<Record<ForceKey, number>> = {};
    if (!answers) return result;
    for (const key of FORCE_KEYS) {
      const qid = FORCE_RATING_IDS[key];
      const ans = answers.find((a) => a.questionId === qid);
      if (ans?.answer) {
        const decoded = decodeReasonedRating(ans.answer);
        if (decoded.rating != null) {
          result[key] = decoded.rating;
        }
      }
    }
    return result;
  }, [answers]);

  // What each force card shows beyond its shared frame: which tiles, whether
  // it carries a reference paragraph, and what it renders inside.
  const CARD_EXTRAS: Record<
    ForceKey,
    { tiles: typeof entryTiles; reference?: string; children?: React.ReactNode }
  > = {
    entry: {
      tiles: entryTiles,
      reference: `${HHI_REFERENCE} ${SHARE_STABILITY_REFERENCE} ${entryNotes}`.trim(),
      children: <LeaderCogsTable leaders={structure.entryEvidence.leaderCogsToRevenue5y} />,
    },
    rivalry: { tiles: rivalryTiles },
    substitutes: {
      tiles: [],
      children: (
        <SubstitutesPicker
          industry={industry}
          structure={structure}
          section={section}
          scopeKey={industry}
        />
      ),
    },
    buyers: {
      tiles: [],
      children: (
        <AdjacentIndustryTiles
          side="buyers"
          industry={industry}
          section={section}
          scopeKey={industry}
        />
      ),
    },
    suppliers: {
      tiles: [],
      children: (
        <AdjacentIndustryTiles
          side="suppliers"
          industry={industry}
          section={section}
          scopeKey={industry}
        />
      ),
    },
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
        <span className="text-gold font-mono text-sm">{FIVE_FORCES_TITLE}</span>
        <span className="flex-1 h-px bg-gold/15" />
      </h2>

      <ForcesDiagram
        activeForce={activeForce}
        onSelectForce={handleSelectForce}
        ratings={ratings}
      />

      <ForcesRadar ratings={ratings} />

      {/* Only the selected force's card is shown. */}
      {activeForce != null && (
        <ForceCard
          title={FORCE_TITLES[activeForce]}
          tiles={CARD_EXTRAS[activeForce].tiles}
          questionGroup={FORCE_GROUPS[activeForce]}
          section={section}
          scopeKey={industry}
          dataContext={dataContext}
          rating={{
            questionId: FORCE_RATING_IDS[activeForce],
            prompt: SUMMARY_PROMPTS[activeForce],
            scaleLabel: SCALE_LABELS[activeForce],
          }}
          reference={CARD_EXTRAS[activeForce].reference}
        >
          {CARD_EXTRAS[activeForce].children}
        </ForceCard>
      )}

      {/* Factors card (no rating) */}
      {activeForce != null && (
        <ForceCard
          title={FORCE_TITLES.factors}
          tiles={[]}
          questionGroup={factorsGroup}
          section={section}
          scopeKey={industry}
          dataContext={dataContext}
          rating={null}
          intro={FACTORS_INTRO}
        />
      )}

      {/* Synthesis question: always visible when any force card is open */}
      {activeForce != null && (
        <div className="panel p-5">
          <QualitativeBlock
            section={section}
            scopeKey={industry}
            groups={[SYNTHESIS_GROUP]}
            storageSuffix="forces-synthesis"
            hideHeader
            dataContext={dataContext}
          />
        </div>
      )}
    </div>
  );
}
