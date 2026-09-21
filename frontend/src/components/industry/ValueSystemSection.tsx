import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { ValueSystemData } from "../../lib/groupMapApi";
import type { IndustryEntry, RuntimeGroup } from "../../lib/types";
import { useIndustries } from "../../lib/groupMapApi";
import { NOT_REPORTED, growthCell, marginCell } from "../../lib/industryStructureFormat";
import { BUYER_PICK_ID, SUPPLIER_PICK_ID, peerCountLabel } from "../../lib/industryForcesCopy";
import { VALUE_SYSTEM_COPY, valueSystemIntro } from "../../lib/industryDecksB";
import { MetricTerm } from "../individual/DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";
import { cn } from "../../lib/cn";
import { Link2, Loader2 } from "lucide-react";

interface ValueSystemSectionProps {
  data: ValueSystemData | null;
  industry: string;
  /** Company count from the structure endpoint's concentration.firmCount. */
  focalFirmCount?: number | null;
  onSupplierChange: (supplier: string) => void;
  onBuyerChange: (buyer: string) => void;
  selectedSupplier: string;
  selectedBuyer: string;
  deck: RuntimeGroup[];
}

const points = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? NOT_REPORTED : `${Math.round(v).toLocaleString("en-US")} pts`;

/** "Semiconductors (18 companies)" so a one-company entry is visible here. */
function optionLabel(entry: IndustryEntry): string {
  return `${entry.name} (${peerCountLabel(entry.companies) ?? NOT_REPORTED})`;
}

function IndustryPicker({
  label,
  options,
  value,
  onChange,
  excludeName,
}: {
  label: string;
  options: IndustryEntry[];
  value: string;
  onChange: (v: string) => void;
  excludeName: string;
}) {
  const filtered = options.filter((o) => o.name !== excludeName);
  return (
    <label className="flex-1 min-w-[220px] space-y-1.5">
      <span className="text-[0.7rem] uppercase tracking-wider text-white/45">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-sm border border-gold/20 bg-[#10131f] px-3 py-2 text-sm text-white/85",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-gold",
        )}
      >
        <option value="">Select an industry…</option>
        {filtered.map((o) => (
          <option key={o.name} value={o.name}>
            {optionLabel(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Value-system days-outstanding chart, keyed off DaysYearValue.year. */
function DaysChart({ data }: { data: ValueSystemData["focal"] }) {
  const dpArr = data.daysPayableByYear ?? [];
  const drArr = data.daysReceivableByYear ?? [];
  const years = [...new Set([...dpArr, ...drArr].map((p) => p.year))].sort(
    (a, b) => a - b,
  );
  const rows = years.map((year) => ({
    year,
    daysPayable: dpArr.find((p) => p.year === year)?.value ?? null,
    daysReceivable: drArr.find((p) => p.year === year)?.value ?? null,
  }));
  if (rows.length === 0) return null;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="year"
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
            width={40}
            tickFormatter={(v: number) => `${v}d`}
          />
          <Tooltip
            contentStyle={{ background: "#10131f", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 6, fontSize: 12 }}
            formatter={(v) => [`${Number(v).toFixed(1)} days`, ""]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }} />
          <Line type="monotone" dataKey="daysPayable" name="Days payable" stroke="#c9a84c" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="daysReceivable" name="Days receivable" stroke="#8fa8c9" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChainRow({
  label,
  metric,
  supplier,
  focal,
  buyer,
}: {
  label: string;
  metric: string;
  supplier: string;
  focal: string;
  buyer: string;
}) {
  return (
    <tr className="border-t border-gold/10">
      <th scope="row" className="text-left py-2 pr-3 font-normal text-white/60">
        <MetricTerm metric={metric} asSpan>
          {label}
        </MetricTerm>
      </th>
      <td className="py-2 px-3 text-right font-mono text-white/80">{supplier}</td>
      <td className="py-2 px-3 text-right font-mono text-gold">{focal}</td>
      <td className="py-2 px-3 text-right font-mono text-white/80">{buyer}</td>
    </tr>
  );
}

/**
 * The value system a value chain sits inside (Porter Ch.2): this industry
 * between whichever supplier feeds it and whichever buyer takes its output.
 * The user picks both sides; the three-column table and the working-capital
 * chart only appear once both picks resolve to data.
 */
export function ValueSystemSection({
  data,
  industry,
  focalFirmCount,
  onSupplierChange,
  onBuyerChange,
  selectedSupplier,
  selectedBuyer,
  deck,
}: ValueSystemSectionProps) {
  const { data: options } = useIndustries();

  // The two picks are saved as ind.chain.supplier and ind.chain.buyer so the
  // buyer and supplier force cards, and the company page's connect deck, can
  // read them. Ids are exact; nothing else writes them.
  const savedAnswers = useQuery(api.qualitative.getAnswersForScope, {
    section: "industry",
    scopeKey: industry,
  });
  const saveAnswer = useMutation(api.qualitative.saveAnswer);
  const restoredFor = useRef<string | null>(null);

  const savePick = useCallback(
    (questionId: string, value: string) => {
      void Promise.resolve(
        saveAnswer({ section: "industry", scopeKey: industry, questionId, answer: value }),
      ).catch(() => {
        // Unauthenticated or offline: the pick still drives this page's fetch.
      });
    },
    [saveAnswer, industry],
  );

  const handleSupplier = useCallback(
    (value: string) => {
      onSupplierChange(value);
      savePick(SUPPLIER_PICK_ID, value);
    },
    [onSupplierChange, savePick],
  );

  const handleBuyer = useCallback(
    (value: string) => {
      onBuyerChange(value);
      savePick(BUYER_PICK_ID, value);
    },
    [onBuyerChange, savePick],
  );

  // Restore the saved picks once per industry, and only into empty pickers.
  useEffect(() => {
    if (!savedAnswers || restoredFor.current === industry) return;
    restoredFor.current = industry;
    const find = (id: string) => savedAnswers.find((a) => a.questionId === id)?.answer ?? "";
    const savedSupplier = find(SUPPLIER_PICK_ID);
    const savedBuyer = find(BUYER_PICK_ID);
    if (savedSupplier && !selectedSupplier) onSupplierChange(savedSupplier);
    if (savedBuyer && !selectedBuyer) onBuyerChange(savedBuyer);
    // The picks are restored once; later edits come from the pickers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAnswers, industry]);

  const focal = data?.focal;
  const supplier = data?.supplier ?? null;
  const buyer = data?.buyer ?? null;
  const bothPicked = Boolean(selectedSupplier && selectedBuyer);

  /** Look up company count from the loaded industries list. */
  const countFor = (name: string | undefined): number | null => {
    if (!name || !options) return null;
    const entry = options.find((o) => o.name === name);
    return entry?.companies ?? null;
  };

  /** "1 company" / "18 companies", preferring the payload's own count. */
  const labelFor = (
    side: typeof focal,
    fallbackName?: string,
    fallbackCount?: number | null,
  ): string | null =>
    peerCountLabel(side?.firmCount ?? fallbackCount ?? countFor(fallbackName));

  const focalCount = labelFor(focal, industry, focalFirmCount);
  const supplierCount = labelFor(supplier ?? undefined, supplier?.industry);
  const buyerCount = labelFor(buyer ?? undefined, buyer?.industry);

  return (
    <section className="panel-soft p-5 space-y-5" data-tour="value-system">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-gold" />
        <p className="eyebrow">{VALUE_SYSTEM_COPY.title}</p>
      </div>
      <p className="text-sm text-white/55 max-w-3xl leading-6">{valueSystemIntro(industry)}</p>

      <div className="flex flex-wrap gap-4">
        {!options ? (
          <span className="inline-flex items-center gap-2 text-sm text-white/45">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading industries…
          </span>
        ) : (
          <>
            <IndustryPicker
              label={VALUE_SYSTEM_COPY.supplierPicker}
              options={options}
              value={selectedSupplier}
              onChange={handleSupplier}
              excludeName={industry}
            />
            <IndustryPicker
              label={VALUE_SYSTEM_COPY.buyerPicker}
              options={options}
              value={selectedBuyer}
              onChange={handleBuyer}
              excludeName={industry}
            />
          </>
        )}
      </div>

      {focal && bothPicked && (supplier || buyer) && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="text-left py-2 pr-3 text-[0.68rem] uppercase tracking-wider text-white/40">
                  Metric
                </th>
                <th scope="col" className="text-right py-2 px-3 text-[0.68rem] uppercase tracking-wider text-white/40">
                  {supplier?.industry ?? "Supplier"}
                </th>
                <th scope="col" className="text-right py-2 px-3 text-[0.68rem] uppercase tracking-wider text-gold/80">
                  {industry} ({VALUE_SYSTEM_COPY.focalTag})
                </th>
                <th scope="col" className="text-right py-2 px-3 text-[0.68rem] uppercase tracking-wider text-white/40">
                  {buyer?.industry ?? "Buyer"}
                </th>
              </tr>
            </thead>
            <tbody>
              <ChainRow
                label={VALUE_SYSTEM_COPY.rows.companies}
                metric="Number of companies"
                supplier={supplierCount ?? NOT_REPORTED}
                focal={focalCount ?? NOT_REPORTED}
                buyer={buyerCount ?? NOT_REPORTED}
              />
              <ChainRow
                label={VALUE_SYSTEM_COPY.rows.hhiNow}
                metric="HHI"
                supplier={points(supplier?.hhi)}
                focal={points(focal.hhi)}
                buyer={points(buyer?.hhi)}
              />
              <ChainRow
                label={VALUE_SYSTEM_COPY.rows.hhiThen}
                metric="HHI"
                supplier={points(supplier?.hhiFiveYearsAgo)}
                focal={points(focal.hhiFiveYearsAgo)}
                buyer={points(buyer?.hhiFiveYearsAgo)}
              />
              <ChainRow
                label={VALUE_SYSTEM_COPY.rows.margin}
                metric="Operating margin"
                supplier={marginCell(supplier?.medianOperatingMargin)}
                focal={marginCell(focal.medianOperatingMargin)}
                buyer={marginCell(buyer?.medianOperatingMargin)}
              />
              <ChainRow
                label={VALUE_SYSTEM_COPY.rows.growth}
                metric="Revenue growth"
                supplier={growthCell(supplier?.revenueCagr5y)}
                focal={growthCell(focal.revenueCagr5y)}
                buyer={growthCell(buyer?.revenueCagr5y)}
              />
            </tbody>
          </table>
        </div>
      )}

      {focal && (
        <div>
          <p className="text-[0.7rem] uppercase tracking-wider text-white/40 mb-2">
            <MetricTerm metric="Days payable" asSpan>
              Days payable
            </MetricTerm>{" "}
            /{" "}
            <MetricTerm metric="Days receivable" asSpan>
              Days receivable
            </MetricTerm>{" "}
            for {industry}
          </p>
          <DaysChart data={focal} />
        </div>
      )}

      {deck.length > 0 && (
        <div className="pt-4 border-t border-gold/10">
          <QualitativeBlock
            section="industry"
            scopeKey={industry}
            groups={deck}
            storageSuffix="valuesystem"
            hideHeader
          />
        </div>
      )}
    </section>
  );
}
