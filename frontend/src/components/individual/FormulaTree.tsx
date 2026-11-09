// Learn slice A2: draws a metric's formula tree in the definition sidebar. The
// formula, the same line with the company's numbers, and the result; then each
// variable with its value. A variable with its own formula opens in place; a
// variable's name opens its existing definition. Where a value comes from and
// any rule the app applies show on hover (title), not as extra lines. Draws
// only: every number arrives formatted from backend/company_profile/formulas.py.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { openDefinition } from "../../lib/definitionPanelStore";
import { defNumberFor, type FormulaNode } from "../../lib/formulaTree";

function hoverText(node: FormulaNode): string | undefined {
  const parts = [node.source, node.rule && `Rule: ${node.rule}`].filter(Boolean);
  return parts.length ? parts.join("\n") : undefined;
}

function FormulaLines({ node, emphasis = false }: { node: FormulaNode; emphasis?: boolean }) {
  return (
    <div
      className="text-[0.95rem] font-bold leading-relaxed space-y-1 break-words"
      title={hoverText(node)}
    >
      {node.formula && (
        <p className="text-white">
          {node.name} = {node.formula}
        </p>
      )}
      {node.substituted && <p className="text-white/80">= {node.substituted}</p>}
      <p className={emphasis ? "text-gold text-[1.05rem]" : "text-white"}>= {node.display}</p>
    </div>
  );
}

function VariableRow({ node, depth }: { node: FormulaNode; depth: number }) {
  const [open, setOpen] = useState(false);
  const def = defNumberFor(node);
  const hasFormula = !!node.formula && node.children.length > 0;
  return (
    <li className={cn(depth > 0 && "pl-3 border-l border-white/[0.12]")}>
      <div className="flex items-baseline justify-between gap-3" title={hoverText(node)}>
        <div className="flex items-baseline gap-1 min-w-0">
          {hasFormula ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} how ${node.name} is calculated`}
              className="self-center text-white/60 hover:text-gold shrink-0"
            >
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          {def ? (
            <button
              type="button"
              onClick={() => openDefinition(def)}
              className="text-left text-[0.95rem] font-bold text-white underline decoration-dotted decoration-white/30 underline-offset-2 hover:text-gold"
              title={`Open the definition of ${node.name}`}
            >
              {node.name}
            </button>
          ) : (
            <span className="text-[0.95rem] font-bold text-white">{node.name}</span>
          )}
        </div>
        <span className="text-[0.95rem] font-bold tabular-nums text-white shrink-0">
          {node.display}
        </span>
      </div>
      {open && hasFormula && (
        <div className="mt-2 ml-5 space-y-2.5">
          <FormulaLines node={node} />
          <VariableList nodes={node.children} depth={depth + 1} />
        </div>
      )}
    </li>
  );
}

function VariableList({ nodes, depth }: { nodes: FormulaNode[]; depth: number }) {
  return (
    <ul className="space-y-2.5">
      {nodes.map((n) => (
        <VariableRow key={`${depth}-${n.key}`} node={n} depth={depth} />
      ))}
    </ul>
  );
}

// The owner's choice for this block (2026-11-08): Times New Roman, bold.
const TREE_FONT = { fontFamily: '"Times New Roman", Times, serif' };

export function FormulaTree({ root }: { root: FormulaNode }) {
  return (
    <div className="space-y-3" style={TREE_FONT}>
      <FormulaLines node={root} emphasis />
      <div className="pt-3 border-t border-white/[0.08]">
        <VariableList nodes={root.children} depth={0} />
      </div>
    </div>
  );
}
