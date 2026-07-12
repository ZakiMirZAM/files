// Combined definition lookup across the individual page and the three group
// surfaces. Numbers never collide (individual 1-180, comparative 201-299,
// industry 301-399, sector 401-499), so a single global by-number lookup serves
// the one shared DefinitionPanel regardless of which page mounted it.

import { defByNumber } from "./individualDefinitions";
import { surfaceDefByNumber } from "./surfaceDefinitions";
import { economicDefByPanelNumber } from "./economicDefinitions";
import { creditDefByPanelNumber } from "./creditDefinitions";

/** Minimal shape the sidebar panel needs to render any definition. */
export interface AnyDef {
  number: number;
  title: string;
  load: () => Promise<string>;
}

export function anyDefByNumber(number: number): AnyDef | undefined {
  return (
    defByNumber(number) ??
    surfaceDefByNumber(number) ??
    creditDefByPanelNumber(number) ??
    economicDefByPanelNumber(number)
  );
}
