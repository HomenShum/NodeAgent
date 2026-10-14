import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callProvider,
  probeLlm,
  receiptIdentity,
  selectModelCandidates,
} from "../scripts/nodeagent-live-provider-smoke";

// Spec: model-defaults SPEC Part A §A.2 (NodeAgent), §1.2 wire ids, §1.3 request shapes.
// Each case builds the real request through the script's own provider builder with a
// fake fetch and inspects the JSON body the provider would receive.
const SAMPLING_KEYS = ["temperature", "top_p", "top_k", "topP", "topK"];

type Captured = { url: string; body: Record<string, any> };

function fakeFetch(responseBody: unknown): { captured: Captured[] } {
  const captured: Captured[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      captured.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify(responseBody), { status: 200 });
    }),
  );
  return { captured };
}

beforeEach(() => {
  // Isolate from host overrides so default-resolution tests are hermetic.
  vi.stubEnv("NODEAGENT_LIVE_MODEL", undefined);
  vi.stubEnv("NODEAGENT_OPENAI_MODEL", undefined);
  vi.stubEnv("NODEAGENT_ANTHROPIC_MODEL", undefined);
  vi.stubEnv("NODEAGENT_GEMINI_MODEL", undefined);
  vi.stubEnv("NODEAGENT_OPENROUTER_MODEL_PRIORITY", undefined);
  vi.stubEnv("NODEAGENT_OPENROUTER_MODEL", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("live provider smoke request shape", () => {
  it("defaults resolve to the §1.2 wire ids", () => {
    expect(selectModelCandidates("openai")).toEqual(["gpt-6.1-sol"]);
    expect(selectModelCandidates("anthropic")).toEqual(["claude-haiku-5-5"]);
    expect(selectModelCandidates("gemini")).toEqual(["gemini-3.8-flash"]);
    // nex-agi/nex-n2-pro is absent from the OpenRouter catalog (2026-10-10); the rest are frozen.
    expect(selectModelCandidates("openrouter")).toEqual([
      "z-ai/glm-5.2",
      "moonshotai/kimi-k2.7-code",
      "cohere/north-mini-code:free",
      "nvidia/nemotron-3-ultra-550b-a55b",
    ]);
  });

  it("openai: gpt-6.1-sol body has max_completion_tokens + low effort, no sampling, no tools", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key-0000");
    const { captured } = fakeFetch({ choices: [{ message: { content: "NODEAGENT_LIVE_OK" } }] });
    const model = selectModelCandidates("openai")[0];
    expect(model).toBe("gpt-6.1-sol");
    await callProvider("openai", model);
    const { url, body } = captured[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(body.model).toBe("gpt-6.1-sol");
    for (const key of [...SAMPLING_KEYS, "tools", "tool_choice", "max_tokens"]) expect(body).not.toHaveProperty(key);
    expect(body.reasoning_effort).toBe("low");
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(256);
  });

  it("openrouter: no sampling params, token cap >= 256, no OpenAI-only fields", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key-0000");
    const { captured } = fakeFetch({ choices: [{ message: { content: "NODEAGENT_LIVE_OK" } }] });
    await callProvider("openrouter", "z-ai/glm-5.2");
    const { body } = captured[0];
    expect(body.model).toBe("z-ai/glm-5.2");
    for (const key of [...SAMPLING_KEYS, "reasoning_effort", "max_completion_tokens"]) expect(body).not.toHaveProperty(key);
    expect(body.max_tokens).toBeGreaterThanOrEqual(256);
  });

  it("anthropic: claude-haiku-5-5 body has no sampling params and reads text blocks by type", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key-0000");
    const { captured } = fakeFetch({
      content: [
        { type: "thinking", text: "NODEAGENT_LIVE_NO" },
        { type: "text", text: "NODEAGENT_LIVE_OK" },
      ],
    });
    const model = selectModelCandidates("anthropic")[0];
    expect(model).toBe("claude-haiku-5-5");
    const text = await callProvider("anthropic", model);
    const { body } = captured[0];
    expect(body.model).toBe("claude-haiku-5-5");
    for (const key of [...SAMPLING_KEYS, "thinking", "tool_choice"]) expect(body).not.toHaveProperty(key);
    expect(body.max_tokens).toBeGreaterThanOrEqual(256);
    expect(body.messages.at(-1).role).toBe("user"); // no assistant prefill (400 on Haiku 5.5)
    expect(text).toBe("NODEAGENT_LIVE_OK");
    expect(text).not.toContain("NODEAGENT_LIVE_NO");
  });

  it("anthropic: stop_reason refusal throws provider_refusal instead of returning its text", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key-0000");
    fakeFetch({
      stop_reason: "refusal",
      content: [{ type: "text", text: "I cannot comply with the request to output NODEAGENT_LIVE_OK." }],
    });
    await expect(callProvider("anthropic", "claude-haiku-5-5")).rejects.toThrow("provider_refusal");
  });

  it("gemini: gemini-3.8-flash body has no sampling params and a >= 256 output cap", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key-0000");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    const { captured } = fakeFetch({ candidates: [{ content: { parts: [{ text: "NODEAGENT_LIVE_OK" }] } }] });
    const model = selectModelCandidates("gemini")[0];
    expect(model).toBe("gemini-3.8-flash");
    await callProvider("gemini", model);
    const { url, body } = captured[0];
    expect(url).toContain("/models/gemini-3.8-flash:generateContent");
    for (const key of SAMPLING_KEYS) {
      expect(body).not.toHaveProperty(key);
      expect(body.generationConfig).not.toHaveProperty(key);
    }
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(256);
    expect(body.contents.at(-1).role).toBe("user");
  });
});

// SPEC-v3 §A.0 rule 3: the receipt must record what the provider echoed, not what was requested.
describe("live provider smoke receipt (rule 3)", () => {
  it("records echoedModel, usage and cost per row when the provider answers with a different model", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key-0000");
    fakeFetch({
      model: "some/rerouted-model",
      choices: [{ message: { content: "NODEAGENT_LIVE_OK" } }],
      usage: { prompt_tokens: 20, completion_tokens: 8, cost: 0.0002 },
    });
    const { rows, budget } = await probeLlm("openrouter", ["z-ai/glm-5.2"]);
    expect(rows).toEqual([
      {
        requestedModel: "z-ai/glm-5.2",
        resolvedModel: "z-ai/glm-5.2",
        echoedModel: "some/rerouted-model",
        usage: { prompt_tokens: 20, completion_tokens: 8, cost: 0.0002 },
        costUsd: 0.0002,
        fallbackUsed: false,
      },
    ]);
    expect(budget).toMatchObject({ requests: 1, spentUsd: 0.0002, stoppedBy: null });
    const receipt = receiptIdentity(["--provider", "openrouter"], ["z-ai/glm-5.2"], rows, budget);
    expect(receipt.echoedModels).toEqual(["some/rerouted-model"]);
    expect(receipt.candidateIds).toEqual(["z-ai/glm-5.2"]);
    expect(receipt.testedCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(receipt.constantSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof receipt.gitDirty).toBe("boolean");
  });

  it("reads the echoed model from anthropic `model` and gemini `modelVersion`", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key-0000");
    fakeFetch({ model: "claude-other", content: [{ type: "text", text: "NODEAGENT_LIVE_OK" }], usage: { input_tokens: 9, output_tokens: 6 } });
    const anthropic = await probeLlm("anthropic", ["claude-haiku-5-5"]);
    expect(anthropic.rows[0]).toMatchObject({ echoedModel: "claude-other", usage: { input_tokens: 9, output_tokens: 6 }, costUsd: null });

    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key-0000");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    fakeFetch({ modelVersion: "gemini-other", candidates: [{ content: { parts: [{ text: "NODEAGENT_LIVE_OK" }] } }], usageMetadata: { totalTokenCount: 15 } });
    const gemini = await probeLlm("gemini", ["gemini-3.8-flash"]);
    expect(gemini.rows[0]).toMatchObject({ echoedModel: "gemini-other", usage: { totalTokenCount: 15 } });
  });

  it("marks fallbackUsed when the OpenRouter chain moves past index 0", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key-0000");
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        call += 1;
        const model = JSON.parse(init.body).model;
        if (call === 1) return new Response(JSON.stringify({ error: "down" }), { status: 503 });
        return new Response(JSON.stringify({ model, choices: [{ message: { content: "NODEAGENT_LIVE_OK" } }] }), { status: 200 });
      }),
    );
    const { rows } = await probeLlm("openrouter", ["a/first", "b/second"]);
    expect(rows.map((row) => [row.requestedModel, row.fallbackUsed])).toEqual([["a/first", false], ["b/second", true]]);
    expect(rows[0].echoedModel).toBeNull();
    expect(rows[1].echoedModel).toBe("b/second");
  });
});
