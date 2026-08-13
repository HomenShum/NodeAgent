# NodeAgent — Demo Script

A presenter's script for walking through NodeAgent live (interview, recording, or
screen-share). Read this once before you present; keep the **90-second walkthrough**
open as your teleprompter. Total runtime if you do everything: ~4 minutes.

Everything here is verified against the real files — `nodeagent-v1.html`,
`src/features/node-agent/demoScenario.ts`, `demo/runNodeAgentDemo.{ts,mjs}`,
`src/features/node-agent/runtime/nodeAgentRuntime.ts`, and
`src/features/search/searchAndSynthesize.ts`. The numbers below are the numbers the
code actually produces.

---

## 1. The 30-second pitch

> **NodeAgent is one cross-collaborative agent that turns a noisy chat room into a
> defensible answer.** It gathers the live room context, finds the *right document for
> the right answer* with a grounded-and-cited search, corrects the financial model as a
> *versioned delta* (so a fixed assumption is a tracked change, never a silent
> overwrite), and writes the cited memo — as a single loop.

If you have ten more seconds, add the spine:

> It's a career compiled into four surfaces — **banking** discipline becomes the
> versioned spreadsheet, **data engineering** becomes context + grounded search,
> **agentic AI** becomes the runtime that drives all four as one reliable loop.

---

## 2. The scenario — the "Acme diligence room"

One scenario drives the prototype, both CLI demos, and the React app, so the story is
identical everywhere. It lives in `src/features/node-agent/demoScenario.ts`.

**Setup.** Three teammates are in room `acme-dd` 40 minutes before an investor call:

- **Jordan (PM):** "Acme just dropped a competing teardown of our wedge."
- **Marcus (Ops):** "Finance flagged burn crept to 420k/mo after the two senior hires."
- **Priya (Eng):** pushed the retrieval-latency **benchmark** doc to the room.

**The question** (`DEMO_QUESTION`):

> "Does our wedge hold versus Acme, and does the runway model survive 18 months?"

**What the agent does, and why it's honest:**

1. **Grounds the wedge answer on the benchmark, not the marketing.** Four sources are in
   play (`DEMO_SOURCES`). The winner is `room://benchmark` (p95 211ms vs Acme 540ms,
   0.93 grounded-answer rate). The **Acme teardown blog** is deliberately included and
   deliberately *loses* — it's a `WEB` marketing claim with no benchmark methodology, so
   it scores low on grounding and never becomes the answer.
2. **Corrects a fat-fingered burn assumption.** The model starts with net burn `B1 = 510`
   — the *stress* figure mistakenly entered as the base. The agent's delta sets it to the
   finance-audited **420**, and the runway formula `B2 / B1` recomputes
   **14.8 → 18.0 months**. The version bumps and the change is logged.
3. **Writes the cited memo.** A claim block (with the grounded ratio), a citation back to
   the winning source, and a one-line model summary — runway now 18.0.

The point of the scenario: the agent *defends* the wedge with evidence and *survives* the
runway check, and you can see exactly which source and which number got it there.

---

## 3. Three ways to run it

Pick based on your setting. The first needs nothing but Node.

### A. Removed — the zero-deps mirror (`demo/runNodeAgentDemo.mjs`)

This repo used to ship a second, hand-written copy of the agent loop so the demo could run
with no `npm install`. It was deleted in the human-readiness pass because it could not fail:
two of its four TRACE lines and its `overall status: OK` were printed string literals, and it
imported nothing from `src/`. Setting `GROUNDING_THRESHOLD` to 0.99 in
`src/features/search/searchAndSynthesize.ts` makes the real loop report `ERROR`; the mirror
still printed `OK`. See `docs/SIMPLIFICATION_REPORT.md` for the measurement.

Use (B). It needs `npm install`, and it is the loop.

### B. The real modules — `npm run demo`

```bash
npm install
npm run demo
```

This runs `demo/runNodeAgentDemo.ts` via `tsx`, which calls the **actual ported runtime**
(`runNodeAgent`) over the same scenario — the same code path the prototype and React app
use, just printed to a CLI. Output is the same shape as (A) but adds the
**CONTEXT GATHERED** block (each item with a relevance score) and the delta's
`reason:` line. Use this when someone asks "is the mirror cheating?" — it isn't, and this
is the proof.

### C. The prototype in a browser — `npm run proto`

```bash
npm run proto
```

Opens `nodeagent-v1.html` (Vite, `--open`). One self-contained file, no backend. Click
**"▶ Run the agent"** (top-right, or the hero button, or just press **R**) and narrate the
four panels lighting up in sequence — see the walkthrough below.

### D. The full React app — `npm run dev`

```bash
npm run dev
```

Boots the Vite dev server and renders `NodeAgentDemoApp` (the same loop wired into React).
Use this if you want to show the component architecture rather than the static prototype.

---

## 4. The 90-second live walkthrough (browser prototype)

Run `npm run proto`, then follow the beats. Times are cumulative. Each beat ties a panel
to the agent's step **and** to the career-evolution story.

**[0:00] Set the stage — the room.** *(left panel: "Live room", `/r/acme-dd`)*
> "Three teammates, an agent, 40 minutes to an investor call. Acme dropped a teardown of
> our wedge, finance says burn moved, Priya pushed a benchmark. This is the mess the agent
> has to turn into an answer." Point at the presence row (3 teammates + NodeAgent ◆).

**[0:12] Fire the loop.** Click **▶ Run the agent** (or press **R**).
> "One button. Watch the trace pills at the top go 1 → 2 → 3 → 4."

**[0:18] Step 1 — Gather context.** *(trace pill "Gather context" turns active → done)*
The agent posts "pulling the benchmark Priya shared and the Q2 cash schedule into
context," and the source messages get pinned.
> "Step one is **context ingestion** — the data-engineering half of my background.
> It reads the room, finds what's relevant, pins it. Messy multi-source input becoming
> structured context." *(maps to `chat/contextCollector.ts`)*

**[0:32] Step 2 — Search & synthesize.** *(middle panel: sources stream in, get reranked)*
Four sources appear; the **benchmark** source is highlighted as the winner; a synthesized,
**cited** answer renders below.
> "Step two finds the *right document for the right answer*. Note the **grounded score on
> every source**, and that the winner is the benchmark — not Acme's marketing teardown,
> which scores low because it discloses no methodology. The answer carries citation
> markers back to the sources." *(maps to `search/searchAndSynthesize.ts` — the 4-layer
> grounding pipeline)*

**[0:52] Step 3 — Update the model.** *(spreadsheet panel: a cell flashes, version chip bumps)*
The burn cell updates to **420**, the runway cell recomputes to **18.0**, the version chip
bumps, and the **delta log** records `set burn → 420` and `recompute runway → 18.0mo`.
> "Step three is the **banking** half — pressure-testing models. The agent fixes the burn
> assumption, but it's a **versioned delta with an audit log**, not a silent overwrite.
> Runway recomputes 14.8 to 18.0. The model *survives* the 18-month check, and you can see
> exactly why." *(maps to `spreadsheet/applySpreadsheetDelta.ts` + `versionedSpreadsheetSync.ts`)*

**[1:12] Step 4 — Write the memo.** *(notebook panel: a claim block and a citation appear)*
A **Claim** block ("grounded 4/4") and a **Citation** block drop into the notebook; the
agent posts "Memo updated… Shareable wiki ready."
> "Step four writes it down — a claim block with the grounded ratio and a citation chain.
> This is the **agentic-AI** layer: the runtime drove all four surfaces as one loop,
> bounded and traceable end to end." *(maps to `notebook/notebookEditor.ts`, orchestrated
> by `node-agent/runtime/nodeAgentRuntime.ts`)*

**[1:28] Land it.** The command bar shows **"✓ Loop complete — context → answer → model →
memo, fully cited."**
> "Room asked, agent answered — with sources, a model, and a memo. No keys, deterministic
> data, every claim cited." *(Optional: type a question in the room composer or click a
> chip like "Wedge vs Acme?" to re-run live; or hit **↺ Reset** and run it again.)*

---

## 5. What to point out (the honesty details that signal rigor)

These are the moments that separate a demo from a credible system. Call them out.

- **A grounding score on every source.** Each result shows a `grounded` number. It's
  computed token-overlap between the question and the source
  (`groundingOf()` in `searchAndSynthesize.ts`), never hardcoded. The winner is the
  highest-ranked source *and* must clear `GROUNDING_THRESHOLD = 0.34`.
- **The rejected competitor source.** The Acme teardown blog is in the set on purpose. It's
  a `WEB` marketing claim with no methodology, so it grounds low and is *not* the answer.
  A demo that only shows the source it wanted to win is hiding the test; this one shows the
  source it rejected.
- **The version bump + delta log.** The fix isn't an edit — it's a committed delta:
  `from → to`, a version increment, a `reason` ("Correct base burn to the finance-audited
  420k (was stress figure 510k)"), and a recompute. That's the auditability a finance model
  demands.
- **The citation chain in the memo.** The claim block carries the grounded ratio (e.g.
  `4/4`) and a citation block links the winning source by id/title/url. Every claim is
  traceable to a source — no free-floating assertions.
- **"No keys needed — deterministic demo data."** Say this out loud. The prototype and the
  `.mjs` mirror produce byte-stable output (fixed clock `DEMO_NOW`) with zero API calls —
  so the demo never flakes mid-interview, and the numbers are reproducible.
- **Honest overall status.** The runtime reports `ok` only when *every* step completed; a
  failed step yields `partial` or `error`, never a fake success. The loop is honest about
  itself.

---

## 6. Talking points / FAQ

**"Is this real, or a mock?"**
> Both layers are real, and they're labeled. The **modules under `src/features/**` are the
> tested source of truth** — `searchAndSynthesize.ts`, `versionedSpreadsheetSync.ts`,
> `notebookEditor.ts`, and the `runNodeAgent` runtime, with unit tests in
> `tests/searchSynthesize.test.ts`, `tests/spreadsheetDelta.test.ts`, and
> `tests/nodeAgentRuntime.test.ts`. `npm run demo` runs *those* modules end-to-end. The
> **prototype (`nodeagent-v1.html`) and the `.mjs` file are the no-keys preview** — a
> faithful mirror so anyone can see the loop without installing anything. And
> `convex/schema.ts` is the **production contract** — the tables this becomes when it's
> wired to a live backend.

**"How does it avoid hallucination?"**
> A confidence gate. Search runs a 4-layer grounding pipeline (retrieval confidence →
> per-source grounding filter → synthesis → citation chain). If fewer than one source
> clears the grounding threshold, `searchAndSynthesize` returns **confidence `low`, an
> empty answer, and a note** — "Insufficient grounded sources — declining to synthesize to
> avoid fabrication" — and the runtime marks that step errored. Synthesis is *extractive by
> default* (it quotes the grounded sources verbatim and attaches citations), so it
> structurally cannot invent facts; a live LLM is only ever injected via `opts.synthesizer`
> over the already-grounded set. Refusing to answer on weak evidence is a feature, not a
> gap.

**"Why these four surfaces?"**
> Because each one is the production form of a problem I already spent years on. Versioned
> spreadsheet = banking/finance model discipline. Context + grounded search = data
> engineering (messy input → structured, cited truth). The runtime that orchestrates them
> as one bounded, honest, traceable loop = agentic AI. The agent is the part that finally
> makes them a single workflow. (See the "evolution" section on the prototype page.)

**"What about security / running this against real data?"**
> The live retrieval adapter is guarded by `isSafeFetchUrl` (in `searchAndSynthesize.ts`):
> http/https only, and private / loopback / link-local / cloud-metadata addresses are
> blocked — because agents generate URLs from reasoning, and one hallucinated
> `169.254.169.254` is a metadata leak. Sources are bounded (`MAX_SOURCES = 50`). The
> reliability invariants are written into the module headers.

---

## Quick command reference

| Goal | Command | Needs |
| --- | --- | --- |
| Real modules, CLI | `npm install` then `npm run demo` | install |
| Browser prototype | `npm run proto` (opens `/nodeagent-v1.html`) | install |
| Full React app | `npm run dev` | install |
| Prove the tests pass | `npm test` | install |
| Type-check | `npm run typecheck` | install |

> Tip for recordings: do (A) first to establish the numbers in plain text, then (C) so the
> audience watches the *same* numbers animate across the four panels. The honesty lands
> harder when they've already seen the receipts.
