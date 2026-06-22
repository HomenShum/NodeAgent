import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Provider = "openrouter" | "openai" | "anthropic" | "gemini";

type SmokeReport = {
  ok: boolean;
  skipped?: boolean;
  startedAt: string;
  completedAt: string;
  provider: Provider | "none";
  model: string;
  modelCandidates?: string[];
  envFilesLoaded: string[];
  convex: {
    configured: boolean;
    urlReachable?: boolean;
    status?: number;
    error?: string;
  };
  llm: {
    ok: boolean;
    ms: number;
    expected: string;
    receivedPreview: string;
    error?: string;
    attemptedModels?: string[];
  };
};

const EXPECTED = "NODEAGENT_LIVE_OK";
const OPENROUTER_OPEN_MODEL_PRIORITY = [
  "z-ai/glm-5.2",
  "moonshotai/kimi-k2.7-code",
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nex-agi/nex-n2-pro",
] as const;

async function main() {
  const startedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));
  const envFilesLoaded = loadEnvFiles([
    ".env.local",
    ".env",
    ...asArray(args["env-file"]),
  ]);
  if (args["skip-if-missing"] && !hasAnyProviderKey()) {
    const convex = await probeConvexUrl();
    const report: SmokeReport = {
      ok: true,
      skipped: true,
      startedAt,
      completedAt: new Date().toISOString(),
      provider: "none",
      model: "none",
      envFilesLoaded,
      convex,
      llm: {
        ok: true,
        ms: 0,
        expected: EXPECTED,
        receivedPreview: "skipped: no provider key configured",
      },
    };
    if (args["json-out"]) writeJson(args["json-out"], report);
    console.log("nodeagent live provider smoke: SKIP no provider key configured");
    return;
  }
  const provider = selectProvider(args.provider);
  const modelCandidates = selectModelCandidates(provider, args.model);
  const convex = await probeConvexUrl();
  const { model, llm } = await probeLlm(provider, modelCandidates);
  const report: SmokeReport = {
    ok: llm.ok && (!convex.configured || convex.urlReachable === true),
    startedAt,
    completedAt: new Date().toISOString(),
    provider,
    model,
    modelCandidates,
    envFilesLoaded,
    convex,
    llm,
  };

  if (args["json-out"]) writeJson(args["json-out"], report);
  console.log([
    `nodeagent live provider smoke: ${report.ok ? "PASS" : "FAIL"}`,
    `provider=${provider}`,
    `model=${model}`,
    `convex=${convex.configured ? (convex.urlReachable ? "reachable" : "unreachable") : "not_configured"}`,
    `llmMs=${llm.ms}`,
  ].join(" "));
  if (!report.ok) {
    if (convex.error) console.error(`convex: ${convex.error}`);
    if (llm.error) console.error(`llm: ${llm.error}`);
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]) {
  const parsed: Record<string, string | string[]> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined && value && !value.startsWith("--")) index += 1;
    const current = parsed[rawKey];
    if (current === undefined) parsed[rawKey] = value ?? "true";
    else parsed[rawKey] = [...asArray(current), value ?? "true"];
  }
  return parsed;
}

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function loadEnvFiles(files: string[]) {
  const loaded: string[] = [];
  for (const raw of files) {
    const path = resolve(raw);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key]) continue;
      process.env[key] = match[2].replace(/^["']|["']$/g, "");
    }
    loaded.push(displayEnvPath(path));
  }
  return loaded;
}

function displayEnvPath(path: string) {
  const rel = relative(process.cwd(), path);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.replace(/\\/g, "/");
  return `external:${basename(dirname(path))}/${basename(path)}`;
}

function selectProvider(raw?: string | string[]): Provider {
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const candidates: Provider[] = ["openrouter", "openai", "anthropic", "gemini"];
  if (requested && candidates.includes(requested as Provider)) return requested as Provider;
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) return "gemini";
  throw new Error("missing provider API key; set OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY");
}

function hasAnyProviderKey() {
  return !!(
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY
  );
}

function selectModelCandidates(provider: Provider, raw?: string | string[]) {
  const requested = Array.isArray(raw) ? raw[0] : raw;
  if (requested) return [requested];
  if (process.env.NODEAGENT_LIVE_MODEL) return [process.env.NODEAGENT_LIVE_MODEL];
  switch (provider) {
    case "openrouter":
      return parseModelPriority(process.env.NODEAGENT_OPENROUTER_MODEL_PRIORITY)
        ?? parseModelPriority(process.env.NODEAGENT_OPENROUTER_MODEL)
        ?? [...OPENROUTER_OPEN_MODEL_PRIORITY];
    case "openai":
      return [process.env.NODEAGENT_OPENAI_MODEL ?? "gpt-5.5"];
    case "anthropic":
      return [process.env.NODEAGENT_ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest"];
    case "gemini":
      return [process.env.NODEAGENT_GEMINI_MODEL ?? "gemini-2.0-flash"];
  }
}

function parseModelPriority(raw?: string) {
  const values = raw?.split(",").map((value) => value.trim()).filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

async function probeConvexUrl(): Promise<SmokeReport["convex"]> {
  const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!url) return { configured: false };
  try {
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
    return { configured: true, urlReachable: response.status < 500, status: response.status };
  } catch (error) {
    return { configured: true, urlReachable: false, error: sanitizeError(error) };
  }
}

async function probeLlm(provider: Provider, models: string[]): Promise<{ model: string; llm: SmokeReport["llm"] }> {
  const attemptedModels: string[] = [];
  let last: { model: string; llm: SmokeReport["llm"] } | undefined;
  for (const model of models) {
    attemptedModels.push(model);
    const started = Date.now();
    try {
      const text = await callProvider(provider, model);
      const ok = text.includes(EXPECTED);
      const llm = {
        ok,
        ms: Date.now() - started,
        expected: EXPECTED,
        receivedPreview: text.replace(/\s+/g, " ").slice(0, 120),
        attemptedModels: [...attemptedModels],
        ...(ok ? {} : { error: `expected ${EXPECTED}` }),
      };
      last = { model, llm };
      if (ok) return last;
    } catch (error) {
      last = {
        model,
        llm: {
          ok: false,
          ms: Date.now() - started,
          expected: EXPECTED,
          receivedPreview: "",
          attemptedModels: [...attemptedModels],
          error: sanitizeError(error),
        },
      };
    }
  }
  return last ?? {
    model: "none",
    llm: {
      ok: false,
      ms: 0,
      expected: EXPECTED,
      receivedPreview: "",
      attemptedModels,
      error: "no model candidates configured",
    },
  };
}

async function callProvider(provider: Provider, model: string) {
  switch (provider) {
    case "openrouter":
      return openAiCompatibleChat({
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: requiredEnv("OPENROUTER_API_KEY"),
        model,
        headers: { "HTTP-Referer": "https://nodeagent.local", "X-Title": "NodeAgent live provider smoke" },
      });
    case "openai":
      return openAiCompatibleChat({
        url: "https://api.openai.com/v1/chat/completions",
        key: requiredEnv("OPENAI_API_KEY"),
        model,
      });
    case "anthropic":
      return anthropicMessages(model);
    case "gemini":
      return geminiGenerate(model);
  }
}

async function openAiCompatibleChat(args: { url: string; key: string; model: string; headers?: Record<string, string> }) {
  const response = await fetch(args.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.key}`,
      ...args.headers,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: "system", content: "You are a smoke test. Follow the user instruction exactly." },
        { role: "user", content: `Reply with exactly: ${EXPECTED}` },
      ],
      temperature: 0,
      max_tokens: 16,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`provider_http_${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  return String(json.choices?.[0]?.message?.content ?? "");
}

async function anthropicMessages(model: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": requiredEnv("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: "You are a smoke test. Follow the user instruction exactly.",
      messages: [{ role: "user", content: `Reply with exactly: ${EXPECTED}` }],
      max_tokens: 16,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`provider_http_${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  return String(json.content?.map((part: { text?: string }) => part.text ?? "").join("") ?? "");
}

async function geminiGenerate(model: string) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || requiredEnv("GEMINI_API_KEY");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `Reply with exactly: ${EXPECTED}` }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`provider_http_${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  return String(json.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "");
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sanitizeError(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of Object.values(process.env)) {
    if (value && value.length > 12) message = message.replaceAll(value, "[redacted]");
  }
  return message.replace(/\s+/g, " ").slice(0, 500);
}

function writeJson(path: string | string[], value: unknown) {
  const target = Array.isArray(path) ? path[0] : path;
  const parent = dirname(target);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(sanitizeError(error));
    process.exit(1);
  });
}
