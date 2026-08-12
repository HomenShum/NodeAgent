# Graph integration: what the live rail claims, and what it refuses to claim

NodeAgent's right rail renders a live session graph while the agent loop runs.
This document is the honesty audit of that wiring: which loop events feed the
graph, which numbers on it were genuinely measured by the host, which trust
class each relationship earns under the renderer's grammar, and — just as
deliberately — what the integration refuses to draw because the host's types
cannot yet back the claim.

The renderer is a vendored build of `@homenshum/nodegraph-live`
(`vendor/nodegraph-live/`). Its epistemic grammar is fixed in
`vendor/nodegraph-live/graph-model.d.ts`: exactly three edge types, and the
distinction is the point of the library —

- **`evidence`** — a MEASURED relationship; the weight came from a real count
  and owns the width channel.
- **`traversal`** — interaction history; telemetry about us, not evidence
  about the world; constant width, lighter ink.
- **`assertion`** — a curated claim carrying a complete replay receipt
  (`AssertionReceipt`: source + release + two stable ids + http(s) URL),
  rendered with a release badge.

The admission rule is enforced by `GraphSession.observe()` in
`vendor/nodegraph-live/session.d.ts`:

> Exactly two participants plus a measured conjunction produce evidence.
> Three or more participants, or a pair with no measurement, produce only
> traversal telemetry. A measured zero still produces evidence weight 0.

The host-side wiring lives in one file,
`src/features/node-agent/graph/agentGraphSession.ts` (one `GraphSession` per
app session), and is invoked from the assistant-ui adapter
`src/features/node-agent/runtime/nodeAgentChatAdapter.ts` after each loop step
completes. The rail itself
(`src/features/node-agent/components/GraphRailPanel.tsx`) subscribes via
`useSyncExternalStore` and exposes `data-entities` / `data-edges` attributes so
the e2e gates can fail on an empty rail.

## (a) The host's event taxonomy

The loop (`runNodeAgent`, driven by `nodeAgentChatAdapter.ts`) has four steps:
gather → search/synthesize → model delta → memo. Each completed step calls one
`feed*Step` function, which emits one or more `observe()` events. Every entity
listed below actually appears in that step's real data — nothing is inferred.

| Loop step (event id) | Entities extracted | Genuinely measured? | Trust class earned, and why |
|---|---|---|---|
| **Gather** — `{run}/gather/room` | `room` (label = `roomCode`) + one `person`/`agent` node per participant | Node count on the room only: `room.messages.length` (the room really holds that many messages). Participants carry **no** count — no per-person measurement exists, so they render "unknown — not measured". | **Traversal.** Room + N participants is ≥ 3 participants in one observation; the session grammar forbids evidence for group events. |
| **Gather** — `{run}/gather/context` | `room` + `question` | Yes: `result.context.items.length` — the collector genuinely counted how many context items in this room are relevant to the question (`ContextBundle.items`, `nodeAgentTypes.ts`). | **Evidence.** Exactly two entities + a real count → measured edge; the count becomes the edge weight. |
| **Search** — `{run}/search/sources` | `question` + one `source` node per retrieved source (`result.synthesis.sources`) | No. Sources carry `retrievalScore` and `grounding` — those are **scores, not counts**, and are deliberately not laundered into a measured magnitude (comment in `agentGraphSession.ts`). | **Traversal.** Question + M sources is ≥ 3 participants, and no measured conjunction exists anyway. |
| **Model** — `{run}/model/delta-v{N}` | `sheet` (label = `model.name`) + `agent` (the delta's author) | Yes, twice: the sheet node's count is `Object.keys(model.cells).length` (the sheet really has that many cells), and the edge weight is `applied.changes.length` — the applied delta changed exactly that many cells, including recomputed dependents (`AppliedDelta`, `nodeAgentTypes.ts`). | **Evidence.** Two entities + a genuine count. The event id embeds the delta's `toVersion`, so a replayed delta dedupes instead of double-counting. |
| **Memo** — `{run}/memo/question` | `memo` (label = memo title) + `question` | Node count on the memo only: `result.memo.blocks.length` (the memo really contains that many blocks). The memo↔question pair itself has no measured conjunction. | **Traversal.** A pair with no measurement is telemetry, not evidence. |
| **Memo** — `{run}/memo/cite/{sourceId}` | `memo` + one `source` per cited source | Yes: citations are counted per source across the memo's claim-block `evidence` arrays (`NotebookBlock.evidence: Citation[]`) — "the memo cites this source exactly `count` times". | **Evidence.** One edge per (memo, source) pair, each with its own genuine citation count as weight. |

Two structural notes on the wiring, both visible in `agentGraphSession.ts`:

- **Event ids are replay-stable.** Every `observe()` carries an `eventId`
  derived from a per-run id (`run-N/step/detail`), so re-feeding the same step
  is a dedupe, not a strengthening — the renderer's `seen` receipt map treats
  a reused id with new content as a conflict, not a duplicate.
- **`assertEdge` is never called.** The session's third trust class is
  unreachable from this host today, on purpose. See (c) for exactly why.

## (b) What today's wiring feeds vs. what it deliberately refuses

What it feeds: real entities from real step payloads, with measured counts
attached only where a count genuinely exists in the host's data. The commit
that wired this in (`631be932`, "Wire the NodeGraph Live renderer into the live
agent loop as a graph rail") states the contract in its own words:

> One GraphSession per app session; every step of the real loop (gather ->
> cited answer -> versioned delta -> memo) feeds session.observe() with the
> entities that actually appear in that step's data, under the renderer's
> honesty grammar: measured counts only where the host genuinely counted
> (context items, cells changed, citations written), undefined everywhere
> else, and no assertEdge calls because NodeAgent citations carry no
> release/version field to satisfy a full AssertionReceipt.

Unpacked, that is three standing refusals:

1. **No laundered scores.** `RankedSource.retrievalScore`, `grounding`, and
   `rankScore` (all 0..1 floats, `nodeAgentTypes.ts`) are never passed as
   `measuredCount` or node `count`. A relevance score is a model's opinion; a
   count is a fact about data. The renderer gives measured magnitudes the
   width channel, so smuggling a score in as a count would make an opinion
   look like a measurement.
2. **`undefined` everywhere the host did not count.** Participants, sources,
   and the question node carry no `count`, and the renderer displays them as
   "unknown — not measured" rather than inventing a default. A measured zero
   and an unknown are different claims, and the wiring preserves that.
3. **No `assertEdge` without a full receipt.** The renderer accepts a curated
   assertion only with a complete `AssertionReceipt` — `source`, `release`,
   `subjectId`, `objectId`, and a literal http(s) `url`
   (`graph-model.d.ts`). NodeAgent's `Citation` cannot supply `release`, so
   the wiring emits zero assertion edges rather than fabricating a receipt.
   The header comment of `agentGraphSession.ts` names this precisely: "That is
   an API gap in NodeAgent's citation type, not a reason to fake a receipt."

## (c) Named API gaps, with the exact change that unlocks the next trust class

**Gap 1 — `Citation` has no release/version field (blocks all assertion
edges).** The type is `Citation` in
`src/features/node-agent/types/nodeAgentTypes.ts` (line ~94):

```ts
export interface Citation {
  index: number;
  sourceId: string;
  title: string;
  url?: string;
}
```

`AssertionReceipt` requires `{ source, release, subjectId, objectId, url }`.
From a memo claim block, `subjectId` (the block's `id`) and `objectId`
(`cite.sourceId`) already exist, and `source` can be the source's `kind` or
title. The two missing pieces are both on `Citation`:

- add `release: string` — the versioned snapshot of the source the citation
  was made against (a document version, an index build id, a filing accession
  number — whatever the retrieval layer can actually vouch for), and
- make `url` required (or gate assertion emission on its presence): today it
  is optional, and a receipt without a literal http(s) URL is not replayable.

With those two fields populated by the search/synthesis layer, `feedMemoStep`
could emit `assertEdge(memo, source, receipt)` per citation and the rail would
gain its third trust class — curated claims with a release badge — without
weakening the grammar.

**Gap 2 — `SynthesisResult.groundedCount` exists but is not plumbed.** The
host genuinely counts how many retrieved sources cleared the grounding
threshold (`groundedCount`, `nodeAgentTypes.ts`), but `feedSearchStep` emits
only the unmeasured question+sources fan-out. A two-entity observation —
question ↔ a "grounded set" entity, or question ↔ winner source with
`measuredCount = groundedCount` — would turn one real, already-produced count
into an evidence edge that today evaporates.

**Gap 3 — per-participant message counts exist in the data but not as
counts.** `RoomContext.messages` carries `authorId` on every message, so
"this participant wrote N messages in this room" is one `filter().length` away
— a genuine count that would give person nodes a measured magnitude and each
(room, person) pair an evidence edge. Today participants render "unknown — not
measured" because nothing counts for them, not because nothing could.

**Gap 4 — `ContextBundle.activeParticipants` is measured and dropped.** The
collector counts active participants within the presence TTL window, but the
number reaches no entity and no edge. It is a real measurement about the room
at gather time; attaching it anywhere honest requires deciding what entity it
measures (it is not `room.messages.length`, and a node carries one count).

## (d) The next honest upgrade

The cheapest real upgrade is Gap 2 plus Gap 3: both counts already exist in
the loop's own payloads, so plumbing them is wiring, not new measurement — the
search step gains a question↔winner evidence edge weighted by
`groundedCount`, and the gather step gains per-person message counts, which
together remove most "unknown — not measured" labels without a single invented
number. The upgrade that changes the graph's epistemic ceiling, though, is Gap
1: adding `release` to `Citation` (and requiring `url`) at the point of
retrieval lets the memo step emit true assertion edges with complete replay
receipts, which is the difference between "the memo cites this source three
times" (evidence about the memo) and "this claim is backed by version X of
source Y, re-openable at this URL" (a curated, replayable claim about the
world). That field has to be populated by whatever the retrieval layer can
actually vouch for — shipping it as an empty string would be exactly the faked
receipt the current wiring refuses to write.
