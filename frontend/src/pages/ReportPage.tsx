import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SectionHeader } from "../components/SectionHeader";
import { QualitativeBlock } from "../components/QualitativeBlock";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { ScrollText } from "lucide-react";

/**
 * Final Review Questions. Replaces the old free-form final report with the exact
 * self-assessment questions from the commentary on Chapter 20 of The Intelligent
 * Investor: Kahneman's two factors of a good decision,
 * well-calibrated confidence and correctly-anticipated regret. Answers auto-save
 * to the account via the shared qualitative store (section "final_review").
 *
 * The saved Investment Policy Statement (Reilly & Brown, Ch.2) renders above the
 * questions so every answer is judged against the investor's own written rules.
 */
export function ReportPage() {
  const policy = useQuery(api.policy.getPolicy);

  return (
    <div>
      <SectionHeader
        eyebrow="Final Review"
        title="Final Review Questions"
        subtitle="Before you commit, turn the analysis on yourself. Risk resides not in what kinds of investments you have, but in what kind of investor you are. These questions are drawn from the commentary on Chapter 20 of The Intelligent Investor."
        actions={<PageTourButton tourId="report" />}
      />

      {policy ? (
        <div className="panel-soft p-4 mb-6">
          <p className="eyebrow mb-2 inline-flex items-center gap-2">
            <ScrollText className="w-4 h-4" /> Your Investment Policy
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <span className="text-white/70">
              <span className="text-white/40">Risk:</span>{" "}
              <span className="font-mono">{policy.riskTolerance}</span>
            </span>
            <span className="text-white/70">
              <span className="text-white/40">Horizon:</span>{" "}
              <span className="font-mono">{policy.horizonYears} years</span>
            </span>
            {policy.liquidityNeeds && (
              <span className="text-white/70">
                <span className="text-white/40">Liquidity:</span> {policy.liquidityNeeds}
              </span>
            )}
          </div>
          {policy.objectives && (
            <p className="text-sm text-white/60 mt-2 max-w-3xl">{policy.objectives}</p>
          )}
          {policy.constraints && (
            <p className="text-[0.8rem] text-white/45 mt-1.5 max-w-3xl">
              Constraints: {policy.constraints}
            </p>
          )}
          <p className="text-[0.72rem] leading-6 text-white/40 mt-2.5 pt-2.5 border-t border-gold/10">
            Judge every answer below against this policy. A stock can pass every test on its own
            merits and still fail yours.
          </p>
        </div>
      ) : policy === null ? (
        <div className="panel-soft p-4 mb-6">
          <p className="text-sm text-white/55 inline-flex items-center gap-2 flex-wrap">
            <ScrollText className="w-4 h-4 text-gold/70" />
            No Investment Policy Statement on file yet. Professionals write the policy before the
            analysis, so the review has a yardstick.
            <Link to="/app" className="text-gold hover:underline">
              Write yours on the dashboard
            </Link>
          </p>
        </div>
      ) : null}

      <QualitativeBlock section="final_review" scopeKey="global" hideHeader />
    </div>
  );
}
