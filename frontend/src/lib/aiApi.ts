// Client for the local vault RAG server (Claude Agent SDK on the Max session).
// Mirrors the fetch shape of lib/api.ts but POSTs and surfaces errors (the AI
// panel shows them) instead of silently falling back. The server is the rag/
// folder's server.py on port 3001.
import type { SectionKey } from "./types";

const AI_BASE = (import.meta.env.VITE_AI_BASE as string | undefined) ?? "http://localhost:3001";

export interface AiResult {
  text: string;
  sources: string[];
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
  return res.json();
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
  const data = (await postAi("/ask", body, 300_000)) as { answer?: string; sources?: string[] };
  // A 200 with no answer is still a failure, throw so the panel's retry UI engages.
  if (!data.answer?.trim()) {
    throw new Error("The AI server returned an empty answer. Retry, or check the rag server (port 3001).");
  }
  return { text: data.answer, sources: data.sources ?? [] };
}

/** Explain a highlighted statement, using the subject's data when available (Prompt B, Haiku). */
export async function explainSelection(params: ExplainParams): Promise<AiResult> {
  const body = {
    selection: params.selection,
    context: params.context,
    subject: params.subject,
    data: params.dataContext, // server reads the subject's figures from `data`
  };
  const data = (await postAi("/explain", body, 240_000)) as { explanation?: string; sources?: string[] };
  // A 200 with no explanation is still a failure, throw so the panel's retry UI engages.
  if (!data.explanation?.trim()) {
    throw new Error("The AI server returned an empty explanation. Retry, or check the rag server (port 3001).");
  }
  return { text: data.explanation, sources: data.sources ?? [] };
}
