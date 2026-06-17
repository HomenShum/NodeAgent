import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  analyzeOmnigentSpec,
  OMNIGENT_NODEAGENT_TARGETS,
  summarizeOmnigentAnalysis,
} from "../src/features/node-agent/runtime/omnigentAdapter";

describe("Omnigent NodeAgent adapter", () => {
  it("keeps the YAML specs pointed at NodeAgent proof commands", () => {
    for (const target of OMNIGENT_NODEAGENT_TARGETS) {
      const text = readFileSync(target.path, "utf8");
      const analysis = analyzeOmnigentSpec({ path: target.path, profile: target.profile, text });

      expect(analysis.ok, summarizeOmnigentAnalysis(analysis)).toBe(true);
      expect(analysis.name).toBe(target.expectedName);
      expect(analysis.executorHarness).toBe("codex");
      expect(analysis.osEnvType).toBe("caller_process");
      expect(analysis.cwd).toBe(".");
      expect(analysis.hasSecretLiteral).toBe(false);
      expect(analysis.runCommand).toBe(`omni run ${target.path}`);
    }
  });

  it("requires the worker to run the frame, Omnigent, and prepush smokes", () => {
    const target = OMNIGENT_NODEAGENT_TARGETS.find((candidate) => candidate.profile === "worker");
    expect(target).toBeTruthy();
    const text = readFileSync(target!.path, "utf8");
    const analysis = analyzeOmnigentSpec({ path: target!.path, profile: "worker", text });

    expect(analysis.requiredCommands.map((command) => [command.command, command.present])).toEqual([
      ["npm run nodeagent:frame:smoke", true],
      ["npm run nodeagent:durable:smoke", true],
      ["npm run nodeagent:sqlite:smoke", true],
      ["npm run omnigent:nodeagent:smoke", true],
      ["npm run prepush", true],
    ]);
  });
});
