// OWNED BY AGENT 1 (A4 decks + import). Placeholder from the shared base.
// Renders <AiDeckGenerator /> (owned by agent 2) for AI-made decks.

import { AiDeckGenerator } from "./AiDeckGenerator";

export interface DecksTabProps {
  /** Switch to the Study tab (e.g. after choosing a deck to study). */
  onStudy: () => void;
}

export function DecksTab(_props: DecksTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">Decks are coming.</p>
      <AiDeckGenerator onCreated={() => {}} />
    </div>
  );
}
