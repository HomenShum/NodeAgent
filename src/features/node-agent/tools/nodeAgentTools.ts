/**
 * NodeAgent tools — the capability surface exposed to an agent / MCP client.
 *
 * Each tool is a thin, typed wrapper over a pure module. Keeping the tools thin
 * means the logic stays testable in isolation and the same functions power the
 * runtime loop, the demo, and any external MCP consumer.
 *
 * Distilled from NodeBench AI's MCP tool pattern: { name, description,
 * inputSchema, handler }.
 */

import { collectContext } from "../../chat/contextCollector";
import { searchAndSynthesize } from "../../search/searchAndSynthesize";
import { applySpreadsheetDelta } from "../../spreadsheet/applySpreadsheetDelta";
import { insertClaim } from "../../notebook/notebookEditor";
import {
  createInMemoryDurableRuntime,
  enqueueDurableReasoningFrame,
  runDurableReasoningFrame,
  type DurableFrameRunOutcome,
} from "../runtime/durableRuntime";
import { runNodeAgent, type RunInput } from "../runtime/nodeAgentRuntime";
import type { ReasoningFrame } from "../runtime/reasoningFrameRunner";
import type {
  Citation,
  ContextBundle,
  DeltaResult,
  NodeAgentTool,
  NotebookDoc,
  RoomContext,
  SearchSource,
  SpreadsheetDelta,
  SpreadsheetModel,
  SynthesisResult,
  AgentRunResult,
} from "../types/nodeAgentTypes";

export const collectContextTool: NodeAgentTool<
  { room: RoomContext; focus: string },
  ContextBundle
> = {
  name: "collect_context",
  description:
    "Gather and rank the most relevant messages and documents from a live room for a focus question.",
  inputSchema: { room: "RoomContext", focus: "string" },
  handler: ({ room, focus }) => collectContext(room, focus),
};

export const searchSynthesizeTool: NodeAgentTool<
  { query: string; sources: SearchSource[] },
  SynthesisResult
> = {
  name: "search_synthesize",
  description:
    "Rank sources by grounding, gate on retrieval confidence, and synthesize a cited answer (declines when grounding is weak).",
  inputSchema: { query: "string", sources: "SearchSource[]" },
  handler: ({ query, sources }) => searchAndSynthesize(query, sources),
};

export const applyDeltaTool: NodeAgentTool<
  { model: SpreadsheetModel; delta: SpreadsheetDelta },
  DeltaResult
> = {
  name: "apply_spreadsheet_delta",
  description:
    "Apply a versioned delta to a spreadsheet model with optimistic concurrency; recomputes dependents and bumps the version.",
  inputSchema: { model: "SpreadsheetModel", delta: "SpreadsheetDelta" },
  handler: ({ model, delta }) => applySpreadsheetDelta(model, delta),
};

export const writeClaimTool: NodeAgentTool<
  { doc: NotebookDoc; text: string; evidence: Citation[] },
  NotebookDoc
> = {
  name: "write_claim",
  description:
    "Insert a grounded claim block (statement + evidence citations) into a notebook memo.",
  inputSchema: { doc: "NotebookDoc", text: "string", evidence: "Citation[]" },
  handler: ({ doc, text, evidence }) => insertClaim(doc, { text, evidence }),
};

export const runAgentTool: NodeAgentTool<RunInput, AgentRunResult> = {
  name: "run_agent",
  description:
    "Run the full loop: gather room context, search & synthesize, apply a model delta, and write the cited memo.",
  inputSchema: {
    question: "string",
    room: "RoomContext",
    sources: "SearchSource[]",
    model: "SpreadsheetModel?",
    modelDelta: "SpreadsheetDelta?",
  },
  handler: (input) => runNodeAgent(input),
};

export const runDurableFrameTool: NodeAgentTool<
  { frame: ReasoningFrame; input?: RunInput; jobId?: string; workerId?: string; now?: number },
  DurableFrameRunOutcome
> = {
  name: "run_durable_frame",
  description:
    "Run a reasoning frame through provider-neutral durable ports with an in-memory reference adapter, lease, journal, and receipt replay.",
  inputSchema: {
    frame: "ReasoningFrame",
    input: "RunInput?",
    jobId: "string?",
    workerId: "string?",
    now: "number?",
  },
  handler: async ({ frame, input, jobId, workerId, now }) => {
    const runtime = createInMemoryDurableRuntime();
    const timestamp = now ?? Date.now();
    const job = await enqueueDurableReasoningFrame(runtime, {
      frame,
      jobId,
      now: timestamp,
    });
    return runDurableReasoningFrame(runtime, {
      jobId: job.jobId,
      workerId: workerId ?? "nodeagent-tool-worker",
      input,
      now: timestamp,
    });
  },
};

export const NODE_AGENT_TOOLS: NodeAgentTool<never, unknown>[] = [
  collectContextTool,
  searchSynthesizeTool,
  applyDeltaTool,
  writeClaimTool,
  runAgentTool,
  runDurableFrameTool,
] as unknown as NodeAgentTool<never, unknown>[];
