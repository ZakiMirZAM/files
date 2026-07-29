/**
 * Capture the EXACT `dataContext` blob the browser would send, by running the
 * app's own TypeScript serializer.
 *
 * Do not reimplement `buildDataContext` in Python. It emits three different
 * numeric conventions in one blob (a raw ratio at 2dp, a percent already
 * multiplied by 100, a pp delta), and a Python copy would drift silently. Then
 * the eval would be measuring a fiction rather than the real prompt. Running the
 * real module also means a future edit that drops a field is caught the next time
 * the set is refreshed.
 *
 * Node 24 strips TypeScript types natively, and `aiDataContext.ts` imports its
 * types with `import type`, so nothing extra needs installing.
 *
 *   node rag/eval/capture_context.mjs --ticker AAPL --ticker MSFT
 *   node rag/eval/capture_context.mjs --sector Technology --economic
 *   node rag/eval/capture_context.mjs --from tickers.txt --out contexts.json
 */
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const SERIALIZER = resolve(REPO, "frontend", "src", "lib", "aiDataContext.ts");
const API = process.env.API_BASE ?? "http://localhost:8000";

const { buildDataContext, isLiveData, summarizeTrendForAI, historicalTrendQuestion } =
  await import(pathToFileURL(SERIALIZER).href);

function parseArgs(argv) {
  const out = { tickers: [], sectors: [], industries: [], economic: false, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ticker") out.tickers.push(argv[++i]);
    else if (a === "--sector") out.sectors.push(argv[++i]);
    else if (a === "--industry") out.industries.push(argv[++i]);
    else if (a === "--economic") out.economic = true;
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--from") {
      out.tickers.push(...readFileSync(argv[++i], "utf8").split(/\s+/).filter(Boolean));
    } else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

async function getJson(path) {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

/** One record per subject: the frozen prompt input plus the raw payload the
 *  oracle generators read their ground truth from. */
async function capture(section, scopeKey, path) {
  const data = await getJson(path);
  const live = isLiveData(data);
  const dataContext = buildDataContext(section, data, live);
  // Every metric carrying a trend also produces a trend question in the app, and
  // those answers are the densest in dated figures, so capture them too.
  const trends = {};
  for (const m of data.metrics ?? []) {
    if (!m?.trend || m.trend.length < 2) continue;
    const summary = summarizeTrendForAI(m);
    if (summary) trends[m.name] = { question: historicalTrendQuestion(m.name), summary };
  }
  return { section, scopeKey, isLive: live, dataContext: dataContext ?? null, trends, raw: data };
}

const args = parseArgs(process.argv);
const jobs = [
  ...args.tickers.map((t) => ["individual", t, `/api/individual/${encodeURIComponent(t)}`]),
  ...args.sectors.map((s) => ["sector", s, `/api/sector/${encodeURIComponent(s)}`]),
  ...args.industries.map((i) => ["industry", i, `/api/industry/${encodeURIComponent(i)}`]),
  ...(args.economic ? [["economic", "the US economy", "/api/economic"]] : []),
];

if (!jobs.length) {
  console.error("nothing to capture; pass --ticker / --sector / --industry / --economic");
  process.exit(2);
}

const records = [];
for (const [section, scopeKey, path] of jobs) {
  try {
    const rec = await capture(section, scopeKey, path);
    if (!rec.isLive) {
      console.error(`  SKIP ${scopeKey}: backend returned mock data`);
      continue;
    }
    if (!rec.dataContext) {
      console.error(`  SKIP ${scopeKey}: serializer produced no context`);
      continue;
    }
    records.push(rec);
    console.error(`  ok   ${section}/${scopeKey}  ${rec.dataContext.length} chars, ` +
                  `${Object.keys(rec.trends).length} trends`);
  } catch (err) {
    console.error(`  FAIL ${scopeKey}: ${err.message}`);
  }
}

const payload = JSON.stringify(records, null, 2);
if (args.out) {
  writeFileSync(args.out, payload);
  console.error(`\nwrote ${records.length} records to ${args.out}`);
} else {
  process.stdout.write(payload);
}
