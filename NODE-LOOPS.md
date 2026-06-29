# NODE-LOOPS.md — NodeAgent

> This repo's self-improving-loop manifest. Companion to CLAUDE.md. Spec: https://github.com/HomenShum/noderl/blob/main/spec/node-loops.md

NodeAgent **is the policy in the loop** — the cross-collaborative agent itself: it gathers live
context from a shared room, finds the right document for the right answer, applies a versioned
model delta, and writes a cited memo, as one bounded loop. This file documents *that loop* (goal →
inner act/observe/judge → outer self-heal), grounded in the real modules under
[`src/features/node-agent/runtime/`](src/features/node-agent/runtime/).

> Companion note: this repo has **no root `CLAUDE.md`** today (finding — see §4). The behavioral
> rules that *would* live there are partly inline in module headers (e.g.
> [`nodeAgentRuntime.ts`](src/features/node-agent/runtime/nodeAgentRuntime.ts) cites a
> `.claude/rules/orchestrator_workers.md` that does **not** exist in this repo). The reliability
> contract is enforced in code and tests instead — see §5.

---

## 1. Goal & milestones

**Goal.** Run *one* loop over four surfaces — **gather context → search & synthesize →
versioned model delta → write memo** — and return a structured `AgentRunResult` whose `status`
is `ok` **only when every step completed**, never a fake success.
([`runNodeAgent`](src/features/node-agent/runtime/nodeAgentRuntime.ts))

What "good" is, per the canonical Acme-diligence scenario
([`demoScenario.ts`](src/features/node-agent/demoScenario.ts)): the room asks
*"Does our wedge hold versus Acme, and does the runway model survive 18 months?"*; the agent
corrects a fat-fingered base burn (510 → 420) so the runway recomputes 14.8 → **18.0 months**,
and writes a memo with a grounded claim + citation.

Milestone gates the loop is checked against (the `prepush` chain in
[`package.json`](package.json) → receipts in [`docs/eval/`](docs/eval/)):

| Milestone | Proof command | Receipt |
|---|---|---|
| Bounded frame path | `npm run nodeagent:frame:smoke` | [`nodeagent-frame-smoke.json`](docs/eval/nodeagent-frame-smoke.json) |
| Provider-neutral durability (lease/journal/replay) | `npm run nodeagent:durable:smoke` | [`nodeagent-durable-smoke.json`](docs/eval/nodeagent-durable-smoke.json) |
| No-cloud SQLite adapter | `npm run nodeagent:sqlite:smoke` | [`nodeagent-sqlite-smoke.json`](docs/eval/nodeagent-sqlite-smoke.json) |
| Convex live contract (schema + URL reachable) | `npm run nodeagent:convex:smoke` | [`nodeagent-convex-smoke.json`](docs/eval/nodeagent-convex-smoke.json) |
| Init-to-runnable speed | `npm run nodeagent:happy-path:smoke` | [`nodeagent-happy-path-speed.json`](docs/eval/nodeagent-happy-path-speed.json) |
| Live-provider seam (key-gated) | `npm run nodeagent:live-provider:smoke` | [`nodeagent-live-provider-smoke.json`](docs/eval/nodeagent-live-provider-smoke.json) |
| Outer harness validation | `npm run omnigent:nodeagent:smoke` | [`omnigent-nodeagent-smoke.json`](docs/eval/omnigent-nodeagent-smoke.json) |

---

## 2. Inner loop (agent-status trace)

**The task.** One question + a room + sources (+ optional model & delta) → one
`AgentRunResult`. Driven from the UI by the assistant-ui `ChatModelAdapter`
([`nodeAgentChatAdapter.ts`](src/features/node-agent/runtime/nodeAgentChatAdapter.ts)); the same
loop runs headless in the demo runner and the smokes.

**State / action / observation.** Each of the four steps appends an `AgentStep`
(`{ name, status: active|done|error, detail, durationMs }`) — the agent-status trace IS the
return value, not a hidden transcript. Steps:

| Step | Action (tool) | Real module | Observation recorded |
|---|---|---|---|
| `gather` | `collect_context` | [`chat/contextCollector.ts`](src/features/chat/contextCollector.ts) | `N context items · M active [· truncated]` |
| `search` | `search_synthesize` | [`search/searchAndSynthesize.ts`](src/features/search/searchAndSynthesize.ts) | `K grounded · confidence high/medium/low` |
| `model` | `apply_spreadsheet_delta` | [`spreadsheet/versionedSpreadsheetSync.ts`](src/features/spreadsheet/versionedSpreadsheetSync.ts) | `vX → vY · cells [· rebased]` **or** `version conflict on …` |
| `memo` | `write_claim` | [`notebook/notebookEditor.ts`](src/features/notebook/notebookEditor.ts) | `B blocks` (claim + citation) |

**Tools / discovery.** The action vocabulary is a progressive-discovery registry
([`src/mcp/toolRegistry.ts`](src/mcp/toolRegistry.ts)): each entry carries a `category` and
`nextTools`, so the agent can `discoverTools(query)` (hybrid keyword score) and follow a
`workflowChain` — `collect_context → search_synthesize → apply_spreadsheet_delta → write_claim`,
with `run_agent` / `run_durable_frame` as the runtime entry points. (There are no separate
`.claude/skills/` in this repo — the skills *are* these four typed tool contracts.)

**How traced.** The loop never throws — `safe()` wraps each step body, marks it `error` on throw,
and returns a structured fallback so a swarm orchestrator gets partial output, not a crash
(`ERROR_BOUNDARY`). When run as a durable frame, the trace is persisted as a stored verifier
receipt ([`durableRuntime.ts`](src/features/node-agent/runtime/durableRuntime.ts) →
`artifactStore.putJson({ kind: "reasoning-frame-receipt" })`).

**The JUDGE is a separate verifier — not the model that did the work.** The loop
(`runNodeAgent`) produces the result; a distinct `verifyFrame()` in
[`reasoningFrameRunner.ts`](src/features/node-agent/runtime/reasoningFrameRunner.ts) inspects it
against the frame's `ContextPack` and decides `completed | blocked | failed`. Its checks (none
self-reported by the worker):
- grounding confidence ≥ the frame's `expectedMinimumConfidence` (else `blocked`),
- runtime `status !== error` (else `failed`),
- if `requireModelDelta`, a delta was actually applied (else `blocked`),
- the memo contains a real `claim` block (else `blocked`).

**Reward signal.** Not a scalar RL reward — a structured pass/block/fail from the verifier plus
the honest `AgentRunResult.status` (`ok`/`partial`/`error`). The frame smoke additionally asserts
the *concrete* outcome (runway = 18 months, 3 grounded citations, winner `src_bench`).

---

## 3. Outer loop (self-improve)

The outer loop is **operated by a coding agent + the `prepush` gate**, not an automated trainer
(honest scope). Traces and failures feed back as follows:

- **Failure surface.** A red verifier receipt names the exact deficit (`Grounding confidence below
  medium`, `Expected a versioned model delta, but none was applied`, `Memo has no grounded claim
  block`) — pointing the editing agent at the specific module to fix.
- **What gets edited.** Tools / contracts in [`toolRegistry.ts`](src/mcp/toolRegistry.ts) and the
  four feature modules; grounding thresholds (`GROUNDING_THRESHOLD`, the `W_GROUNDING/W_RETRIEVAL`
  blend) in [`searchAndSynthesize.ts`](src/features/search/searchAndSynthesize.ts); the canonical
  scenario in [`demoScenario.ts`](src/features/node-agent/demoScenario.ts). There is **no
  separate prompt store or skills dir** to edit (the loop is deterministic TS by default; the
  live LLM is an *injectable* `synthesizer`, see §4).
- **Promotion gate.** A change ships only through the full `prepush` chain in
  [`package.json`](package.json): `secret-scan → frame → durable → sqlite → convex → local-dashboard
  → chat-ui → happy-path → live-provider → omnigent → examples-guidance → typecheck → test → build
  → npm audit`. CI re-runs it on every push/PR ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)),
  and additionally diffs `docs/walkthroughs` (`git diff --exit-code`) so regenerated media can't drift.
- **Kill criteria.** Any smoke failing its *concrete* assertion (e.g. frame ≠ 18-month runway),
  any drift guard tripping (`examples:guidance:smoke`, walkthrough diff), `secret-scan` finding a
  secret, or `npm audit` flagging a non-dev vuln — the push is blocked. The Portability gate
  (README) adds: if a target repo would have to fork the runtime *contract* to add its DB/queue,
  "the abstraction is wrong" — add an adapter, don't fork core.

---

## 4. Context anchors

The substrates that ground the loop (real files; absences flagged):

- **Tool registry** — [`src/mcp/toolRegistry.ts`](src/mcp/toolRegistry.ts): the discoverable
  action vocabulary + `nextTools` workflow chain.
- **The four feature modules** —
  [`chat/contextCollector.ts`](src/features/chat/contextCollector.ts) (presence-TTL-aware, bounded),
  [`search/searchAndSynthesize.ts`](src/features/search/searchAndSynthesize.ts) (4-layer grounding),
  [`spreadsheet/versionedSpreadsheetSync.ts`](src/features/spreadsheet/versionedSpreadsheetSync.ts)
  + [`applySpreadsheetDelta.ts`](src/features/spreadsheet/applySpreadsheetDelta.ts) (versioned CAS),
  [`notebook/notebookEditor.ts`](src/features/notebook/notebookEditor.ts) (immutable blocks).
- **Runtime / frame / durable contracts** —
  [`nodeAgentRuntime.ts`](src/features/node-agent/runtime/nodeAgentRuntime.ts),
  [`reasoningFrameRunner.ts`](src/features/node-agent/runtime/reasoningFrameRunner.ts) (the judge),
  [`durableRuntime.ts`](src/features/node-agent/runtime/durableRuntime.ts) (job/frame/lease/journal/
  scheduler/artifact/tool/policy ports + in-memory reference adapter).
- **Live backend contract** — [`convex/schema.ts`](convex/schema.ts): `rooms`, `roomMembers`
  (5-min presence TTL), messages/answers, documents/spreadsheets/notebook stores; new fields are
  `v.optional(...)` (expand-contract, non-destructive migrations).
- **Knowledge / grounding layer (OKF/RAG).** Grounding is **computed** token-overlap against
  source title+snippet (`groundingOf`), gated at `GROUNDING_THRESHOLD = 0.34`; there is no
  embedding/vector store in this repo — retrieval is deterministic by design, with a live
  `synthesizer` seam for production. (Finding: RAG here = the 4-layer deterministic pipeline, not
  a vector DB.)
- **Eval / proof gates** — [`docs/eval/*.json`](docs/eval/) receipts;
  [`tests/`](tests/) deterministic suite; [`scripts/*-smoke.ts`](scripts/);
  [`scripts/secret-scan.mjs`](scripts/secret-scan.mjs).
- **Memory substrate** — **absent at repo root** (no `CLAUDE.md`, no `.claude/`, no MEMORY index).
  Agent-facing guidance for *target repos* lives in [`examples/adapters/AGENTS.md`](examples/adapters/AGENTS.md)
  and the scaffold templates' `AGENTS.md`. The loop carries no persistent cross-session memory
  today — each run is stateless over its inputs (this is the deliberate determinism property, but
  it means there's no failure-pattern store to learn from yet). **This is a finding.**
- **Outer harness** — [`omnigentAdapter.ts`](src/features/node-agent/runtime/omnigentAdapter.ts)
  + [`examples/omnigent/`](examples/omnigent/): Omnigent YAML can *launch/govern* a session, but
  NodeAgent owns runtime state, frames, evidence, deltas, and memo output.

---

## 5. Verification protocol

**Separate verifier / no-proof-no-claim.** The judge (`verifyFrame`, §2) is a different function
from the worker (`runNodeAgent`); a step's status is set by `safe()` from real outcomes, never
self-asserted. No claim of "passing" exists outside a regenerated [`docs/eval/`](docs/eval/)
receipt produced by a smoke that asserts a *concrete* value.

**Runtime reliability checklist** — enforced in code (grep the headers):
- **Honest status.** `runNodeAgent` returns `ok` only if no step errored; otherwise `partial`
  (answer survived) or `error`. Stale spreadsheet edits return a `conflict`, never a silent
  overwrite ([`versionedSpreadsheetSync.ts`](src/features/spreadsheet/versionedSpreadsheetSync.ts)).
- **Honest scores.** Grounding is *computed* from token overlap, never hardcoded; on weak grounding
  the pipeline returns an **empty answer + honest note** instead of inventing one
  ([`searchAndSynthesize.ts`](src/features/search/searchAndSynthesize.ts)).
- **Bounded reads / collections.** `MAX_SOURCES = 50`, `MAX_LOG = 500` (oldest evicted),
  `MAX_ITEMS/MAX_OPS` across modules — every collection has a cap + eviction.
- **SSRF guard.** `isSafeFetchUrl` validates the live-fetch path before any external fetch:
  http/https only; blocks `localhost`, `0.0.0.0`, `::1`, `*.internal`/`*.local`,
  `metadata.google.internal`, and RFC1918 + link-local `169.254.0.0/16` (cloud-metadata)
  ([`searchAndSynthesize.ts`](src/features/search/searchAndSynthesize.ts)).
- **Deterministic CAS.** Clocks are injectable (`now`); the model delta is optimistic-concurrency
  by `baseVersion` with per-cell conflict detection and safe auto-rebase only when target cells
  don't overlap intervening changes — same inputs → same memo (tested in
  [`tests/spreadsheetDelta.test.ts`](tests/spreadsheetDelta.test.ts)).
- **Error boundary.** `runNodeAgent` never throws — `safe()` converts a step throw into a recorded
  `error` + structured fallback, so a swarm lane degrades instead of crashing.
- **Durable idempotency / timeout.** Lease TTL (default 30s) fences concurrent workers; the
  `StepJournal.writeOnce` makes retries replay the stored receipt instead of duplicating side
  effects; terminal jobs replay rather than re-run ([`durableRuntime.ts`](src/features/node-agent/runtime/durableRuntime.ts)).

---

## 6. Reward & safety

**Reward components.** Structured verifier verdict (`completed`/`blocked`/`failed`) + honest
`AgentRunResult.status` + concrete smoke assertions (runway months, grounded count, winner id).
No scalar reward floor; nothing is rewarded for *claiming* success without a receipt.

**Safety gates.**
- **Approval / policy for outward actions.** `PolicyContext` (`principalId`, `tenantId`, `scopes`,
  `egressAllowed`, `spendLimitCents`) rides with every durable run; the SSRF guard gates egress on
  the live-fetch path; `secret-scan` refuses to ship secrets (and live keys are gitignored,
  fall-back-to-demo when absent).
- **No-clobber.** The whole spreadsheet layer is no-silent-overwrite by construction: a stale
  delta yields a `version conflict` listing contested cells; non-overlapping concurrent edits
  auto-rebase, genuinely conflicting ones are surfaced to the caller.
- **No foreground starvation.** Steps are bounded (`MAX_*` caps), the loop is single-pass (no
  unbounded retry), durable work is leased + journaled (no spin), and CI carries a 20-minute job
  timeout. The error boundary keeps one failing lane from blocking concurrent ones.
- **No data leakage.** Convex stores only a **hashed** `hostKeyHash`, never the raw host key
  ([`convex/schema.ts`](convex/schema.ts)); secrets never enter prompts/traces; smokes assert URL
  reachability "without printing secret values".

---

## 7. Status / receipts

Receipts live in [`docs/eval/`](docs/eval/) (regenerated by the smokes) and CI re-runs the full
`prepush` chain on every push/PR.

**PROVEN** (a receipt or test backs it):
- The four-step loop runs deterministically and returns honest status — `tests/nodeAgentRuntime.test.ts`.
- Separate-verifier frame path produces the concrete outcome — [`nodeagent-frame-smoke.json`](docs/eval/nodeagent-frame-smoke.json):
  `status: completed`, `runtimeStatus: ok`, runway **18 months**, 3 grounded citations,
  winner `src_bench`, confidence `high`.
- Provider-neutral durability — [`nodeagent-durable-smoke.json`](docs/eval/nodeagent-durable-smoke.json):
  lease blocks while active + reclaims after expiry + fencing advances; journal has 1 entry;
  replay returns the same frame; concrete runway = 18.
- No-cloud SQLite persistence + receipt replay after DB reopen — [`nodeagent-sqlite-smoke.json`](docs/eval/nodeagent-sqlite-smoke.json),
  `tests/sqliteDurableRuntime.test.ts`.
- Grounding declines instead of fabricating; SSRF guard blocks private/metadata hosts;
  versioned-delta conflict/rebase — `tests/searchSynthesize.test.ts`, `tests/spreadsheetDelta.test.ts`.
- Convex live contract = schema tables present + configured URL reachable (no secret printed) —
  [`nodeagent-convex-smoke.json`](docs/eval/nodeagent-convex-smoke.json). (This proves the
  *contract*, not a deployed multiplayer backend.)

**OPEN / not yet proven** (honest):
- **Live LLM path.** `nodeagent:live-provider:smoke` is **key-gated** (skips without a provider
  key); the default loop uses the deterministic extractive synthesizer, so end-to-end live
  synthesis quality is unproven here.
- **Cloud adapters.** `aws-dynamodb`, `postgres`, `cloudflare` are **credential-guided blueprints**
  ([`examples/adapters`](examples/adapters)) — no provider smoke yet. Only `sqlite-local` is fully
  runnable and `convex` has a contract-level smoke.
- **No outer self-improvement loop / memory store.** The "outer loop" (§3) is human+CI driven;
  there is no automated trace→edit→promote trainer and no persistent failure-memory yet.
- **No root `CLAUDE.md` / `.claude/`.** Behavioral rules are inline in headers and one cited rule
  file (`.claude/rules/orchestrator_workers.md`) is **referenced but absent**.
- Official Omnigent runner (`omni run`) can fail on native Windows (POSIX `signal.SIGUSR1`); the
  npm `omniagent` probe and `--require-official-omnigent` path are the documented workarounds.

No invented scores or pass-rates: every number above is read directly from a committed receipt or
asserted by a named test.
