// Curated catalog of index funds / ETFs for the stock simulator. Every ticker
// here was verified against yfinance (live price + traded within the last week)
// on 2026-06-30, so none are delisted or unmanaged. Re-verify with
// scripts in scratchpad/verify_funds.py if refreshing. Prices are pulled live
// at trade time, not stored here.

export type FundCategory =
  "index_us" | "lev_index" | "intl" | "lev_intl" | "sector" | "lev_sector" | "bond" | "lev_bond" | "commodity" | "lev_commodity" | "currency" | "factor";

/** "" = unleveraged. A leading "-" marks an inverse (bear) fund. */
export type FundLeverage = "" | "2x" | "3x" | "-2x" | "-3x";

export interface Fund {
  ticker: string;
  name: string;
  category: FundCategory;
  leverage: FundLeverage;
}

export interface FundGroup {
  category: FundCategory;
  label: string;
  blurb: string;
  funds: Fund[];
}

export const FUND_GROUPS: FundGroup[] = [
  {
    category: "index_us",
    label: "US stock indices",
    blurb: "Broad-market and index funds: the low-cost core most of these lessons argue for.",
    funds: [
      { ticker: "VOO", name: "Vanguard S&P 500", category: "index_us", leverage: "" },
      { ticker: "SPY", name: "SPDR S&P 500", category: "index_us", leverage: "" },
      { ticker: "IVV", name: "iShares Core S&P 500", category: "index_us", leverage: "" },
      { ticker: "VTI", name: "Vanguard Total US Market", category: "index_us", leverage: "" },
      { ticker: "ITOT", name: "iShares Core S&P Total US Market", category: "index_us", leverage: "" },
      { ticker: "QQQ", name: "Invesco Nasdaq-100", category: "index_us", leverage: "" },
      { ticker: "QQQM", name: "Invesco Nasdaq-100 (low fee)", category: "index_us", leverage: "" },
      { ticker: "DIA", name: "SPDR Dow Jones Industrial Average", category: "index_us", leverage: "" },
      { ticker: "IWM", name: "iShares Russell 2000 (small cap)", category: "index_us", leverage: "" },
      { ticker: "VTV", name: "Vanguard Value", category: "index_us", leverage: "" },
      { ticker: "VUG", name: "Vanguard Growth", category: "index_us", leverage: "" },
      { ticker: "VO", name: "Vanguard Mid-Cap", category: "index_us", leverage: "" },
      { ticker: "VB", name: "Vanguard Small-Cap", category: "index_us", leverage: "" },
    ],
  },
  {
    category: "lev_index",
    label: "Leveraged index (daily)",
    blurb: "Daily 2x/3x and inverse (-) funds on the major indices. Built for single-day moves, not buy-and-hold. Read Lesson 3 on decay.",
    funds: [
      { ticker: "UPRO", name: "ProShares UltraPro S&P 500", category: "lev_index", leverage: "3x" },
      { ticker: "SPXL", name: "Direxion Daily S&P 500 Bull", category: "lev_index", leverage: "3x" },
      { ticker: "SSO", name: "ProShares Ultra S&P 500", category: "lev_index", leverage: "2x" },
      { ticker: "SPXS", name: "Direxion Daily S&P 500 Bear", category: "lev_index", leverage: "-3x" },
      { ticker: "SDS", name: "ProShares UltraShort S&P 500", category: "lev_index", leverage: "-2x" },
      { ticker: "TQQQ", name: "ProShares UltraPro QQQ", category: "lev_index", leverage: "3x" },
      { ticker: "QLD", name: "ProShares Ultra QQQ", category: "lev_index", leverage: "2x" },
      { ticker: "SQQQ", name: "ProShares UltraPro Short QQQ", category: "lev_index", leverage: "-3x" },
      { ticker: "UDOW", name: "ProShares UltraPro Dow30", category: "lev_index", leverage: "3x" },
      { ticker: "SDOW", name: "ProShares UltraPro Short Dow30", category: "lev_index", leverage: "-3x" },
      { ticker: "TNA", name: "Direxion Daily Small Cap Bull", category: "lev_index", leverage: "3x" },
      { ticker: "TZA", name: "Direxion Daily Small Cap Bear", category: "lev_index", leverage: "-3x" },
    ],
  },
  {
    category: "intl",
    label: "International & emerging",
    blurb: "Developed, emerging, and single-country funds for global diversification (Lesson 4).",
    funds: [
      { ticker: "VXUS", name: "Vanguard Total International", category: "intl", leverage: "" },
      { ticker: "VEA", name: "Vanguard Developed Markets", category: "intl", leverage: "" },
      { ticker: "EFA", name: "iShares MSCI EAFE (developed)", category: "intl", leverage: "" },
      { ticker: "IEFA", name: "iShares Core MSCI EAFE", category: "intl", leverage: "" },
      { ticker: "VWO", name: "Vanguard Emerging Markets", category: "intl", leverage: "" },
      { ticker: "EEM", name: "iShares MSCI Emerging Markets", category: "intl", leverage: "" },
      { ticker: "IEMG", name: "iShares Core MSCI Emerging Markets", category: "intl", leverage: "" },
      { ticker: "ACWI", name: "iShares MSCI All Country World", category: "intl", leverage: "" },
      { ticker: "VT", name: "Vanguard Total World Stock", category: "intl", leverage: "" },
      { ticker: "EWJ", name: "iShares MSCI Japan", category: "intl", leverage: "" },
      { ticker: "EWT", name: "iShares MSCI Taiwan", category: "intl", leverage: "" },
      { ticker: "EWY", name: "iShares MSCI South Korea", category: "intl", leverage: "" },
      { ticker: "MCHI", name: "iShares MSCI China", category: "intl", leverage: "" },
      { ticker: "FXI", name: "iShares China Large-Cap", category: "intl", leverage: "" },
      { ticker: "INDA", name: "iShares MSCI India", category: "intl", leverage: "" },
      { ticker: "EWZ", name: "iShares MSCI Brazil", category: "intl", leverage: "" },
      { ticker: "EWG", name: "iShares MSCI Germany", category: "intl", leverage: "" },
      { ticker: "EWU", name: "iShares MSCI United Kingdom", category: "intl", leverage: "" },
    ],
  },
  {
    category: "lev_intl",
    label: "Leveraged international (daily)",
    blurb: "Daily 2x/3x and inverse country and region funds. High decay, single-day design.",
    funds: [
      { ticker: "EDC", name: "Direxion Daily Emerging Markets Bull", category: "lev_intl", leverage: "3x" },
      { ticker: "EDZ", name: "Direxion Daily Emerging Markets Bear", category: "lev_intl", leverage: "-3x" },
      { ticker: "YINN", name: "Direxion Daily FTSE China Bull", category: "lev_intl", leverage: "3x" },
      { ticker: "YANG", name: "Direxion Daily FTSE China Bear", category: "lev_intl", leverage: "-3x" },
      { ticker: "EURL", name: "Direxion Daily FTSE Europe Bull", category: "lev_intl", leverage: "3x" },
      { ticker: "INDL", name: "Direxion Daily MSCI India Bull", category: "lev_intl", leverage: "2x" },
      { ticker: "BRZU", name: "Direxion Daily MSCI Brazil Bull", category: "lev_intl", leverage: "2x" },
      { ticker: "KORU", name: "Direxion Daily MSCI South Korea Bull", category: "lev_intl", leverage: "3x" },
      { ticker: "MEXX", name: "Direxion Daily MSCI Mexico Bull", category: "lev_intl", leverage: "3x" },
    ],
  },
  {
    category: "sector",
    label: "The 11 sectors & key industries",
    blurb: "SPDR funds covering all eleven GICS sectors, plus a few high-interest industries.",
    funds: [
      { ticker: "XLK", name: "Technology Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLF", name: "Financials Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLV", name: "Health Care Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLE", name: "Energy Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLY", name: "Consumer Discretionary Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLP", name: "Consumer Staples Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLI", name: "Industrials Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLB", name: "Materials Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLU", name: "Utilities Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLRE", name: "Real Estate Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "XLC", name: "Communication Services Select Sector SPDR", category: "sector", leverage: "" },
      { ticker: "SMH", name: "VanEck Semiconductors", category: "sector", leverage: "" },
      { ticker: "SOXX", name: "iShares Semiconductors", category: "sector", leverage: "" },
      { ticker: "XBI", name: "SPDR S&P Biotech", category: "sector", leverage: "" },
      { ticker: "KRE", name: "SPDR S&P Regional Banking", category: "sector", leverage: "" },
      { ticker: "ITA", name: "iShares US Aerospace & Defense", category: "sector", leverage: "" },
    ],
  },
  {
    category: "lev_sector",
    label: "Leveraged sectors (daily)",
    blurb: "Direxion and ProShares daily 2x/3x sector funds, bull and bear (-). Strong decay; see Lesson 3 on TECL and friends.",
    funds: [
      { ticker: "TECL", name: "Direxion Daily Technology Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "TECS", name: "Direxion Daily Technology Bear", category: "lev_sector", leverage: "-3x" },
      { ticker: "FAS", name: "Direxion Daily Financial Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "FAZ", name: "Direxion Daily Financial Bear", category: "lev_sector", leverage: "-3x" },
      { ticker: "CURE", name: "Direxion Daily Healthcare Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "ERX", name: "Direxion Daily Energy Bull", category: "lev_sector", leverage: "2x" },
      { ticker: "ERY", name: "Direxion Daily Energy Bear", category: "lev_sector", leverage: "-2x" },
      { ticker: "DRN", name: "Direxion Daily Real Estate Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "DRV", name: "Direxion Daily Real Estate Bear", category: "lev_sector", leverage: "-3x" },
      { ticker: "UTSL", name: "Direxion Daily Utilities Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "DUSL", name: "Direxion Daily Industrials Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "SOXL", name: "Direxion Daily Semiconductor Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "SOXS", name: "Direxion Daily Semiconductor Bear", category: "lev_sector", leverage: "-3x" },
      { ticker: "LABU", name: "Direxion Daily Biotech Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "LABD", name: "Direxion Daily Biotech Bear", category: "lev_sector", leverage: "-3x" },
      { ticker: "DPST", name: "Direxion Daily Regional Banks Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "DFEN", name: "Direxion Daily Aerospace & Defense Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "NAIL", name: "Direxion Daily Homebuilders Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "RETL", name: "Direxion Daily Retail Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "PILL", name: "Direxion Daily Pharmaceutical Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "WANT", name: "Direxion Daily Consumer Discretionary Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "TPOR", name: "Direxion Daily Transportation Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "WEBL", name: "Direxion Daily Dow Jones Internet Bull", category: "lev_sector", leverage: "3x" },
      { ticker: "ROM", name: "ProShares Ultra Technology", category: "lev_sector", leverage: "2x" },
      { ticker: "DIG", name: "ProShares Ultra Oil & Gas", category: "lev_sector", leverage: "2x" },
      { ticker: "UGE", name: "ProShares Ultra Consumer Staples", category: "lev_sector", leverage: "2x" },
      { ticker: "SZK", name: "ProShares UltraShort Consumer Staples", category: "lev_sector", leverage: "-2x" },
      { ticker: "UYM", name: "ProShares Ultra Materials", category: "lev_sector", leverage: "2x" },
      { ticker: "SMN", name: "ProShares UltraShort Materials", category: "lev_sector", leverage: "-2x" },
      { ticker: "LTL", name: "ProShares Ultra Telecommunications (Comm. Services)", category: "lev_sector", leverage: "2x" },
    ],
  },
  {
    category: "bond",
    label: "Bonds",
    blurb: "The other half of the stock/bond split that drives most of your long-run result (Lesson 2).",
    funds: [
      { ticker: "BND", name: "Vanguard Total Bond Market", category: "bond", leverage: "" },
      { ticker: "AGG", name: "iShares Core US Aggregate Bond", category: "bond", leverage: "" },
      { ticker: "BNDX", name: "Vanguard Total International Bond", category: "bond", leverage: "" },
      { ticker: "TLT", name: "iShares 20+ Year Treasury", category: "bond", leverage: "" },
      { ticker: "IEF", name: "iShares 7-10 Year Treasury", category: "bond", leverage: "" },
      { ticker: "SHY", name: "iShares 1-3 Year Treasury", category: "bond", leverage: "" },
      { ticker: "GOVT", name: "iShares US Treasury Bond", category: "bond", leverage: "" },
      { ticker: "TIP", name: "iShares TIPS (inflation protected)", category: "bond", leverage: "" },
      { ticker: "LQD", name: "iShares Investment Grade Corporate", category: "bond", leverage: "" },
      { ticker: "HYG", name: "iShares High Yield Corporate", category: "bond", leverage: "" },
      { ticker: "MUB", name: "iShares National Muni Bond", category: "bond", leverage: "" },
    ],
  },
  {
    category: "lev_bond",
    label: "Leveraged bonds (daily)",
    blurb: "Daily 3x long and inverse Treasury funds. Single-day design.",
    funds: [
      { ticker: "TMF", name: "Direxion Daily 20+ Year Treasury Bull", category: "lev_bond", leverage: "3x" },
      { ticker: "TMV", name: "Direxion Daily 20+ Year Treasury Bear", category: "lev_bond", leverage: "-3x" },
    ],
  },
  {
    category: "commodity",
    label: "Commodities",
    blurb: "Gold, silver, oil, gas, copper, and broad commodity baskets.",
    funds: [
      { ticker: "GLD", name: "SPDR Gold Shares", category: "commodity", leverage: "" },
      { ticker: "IAU", name: "iShares Gold Trust", category: "commodity", leverage: "" },
      { ticker: "GLDM", name: "SPDR Gold MiniShares", category: "commodity", leverage: "" },
      { ticker: "SLV", name: "iShares Silver Trust", category: "commodity", leverage: "" },
      { ticker: "PPLT", name: "abrdn Platinum", category: "commodity", leverage: "" },
      { ticker: "PALL", name: "abrdn Palladium", category: "commodity", leverage: "" },
      { ticker: "USO", name: "United States Oil Fund", category: "commodity", leverage: "" },
      { ticker: "BNO", name: "United States Brent Oil Fund", category: "commodity", leverage: "" },
      { ticker: "UNG", name: "United States Natural Gas Fund", category: "commodity", leverage: "" },
      { ticker: "DBC", name: "Invesco DB Commodity Index", category: "commodity", leverage: "" },
      { ticker: "PDBC", name: "Invesco Optimum Yield Diversified Commodity", category: "commodity", leverage: "" },
      { ticker: "GSG", name: "iShares S&P GSCI Commodity", category: "commodity", leverage: "" },
      { ticker: "DJP", name: "iPath Bloomberg Commodity", category: "commodity", leverage: "" },
      { ticker: "DBA", name: "Invesco DB Agriculture", category: "commodity", leverage: "" },
      { ticker: "CPER", name: "United States Copper Index", category: "commodity", leverage: "" },
      { ticker: "DBB", name: "Invesco DB Base Metals", category: "commodity", leverage: "" },
    ],
  },
  {
    category: "lev_commodity",
    label: "Leveraged commodities (daily)",
    blurb: "Daily 2x and inverse commodity and miner funds. High decay.",
    funds: [
      { ticker: "UCO", name: "ProShares Ultra Bloomberg Crude Oil", category: "lev_commodity", leverage: "2x" },
      { ticker: "SCO", name: "ProShares UltraShort Bloomberg Crude Oil", category: "lev_commodity", leverage: "-2x" },
      { ticker: "BOIL", name: "ProShares Ultra Bloomberg Natural Gas", category: "lev_commodity", leverage: "2x" },
      { ticker: "KOLD", name: "ProShares UltraShort Bloomberg Natural Gas", category: "lev_commodity", leverage: "-2x" },
      { ticker: "UGL", name: "ProShares Ultra Gold", category: "lev_commodity", leverage: "2x" },
      { ticker: "AGQ", name: "ProShares Ultra Silver", category: "lev_commodity", leverage: "2x" },
      { ticker: "NUGT", name: "Direxion Daily Gold Miners Bull", category: "lev_commodity", leverage: "2x" },
      { ticker: "DUST", name: "Direxion Daily Gold Miners Bear", category: "lev_commodity", leverage: "-2x" },
      { ticker: "JNUG", name: "Direxion Daily Junior Gold Miners Bull", category: "lev_commodity", leverage: "2x" },
      { ticker: "GUSH", name: "Direxion Daily S&P Oil & Gas Bull", category: "lev_commodity", leverage: "2x" },
      { ticker: "DRIP", name: "Direxion Daily S&P Oil & Gas Bear", category: "lev_commodity", leverage: "-2x" },
    ],
  },
  {
    category: "currency",
    label: "Currencies",
    blurb: "Single-currency and US-dollar funds, including inverse (-) pairs (Lesson 4 on currency risk).",
    funds: [
      { ticker: "UUP", name: "Invesco DB US Dollar Bullish", category: "currency", leverage: "" },
      { ticker: "UDN", name: "Invesco DB US Dollar Bearish", category: "currency", leverage: "" },
      { ticker: "USDU", name: "WisdomTree Bloomberg US Dollar Bullish", category: "currency", leverage: "" },
      { ticker: "FXE", name: "Invesco CurrencyShares Euro", category: "currency", leverage: "" },
      { ticker: "FXY", name: "Invesco CurrencyShares Japanese Yen", category: "currency", leverage: "" },
      { ticker: "FXB", name: "Invesco CurrencyShares British Pound", category: "currency", leverage: "" },
      { ticker: "FXF", name: "Invesco CurrencyShares Swiss Franc", category: "currency", leverage: "" },
      { ticker: "FXC", name: "Invesco CurrencyShares Canadian Dollar", category: "currency", leverage: "" },
      { ticker: "FXA", name: "Invesco CurrencyShares Australian Dollar", category: "currency", leverage: "" },
      { ticker: "EUO", name: "ProShares UltraShort Euro", category: "currency", leverage: "-2x" },
      { ticker: "YCS", name: "ProShares UltraShort Yen", category: "currency", leverage: "-2x" },
    ],
  },
  {
    category: "factor",
    label: "Factor & dividend",
    blurb: "Smart-beta tilts: momentum, quality, value, low-volatility, and dividends. Lesson 3 on why tilts are paid risk, not free return.",
    funds: [
      { ticker: "MTUM", name: "iShares MSCI USA Momentum Factor", category: "factor", leverage: "" },
      { ticker: "QUAL", name: "iShares MSCI USA Quality Factor", category: "factor", leverage: "" },
      { ticker: "VLUE", name: "iShares MSCI USA Value Factor", category: "factor", leverage: "" },
      { ticker: "USMV", name: "iShares MSCI USA Min Volatility", category: "factor", leverage: "" },
      { ticker: "SCHD", name: "Schwab US Dividend Equity", category: "factor", leverage: "" },
      { ticker: "VYM", name: "Vanguard High Dividend Yield", category: "factor", leverage: "" },
      { ticker: "VIG", name: "Vanguard Dividend Appreciation", category: "factor", leverage: "" },
      { ticker: "NOBL", name: "ProShares S&P 500 Dividend Aristocrats", category: "factor", leverage: "" },
    ],
  },
];

/** Flat list of every catalog fund. */
export const ALL_FUNDS: Fund[] = FUND_GROUPS.flatMap((g) => g.funds);

/** Quick membership test + lookup for catalog tickers. */
const FUND_BY_TICKER = new Map(ALL_FUNDS.map((f) => [f.ticker, f] as const));
export function fundByTicker(ticker: string): Fund | undefined {
  return FUND_BY_TICKER.get(ticker.toUpperCase());
}
