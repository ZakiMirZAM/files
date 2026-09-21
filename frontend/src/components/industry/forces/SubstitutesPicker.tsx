// Industry picker for the substitutes force card.
// Saves the pick as ind.forces.substitutes.pick, then loads the substitute
// industry's structure to show its growth and margin beside this industry's.

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { SectionKey } from "../../../lib/types";
import type { IndustryStructure } from "../../../lib/industryStructureApi";
import { useIndustryStructure } from "../../../lib/industryStructureApi";
import { useIndustries, useValueSystem } from "../../../lib/groupMapApi";
import {
  NOT_REPORTED,
  growthCell,
  marginCell,
  pctFromFraction,
} from "../../../lib/industryStructureFormat";
import { SECTION_STATUS, peerCountLabel } from "../../../lib/industryForcesCopy";
import { VALUE_SYSTEM_COPY } from "../../../lib/industryDecksB";
import { useSavedAnswer } from "../../../lib/useSavedAnswer";
import { ComparisonTile } from "./ComparisonTile";

const PICK_ID = "ind.forces.substitutes.pick";

/** Fewer than this many years of spread data and the series is not worth showing. */
const MIN_GROSS_MARGIN_YEARS = 5;

interface SubstitutesPickerProps {
  /** The focal industry name. */
  industry: string;
  /** The focal industry's structure data. */
  structure: IndustryStructure;
  section: SectionKey;
  scopeKey: string;
}

export function SubstitutesPicker({
  industry,
  structure,
  section,
  scopeKey,
}: SubstitutesPickerProps) {
  const saveAnswer = useMutation(api.qualitative.saveAnswer);
  const savedPick = useSavedAnswer(section, scopeKey, PICK_ID);

  const [pick, setPick] = useState(savedPick);

  // Sync from server on first load.
  useEffect(() => {
    if (savedPick) setPick(savedPick);
  }, [savedPick]);

  const { data: industries } = useIndustries();

  // The focal call carries no supplier or buyer, so it shares one request with
  // every other section of this page asking the same question.
  const { data: focalVs } = useValueSystem(industry);

  const substitute = pick && pick !== industry ? pick : undefined;
  const { data: subVs, state: subVsState } = useValueSystem(substitute);
  const { data: subStructure, state: subStructureState } = useIndustryStructure(substitute);

  const loading =
    substitute != null &&
    (subVsState === "loading" || subStructureState === "loading");

  const handleChange = useCallback(
    (value: string) => {
      setPick(value);
      void Promise.resolve(
        saveAnswer({ section, scopeKey, questionId: PICK_ID, answer: value }),
      ).catch(() => {
        // Unauthenticated or offline: the pick still drives this card's fetch.
      });
    },
    [saveAnswer, section, scopeKey],
  );

  // Focal industry's gross margin spread, year by year, from evolution.
  const focalGrossMarginSeries = structure.evolution.grossMarginSpread;
  const hasGrossMarginHistory = focalGrossMarginSeries.length >= MIN_GROSS_MARGIN_YEARS;

  const filteredIndustries = (industries ?? []).filter((e) => e.name !== industry);

  return (
    <div className="space-y-3">
      <label className="block text-xs text-white/60">
        Pick the substitute industry
      </label>
      <select
        value={pick}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full rounded-md border border-gold/20 bg-ink-900 px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-gold/40"
      >
        <option value="">{VALUE_SYSTEM_COPY.placeholder}</option>
        {filteredIndustries.map((e) => (
          <option key={e.name} value={e.name}>
            {e.name} ({peerCountLabel(e.companies) ?? NOT_REPORTED})
          </option>
        ))}
      </select>

      {/* Comparison tiles */}
      {loading && (
        <p className="text-xs text-white/40 italic">{SECTION_STATUS.substitutesLoading}</p>
      )}

      {pick && subStructure && !loading && (
        <div className="space-y-2">
          <p className="text-xs text-white/50 font-medium">
            {industry} compared with {pick}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {/* Five-year revenue growth from the value-system endpoint. */}
            <ComparisonTile
              label="Revenue growth over five years"
              focalName={industry}
              focalValue={growthCell(focalVs?.focal.revenueCagr5y)}
              otherName={pick}
              otherValue={growthCell(subVs?.focal.revenueCagr5y)}
            />
            {/* Median operating margin from the value-system endpoint. */}
            <ComparisonTile
              label="Median operating margin"
              focalName={industry}
              focalValue={marginCell(focalVs?.focal.medianOperatingMargin)}
              otherName={pick}
              otherValue={marginCell(subVs?.focal.medianOperatingMargin)}
            />
          </div>

          {/* Gross margin over ten years from evolution */}
          {hasGrossMarginHistory && (
            <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
              <p className="text-xs text-white/60 mb-1">
                Gross margin spread between companies, {industry}, year by year
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.65rem] font-mono text-white/50">
                {focalGrossMarginSeries.map((yv) => (
                  <span key={yv.year}>
                    {yv.year}: {pctFromFraction(yv.value, 1)} pp
                  </span>
                ))}
              </div>
            </div>
          )}
          {!hasGrossMarginHistory && (
            <p className="text-[0.65rem] text-white/30 italic">
              Fewer than five years of gross margin spread data available for {industry}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
