import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Provider = "openrouter" | "openai" | "anthropic" | "gemini";

// SPEC-v3 §A.0 rule 3 receipt row: one per provider request, in chain order.
type ReceiptRow = {
  requestedModel: string;
  resolvedModel: string;
  echoedModel: string | null;
  usage: unknown;
  costUsd: number | null;
  fallbackUsed: boolean;
  error?: string;
};

type ProviderReply = { text: string; echoedModel: string | null; usage: unknown; costUsd: number | null; refusal?: true };

// Receipt fields added to the report. Absent on the skipped report (no run happened).
type Receipt = {
  command: string;
  candidateIds: string[];
  echoedModels: string[];
  rows: ReceiptRow[];
  testedCommit: string;
  gitDirty: boolean;
  constantSha256: string;
  // spentUsd is null when any dispatched request has no reported cost (direct OpenAI/Anthropic/Gemini replies carry none).
  budget: { maxUsd: number; estimateUsd: number; spentUsd: number | null; requests: number; stoppedBy: string | null };
  environment: { node: string; platform: string };
};

type SmokeReport = Partial<Receipt> & {
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
const SMOKE_MAX_TOKENS = 256;
// Receipt budget. The estimate is sized for the built-in and frozen ids (~30-token reply, 256-token cap; gpt-6.1-sol is ~$0.003). An operator-supplied NODEAGENT_OPENROUTER_MODEL_PRIORITY with pricier ids can overshoot maxUsd by up to one request; the run then ends stoppedBy:"maxUsd", ok:false.
const SMOKE_MAX_USD = 0.1;
const SMOKE_ESTIMATE_USD_PER_REQUEST = 0.01;
const SMOKE_SOURCE = "scripts/nodeagent-live-provider-smoke.ts";
const OPENROUTER_OPEN_MODEL_PRIORITY = [
  "z-ai/glm-5.2",
  "moonshotai/kimi-k2.7-code",
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3-ultra-550b-a55b",
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
  const identity = gitIdentity(); // before the first paid dispatch: a git failure must not follow spend, and the tested commit must not move mid-run
  const convex = await probeConvexUrl();
  const { model, llm, rows, budget } = await probeLlm(provider, modelCandidates);
  const report: SmokeReport = {
    ...receiptIdentity(process.argv.slice(2), modelCandidates, rows, budget, identity),
    ok: llm.ok && !budget.stoppedBy && (!convex.configured || convex.urlReachable === true),
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

export function selectModelCandidates(provider: Provider, raw?: string | string[]) {
  const requested = Array.isArray(raw) ? raw[0] : raw;
  if (requested) return [requested];
  if (process.env.NODEAGENT_LIVE_MODEL) return [process.env.NODEAGENT_LIVE_MODEL];
  switch (provider) {
    case "openrouter":
      return parseModelPriority(process.env.NODEAGENT_OPENROUTER_MODEL_PRIORITY)
        ?? parseModelPriority(process.env.NODEAGENT_OPENROUTER_MODEL)
        ?? [...OPENROUTER_OPEN_MODEL_PRIORITY];
    case "openai":
      return [process.env.NODEAGENT_OPENAI_MODEL ?? "gpt-6.1-sol"];
    case "anthropic":
      return [process.env.NODEAGENT_ANTHROPIC_MODEL ?? "claude-haiku-5-5"];
    case "gemini":
      return [process.env.NODEAGENT_GEMINI_MODEL ?? "gemini-3.8-flash"];
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

export async function probeLlm(provider: Provider, models: string[]) {
  const attemptedModels: string[] = [];
  const rows: ReceiptRow[] = [];
  const budget: Receipt["budget"] = {
    maxUsd: SMOKE_MAX_USD,
    estimateUsd: models.length * SMOKE_ESTIMATE_USD_PER_REQUEST,
    spentUsd: 0,
    requests: 0,
    stoppedBy: null,
  };
  try {
    providerKey(provider); // no credential, no request: nothing is counted or recorded for a call that was never made
  } catch (error) {
    return {
      model: models[0] ?? "none",
      llm: { ok: false, ms: 0, expected: EXPECTED, receivedPreview: "", attemptedModels, error: sanitizeError(error) },
      rows,
      budget,
    };
  }
  let last: { model: string; llm: SmokeReport["llm"] } | undefined;
  for (const [index, model] of models.entries()) {
    // Reserve before dispatch: a request with no reported cost counts at its estimate, so the cap holds for every provider at the flat estimate (see SMOKE_ESTIMATE_USD_PER_REQUEST for the operator-override caveat).
    const committedUsd = rows.reduce((sum, row) => sum + (row.costUsd ?? SMOKE_ESTIMATE_USD_PER_REQUEST), 0);
    if (committedUsd + SMOKE_ESTIMATE_USD_PER_REQUEST > budget.maxUsd) {
      budget.stoppedBy = "maxUsd";
      break;
    }
    attemptedModels.push(model);
    budget.requests += 1;
    const row: ReceiptRow = { requestedModel: model, resolvedModel: model, echoedModel: null, usage: null, costUsd: null, fallbackUsed: index > 0 };
    rows.push(row);
    const started = Date.now();
    try {
      const reply = await callProviderDetailed(provider, model);
      Object.assign(row, { echoedModel: reply.echoedModel, usage: reply.usage, costUsd: reply.costUsd });
      if (reply.refusal) throw new Error("provider_refusal"); // after the row captured model and usage
      const ok = reply.text.includes(EXPECTED);
      const llm = {
        ok,
        ms: Date.now() - started,
        expected: EXPECTED,
        receivedPreview: reply.text.replace(/\s+/g, " ").slice(0, 120),
        attemptedModels: [...attemptedModels],
        ...(ok ? {} : { error: `expected ${EXPECTED}` }),
      };
      last = { model, llm };
      if (ok) return { ...last, rows, budget };
      row.error = llm.error;
    } catch (error) {
      row.error = sanitizeError(error);
      last = {
        model,
        llm: {
          ok: false,
          ms: Date.now() - started,
          expected: EXPECTED,
          receivedPreview: "",
          attemptedModels: [...attemptedModels],
          error: row.error,
        },
      };
    } finally {
      budget.spentUsd = rows.every((row) => row.costUsd !== null) ? rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) : null;
      // Same accounting as the pre-dispatch reservation: a row with no reported cost counts at its estimate, so an unknown row cannot hide an overshoot.
      const committedUsd = rows.reduce((sum, row) => sum + (row.costUsd ?? SMOKE_ESTIMATE_USD_PER_REQUEST), 0);
      if (committedUsd > budget.maxUsd) budget.stoppedBy = "maxUsd";
    }
  }
  return {
    ...(last ?? {
      model: "none",
      llm: {
        ok: false,
        ms: 0,
        expected: EXPECTED,
        receivedPreview: "",
        attemptedModels,
        error: "no model candidates configured",
      },
    }),
    rows,
    budget,
  };
}

// testedCommit is `git rev-parse HEAD`. --untracked-files=all is explicit so a user's status.showUntrackedFiles=no cannot hide untracked files. Pathspecs are top-anchored so the dirty check does not depend on the caller's cwd. The dirty check ignores docs/eval, the evidence directory the receipt is written
// to (SPEC-v3 §A.0 rule 3, receipt-only commit), so running the four providers back to back does not dirty the tree.
// constantSha256 hashes this file as committed at HEAD; a reviewer recomputes it with
// `git show <testedCommit>:scripts/nodeagent-live-provider-smoke.ts | sha256sum`.
export type GitIdentity = Pick<Receipt, "testedCommit" | "gitDirty" | "constantSha256">;

export function gitIdentity(cwd: string = process.cwd()): GitIdentity {
  const git = (...args: string[]) => execFileSync("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return {
    testedCommit: git("rev-parse", "HEAD").toString().trim(),
    gitDirty: git("status", "--porcelain", "--untracked-files=all", "--", ":(top)", ":(top,exclude)docs/eval").toString().trim().length > 0,
    constantSha256: createHash("sha256").update(git("show", `HEAD:${SMOKE_SOURCE}`)).digest("hex"),
  };
}

// POSIX single-quote any argument that is not plainly safe, so the recorded command replays verbatim (`;`, empty and spaced arguments included).
function shellQuote(arg: string) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", String.raw`'\''`)}'`;
}

export function receiptIdentity(argv: string[], candidateIds: string[], rows: ReceiptRow[], budget: Receipt["budget"], identity: GitIdentity): Receipt {
  return {
    command: ["npx", "tsx", SMOKE_SOURCE, ...argv].map(shellQuote).join(" "),
    candidateIds,
    echoedModels: [...new Set(rows.flatMap((row) => (row.echoedModel ? [row.echoedModel] : [])))],
    rows,
    ...identity,
    budget,
    environment: { node: process.version, platform: process.platform },
  };
}

export async function callProvider(provider: Provider, model: string) {
  const reply = await callProviderDetailed(provider, model);
  if (reply.refusal) throw new Error("provider_refusal");
  return reply.text;
}

function providerKey(provider: Provider) {
  switch (provider) {
    case "openrouter":
      return requiredEnv("OPENROUTER_API_KEY");
    case "openai":
      return requiredEnv("OPENAI_API_KEY");
    case "anthropic":
      return requiredEnv("ANTHROPIC_API_KEY");
    case "gemini":
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY || requiredEnv("GEMINI_API_KEY");
  }
}

export async function callProviderDetailed(provider: Provider, model: string): Promise<ProviderReply> {
  const key = providerKey(provider);
  switch (provider) {
    case "openrouter":
      return openAiCompatibleChat({
        url: "https://openrouter.ai/api/v1/chat/completions",
        key,
        model,
        headers: { "HTTP-Referer": "https://nodeagent.local", "X-Title": "NodeAgent live provider smoke" },
      });
    case "openai":
      return openAiCompatibleChat({
        url: "https://api.openai.com/v1/chat/completions",
        key,
        model,
        openai: true,
      });
    case "anthropic":
      return anthropicMessages(model, key);
    case "gemini":
      return geminiGenerate(model, key);
  }
}

// No sampling params (removed on GPT-6, 400 on Haiku 5.5). The cap is 256, not 16, because reasoning
// models spend output tokens before the visible reply. `openai` selects the GPT-6 Chat Completions shape.
async function openAiCompatibleChat(args: { url: string; key: string; model: string; headers?: Record<string, string>; openai?: boolean }): Promise<ProviderReply> {
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
      ...(args.openai
        ? { max_completion_tokens: SMOKE_MAX_TOKENS, reasoning_effort: "low" }
        : { max_tokens: SMOKE_MAX_TOKENS }),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`provider_http_${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  return {
    text: String(json.choices?.[0]?.message?.content ?? ""),
    echoedModel: typeof json.model === "string" ? json.model : null,
    usage: json.usage ?? null,
    costUsd: typeof json.usage?.cost === "number" ? json.usage.cost : null, // only OpenRouter reports cost
  };
}

async function anthropicMessages(model: string, key: string): Promise<ProviderReply> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: "You are a smoke test. Follow the user instruction exactly.",
      messages: [{ role: "user", content: `Reply with exactly: ${EXPECTED}` }],
      max_tokens: SMOKE_MAX_TOKENS,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`provider_http_${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  // Haiku 5.5 can answer 200 with stop_reason "refusal"; flag it before reading content so a refusal never passes,
  // while still returning model and usage for the receipt row. Callers must reject `refusal`.
  const refusal = json.stop_reason === "refusal";
  return {
    ...(refusal ? { refusal: true as const } : {}),
    text: refusal ? "" : String(json.content?.filter((part: { type?: string }) => part.type === "text").map((part: { text?: string }) => part.text ?? "").join("") ?? ""),
    echoedModel: typeof json.model === "string" ? json.model : null,
    usage: json.usage ?? null,
    costUsd: null,
  };
}

async function geminiGenerate(model: string, key: string): Promise<ProviderReply> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `Reply with exactly: ${EXPECTED}` }] }],
      generationConfig: { maxOutputTokens: SMOKE_MAX_TOKENS },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`provider_http_${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  return {
    text: String(json.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? ""),
    echoedModel: typeof json.modelVersion === "string" ? json.modelVersion : null,
    usage: json.usageMetadata ?? null,
    costUsd: null,
  };
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
