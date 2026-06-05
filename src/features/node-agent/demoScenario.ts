/**
 * The canonical demo scenario — "Acme diligence room".
 *
 * One scenario drives the prototype, the demo runners, and the React app so the
 * story stays consistent everywhere. A teammate asks whether the wedge holds
 * and whether the model survives an 18-month runway; the agent gathers context,
 * grounds an answer, corrects a fat-fingered burn assumption (510 → 420 -> the
 * runway recomputes 14.8 → 18.0), and writes the cited memo.
 */

import { createModel } from "../spreadsheet/applySpreadsheetDelta";
import type { SearchSource } from "./types/nodeAgentTypes";
import type { RunInput } from "./runtime/nodeAgentRuntime";

/** Fixed timestamp so demo output is byte-stable across runs. */
export const DEMO_NOW = 1_750_000_000_000;
const MIN = 60_000;

export const DEMO_QUESTION =
  "Does our wedge hold versus Acme, and does the runway model survive 18 months?";

export const DEMO_SOURCES: SearchSource[] = [
  {
    id: "src_bench",
    kind: "RAG",
    title: "room://benchmark — wedge holds vs Acme on latency",
    snippet:
      "Defends the wedge: NodeAgent retrieval latency p95 211ms versus Acme 540ms on the shared eval set; grounded answer rate 0.93 across 103 queries.",
    retrievalScore: 0.91,
  },
  {
    id: "src_finance",
    kind: "DOC",
    title: "finance://burn — runway model",
    snippet:
      "Cash on hand 7.56M dollars; net burn 420k dollars per month base case; the runway model survives 18 months after the two senior hires.",
    retrievalScore: 0.62,
  },
  {
    id: "src_diligence",
    kind: "DOC",
    title: "diligence://wedge — competitive note",
    snippet:
      "Our wedge versus Acme holds on the shared latency benchmark; grounded retrieval is the defensible moat.",
    retrievalScore: 0.5,
  },
  {
    id: "src_teardown",
    kind: "WEB",
    title: "Acme teardown blog — Why context rooms lose",
    snippet:
      "Marketing claim that shared rooms cannot scale; no benchmark methodology and no shared eval set disclosed.",
    url: "https://example.com/acme-teardown",
    retrievalScore: 0.62,
  },
];

/**
 * Build the full RunInput. The model starts with a wrong base burn (510, the
 * stress figure mistakenly entered as base) so the agent's delta produces a
 * real, visible recompute.
 */
export function buildDemoScenario(now: number = DEMO_NOW): RunInput {
  const model = createModel(
    {
      id: "runway",
      name: "Cash-runway sensitivity",
      cells: [
        { address: "B1", label: "Net burn / mo ($k)", value: 510 },
        { address: "B2", label: "Cash on hand ($k)", value: 7560 },
        { address: "B3", label: "Runway (months)", formula: "B2 / B1" },
      ],
      now,
    },
  );

  return {
    question: DEMO_QUESTION,
    now,
    memoTitle: "Acme — diligence memo",
    room: {
      roomCode: "acme-dd",
      participants: [
        { id: "u_jordan", name: "Jordan (PM)", role: "human", lastSeenAt: now - 1 * MIN },
        { id: "u_priya", name: "Priya (Eng)", role: "human", lastSeenAt: now - 2 * MIN },
        { id: "u_marcus", name: "Marcus (Ops)", role: "human", lastSeenAt: now - 30 * MIN },
        { id: "agent", name: "NodeAgent", role: "agent", lastSeenAt: now },
      ],
      messages: [
        {
          id: "m1",
          authorId: "u_jordan",
          authorName: "Jordan (PM)",
          role: "human",
          text: "Acme just dropped a competing teardown of our wedge. Investor call is in 40.",
          createdAt: now - 4 * MIN,
        },
        {
          id: "m2",
          authorId: "u_marcus",
          authorName: "Marcus (Ops)",
          role: "human",
          text: "Finance flagged burn crept to 420k/mo after the two senior hires.",
          createdAt: now - 3 * MIN,
        },
        {
          id: "m3",
          authorId: "u_priya",
          authorName: "Priya (Eng)",
          role: "human",
          text: "I pushed the retrieval-latency benchmark doc to the room earlier.",
          createdAt: now - 2 * MIN,
          attachmentRef: "room://benchmark",
        },
      ],
    },
    sources: DEMO_SOURCES,
    model,
    modelDelta: {
      baseVersion: model.version,
      author: "NodeAgent",
      reason: "Correct base burn to the finance-audited 420k (was stress figure 510k).",
      ops: [{ kind: "set", address: "B1", value: 420 }],
    },
  };
}
