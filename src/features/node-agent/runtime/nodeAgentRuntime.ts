/**
 * NodeAgent runtime — the loop that makes four surfaces one agent.
 *
 * Orchestrator-workers in miniature: gather context from the room, search &
 * synthesize a grounded answer, apply a versioned model delta, write the memo.
 * Each step is bounded, each failure is surfaced (no step silently "succeeds"),
 * and the overall status is honest: `ok` only when every step completed.
 *
 * This is where eval/reliability discipline shows up as code — the same loop
 * runs live (streaming, real keys) or deterministically (demo, no keys).
 *
 * Prior art: Anthropic "Building Effective Agents" (orchestrator-workers);
 * NodeBench AI scratchpad-first pipeline. See .claude/rules/orchestrator_workers.md.
 */

import { collectContext } from "../../chat/contextCollector";
import { searchAndSynthesize, type SynthesizeOptions } from "../../search/searchAndSynthesize";
import { VersionedSpreadsheetSync } from "../../spreadsheet/versionedSpreadsheetSync";
import {
  appendParagraph,
  createNotebook,
  insertCitation,
  insertClaim,
} from "../../notebook/notebookEditor";
import type {
  AgentRunResult,
  AgentStep,
  AppliedDelta,
  RoomContext,
  SearchSource,
  SpreadsheetDelta,
  SpreadsheetModel,
  StepName,
} from "../types/nodeAgentTypes";

export interface RunInput {
  question: string;
  room: RoomContext;
  sources: SearchSource[];
  /** Optional model + delta to apply during the loop. */
  model?: SpreadsheetModel;
  modelDelta?: SpreadsheetDelta;
  memoTitle?: string;
  synthesize?: SynthesizeOptions;
  /** Injected clock for deterministic runs. */
  now?: number;
}

/**
 * Run the full agent loop. Always returns a result — never throws — so an agent
 * orchestrator calling this in a swarm gets structured partial output on failure
 * rather than a crash that takes down concurrent lanes (ERROR_BOUNDARY).
 */
export function runNodeAgent(input: RunInput): AgentRunResult {
  const now = input.now ?? Date.now();
  const steps: AgentStep[] = [];
  const mkStep = (name: StepName): AgentStep => {
    const s: AgentStep = { name, status: "active", detail: "", durationMs: 0 };
    steps.push(s);
    return s;
  };

  /* 1 — gather context from the room */
  const gather = mkStep("gather");
  const context = safe(
    gather,
    () => collectContext(input.room, input.question, { now }),
    {
      focus: input.question,
      items: [],
      activeParticipants: 0,
      truncated: false,
    },
  );
  gather.detail = `${context.items.length} context items · ${context.activeParticipants} active${context.truncated ? " · truncated" : ""}`;

  /* 2 — search & synthesize */
  const search = mkStep("search");
  const synthesis = safe(
    search,
    () => searchAndSynthesize(input.question, input.sources, input.synthesize),
    {
      query: input.question,
      confidence: "low" as const,
      answer: "",
      sources: [],
      citations: [],
      groundedCount: 0,
      note: "search step failed",
    },
  );
  if (synthesis.confidence === "low") {
    search.status = "error";
    search.detail = synthesis.note ?? "insufficient grounding";
  } else {
    search.detail = `${synthesis.groundedCount} grounded · confidence ${synthesis.confidence}`;
  }

  /* 3 — apply the versioned model delta (optional) */
  const modelStep = mkStep("model");
  let modelDelta: AppliedDelta | null = null;
  if (input.model && input.modelDelta) {
    const sync = new VersionedSpreadsheetSync(input.model);
    const outcome = sync.commit(input.modelDelta, now);
    if (outcome.ok) {
      modelDelta = outcome.applied;
      modelStep.detail = `v${outcome.applied.fromVersion} → v${outcome.applied.toVersion} · ${outcome.applied.changes.length} cells${outcome.rebased ? " · rebased" : ""}`;
      modelStep.status = "done";
    } else if (outcome.conflict) {
      modelStep.status = "error";
      modelStep.detail = `version conflict on ${outcome.cells.join(", ")}`;
    } else {
      modelStep.status = "error";
      modelStep.detail = outcome.error;
    }
  } else {
    modelStep.detail = "no model change requested";
    modelStep.status = "done";
  }

  /* 4 — write the memo */
  const memoStep = mkStep("memo");
  let memo = createNotebook(input.memoTitle ?? "Agent memo", now);
  memo = appendParagraph(memo, `The room asked: "${input.question}"`, now);
  if (synthesis.answer) {
    memo = insertClaim(
      memo,
      {
        text: stripMarkers(synthesis.answer),
        evidence: synthesis.citations,
        groundedRatio: `${synthesis.groundedCount}/${synthesis.sources.length}`,
      },
      now,
    );
    const winner = synthesis.sources.find((s) => s.winner) ?? synthesis.sources[0];
    if (winner) {
      memo = insertCitation(
        memo,
        { index: winner.citation, sourceId: winner.id, title: winner.title, url: winner.url },
        now,
      );
    }
  } else {
    memo = appendParagraph(memo, "No grounded answer was produced; manual review required.", now);
  }
  if (modelDelta) {
    const runway = modelDelta.changes.find((c) => c.address.toLowerCase().includes("runway"));
    memo = appendParagraph(
      memo,
      runway
        ? `Model updated to v${modelDelta.toVersion}: runway now ${runway.to}.`
        : `Model updated to v${modelDelta.toVersion} (${modelDelta.changes.length} cells).`,
      now,
    );
  }
  memoStep.detail = `${memo.blocks.length} blocks`;
  memoStep.status = "done";

  // Honest overall status.
  const hadError = steps.some((s) => s.status === "error");
  const status: AgentRunResult["status"] = hadError
    ? synthesis.answer
      ? "partial"
      : "error"
    : "ok";

  return { question: input.question, steps, context, synthesis, modelDelta, memo, status };
}

/** Run a step body; on throw, mark the step errored and fall back. */
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

function stripMarkers(answer: string): string {
  // Keep the prose, drop nothing — the [n] markers ARE the citation chain.
  return answer.trim();
}
