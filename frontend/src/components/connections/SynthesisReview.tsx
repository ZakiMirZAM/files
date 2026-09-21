// Read-only display of the user's saved Connect synthesis answers, shown on
// the Final Review page so the reviewer can see what they wrote at each stage
// before answering the final review questions.

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SYNTHESIS_REVIEW } from "../../lib/connectionsCopy";

interface SynthesisReviewProps {
  sector: string;
  industry: string;
  ticker: string;
}

type QualitativeSection =
  | "economic"
  | "credit"
  | "sector"
  | "industry"
  | "comparative"
  | "individual"
  | "final_review";

interface StageSynthesis {
  label: string;
  questionId: string;
  section: QualitativeSection;
  scopeKey: string;
  unanswered: string;
}

export function SynthesisReview({ sector, industry, ticker }: SynthesisReviewProps) {
  const stages: StageSynthesis[] = [];

  if (sector) {
    stages.push({
      label: SYNTHESIS_REVIEW.sectorLabel(sector),
      questionId: "sec.connect.synthesis",
      section: "sector",
      scopeKey: sector,
      unanswered: SYNTHESIS_REVIEW.unansweredSector,
    });
  }

  if (industry) {
    stages.push({
      label: SYNTHESIS_REVIEW.industryLabel(industry),
      questionId: "ind.connect.synthesis",
      section: "industry",
      scopeKey: industry,
      unanswered: SYNTHESIS_REVIEW.unansweredIndustry,
    });
    // The Comparative stage sits between the industry and the company, and it
    // saves under the INDUSTRY name too: pages/IndustryDetail.tsx serves both
    // modes and passes scopeKey={industry} with section "comparative".
    stages.push({
      label: SYNTHESIS_REVIEW.comparativeLabel(industry),
      questionId: "comp.connect.synthesis",
      section: "comparative",
      scopeKey: industry,
      unanswered: SYNTHESIS_REVIEW.unansweredComparative,
    });
  }

  if (ticker) {
    stages.push({
      label: SYNTHESIS_REVIEW.companyLabel(ticker),
      questionId: "indiv.connect.synthesis",
      section: "individual",
      scopeKey: ticker,
      unanswered: SYNTHESIS_REVIEW.unansweredCompany,
    });
  }

  if (stages.length === 0) return null;

  return (
    <div className="panel-soft p-4 mb-6 space-y-4">
      <p className="eyebrow">{SYNTHESIS_REVIEW.eyebrow}</p>
      <p className="text-xs text-white/45 leading-relaxed max-w-3xl">
        {SYNTHESIS_REVIEW.intro}
      </p>
      {stages.map((s) => (
        <SynthesisRow key={s.questionId} stage={s} />
      ))}
    </div>
  );
}

function SynthesisRow({ stage }: { stage: StageSynthesis }) {
  // An empty scopeKey would query Convex for nothing, so the row is only ever
  // built with one. `undefined` from useQuery means the query is still in
  // flight, which is a different thing from an empty list of answers.
  const answers = useQuery(api.qualitative.getAnswersForScope, {
    section: stage.section,
    scopeKey: stage.scopeKey,
  });

  const loading = answers === undefined;
  const saved = answers?.find((a) => a.questionId === stage.questionId);

  return (
    <div className="border-t border-gold/10 pt-3">
      <p className="text-sm font-mono text-gold/80 mb-1">{stage.label}</p>
      {loading ? (
        <p className="text-sm text-white/35">{SYNTHESIS_REVIEW.loading}</p>
      ) : saved?.answer ? (
        <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
          {saved.answer}
        </p>
      ) : (
        <p className="text-sm text-white/35 italic">{stage.unanswered}</p>
      )}
    </div>
  );
}
