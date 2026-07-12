import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "../lib/cn";

interface ScoreExplainerProps {
  /** Which comparison this explains. */
  variant: "sector" | "industry";
  /** Start expanded (used inside the score panel). Default collapsed. */
  defaultOpen?: boolean;
}

// RAG-grounded (Damodaran Investment Valuation Ch.31 on the value-creation test;
// Porter Competitive Strategy Ch.1 on industry structure) and humanizer-passed:
// no em dashes, no unclear pronoun references.
const COPY: Record<"sector" | "industry", { title: string; paras: string[] }> = {
  sector: {
    title: "How the sector Value Score works",
    paras: [
      "The Value Score rates how well a sector's businesses turn capital into value, on a scale of 0 to 100. It is a screening rank that sorts the sectors quickly. It is not a price or a valuation, and a high score does not mean the sector is cheap.",
      "The score leans hardest on economic profit, which asks one question: does the sector earn more on its capital than that capital costs? The ROIC minus WACC spread answers that question as a rate, and EVA margin answers it for each dollar of sales, so those two carry the most weight. The cost of capital is scored on its own as well, because cheaper and steadier funding leaves more value for owners. Margins, cash conversion, the price paid against the book value the returns justify, and revenue growth sit behind them at lower weight.",
      "Raw return on equity and headline growth are kept light on purpose. Return on equity is lifted by borrowing, so a heavily indebted sector can look strong without earning any more on its assets. Growth only builds value when the return on capital beats the cost of capital, and below that line growth destroys value even while profits are still reported. Damodaran makes this point directly in Investment Valuation, and by his count a majority of companies worldwide earn below their cost of capital while reporting a profit.",
      "Banks and real estate are judged differently. For those groups debt is raw material rather than financing, so the score drops the ROIC test and uses return on equity against the cost of equity instead. A sector that earns below its cost of capital is held near the bottom of the range, so a value destroyer can never screen as high quality.",
      "Read the score together with the questions below, which check whether the numbers behind it lean on one-time gains, on borrowing, or on a handful of very large companies.",
    ],
  },
  industry: {
    title: "How the industry Value Score works",
    paras: [
      "Industries are scored on the same engine as sectors, but each industry is ranked against the other industries inside its own sector rather than against the whole market. The score is a rank from 0 to 100, a screening tool rather than a valuation.",
      "Industry structure is the reason for comparing within a sector. Porter's work shows that the forces shaping an industry, such as the threat of new entrants, the power of buyers and suppliers, and the intensity of rivalry, set how much return is sustainably possible there. A chip maker, a software firm, and a hardware assembler all sit inside Technology, yet those forces point in very different directions for each. Measuring them against oil or pharmaceuticals would add another layer of difference and turn the ranking into noise, so judging them within Technology holds the structural conditions roughly equal and lets real differences in operating quality show through.",
      "The score leans hardest on economic profit, the ROIC minus WACC spread and EVA margin, because economic profit is what tells you whether reinvestment builds value rather than just adding size. Each parent sector applies its own weighting: banks and property groups are judged on return on equity against the cost of equity instead, since debt is their raw material and the usual capital test does not apply to them. An industry earning below its cost of capital is held near the bottom of the range.",
      "Read the score together with the questions below, which check whether the numbers behind it lean on one-time gains, on borrowing, or on a few large companies.",
    ],
  },
};

/**
 * A collapsible, plain-language explanation of how the Value Score is built,
 * with a sector variant and an industry variant. Sits near the score row on the
 * comparison matrices and inside the score panel on the detail pages.
 */
export function ScoreExplainer({ variant, defaultOpen = false }: ScoreExplainerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { title, paras } = COPY[variant];
  return (
    <div className="panel-soft overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left group"
      >
        <Info className="w-3.5 h-3.5 text-gold/70 shrink-0" />
        <span className="flex-1 text-[0.8rem] font-semibold text-white/75">{title}</span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
            open && "rotate-180 text-gold",
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gold/10 space-y-2.5">
          {paras.map((p, i) => (
            <p key={i} className="text-xs text-white/55 leading-relaxed">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
