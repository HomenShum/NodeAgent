import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoReasoningFrame, runReasoningFrame } from "../src/features/node-agent/runtime/reasoningFrameRunner";

function argValue(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function ensureParent(path: string) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
}

export function runNodeAgentFrameSmoke() {
  const receipt = runReasoningFrame({ frame: buildDemoReasoningFrame() });
  const runway = receipt.agentResult.modelDelta?.changes.find((change) => change.address === "B3");
  return {
    ok: receipt.status === "completed" && runway?.to === 18,
    frameId: receipt.frameId,
    status: receipt.status,
    runtimeStatus: receipt.agentResult.status,
    stateDelta: receipt.stateDelta,
    verification: receipt.verification,
    runwayMonths: runway?.to,
    memoBlocks: receipt.agentResult.memo.blocks.length,
  };
}

function main() {
  const report = runNodeAgentFrameSmoke();
  const jsonOut = argValue("--json-out");
  if (jsonOut) {
    ensureParent(jsonOut);
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`nodeagent frame smoke: ${report.ok ? "PASS" : "FAIL"} frame=${report.frameId} status=${report.status} runway=${report.runwayMonths}`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
