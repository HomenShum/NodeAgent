/**
 * NodeAgent <-> assistant-ui bridge.
 *
 * A `ChatModelAdapter` for assistant-ui's `useLocalRuntime`. When the user sends
 * a message, this runs the real NodeAgent loop (gather -> search -> model ->
 * memo) and streams it back as an assistant message whose work renders inline
 * as four **tool UIs** — exactly the assistant-ui generative-UI pattern.
 *
 * No backend, no keys: the loop is deterministic over the demo scenario. Swap in
 * a real model by replacing this adapter with `useChatRuntime` (AI SDK) or a
 * fetch-backed adapter — the tool UIs and the modules stay identical.
 *
 * Prior art: assistant-ui LocalRuntime / ChatModelAdapter
 * (https://github.com/assistant-ui/assistant-ui). See docs/ARCHITECTURE.md.
 */

import type { ChatModelAdapter } from "@assistant-ui/react";
import { runNodeAgent } from "./nodeAgentRuntime";
import { applySpreadsheetDelta } from "../../spreadsheet/applySpreadsheetDelta";
import { buildDemoScenario, DEMO_QUESTION } from "../demoScenario";
import {
  feedGatherStep,
  feedMemoStep,
  feedModelStep,
  feedSearchStep,
  nextGraphRunId,
} from "../graph/agentGraphSession";
import type {
  ContextBundle,
  NotebookDoc,
  SpreadsheetModel,
  SynthesisResult,
  AppliedDelta,
} from "../types/nodeAgentTypes";

/** Result payloads the four tool UIs receive (typed end to end). */
export type ContextToolResult = ContextBundle;
export type SearchToolResult = SynthesisResult;
export type ModelToolResult = { applied: AppliedDelta | null; model: SpreadsheetModel };
export type MemoToolResult = NotebookDoc;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function lastUserText(messages: readonly { role: string; content: readonly unknown[] }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = (m.content as Array<{ type?: string; text?: string }>)
      .filter((p) => p?.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join(" ")
      .trim();
    if (text) return text;
  }
  return "";
}

export const nodeAgentChatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const question = lastUserText(messages) || DEMO_QUESTION;

    // Run the real loop, then derive the post-delta model for the model tool UI.
    const scenario = { ...buildDemoScenario(), question };
    const result = runNodeAgent(scenario);
    let model = scenario.model!;
    if (scenario.modelDelta) {
      const r = applySpreadsheetDelta(model, scenario.modelDelta, scenario.now);
      if (r.ok) model = r.model;
    }

    const reduced = prefersReducedMotion();
    const tick = (ms: number) =>
      new Promise<void>((res) => setTimeout(res, reduced ? 0 : ms));

    // Ordered map of tool-call parts; each yield replaces content cumulatively.
    const parts = new Map<string, Record<string, unknown>>();
    let lead =
      "On it — pulling the room context, then searching, updating the model, and writing the memo.";

    const snapshot = () => ({
      content: [
        { type: "text" as const, text: lead },
        ...(Array.from(parts.values()) as never[]),
      ],
    });

    // Each step: show the tool running, then complete with its real result.
    async function* step(
      id: string,
      toolName: string,
      args: Record<string, unknown>,
      toolResult: unknown,
    ) {
      parts.set(id, { type: "tool-call", toolCallId: id, toolName, args });
      yield snapshot();
      if (abortSignal.aborted) return;
      await tick(360);
      parts.set(id, { type: "tool-call", toolCallId: id, toolName, args, result: toolResult });
      yield snapshot();
      await tick(160);
    }

    yield snapshot();
    await tick(280);

    // Each completed step also feeds the live graph rail with the entities it
    // actually touched (see agentGraphSession.ts for the honesty contract).
    const graphRunId = nextGraphRunId();

    yield* step("ctx", "collect_context", { focus: question }, result.context as ContextToolResult);
    feedGatherStep(graphRunId, scenario.room, result);
    yield* step("search", "search_synthesize", { query: question }, result.synthesis as SearchToolResult);
    feedSearchStep(graphRunId, result);
    yield* step(
      "model",
      "apply_spreadsheet_delta",
      { sheet: model.name },
      { applied: result.modelDelta, model } as ModelToolResult,
    );
    feedModelStep(graphRunId, model, result);
    yield* step("memo", "write_memo", { title: result.memo.title }, result.memo as MemoToolResult);
    feedMemoStep(graphRunId, result);

    // Closing line — honest about the run.
    const runway = result.modelDelta?.changes.find((c) => c.address === "B3");
    lead =
      result.status === "ok"
        ? `Done. The wedge holds on ${result.synthesis.confidence}-confidence grounding (${result.synthesis.groundedCount}/${result.synthesis.sources.length}), the model now clears ${runway ? runway.to : "—"} months, and the cited memo is ready.`
        : `Partial: I gathered context and updated the model, but grounding was too weak to synthesize a confident answer — flagged for manual review.`;
    yield snapshot();
  },
};
