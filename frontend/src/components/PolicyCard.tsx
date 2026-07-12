import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { cn } from "../lib/cn";
import { ScrollText, ChevronDown, Check, Loader2 } from "lucide-react";

type RiskTolerance = "conservative" | "balanced" | "aggressive";

const RISK_OPTIONS: { value: RiskTolerance; label: string; hint: string }[] = [
  { value: "conservative", label: "Conservative", hint: "protecting capital comes first" },
  { value: "balanced", label: "Balanced", hint: "growth with a real drawdown limit" },
  { value: "aggressive", label: "Aggressive", hint: "long horizon, tolerant of deep swings" },
];

/**
 * Investment Policy Statement (Reilly & Brown, Investment Analysis & Portfolio
 * Management, Ch.2). The written statement of objectives and constraints comes
 * BEFORE any stock analysis: without it there is no yardstick for whether a
 * given company belongs in this investor's portfolio at all. The saved policy
 * reappears at the top of the Final Review so every thesis is judged against it.
 */
export function PolicyCard() {
  const saved = useQuery(api.policy.getPolicy);
  const save = useMutation(api.policy.savePolicy);

  const [open, setOpen] = useState(false);
  const [objectives, setObjectives] = useState("");
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>("balanced");
  const [horizonYears, setHorizonYears] = useState("10");
  const [liquidityNeeds, setLiquidityNeeds] = useState("");
  const [taxNotes, setTaxNotes] = useState("");
  const [constraints, setConstraints] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hydrated = useRef(false);

  // Hydrate the form once from the server copy.
  useEffect(() => {
    if (saved && !hydrated.current) {
      hydrated.current = true;
      setObjectives(saved.objectives);
      setRiskTolerance(saved.riskTolerance);
      setHorizonYears(String(saved.horizonYears));
      setLiquidityNeeds(saved.liquidityNeeds);
      setTaxNotes(saved.taxNotes);
      setConstraints(saved.constraints);
    }
  }, [saved]);

  const submit = async () => {
    setStatus("saving");
    try {
      await save({
        objectives,
        riskTolerance,
        horizonYears: Math.max(0, Math.min(80, parseInt(horizonYears, 10) || 0)),
        liquidityNeeds,
        taxNotes,
        constraints,
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
    }
  };

  const hasPolicy = Boolean(saved);

  return (
    <div className="panel p-6 mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <ScrollText className="w-5 h-5 text-gold shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold text-white">
              Investment Policy Statement
            </p>
            <p className="text-sm text-white/50 truncate">
              {hasPolicy
                ? `${saved!.riskTolerance} · ${saved!.horizonYears}-year horizon · every thesis gets judged against this`
                : "Write down your objectives and constraints before you analyze a single stock."}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-white/50 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-5 pt-5 border-t border-gold/10 space-y-4">
          <p className="text-sm text-white/55 max-w-3xl">
            Professionals write the policy before the analysis (Reilly &amp; Brown, Ch.2). It is the
            yardstick for every later decision: a stock can be excellent and still not belong in
            your portfolio.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-wider text-white/45">Objectives</span>
              <textarea
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                rows={3}
                placeholder="What is this money for, and what return does that goal actually need?"
                className="mt-1.5 w-full rounded-md bg-white/[0.03] border border-white/10 focus:border-gold/50 outline-none px-3 py-2 text-sm text-white/85 placeholder:text-white/25"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-wider text-white/45">Constraints &amp; exclusions</span>
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                rows={3}
                placeholder="Anything you will not own, position limits, or rules you refuse to break."
                className="mt-1.5 w-full rounded-md bg-white/[0.03] border border-white/10 focus:border-gold/50 outline-none px-3 py-2 text-sm text-white/85 placeholder:text-white/25"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-wider text-white/45">Risk tolerance</span>
              <select
                value={riskTolerance}
                onChange={(e) => setRiskTolerance(e.target.value as RiskTolerance)}
                className="mt-1.5 w-full rounded-md bg-white/[0.03] border border-white/10 focus:border-gold/50 outline-none px-3 py-2 text-sm text-white/85"
              >
                {RISK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#10131f]">
                    {o.label} — {o.hint}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-wider text-white/45">Time horizon (years)</span>
              <input
                type="number"
                min={0}
                max={80}
                value={horizonYears}
                onChange={(e) => setHorizonYears(e.target.value)}
                className="mt-1.5 w-full rounded-md bg-white/[0.03] border border-white/10 focus:border-gold/50 outline-none px-3 py-2 text-sm text-white/85"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-wider text-white/45">Liquidity needs</span>
              <input
                type="text"
                value={liquidityNeeds}
                onChange={(e) => setLiquidityNeeds(e.target.value)}
                placeholder="Cash you may need within 2 years"
                className="mt-1.5 w-full rounded-md bg-white/[0.03] border border-white/10 focus:border-gold/50 outline-none px-3 py-2 text-sm text-white/85 placeholder:text-white/25"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[0.7rem] uppercase tracking-wider text-white/45">Tax situation</span>
            <input
              type="text"
              value={taxNotes}
              onChange={(e) => setTaxNotes(e.target.value)}
              placeholder="Taxable vs sheltered accounts, and anything that changes your after-tax math"
              className="mt-1.5 w-full rounded-md bg-white/[0.03] border border-white/10 focus:border-gold/50 outline-none px-3 py-2 text-sm text-white/85 placeholder:text-white/25"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={status === "saving"}
              className={cn(
                "text-sm font-medium px-4 py-2 rounded-md border transition-colors inline-flex items-center gap-2",
                status === "saving"
                  ? "border-white/10 text-white/40"
                  : "border-gold/40 text-gold hover:bg-gold/10",
              )}
            >
              {status === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : status === "saved" ? <Check className="w-4 h-4" /> : null}
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save policy"}
            </button>
            {status === "error" && (
              <p className="text-sm text-loss-strong">Could not save. Are you signed in?</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
