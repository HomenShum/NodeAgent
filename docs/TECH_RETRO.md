# Technical Retrospective — NodeAgent as a career, compiled

NodeAgent is small on purpose. It's four capabilities and a loop. But each capability is the
production form of a problem I spent real years on, and the point of this document is to make
that lineage legible: *why these four, why this shape, and what each one is actually defending
against.*

I'm a builder-analyst — banking and finance, then data engineering, then agentic AI and the
product layer on top. The through-line across all of it has been the same instinct:
**context ingestion → structure → execution.** Take messy inputs, give them defensible
structure, and act on them. NodeAgent is that instinct with the edges sanded off.

---

## 1. Banking / finance → the versioned spreadsheet

**What the work taught me:** in a model that other people make decisions on, a wrong number is
not the expensive part. The expensive part is a number that *changed and nobody can say when,
why, or from what.* A silent overwrite is how a model loses its authority.

**How it shows up in the code:** [`spreadsheet/applySpreadsheetDelta.ts`](../src/features/spreadsheet/applySpreadsheetDelta.ts)
treats every edit as a `SpreadsheetDelta` applied with **optimistic concurrency**. The result is
a discriminated union — `ok`, version-`conflict`, or a bounded `error` — never a quiet success:

```ts
if (delta.baseVersion !== model.version) {
  return { ok: false, conflict: true, expected: delta.baseVersion, actual: model.version };
}
```

Apply a delta and you get an `AppliedDelta` with a `fromVersion → toVersion` bump and a
before/after for **every** cell that moved, including dependents the formula engine recomputed.
That audit is the whole point: the runway in the demo doesn't just become `18.0`, it becomes
`14.82 → 18.0` *because burn was corrected `510 → 420`*, and that's written down.

The formula evaluator is a tiny `eval`-free recursive-descent parser. That's a finance reflex
too: you don't hand an untrusted string to `eval` and you don't let a divide-by-zero quietly
become `Infinity`. It returns `null` and the cell keeps its last good value.

[`versionedSpreadsheetSync.ts`](../src/features/spreadsheet/versionedSpreadsheetSync.ts) is the
collaborative layer — two people editing at once. Disjoint edits auto-rebase and merge; edits
that actually contest the same cell surface a conflict for a human to resolve. Last-writer-wins,
but only *after* proving the writers didn't touch the same thing.

---

## 2. Data engineering → context gathering + grounded search

**What the work taught me:** the hard part of a pipeline isn't moving the data, it's deciding
what's *trustworthy* and what to *drop*. Recall is cheap; precision and honesty are expensive.
A pipeline that returns everything has just moved the problem downstream.

**How it shows up in the code, part one — gathering:**
[`chat/contextCollector.ts`](../src/features/chat/contextCollector.ts) turns a noisy room into a
small, ranked, **bounded** `ContextBundle`. Relevance is *computed* (token overlap, with light
stemming, plus signals for attachments and recency) — never assumed. When it hits `MAX_ITEMS` it
keeps the best and sets `truncated: true`. It tells you what it dropped.

**Part two — grounding.** [`search/searchAndSynthesize.ts`](../src/features/search/searchAndSynthesize.ts)
is a 4-layer pipeline, and the layer I care about most is the one that says *no*:

1. **Retrieval confidence** — `high` / `medium` / `low` from how many sources clear the grounding bar.
2. **Grounding filter** — per-source overlap with the query, computed deterministically.
3. **Synthesis** — extractive by default (pulls verbatim from grounded sources, so it *cannot*
   hallucinate); a live LLM is an injectable seam, not a hardcoded dependency.
4. **Citation chain** — every grounded source gets a `[n]` that points back to it.

On weak grounding the pipeline returns an **empty answer with an honest note**, not a confident
fabrication. The "right document for the right answer" is the highest-grounded source, marked
`winner` — and a high retrieval score can't rescue an off-topic source into that slot. There's a
test for exactly that. Separating the *deterministic* parts (ranking, grounding) from the *one*
stochastic part (generation) is the same separation-of-concerns a good data pipeline lives by.

---

## 3. Agentic AI → the runtime

**What the work taught me:** an agent is only as trustworthy as its worst silent failure. Models
read tool output literally. A fake `200`, an inflated score, an unbounded queue — each becomes a
false belief that propagates through the reasoning chain and amplifies under a loop.

**How it shows up in the code:** [`node-agent/runtime/nodeAgentRuntime.ts`](../src/features/node-agent/runtime/nodeAgentRuntime.ts)
is orchestrator-workers in miniature — `gather → search → model → memo` — and it is built to be
*boring under failure*. It never throws; a failing step is caught, marked `error`, and the loop
returns structured partial output so a swarm calling it doesn't lose a lane to a crash. The
overall status is honest:

```ts
const status = hadError ? (synthesis.answer ? "partial" : "error") : "ok";
```

The same loop runs two ways from one definition: **deterministically** (demo, no keys, injectable
clock — the prototype and the tests) and **live** (streaming, real keys, real retrieval). That
duality is deliberate. A demo you can't reproduce is a liability; a system you can only test live
is untestable.

---

## 4. The synthesis: why one loop instead of four tools

Any one of these surfaces is a feature. The thing I actually wanted to build is the *handoff
between them* — because that's where real work happens and where most tools drop the ball:

> A teammate's question in a room is only useful if it can pull the right document, and the
> document is only useful if it moves a number in the model, and the number is only useful if it
> lands in a memo someone can act on — **with the citation still attached.**

NodeAgent's loop is that handoff, made into a contract ([`AgentRunResult`](../src/features/node-agent/types/nodeAgentTypes.ts)).
The context the collector chose, the sources the search ranked, the delta the model took, and the
memo that came out the other side are all in one structured object you can inspect, replay, and
trust.

---

## 5. What's next (honest about the edges)

This is a portfolio-grade core, not the whole platform. The deliberate gaps:

- **Lexical grounding → embeddings.** The grounding metric is token overlap because it's
  deterministic and explainable. It's also why the demo sources share vocabulary with the
  question. Production swaps in embeddings via the same `synthesizer`/retrieval seam — the
  contract doesn't change.
- **The Convex schema is a contract, not a running backend here.** `convex/schema.ts` is real and
  typechecks; wiring `npx convex dev` + the live mutations is the next layer (the parent project
  has them).
- **TipTap rendering vs. the document model.** The notebook *model* is the tested core; the rich
  rendering (slash menu, block handles) lives in the prototype's UI layer and the React app.

The principle under all of it: **ship the honest core, make the seams visible, and let the tests
say what's true.** That's the part of the career I'd most want to be judged on.

— Homen Shum
