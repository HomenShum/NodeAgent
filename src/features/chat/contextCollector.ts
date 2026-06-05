/**
 * Context collector — turns a noisy, cross-collaborative room into a small,
 * ranked context bundle the agent can actually reason over.
 *
 * This is the data-engineering instinct in production form: ingest many messy
 * inputs, score them against the question, keep the few that matter, and be
 * honest about what got dropped.
 *
 * Distilled from NodeBench AI `convex/events.ts` (room messages + presence TTL)
 * and the chat memory layer. Pure + deterministic.
 *
 * Reliability: BOUND (MAX_ITEMS with truncation flag), HONEST_SCORES (relevance
 * is computed from token overlap + signals, never hardcoded), DETERMINISTIC
 * (clock injected for presence).
 */

import type {
  ContextBundle,
  ContextItem,
  RoomContext,
  RoomMessage,
} from "../node-agent/types/nodeAgentTypes";

export const MAX_ITEMS = 12;
export const PRESENCE_TTL_MS = 5 * 60 * 1000; // 5 minutes, mirrors liveEventMembers

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "to", "of",
  "in", "on", "for", "with", "at", "by", "we", "our", "us", "it", "this", "that",
  "does", "do", "did", "still", "what", "which", "how", "vs", "if",
]);

export interface CollectOptions {
  maxItems?: number;
  now?: number;
  /** Presence window in ms (defaults to PRESENCE_TTL_MS). */
  presenceTtlMs?: number;
}

/** Light plural stemmer so "holds" matches "hold", "months" matches "month". */
function stem(w: string): string {
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Tokenize for overlap scoring: lowercase, alnum, de-stopworded, stemmed, de-duped. */
export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length > 1 && !STOPWORDS.has(raw)) out.add(stem(raw));
  }
  return out;
}

/** 0..1 overlap of `text` against the focus query. Deterministic. */
export function relevanceOf(focusTokens: Set<string>, text: string): number {
  if (focusTokens.size === 0) return 0;
  const t = tokenize(text);
  let hits = 0;
  for (const tok of focusTokens) if (t.has(tok)) hits++;
  return hits / focusTokens.size;
}

/**
 * Build a ranked, bounded context bundle for `focus` from a live room.
 *
 * Scoring blends:
 *   - token overlap with the question (primary),
 *   - a small bump for messages that carry a document attachment,
 *   - a small recency bump (newer messages slightly preferred on ties).
 */
export function collectContext(
  room: RoomContext,
  focus: string,
  opts: CollectOptions = {},
): ContextBundle {
  const maxItems = clampInt(opts.maxItems ?? MAX_ITEMS, 1, 100);
  const now = opts.now ?? Date.now();
  const ttl = opts.presenceTtlMs ?? PRESENCE_TTL_MS;
  const focusTokens = tokenize(focus);

  const newest = Math.max(1, ...room.messages.map((m) => m.createdAt));
  const oldest = Math.min(now, ...room.messages.map((m) => m.createdAt));
  const span = Math.max(1, newest - oldest);

  const scored: ContextItem[] = [];
  for (const m of room.messages) {
    // Don't fold the agent's own chatter back into its context.
    if (m.role === "agent") continue;
    const base = relevanceOf(focusTokens, m.text);
    const recency = (m.createdAt - oldest) / span; // 0..1
    const attachBump = m.attachmentRef ? 0.15 : 0;
    const relevance = clamp01(base * 0.85 + attachBump + recency * 0.05);
    if (relevance <= 0 && !m.attachmentRef) continue;

    scored.push({
      kind: m.attachmentRef ? "document" : "message",
      refId: m.attachmentRef ?? m.id,
      text: m.text,
      relevance: round2(relevance),
      reason: explain(base, m, focusTokens),
    });
  }

  // Stable sort: relevance desc, then newest first (deterministic).
  scored.sort((a, b) => b.relevance - a.relevance || cmpRef(b.refId, a.refId));

  const truncated = scored.length > maxItems;
  const items = scored.slice(0, maxItems);

  const activeParticipants = room.participants.filter(
    (p) => p.role === "human" && p.lastSeenAt != null && now - p.lastSeenAt <= ttl,
  ).length;

  return { focus, items, activeParticipants, truncated };
}

function explain(base: number, m: RoomMessage, focus: Set<string>): string {
  if (m.attachmentRef) return `document referenced in room (${m.attachmentRef})`;
  const overlap = [...tokenize(m.text)].filter((t) => focus.has(t));
  return overlap.length
    ? `mentions ${overlap.slice(0, 3).join(", ")}`
    : `${Math.round(base * 100)}% topical overlap`;
}

/* ── small deterministic helpers ── */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function cmpRef(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
