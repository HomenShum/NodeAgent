/**
 * NodeAgent — shared type spine.
 *
 * Every subsystem (chat/context, search/synthesis, spreadsheet, notebook) and
 * the runtime that orchestrates them speak these contracts. Keeping the types
 * in one place is what lets the four surfaces compose into a single loop.
 *
 * Distilled from NodeBench AI:
 *   - liveEvent* tables            -> RoomMessage / Participant / RoomContext
 *   - search fusion + grounding    -> SearchSource / GroundingReport / Synthesis
 *   - spreadsheets + spreadsheetEvents -> SpreadsheetModel / SpreadsheetDelta
 *   - RichNotebookEditor + claims  -> NotebookDoc / ClaimBlock / Citation
 */

/* ───────────────────────── chat / context ───────────────────────── */

export type ParticipantRole = "human" | "agent";

export interface Participant {
  id: string;
  /** Display name, e.g. "Jordan (PM)". */
  name: string;
  role: ParticipantRole;
  /** Last presence heartbeat (epoch ms). Used for the 5-min TTL window. */
  lastSeenAt?: number;
}

export interface RoomMessage {
  id: string;
  authorId: string;
  authorName: string;
  role: ParticipantRole;
  text: string;
  /** Epoch ms. */
  createdAt: number;
  /** Optional document/source the message references. */
  attachmentRef?: string;
}

/** The live, cross-collaborative room the agent reads from. */
export interface RoomContext {
  roomCode: string;
  participants: Participant[];
  messages: RoomMessage[];
}

/** A single piece of context the collector decided is relevant. */
export interface ContextItem {
  kind: "message" | "document" | "answer";
  refId: string;
  text: string;
  /** 0..1 relevance to the focus query, computed (never hardcoded). */
  relevance: number;
  reason: string;
}

export interface ContextBundle {
  focus: string;
  items: ContextItem[];
  /** Active participants within the presence TTL window. */
  activeParticipants: number;
  /** True when the collector hit its MAX_ITEMS bound and dropped tail items. */
  truncated: boolean;
}

/* ───────────────────────── search / synthesis ───────────────────────── */

export type SourceKind = "RAG" | "WEB" | "SEC" | "DOC" | "NEWS";

export interface SearchSource {
  id: string;
  kind: SourceKind;
  title: string;
  snippet: string;
  url?: string;
  /** Raw retrieval score from the adapter, 0..1. */
  retrievalScore: number;
}

/** Layer 1 of the grounding pipeline: how much do we trust the retrieval set. */
export type RetrievalConfidence = "high" | "medium" | "low";

export interface RankedSource extends SearchSource {
  /** Grounding overlap with the query, 0..1 (computed deterministically). */
  grounding: number;
  /** Combined rank score used for ordering. */
  rankScore: number;
  /** Set on the single best-grounded source — "right doc for right answer". */
  winner: boolean;
  /** 1-based citation index assigned after ranking. */
  citation: number;
}

export interface Citation {
  index: number;
  sourceId: string;
  title: string;
  url?: string;
}

export interface SynthesisResult {
  query: string;
  confidence: RetrievalConfidence;
  /** Markdown-ish answer with [n] citation markers. Empty when confidence=low. */
  answer: string;
  sources: RankedSource[];
  citations: Citation[];
  /** How many of the retrieved sources cleared the grounding threshold. */
  groundedCount: number;
  /** Honest failure surface: present when synthesis declined or degraded. */
  note?: string;
}

/* ───────────────────────── spreadsheet ───────────────────────── */

export type CellAddress = string; // e.g. "B2"

export interface SpreadsheetCell {
  address: CellAddress;
  /** Numeric value (this engine models numbers; formulas resolve to numbers). */
  value: number;
  /** Optional formula in terms of other cell addresses, e.g. "cash / burn". */
  formula?: string;
  label?: string;
}

export interface SpreadsheetModel {
  id: string;
  name: string;
  /** Monotonic version; every applied delta increments it by 1. */
  version: number;
  cells: Record<CellAddress, SpreadsheetCell>;
  updatedAt: number;
}

export type DeltaOpKind = "set" | "clear" | "formula";

export interface DeltaOp {
  kind: DeltaOpKind;
  address: CellAddress;
  /** New value for "set". */
  value?: number;
  /** New formula for "formula". */
  formula?: string;
}

export interface SpreadsheetDelta {
  /** Version this delta expects to apply on top of (optimistic concurrency). */
  baseVersion: number;
  ops: DeltaOp[];
  /** Who authored it — agent or a teammate. */
  author: string;
  reason?: string;
}

export interface AppliedDelta {
  fromVersion: number;
  toVersion: number;
  /** Per-cell before/after, including recomputed dependents. */
  changes: Array<{ address: CellAddress; from: number | null; to: number }>;
  author: string;
  reason?: string;
  appliedAt: number;
}

/** Result of applying a delta against a model with optimistic concurrency. */
export type DeltaResult =
  | { ok: true; model: SpreadsheetModel; applied: AppliedDelta }
  | { ok: false; conflict: true; expected: number; actual: number }
  | { ok: false; conflict: false; error: string };

/* ───────────────────────── notebook ───────────────────────── */

export type BlockType = "heading" | "paragraph" | "claim" | "citation" | "entity";

export interface NotebookBlock {
  id: string;
  type: BlockType;
  text: string;
  /** For claim blocks: evidence citations + grounded ratio. */
  evidence?: Citation[];
  groundedRatio?: string; // e.g. "4/4"
  /** For entity blocks. */
  entity?: string;
}

export interface NotebookDoc {
  id: string;
  title: string;
  blocks: NotebookBlock[];
  updatedAt: number;
}

/* ───────────────────────── agent runtime ───────────────────────── */

export type StepName = "gather" | "search" | "model" | "memo";
export type StepStatus = "pending" | "active" | "done" | "error";

export interface AgentStep {
  name: StepName;
  status: StepStatus;
  detail: string;
  /** Wall-clock ms for the step (0 in deterministic demo runs). */
  durationMs: number;
}

export interface AgentRunResult {
  question: string;
  steps: AgentStep[];
  context: ContextBundle;
  synthesis: SynthesisResult;
  modelDelta: AppliedDelta | null;
  memo: NotebookDoc;
  /** Honest overall status — "ok" only when every step completed. */
  status: "ok" | "partial" | "error";
}

/* ───────────────────────── tools ───────────────────────── */

/**
 * The shape a durable-runtime adapter accepts through `ToolRuntime.runTool`
 * (see runtime/durableRuntime.ts). An app that embeds NodeAgent supplies its
 * own tools in this shape; this repo ships no concrete instances, because the
 * demo app invokes its four steps directly from the chat adapter.
 */
export interface NodeAgentTool<I = unknown, O = unknown> {
  name: string;
  description: string;
  /** Lightweight JSON-schema-ish description of inputs (for discovery). */
  inputSchema: Record<string, string>;
  handler: (input: I) => O | Promise<O>;
}
