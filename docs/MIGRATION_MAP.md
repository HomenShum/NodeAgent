# Migration Map — NodeBench AI → NodeAgent

NodeAgent is a **distillation**, not a fork. NodeBench AI is a 300+-tool agent platform
(monorepo, Convex backend, live collaborative rooms, a 4-layer grounded search pipeline, TipTap
notebooks, voice, a LinkedIn pipeline, an MCP gateway). NodeAgent keeps the four capabilities
that tell a coherent story and rebuilds them as clean, tested, dependency-light TypeScript.

This document is the honest ledger of what came from where.

## What was distilled

| NodeAgent module | Distilled from (NodeBench AI) | What was kept / what changed |
|---|---|---|
| [`chat/contextCollector.ts`](../src/features/chat/contextCollector.ts) | `convex/events.ts` (live room messages, presence), `convex/schema/eventsSchema.ts` (`liveEventMembers` 5-min TTL), chat memory layer | Kept the presence-TTL model and the "rank the few that matter" idea. Reduced from Convex mutations/subscriptions to a pure, deterministic ranking function with a `MAX_ITEMS` bound. |
| [`search/searchAndSynthesize.ts`](../src/features/search/searchAndSynthesize.ts) | `server/routes/search.ts` (4-layer grounding pipeline), `convex/domains/search/fusion/*` (orchestrator, RRF reranker, source adapters), `convex/domains/search/rag.ts` | Kept the 4-layer pipeline (confidence → grounding → synthesis → citation) and the deterministic-vs-stochastic separation. Reduced 9 live source adapters + RAG to a pure ranking/grounding core with an **injectable** synthesizer seam and an SSRF guard for the live path. |
| [`spreadsheet/applySpreadsheetDelta.ts`](../src/features/spreadsheet/applySpreadsheetDelta.ts) | `convex/domains/integrations/spreadsheets.ts` (`applyOperations`), the `spreadsheetEvents` operation log, `spreadsheetCells` table | Kept the operation-log model and per-cell audit. Added an `eval`-free formula evaluator + explicit optimistic-concurrency result type. Reduced Convex mutations to a pure function. |
| [`spreadsheet/versionedSpreadsheetSync.ts`](../src/features/spreadsheet/versionedSpreadsheetSync.ts) | `spreadsheetEvents` + Convex optimistic mutations | New, explicit collaborative layer: auto-rebase of non-overlapping concurrent edits, conflict surfacing, a bounded log. |
| [`notebook/notebookEditor.ts`](../src/features/notebook/notebookEditor.ts) | `src/features/notebook/components/RichNotebookEditor.tsx`, the `nbClaim` / `nbProposal` TipTap extensions, `notebookActionEngine.ts` | Kept the block model (heading / paragraph / claim / citation / entity) and grounded claim blocks. Reduced the TipTap React editor to a pure, immutable document model with markdown export; the rich rendering lives in the prototype + React UI. |
| [`node-agent/runtime/nodeAgentRuntime.ts`](../src/features/node-agent/runtime/nodeAgentRuntime.ts) | The scratchpad-first pipeline + orchestrator-workers pattern (`.claude/rules/orchestrator_workers.md`, `scratchpad_first.md`) | Kept the bounded, honest-status, never-throw orchestration shape. Reduced multi-agent fan-out to a single deterministic loop with structured `AgentRunResult`. |
| [`mcp/toolRegistry.ts`](../src/mcp/toolRegistry.ts) | `packages/mcp-local/src/tools/toolRegistry.ts` (progressive discovery, `nextTools`, hybrid search) | Kept progressive discovery (`discoverTools`, `nextTools`, `workflowChain`). Reduced a 346-entry catalog to the 5 NodeAgent tools. |
| [`convex/schema.ts`](../convex/schema.ts) | `liveEvent*` tables (`liveEvents`, `liveEventMembers`, `liveEventMessages`, `liveEventAnswers`), `documents`, `spreadsheets`/`spreadsheetEvents`, notebook tables | Kept the table shapes that back the four surfaces. New fields are `v.optional(...)` (expand-contract). Reduced ~80 tables to the 9 NodeAgent needs. |
| [`nodeagent-v1.html`](../nodeagent-v1.html) | `public/proto/home-v4.html` (Notebook + Artifacts + Chat) and `public/proto/home-v5.html` (ScratchNode live room) | Inherited the full design DNA — `#151413` ground, terracotta `#d97757`, Manrope + JetBrains Mono, the motion tokens — and the v4 → v5 lineage. NodeAgent is the next step: the four surfaces as one agent loop. |

## What was deliberately left behind

NodeAgent is intentionally *not* the platform. Out of scope, by design:

- The 300+-tool MCP server, the toolset registry, persona presets, the WebSocket MCP gateway + auth.
- The live Convex **deployment** (the schema is here as a contract; the mutations/actions are not).
- Voice (TTS/STT), the LinkedIn posting pipeline, financial-data integrations, the email/calendar surfaces.
- The 9 live search adapters (Brave/Serper/Tavily/Linkup/SEC/…) and the embedding/RAG infrastructure.
- The self-improvement loop, eval harnesses, dogfood/QA tooling, and the rest of the operational substrate.

Why leave them out: a portfolio repo should be *readable in an afternoon* and *true in every
line*. Everything in NodeAgent typechecks, is tested, and runs with no keys. The heavy machinery
is what the parent platform is for.

## Design reductions made along the way

- **Convex mutations → pure functions.** Every core algorithm is dependency-free and unit-tested
  in isolation; Convex becomes a thin persistence layer described by `convex/schema.ts`.
- **Live LLM calls → injectable seams.** Synthesis takes an optional `synthesizer`; with none, a
  deterministic extractive synthesizer runs. The demo needs no keys; production swaps the seam.
- **Stochastic where it must be, deterministic everywhere else.** Ranking, grounding, delta math,
  and the loop are deterministic (injectable clocks). Only generation is stochastic, and it's
  optional.
- **One scenario, everywhere.** [`demoScenario.ts`](../src/features/node-agent/demoScenario.ts)
  drives the prototype, the CLI demos, the React app, and the tests — so the story can't drift.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the distilled pieces fit together, and
[`TECH_RETRO.md`](TECH_RETRO.md) for why these four.
