import { afterEach, describe, expect, it, vi } from "vitest";

import {
  callProvider,
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("live provider smoke request shape", () => {
  it("defaults resolve to the §1.2 wire ids", () => {
    vi.stubEnv("NODEAGENT_LIVE_MODEL", undefined);
    vi.stubEnv("NODEAGENT_OPENAI_MODEL", undefined);
    vi.stubEnv("NODEAGENT_ANTHROPIC_MODEL", undefined);
    vi.stubEnv("NODEAGENT_GEMINI_MODEL", undefined);
    vi.stubEnv("NODEAGENT_OPENROUTER_MODEL_PRIORITY", undefined);
    vi.stubEnv("NODEAGENT_OPENROUTER_MODEL", undefined);
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
        { type: "thinking", thinking: "NODEAGENT_LIVE_NO" },
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
