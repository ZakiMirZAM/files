// Part 2 of the industry page: structural analysis sections extracted from
// IndustryDetail.tsx to keep that file under the 800-line limit.
// Mounts KeyPlayersPanel, FiveForcesSection, BarrierGrid, StrategicGroupMap,
// ShareReturnCurve, ValueSystemSection, EvolutionDashboard, and EnvironmentDecks.

import { useMemo } from "react";
import type { SectionKey } from "../../lib/types";
import type { IndustryStructure } from "../../lib/industryStructureApi";
import type { EndpointResult, GroupMapData, ValueSystemData } from "../../lib/groupMapApi";
import { WHAT } from "../../lib/groupMapApi";
import {
  GROUP_MAP_COPY,
  buildEnvironmentDecks,
  buildEvolutionDeck,
  buildGroupMapDeck,
  buildShareReturnDeck,
  buildValueSystemDeck,
} from "../../lib/industryDecksB";
import { PanelLoadError } from "../DataStatusBanner";
import { PanelSkeleton } from "../Skeletons";
import { KeyPlayersPanel } from "./KeyPlayersPanel";
import { FiveForcesSection } from "./FiveForcesSection";
import { BarrierGrid } from "./BarrierGrid";
import { StrategicGroupMap } from "./StrategicGroupMap";
import { ShareReturnCurve } from "./ShareReturnCurve";
import { ValueSystemSection } from "./ValueSystemSection";
import { EvolutionDashboard } from "./EvolutionDashboard";
import { EnvironmentDecks } from "./EnvironmentDecks";
import { QualitativeBlock } from "../QualitativeBlock";

interface IndustryStructureSectionsProps {
  industry: string;
  section: SectionKey;
  /** The page's AI context string. The page builds it once for the whole
   *  industry stage; this component used to rebuild the same string from a
   *  `data` prop it needed for nothing else. */
  pageContext?: string;
  structureData: IndustryStructure;
  /** The whole hook result, so a failed or rate-limited load renders a retry
   *  instead of the section quietly disappearing. */
  groupMap: EndpointResult<GroupMapData>;
  valueSystem: EndpointResult<ValueSystemData>;
  /** The company the reader arrived from, highlighted on the group map. */
  highlightTicker?: string;
  onAxisChange: (x: string, y: string) => void;
  onSupplierChange: (supplier: string) => void;
  onBuyerChange: (buyer: string) => void;
  selectedSupplier: string;
  selectedBuyer: string;
}

/**
 * Structural analysis sections for the industry page (Part 2).
 * Renders only in industry mode, never comparative.
 *
 * The five question decks are built here rather than in the page, because this
 * is the only thing that reads them and the page was computing them in
 * comparative mode too, where they are thrown away.
 */
export function IndustryStructureSections({
  industry,
  section,
  pageContext,
  structureData,
  groupMap,
  valueSystem,
  highlightTicker,
  onAxisChange,
  onSupplierChange,
  onBuyerChange,
  selectedSupplier,
  selectedBuyer,
}: IndustryStructureSectionsProps) {
  const dataContext = pageContext ?? "";
  const groupMapData = groupMap.data;
  const valueSystemData = valueSystem.data;

  const groupMapDeck = useMemo(
    () =>
      groupMapData
        ? buildGroupMapDeck(
            groupMapData.groups,
            industry,
            pageContext,
            groupMapData.plotted ?? groupMapData.firms.length,
            groupMapData.available,
          )
        : [],
    [groupMapData, industry, pageContext],
  );

  const shareReturnDeck = useMemo(
    () =>
      groupMapData
        ? buildShareReturnDeck(
            groupMapData.shareReturn?.fit ?? null,
            groupMapData.shareReturn?.topQuarterMedianPreTaxRoic,
            groupMapData.shareReturn?.restMedianPreTaxRoic,
            pageContext,
          )
        : [],
    [groupMapData, pageContext],
  );

  const valueSystemDeck = useMemo(
    () => buildValueSystemDeck(valueSystemData ?? null, industry, pageContext),
    [valueSystemData, industry, pageContext],
  );

  const evolutionDeck = useMemo(
    () => buildEvolutionDeck(structureData.evolution, pageContext, structureData.environmentIndicators),
    [structureData, pageContext],
  );

  const environmentDeckGroups = useMemo(
    () => buildEnvironmentDecks(structureData.environmentIndicators, pageContext),
    [structureData, pageContext],
  );

  return (
    <>
      <KeyPlayersPanel
        top10={structureData.concentration.top10}
        duplicateListingsDropped={structureData.concentration.duplicateListingsDropped}
      />

      {/* Five forces and barrier grid share the structure payload. */}
      <FiveForcesSection
        structure={structureData}
        industry={industry}
        section={section}
        dataContext={dataContext}
      />

      <BarrierGrid
        structure={structureData}
        section={section}
        scopeKey={industry}
      />

      {groupMap.state === "loading" && <PanelSkeleton label={GROUP_MAP_COPY.loading} />}

      {groupMap.state === "error" && (
        <PanelLoadError what={WHAT.groupMap} onRetry={groupMap.retry} />
      )}

      {groupMap.data && (
        <StrategicGroupMap
          data={groupMap.data}
          industry={industry}
          highlightTicker={highlightTicker}
          onAxisChange={onAxisChange}
          deck={groupMapDeck}
        />
      )}

      {groupMap.data && (
        <ShareReturnCurve
          shareReturn={groupMap.data.shareReturn}
          deck={shareReturnDeck}
          industry={industry}
        />
      )}

      {valueSystem.state === "loading" && <PanelSkeleton />}

      {valueSystem.state === "error" && (
        <PanelLoadError what={WHAT.valueSystem} onRetry={valueSystem.retry} />
      )}

      <ValueSystemSection
        data={valueSystem.data}
        industry={industry}
        focalFirmCount={structureData.concentration.firmCount}
        onSupplierChange={onSupplierChange}
        onBuyerChange={onBuyerChange}
        selectedSupplier={selectedSupplier}
        selectedBuyer={selectedBuyer}
        deck={valueSystemDeck}
      />

      <EvolutionDashboard
        evolution={structureData.evolution}
        indicators={structureData.environmentIndicators}
      />

      {/* The evolution questions sit directly under the six charts they ask about. */}
      {evolutionDeck.length > 0 && (
        <QualitativeBlock
          section="industry"
          scopeKey={industry}
          groups={evolutionDeck}
          storageSuffix="evolution"
          dataContext={dataContext}
          hideHeader
        />
      )}

      <EnvironmentDecks
        indicators={structureData.environmentIndicators}
        industry={industry}
        groups={environmentDeckGroups}
      />
    </>
  );
}
