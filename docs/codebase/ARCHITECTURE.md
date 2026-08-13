# Architecture

How a question becomes a memo, and which boundaries are load-bearing.

For the file-by-file runtime order, read `docs/START_HERE.md` first. This page
is the shape behind it.

## One sentence

A pure, synchronous function called `runNodeAgent` runs four steps in order; an
adapter replays its four results as a stream of chat "tool calls" so each one
renders as it lands; a separate observer records which real entities each step
touched, and a side panel draws them.

## The flow

```
        browser
           │
  index.html ─► src/app/main.tsx ─► NodeAgentDemoApp
                                       │
                     useLocalRuntime(nodeAgentChatAdapter)   ← @assistant-ui/react
                                       │
              ┌────────────────────────┴──────────────────────┐
              ▼                                               ▼
        NodeAgentThread                                 GraphRailPanel
     (composer, messages,                            (useSyncExternalStore
      inline tool cards)                              over graphSession)
              │                                               ▲
              │  user presses Enter                           │
              ▼                                               │
     nodeAgentChatAdapter.run()  ── async generator ───────────┤
              │                                               │
              ├─► runNodeAgent(scenario)   ← ONE synchronous call, all 4 steps
              │        │
              │        ├─ 1 collectContext        (features/chat)
              │        ├─ 2 searchAndSynthesize   (features/search)
              │        ├─ 3 VersionedSpreadsheetSync.commit (features/spreadsheet)
              │        └─ 4 notebookEditor        (features/notebook)
              │
              └─► for each step: yield a tool-call part, pause, yield its result,
                  and call feed*Step(...) ────────────────────► graphSession
```

## The boundary that matters most

**`runNodeAgent` is synchronous and returns before anything renders.** The
"streaming" a user sees is the adapter pacing out results that already exist
(`await tick(360)` between yields). This is the single most surprising fact
about the codebase, and knowing it explains a lot:

- The loop is trivially testable — no mocks, no async, no fake timers.
- The abort signal can only take effect *between* steps, not inside one.
- Making the loop genuinely incremental means changing `runNodeAgent` into a
  generator, and the adapter is the only caller that would need to care.

## The four pure modules

Each is deterministic, has no React import, no I/O, and no clock of its own —
`now` is always passed in. That is what lets the same code run in a browser, in
a terminal, and in a test with identical output.

| Module | Responsibility | Refuses to |
|---|---|---|
| `chat/contextCollector.ts` | Rank room messages and documents against the question; count who is currently present | Return more than `MAX_ITEMS` (12) |
| `search/searchAndSynthesize.ts` | Score grounding, rank, assign citation numbers, synthesize extractively | **Write an answer when grounding is weak** — returns an empty answer plus a stated reason |
| `spreadsheet/applySpreadsheetDelta.ts` + `versionedSpreadsheetSync.ts` | Apply a change against an expected version, recompute dependent cells, record before/after | Apply a stale change onto cells someone else moved — reports the contested cells instead |
| `notebook/notebookEditor.ts` | Build the memo as typed blocks; render markdown | — |

## Invariants worth not breaking

1. **Honest status.** `runNodeAgent` returns `ok` only when every step
   completed; `partial` when a memo shipped without grounding; `error`
   otherwise. Nothing else is allowed to report success on that run's behalf.
2. **Refuse rather than fabricate.** `searchAndSynthesize` returns
   `confidence: "low"` and an empty answer instead of prose it cannot support.
3. **Measured counts only.** `agentGraphSession.ts` passes a count to the graph
   only when something was genuinely counted; everything else is `undefined` and
   renders as "unknown — not measured". `assertEdge` is never called, because
   NodeAgent citations lack the version field the receipt requires.
4. **The loop never throws.** `safe()` converts a thrown step into a recorded
   error plus a fallback, so an orchestrator running many of these concurrently
   gets structured partial output instead of a crash.
5. **Determinism.** A fixed `DEMO_NOW` makes output byte-stable, which is what
   lets tests compare rendered markdown directly.

## Tools

There is no tool-calling model, no schema registry and no dispatch table. A tool
is **a name string with a renderer bound to it**:

- registered — `makeAssistantToolUI({ toolName: "collect_context", render })` in
  `components/toolUIs.tsx`
- invoked — the adapter emits `{ type: "tool-call", toolName: "collect_context", … }`

The four names are `collect_context`, `search_synthesize`,
`apply_spreadsheet_delta`, `write_memo`. If the two lists disagree, the card
silently does not render — there is no error for this. A repo-wide
tool-*registry* module used to exist and was documented as the tool surface; it
had no callers and was deleted (see `docs/SIMPLIFICATION_REPORT.md`).

For a real embedding, `runtime/durableRuntime.ts` defines a `ToolRuntime` port
that accepts `NodeAgentTool` objects behind a policy context.

## The durable layer, and what it is not

`runtime/durableRuntime.ts` (~580 lines) defines provider-neutral ports — job
store, frame store, leases with fencing tokens, a write-once step journal,
scheduler, artifact store, tool runtime — plus an in-memory reference adapter.
`examples/adapters/sqlite-local/` implements the same ports on SQLite.

**The browser app does not use any of it.** It is exercised by
`npm run nodeagent:durable:smoke`, `npm run nodeagent:sqlite:smoke`, and their
tests. Treat it as a library this repo ships for embedders, not as the demo's
persistence layer — the demo has none.

## Two entry points to the same product

| Surface | Path | Uses `src/`? |
|---|---|---|
| React app | `index.html` → `src/app/main.tsx` | yes |
| Prototype | `nodeagent-v1.html` | **no** — self-contained, inline `<style>`, its own JS |

The prototype is a separate artifact that mirrors the same story. Changing
`src/` cannot affect it; that independence is why the promotion log could
attribute a styling fix to one and not the other.
