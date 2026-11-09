// Learn slice A2: draws a metric's formula tree in the definition sidebar. The
// formula, the same line with the company's numbers, and the result; then each
// variable with its value, where it comes from and any rule the app applies.
// A variable with its own formula opens in place; a variable's name opens its
// existing definition. Draws only: every number arrives formatted from
// backend/company_profile/formulas.py.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { openDefinition } from "../../lib/definitionPanelStore";
import { defNumberFor, type FormulaNode } from "../../lib/formulaTree";

function FormulaLines({ node, emphasis = false }: { node: FormulaNode; emphasis?: boolean }) {
  return (
    <div className="font-mono text-[0.75rem] leading-relaxed space-y-0.5 break-words">
      {node.formula && (
        <p className="text-white/85">
          {node.name} = {node.formula}
        </p>
      )}
      {node.substituted && <p className="text-white/50">= {node.substituted}</p>}
      <p className={emphasis ? "text-gold" : "text-white/85"}>= {node.display}</p>
    </div>
  );
}

function VariableRow({ node, depth }: { node: FormulaNode; depth: number }) {
  const [open, setOpen] = useState(false);
  const def = defNumberFor(node);
  const hasFormula = !!node.formula && node.children.length > 0;
  return (
    <li className={cn(depth > 0 && "pl-3 border-l border-white/[0.08]")}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1 min-w-0">
          {hasFormula ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} how ${node.name} is calculated`}
              className="self-center text-white/45 hover:text-gold shrink-0"
            >
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {def ? (
            <button
              type="button"
              onClick={() => openDefinition(def)}
              className="text-left text-[0.75rem] text-white/70 underline decoration-dotted decoration-white/25 underline-offset-2 hover:text-gold"
              title={`Open the definition of ${node.name}`}
            >
              {node.name}
            </button>
          ) : (
            <span className="text-[0.75rem] text-white/70">{node.name}</span>
          )}
        </div>
        <span className="font-mono text-[0.75rem] tabular-nums text-white/85 shrink-0">{node.display}</span>
      </div>
      {(node.source || node.rule) && (
        <div className="pl-[1.125rem] space-y-0.5">
          {node.source && <p className="text-[0.65rem] leading-snug text-white/35">{node.source}</p>}
          {node.rule && <p className="text-[0.65rem] leading-snug text-white/45">Rule: {node.rule}</p>}
        </div>
      )}
      {open && hasFormula && (
        <div className="mt-2 ml-[1.125rem] space-y-2">
          <FormulaLines node={node} />
          <VariableList nodes={node.children} depth={depth + 1} />
        </div>
      )}
    </li>
  );
}

function VariableList({ nodes, depth }: { nodes: FormulaNode[]; depth: number }) {
  return (
    <ul className="space-y-2">
      {nodes.map((n) => (
        <VariableRow key={`${depth}-${n.key}`} node={n} depth={depth} />
      ))}
    </ul>
  );
}

export function FormulaTree({ root }: { root: FormulaNode }) {
  return (
    <div className="space-y-3">
      <FormulaLines node={root} emphasis />
      {root.rule && <p className="text-[0.65rem] leading-snug text-white/45">Rule: {root.rule}</p>}
      <div className="pt-2 border-t border-white/[0.06]">
        <VariableList nodes={root.children} depth={0} />
      </div>
    </div>
  );
}
