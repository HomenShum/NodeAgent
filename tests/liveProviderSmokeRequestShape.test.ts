import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lets one test run a hook right after the script's first `git rev-parse`, to move HEAD mid-call. Pass-through otherwise.
const gitHook = vi.hoisted(() => ({ afterRevParse: null as null | (() => void) }));
vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    execFileSync: ((file: string, args: string[], opts: object) => {
      const out = (real.execFileSync as any)(file, args, opts);
      if (args?.[0] === "rev-parse" && gitHook.afterRevParse) {
        const hook = gitHook.afterRevParse;
        gitHook.afterRevParse = null;
        hook();
      }
      return out;
    }) as typeof real.execFileSync,
  };
});

import {
  callProvider,
  gitIdentity,
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

// A throwaway git repo holding the smoke script, so identity tests never read or dirty the real checkout.
const tempRepos: string[] = [];
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "smoke-identity-"));
  tempRepos.push(dir);
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir });
  git("init", "-q");
  mkdirSync(join(dir, "scripts"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "scripts", "nodeagent-live-provider-smoke.ts"), "// constant\n");
  git("add", ".");
  git("commit", "-q", "-m", "init");
  return dir;
}
const BUDGET = { maxUsd: 0.1, estimateUsd: 0, spentUsd: 0, requests: 0, stoppedBy: null };

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
  for (const dir of tempRepos.splice(0)) rmSync(dir, { recursive: true, force: true });
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
    for (const key of [...SAMPLING_KEYS, "tools", "tool_choice", "max_tokens", "logprobs", "top_logprobs"]) expect(body).not.toHaveProperty(key);
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
    // SPEC-v3 §1.3 gemini-3.8-flash: thinking_budget removed, candidate_count unsupported.
    for (const key of ["thinkingBudget", "thinking_budget", "candidateCount", "candidate_count"]) {
      expect(body.generationConfig).not.toHaveProperty(key);
      expect(body.generationConfig.thinkingConfig ?? {}).not.toHaveProperty(key);
      expect(body).not.toHaveProperty(key);
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
    const receipt = receiptIdentity(["--provider", "openrouter"], ["z-ai/glm-5.2"], rows, budget, gitIdentity(makeRepo()));
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
  it("direct providers report no cost: spentUsd is null, never 0", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key-0000");
    fakeFetch({ model: "claude-haiku-5-5", content: [{ type: "text", text: "NODEAGENT_LIVE_OK" }], usage: { input_tokens: 30, output_tokens: 200 } });
    const { budget } = await probeLlm("anthropic", ["claude-haiku-5-5"]);
    expect(budget).toMatchObject({ requests: 1, spentUsd: null, stoppedBy: null });
  });

  it("reserves the per-request estimate before dispatch, so unreported cost cannot cross maxUsd", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key-0000");
    const { captured } = fakeFetch({ model: "m", content: [{ type: "text", text: "nope" }] });
    const { budget } = await probeLlm("anthropic", Array.from({ length: 12 }, (_, i) => `m${i}`));
    expect(captured).toHaveLength(10); // 10 x $0.01 estimate = $0.10 cap
    expect(budget).toMatchObject({ requests: 10, spentUsd: null, stoppedBy: "maxUsd" });
  });

  it("a refusal row still records echoedModel and usage, and the probe fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key-0000");
    fakeFetch({ stop_reason: "refusal", model: "claude-haiku-5-5", content: [{ type: "text", text: "NODEAGENT_LIVE_OK" }], usage: { input_tokens: 5, output_tokens: 1 } });
    const result = await probeLlm("anthropic", ["claude-haiku-5-5"]);
    expect(result.llm.ok).toBe(false);
    expect(result.rows[0]).toMatchObject({ error: "provider_refusal", echoedModel: "claude-haiku-5-5", usage: { input_tokens: 5, output_tokens: 1 } });
  });

  it("a successful reply that costs more than maxUsd stops the run", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key-0000");
    fakeFetch({ model: "m", choices: [{ message: { content: "NODEAGENT_LIVE_OK" } }], usage: { prompt_tokens: 5, completion_tokens: 5, cost: 0.11 } });
    const { llm, budget } = await probeLlm("openrouter", ["m"]);
    expect(llm.ok).toBe(true);
    expect(budget).toMatchObject({ spentUsd: 0.11, stoppedBy: "maxUsd" });
  });

  it("an over-budget reply still stops the run when an earlier attempt reported no cost", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key-0000");
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return new Response(JSON.stringify({ error: "down" }), { status: 503 }); // no cost
        return new Response(JSON.stringify({ model: "b/second", choices: [{ message: { content: "NODEAGENT_LIVE_OK" } }], usage: { cost: 0.11 } }), { status: 200 });
      }),
    );
    const { llm, budget } = await probeLlm("openrouter", ["a/first", "b/second"]);
    expect(llm.ok).toBe(true);
    expect(budget).toMatchObject({ requests: 2, spentUsd: null, stoppedBy: "maxUsd" }); // spentUsd stays null (a row is unknown); the known $0.11 still trips the cap
  });

  it("an unreported-cost failure counts at its estimate, so a $0.095 reply after it crosses maxUsd", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key-0000");
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return new Response(JSON.stringify({ error: "down" }), { status: 503 }); // no cost: counts $0.01
        return new Response(JSON.stringify({ model: "b/second", choices: [{ message: { content: "NODEAGENT_LIVE_OK" } }], usage: { cost: 0.095 } }), { status: 200 });
      }),
    );
    const { budget } = await probeLlm("openrouter", ["a/first", "b/second"]);
    expect(budget).toMatchObject({ requests: 2, spentUsd: null, stoppedBy: "maxUsd" }); // 0.01 + 0.095 = 0.105 > 0.10; reported-only total 0.095 would have hidden it
  });

  it("a missing credential counts no request and records no row", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { captured } = fakeFetch({});
    const { llm, rows, budget } = await probeLlm("anthropic", ["claude-haiku-5-5"]);
    expect(captured).toHaveLength(0);
    expect(llm.ok).toBe(false);
    expect(llm.error).toContain("ANTHROPIC_API_KEY is required");
    expect(rows).toEqual([]);
    expect(budget).toMatchObject({ requests: 0, spentUsd: 0 });
  });

  it("receipt command is shell-quoted so it replays: whitespace, semicolons, empty and quote characters survive", () => {
    const { command } = receiptIdentity(["--env-file", "D:/VSCode Projects/x.env", "--env-file", "a;b.env", "--model", "", "--note", "it's"], ["m"], [], BUDGET, gitIdentity(makeRepo()));
    expect(command).toBe("npx tsx scripts/nodeagent-live-provider-smoke.ts --env-file 'D:/VSCode Projects/x.env' --env-file 'a;b.env' --model '' --note 'it'\\''s'");
  }, 30_000);

  it("gitIdentity reads an isolated repo: clean, dirty from any cwd, and docs/eval receipt output is ignored", () => {
    const repo = makeRepo();
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    const clean = gitIdentity(repo);
    expect(clean).toMatchObject({ testedCommit: head, gitDirty: false });
    expect(clean.constantSha256).toBe(createHash("sha256").update("// constant\n").digest("hex")); // the committed blob, not just a 64-hex string

    execFileSync("git", ["config", "status.showUntrackedFiles", "no"], { cwd: repo }); // a user setting must not hide untracked files from the check
    mkdirSync(join(repo, "docs", "eval"));
    writeFileSync(join(repo, "docs", "eval", "receipt.json"), "{}"); // the receipt itself must not dirty the tree
    // Asserted before any root probe file exists, from the repo root and from docs/: a cwd-relative exclude would see docs/eval/receipt.json as dirty from docs/.
    expect([gitIdentity(repo).gitDirty, gitIdentity(join(repo, "docs")).gitDirty]).toEqual([false, false]);

    writeFileSync(join(repo, "probe.txt"), "x"); // untracked file at the repo root
    expect([gitIdentity(repo).gitDirty, gitIdentity(join(repo, "docs")).gitDirty]).toEqual([true, true]);
  }, 30_000); // ~20 git processes; the 5000 ms default timed out once under load

  it("gitIdentity hashes the sha it captured, not whatever HEAD is by the second git call", () => {
    const repo = makeRepo();
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
    const captured = git("rev-parse", "HEAD").toString().trim();
    gitHook.afterRevParse = () => {
      writeFileSync(join(repo, "scripts", "nodeagent-live-provider-smoke.ts"), "// moved\n");
      git("commit", "-qam", "move HEAD");
    };
    const id = gitIdentity(repo);
    expect(git("rev-parse", "HEAD").toString().trim()).not.toBe(captured); // HEAD really moved mid-call
    expect(id.testedCommit).toBe(captured);
    expect(id.constantSha256).toBe(createHash("sha256").update("// constant\n").digest("hex")); // commit A's blob, not the moved HEAD's "// moved\n"
  }, 30_000);

  it("gitIdentity throws outside a git checkout", () => {
    const notARepo = mkdtempSync(join(tmpdir(), "smoke-nogit-"));
    tempRepos.push(notARepo);
    vi.stubEnv("GIT_CEILING_DIRECTORIES", tmpdir());
    expect(() => gitIdentity(notARepo)).toThrow(/not a git repository/i);
  }, 30_000);
});
