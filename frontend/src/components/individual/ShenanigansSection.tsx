import { useState } from "react";
import type {
  Shenanigans,
  ShenaniganFlag,
  ShenaniganSeverity,
  ForensicScore,
} from "../../lib/types";
import { cn } from "../../lib/cn";
import { ShieldAlert, ShieldCheck, ChevronDown, Gauge, Minus } from "lucide-react";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";

interface ShenanigansSectionProps {
  shenanigans?: Shenanigans | null;
}

const SEVERITY_ORDER: Record<ShenaniganSeverity, number> = { high: 0, medium: 1, na: 2, ok: 3 };

const SEVERITY_STYLE: Record<ShenaniganSeverity, string> = {
  high: "text-loss-strong border-loss/40 bg-loss-ghost",
  medium: "text-gold border-gold/40 bg-gold/10",
  na: "text-white/45 border-white/10 bg-white/[0.03]",
  ok: "text-gain border-gain/25 bg-gain-ghost",
};

const SEVERITY_LABEL: Record<ShenaniganSeverity, string> = {
  high: "High", medium: "Medium", na: "n/a", ok: "OK",
};

/**
 * Forensic earnings-quality screen from Schilit & Perler, "Financial Shenanigans".
 * Quantitative trip-wires (a flag = investigate, not guilt) plus the qualitative
 * question checklist mapped to the book's shenanigan taxonomy.
 */
export function ShenanigansSection({ shenanigans }: ShenanigansSectionProps) {
  const [showOk, setShowOk] = useState(false);
  if (!shenanigans || !shenanigans.applicable) return null;

  const flags = [...(shenanigans.flags ?? [])].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const counts = shenanigans.counts ?? { high: 0, medium: 0, ok: 0, na: 0 };
  const concerning = flags.filter((f) => f.severity === "high" || f.severity === "medium");
  const clean = flags.filter((f) => f.severity === "ok" || f.severity === "na");
  const scores = shenanigans.scores ?? [];

  const bannerStyle =
    counts.high >= 2 ? "border-loss/40 bg-loss-ghost text-loss-strong"
    : counts.high === 1 || counts.medium >= 2 ? "border-gold/40 bg-gold/10 text-gold"
    : "border-gain/30 bg-gain-ghost text-gain";

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Financial Shenanigans</h2>
        <DefinitionLink number={77} prominent className="mt-3">How the financial shenanigans framework works</DefinitionLink>
      </header>

      {/* Summary banner */}
      <div className={cn("rounded-sm border px-4 py-3 mb-5 flex items-start gap-3", bannerStyle)}>
        {counts.high === 0 && counts.medium === 0
          ? <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0" />
          : <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />}
        <div>
          <p className="text-sm leading-snug">{shenanigans.summary}</p>
          <p className="text-[0.7rem] font-mono mt-1 opacity-80">
            {counts.high} high · {counts.medium} medium · {counts.ok} clear · {counts.na} n/a
          </p>
        </div>
      </div>

      {/* Composite forensic scores: Altman Z-Score + Beneish M-Score */}
      {scores.length > 0 && (
        <div className="mb-6">
          <p className="eyebrow mb-3 inline-flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5" /> Composite scores
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scores.map((s) => <ScoreCard key={s.key} score={s} />)}
          </div>
        </div>
      )}

      {/* Concerning flags */}
      {concerning.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          {concerning.map((f) => <FlagCard key={f.key} flag={f} />)}
        </div>
      )}

      {/* Clean / n/a flags (collapsed) */}
      {clean.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowOk((v) => !v)}
            className="btn-ghost text-xs -ml-2 mb-2 inline-flex items-center gap-1"
          >
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showOk && "rotate-180")} />
            {showOk ? "Hide" : "Show"} {clean.length} checks that passed
          </button>
          {showOk && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {clean.map((f) => <FlagCard key={f.key} flag={f} />)}
            </div>
          )}
        </div>
      )}

      {/* Qualitative checklist */}
      <div className="panel-soft p-5">
        <p className="eyebrow mb-4">Qualitative checklist, questions to work through</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {shenanigans.questions.map((g) => (
            <div key={g.category}>
              <h4 className="font-display text-sm font-semibold text-gold/80 mb-2 flex items-center gap-2">
                <span className="block w-3 h-px bg-gold/50" />
                {g.category}
              </h4>
              <ul className="space-y-1.5">
                {g.items.map((q, i) => (
                  <li key={i} className="text-[0.82rem] text-white/70 leading-snug flex gap-2">
                    <span className="text-gold/50 flex-shrink-0">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}

const SCORE_STYLE: Record<ShenaniganSeverity, { card: string; pill: string; bar: string }> = {
  high: { card: "border-loss/40 bg-loss-ghost", pill: "text-loss-strong border-loss/40", bar: "bg-loss/60" },
  medium: { card: "border-gold/40 bg-gold/10", pill: "text-gold border-gold/40", bar: "bg-gold/60" },
  ok: { card: "border-gain/30 bg-gain-ghost", pill: "text-gain border-gain/30", bar: "bg-gain/60" },
  na: { card: "border-white/10 bg-white/[0.03]", pill: "text-white/45 border-white/15", bar: "bg-white/25" },
};

function ScoreCard({ score }: { score: ForensicScore }) {
  const [open, setOpen] = useState(false);
  const style = SCORE_STYLE[score.severity] ?? SCORE_STYLE.na;
  const components = score.components ?? [];
  const maxContribution = Math.max(
    1e-6,
    ...components.map((c) => Math.abs(c.contribution ?? 0)),
  );

  return (
    <div className={cn("rounded-sm border px-4 py-3.5", style.card)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <MetricTerm
            metric={score.label}
            scope="shenanigans"
            className="text-sm font-medium text-white/90 leading-tight"
          />
          <p className="text-2xl font-mono font-semibold text-white mt-1.5 tabular-nums">
            {score.applicable && score.value !== null ? score.value.toFixed(3) : "n/a"}
          </p>
        </div>
        <span
          className={cn(
            "text-[0.62rem] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded-sm border whitespace-nowrap",
            style.pill,
          )}
        >
          {score.headline.includes("n/a") ? score.headline.split("n/a").pop()?.trim() : score.headline}
        </span>
      </div>

      <p className="text-[0.8rem] text-white/65 leading-snug mt-2">
        {score.applicable ? score.interpretation : score.reason}
      </p>

      {score.applicable && score.threshold_note && (
        <p className="text-[0.68rem] font-mono text-white/35 mt-1.5">{score.threshold_note}</p>
      )}

      {score.applicable && score.low_confidence && score.confidence && (
        <p className="text-[0.68rem] text-gold/70 mt-1.5 flex items-start gap-1">
          <Minus className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {score.confidence}
        </p>
      )}

      {/* Component breakdown */}
      {components.length > 0 && (
        <div className="mt-3 pt-2.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="btn-ghost text-[0.7rem] -ml-2 inline-flex items-center gap-1"
          >
            <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
            {open ? "Hide" : "Show"} the {components.length} inputs
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {components.map((c) => (
                <li key={c.key} className="text-[0.72rem]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("text-white/70", c.imputed && "text-white/35 italic")}>
                      {c.label}
                      {c.imputed && " (imputed)"}
                    </span>
                    <span className="font-mono text-white/50 tabular-nums flex-shrink-0">
                      {c.value === null ? "n/a" : c.value.toFixed(3)}
                      <span className="text-white/30"> · {c.contribution >= 0 ? "+" : ""}{c.contribution.toFixed(3)}</span>
                    </span>
                  </div>
                  <div className="h-1 mt-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", style.bar)}
                      style={{ width: `${(Math.abs(c.contribution ?? 0) / maxContribution) * 100}%` }}
                    />
                  </div>
                  {c.note && <p className="text-[0.66rem] text-white/35 mt-0.5 leading-tight">{c.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FlagCard({ flag }: { flag: ShenaniganFlag }) {
  return (
    <div className={cn("rounded-sm border px-4 py-3", SEVERITY_STYLE[flag.severity])}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <MetricTerm metric={flag.label} scope="shenanigans" className="text-sm font-medium text-white/90 leading-tight" />
        <span className="text-[0.65rem] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded-sm border border-current/30">
          {SEVERITY_LABEL[flag.severity]}
        </span>
      </div>
      <p className="text-[0.8rem] text-white/65 leading-snug">{flag.detail}</p>
      <p className="text-[0.65rem] uppercase tracking-wider text-white/35 font-mono mt-1.5">{flag.category}</p>
    </div>
  );
}
