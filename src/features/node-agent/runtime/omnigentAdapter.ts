/**
 * Omnigent compatibility checks for NodeAgent.
 *
 * This validates repo-local YAML shape and proof commands without requiring
 * the Omnigent CLI. The outer harness can be proven with `omni run ...`; this
 * adapter proves the NodeAgent side is runnable and coding-agent friendly.
 */

export type OmnigentProfile = "worker" | "reviewer";

export interface OmnigentSpecTarget {
  profile: OmnigentProfile;
  path: string;
  expectedName: string;
  requiredCommands: string[];
}

export interface OmnigentSpecAnalysis {
  ok: boolean;
  path: string;
  profile: OmnigentProfile;
  name?: string;
  executorHarness?: string;
  osEnvType?: string;
  cwd?: string;
  hasPromptOrInstructions: boolean;
  hasBoundary: boolean;
  hasSecretLiteral: boolean;
  requiredCommands: Array<{ command: string; present: boolean }>;
  runCommand: string;
  issues: string[];
}

export const OMNIGENT_NODEAGENT_TARGETS: OmnigentSpecTarget[] = [
  {
    profile: "worker",
    path: "examples/omnigent/nodeagent-worker.yaml",
    expectedName: "nodeagent_worker",
    requiredCommands: [
      "npm run nodeagent:frame:smoke",
      "npm run nodeagent:durable:smoke",
      "npm run nodeagent:sqlite:smoke",
      "npm run omnigent:nodeagent:smoke",
      "npm run prepush",
    ],
  },
  {
    profile: "reviewer",
    path: "examples/omnigent/nodeagent-reviewer.yaml",
    expectedName: "nodeagent_reviewer",
    requiredCommands: [],
  },
];

const SECRET_LITERAL_PATTERN = /\b(?:OPENAI|OPENROUTER|ANTHROPIC|GEMINI|CONVEX|DATABRICKS|CURSOR)_[A-Z0-9_]*(?:API_)?KEY\s*[:=]\s*["']?[A-Za-z0-9_\-.]{12,}/;

function linesOf(text: string) {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function indentOf(line: string) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function stripQuotes(value: string) {
  return value.trim().replace(/^["']|["']$/g, "");
}

function topLevelScalar(text: string, key: string) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  return match?.[1] ? stripQuotes(match[1]) : undefined;
}

function blockForKey(text: string, key: string) {
  const lines = linesOf(text);
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*(?:$|#)`).test(line));
  if (start < 0) return "";
  const baseIndent = indentOf(lines[start] ?? "");
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() && indentOf(line) <= baseIndent) break;
    block.push(line);
  }
  return block.join("\n");
}

function scalarInBlock(block: string, key: string) {
  const match = block.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, "m"));
  return match?.[1] ? stripQuotes(match[1]) : undefined;
}

function hasPromptOrInstructions(text: string) {
  return /^prompt:\s*(?:\||>|\S)/m.test(text) || /^instructions:\s*(?:\||>|\S)/m.test(text);
}

export function analyzeOmnigentSpec(args: {
  path: string;
  profile: OmnigentProfile;
  text: string;
}): OmnigentSpecAnalysis {
  const target = OMNIGENT_NODEAGENT_TARGETS.find((candidate) => candidate.profile === args.profile);
  const executor = blockForKey(args.text, "executor");
  const osEnv = blockForKey(args.text, "os_env");
  const name = topLevelScalar(args.text, "name");
  const executorHarness = scalarInBlock(executor, "harness");
  const osEnvType = scalarInBlock(osEnv, "type");
  const cwd = scalarInBlock(osEnv, "cwd");
  const requiredCommands = (target?.requiredCommands ?? []).map((command) => ({
    command,
    present: args.text.includes(command),
  }));
  const issues: string[] = [];
  const hasBoundary = /NodeAgent owns/i.test(args.text)
    && /Omnigent (?:stays|is only|remains|outer)/i.test(args.text);
  const hasSecretLiteral = SECRET_LITERAL_PATTERN.test(args.text);

  if (!name) issues.push("missing top-level name");
  if (target && name !== target.expectedName) issues.push(`expected name ${target.expectedName}`);
  if (!hasPromptOrInstructions(args.text)) issues.push("missing prompt or instructions");
  if (!executorHarness) issues.push("missing executor.harness");
  if (osEnvType !== "caller_process") issues.push("os_env.type must be caller_process");
  if (cwd !== ".") issues.push("os_env.cwd must be .");
  if (!hasBoundary) issues.push("missing NodeAgent/Omnigent ownership boundary");
  if (hasSecretLiteral) issues.push("contains an inline secret-looking value");
  for (const command of requiredCommands) {
    if (!command.present) issues.push(`missing required command: ${command.command}`);
  }

  return {
    ok: issues.length === 0,
    path: args.path,
    profile: args.profile,
    name,
    executorHarness,
    osEnvType,
    cwd,
    hasPromptOrInstructions: hasPromptOrInstructions(args.text),
    hasBoundary,
    hasSecretLiteral,
    requiredCommands,
    runCommand: `omni run ${args.path}`,
    issues,
  };
}

export function summarizeOmnigentAnalysis(analysis: OmnigentSpecAnalysis) {
  const commandCount = analysis.requiredCommands.length
    ? `${analysis.requiredCommands.filter((command) => command.present).length}/${analysis.requiredCommands.length} commands`
    : "no command requirements";
  return `${analysis.path}: ${analysis.ok ? "PASS" : "FAIL"} name=${analysis.name ?? "missing"} harness=${analysis.executorHarness ?? "missing"} ${commandCount}`;
}
