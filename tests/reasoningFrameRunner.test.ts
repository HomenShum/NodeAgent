import { describe, expect, it } from "vitest";
import { buildDemoReasoningFrame, runReasoningFrame } from "../src/features/node-agent/runtime/reasoningFrameRunner";
import { buildDemoScenario } from "../src/features/node-agent/demoScenario";

describe("reasoning frame runner", () => {
  it("runs the canonical NodeAgent loop through a bounded frame and verifier receipt", () => {
    const receipt = runReasoningFrame({ frame: buildDemoReasoningFrame() });

    expect(receipt.status).toBe("completed");
    expect(receipt.verification.reason).toBe("Frame completed.");
    expect(receipt.agentResult.status).toBe("ok");
    expect(receipt.stateDelta).toMatchObject({
      contextItemCount: expect.any(Number),
      groundedCount: expect.any(Number),
      modelChanged: true,
      memoBlockCount: expect.any(Number),
    });
    expect(receipt.verification.evidenceState.confidence).toBe("high");
    expect(receipt.verification.evidenceState.winnerSourceId).toBe("src_bench");
    expect(receipt.agentResult.modelDelta?.changes.find((change) => change.address === "B3")?.to).toBe(18);
  });

  it("blocks instead of claiming success when grounding evidence is too weak", () => {
    const scenario = buildDemoScenario();
    const receipt = runReasoningFrame({
      frame: buildDemoReasoningFrame(),
      input: {
        ...scenario,
        sources: [
          { id: "weak", kind: "WEB", title: "Unrelated", snippet: "sourdough bread recipe", retrievalScore: 0.99 },
        ],
      },
    });

    expect(receipt.status).toBe("blocked");
    expect(receipt.verification.reason).toContain("Grounding confidence below");
    expect(receipt.agentResult.status).not.toBe("ok");
  });
});
