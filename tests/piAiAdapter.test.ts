import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  ModelsSimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { calculateCost, createAssistantMessageEventStream } from "@earendil-works/pi-ai";

import {
  createPiAiAdapter,
  PiAiAdapterError,
  type PiModelsPort,
} from "../src/features/node-agent/providers/piAiAdapter";

const MODEL: Model<Api> = {
  id: "test-model",
  name: "Test Model",
  api: "openai-completions",
  provider: "test-provider",
  baseUrl: "https://example.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32_000,
  maxTokens: 4_000,
};

function response(): AssistantMessage {
  return {
    role: "assistant",
    content: [
      { type: "text", text: "I will inspect it." },
      { type: "toolCall", id: "call-1", name: "artifact.inspect", arguments: { id: "a-1" } },
    ],
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    responseModel: "test-model-20260720",
    usage: {
      input: 10,
      output: 5,
      cacheRead: 2,
      cacheWrite: 1,
      reasoning: 1,
      totalTokens: 15,
      cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
    },
    stopReason: "toolUse",
    timestamp: 1,
  };
}

describe("Pi AI adapter", () => {
  it("uses the real Pi model/context contract and returns normalized usage", async () => {
    const completeSimple = vi.fn(async (
      _model: Model<Api>,
      _context: Context,
      _options?: ModelsSimpleStreamOptions,
    ) => response());
    const models: PiModelsPort = {
      getModel: (provider, id) => provider === MODEL.provider && id === MODEL.id ? MODEL : undefined,
      completeSimple,
    };
    const onTextDelta = vi.fn();
    const adapter = createPiAiAdapter({
      provider: MODEL.provider,
      model: MODEL.id,
      models,
    });

    const result = await adapter.next({
      system: "Use governed tools.",
      messages: [{ role: "user", content: "Inspect artifact a-1", timestamp: 10 }],
      tools: [{
        name: "artifact.inspect",
        description: "Inspect an artifact",
        inputJsonSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
      }],
      onTextDelta,
      maxTokens: 300,
    });

    expect(completeSimple).toHaveBeenCalledOnce();
    expect(completeSimple.mock.calls[0]?.[1]).toMatchObject({
      systemPrompt: "Use governed tools.",
      messages: [{ role: "user", content: "Inspect artifact a-1", timestamp: 10 }],
      tools: [{ name: "artifact.inspect" }],
    });
    expect(result).toMatchObject({
      text: "I will inspect it.",
      done: false,
      stopReason: "toolUse",
      toolCalls: [{ id: "call-1", tool: "artifact.inspect", args: { id: "a-1" } }],
      usage: { inputTokens: 10, outputTokens: 5, modelCalls: 1, costUsd: 0.03, costKind: "estimated" },
      route: { adapter: "pi-ai", provider: "test-provider", requestedModel: "test-model" },
    });
    expect(onTextDelta).toHaveBeenCalledWith("I will inspect it.");
  });

  it("fails honestly when the configured model is unavailable", async () => {
    const adapter = createPiAiAdapter({
      provider: "missing",
      model: "missing",
      models: { getModel: () => undefined, completeSimple: vi.fn() },
    });

    await expect(adapter.next({ system: "", messages: [] })).rejects.toMatchObject({
      code: "model_not_found",
    } satisfies Partial<PiAiAdapterError>);
  });

  it("forwards native Pi text deltas without replaying the completed text", async () => {
    const final = response();
    const streamSimple = vi.fn(() => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({ type: "text_delta", contentIndex: 0, delta: "I will ", partial: final });
        stream.push({ type: "text_delta", contentIndex: 0, delta: "inspect it.", partial: final });
        stream.push({ type: "done", reason: "toolUse", message: final });
      });
      return stream;
    });
    const onTextDelta = vi.fn();
    const adapter = createPiAiAdapter({
      provider: MODEL.provider,
      model: MODEL.id,
      models: {
        getModel: () => MODEL,
        completeSimple: vi.fn(),
        streamSimple,
      },
    });

    const result = await adapter.next({
      system: "Use governed tools.",
      messages: [{ role: "user", content: "Inspect artifact a-1" }],
      onTextDelta,
    });

    expect(streamSimple).toHaveBeenCalledOnce();
    expect(onTextDelta.mock.calls).toEqual([["I will "], ["inspect it."]]);
    expect(result.text).toBe("I will inspect it.");
  });
});


// These scenarios exercise the SDK's own terminal-event/result primitive, without
// asking any provider to produce the fixture. A fulfilled SDK result can fail.
function sdkStream(final: AssistantMessage, deltas: string[] = []) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    for (const delta of deltas) {
      stream.push({ type: "text_delta", contentIndex: 0, delta, partial: final });
    }
    if (final.stopReason === "error" || final.stopReason === "aborted") {
      stream.push({ type: "error", reason: final.stopReason, error: final });
    } else {
      stream.push({ type: "done", reason: final.stopReason, message: final });
    }
  });
  return stream;
}

function textResponse(stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
  return { ...response(), content: [{ type: "text", text: "Reviewed artifact." }], stopReason };
}

function adapterFor(final: AssistantMessage) {
  return createPiAiAdapter({
    provider: MODEL.provider,
    model: MODEL.id,
    models: {
      getModel: () => MODEL,
      completeSimple: async () => sdkStream(final).result(),
      streamSimple: () => sdkStream(final, ["Reviewed ", "artifact."]),
    },
  });
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network in an injected-port scenario"));
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("A runtime consumer must distinguish successful work from terminal failure", () => {
  it.each(["complete", "stream"] as const)("rejects SDK error and aborted outcomes in %s mode, retaining usage", async (mode) => {
    for (const stopReason of ["error", "aborted"] as const) {
      const final = { ...textResponse(stopReason), errorMessage: `fixture ${stopReason}` };
      // Real SDK result() fulfills this message. The adapter must interpret it.
      await expect(sdkStream(final).result()).resolves.toEqual(final);
      const pending = adapterFor(final).next({
        system: "Review one artifact", messages: [],
        onTextDelta: mode === "stream" ? vi.fn() : undefined,
      });
      await expect(pending).rejects.toBeInstanceOf(PiAiAdapterError);
      await expect(pending).rejects.toMatchObject({
        code: stopReason === "aborted" ? "aborted" : "provider_error",
        stopReason,
        usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.03, costKind: "estimated" },
      });
    }
  });

  it.each(["complete", "stream"] as const)("requires natural stop for done in %s mode", async (mode) => {
    for (const final of [textResponse(), textResponse("length"), response(), { ...response(), stopReason: "stop" as const }]) {
      const result = await adapterFor(final).next({
        system: "Review and dispatch tools", messages: [],
        onTextDelta: mode === "stream" ? vi.fn() : undefined,
      });
      expect(result.done).toBe(final.stopReason === "stop" && final.content.every((part) => part.type !== "toolCall"));
      expect(result.stopReason).toBe(final.stopReason);
    }
  });

  it("preserves measured usage and marks real SDK rate calculations estimated, including configured zero rates", async () => {
    for (const rates of [MODEL.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }]) {
      const final = textResponse();
      const cost = calculateCost({ ...MODEL, cost: rates }, final.usage);
      const result = await adapterFor(final).next({ system: "Review", messages: [] });
      expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, cachedInputTokens: 2,
        cacheCreationInputTokens: 1, reasoningTokens: 1, modelCalls: 1, costKind: "estimated", costUsd: cost.total });
      expect(result.usage.costUsd).toBe(final.usage.cost.total);
    }
  });

  it("retains a thrown provider cause instead of returning done", async () => {
    const cause = new Error("offline transport failed");
    const adapter = createPiAiAdapter({ provider: MODEL.provider, model: MODEL.id, models: {
      getModel: () => MODEL, completeSimple: async () => { throw cause; },
    } });
    await expect(adapter.next({ system: "Review", messages: [] })).rejects.toMatchObject({ code: "provider_error", cause });
  });

  it.each(["complete", "stream"] as const)("rejects the consumer's text callback failure in %s mode", async (mode) => {
    const cause = new Error("consumer stopped accepting text");
    const final = textResponse();
    let streamSignal: AbortSignal | undefined;
    let stream: ReturnType<typeof createAssistantMessageEventStream> | undefined;
    const models: PiModelsPort = {
      getModel: () => MODEL,
      completeSimple: async () => sdkStream(final).result(),
      ...(mode === "stream" ? { streamSimple: (_m: Model<Api>, _c: Context, options?: ModelsSimpleStreamOptions) => {
        streamSignal = options?.signal;
        stream = createAssistantMessageEventStream();
        queueMicrotask(() => stream?.push({ type: "text_delta", contentIndex: 0, delta: "partial", partial: final }));
        return stream;
      } } : {}),
    };
    const adapter = createPiAiAdapter({ provider: MODEL.provider, model: MODEL.id, models });
    const pending = adapter.next({ system: "Review", messages: [], onTextDelta: async () => { throw cause; } });
    await expect(pending).rejects.toMatchObject({ code: "callback_error", cause });
    if (mode === "stream") {
      expect(streamSignal?.aborted).toBe(true);
      // A rejected callback ends its owned stream, so later producer pushes do
      // not accumulate and the async consumer does not remain waiting.
      stream!.push({ type: "text_delta", contentIndex: 0, delta: "late", partial: final });
      await expect(stream![Symbol.asyncIterator]().next()).resolves.toMatchObject({ done: true });
    }
  });

  it("passes a caller cancellation to the SDK and rejects its aborted terminal message", async () => {
    const caller = new AbortController();
    const final = { ...textResponse("aborted"), errorMessage: "caller cancelled" };
    const adapter = createPiAiAdapter({ provider: MODEL.provider, model: MODEL.id, models: {
      getModel: () => MODEL,
      completeSimple: vi.fn(),
      streamSimple: (_model, _context, options) => {
        const stream = createAssistantMessageEventStream();
        options?.signal?.addEventListener("abort", () => {
          stream.push({ type: "error", reason: "aborted", error: final });
        }, { once: true });
        queueMicrotask(() => caller.abort());
        return stream;
      },
    } });
    await expect(adapter.next({ system: "Review", messages: [], signal: caller.signal, onTextDelta: vi.fn() }))
      .rejects.toMatchObject({ code: "aborted", stopReason: "aborted" });
  });

  it("isolates 16 interleaved streams and 32 later requests, including failures, with one lazy model loader", async () => {
    const contexts: string[] = [];
    const make = (model: Model<Api>, context: Context) => {
      const id = context.systemPrompt!;
      contexts.push(id);
      const final = { ...textResponse(id.endsWith("-fail") ? "error" : "stop"), model: model.id,
        responseModel: model.id, content: [{ type: "text" as const, text: id }] };
      return sdkStream(final, [id.slice(0, 3), id.slice(3)]);
    };
    const models: PiModelsPort = { getModel: (provider, id) => ({ ...MODEL, provider, id }),
      completeSimple: async (model, context) => make(model, context).result(), streamSimple: make };
    const loadModels = vi.fn(async () => models);
    const adapter = createPiAiAdapter({ provider: MODEL.provider, model: MODEL.id, loadModels });
    const exercise = async (i: number) => {
      const fails = i % 7 === 0;
      const id = `request-${i}${fails ? "-fail" : ""}`;
      const deltas: string[] = [];
      const pending = adapter.next({ system: id, messages: [], route: { provider: MODEL.provider, model: `route-${i}` },
        onTextDelta: (text) => { deltas.push(text); } });
      if (fails) await expect(pending).rejects.toMatchObject({ code: "provider_error", stopReason: "error" });
      else await expect(pending).resolves.toMatchObject({ text: id, done: true, route: { requestedModel: `route-${i}`, responseModel: `route-${i}` } });
      expect(deltas.join("")).toBe(id);
    };
    await Promise.all(Array.from({ length: 16 }, (_, i) => exercise(i)));
    for (let i = 16; i < 48; i++) await exercise(i);
    expect(loadModels).toHaveBeenCalledOnce();
    expect(contexts).toHaveLength(48);
    expect(new Set(contexts).size).toBe(48);
  });
});
