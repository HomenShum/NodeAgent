/**
 * One GraphSession per app session — the data source for the live graph rail.
 *
 * Honesty contract (inherited from @homenshum/nodegraph-live):
 *   - Every entity observed here ACTUALLY appears in that step's real data:
 *     the room, its participants, the sources the search step retrieved, the
 *     spreadsheet the delta touched, the memo that was written.
 *   - No invented counts. A `measuredCount` is passed ONLY when the host
 *     genuinely counted it (context items selected, cells changed, citations
 *     written). Everything else is `undefined` and renders as
 *     "unknown — not measured".
 *   - Two entities + a measured count → evidence edge. Three or more
 *     participants → traversal history only. The session enforces this.
 *   - `assertEdge` is NEVER called: NodeAgent's `Citation` carries
 *     source name + stable ids + (sometimes) a URL, but has NO release/version
 *     field, so no citation can satisfy the full AssertionReceipt
 *     (source + release + two stable ids + http(s) URL). That is an API gap in
 *     NodeAgent's citation type, not a reason to fake a receipt.
 */

import { GraphSession, type EntityRef } from "../../../../vendor/nodegraph-live/index.js";
import type { AgentRunResult, RoomContext, SpreadsheetModel } from "../types/nodeAgentTypes";

/** The single per-app-session graph. Subscribed via useSyncExternalStore. */
export const graphSession = new GraphSession();

let runCounter = 0;
/** Stable per-run id; step eventIds derive from it so replays dedupe. */
export const nextGraphRunId = (): string => {
  runCounter += 1;
  return `run-${runCounter}`;
};

const questionEntity = (question: string): EntityRef => ({
  kind: "question",
  label: question,
});

/** Step 1 — gather: the room and the people who are actually in it. */
export function feedGatherStep(runId: string, room: RoomContext, result: AgentRunResult): void {
  const roomEntity: EntityRef = {
    kind: "room",
    label: room.roomCode,
    // Measured: the room really holds this many messages.
    count: room.messages.length,
  };
  const participants: EntityRef[] = room.participants.map((p) => ({
    kind: p.role === "agent" ? "agent" : "person",
    label: p.name,
    // No per-person measurement exists — render "unknown — not measured".
  }));
  // room + N participants (>= 3 total) → traversal history, never evidence.
  graphSession.observe([roomEntity, ...participants], undefined, {
    eventId: `${runId}/gather/room`,
  });
  // Measured pair: the collector counted how many context items in this room
  // are relevant to the question. Two entities + a real count → evidence.
  graphSession.observe(
    [roomEntity, questionEntity(result.question)],
    result.context.items.length,
    { eventId: `${runId}/gather/context` },
  );
}

/** Step 2 — search: the sources the retrieval set actually contained. */
export function feedSearchStep(runId: string, result: AgentRunResult): void {
  const sources: EntityRef[] = result.synthesis.sources.map((s) => ({
    kind: "source",
    label: s.title,
    // retrievalScore/grounding are scores, not counts — no measured magnitude.
  }));
  if (sources.length === 0) return;
  // question + M sources (>= 3 participants) → traversal only.
  graphSession.observe([questionEntity(result.question), ...sources], undefined, {
    eventId: `${runId}/search/sources`,
  });
}

/** Step 3 — model: the sheet the versioned delta actually touched. */
export function feedModelStep(runId: string, model: SpreadsheetModel, result: AgentRunResult): void {
  const applied = result.modelDelta;
  if (!applied) return;
  const sheet: EntityRef = {
    kind: "sheet",
    label: model.name,
    // Measured: the sheet really has this many cells.
    count: Object.keys(model.cells).length,
  };
  const author: EntityRef = { kind: "agent", label: applied.author };
  // Measured pair: the applied delta changed exactly this many cells
  // (including recomputed dependents) — evidence edge with that weight.
  graphSession.observe([sheet, author], applied.changes.length, {
    eventId: `${runId}/model/delta-v${applied.toVersion}`,
  });
}

/** Step 4 — memo: the notebook written, and the sources it actually cites. */
export function feedMemoStep(runId: string, result: AgentRunResult): void {
  const memo: EntityRef = {
    kind: "memo",
    label: result.memo.title,
    // Measured: the memo really contains this many blocks.
    count: result.memo.blocks.length,
  };
  // memo ↔ question with no measured conjunction → traversal telemetry.
  graphSession.observe([memo, questionEntity(result.question)], undefined, {
    eventId: `${runId}/memo/question`,
  });
  // Count real citations per source across claim evidence + citation blocks.
  const citationsBySource = new Map<string, { title: string; count: number }>();
  for (const block of result.memo.blocks) {
    for (const cite of block.evidence ?? []) {
      const entry = citationsBySource.get(cite.sourceId) ?? { title: cite.title, count: 0 };
      entry.count += 1;
      citationsBySource.set(cite.sourceId, entry);
    }
  }
  for (const [sourceId, { title, count }] of citationsBySource) {
    // Measured pair: the memo cites this source exactly `count` times.
    graphSession.observe([memo, { kind: "source", label: title }], count, {
      eventId: `${runId}/memo/cite/${sourceId}`,
    });
  }
}
