import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "../lib/cn";

interface GrowthExplainerProps {
  defaultOpen?: boolean;
}

// Grounded in the vault
// and humanizer-passed: no em dashes, no unclear pronoun references.
const PARAS: string[] = [
  "A growth rate can be read two ways, and this model shows both. The historical rate comes from a regression through every year of revenue the company has reported, which uses the whole record rather than two endpoints. The fundamental rate comes from what the company actually does: how much of its profit it puts back into the business, multiplied by the return it earns on that money. The fundamental rate is the sounder anchor, because it ties the growth to the reinvestment that has to pay for it.",
  "The two rates rarely agree, and the gap is the useful part. A company growing faster than its reinvestment and returns can support is spending down an advantage rather than building one, and that gap is flagged here.",
  "There is a second-order effect most growth calculations miss. When a company earns a better return on the assets it already owns, that improvement adds growth on its own, without a single dollar of new investment. The model adds that efficiency term only when the improvement is a trend across consecutive years; a single-year jump is far more often a restatement or a margin blip, so the model warns about it instead of projecting it.",
  "Nothing in the explicit period is clamped. The rate that drives the model is measured from the fundamentals, and when it lands outside the range typical of the company's life-cycle stage the model says so in a warning rather than quietly trimming the number. The one structural ceiling is on the stable phase: perpetual growth can never exceed the risk-free rate, because no company outgrows the economy forever. The stage also decides the model's structure, from a single-stage perpetuity for a firm that is already stable up to a three-stage path with a transition for a very fast grower.",
  "Reinvestment is funded two different ways. A company that already earns a real return on its capital reinvests out of profit, so its reinvestment is its growth divided by that return. A young or loss-making company has no such return to divide by, so its reinvestment is tied to the revenue it is adding, through a sales-to-capital ratio taken from its industry rather than from its own build-out-distorted balance sheet. That second bridge is what allows a company with no profit yet to be valued at all, instead of returning nothing.",
  "Two details matter for a young company. Its invested capital is measured after subtracting cash, because money it raised but has not spent is not capital working in the business. And its margin is faded toward the margin its industry actually earns, because fading toward its own loss-making history would project losses forever and value the company below zero for no good reason.",
];

/**
 * A plain-language explanation of how the growth rate is estimated, collapsed by
 * default. Sits beside the growth reconciliation so the numbers above it can be
 * read with the method in view. Same shape as ScoreExplainer.
 */
export function GrowthExplainer({ defaultOpen = false }: GrowthExplainerProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-soft overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left group"
      >
        <Info className="w-3.5 h-3.5 text-gold/70 shrink-0" />
        <span className="flex-1 text-[0.8rem] font-semibold text-white/75">
          How the growth rate is estimated
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
            open && "rotate-180 text-gold",
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gold/10 space-y-2.5">
          {PARAS.map((p, i) => (
            <p key={i} className="text-xs text-white/55 leading-relaxed">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
