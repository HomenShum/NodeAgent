import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSqliteDurableRuntime } from "../examples/adapters/sqlite-local/sqliteDurableRuntime";
import { buildDemoScenario, DEMO_NOW } from "../src/features/node-agent/demoScenario";
import {
  enqueueDurableReasoningFrame,
  runDurableReasoningFrame,
} from "../src/features/node-agent/runtime/durableRuntime";
import { buildDemoReasoningFrame } from "../src/features/node-agent/runtime/reasoningFrameRunner";

describe("sqlite-local durable adapter", () => {
  it("persists a completed frame and replays duplicate runs from a reopened runtime", async () => {
    const { databasePath, cleanup } = tempDatabase();
    try {
      const frame = buildDemoReasoningFrame();
      const firstRuntime = createSqliteDurableRuntime({ databasePath });
      const job = await enqueueDurableReasoningFrame(firstRuntime, {
        frame,
        jobId: "job_sqlite_replay",
        now: DEMO_NOW,
      });
      const first = await runDurableReasoningFrame(firstRuntime, {
        jobId: job.jobId,
        workerId: "worker-a",
        now: DEMO_NOW + 1,
        input: buildDemoScenario(DEMO_NOW),
      });

      const reopenedRuntime = createSqliteDurableRuntime({ databasePath });
      const second = await runDurableReasoningFrame(reopenedRuntime, {
        jobId: job.jobId,
        workerId: "worker-b",
        now: DEMO_NOW + 2,
        input: buildDemoScenario(DEMO_NOW),
      });
      const journal = await reopenedRuntime.journal.listByJob(job.jobId);

      expect(first.status).toBe("completed");
      expect(second.status).toBe("replayed");
      expect(second.replayed).toBe(true);
      expect(second.receipt?.frameId).toBe(first.receipt?.frameId);
      expect(journal).toHaveLength(1);
      firstRuntime.close();
      reopenedRuntime.close();
    } finally {
      cleanup();
    }
  });

  it("uses SQLite rows for runnable scheduling and stale lease reclaim", async () => {
    const { databasePath, cleanup } = tempDatabase();
    try {
      const runtime = createSqliteDurableRuntime({ databasePath });
      await enqueueDurableReasoningFrame(runtime, {
        frame: { ...buildDemoReasoningFrame(), frameId: "frame_low" },
        jobId: "job_low",
        priority: 1,
        runAfter: DEMO_NOW,
        now: DEMO_NOW,
      });
      await enqueueDurableReasoningFrame(runtime, {
        frame: { ...buildDemoReasoningFrame(), frameId: "frame_high" },
        jobId: "job_high",
        priority: 9,
        runAfter: DEMO_NOW,
        now: DEMO_NOW,
      });

      const firstLease = await runtime.leaseStore.claim({
        resourceId: "job:sqlite-lease",
        holderId: "worker-a",
        ttlMs: 100,
        now: DEMO_NOW,
      });
      const blockedLease = await runtime.leaseStore.claim({
        resourceId: "job:sqlite-lease",
        holderId: "worker-b",
        ttlMs: 100,
        now: DEMO_NOW + 50,
      });
      const reclaimedLease = await runtime.leaseStore.claim({
        resourceId: "job:sqlite-lease",
        holderId: "worker-b",
        ttlMs: 100,
        now: DEMO_NOW + 101,
      });

      expect((await runtime.scheduler.nextRunnable(DEMO_NOW))?.jobId).toBe("job_high");
      expect(firstLease?.holderId).toBe("worker-a");
      expect(blockedLease).toBeNull();
      expect(reclaimedLease?.holderId).toBe("worker-b");
      expect(reclaimedLease?.fencingToken).toBe((firstLease?.fencingToken ?? 0) + 1);
      runtime.close();
    } finally {
      cleanup();
    }
  });
});

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "nodeagent-sqlite-test-"));
  return {
    databasePath: join(dir, "nodeagent.sqlite"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
