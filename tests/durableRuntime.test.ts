import { describe, expect, it } from "vitest";
import { buildDemoScenario, DEMO_NOW } from "../src/features/node-agent/demoScenario";
import {
  createInMemoryDurableRuntime,
  enqueueDurableReasoningFrame,
  frameJournalKey,
  runDurableReasoningFrame,
} from "../src/features/node-agent/runtime/durableRuntime";
import { buildDemoReasoningFrame, runReasoningFrame } from "../src/features/node-agent/runtime/reasoningFrameRunner";

describe("durable NodeAgent runtime ports", () => {
  it("runs a queued frame through durable ports and stores a verifier receipt", async () => {
    const runtime = createInMemoryDurableRuntime();
    const frame = buildDemoReasoningFrame();
    const job = await enqueueDurableReasoningFrame(runtime, {
      frame,
      jobId: "job_nodeagent_demo",
      now: DEMO_NOW,
    });

    const outcome = await runDurableReasoningFrame(runtime, {
      jobId: job.jobId,
      workerId: "worker-a",
      now: DEMO_NOW + 1,
      input: buildDemoScenario(DEMO_NOW),
    });

    expect(outcome.status).toBe("completed");
    expect(outcome.replayed).toBe(false);
    expect(outcome.job?.status).toBe("completed");
    expect(outcome.frame?.status).toBe("completed");
    expect(outcome.receipt?.verification.reason).toBe("Frame completed.");
    expect(outcome.receipt?.agentResult.modelDelta?.changes.find((change) => change.address === "B3")?.to).toBe(18);

    const journal = await runtime.journal.listByJob(job.jobId);
    expect(journal).toHaveLength(1);
    expect(journal[0].key).toBe(frameJournalKey(job));
    expect(journal[0].receiptRef).toBe(outcome.job?.receiptRef);
  });

  it("replays an existing journaled frame without running the executor again", async () => {
    const runtime = createInMemoryDurableRuntime();
    const frame = buildDemoReasoningFrame();
    const job = await enqueueDurableReasoningFrame(runtime, {
      frame,
      jobId: "job_replay",
      now: DEMO_NOW,
    });
    let executed = 0;

    const first = await runDurableReasoningFrame(runtime, {
      jobId: job.jobId,
      workerId: "worker-a",
      now: DEMO_NOW + 1,
      executor: (args) => {
        executed += 1;
        return runReasoningFrame(args);
      },
    });
    const second = await runDurableReasoningFrame(runtime, {
      jobId: job.jobId,
      workerId: "worker-b",
      now: DEMO_NOW + 2,
      executor: (args) => {
        executed += 1;
        return runReasoningFrame(args);
      },
    });

    expect(first.status).toBe("completed");
    expect(second.status).toBe("replayed");
    expect(second.replayed).toBe(true);
    expect(executed).toBe(1);
    expect(await runtime.journal.listByJob(job.jobId)).toHaveLength(1);
  });

  it("fences active leases and allows reclaim after expiry", async () => {
    const runtime = createInMemoryDurableRuntime();
    const first = await runtime.leaseStore.claim({
      resourceId: "job:lease-demo",
      holderId: "worker-a",
      ttlMs: 1_000,
      now: DEMO_NOW,
    });
    const blocked = await runtime.leaseStore.claim({
      resourceId: "job:lease-demo",
      holderId: "worker-b",
      ttlMs: 1_000,
      now: DEMO_NOW + 500,
    });
    const reclaimed = await runtime.leaseStore.claim({
      resourceId: "job:lease-demo",
      holderId: "worker-b",
      ttlMs: 1_000,
      now: DEMO_NOW + 1_001,
    });

    expect(first?.holderId).toBe("worker-a");
    expect(blocked).toBeNull();
    expect(reclaimed?.holderId).toBe("worker-b");
    expect(reclaimed?.fencingToken).toBe((first?.fencingToken ?? 0) + 1);
  });

  it("schedules runnable jobs by runAfter and priority", async () => {
    const runtime = createInMemoryDurableRuntime();
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
    await enqueueDurableReasoningFrame(runtime, {
      frame: { ...buildDemoReasoningFrame(), frameId: "frame_later" },
      jobId: "job_later",
      priority: 99,
      runAfter: DEMO_NOW + 5_000,
      now: DEMO_NOW,
    });

    expect((await runtime.scheduler.nextRunnable(DEMO_NOW))?.jobId).toBe("job_high");
    expect((await runtime.jobStore.listRunnable(DEMO_NOW + 5_000, 3)).map((job) => job.jobId)).toEqual([
      "job_later",
      "job_high",
      "job_low",
    ]);
  });
});
