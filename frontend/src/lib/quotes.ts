/**
 * Value-investing quote library.
 *
 * Every entry is pulled verbatim from the user's Obsidian vault (the "Financial
 * Texts" RAG) and attributed to the book it was read from. This is an investment
 * valuation app, so the lines are drawn from the value-investing canon: Graham,
 * Buffett, Damodaran, Marks, Bogle, Dorsey, Carlin, Thorndike, Malkiel, and
 * Erickson. Wording (including any dashes inside a quote) is the author's own.
 */
export interface Quote {
  text: string;
  author: string;
  /** Book / work the line is drawn from in the vault. */
  source?: string;
}

export const QUOTES: Quote[] = [
  {
    text: "Confronted with a like challenge to distill the secret of sound investment into three words, we venture the motto, MARGIN OF SAFETY.",
    author: "Benjamin Graham",
    source: "The Intelligent Investor",
  },
  {
    text: "An investment operation is one which, upon thorough analysis promises safety of principal and an adequate return. Operations not meeting these requirements are speculative.",
    author: "Benjamin Graham",
    source: "The Intelligent Investor",
  },
  {
    text: "The investor's chief problem, and even his worst enemy, is likely to be himself.",
    author: "Benjamin Graham",
    source: "The Intelligent Investor",
  },
  {
    text: "He should always remember that market quotations are there for his convenience, either to be taken advantage of or to be ignored.",
    author: "Benjamin Graham",
    source: "The Intelligent Investor",
  },
  {
    text: "The stock market is a voting machine rather than a weighing machine.",
    author: "Benjamin Graham and David Dodd",
    source: "Security Analysis",
  },
  {
    text: "Mr. Market is there to serve you, not to guide you. It is his pocketbook, not his wisdom, that you will find useful.",
    author: "Warren Buffett",
    source: "The Essays of Warren Buffett",
  },
  {
    text: "We simply attempt to be fearful when others are greedy and to be greedy only when others are fearful.",
    author: "Warren Buffett",
    source: "The Essays of Warren Buffett",
  },
  {
    text: "Time is the friend of the wonderful business, the enemy of the mediocre.",
    author: "Warren Buffett",
    source: "The Essays of Warren Buffett",
  },
  {
    text: "When we own portions of outstanding businesses with outstanding managements, our favorite holding period is forever.",
    author: "Warren Buffett",
    source: "The Essays of Warren Buffett",
  },
  {
    text: "Intrinsic value can be defined simply: It is the discounted value of the cash that can be taken out of a business during its remaining life.",
    author: "Warren Buffett",
    source: "The Essays of Warren Buffett",
  },
  {
    text: "What counts for most people in investing is not how much they know, but rather how realistically they define what they don't know.",
    author: "Warren Buffett",
    source: "The Essays of Warren Buffett",
  },
  {
    text: "A postulate of sound investing is that an investor does not pay more for an asset than it's worth.",
    author: "Aswath Damodaran",
    source: "Investment Valuation",
  },
  {
    text: "The value of any firm is determined by four factors, its capacity to generate cash flows from assets in place, the expected growth rate of these cash flows, the length of time it will take for the firm to reach stable growth, and the cost of capital.",
    author: "Aswath Damodaran",
    source: "Applied Corporate Finance",
  },
  {
    text: "Investment success doesn't come from \"buying good things,\" but rather from \"buying things well.\"",
    author: "Howard Marks",
    source: "The Most Important Thing",
  },
  {
    text: "No asset is so good that it can't become a bad investment if bought at too high a price.",
    author: "Howard Marks",
    source: "The Most Important Thing",
  },
  {
    text: "The greatest source of investment risk is the belief that there is no risk.",
    author: "Howard Marks",
    source: "Mastering the Market Cycle",
  },
  {
    text: "When we're getting value cheap, we should be aggressive; when we're getting value expensive, we should pull back.",
    author: "Howard Marks",
    source: "Mastering the Market Cycle",
  },
  {
    text: "Don't look for the needle in the haystack. Just buy the haystack!",
    author: "John C. Bogle",
    source: "The Little Book of Common Sense Investing",
  },
  {
    text: "We investors as a group get precisely what we don't pay for. If we pay nothing, we get everything.",
    author: "John C. Bogle",
    source: "The Little Book of Common Sense Investing",
  },
  {
    text: "Patience and consistency are the most valuable assets for the intelligent investor.",
    author: "John C. Bogle",
    source: "The Little Book of Common Sense Investing",
  },
  {
    text: "But investing is not a science. It is a human activity that involves both emotional as well as rational behavior.",
    author: "John C. Bogle",
    source: "The Clash of the Cultures",
  },
  {
    text: "Companies with moats are more valuable than companies without moats.",
    author: "Pat Dorsey",
    source: "The Little Book That Builds Wealth",
  },
  {
    text: "A value investor defines risk as the probability of permanent capital loss.",
    author: "Sven Carlin",
    source: "Modern Value Investing",
  },
  {
    text: "We should never aim for precision in our valuation efforts, but merely for accuracy.",
    author: "Sven Carlin",
    source: "Modern Value Investing",
  },
  {
    text: "The outsider CEOs believed that the value of financial projections was determined by the quality of the assumptions, not by the number of pages in the presentation.",
    author: "William N. Thorndike",
    source: "The Outsiders",
  },
  {
    text: "A blindfolded monkey throwing darts at the stock listings could select a portfolio that would do just as well as one selected by the experts.",
    author: "Burton G. Malkiel",
    source: "A Random Walk Down Wall Street",
  },
  {
    text: "The best way to build wealth is through business ownership.",
    author: "Darrin Erickson",
    source: "Global Investing",
  },
];

/** Stable hash of a YYYY-MM-DD string → non-negative integer. */
function hashDay(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Deterministic "quote of the day", every visit on the same calendar day
 * returns the same quote, and it rotates through the whole library across days.
 */
export function getQuoteOfTheDay(date: Date = new Date()): Quote {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return QUOTES[hashDay(key) % QUOTES.length];
}
