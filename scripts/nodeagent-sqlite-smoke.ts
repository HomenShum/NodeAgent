import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoScenario, DEMO_NOW } from "../src/features/node-agent/demoScenario";
import {
  enqueueDurableReasoningFrame,
  runDurableReasoningFrame,
} from "../src/features/node-agent/runtime/durableRuntime";
import { buildDemoReasoningFrame } from "../src/features/node-agent/runtime/reasoningFrameRunner";
import { createSqliteDurableRuntime } from "../examples/adapters/sqlite-local/sqliteDurableRuntime";

function argValue(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function ensureParent(path: string) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
}

export async function runNodeAgentSqliteSmoke(options: { databasePath?: string; keepDatabase?: boolean } = {}) {
  const tempDir = options.databasePath ? undefined : mkdtempSync(join(tmpdir(), "nodeagent-sqlite-"));
  const databasePath = options.databasePath ?? join(tempDir!, "nodeagent.sqlite");
  const frame = buildDemoReasoningFrame();
  const jobId = "job_nodeagent_sqlite_wedge_runway";

  const firstRuntime = createSqliteDurableRuntime({ databasePath });
  const job = await enqueueDurableReasoningFrame(firstRuntime, {
    frame,
    jobId,
    now: DEMO_NOW,
  });
  const first = await runDurableReasoningFrame(firstRuntime, {
    jobId: job.jobId,
    workerId: "sqlite-smoke-worker-a",
    now: DEMO_NOW + 1,
    input: buildDemoScenario(DEMO_NOW),
  });

  const secondRuntime = createSqliteDurableRuntime({ databasePath });
  const second = await runDurableReasoningFrame(secondRuntime, {
    jobId: job.jobId,
    workerId: "sqlite-smoke-worker-b",
    now: DEMO_NOW + 2,
    input: buildDemoScenario(DEMO_NOW),
  });

  const leaseOne = await secondRuntime.leaseStore.claim({
    resourceId: "job:sqlite-stale-lease-proof",
    holderId: "lease-worker-a",
    ttlMs: 100,
    now: DEMO_NOW,
  });
  const leaseBlocked = await secondRuntime.leaseStore.claim({
    resourceId: "job:sqlite-stale-lease-proof",
    holderId: "lease-worker-b",
    ttlMs: 100,
    now: DEMO_NOW + 50,
  });
  const leaseReclaimed = await secondRuntime.leaseStore.claim({
    resourceId: "job:sqlite-stale-lease-proof",
    holderId: "lease-worker-b",
    ttlMs: 100,
    now: DEMO_NOW + 101,
  });

  const journal = await secondRuntime.journal.listByJob(job.jobId);
  const runway = first.receipt?.agentResult.modelDelta?.changes.find((change) => change.address === "B3");
  const ok = first.status === "completed"
    && first.job?.status === "completed"
    && second.status === "replayed"
    && second.replayed
    && second.receipt?.frameId === first.receipt?.frameId
    && journal.length === 1
    && runway?.to === 18
    && leaseOne !== null
    && leaseBlocked === null
    && leaseReclaimed?.holderId === "lease-worker-b";

  const report = {
    ok,
    provider: "sqlite-local",
    databasePath: (options.databasePath || options.keepDatabase) ? databasePath : "temporary-sqlite-database",
    keptDatabase: Boolean(options.databasePath || options.keepDatabase),
    jobId: job.jobId,
    frameId: frame.frameId,
    first: {
      status: first.status,
      jobStatus: first.job?.status,
      receiptStatus: first.receipt?.status,
    },
    replayAfterReopen: {
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

  firstRuntime.close();
  secondRuntime.close();
  if (tempDir && !options.keepDatabase) rmSync(tempDir, { recursive: true, force: true });
  return report;
}

async function main() {
  const databasePath = argValue("--db");
  const keepDatabase = hasFlag("--keep-db");
  const report = await runNodeAgentSqliteSmoke({ databasePath, keepDatabase });
  const jsonOut = argValue("--json-out");
  if (jsonOut) {
    ensureParent(jsonOut);
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`nodeagent sqlite smoke: ${report.ok ? "PASS" : "FAIL"} db=${report.keptDatabase ? report.databasePath : "temp"} replay=${report.replayAfterReopen.status}`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
