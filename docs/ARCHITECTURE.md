# NodeAgent — Architecture

## Overview

NodeAgent is a **cross-collaborative agent**: a single loop that runs over four
surfaces. From inside a live, multi-participant room it (1) **gathers context**
out of the chat, (2) **searches and synthesizes** a grounded, cited answer
("the right document for the right answer"), (3) applies a **versioned model
delta** to a spreadsheet with optimistic concurrency, and (4) writes a cited
**notebook memo**. One orchestrator (`runNodeAgent`) composes four pure
modules; each module is small, testable, and deterministic by default, with the
only stochastic step (answer generation) made injectable. The same code runs
live (real Convex room + LLM keys) or as a self-contained, key-free showcase on
deterministic demo data.

The repo now also exposes a bounded frame wrapper for coding-agent adoption:
`src/features/node-agent/runtime/reasoningFrameRunner.ts`. A frame carries the
goal, context expectations, model-delta requirement, and evidence threshold; the
runner executes `runNodeAgent` and returns `FrameDelta` plus a verifier receipt.
Omnigent/Omniagent can sit outside this as the session/sandbox/policy harness,
but NodeAgent remains the owner of runtime state and verification.

The durable layer lives in
`src/features/node-agent/runtime/durableRuntime.ts`. It keeps provider concerns
behind ports: jobs, frames, leases, journal, scheduler, artifacts, tools, and
policy context. The included in-memory adapter is not a production database; it
is the deterministic reference implementation that proves the contract before a
target repo adds Convex, AWS, Postgres, SQLite, or another adapter.

## Design principles

**1. Deterministic core, injectable stochastics.** The expensive-to-trust parts
— ranking, grounding overlap, delta math, formula evaluation, citation chains —
are pure deterministic TypeScript with no `eval`, no network, and injectable
clocks. The *only* stochastic step is prose generation, and it is passed in:
`searchAndSynthesize` takes an optional `synthesizer` callback (Claude/Gemini in
production); absent that, a deterministic `extractiveSynthesizer` pulls verbatim
from grounded sources and *cannot hallucinate*. This separation is what lets the
whole loop be unit-tested and replayed byte-for-byte.

**2. Honest failure — never fabricate, never silently overwrite.** Low
retrieval confidence returns an empty answer with an explicit `note` instead of
inventing one (`src/features/search/searchAndSynthesize.ts`). Stale spreadsheet
edits surface an optimistic-concurrency *conflict* rather than clobbering newer
state (`src/features/spreadsheet/applySpreadsheetDelta.ts`). The runtime's
overall `status` is `"ok"` only when *every* step completed; otherwise `partial`
or `error`. Status reflects reality.

**3. Bounded and deterministic by discipline.** Every module follows the
`BOUND` / `HONEST_*` / `DETERMINISTIC` discipline from
`.claude/rules/agentic_reliability.md`: every in-memory collection has a `MAX_*`
cap, every score is *computed* (never hardcoded), every failure path is honest,
and every clock is injectable so output is reproducible. The module header
comments name the specific invariants each file upholds.

## The four subsystems

All four speak one shared type spine: `src/features/node-agent/types/nodeAgentTypes.ts`.
Keeping the contracts in one file is what lets the surfaces compose into a single loop.

### 1. Chat / context — `src/features/chat/contextCollector.ts`

**Purpose:** turn a noisy cross-collaborative room into a small, ranked context
bundle the agent can actually reason over.

```ts
export const MAX_ITEMS = 12;
export const PRESENCE_TTL_MS = 5 * 60 * 1000; // mirrors live room presence

export function tokenize(text: string): Set<string>;
export function relevanceOf(focusTokens: Set<string>, text: string): number; // 0..1
export function collectContext(
  room: RoomContext,
  focus: string,
  opts?: CollectOptions,                       // { maxItems?, now?, presenceTtlMs? }
): ContextBundle;
```

Scoring blends token overlap with the focus question (primary), a small bump for
messages that carry a document attachment, and a small recency bump for tie-breaks.
The agent's own messages (`role === "agent"`) are excluded so it never folds its
chatter back into its context.

**Reliability:** `BOUND` — `MAX_ITEMS` cap with a `truncated` flag on the bundle.
`HONEST_SCORES` — every `relevance` is computed from token overlap, never
hardcoded. `DETERMINISTIC` — the presence clock is injected via `opts.now`, and
the sort is stable (relevance desc, then newest-first by ref id).

### 2. Search / synthesis — `src/features/search/searchAndSynthesize.ts`

**Purpose:** find the right document for the right answer, and *refuse to
fabricate* when sources are weak. Implements a **4-layer grounding pipeline**:

1. **Retrieval confidence** (`retrievalConfidence`) → `high` / `medium` / `low`
   gate based on how many sources clear the grounding threshold.
2. **Grounding filter** (`groundingOf`) → per-source token overlap with the query.
3. **Synthesis** → deterministic `extractiveSynthesizer` by default; pluggable LLM.
4. **Citation chain** → every grounded source gets a 1-based `citation`; the
   single best-grounded source is flagged `winner`.

```ts
export const MAX_SOURCES = 50;
export const GROUNDING_THRESHOLD = 0.34;

export function groundingOf(query: string, source: SearchSource): number;        // 0..1
export function rankSources(query: string, sources: SearchSource[]): RankedSource[];
export function retrievalConfidence(ranked: RankedSource[]): RetrievalConfidence;
export function searchAndSynthesize(
  query: string,
  sources: SearchSource[],
  opts?: SynthesizeOptions,                     // { synthesizer?, maxSources? }
): SynthesisResult;
export function extractiveSynthesizer(input: { query: string; grounded: RankedSource[] }): string;
export function isSafeFetchUrl(raw: string): boolean;
```

On `low` confidence (or zero grounded sources) the result is an empty `answer`
with `note: "Insufficient grounded sources — declining to synthesize to avoid
fabrication."` Rank score is a fixed blend: `0.62 * grounding + 0.38 * retrievalScore`.

**Reliability:** `HONEST_SCORES` — grounding is computed overlap, never a floor.
`HONEST_STATUS` — low confidence declines instead of inventing. `BOUND` —
`MAX_SOURCES`. `SSRF` — `isSafeFetchUrl` guards the live adapter (http/https only;
blocks `localhost`, RFC1918, link-local `169.254.0.0/16`, and cloud-metadata
hosts). `DETERMINISTIC` — extractive path is pure; only the injected `synthesizer`
is stochastic.

### 3. Spreadsheet — `src/features/spreadsheet/applySpreadsheetDelta.ts` + `versionedSpreadsheetSync.ts`

**Purpose:** every edit is a tracked delta with a version bump and a before/after
audit — never a silent overwrite. A wrong assumption must be a defensible,
reversible change.

```ts
// applySpreadsheetDelta.ts
export const MAX_OPS = 256;
export const MAX_CELLS = 10_000;

export function createModel(input: CreateModelInput): SpreadsheetModel; // version 1, formulas resolved
export function applySpreadsheetDelta(
  model: SpreadsheetModel,
  delta: SpreadsheetDelta,
  now?: number,
): DeltaResult;                                  // { ok } | { conflict, expected, actual } | { error }
export function recompute(cells: Record<CellAddress, SpreadsheetCell>): CellAddress[];
export function evalFormula(formula: string, cells: Record<CellAddress, SpreadsheetCell>): number | null;
```

`applySpreadsheetDelta` checks `delta.baseVersion === model.version` (optimistic
concurrency); a mismatch returns a `conflict` discriminant, not an overwrite. It
snapshots before-values, applies ops, recomputes formula dependents to a fixpoint,
and emits an `AppliedDelta` audit containing only cells whose value actually changed.

**Safe formula evaluator:** `evalFormula` is a tiny **recursive-descent parser**
(`expr → term → factor`) over `+ - * /`, parentheses, numbers, and A1-style cell
references — **no `eval`**. It returns `null` (cell keeps its prior value) on parse
error or divide-by-zero, so no `Infinity`/`NaN` leaks into the model. `recompute`
iterates at most `cells.length + 1` passes: an N-node DAG settles in ≤ N passes,
and cycles stop at the bound keeping their last value — no infinite loop.

```ts
// versionedSpreadsheetSync.ts — collaborative layer (operation-log CRDT-lite)
export const MAX_LOG = 500;

export class VersionedSpreadsheetSync {
  get model(): SpreadsheetModel;
  get version(): number;
  get log(): readonly AppliedDelta[];           // most-recent-first, bounded
  commit(delta: SpreadsheetDelta, now?: number): CommitOutcome;
}
```

`commit` auto-rebases a stale delta when its target cells were *not* touched by
the deltas it missed (last-writer-wins per cell, but only after proving no overlap);
genuinely contested cells return `{ conflict: true, cells }` for the caller to resolve.

**Reliability:** `BOUND` — `MAX_OPS`, `MAX_CELLS`, bounded recompute passes, and
`MAX_LOG` with oldest-entry eviction. `HONEST_STATUS` — conflicts are returned,
not swallowed; div-by-zero yields `null`, not garbage. `DETERMINISTIC` — no
`Date.now()` inside the math; `now` is injected.

### 4. Notebook — `src/features/notebook/notebookEditor.ts`

**Purpose:** the structured, testable core behind the TipTap notebook surface —
blocks, claim/citation/entity insertion, and markdown export for shareable memos.
The rich-text rendering lives in the UI layer; this module is an immutable,
dependency-free document model.

```ts
export const MAX_BLOCKS = 2000;

export function createNotebook(title: string, now?: number): NotebookDoc;
export function appendParagraph(doc: NotebookDoc, text: string, now?: number): NotebookDoc;
export function insertHeading(doc: NotebookDoc, text: string, now?: number): NotebookDoc;
export function insertClaim(
  doc: NotebookDoc,
  args: { text: string; evidence: Citation[]; groundedRatio?: string },
  now?: number,
): NotebookDoc;
export function insertCitation(doc: NotebookDoc, citation: Citation, now?: number): NotebookDoc;
export function insertEntity(doc: NotebookDoc, entity: string, text: string, now?: number): NotebookDoc;
export function toMarkdown(doc: NotebookDoc): string;   // the shareable artifact
```

The **claim block** is the unit that makes a memo defensible: a statement plus the
citations that support it, carrying a `groundedRatio` (e.g. `"4/4"`).

**Reliability:** `BOUND` — `MAX_BLOCKS` cap (silently stops appending; caller can
check `blocks.length`). `DETERMINISTIC` — block ids derive from document state
(`b${doc.blocks.length}`) plus an injectable clock, so the same operations always
produce the same document. Every mutation returns a new `NotebookDoc` (immutable).

## The runtime loop

`src/features/node-agent/runtime/nodeAgentRuntime.ts` composes the four modules.
It is **orchestrator-workers in miniature** (per `.claude/rules/orchestrator_workers.md`)
and **always returns a result — never throws** — so an orchestrator running it in
a swarm gets structured partial output on failure instead of a crash that takes
down concurrent lanes (`ERROR_BOUNDARY`).

```ts
export interface RunInput {
  question: string;
  room: RoomContext;
  sources: SearchSource[];
  model?: SpreadsheetModel;
  modelDelta?: SpreadsheetDelta;
  memoTitle?: string;
  synthesize?: SynthesizeOptions;
  now?: number;                                 // injected clock
}

export function runNodeAgent(input: RunInput): AgentRunResult;
```

The loop runs four named steps — `gather → search → model → memo` — each wrapped
in a `safe()` helper that marks the step `error` and falls back on throw. The
contract returned:

```ts
export interface AgentStep {
  name: "gather" | "search" | "model" | "memo";
  status: "pending" | "active" | "done" | "error";
  detail: string;
  durationMs: number;                           // 0 in deterministic demo runs
}

export interface AgentRunResult {
  question: string;
  steps: AgentStep[];
  context: ContextBundle;
  synthesis: SynthesisResult;
  modelDelta: AppliedDelta | null;
  memo: NotebookDoc;
  status: "ok" | "partial" | "error";           // honest overall status
}
```

**Honest overall status:** if any step errored, the run is `partial` when a
grounded answer was still produced, otherwise `error`; only an all-clean run is
`ok`. Memo assembly is grounding-aware — a grounded answer becomes a claim block
plus the winner citation; no grounded answer writes "manual review required."

## Data flow

```
        ┌──────────────────────────────────────────────────────────────┐
        │  Live cross-collaborative Room  (RoomContext)                 │
        │  participants + messages + attachments (e.g. room://benchmark)│
        └───────────────────────────────┬──────────────────────────────┘
                                         │ focus = question
                                         ▼
        contextCollector.collectContext()        BOUND MAX_ITEMS, presence TTL
          → ContextBundle  (ranked items, activeParticipants, truncated)
                                         │
                                         ▼
        searchAndSynthesize()   4-layer grounding pipeline
          rank → confidence-gate → ground-filter → synthesize → cite
          winner = best-grounded source = "the right doc"
          → SynthesisResult (answer + citations | low-confidence decline)
                                         │
                                         ▼
        VersionedSpreadsheetSync.commit() → applySpreadsheetDelta()
          optimistic concurrency · recompute dependents · audit
          (demo: base burn 510 → 420  ⇒  runway recomputes 14.8 → 18.0)
          → AppliedDelta (vN → vN+1, per-cell from/to)  | conflict
                                         │
                                         ▼
        notebookEditor: createNotebook → insertClaim → insertCitation
          → NotebookDoc  (toMarkdown ⇒ shareable memo)
                                         │
                                         ▼
                runNodeAgent  ──►  AgentRunResult
                   steps[gather,search,model,memo] · status ok|partial|error
```

## Durable runtime ports

`src/features/node-agent/runtime/durableRuntime.ts` wraps the frame runner in a
provider-neutral durable contract:

```text
DurableJob -> LeaseStore.claim -> runReasoningFrame
  -> ArtifactStore.putJson -> StepJournal.writeOnce -> receipt replay
```

The ports are intentionally small:

| Port | Role |
|------|------|
| `DurableJobStore` | job status, attempts, priority, `runAfter`, terminal receipt refs |
| `DurableFrameStore` | frame status, evidence, and verifier receipt refs |
| `LeaseStore` | worker claim/release/expiry with monotonic fencing tokens |
| `StepJournal` | atomic `writeOnce` idempotency for frame receipts |
| `DurableScheduler` | enqueue frames and select runnable jobs |
| `ArtifactStore` | JSON receipt/result storage |
| `ToolRuntime` | typed tool execution behind policy |
| `PolicyContext` | principal, tenant, scopes, egress, and spend boundaries |

`createInMemoryDurableRuntime()` is the reference adapter used by tests and
smokes. `examples/adapters/sqlite-local/sqliteDurableRuntime.ts` is the first
fully runnable provider adapter: it uses real SQLite tables, primary keys for
journal idempotency, and transactions for lease claim. Cloud adapters must
provide the same behavior with the provider's transactional primitives:
DynamoDB conditional writes, Convex mutations, Postgres unique keys/locks,
Durable Objects, or equivalent.

The durable smoke is:

```bash
npm run nodeagent:durable:smoke
npm run nodeagent:sqlite:smoke
```

The generic durable smoke fails unless a frame can run through the durable path,
store a verifier receipt, replay a duplicate run from the journal, fence an
active lease, and reclaim an expired lease with a higher fencing token. The
SQLite smoke adds a provider proof: persisted frame state and receipt replay
after reopening the database.

The pretty CLI wraps these checks with Commander and Clack:

```bash
npm run nodeagent -- doctor
npm run nodeagent -- smoke
npm run nodeagent -- adapters setup sqlite-local --run
```

## The live backend contract

`convex/schema.ts` is the production contract. The prototype runs on deterministic
demo data, but the real cross-collaborative room is backed by these tables (new
fields on shared tables are declared `v.optional(...)` for expand-contract
migration). Keys "light up" the live paths — without them the app stays on demo data.

| Table | Purpose |
|-------|---------|
| `rooms` | Live room: code, title, `status` (live/ended/draft), discoverability, hashed host key. |
| `roomMembers` | Presence — pruned by a 5-minute `lastSeenAt` TTL window (mirrors `PRESENCE_TTL_MS`). |
| `roomMessages` | Chat messages with author, role (human/agent), and optional `attachmentRef`. |
| `roomAnswers` | Synthesized `/ask` answers with confidence, `groundedCount`, and the citation chain. |
| `documents` | Search corpus — title, `kind` (doc/rag/web/sec/news), content, optional url, visibility. |
| `spreadsheets` | Versioned model header — name, `version`, owner, `updatedAt`. |
| `spreadsheetCells` | Per-cell value + optional `formula` + label, indexed by sheet. |
| `spreadsheetDeltas` | Append-only delta log — `fromVersion`/`toVersion`, author, reason, per-cell from/to. Every change is defensible. |
| `notebooks` | Notebook header — title, owner, `updatedAt`. |
| `notebookBlocks` | Ordered blocks — `type` (heading/paragraph/claim/citation/entity), text, `groundedRatio`, evidence citations. |

The schema mirrors the in-memory types exactly (e.g. `spreadsheetDeltas.changes`
matches `AppliedDelta["changes"]`, `notebookBlocks` matches `NotebookBlock`), so
the demo modules and the live tables are the same shapes. Per `.env.example`:
`VITE_CONVEX_URL` lights up the live room; `ANTHROPIC`/`OPENAI` light up live
synthesis + RAG embeddings; `LINKUP`/`BRAVE`/etc. light up live web retrieval.

## The assistant-ui UI layer

The presentation layer is a real **assistant-ui** app (`@assistant-ui/react`). The
loop is unchanged underneath; assistant-ui supplies the runtime, the thread
primitives, and the generative tool-UI pattern.

- **Runtime** — `useLocalRuntime(nodeAgentChatAdapter)` under `AssistantRuntimeProvider`.
  The adapter (`src/features/node-agent/runtime/nodeAgentChatAdapter.ts`) is a
  `ChatModelAdapter` whose `async *run({ messages, abortSignal })` reads the user's
  question, runs `runNodeAgent` over `buildDemoScenario()`, and **streams** the result
  as cumulative content: an intro text part plus four `tool-call` parts that go
  running → complete with their real results.
- **Tool UIs** — `src/features/node-agent/components/toolUIs.tsx` registers four
  `makeAssistantToolUI` renderers keyed by tool name (`collect_context`,
  `search_synthesize`, `apply_spreadsheet_delta`, `write_memo`). assistant-ui matches
  each streamed tool-call part to its renderer and draws the card **inline in the
  assistant's message** — the generative-UI pattern.
- **Thread** — `NodeAgentThread.tsx` composes `ThreadPrimitive` / `ComposerPrimitive` /
  `MessagePrimitive` (headless) and is themed with the design DNA — no Tailwind, no shadcn.

Going live is a one-line swap: replace `nodeAgentChatAdapter` with `useChatRuntime`
(AI SDK) or a fetch-backed `ChatModelAdapter`. The tool UIs and the four modules are
unchanged.

## Three runnable surfaces

All import the **same** ported modules and share the design DNA (CSS tokens `--bg`,
`--line`, `--ink`, `--accent`, `--green`):

1. **React app — the assistant-ui chat (primary).** `src/app/main.tsx` →
   `NodeAgentDemoApp.tsx`. `npm run dev`.
2. **`nodeagent-v1.html`** — a vanilla mirror of the same chat (thread + composer +
   inline tool cards), zero build. `npm run proto`.
3. **CLI** — `demo/runNodeAgentDemo.ts` (`npm run demo`) runs the same modules and
   prints the loop's trace, ranked sources, model delta, and the markdown memo.

Tools are registered where they are rendered: `components/toolUIs.tsx` binds the four
tool names to inline cards via assistant-ui's `makeAssistantToolUI`, and
`runtime/nodeAgentChatAdapter.ts` emits tool-call parts under those exact names. An app
embedding NodeAgent supplies its own tools to `ToolRuntime` (see `runtime/durableRuntime.ts`).

The canonical scenario (`src/features/node-agent/demoScenario.ts`, "Acme diligence
room") drives every surface with a fixed `DEMO_NOW` timestamp so output is byte-stable:
a teammate asks whether the wedge holds and whether the model survives 18 months; the
agent grounds an answer, corrects a fat-fingered burn (510 → 420, runway recomputes
14.8 → 18.0), and writes the cited memo.

## Reliability map

Each module upholds the relevant invariants from `.claude/rules/agentic_reliability.md`:

| Concern | Where it lives | Mechanism |
|---------|----------------|-----------|
| **BOUND** | every collection has a `MAX_*` cap | `MAX_ITEMS=12` (context), `MAX_SOURCES=50` (search), `MAX_OPS=256` / `MAX_CELLS=10_000` (delta), `MAX_LOG=500` (sync, with eviction), `MAX_BLOCKS=2000` (notebook), bounded recompute passes |
| **HONEST_SCORES** | grounding/relevance computed, never floored | `groundingOf` / `relevanceOf` are token-overlap functions; `groundedCount` reflects real sources clearing `GROUNDING_THRESHOLD` |
| **HONEST_STATUS** | failures surfaced, not faked | low-confidence synthesis declines with a `note`; optimistic-concurrency `conflict` returned; div-by-zero → `null`; `AgentRunResult.status` is `ok` only when all steps pass |
| **SSRF** | live retrieval adapter | `isSafeFetchUrl` — http/https only; blocks loopback, RFC1918, `169.254.0.0/16` link-local + cloud metadata, `.internal`/`.local` |
| **DETERMINISTIC** | reproducible output | injectable clocks (`now`) everywhere; no `eval` (recursive-descent formula parser); only the injected `synthesizer` is stochastic; stable sorts + deterministic block ids |
| **ERROR_BOUNDARY** | runtime loop | `runNodeAgent` never throws — each step wrapped in `safe()` with a typed fallback so swarm lanes don't crash each other |
| **DURABLE_REPLAY** | durable runtime ports | lease fencing, atomic journal `writeOnce`, stored verifier receipts, duplicate-run replay, and stale lease reclaim are covered by `nodeagent:durable:smoke`; SQLite persistence is covered by `nodeagent:sqlite:smoke` |

Verification floor (from `package.json`): `npm run nodeagent:frame:smoke`,
`npm run nodeagent:durable:smoke`, `npm run nodeagent:sqlite:smoke`,
`npm run omnigent:nodeagent:smoke`, `npm run examples:guidance:smoke`,
`npm run typecheck` (`tsc --noEmit`), `npm run test` (`vitest run`), and
`npm run secret-scan` before any push (`prepush` chains the same gates).
