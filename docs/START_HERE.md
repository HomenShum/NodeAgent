# START HERE — the runtime order

Read this in order. It follows what actually happens when someone uses the app,
not how the folders are arranged.

## Who is doing the work, and what they are trying to finish

A founder has an investor call in forty minutes. A competitor published a
teardown claiming her product's advantage does not hold, and her finance lead
mentioned that monthly spending crept up after two senior hires. The answer is
scattered across a chat room, a document someone pasted last week, and a
spreadsheet whose "how many months of money is left" number is now stale. What
costs her the call is not the work — it is being unable to say where each
number came from.

She types the question in plain words and watches four things happen: the
relevant messages and documents are pulled out of the room, the sources are
ranked so the winning one is visible, the spreadsheet cell is corrected and its
version bumped, and a memo is written that puts each claim next to the source it
rests on.

In this codebase's vocabulary: **one agent loop, rendered as four inline tool
cards in a chat, with a live picture of which source fed which conclusion beside
it.** It runs with no API keys and no account, over one fixed scenario, so a
stranger reaches the finished memo about a minute after cloning.

## Run it first

```bash
npm install
npm run dev            # http://localhost:5173 — the app
npm run demo           # the same loop, printed to a terminal
npm test               # 41 tests
```

If you only read one file after this page, read
`src/features/node-agent/runtime/nodeAgentRuntime.ts`. It is the loop.

---

## Step 1 — The browser loads one page and mounts one component

**File:** `index.html`, then `src/app/main.tsx`
**Symbol:** `createRoot(el).render(<NodeAgentDemoApp />)`
**Called by:** the browser, on page load
**Calls next:** Step 2

**Why this exists**
There is no router and no server. This is a single-page Vite app whose one
screen is the chat, so the entry point's whole job is to mount one component.

**Core code**
```tsx
// src/app/main.tsx:6-13
const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <NodeAgentDemoApp />
    </React.StrictMode>,
  );
}
```

**Input** — a page request for `/`.
**Output** — a mounted React tree.
**Failure behavior** — if `#root` is absent nothing renders and nothing throws.
There is no error boundary anywhere in this tree; see Step 8.
**Next** — Step 2 wires the chat runtime.

---

## Step 2 — The chat runtime, the tool cards, and the graph are wired together

**File:** `src/features/node-agent/components/NodeAgentDemoApp.tsx`
**Symbol:** `NodeAgentDemoApp`
**Called by:** Step 1
**Calls next:** Step 3

**Why this exists**
This is the only place that decides *how* the agent runs. `useLocalRuntime`
comes from the installed `@assistant-ui/react` package: it gives a working chat
runtime — message list, composer state, streaming — in exchange for one adapter
object. Swapping the adapter for a server-backed one is the single edit that
takes this from demo to production.

**Core code**
```tsx
// src/features/node-agent/components/NodeAgentDemoApp.tsx:17-23
const runtime = useLocalRuntime(nodeAgentChatAdapter);

return (
  <AssistantRuntimeProvider runtime={runtime}>
    <NodeAgentToolUIs />
```

**Input** — none.
**Output** — a provider wrapping the thread (Step 3) and the graph rail (Step 7).
**Failure behavior** — none of its own; it is composition only.
**Next** — Step 3 is the control the user actually touches.

---

## Step 3 — The user asks a question

**File:** `src/features/node-agent/components/NodeAgentThread.tsx`
**Symbol:** `NodeAgentThread`
**Called by:** Step 2
**Calls next:** Step 4

**Why this exists**
The visible chat. It is built from assistant-ui's unstyled building blocks
(`ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`) and styled by
`src/app/styles.css` — no Tailwind, no component library. Pressing Enter or the
send button is what starts the agent.

**Core code**
```tsx
// src/features/node-agent/components/NodeAgentThread.tsx:118-135
<ComposerPrimitive.Root className="na-composer">
  <ComposerPrimitive.Input placeholder="Ask the room anything…" rows={1} autoFocus />
  <ComposerPrimitive.Send className="na-send" aria-label="Send">↑</ComposerPrimitive.Send>
</ComposerPrimitive.Root>
```

The empty state offers two one-click starter questions
(`ThreadPrimitive.Suggestion`), which is how most first-time visitors
actually start.

**Input** — typed text, or a click on a suggestion chip.
**Output** — a user message appended to the thread; assistant-ui then calls the
adapter in Step 4.
**Failure behavior** — while a response runs, Send gives way to Stop response.
Stop ends its display updates and preserves completed work; it does not undo
already computed or external work. Incomplete responses offer explicit Retry
through the existing runtime. Retry is never automatic; this local demo does
not certify provider cancellation.
**Next** — Step 4 receives the message.

---

## Step 4 — Domain types and the one real validation rule

**File:** `src/features/node-agent/types/nodeAgentTypes.ts`, and
`src/features/spreadsheet/versionedSpreadsheetSync.ts`
**Symbol:** `VersionedSpreadsheetSync.commit`
**Called by:** Step 5, during the model step
**Calls next:** Step 5

**Why this exists**
Be clear about what this app does and does not check. The question itself is
free text and is **not validated** — it is a string that gets tokenized, and no
untrusted input crosses a network boundary in the demo path, so there is nothing
to sanitize. The real rule guards the artifact that people disagree about: the
spreadsheet. Two people editing the same model must not silently overwrite each
other, so every change carries the version it was written against.

**Core code**
```ts
// src/features/spreadsheet/versionedSpreadsheetSync.ts:58-72
commit(delta: SpreadsheetDelta, now: number = Date.now()): CommitOutcome {
  if (delta.baseVersion !== this._model.version) {
    if (delta.baseVersion > this._model.version) {
      return { ok: false, conflict: false, error: "base_ahead_of_head" };
    }
    const missedCells = this.cellsChangedSince(delta.baseVersion);
    const contested = [...new Set(delta.ops.map((o) => o.address))].filter((c) => missedCells.has(c));
    if (contested.length > 0) return { ok: false, conflict: true, cells: contested.sort() };
```

Plain language: if your edit was written against an older version, but nobody
touched the cells you are changing, your edit is quietly moved forward onto the
current version. If somebody *did* touch them, you get told which cells clash
rather than winning by arriving last.

**Input** — a delta plus the version it was based on.
**Output** — `{ok:true, applied, rebased}`, or a conflict naming the cells, or an
error string.
**Failure behavior** — returns a result; never throws.
**Next** — Step 5 runs the loop that calls this.

---

## Step 5 — The agent loop

**File:** `src/features/node-agent/runtime/nodeAgentRuntime.ts`
**Symbol:** `runNodeAgent`
**Called by:** `nodeAgentChatAdapter.run` (Step 6), `demo/runNodeAgentDemo.ts`,
`reasoningFrameRunner.ts`
**Calls next:** Step 6

**Why this exists**
The four capabilities are separate, testable, pure modules. This is the only
thing that puts them in order and decides whether the whole run succeeded. It is
deliberately plain: four numbered blocks, top to bottom, no framework.

**Core code**
```ts
// src/features/node-agent/runtime/nodeAgentRuntime.ts:54-56, 160-167
export function runNodeAgent(input: RunInput): AgentRunResult {
  /* 1 gather → 2 search → 3 model → 4 memo, each recorded as an AgentStep */
  const hadError = steps.some((s) => s.status === "error");
  const status = hadError ? (synthesis.answer ? "partial" : "error") : "ok";
  return { question: input.question, steps, context, synthesis, modelDelta, memo, status };
}
```

The honesty rule lives in those two lines: `ok` only when every step completed,
`partial` when the memo shipped but grounding failed, `error` otherwise. The
search step refuses to write an answer it cannot support — the
`confidence === "low"` branch in `searchAndSynthesize.ts` returns an empty
answer with a stated reason rather than inventing prose.

**Input** — a `RunInput`: question, room, sources, optional model + delta, clock.
**Output** — an `AgentRunResult` with four step records and the four artifacts.
**Failure behavior** — never throws. `safe()` wraps each step body,
marks the step `error`, and substitutes an empty result so later steps still run.
**Next** — Step 6 turns this result into a streamed message.

---

## Step 6 — Tools are named, emitted, and rendered

**File:** `src/features/node-agent/runtime/nodeAgentChatAdapter.ts` (invocation)
and `src/features/node-agent/components/toolUIs.tsx` (registration)
**Symbol:** `nodeAgentChatAdapter.run`, `makeAssistantToolUI`
**Called by:** assistant-ui, when the user sends a message
**Calls next:** Step 7

**Why this exists**
This is the join everyone looks for first, so be precise: **a "tool" here is a
name string with a card bound to it.** `toolUIs.tsx` registers four renderers by
name; the adapter emits parts carrying those same four names. Nothing else
matches them up — if the two lists disagree, the card silently does not render.

The four names are `collect_context`, `search_synthesize`,
`apply_spreadsheet_delta`, `write_memo`.

**Core code**
```ts
// registration — src/features/node-agent/components/toolUIs.tsx:61
const ContextToolUI = makeAssistantToolUI<{ focus: string }, ContextToolResult>({
  toolName: "collect_context",

// invocation — src/features/node-agent/runtime/nodeAgentChatAdapter.ts:96-101
parts.set(id, { type: "tool-call", toolCallId: id, toolName, args });
yield snapshot();                                    // card appears, "working…"
await tick(360);
parts.set(id, { type: "tool-call", toolCallId: id, toolName, args, result: toolResult });
yield snapshot();                                    // same card, now filled in
```

Note what this is *not*: there is no tool-calling model, no schema registry, and
no dispatch table. The loop already ran (`runNodeAgent`); the adapter
replays its four results as tool calls so each one renders as it lands. An app
embedding NodeAgent supplies real tools through the `ToolRuntime` port in
`runtime/durableRuntime.ts`.

**Input** — the thread's messages, plus an `abortSignal`.
**Output** — a stream of message snapshots, each replacing the last.
**Failure behavior** — the abort signal is checked between steps
(`if (abortSignal.aborted) return`). There is no `try/catch`: a throw inside this
generator surfaces as an unhandled rejection, which is the gap Step 8 names.
**Next** — Step 7 is what the run writes to.

---

## Step 7 — What the run changes, and how the screen keeps up

**File:** `src/features/node-agent/graph/agentGraphSession.ts` and
`src/features/node-agent/components/GraphRailPanel.tsx`
**Symbol:** `graphSession`, `feedGatherStep` … `feedMemoStep`, `GraphRailPanel`
**Called by:** Step 6, after each completed step
**Calls next:** Step 8

**Why this exists**
Two different kinds of state change, and it matters which is which.

*Nothing is written to a database.* The corrected spreadsheet is a new object in
memory; reloading the page loses it. `runtime/durableRuntime.ts` defines a full
durable job/lease/journal layer with an in-memory reference adapter and a SQLite
one under `examples/adapters/sqlite-local/`, but **the browser app does not use
it** — it is exercised by `npm run nodeagent:durable:smoke` and its tests.

*The graph is the live artifact.* One `GraphSession` per page collects the
entities each step genuinely touched.

**Core code**
```ts
// src/features/node-agent/graph/agentGraphSession.ts:25, 58-62
export const graphSession = new GraphSession();

graphSession.observe(
  [roomEntity, questionEntity(result.question)],
  result.context.items.length,          // a real count, or undefined
  { eventId: `${runId}/gather/context` },
);
```

```tsx
// src/features/node-agent/components/GraphRailPanel.tsx:17-21
const snapshot = useSyncExternalStore(
  graphSession.subscribe, graphSession.getSnapshot, graphSession.getSnapshot,
);
```

The honesty contract is written at the top of `agentGraphSession.ts` and is worth
reading in full: a count is passed only when something was actually counted;
anything else renders as "unknown — not measured". `assertEdge` is never called,
because NodeAgent's citations lack the release/version field the receipt
requires — an acknowledged gap, not a faked receipt.

**Input** — each completed step's real result.
**Output** — a graph snapshot; `useSyncExternalStore` re-renders the rail.
**Failure behavior** — the rail renders a prompt when the graph is empty. Below
960px it becomes a bottom panel rather than being hidden — hiding it while React
still mounted the renderer is what caused the crash recorded as D1.
**Next** — Step 8 is what happens when this goes wrong.

---

## Step 8 — Failure and recovery, including what is missing

**File:** `src/features/node-agent/runtime/nodeAgentRuntime.ts`
**Symbol:** `safe`
**Called by:** every step in Step 5
**Calls next:** Step 9

**Why this exists**
One bad step must not take down the run. `safe()` catches, records the message on
that step, and returns a fallback so the remaining steps still execute and the
user still gets a memo that admits the gap.

**Core code**
```ts
// src/features/node-agent/runtime/nodeAgentRuntime.ts:171-181
function safe<T>(step: AgentStep, fn: () => T, fallback: T): T {
  try {
    const out = fn();
    if (step.status === "active") step.status = "done";
    return out;
  } catch (e) {
    step.status = "error";
    step.detail = e instanceof Error ? e.message : "step failed";
    return fallback;
  }
}
```

**Response recovery and remaining limits:**

- **Adapter failures are visible.** The existing assistant-ui runtime marks the
  response incomplete; the thread presents a constant failure message, marks
  unfinished tool cards failed, and offers explicit Retry. Earlier results stay.
- **Stop response ends display updates.** It preserves completed work and cannot
  undo computation already performed by the local adapter or external work.
  Retry replaces the current response through the native runtime, runs only on
  an explicit action, and rejects duplicate immediate activation.
- **Rendering exceptions remain separate.** There is still no React render-error
  boundary; a throw in a rendered child can unmount the app, as defect D1 showed.
- **"New Thread" does not exist here.** This runtime holds a single thread.
  Reload discards the browser conversation.

`promotion/PROMOTION_LOG.md` and `promotion/PRODUCT_GOAL.md` preserve their
historical defect reproductions and grades. Read `HANDOFF.md` for the current
D3 proof and remaining limits; no provider cancellation or full UI grade is
certified by this local response-recovery work.

**Input** — a step body that may throw.
**Output** — the fallback value, with the step marked `error`.
**Failure behavior** — this *is* the failure behavior.
**Next** — Step 9 is the proof that any of the above is true.

---

## Step 9 — The tests that prove this flow

**File:** `tests/nodeAgentRuntime.test.ts`, `e2e/capture-journey-at-width.mjs`
**Symbol:** `describe("canonical demo scenario")`
**Called by:** `npm test`, `npm run e2e:journey`
**Calls next:** — end of the walkthrough.

**Why this exists**
Steps 5 through 7 make claims about numbers. These re-derive them.

**Core code**
```ts
// tests/nodeAgentRuntime.test.ts:17-38
it("completes all four steps with status ok", () => { expect(result.status).toBe("ok"); });
it("synthesizes a high-confidence answer with the benchmark as winner", () => {
  expect(result.synthesis.sources.find((s) => s.winner)?.id).toBe("src_bench");
});
it("applies the versioned delta and recomputes runway to 18.0", () => {
  expect(result.modelDelta?.changes.find((c) => c.address === "B3")?.to).toBe(18);
});
```

To confirm these are not decorative: change `GROUNDING_THRESHOLD` in
`src/features/search/searchAndSynthesize.ts` from `0.34` to `0.99` and run
`npm test`. Seven assertions fail, across four of the seven test files
(`nodeAgentRuntime.test.ts` 3, `durableRuntime.test.ts` 2,
`reasoningFrameRunner.test.ts` 1, `sqliteDurableRuntime.test.ts` 1). Change it
back.

The browser check drives the real Vite server at a chosen width and asserts the
graph canvas is not zero-width — the root cause of D1, not its symptom:

```bash
npm run e2e:journey            # 1440x900
npm run e2e:journey:mobile     # 375x812
```

**Input** — the canonical scenario in
`src/features/node-agent/demoScenario.ts`, with a fixed clock so output is
byte-stable.
**Output** — 41 passing tests; PNG + JSON evidence under `promotion/evidence/`.
**Failure behavior** — non-zero exit; the JSON records `pageErrors`,
`consoleErrors`, `failedRequests` separately from third-party failures.

---

## Where to make your first change

| You want to… | Edit | Then run |
|---|---|---|
| Change what the agent says | `demoScenario.ts` | `npm run demo` |
| Change how sources are ranked | `searchAndSynthesize.ts` (`W_GROUNDING`, `W_RETRIEVAL`) | `npm test` |
| Change how a tool card looks | `components/toolUIs.tsx` | `npm run dev` |
| Add a fifth step | `nodeAgentRuntime.ts`, then a name in `toolUIs.tsx` **and** `nodeAgentChatAdapter.ts` | `npm test && npm run e2e:journey` |
| Change response recovery | `components/NodeAgentThread.tsx` + `components/toolUIs.tsx` | `node e2e/current-consumer-recovery-proof.mjs "<installed generated app>" "<new proof output>"` |

Adding a step means touching three files, and the two name lists in Step 6 must
agree. That is the sharpest edge in this codebase.
