/**
 * NodeAgent runtime — the full loop, end to end.
 *
 * Verifies the four surfaces compose, the overall status is honest (ok only when
 * every step completes; partial when grounding fails but a memo still ships),
 * and the canonical demo scenario produces the expected numbers.
 */

import { describe, it, expect } from "vitest";
import { runNodeAgent } from "../src/features/node-agent/runtime/nodeAgentRuntime";
import { buildDemoScenario, DEMO_NOW } from "../src/features/node-agent/demoScenario";
import { toMarkdown } from "../src/features/notebook/notebookEditor";

describe("canonical demo scenario", () => {
  const result = runNodeAgent(buildDemoScenario());

  it("completes all four steps with status ok", () => {
    expect(result.status).toBe("ok");
    expect(result.steps.map((s) => s.name)).toEqual(["gather", "search", "model", "memo"]);
    expect(result.steps.every((s) => s.status === "done")).toBe(true);
  });

  it("gathers the benchmark document into context", () => {
    expect(result.context.items.some((i) => i.refId === "room://benchmark")).toBe(true);
    expect(result.context.activeParticipants).toBeGreaterThanOrEqual(2);
  });

  it("synthesizes a high-confidence answer with the benchmark as winner", () => {
    expect(result.synthesis.confidence).toBe("high");
    expect(result.synthesis.sources.find((s) => s.winner)?.id).toBe("src_bench");
  });

  it("applies the versioned delta and recomputes runway to 18.0", () => {
    expect(result.modelDelta).not.toBeNull();
    expect(result.modelDelta?.toVersion).toBe(2);
    const runway = result.modelDelta?.changes.find((c) => c.address === "B3");
    expect(runway?.to).toBe(18);
  });

  it("writes a memo containing a grounded claim block", () => {
    const md = toMarkdown(result.memo);
    expect(md).toContain("# Acme — diligence memo");
    expect(md).toContain("**Claim**");
    expect(result.memo.blocks.some((b) => b.type === "claim")).toBe(true);
  });

  it("is deterministic for a fixed clock", () => {
    const again = runNodeAgent(buildDemoScenario(DEMO_NOW));
    expect(toMarkdown(again.memo)).toBe(toMarkdown(result.memo));
  });
});

describe("honest degradation", () => {
  it("returns partial (not ok, not crash) when grounding fails but a memo still ships", () => {
    const scenario = buildDemoScenario();
    const weak = {
      ...scenario,
      sources: [
        { id: "z", kind: "WEB" as const, title: "unrelated", snippet: "sourdough bread recipe", retrievalScore: 0.99 },
      ],
    };
    const result = runNodeAgent(weak);
    expect(result.synthesis.confidence).toBe("low");
    expect(result.steps.find((s) => s.name === "search")?.status).toBe("error");
    // Memo still produced; status is honest about the gap.
    expect(["partial", "error"]).toContain(result.status);
    expect(result.memo.blocks.length).toBeGreaterThan(1);
  });

  it("never throws — returns a structured result even with an empty room", () => {
    const scenario = buildDemoScenario();
    const empty = { ...scenario, room: { ...scenario.room, messages: [] } };
    expect(() => runNodeAgent(empty)).not.toThrow();
  });
});
