// The one line a section prints instead of a figure, when the method does not
// fit this company, industry or period.
//
// Every analysis block on the individual page follows the same contract: it
// returns {"applicable": false, "reason": ...} rather than raising, and the
// section renders that reason in place of its table or chart. Twelve sections
// wrote the same paragraph by hand. The frame around it is still each
// section's own; only the sentence itself lives here.

interface NotApplicableProps {
  /** The backend's own reason, when the payload carried one. */
  reason?: string | null;
  /** What the section says when it did not. Sections with nothing to say when
   *  the reason is missing simply render nothing, which is what they did. */
  fallback?: string;
}

export function NotApplicable({ reason, fallback }: NotApplicableProps) {
  return <p className="text-sm text-white/55">{reason ?? fallback}</p>;
}
