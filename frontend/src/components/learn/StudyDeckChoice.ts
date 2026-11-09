// Which deck the Study tab opens on. The Decks tab sets it when the user taps
// "Study" on a deck; null means all decks. Kept in localStorage so it survives
// the tab switch and a reload.

import type { Id } from "../../../convex/_generated/dataModel";

const KEY = "ifed.learn.studyDeck";

export function setStudyDeck(deckId: Id<"learnDecks"> | null): void {
  try {
    if (deckId) localStorage.setItem(KEY, deckId);
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: Study opens on all decks
  }
}

export function getStudyDeck(): Id<"learnDecks"> | null {
  try {
    return (localStorage.getItem(KEY) as Id<"learnDecks"> | null) ?? null;
  } catch {
    return null;
  }
}
