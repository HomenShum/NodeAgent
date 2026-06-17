import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

interface SmokeReport {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  targetDir: string;
  requiredFiles: string[];
  issues: string[];
  summary: {
    scaffoldCommand: string;
    apiKeysRequired: false;
    chatRuntime: "assistant-ui";
    autoVerified: boolean;
  };
}

const requiredFiles = [
  "package.json",
  "README.md",
  "AGENTS.md",
  ".env.example",
  "vite.config.mjs",
  "index.html",
  "public/nodeagent-chat-state.json",
  "src/main.jsx",
  "src/styles.css",
  "src/nodeagent-chat/NodeAgentChatApp.jsx",
  "src/nodeagent-chat/nodeAgentLocalAdapter.js",
  "src/nodeagent-chat/toolUIs.jsx",
  "scripts/run-chat-demo.mjs",
  "scripts/chat-ui-smoke.mjs",
  ".nodeagent/setup-receipt.json",
  "docs/eval/chat-ui-demo.json",
  "docs/eval/chat-ui-smoke.json",
];

function main() {
  const startedAt = new Date().toISOString();
  const options = parseArgs(process.argv.slice(2));
  const tempDir = mkdtempSync(join(tmpdir(), "nodeagent-chat-ui-"));
  const targetDir = join(tempDir, "app");
  const scaffoldArgs = ["bin/nodeagent.mjs", "apps", "scaffold", "chat-ui", "--dir", targetDir, "--force", "--auto"];
  const result = spawnSync(process.execPath, scaffoldArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  const issues: string[] = [];
  if (result.status !== 0) {
    issues.push(`scaffold command failed: ${[result.stdout, result.stderr].join("\n").slice(-1600)}`);
  }

  for (const file of requiredFiles) {
    if (!existsSync(join(targetDir, file))) issues.push(`missing ${file}`);
  }

  if (issues.length === 0) {
    validateGeneratedApp(targetDir, issues);
  }
  validateCliContract(issues);

  const report: SmokeReport = {
    ok: issues.length === 0,
    startedAt,
    completedAt: new Date().toISOString(),
    targetDir,
    requiredFiles,
    issues,
    summary: {
      scaffoldCommand: "nodeagent apps scaffold chat-ui --dir nodeagent-chat-ui --auto",
      apiKeysRequired: false,
      chatRuntime: "assistant-ui",
      autoVerified: true,
    },
  };

  if (options["json-out"]) writeJson(options["json-out"], report);

  if (report.ok) {
    console.log(`chat ui scaffold smoke: PASS ${requiredFiles.length} files`);
  } else {
    console.error("chat ui scaffold smoke: FAIL");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
  }

  if (tempDir.startsWith(tmpdir())) rmSync(tempDir, { recursive: true, force: true });
}

function validateGeneratedApp(targetDir: string, issues: string[]) {
  const packageJson = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const app = readFileSync(join(targetDir, "src/nodeagent-chat/NodeAgentChatApp.jsx"), "utf8");
  const adapter = readFileSync(join(targetDir, "src/nodeagent-chat/nodeAgentLocalAdapter.js"), "utf8");
  const tools = readFileSync(join(targetDir, "src/nodeagent-chat/toolUIs.jsx"), "utf8");
  const readme = readFileSync(join(targetDir, "README.md"), "utf8");
  const setupReceipt = JSON.parse(readFileSync(join(targetDir, ".nodeagent/setup-receipt.json"), "utf8")) as {
    ok?: boolean;
    apiKeysRequired?: boolean;
    phases?: Array<{ name: string; ok: boolean }>;
  };

  for (const script of ["dev", "agent:demo", "smoke", "build"]) {
    if (!packageJson.scripts?.[script]) issues.push(`package.json missing ${script} script`);
  }
  for (const dependency of ["@assistant-ui/react", "lucide-react", "react", "react-dom"]) {
    if (!packageJson.dependencies?.[dependency]) issues.push(`package.json missing ${dependency}`);
  }
  for (const required of ["AssistantRuntimeProvider", "useLocalRuntime", "data-nodeagent-chat", "NodeAgentToolUIs"]) {
    if (!app.includes(required)) issues.push(`NodeAgentChatApp.jsx missing ${required}`);
  }
  for (const required of ["apiKeysRequired: false", "collect_context", "search_synthesize", "apply_model_delta", "write_memo"]) {
    if (!adapter.includes(required)) issues.push(`nodeAgentLocalAdapter.js missing ${required}`);
  }
  for (const required of ["makeAssistantToolUI", "collect_context", "search_synthesize", "apply_model_delta", "write_memo"]) {
    if (!tools.includes(required)) issues.push(`toolUIs.jsx missing ${required}`);
  }
  for (const required of ["## No API Keys", "## Chat Runtime", "npm run agent:demo", "npm run build"]) {
    if (!readme.includes(required)) issues.push(`README.md missing ${required}`);
  }
  if (setupReceipt.ok !== true) issues.push("setup receipt did not pass");
  if (setupReceipt.apiKeysRequired !== false) issues.push("setup receipt should not require API keys");
  for (const phase of ["install", "agent demo", "smoke", "build"]) {
    if (!setupReceipt.phases?.some((item) => item.name === phase && item.ok)) issues.push(`setup receipt missing successful ${phase}`);
  }
}

function validateCliContract(issues: string[]) {
  const cli = readFileSync("scripts/nodeagent-cli.ts", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    bin?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  for (const required of ["chat-ui", "examples/apps/chat-ui/template", "nodeagent-chat-ui", "assistant-ui chat scaffold"]) {
    if (!cli.includes(required)) issues.push(`nodeagent-cli.ts missing ${required}`);
  }
  if (packageJson.bin?.nodeagent !== "./bin/nodeagent.mjs") issues.push("package.json missing nodeagent bin");
  if (packageJson.dependencies?.tsx) issues.push("package.json should not ship tsx in production dependencies");
}

function parseArgs(args: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function writeJson(path: string, value: unknown) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
