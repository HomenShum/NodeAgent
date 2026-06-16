/**
 * Harness-native reasoning frames for NodeAgent.
 *
 * Omnigent can launch/govern a session, but the bounded work unit lives here:
 * a ReasoningFrame carries the goal, context policy, optional model delta, and
 * evidence expectations. The runner executes the existing NodeAgent loop and
 * returns a verifier receipt instead of hiding state in a chat transcript.
 */

import { buildDemoScenario } from "../demoScenario";
import { runNodeAgent, type RunInput } from "./nodeAgentRuntime";
import type { AgentRunResult, RetrievalConfidence } from "../types/nodeAgentTypes";

export type ReasoningFramePhase = "intake" | "plan" | "execute" | "verify" | "synthesize";
export type ReasoningFrameStatus = "pending" | "running" | "completed" | "blocked" | "failed";

export interface ContextPack {
  focus: string;
  sourceRefs: string[];
  expectedMinimumConfidence?: RetrievalConfidence;
  requireModelDelta?: boolean;
}

export interface ReasoningFrame {
  frameId: string;
  goal: string;
  phase: ReasoningFramePhase;
  status: ReasoningFrameStatus;
  contextPack: ContextPack;
}

export interface FrameDelta {
  contextItemCount: number;
  activeParticipants: number;
  groundedCount: number;
  modelChanged: boolean;
  memoBlockCount: number;
}

export interface FrameVerification {
  status: ReasoningFrameStatus;
  reason: string;
  evidenceState: {
    confidence: RetrievalConfidence;
    citationCount: number;
    winnerSourceId?: string;
  };
}

export interface ReasoningFrameRunReceipt {
  frameId: string;
  status: ReasoningFrameStatus;
  agentResult: AgentRunResult;
  stateDelta: FrameDelta;
  verification: FrameVerification;
}

export interface ReasoningFrameRunInput {
  frame: ReasoningFrame;
  input?: RunInput;
}

function confidenceRank(confidence: RetrievalConfidence) {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function buildFrameDelta(result: AgentRunResult): FrameDelta {
  return {
    contextItemCount: result.context.items.length,
    activeParticipants: result.context.activeParticipants,
    groundedCount: result.synthesis.groundedCount,
    modelChanged: result.modelDelta !== null,
    memoBlockCount: result.memo.blocks.length,
  };
}

function verifyFrame(frame: ReasoningFrame, result: AgentRunResult): FrameVerification {
  const expected = frame.contextPack.expectedMinimumConfidence ?? "medium";
  const winner = result.synthesis.sources.find((source) => source.winner);
  const evidenceState = {
    confidence: result.synthesis.confidence,
    citationCount: result.synthesis.citations.length,
    winnerSourceId: winner?.id,
  };

  if (confidenceRank(result.synthesis.confidence) < confidenceRank(expected)) {
    return { status: "blocked", reason: `Grounding confidence below ${expected}.`, evidenceState };
  }
  if (result.status === "error") {
    return { status: "failed", reason: "NodeAgent runtime returned error.", evidenceState };
  }
  if (frame.contextPack.requireModelDelta && !result.modelDelta) {
    return { status: "blocked", reason: "Expected a versioned model delta, but none was applied.", evidenceState };
  }
  if (!result.memo.blocks.some((block) => block.type === "claim")) {
    return { status: "blocked", reason: "Memo has no grounded claim block.", evidenceState };
  }
  return { status: "completed", reason: "Frame completed.", evidenceState };
}

export function runReasoningFrame(args: ReasoningFrameRunInput): ReasoningFrameRunReceipt {
  const input = args.input ?? buildDemoScenario();
  const result = runNodeAgent({ ...input, question: args.frame.goal });
  const verification = verifyFrame(args.frame, result);
  return {
    frameId: args.frame.frameId,
    status: verification.status,
    agentResult: result,
    stateDelta: buildFrameDelta(result),
    verification,
  };
}

export function buildDemoReasoningFrame(): ReasoningFrame {
  return {
    frameId: "rf_nodeagent_demo_wedge_runway",
    goal: "Does our wedge hold versus Acme, and does the runway model survive 18 months?",
    phase: "execute",
    status: "pending",
    contextPack: {
      focus: "Acme wedge and runway",
      sourceRefs: ["src_bench", "src_finance", "src_diligence"],
      expectedMinimumConfidence: "medium",
      requireModelDelta: true,
    },
  };
}
