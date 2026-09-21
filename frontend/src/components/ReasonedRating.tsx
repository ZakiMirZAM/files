// Rule B: reasoning first, rating last.
// The reader writes a summary, then sets a 1-to-5 number. The number is
// never checked, compared with data, or coloured by the app.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { SectionKey } from "../lib/types";
import { useSavedAnswerRaw } from "../lib/useSavedAnswer";
import { useDebouncedSave } from "../lib/useDebouncedSave";
import { cn } from "../lib/cn";

/** How long the reason box waits after the last keystroke before it saves. */
const SAVE_DELAY_MS = 600;

// ── Encode / decode ────────────────────────────────────────────────────────

const SEPARATOR = " || ";

/** Encode a reason + rating into the single string stored in Convex.
 *  Reason comes first so loading splits on the LAST separator. */
export function encodeReasonedRating(
  reason: string,
  rating: number | null,
): string {
  if (rating == null) return reason;
  return `${reason}${SEPARATOR}${rating}`;
}

/** Decode a stored string into { reason, rating }.
 *  Splits on the LAST " || " so a reason containing the separator survives. */
export function decodeReasonedRating(
  raw: string | undefined | null,
): { reason: string; rating: number | null } {
  if (!raw) return { reason: "", rating: null };
  const idx = raw.lastIndexOf(SEPARATOR);
  if (idx < 0) return { reason: raw, rating: null };
  const reason = raw.slice(0, idx);
  const n = parseInt(raw.slice(idx + SEPARATOR.length), 10);
  if (Number.isNaN(n) || n < 1 || n > 5) return { reason: raw, rating: null };
  return { reason, rating: n };
}

/** Pure gating function: is the rating control enabled? */
export function isRatingEnabled(reason: string): boolean {
  return reason.trim().length > 0;
}

// ── Props ──────────────────────────────────────────────────────────────────

interface ReasonedRatingProps {
  section: SectionKey;
  scopeKey: string;
  questionId: string;
  /** The prompt shown above the text area. */
  prompt: string;
  /** Label for the 1-to-5 scale, e.g. "Threat of entry: 1 is very weak, 5 is very strong". */
  scaleLabel: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ReasonedRating({
  section,
  scopeKey,
  questionId,
  prompt,
  scaleLabel,
}: ReasonedRatingProps) {
  const savedRaw = useSavedAnswerRaw(section, scopeKey, questionId);
  const saveAnswer = useMutation(api.qualitative.saveAnswer);

  const decoded = useMemo(() => decodeReasonedRating(savedRaw), [savedRaw]);

  const [reason, setReason] = useState(decoded.reason);
  const [rating, setRating] = useState<number | null>(decoded.rating);

  const persist = useCallback(
    (encoded: string) => saveAnswer({ section, scopeKey, questionId, answer: encoded }),
    [saveAnswer, section, scopeKey, questionId],
  );

  // The reason and the rating are stored as one string, so one debounce covers
  // both. A rejected save is caught inside the hook and never escapes.
  const { lastSaved } = useDebouncedSave(
    encodeReasonedRating(reason, rating),
    persist,
    SAVE_DELAY_MS,
  );

  // Sync from server when the saved value changes (initial load or external
  // write). Marking it as already saved stops the sync from writing it back.
  useEffect(() => {
    setReason(decoded.reason);
    setRating(decoded.rating);
    lastSaved.current = encodeReasonedRating(decoded.reason, decoded.rating);
    // lastSaved is a ref, stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded.reason, decoded.rating]);

  const handleReasonChange = (text: string) => {
    setReason(text);
    // If the rating exists but the reason was cleared, disable rating.
    const nextRating = text.trim().length > 0 ? rating : null;
    if (nextRating !== rating) setRating(nextRating);
  };

  const handleRating = (n: number) => {
    if (!isRatingEnabled(reason)) return;
    setRating(rating === n ? null : n);
  };

  const enabled = isRatingEnabled(reason);

  return (
    <div className="space-y-3 mt-4">
      {/* Prompt */}
      <p className="text-sm text-white/70 leading-relaxed">{prompt}</p>

      {/* Text area */}
      <textarea
        value={reason}
        onChange={(e) => handleReasonChange(e.target.value)}
        placeholder="Write your summary here before setting a rating."
        rows={3}
        className={cn(
          "w-full rounded-md border border-gold/20 bg-ink-900 px-3 py-2",
          "text-sm text-white/90 placeholder:text-white/30",
          "focus:outline-none focus:ring-1 focus:ring-gold/40 resize-y",
        )}
      />

      {/* Five-step rating (radio group semantics) */}
      <div>
        <p className="text-xs text-white/50 mb-2">{scaleLabel}</p>
        <div
          role="radiogroup"
          aria-label={scaleLabel}
          className="flex gap-2"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}`}
              disabled={!enabled}
              onClick={() => handleRating(n)}
              className={cn(
                "w-9 h-9 rounded-md text-sm font-mono transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/60",
                !enabled && "opacity-30 cursor-not-allowed",
                enabled && rating === n
                  ? "bg-gold/20 text-gold border border-gold/50"
                  : enabled
                    ? "bg-white/5 text-white/60 border border-white/10 hover:border-gold/30 hover:text-gold"
                    : "bg-white/5 text-white/20 border border-white/5",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
