// Compact panel showing the goal text for a given analysis stage, so the user
// knows what they should settle before moving to the next page. Uses the same
// styling vocabulary as GroupScorePanel (panel class, subtle border accent).

import { STAGE_GOALS } from "../lib/connectionsCopy";

type Stage =
  | "economic"
  | "credit"
  | "sector"
  | "industry"
  | "comparative"
  | "company"
  | "report";

interface StageGoalPanelProps {
  stage: Stage;
}

export function StageGoalPanel({ stage }: StageGoalPanelProps) {
  const goalText = STAGE_GOALS[stage];
  if (!goalText) return null;

  return (
    <div className="panel px-4 py-3 border-l-2 border-gold/40">
      <p className="text-sm text-white/70">{goalText}</p>
    </div>
  );
}
