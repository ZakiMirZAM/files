import { useState } from "react";
import { ChevronDown, ShieldCheck, Undo2 } from "lucide-react";
import { cn } from "../lib/cn";
import type { VerificationReport } from "../lib/aiApi";

/**
 * Rendering of the RAG server's answer verification report.
 *
 * OFF BY DEFAULT, and deliberately so. The grader behind the report is not yet
 * calibrated: across 48 real answers every flag adjudicated so far turned out to
 * be a grader artefact rather than a model error, so telling a user "this figure
 * is wrong" today would itself be wrong. Set VITE_AI_VERIFY=on to render it.
 *
 * The server also withholds the per-claim detail while it runs in `shadow`, so
 * every consumer here treats `flagged` and friends as optional and simply shows
 * less when they are absent.
 *
 * This is plain React, never routed through <Markdown>: that renderer supports
 * no links, images, blockquotes or fenced code. The anchor into the answer is
 * the quoted claim text, which the reader finds with the browser's own find.
 */
export const AI_VERIFY_UI = import.meta.env.VITE_AI_VERIFY === "on";

// ── report arithmetic ───────────────────────────────────────────────────────

/** Claims reconciled against the page figures, exactly or within tolerance. */
function matchCount(report: VerificationReport): number {
  return report.matched + report.approx;
}

/** Claims and derivations the report wants a human to look at. */
export function reviewCount(report: VerificationReport): number {
  return (
    report.mismatched +
    report.arithmetic.errors +
    (report.transcriptionErrors?.length ?? 0)
  );
}

function hasDetailRows(report: VerificationReport): boolean {
  return (
    (report.flagged?.length ?? 0) > 0 ||
    (report.arithmeticErrors?.length ?? 0) > 0 ||
    (report.transcriptionErrors?.length ?? 0) > 0
  );
}

// ── value formatting ────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

const UNIT_SUFFIX = /(%|pp|bps|x)$/i;

/**
 * Format a computed value in the same unit the answer used, so the two columns
 * are comparable at a glance. Reads the unit off the claim as written.
 */
function withUnitOf(raw: string, value: number): string {
  const text = raw.trim();
  const body = fmtNum(value);
  const unit = UNIT_SUFFIX.exec(text);
  if (unit) return `${body}${unit[1]}`;
  if (text.startsWith("$")) return `$${body}`;
  return body;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ── status strip ────────────────────────────────────────────────────────────

interface StripProps {
  report: VerificationReport | undefined;
  /** True once a second pass rewrote the answer against the page data. */
  revised?: boolean;
  correctedCount?: number;
  showingOriginal?: boolean;
  onToggleOriginal?: () => void;
}

/**
 * The one-line status that sits beside the panel's `Saved · <date>` line.
 * Reads as "Figures checked · 13 of 14 match · 1 to review".
 */
export function AiVerificationStrip({
  report,
  revised = false,
  correctedCount = 0,
  showingOriginal = false,
  onToggleOriginal,
}: StripProps) {
  if (!AI_VERIFY_UI || !report) return null;

  const total = report.bound;
  const ok = matchCount(report);
  const review = reviewCount(report);
  if (total === 0 && review === 0 && !revised) return null;

  const corrected = correctedCount > 0 ? correctedCount : (report.revisedCount ?? 0);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={cn(
          "inline-flex items-center gap-1.5",
          review > 0 ? "text-gold/80" : "text-white/35",
        )}
      >
        <ShieldCheck className={cn("w-3 h-3 shrink-0", review > 0 ? "text-gold/70" : "text-gold/40")} />
        Figures checked
        {total > 0 && (
          <>
            <span aria-hidden="true">·</span>
            {ok} of {total} match
          </>
        )}
        {review > 0 && (
          <>
            <span aria-hidden="true">·</span>
            {review} to review
          </>
        )}
      </span>

      {revised && (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-white/45">
          <span aria-hidden="true">·</span>
          <span>
            Revised · {corrected > 0 ? corrected : 1}{" "}
            {plural(corrected > 0 ? corrected : 1, "figure", "figures")} corrected against the
            app&apos;s own data
          </span>
          {onToggleOriginal && (
            <button
              type="button"
              onClick={onToggleOriginal}
              aria-pressed={showingOriginal}
              className="btn-ghost inline-flex items-center gap-1.5 text-[0.7rem] px-2 py-0.5"
            >
              <Undo2 className="w-3 h-3" />
              {showingOriginal ? "Show revised" : "Show original"}
            </button>
          )}
        </span>
      )}
    </span>
  );
}

// ── expandable detail ───────────────────────────────────────────────────────

function Columns({ cells }: { cells: string[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[0.7rem] text-white/60">
      {cells.map((c, i) => (
        <span key={i} className="inline-flex items-baseline gap-2">
          {i > 0 && (
            <span aria-hidden="true" className="text-white/20">
              ·
            </span>
          )}
          <span>{c}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * The per-claim block, rendered below the answer and above the vault sources.
 * Collapsed by default. Returns nothing when the server withheld the detail,
 * which is what happens in shadow mode.
 */
export function AiVerificationDetail({ report }: { report: VerificationReport | undefined }) {
  const [open, setOpen] = useState(false);
  if (!AI_VERIFY_UI || !report || !hasDetailRows(report)) return null;

  const review = reviewCount(report);
  const flagged = report.flagged ?? [];
  const arithmetic = report.arithmeticErrors ?? [];
  const transcription = report.transcriptionErrors ?? [];

  return (
    <div className="panel-soft overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left group"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-gold/70 shrink-0" />
        <span className="flex-1 text-[0.78rem] font-semibold text-white/75">
          {review > 0 ? `${review} ${plural(review, "figure", "figures")} to review` : "Figures to review"}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
            open && "rotate-180 text-gold",
          )}
        />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-gold/10 space-y-3">
          {flagged.map((f, i) => (
            <div key={`f${i}`} className="space-y-1">
              <Columns
                cells={[
                  `Stated ${f.text}`,
                  f.expected != null ? `Page data ${withUnitOf(f.text, f.expected)}` : "Page data not found",
                  f.via ?? f.label ?? "unlabelled",
                ]}
              />
            </div>
          ))}

          {arithmetic.map((a, i) => (
            <div key={`a${i}`} className="space-y-1">
              <p className="font-mono text-[0.7rem] text-white/45 leading-snug break-words">{a.text}</p>
              <Columns
                cells={[
                  a.stated != null ? `Stated ${fmtNum(a.stated)}` : "Stated not read",
                  a.computed != null ? `Recomputed ${fmtNum(a.computed)}` : "Recomputed not available",
                  "stated derivation",
                ]}
              />
            </div>
          ))}

          {transcription.map((t, i) => (
            <div key={`t${i}`} className="space-y-1">
              <Columns
                cells={[
                  `Written ${t.raw ?? (t.answer_said != null ? fmtNum(t.answer_said) : "not read")}`,
                  t.tool_result != null ? `Calculator ${fmtNum(t.tool_result)}` : "Calculator not available",
                  t.label ?? t.expression ?? "calculated figure",
                ]}
              />
            </div>
          ))}

          <p className="text-[0.7rem] text-white/35 leading-relaxed pt-1">
            Each figure above is quoted exactly as the answer wrote it, so your browser&apos;s find
            will locate it in the text.
          </p>
        </div>
      )}
    </div>
  );
}
