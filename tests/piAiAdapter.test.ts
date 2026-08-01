import { describe, expect, it, vi } from "vitest";
import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  ModelsSimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

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
      usage: { inputTokens: 10, outputTokens: 5, modelCalls: 1, costUsd: 0.03, costKind: "exact" },
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
