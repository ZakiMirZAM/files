// Adjacent-industry tiles for buyer and supplier force cards.
// Reads the saved pick (ind.chain.buyer / ind.chain.supplier) written by the
// Value System pickers, loads the value-system endpoint for it, and shows the
// structural comparison tiles. When no pick exists, directs the reader to the
// Value System section.

import type { SectionKey } from "../../../lib/types";
import type { ValueSystemIndustry } from "../../../lib/groupMapApi";
import { useValueSystem } from "../../../lib/groupMapApi";
import {
  NOT_REPORTED,
  growthCell,
  hhiCell,
  marginCell,
  days as fmtDays,
} from "../../../lib/industryStructureFormat";
import {
  BUYER_PICK_ID,
  SECTION_STATUS,
  SUPPLIER_PICK_ID,
  peerCountLabel,
} from "../../../lib/industryForcesCopy";
import { useSavedAnswer } from "../../../lib/useSavedAnswer";
import { ComparisonTile } from "./ComparisonTile";

interface AdjacentIndustryTilesProps {
  /** Which force card this is embedded in: "buyers" or "suppliers". */
  side: "buyers" | "suppliers";
  /** The focal industry name. */
  industry: string;
  section: SectionKey;
  scopeKey: string;
}

export function AdjacentIndustryTiles({
  side,
  industry,
  section,
  scopeKey,
}: AdjacentIndustryTilesProps) {
  const isSupplierSide = side === "suppliers";
  const partnerName = useSavedAnswer(
    section,
    scopeKey,
    isSupplierSide ? SUPPLIER_PICK_ID : BUYER_PICK_ID,
  );

  const { data: vsData, state } = useValueSystem(
    partnerName ? industry : undefined,
    isSupplierSide ? partnerName : undefined,
    isSupplierSide ? undefined : partnerName,
  );

  // No pick yet: show a direction note.
  if (!partnerName) {
    return (
      <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
        <p className="text-xs text-white/40 leading-relaxed">
          No {isSupplierSide ? "supplier" : "buyer"} industry selected yet.
          Pick one in the Value System section below, and the comparison will
          appear here.
        </p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <p className="text-xs text-white/40 italic">{SECTION_STATUS.partnerLoading}</p>
    );
  }

  if (!vsData) return null;

  const focal = vsData.focal;
  const partner: ValueSystemIndustry | null = isSupplierSide
    ? vsData.supplier
    : vsData.buyer;

  if (!partner) return null;

  const pair = (label: string, focalValue: string, otherValue: string) => (
    <ComparisonTile
      key={label}
      label={label}
      focalName={industry}
      focalValue={focalValue}
      otherName={partner.industry}
      otherValue={otherValue}
    />
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-white/50 font-medium">
        {industry} compared with {partner.industry}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {pair(
          "Companies behind these figures",
          peerCountLabel(focal.firmCount) ?? NOT_REPORTED,
          peerCountLabel(partner.firmCount) ?? NOT_REPORTED,
        )}
        {pair(
          "Herfindahl-Hirschman Index (HHI)",
          hhiCell(focal.hhi),
          hhiCell(partner.hhi),
        )}
        {pair(
          "Herfindahl-Hirschman Index five years ago",
          hhiCell(focal.hhiFiveYearsAgo),
          hhiCell(partner.hhiFiveYearsAgo),
        )}
        {pair(
          "Median operating margin",
          marginCell(focal.medianOperatingMargin),
          marginCell(partner.medianOperatingMargin),
        )}
        {pair(
          "Revenue growth over five years",
          growthCell(focal.revenueCagr5y),
          growthCell(partner.revenueCagr5y),
        )}
      </div>

      {/* Days payable / receivable for the focal industry */}
      {focal.daysPayableByYear && focal.daysPayableByYear.length > 0 && (
        <DaysSeries
          label="Days payable (this industry)"
          series={focal.daysPayableByYear}
        />
      )}
      {focal.daysReceivableByYear && focal.daysReceivableByYear.length > 0 && (
        <DaysSeries
          label="Days receivable (this industry)"
          series={focal.daysReceivableByYear}
        />
      )}
    </div>
  );
}

function DaysSeries({
  label,
  series,
}: {
  label: string;
  series: Array<{ year: number; value: number }>;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-xs text-white/60 mb-1">{label}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.65rem] font-mono text-white/50">
        {series.map((yv) => (
          <span key={yv.year}>
            {yv.year}: {fmtDays(yv.value)} days
          </span>
        ))}
      </div>
    </div>
  );
}
