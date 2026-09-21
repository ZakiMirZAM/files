import { Link } from "react-router-dom";
import { SECTORS } from "../../lib/sectorRotation";
import {
  NEXT_STAGE,
  NEXT_STAGE_NOTE,
  NEXT_STAGE_LINK,
  PANEL,
} from "../../lib/connectionsCopy";

type Page = "economic" | "credit" | "sector" | "industry" | "comparative" | "company";

/** One company in the hand-on list. */
export interface CompanyLinkItem {
  ticker: string;
  /** The company's own name, when the stage has one. */
  name?: string | null;
}

/** "NVDA (NVIDIA Corporation)", or just "NVDA" when the stage knows no name of
 *  its own. Repeating the ticker in its own parentheses tells the reader
 *  nothing. */
function companyLabel(company: CompanyLinkItem): string {
  const name = company.name?.trim();
  return name && name !== company.ticker ? `${company.ticker} (${name})` : company.ticker;
}

interface NextStagePanelProps {
  page: Page;
  sectorOrder?: { sector: string; total: number }[];
  industries?: string[];
  industryOrder?: string[];
  /** The companies this stage hands on to. The industry and comparative
   *  branches both link the same list. `name` is optional: the comparative
   *  payload carries tickers only. */
  companies?: CompanyLinkItem[];
  industryName?: string;
  /** Carried into the Final Review link so the review opens on this company. */
  ticker?: string;
}

// Build headings from the canonical NEXT_STAGE in connectionsCopy.ts.
// "credit" reuses "economic" since both lead to the sector list.
const HEADINGS: Record<Page, string> = {
  economic: NEXT_STAGE.economic,
  credit: NEXT_STAGE.economic,
  sector: NEXT_STAGE.sector,
  industry: NEXT_STAGE.industry,
  comparative: NEXT_STAGE.comparative,
  company: NEXT_STAGE.company,
};

const NO_ROTATION_NOTE = NEXT_STAGE_NOTE.noRotation;

function LinkItem({ to, label }: { to: string; label: string }) {
  return (
    <li>
      <Link
        to={to}
        className="text-gold hover:underline text-sm"
      >
        {label}
      </Link>
    </li>
  );
}

function EconomicLinks({ sectorOrder }: { sectorOrder?: { sector: string; total: number }[] }) {
  const hasOrder = sectorOrder && sectorOrder.length > 0;
  const ordered = hasOrder
    ? sectorOrder.map((s) => s.sector)
    : [...SECTORS];

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {ordered.map((sector) => (
          <LinkItem
            key={sector}
            to={`/app/sector/${encodeURIComponent(sector)}`}
            label={sector}
          />
        ))}
      </ul>
      {!hasOrder && (
        <p className="text-white/40 text-xs">{NO_ROTATION_NOTE}</p>
      )}
    </div>
  );
}

function SectorLinks({
  industries,
  industryOrder,
}: {
  industries?: string[];
  industryOrder?: string[];
}) {
  const list = industryOrder && industryOrder.length > 0
    ? industryOrder
    : industries ?? [];

  if (list.length === 0) {
    return <p className="text-white/40 text-sm">{NEXT_STAGE_NOTE.noIndustries}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {list.map((ind) => (
        <LinkItem
          key={ind}
          to={`/app/industry/${encodeURIComponent(ind)}`}
          label={ind}
        />
      ))}
    </ul>
  );
}

function IndustryLinks({
  companies,
  industryName,
}: {
  companies?: CompanyLinkItem[];
  industryName?: string;
}) {
  const top10 = (companies ?? []).slice(0, 10);

  return (
    <div className="space-y-2">
      {top10.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {top10.map((co) => (
            <LinkItem
              key={co.ticker}
              to={`/app/individual/${encodeURIComponent(co.ticker)}`}
              label={companyLabel(co)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-white/40 text-sm">{NEXT_STAGE_NOTE.noCompanies}</p>
      )}
      {industryName && (
        <p className="text-sm">
          <Link
            to={`/app/comparative/${encodeURIComponent(industryName)}`}
            className="text-gold hover:underline"
          >
            {NEXT_STAGE_LINK.compareAll(industryName)}
          </Link>
        </p>
      )}
    </div>
  );
}

function ComparativeLinks({
  companies,
}: {
  companies?: CompanyLinkItem[];
}) {
  if (!companies || companies.length === 0) {
    return <p className="text-white/40 text-sm">{NEXT_STAGE_NOTE.noCompanies}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {companies.map((co) => (
        <LinkItem
          key={co.ticker}
          to={`/app/individual/${encodeURIComponent(co.ticker)}`}
          label={companyLabel(co)}
        />
      ))}
    </ul>
  );
}

function CompanyLink({ ticker }: { ticker?: string }) {
  // Carrying the ticker means the Final Review opens already reviewing this
  // company instead of asking the reader to type it again.
  const to = ticker
    ? `/app/report?ticker=${encodeURIComponent(ticker)}`
    : "/app/report";
  return (
    <p className="text-sm">
      <Link to={to} className="text-gold hover:underline">
        {NEXT_STAGE_LINK.finalReview}
      </Link>
    </p>
  );
}

export function NextStagePanel({
  page,
  sectorOrder,
  industries,
  industryOrder,
  companies,
  industryName,
  ticker,
}: NextStagePanelProps) {
  return (
    <section className="panel p-5 space-y-3">
      <div className="border-b border-gold/15 pb-3">
        <p className="eyebrow">{PANEL.eyebrow}</p>
        <h3 className="font-display text-sm font-semibold text-white mt-0.5">
          {HEADINGS[page]}
        </h3>
      </div>

      {/* Credit leads to the sector list too, so both take the same branch. */}
      {(page === "economic" || page === "credit") && (
        <EconomicLinks sectorOrder={sectorOrder} />
      )}
      {page === "sector" && (
        <SectorLinks industries={industries} industryOrder={industryOrder} />
      )}
      {page === "industry" && (
        <IndustryLinks companies={companies} industryName={industryName} />
      )}
      {page === "comparative" && <ComparativeLinks companies={companies} />}
      {page === "company" && <CompanyLink ticker={ticker} />}
    </section>
  );
}
