import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoScenario, DEMO_NOW } from "../src/features/node-agent/demoScenario";
import {
  createInMemoryDurableRuntime,
  enqueueDurableReasoningFrame,
  runDurableReasoningFrame,
} from "../src/features/node-agent/runtime/durableRuntime";
import { buildDemoReasoningFrame } from "../src/features/node-agent/runtime/reasoningFrameRunner";

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

export async function runNodeAgentDurableSmoke() {
  const runtime = createInMemoryDurableRuntime();
  const frame = buildDemoReasoningFrame();
  const job = await enqueueDurableReasoningFrame(runtime, {
    frame,
    jobId: "job_nodeagent_demo_wedge_runway",
    now: DEMO_NOW,
  });

  const first = await runDurableReasoningFrame(runtime, {
    jobId: job.jobId,
    workerId: "durable-smoke-worker-a",
    now: DEMO_NOW + 1,
    input: buildDemoScenario(DEMO_NOW),
  });
  const second = await runDurableReasoningFrame(runtime, {
    jobId: job.jobId,
    workerId: "durable-smoke-worker-b",
    now: DEMO_NOW + 2,
    input: buildDemoScenario(DEMO_NOW),
  });

  const leaseOne = await runtime.leaseStore.claim({
    resourceId: "job:stale-lease-proof",
    holderId: "lease-worker-a",
    ttlMs: 100,
    now: DEMO_NOW,
  });
  const leaseBlocked = await runtime.leaseStore.claim({
    resourceId: "job:stale-lease-proof",
    holderId: "lease-worker-b",
    ttlMs: 100,
    now: DEMO_NOW + 50,
  });
  const leaseReclaimed = await runtime.leaseStore.claim({
    resourceId: "job:stale-lease-proof",
    holderId: "lease-worker-b",
    ttlMs: 100,
    now: DEMO_NOW + 101,
  });

  const journal = await runtime.journal.listByJob(job.jobId);
  const runway = first.receipt?.agentResult.modelDelta?.changes.find((change) => change.address === "B3");
  const ok = first.status === "completed"
    && first.job?.status === "completed"
    && second.status === "replayed"
    && second.replayed
    && journal.length === 1
    && runway?.to === 18
    && leaseOne !== null
    && leaseBlocked === null
    && leaseReclaimed?.holderId === "lease-worker-b";

  return {
    ok,
    jobId: job.jobId,
    frameId: frame.frameId,
    first: {
      status: first.status,
      jobStatus: first.job?.status,
      receiptStatus: first.receipt?.status,
    },
    replay: {
      status: second.status,
      replayed: second.replayed,
      sameFrameId: second.receipt?.frameId === first.receipt?.frameId,
    },
    journal: {
      entryCount: journal.length,
      keys: journal.map((entry) => entry.key),
    },
    lease: {
      blockedWhileActive: leaseBlocked === null,
      reclaimedAfterExpiry: leaseReclaimed?.holderId === "lease-worker-b",
      fencingAdvanced: leaseReclaimed?.fencingToken === (leaseOne?.fencingToken ?? 0) + 1,
    },
    runwayMonths: runway?.to,
    verification: first.receipt?.verification,
  };
}

async function main() {
  const report = await runNodeAgentDurableSmoke();
  const jsonOut = argValue("--json-out");
  if (jsonOut) {
    ensureParent(jsonOut);
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`nodeagent durable smoke: ${report.ok ? "PASS" : "FAIL"} frame=${report.frameId} job=${report.jobId} replay=${report.replay.status}`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
