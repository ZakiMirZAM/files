// OWNED BY AGENT 2 (A4 AI-made decks). Placeholder from the shared base.
// Contract: the user types a request and a card count; the AI builds the cards
// (vault first, then web); the component saves them as a new deck through
// api.learn.createDeckWithCards and calls onCreated(deckId).

import type { Id } from "../../../convex/_generated/dataModel";

export interface AiDeckGeneratorProps {
  onCreated: (deckId: Id<"learnDecks">) => void;
}

export function AiDeckGenerator(_props: AiDeckGeneratorProps) {
  return <p className="text-sm text-white/55">AI decks are coming.</p>;
}
