import { getEventListeners } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatModelRunResult, ThreadMessage } from "@assistant-ui/react";
import { DEMO_QUESTION } from "../src/features/node-agent/demoScenario";

type Run = AsyncGenerator<ChatModelRunResult, void>;
let adapter: typeof import("../src/features/node-agent/runtime/nodeAgentChatAdapter").nodeAgentChatAdapter;
let graph: typeof import("../src/features/node-agent/graph/agentGraphSession").graphSession;

const boundaries = [
  ["before context collection", 1],
  ["during context collection", 2],
  ["after context completes", 3],
  ["during source search", 4],
  ["after sources complete", 5],
  ["during spreadsheet work", 6],
  ["after the spreadsheet completes", 7],
  ["during memo writing", 8],
  ["after the memo completes", 9],
] as const;

function user(text: string): ThreadMessage {
  return {
    id: text, role: "user", content: [{ type: "text", text }],
    createdAt: new Date("2026-10-14T00:00:00Z"), attachments: [], metadata: { custom: {} },
  };
}

function start(controller = new AbortController(), messages = [user(DEMO_QUESTION)]) {
  const run = adapter.run({
    messages, abortSignal: controller.signal, runConfig: {}, context: {},
    unstable_getMessage: () => messages[messages.length - 1],
  });
  if (!("next" in run)) throw new Error("The chat adapter must stream its response");
  return { run, controller };
}

async function next(run: Run) {
  const pending = run.next();
  await vi.runAllTimersAsync();
  return pending;
}

async function advance(run: Run, count: number) {
  const frames: ChatModelRunResult[] = [];
  for (let i = 0; i < count; i++) {
    const result = await next(run);
    if (result.done) throw new Error("Response finished before the requested stop boundary");
    frames.push(result.value);
  }
  return frames;
}

async function complete(run: Run) {
  const frames: ChatModelRunResult[] = [];
  for (let i = 0; i < 12; i++) {
    const result = await next(run);
    if (result.done) return frames;
    frames.push(result.value);
  }
  throw new Error("The four-tool response did not finish within its frame budget");
}

const snapshot = () => structuredClone(graph.getSnapshot());
const observe = (pending: ReturnType<Run["next"]>) => pending.then(
  value => ({ value, error: undefined }),
  (error: unknown) => ({ value: undefined, error }),
);

async function expectStopped(run: Run, controller: AbortController, pending: ReturnType<typeof observe>, before: ReturnType<typeof snapshot>) {
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(result.error).toMatchObject({ name: "AbortError" });
  expect(result.value).toBeUndefined();
  expect(snapshot()).toEqual(before);
  expect((await run.next()).done).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  adapter = (await import("../src/features/node-agent/runtime/nodeAgentChatAdapter")).nodeAgentChatAdapter;
  graph = (await import("../src/features/node-agent/graph/agentGraphSession")).graphSession;
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("an analyst stops a response without late work or lost earlier results", () => {
  it("completes all four tools and releases waits when the analyst lets the response finish", async () => {
    const session = start();
    const frames = await complete(session.run);
    const result = frames.at(-1)!;
    expect(result.content?.[0]).toMatchObject({ text: expect.stringMatching(/^Done\./) });
    expect(result.content?.filter(part => part.type === "tool-call" && part.result !== undefined)).toHaveLength(4);
    expect(snapshot().nodes.some(node => node.type === "memo")).toBe(true);
    expect(getEventListeners(session.controller.signal, "abort")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never starts a response whose cancellation arrived before the first frame", async () => {
    const session = start();
    const before = snapshot();
    session.controller.abort();
    await expectStopped(session.run, session.controller, observe(session.run.next()), before);
  });

  describe.each([false, true])("with reduced motion %s", reduced => {
    it.each(boundaries)("stops a pending delay %s", async (_boundary, frames) => {
      vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
      const session = start();
      const completed = await advance(session.run, frames);
      const retained = structuredClone(completed);
      const before = snapshot();
      const pending = observe(session.run.next());
      expect(vi.getTimerCount()).toBe(1);
      session.controller.abort();
      await expectStopped(session.run, session.controller, pending, before);
      expect(completed).toEqual(retained);
    });
  });

  it.each(boundaries)("stays stopped when the consumer resumes a paused frame %s", async (_boundary, frames) => {
    const session = start();
    await advance(session.run, frames);
    const before = snapshot();
    session.controller.abort();
    await expectStopped(session.run, session.controller, observe(session.run.next()), before);
  });

  it.each(boundaries)("honors Stop when a timer has fired but the continuation has not resumed %s", async (_boundary, frames) => {
    const session = start();
    await advance(session.run, frames);
    const before = snapshot();
    const pending = observe(session.run.next());
    vi.runOnlyPendingTimers();
    session.controller.abort();
    await expectStopped(session.run, session.controller, pending, before);
  });

  it.each(boundaries)("stops before publishing work when the wait has already resolved %s", async (_boundary, frames) => {
    const session = start();
    await advance(session.run, frames);
    const before = snapshot();
    const pending = observe(session.run.next());
    vi.runOnlyPendingTimers();
    // The delay's own continuation runs first; Stop arrives before its caller resumes.
    await Promise.resolve();
    const reason = Object.assign(new Error("Analyst stopped this response"), { name: "AbortError" });
    session.controller.abort(reason);
    await expectStopped(session.run, session.controller, pending, before);
    expect((await pending).error).toBe(reason);
  });

  it.each(boundaries.filter(([, frames]) => frames > 1 && frames % 2 === 1))(
    "keeps the SDK's cancelled response and graph consistent %s",
    async (_boundary, frames) => {
      const { LocalThreadRuntimeCore } = await import("@assistant-ui/core/internal");
      let signal: AbortSignal | undefined;
      const runtime = new LocalThreadRuntimeCore({ getModelContext: () => ({}) }, {
        adapters: { chatModel: { run: options => {
          signal = options.abortSignal;
          return adapter.run(options);
        } } },
      });
      const pending = runtime.append({ ...user(DEMO_QUESTION), parentId: null, sourceId: null, runConfig: {} });
      const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
      await flush();
      for (let i = 1; i < frames; i++) {
        vi.runOnlyPendingTimers();
        await flush();
      }
      const before = snapshot();
      const retained = structuredClone(runtime.messages.at(-1)!.content);
      expect(retained.filter(part => part.type === "tool-call" && part.result !== undefined)).toHaveLength((frames - 1) / 2);
      expect(vi.getTimerCount()).toBe(1);
      vi.runOnlyPendingTimers();
      await Promise.resolve();
      runtime.cancelRun();
      await pending;
      expect(runtime.messages.at(-1)!.status).toEqual({ type: "incomplete", reason: "cancelled" });
      expect(runtime.messages.at(-1)!.content).toEqual(retained);
      expect(snapshot()).toEqual(before);
      expect(signal?.reason).toMatchObject({ name: "AbortError" });
      expect(getEventListeners(signal!, "abort")).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("keeps an earlier completed turn and lets the analyst retry the stopped question", async () => {
    const earlier = start();
    const earlierFrames = await complete(earlier.run);
    const previous: ThreadMessage = {
      id: "earlier-response", role: "assistant", createdAt: new Date("2026-10-14T00:00:00Z"),
      content: earlierFrames.at(-1)!.content!, status: { type: "complete", reason: "stop" },
      metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} },
    };
    const history = [user(DEMO_QUESTION), previous, user(`${DEMO_QUESTION} Please recheck.`)];
    const retained = structuredClone(history);
    const stopped = start(new AbortController(), history);
    await advance(stopped.run, 3);
    const before = snapshot();
    const pending = observe(stopped.run.next());
    stopped.controller.abort();
    await expectStopped(stopped.run, stopped.controller, pending, before);
    const retry = start(new AbortController(), history);
    const frames = await complete(retry.run);
    expect(frames.at(-1)?.content?.[0]).toMatchObject({ type: "text", text: expect.stringMatching(/^Done\./) });
    expect(frames.at(-1)?.content?.filter(part => part.type === "tool-call" && part.result !== undefined)).toHaveLength(4);
    expect(history).toEqual(retained);
    expect(getEventListeners(earlier.controller.signal, "abort")).toHaveLength(0);
    expect(getEventListeners(retry.controller.signal, "abort")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels one overlapping analyst run without cancelling or attributing work to the other", async () => {
    const stoppedQuestion = `${DEMO_QUESTION} Cancelled analyst.`;
    const continuingQuestion = `${DEMO_QUESTION} Continuing analyst.`;
    const stopped = start(new AbortController(), [user(stoppedQuestion)]);
    const continuing = start(new AbortController(), [user(continuingQuestion)]);
    await advance(stopped.run, 3);
    await advance(continuing.run, 3);
    const cancelled = observe(stopped.run.next());
    const active = continuing.run.next();
    stopped.controller.abort();
    await vi.runAllTimersAsync();
    expect((await cancelled).error).toMatchObject({ name: "AbortError" });
    expect((await active).done).toBe(false);
    const frames = await complete(continuing.run);
    expect(frames.at(-1)?.content?.[0]).toMatchObject({ text: expect.stringMatching(/^Done\./) });
    const questions = snapshot().nodes.filter(node => node.type === "question").map(node => node.label);
    expect(questions).toEqual([continuingQuestion]);
    for (const session of [stopped, continuing]) expect(getEventListeners(session.controller.signal, "abort")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases every wait after a burst of stops and a long session of repeated stop/retry work", async () => {
    const burst = Array.from({ length: 16 }, () => start());
    for (const session of burst) await advance(session.run, 3);
    const beforeBurst = snapshot();
    const pending = burst.map(session => observe(session.run.next()));
    burst.forEach(session => session.controller.abort());
    await vi.runAllTimersAsync();
    for (let i = 0; i < burst.length; i++) {
      await expectStopped(burst[i].run, burst[i].controller, pending[i], beforeBurst);
    }
    for (let i = 0; i < 128; i++) {
      const session = start();
      await advance(session.run, boundaries[i % boundaries.length][1]);
      const before = snapshot();
      const result = observe(session.run.next());
      session.controller.abort();
      await expectStopped(session.run, session.controller, result, before);
      if (i % 16 === 15) {
        const retry = start();
        const frames = await complete(retry.run);
        expect(frames.at(-1)?.content?.[0]).toMatchObject({ text: expect.stringMatching(/^Done\./) });
        expect(getEventListeners(retry.controller.signal, "abort")).toHaveLength(0);
      }
    }
    const stats = graph.stats();
    expect(stats.nodes).toBeLessThanOrEqual(stats.maxNodes);
    expect(stats.edges).toBeLessThanOrEqual(stats.maxEdges);
    expect(stats.seen).toBeLessThanOrEqual(stats.maxSeen);
    expect(vi.getTimerCount()).toBe(0);
  });
});
