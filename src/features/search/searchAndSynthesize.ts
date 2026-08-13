/**
 * Search & synthesize — find the right document for the right answer.
 *
 * The hard part of retrieval isn't finding sources; it's refusing to fabricate
 * when the sources are weak. This module implements the 4-layer grounding
 * pipeline from NodeBench AI as pure, deterministic TypeScript:
 *
 *   Layer 1  Retrieval confidence  -> high / medium / low gate
 *   Layer 2  Grounding filter      -> overlap(query, source) per source
 *   Layer 3  Synthesis             -> extractive by default; pluggable LLM
 *   Layer 4  Citation chain        -> every claim carries [n] -> source
 *
 * Separation of concerns is the whole point: ranking + grounding are
 * deterministic; generation is the only stochastic step, and it's injectable.
 *
 * Reliability: HONEST_SCORES (grounding computed, never hardcoded), HONEST_STATUS
 * (low confidence declines instead of inventing), BOUND (MAX_SOURCES), SSRF
 * (`isSafeFetchUrl` guards the live adapter), DETERMINISTIC.
 *
 * Prior art: NodeBench `server/routes/search.ts` 4-layer pipeline; Deepchecks
 * claim-level verification; Reciprocal-Rank-Fusion ranking.
 */

import { tokenize } from "../chat/contextCollector";
import type {
  Citation,
  RankedSource,
  RetrievalConfidence,
  SearchSource,
  SynthesisResult,
} from "../node-agent/types/nodeAgentTypes";

const MAX_SOURCES = 50;
const GROUNDING_THRESHOLD = 0.34;
/** Weight split between grounding (overlap) and the adapter's retrieval score. */
const W_GROUNDING = 0.62;
const W_RETRIEVAL = 0.38;

export interface SynthesizeOptions {
  /**
   * Optional live generator (Claude/Gemini in production). Receives the ranked,
   * grounded sources and returns prose with [n] markers. When absent, a
   * deterministic extractive synthesizer is used — honest, never hallucinated.
   */
  synthesizer?: (input: {
    query: string;
    grounded: RankedSource[];
  }) => string;
  maxSources?: number;
}

/** Grounding of a source against the query: token overlap, 0..1. */
export function groundingOf(query: string, source: SearchSource): number {
  const q = tokenize(query);
  if (q.size === 0) return 0;
  const s = tokenize(`${source.title} ${source.snippet}`);
  let hits = 0;
  for (const tok of q) if (s.has(tok)) hits++;
  return round2(hits / q.size);
}

/** Rank sources by a blend of grounding and retrieval score; mark the winner. */
export function rankSources(query: string, sources: SearchSource[]): RankedSource[] {
  const ranked: RankedSource[] = sources.slice(0, MAX_SOURCES).map((s) => {
    const grounding = groundingOf(query, s);
    const rankScore = round2(
      W_GROUNDING * grounding + W_RETRIEVAL * clamp01(s.retrievalScore),
    );
    return { ...s, grounding, rankScore, winner: false, citation: 0 };
  });

  ranked.sort((a, b) => b.rankScore - a.rankScore || cmp(a.id, b.id));
  ranked.forEach((s, i) => {
    s.citation = i + 1;
    s.winner = i === 0 && s.grounding >= GROUNDING_THRESHOLD;
  });
  return ranked;
}

/** Layer 1: how confident are we in the retrieval set as a whole. */
export function retrievalConfidence(ranked: RankedSource[]): RetrievalConfidence {
  const grounded = ranked.filter((s) => s.grounding >= GROUNDING_THRESHOLD).length;
  if (grounded >= 3) return "high";
  if (grounded >= 1) return "medium";
  return "low";
}

/**
 * Full pipeline: rank -> confidence-gate -> ground-filter -> synthesize -> cite.
 * On low confidence, returns an empty answer with an honest note (no fabrication).
 */
export function searchAndSynthesize(
  query: string,
  sources: SearchSource[],
  opts: SynthesizeOptions = {},
): SynthesisResult {
  const ranked = rankSources(query, sources);
  const confidence = retrievalConfidence(ranked);
  const grounded = ranked.filter((s) => s.grounding >= GROUNDING_THRESHOLD);

  if (confidence === "low" || grounded.length === 0) {
    return {
      query,
      confidence: "low",
      answer: "",
      sources: ranked,
      citations: [],
      groundedCount: 0,
      note: "Insufficient grounded sources — declining to synthesize to avoid fabrication.",
    };
  }

  const citations: Citation[] = grounded.map((s) => ({
    index: s.citation,
    sourceId: s.id,
    title: s.title,
    url: s.url,
  }));

  const answer = (opts.synthesizer ?? extractiveSynthesizer)({
    query,
    grounded,
  });

  return {
    query,
    confidence,
    answer,
    sources: ranked,
    citations,
    groundedCount: grounded.length,
    note:
      confidence === "medium"
        ? "Limited grounding — answer is directionally supported but thin on corroboration."
        : undefined,
  };
}

/**
 * Deterministic extractive synthesizer. Pulls verbatim from the grounded
 * sources and attaches citations — synthesis without generation, so it cannot
 * hallucinate. The live path swaps in an LLM via opts.synthesizer.
 */
function extractiveSynthesizer(input: {
  query: string;
  grounded: RankedSource[];
}): string {
  const [winner, ...rest] = input.grounded;
  const lead = `Best-grounded source [${winner.citation}] (${winner.kind}): ${winner.snippet}`;
  if (rest.length === 0) return lead;
  const corrob = rest
    .slice(0, 3)
    .map((s) => `[${s.citation}] ${s.title}`)
    .join("; ");
  return `${lead} Corroborated by ${corrob}.`;
}

/* ───────────────────────── SSRF guard (live adapter) ───────────────────────── */

/**
 * Validate a URL before the live retrieval adapter fetches it. Agents generate
 * URLs from reasoning — one hallucinated `http://169.254.169.254/...` away from
 * leaking cloud metadata. http/https only; block private + link-local + metadata.
 */
export function isSafeFetchUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "::1" ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    return false;
  }
  // RFC1918 + loopback + link-local IPv4.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local / cloud metadata
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  return true;
}

/* ── helpers ── */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
