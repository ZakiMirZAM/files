// Client for the local vault RAG server (Claude Agent SDK on the Max session).
// Mirrors the fetch shape of lib/api.ts but POSTs and surfaces errors (the AI
// panel shows them) instead of silently falling back. The server is the rag/
// folder's server.py on port 3001.
import type { SectionKey } from "./types";

const AI_BASE = (import.meta.env.VITE_AI_BASE as string | undefined) ?? "http://localhost:3001";

/** One numeric claim the server could not reconcile against the page figures. */
export interface VerificationFlag {
  /** The claim exactly as it appears in the answer, e.g. "8.9%". */
  text: string;
  /** The metric the claim was bound to, e.g. "WACC". */
  label?: string;
  stated?: number;
  expected?: number;
  /** Which page figure the claim was compared against. */
  via?: string;
  line?: number;
}

/** A stated derivation whose two sides do not agree when re-evaluated. */
export interface VerificationArithmeticError {
  text: string;
  stated?: number;
  computed?: number;
}

/** A figure the calculator returned but the prose then wrote down differently. */
export interface VerificationTranscriptionError {
  label?: string;
  expression?: string;
  tool_result?: number;
  answer_said?: number;
  raw?: string;
}

/**
 * The server's reconciliation report for one answer. Counts are always present.
 * The per-claim arrays are withheld while the server runs in `shadow`, so every
 * consumer must treat them as optional.
 */
export interface VerificationReport {
  mode: string;
  status: "clean" | "flagged";
  checked: number;
  bound: number;
  matched: number;
  approx: number;
  mismatched: number;
  unsupported: number;
  numericFidelity?: number;
  arithmetic: { checked: number; errors: number };
  contradictionsInformational: number;
  elapsedMs?: number;
  // `on` mode only.
  flagged?: VerificationFlag[];
  arithmeticErrors?: VerificationArithmeticError[];
  transcriptionErrors?: VerificationTranscriptionError[];
  /** Issued in `on` mode so /verify can run the second pass on this answer. */
  token?: string;
  // Set by the client once a /verify pass has rewritten the answer, so a
  // reloaded row renders the same state it did when it was generated.
  revised?: boolean;
  revisedCount?: number;
}

export interface AiResult {
  text: string;
  sources: string[];
  /** Absent when the server has verification switched off. */
  verification?: VerificationReport;
}

/** Result of the second-pass /verify call. */
export interface VerifyResult {
  verification?: VerificationReport;
  /** Present only when the pass corrected a figure. */
  revisedAnswer?: string;
  /** How many figures the revision corrected, when the server reports it. */
  correctedCount?: number;
}

export interface AskParams {
  question: string;
  context?: string;
  section?: SectionKey;
  /** Compact summary of the page's computed figures (sent as the `data` field). */
  dataContext?: string;
}

export interface ExplainParams {
  selection: string;
  context?: string;
  /** Subject in view (company/sector) for interactive, data-aware explanations. */
  subject?: string;
  /** The subject's computed figures (sent as the `data` field). */
  dataContext?: string;
}

async function postAi(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const res = await fetch(`${AI_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      // body was not JSON
    }
    throw new Error(detail || `AI server returned ${res.status}. Is the rag server (port 3001) running?`);
  }
  // The answer routes stream through ai_proxy.py, which commits the 200 up front
  // and dribbles whitespace heartbeats while the model works, appending the real
  // JSON last. So a connection that ends early still looks like a success: status
  // 200, body empty or whitespace only. That happens on a phone whenever the
  // screen locks, the tab is backgrounded, or the network hands off mid-answer.
  // Read the body as text first and name the failure. Calling res.json() straight
  // through raises an opaque parser error instead ("The string did not match the
  // expected pattern." on WebKit, "Unexpected end of JSON input" on Chrome), which
  // tells the user nothing about what to do next.
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error(
      "The connection closed before the AI finished answering. On a phone this usually means the screen locked or the network changed while it was working. Retry to run it again.",
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      "The answer came back incomplete and could not be read. Retry to run it again.",
    );
  }
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function optNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
}

/**
 * Coerce the server's verification object into the typed report. Tolerant on
 * purpose: a malformed or partial report must never break the answer, which is
 * the actual product. Returns undefined when there is nothing usable.
 */
export function toVerificationReport(raw: unknown): VerificationReport | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== "string") return undefined;
  const arith = (typeof r.arithmetic === "object" && r.arithmetic !== null
    ? (r.arithmetic as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const report: VerificationReport = {
    mode: optStr(r.mode) ?? "unknown",
    status: r.status === "flagged" ? "flagged" : "clean",
    checked: num(r.checked),
    bound: num(r.bound),
    matched: num(r.matched),
    approx: num(r.approx),
    mismatched: num(r.mismatched),
    unsupported: num(r.unsupported),
    numericFidelity: optNum(r.numericFidelity),
    arithmetic: { checked: num(arith.checked), errors: num(arith.errors) },
    contradictionsInformational: num(r.contradictionsInformational),
    elapsedMs: optNum(r.elapsedMs),
    token: optStr(r.token),
    revised: r.revised === true,
    revisedCount: optNum(r.revisedCount),
  };

  if (Array.isArray(r.flagged)) {
    report.flagged = asArray(r.flagged).map((f) => ({
      text: optStr(f.text) ?? "",
      label: optStr(f.label),
      stated: optNum(f.stated),
      expected: optNum(f.expected),
      via: optStr(f.via),
      line: optNum(f.line),
    }));
  }
  if (Array.isArray(r.arithmeticErrors)) {
    report.arithmeticErrors = asArray(r.arithmeticErrors).map((a) => ({
      text: optStr(a.text) ?? "",
      stated: optNum(a.stated),
      computed: optNum(a.computed),
    }));
  }
  if (Array.isArray(r.transcriptionErrors)) {
    report.transcriptionErrors = asArray(r.transcriptionErrors).map((t) => ({
      label: optStr(t.label),
      expression: optStr(t.expression),
      tool_result: optNum(t.tool_result),
      answer_said: optNum(t.answer_said),
      raw: optStr(t.raw),
    }));
  }
  return report;
}

/** Parse a report previously stored as JSON (the Convex `verification` column). */
export function parseVerification(raw: string | undefined): VerificationReport | undefined {
  if (!raw) return undefined;
  try {
    return toVerificationReport(JSON.parse(raw));
  } catch {
    return undefined; // a corrupt cached report is not worth failing the answer over
  }
}

/** Answer a framework question about the subject currently in view (Prompt A, Sonnet). */
export async function askQuestion(params: AskParams): Promise<AiResult> {
  const body = {
    question: params.question,
    context: params.context,
    section: params.section,
    data: params.dataContext, // server reads the page figures from `data`
  };
  // 300s: the heartbeat proxy keeps the connection alive past Cloudflare's 100s
  // edge limit, so a long Sonnet answer (web searches, many turns) can complete.
  const data = (await postAi("/ask", body, 300_000)) as {
    answer?: string;
    sources?: string[];
    verification?: unknown;
    verifyToken?: unknown;
  };
  // A 200 with no answer is still a failure, throw so the panel's retry UI engages.
  if (!data.answer?.trim()) {
    throw new Error("The AI server returned an empty answer. Retry, or check the rag server (port 3001).");
  }
  return {
    text: data.answer,
    sources: data.sources ?? [],
    // The server issues the second-pass token at the TOP LEVEL as `verifyToken`,
    // not inside the verification object. Fold it in so the panel has one place
    // to look. Only present when verification runs in `on` mode and flagged.
    verification: withToken(toVerificationReport(data.verification), data.verifyToken),
  };
}

/** Attach the server's top-level `verifyToken` to the report, if both exist. */
function withToken(
  report: VerificationReport | undefined,
  token: unknown,
): VerificationReport | undefined {
  if (!report) return report;
  return typeof token === "string" && token ? { ...report, token } : report;
}

/** Explain a highlighted statement, using the subject's data when available (Prompt B, Haiku). */
export async function explainSelection(params: ExplainParams): Promise<AiResult> {
  const body = {
    selection: params.selection,
    context: params.context,
    subject: params.subject,
    data: params.dataContext, // server reads the subject's figures from `data`
  };
  const data = (await postAi("/explain", body, 240_000)) as {
    explanation?: string;
    sources?: string[];
    verification?: unknown;
    verifyToken?: unknown;
  };
  // A 200 with no explanation is still a failure, throw so the panel's retry UI engages.
  if (!data.explanation?.trim()) {
    throw new Error("The AI server returned an empty explanation. Retry, or check the rag server (port 3001).");
  }
  return {
    text: data.explanation,
    sources: data.sources ?? [],
    verification: withToken(toVerificationReport(data.verification), data.verifyToken),
  };
}

/**
 * Second verification pass over an answer the first pass flagged. The token is
 * issued by the server only when it runs verification in `on` mode, so there is
 * nothing to call in shadow. Short timeout relative to /ask: this is commentary
 * on an answer the user is already reading.
 */
export async function verifyAnswer(token: string, timeoutMs = 60_000): Promise<VerifyResult> {
  const data = (await postAi("/verify", { token }, timeoutMs)) as {
    verification?: unknown;
    revisedAnswer?: unknown;
    revised_answer?: unknown;
    correctedCount?: unknown;
    corrected?: unknown;
  };
  return {
    verification: toVerificationReport(data.verification) ?? toVerificationReport(data),
    revisedAnswer: optStr(data.revisedAnswer) ?? optStr(data.revised_answer),
    correctedCount: optNum(data.correctedCount) ?? optNum(data.corrected),
  };
}
