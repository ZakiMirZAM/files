import { useMemo, Fragment, type ReactNode } from "react";
import { parseMarkdown, parseInline, type MdBlock } from "../lib/markdown";

interface MarkdownProps {
  content: string;
}

/** Render inline **bold** / *italic* / `code` for a single string. */
function Inline({ text }: { text: string }): ReactNode {
  const tokens = parseInline(text);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === "bold") return <strong key={i} className="text-white/90 font-semibold">{t.value}</strong>;
        if (t.kind === "italic") return <em key={i} className="text-white/80">{t.value}</em>;
        if (t.kind === "code")
          return (
            <code key={i} className="font-mono text-[0.85em] text-gold bg-white/[0.06] px-1.5 py-0.5 rounded">
              {t.value}
            </code>
          );
        return <Fragment key={i}>{t.value}</Fragment>;
      })}
    </>
  );
}

// --- Display equations ------------------------------------------------------
// A paragraph that is nothing but a single `code` span containing "=" or "√"
// is rendered as a real equation: top-level "÷" becomes a stacked fraction,
// "√(…)" gets a radical with a vinculum, and "×" stays as an operator glyph.
// Precedence: split on spaced +/−/± first, then ÷ (fractions), then ×.

function splitTopLevel(s: string, op: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === op && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  const trimmed = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  return trimmed.length > 0 ? trimmed : [s.trim()];
}

/** Split on spaced additive operators (+ − ±) outside parentheses, keeping the operators. */
function splitAdditive(s: string): { terms: string[]; ops: string[] } {
  const terms: string[] = [];
  const ops: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    const isAdditive = ch === "+" || ch === "−" || ch === "±";
    if (depth === 0 && isAdditive && s[i - 1] === " " && s[i + 1] === " ") {
      terms.push(cur.trim());
      ops.push(ch);
      cur = "";
      i++; // skip the trailing space
    } else {
      cur += ch;
    }
  }
  terms.push(cur.trim());
  return { terms, ops };
}

/** Remove one pair of parentheses if they enclose the whole expression. */
function stripOuterParens(s: string): string {
  const t = s.trim();
  if (!t.startsWith("(") || !t.endsWith(")")) return t;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")") depth--;
    if (depth === 0 && i < t.length - 1) return t; // closes early, not one group
  }
  return t.slice(1, -1).trim();
}

function EqOperator({ glyph }: { glyph: string }): ReactNode {
  return <span className="text-gold/85 mx-1.5 shrink-0">{glyph}</span>;
}

function EqFrac({ num, den }: { num: ReactNode; den: ReactNode }): ReactNode {
  return (
    <span data-eq-frac className="inline-flex flex-col items-center align-middle text-center mx-1">
      <span className="px-2 leading-snug">{num}</span>
      <span className="self-stretch h-px bg-gold/60 my-1" aria-hidden="true" />
      <span className="px-2 leading-snug">{den}</span>
    </span>
  );
}

function EqRadical({ body }: { body: string }): ReactNode {
  return (
    <span data-eq-radical className="inline-flex items-stretch align-middle mx-0.5">
      <span className="text-gold/90 self-end leading-none text-[1.2em]">√</span>
      <span className="border-t border-gold/60 px-1.5 pt-0.5">
        <EqExpr s={body} />
      </span>
    </span>
  );
}

/** Additive level: terms joined by + / − / ± glyphs. */
function EqExpr({ s }: { s: string }): ReactNode {
  const { terms, ops } = splitAdditive(s);
  return (
    <>
      {terms.map((t, i) => (
        <Fragment key={i}>
          {i > 0 && <EqOperator glyph={ops[i - 1]} />}
          <EqDiv s={t} />
        </Fragment>
      ))}
    </>
  );
}

/** Division level: top-level ÷ chains become left-associative stacked fractions. */
function EqDiv({ s }: { s: string }): ReactNode {
  const parts = splitTopLevel(s, "÷");
  if (parts.length > 1) {
    return parts
      .slice(1)
      .reduce<ReactNode>(
        (num, den) => <EqFrac num={num} den={<EqExpr s={stripOuterParens(den)} />} />,
        <EqExpr s={stripOuterParens(parts[0])} />,
      );
  }
  return <EqMul s={s} />;
}

/** Multiplication level: factors joined by × glyphs; resolves radicals and grouped fractions. */
function EqMul({ s }: { s: string }): ReactNode {
  const parts = splitTopLevel(s, "×");
  return (
    <>
      {parts.map((p, i) => {
        let node: ReactNode;
        const inner = stripOuterParens(p);
        if (p.startsWith("√")) {
          node = <EqRadical body={stripOuterParens(p.slice(1).trim())} />;
        } else if (inner !== p && inner.includes("÷")) {
          node = <EqExpr s={inner} />; // parenthesized division → fraction, parens dropped
        } else {
          node = <span>{p}</span>; // plain operand; keeps grouping parens like (1 − Tax Rate)
        }
        return (
          <Fragment key={i}>
            {i > 0 && <EqOperator glyph="×" />}
            {node}
          </Fragment>
        );
      })}
    </>
  );
}

function BlockEquation({ formula }: { formula: string }): ReactNode {
  const sides = splitTopLevel(formula, "=");
  return (
    <div
      data-equation
      className="my-5 px-4 py-4 rounded-sm border border-gold/15 bg-white/[0.03] overflow-x-auto"
    >
      <div className="flex flex-wrap items-center justify-center gap-y-2 font-display text-[1.05rem] text-white/90 min-w-min">
        {sides.map((side, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="text-gold font-semibold mx-2.5 shrink-0">=</span>}
            <span className="inline-flex flex-wrap items-center justify-center">
              <EqExpr s={side} />
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** True when a paragraph is a standalone formula: one code span containing = or √. */
function asEquation(text: string): string | null {
  const tokens = parseInline(text.trim());
  if (tokens.length !== 1 || tokens[0].kind !== "code") return null;
  const v = tokens[0].value;
  return v.includes("=") || v.includes("√") ? v : null;
}

function Block({ block }: { block: MdBlock }): ReactNode {
  switch (block.type) {
    case "heading": {
      if (block.level === 1) {
        // The file's H1 is the metric name, already shown in the dropdown header.
        return (
          <h3 className="font-display text-xl font-semibold text-white mt-2 mb-3">
            <Inline text={block.text} />
          </h3>
        );
      }
      if (block.level === 2)
        return (
          <h4 className="font-display text-base font-semibold text-gold mt-7 mb-2.5 flex items-center gap-2.5">
            <span className="block w-4 h-px bg-gold/50" />
            <Inline text={block.text} />
          </h4>
        );
      return (
        <h5 className="font-semibold text-white/85 mt-4 mb-1.5 text-[1rem]">
          <Inline text={block.text} />
        </h5>
      );
    }
    case "paragraph": {
      const formula = asEquation(block.text);
      if (formula) return <BlockEquation formula={formula} />;
      return (
        <p className="text-[1rem] leading-7 text-white/80 my-3">
          <Inline text={block.text} />
        </p>
      );
    }
    case "ul":
      return (
        <ul className="list-disc pl-5 space-y-1.5 my-2.5 marker:text-gold/50">
          {block.items.map((it, i) => (
            <li key={i} className="text-[1rem] leading-7 text-white/80">
              <Inline text={it} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol start={block.start} className="list-decimal pl-5 space-y-2 my-2.5 marker:text-gold/60 marker:font-mono">
          {block.items.map((it, i) => (
            <li key={i} className="text-[1rem] leading-7 text-white/80 pl-1">
              <Inline text={it} />
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="my-4 overflow-x-auto rounded-sm border border-gold/15">
          <table className="w-full border-collapse text-left text-[0.9rem]">
            <thead>
              <tr className="bg-white/[0.04]">
                {block.header.map((h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2.5 font-semibold text-gold/90 align-top border-b border-gold/20 whitespace-pre-wrap"
                  >
                    <Inline text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="odd:bg-white/[0.015] align-top">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-2.5 leading-6 text-white/72 border-b border-white/[0.06] whitespace-pre-wrap"
                    >
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr className="my-5 border-0 border-t border-gold/10" />;
  }
}

export function Markdown({ content }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  return (
    <div className="economic-doc max-w-[72ch]">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}
