#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { Command } from "commander";
import { intro, log, note, outro, spinner } from "@clack/prompts";

type AdapterId = "sqlite-local" | "convex" | "aws-dynamodb" | "postgres" | "cloudflare";

interface AdapterInfo {
  id: AdapterId;
  label: string;
  status: "runnable" | "blueprint";
  guide: string;
  credentials: string[];
  smoke?: string;
}

interface TimedPhase {
  name: string;
  ok: boolean;
  durationMs: number;
  detail: string;
}

interface HappyPathReport {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  totalMs: number;
  phases: TimedPhase[];
  summary: {
    provider: "sqlite-local";
    credentialRequired: false;
    command: string;
  };
}

interface AppSetupPhase {
  name: string;
  command: string;
  ok: boolean;
  durationMs: number;
  detail: string;
}

interface AppSetupReceipt {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  totalMs: number;
  template: AppTemplateInfo["id"];
  targetDir: string;
  apiKeysRequired: false;
  phases: AppSetupPhase[];
  nextSteps: string[];
}

interface AppTemplateInfo {
  id: "local-dashboard";
  label: string;
  templateDir: string;
  defaultDir: string;
  credentials: string[];
  smoke: string;
}

const adapters: AdapterInfo[] = [
  {
    id: "sqlite-local",
    label: "SQLite local",
    status: "runnable",
    guide: "examples/adapters/sqlite-local/README.md",
    credentials: [],
    smoke: "nodeagent:sqlite:smoke",
  },
  {
    id: "convex",
    label: "Convex",
    status: "runnable",
    guide: "examples/adapters/convex/README.md",
    credentials: ["CONVEX_DEPLOYMENT", "VITE_CONVEX_URL", "CONVEX_DEPLOY_KEY"],
    smoke: "nodeagent:convex:smoke",
  },
  {
    id: "aws-dynamodb",
    label: "AWS DynamoDB/SQS/S3",
    status: "blueprint",
    guide: "examples/adapters/aws-dynamodb/README.md",
    credentials: ["AWS_REGION", "AWS_PROFILE", "NODEAGENT_ARTIFACT_BUCKET", "NODEAGENT_QUEUE_URL"],
  },
  {
    id: "postgres",
    label: "Postgres",
    status: "blueprint",
    guide: "examples/adapters/postgres/README.md",
    credentials: ["DATABASE_URL", "NODEAGENT_SCHEMA"],
  },
  {
    id: "cloudflare",
    label: "Cloudflare D1/R2/Queues",
    status: "blueprint",
    guide: "examples/adapters/cloudflare/README.md",
    credentials: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "NODEAGENT_D1_DATABASE_ID", "NODEAGENT_R2_BUCKET"],
  },
];

const appTemplates: AppTemplateInfo[] = [
  {
    id: "local-dashboard",
    label: "Local dashboard",
    templateDir: "examples/apps/local-dashboard/template",
    defaultDir: "nodeagent-local-dashboard",
    credentials: [],
    smoke: "nodeagent:local-dashboard:smoke",
  },
];

const program = new Command();

program
  .name("nodeagent")
  .description("Pretty CLI for NodeAgent checks, app scaffolds, adapter guidance, and local provider smokes.")
  .version("0.1.0");

program
  .command("doctor")
  .description("Check local repo health and show the fastest next step.")
  .action(() => {
    intro("NodeAgent Doctor");
    const checks = [
      checkPath("package.json"),
      checkPath("src/features/node-agent/runtime/durableRuntime.ts"),
      checkPath("examples/adapters/README.md"),
      checkPath("examples/adapters/sqlite-local/sqliteDurableRuntime.ts"),
      checkPath("examples/apps/local-dashboard/template/package.json"),
      checkPath("scripts/nodeagent-local-dashboard-scaffold-smoke.ts"),
      checkPath("scripts/nodeagent-sqlite-smoke.ts"),
    ];
    for (const check of checks) {
      if (check.ok) log.success(check.message);
      else log.error(check.message);
    }

    note([
      "Fast local proof:",
      "  npm run nodeagent -- smoke",
      "",
      "Fully runnable provider:",
      "  npm run nodeagent -- adapters setup sqlite-local --run",
      "",
      "No-key dashboard scaffold:",
      "  npm run nodeagent -- apps scaffold local-dashboard --dir nodeagent-local-dashboard --auto",
    ].join("\n"), "Next");
    outro(checks.every((check) => check.ok) ? "Doctor passed." : "Doctor found missing files.");
    if (!checks.every((check) => check.ok)) process.exitCode = 1;
  });

program
  .command("smoke")
  .description("Run the local NodeAgent proof smokes with a compact status UI.")
  .option("--full", "run npm run prepush instead of the focused local smokes")
  .action((options: { full?: boolean }) => {
    intro("NodeAgent Smoke");
    const scripts = options.full
      ? ["prepush"]
      : ["nodeagent:frame:smoke", "nodeagent:durable:smoke", "nodeagent:sqlite:smoke", "nodeagent:local-dashboard:smoke", "examples:guidance:smoke"];
    const ok = runScripts(scripts);
    outro(ok ? "All requested smokes passed." : "One or more smokes failed.");
    if (!ok) process.exitCode = 1;
  });

program
  .command("happy-path")
  .alias("speed")
  .description("Time the no-cloud path from init checks to fully runnable SQLite-backed proof.")
  .option("--json-out <path>", "write the speed receipt as JSON")
  .action((options: { jsonOut?: string }) => {
    intro("NodeAgent Happy Path Speed");
    const report = runHappyPathSpeed();
    const lines = report.phases.map((phase) => {
      const status = phase.ok ? "PASS" : "FAIL";
      return `${phase.name.padEnd(18)} ${status.padEnd(4)} ${formatMs(phase.durationMs).padStart(8)}  ${phase.detail}`;
    });
    note([
      ...lines,
      "",
      `total              ${report.ok ? "PASS" : "FAIL"} ${formatMs(report.totalMs).padStart(8)}`,
    ].join("\n"), "Timing");
    if (options.jsonOut) {
      writeJson(options.jsonOut, report);
      log.success(`wrote ${options.jsonOut}`);
    }
    outro(report.ok ? "Happy path is fully running." : "Happy path failed before completion.");
    if (!report.ok) process.exitCode = 1;
  });

const adaptersCommand = program
  .command("adapters")
  .description("Inspect provider adapters and setup guidance.");

adaptersCommand
  .command("list")
  .description("List available provider adapter paths.")
  .action(() => {
    intro("NodeAgent Adapters");
    for (const adapter of adapters) {
      const suffix = adapter.status === "runnable" ? "runnable now" : "blueprint";
      log.info(`${adapter.id.padEnd(14)} ${suffix.padEnd(12)} ${adapter.guide}`);
    }
    outro("Use `npm run nodeagent -- adapters setup sqlite-local --run` for the no-cloud provider proof.");
  });

adaptersCommand
  .command("setup")
  .argument("<provider>", "provider id")
  .option("--run", "run the provider smoke when available")
  .description("Show provider credential handoff and optional smoke.")
  .action((provider: AdapterId, options: { run?: boolean }) => {
    const adapter = adapters.find((candidate) => candidate.id === provider);
    intro(`NodeAgent Adapter: ${provider}`);
    if (!adapter) {
      log.error(`Unknown provider: ${provider}`);
      note(adapters.map((candidate) => candidate.id).join("\n"), "Available providers");
      outro("Adapter setup failed.");
      process.exitCode = 1;
      return;
    }

    const credentials = adapter.credentials.length > 0
      ? adapter.credentials.map((credential) => `- ${credential}`).join("\n")
      : "- none";
    note([
      `Guide: ${adapter.guide}`,
      `Status: ${adapter.status}`,
      "",
      "Credentials:",
      credentials,
    ].join("\n"), adapter.label);

    if (adapter.id === "sqlite-local") {
      note([
        "No cloud account is required.",
        "The smoke creates a temporary SQLite database and proves persisted replay.",
        "",
        "Command:",
        "  npm run nodeagent:sqlite:smoke",
      ].join("\n"), "Local proof");
    } else {
      note([
        "Ask the human for the listed credentials.",
        "Put values in .env.local or the provider secret store.",
        "Never echo secrets into logs, prompts, traces, or eval receipts.",
      ].join("\n"), "Credential handoff");
    }

    if (options.run) {
      if (!adapter.smoke) {
        log.warn("No runnable smoke exists for this blueprint yet.");
      } else if (!runScripts([adapter.smoke])) {
        process.exitCode = 1;
      }
    }
    outro("Adapter guidance complete.");
  });

const appsCommand = program
  .command("apps")
  .description("Scaffold and inspect runnable NodeAgent app templates.");

appsCommand
  .command("list")
  .description("List app templates that can be scaffolded locally.")
  .action(() => {
    intro("NodeAgent Apps");
    for (const template of appTemplates) {
      const credentials = template.credentials.length > 0 ? template.credentials.join(", ") : "none";
      log.info(`${template.id.padEnd(16)} ${template.defaultDir.padEnd(28)} credentials: ${credentials}`);
    }
    outro("Use `npm run nodeagent -- apps scaffold local-dashboard --dir nodeagent-local-dashboard --auto` for the no-key dashboard.");
  });

appsCommand
  .command("scaffold")
  .argument("<template>", "template id")
  .option("--dir <path>", "target directory")
  .option("--force", "overwrite matching template files if the target already exists")
  .option("--install", "run npm install in the generated app")
  .option("--run-demo", "run npm run agent:demo in the generated app")
  .option("--verify", "run npm run smoke and npm run build in the generated app")
  .option("--auto", "run install, agent demo, smoke, and build; writes .nodeagent/setup-receipt.json")
  .description("Create a coding-agent-friendly local app scaffold.")
  .action((templateId: AppTemplateInfo["id"], options: { auto?: boolean; dir?: string; force?: boolean; install?: boolean; runDemo?: boolean; verify?: boolean }) => {
    const template = appTemplates.find((candidate) => candidate.id === templateId);
    intro(`NodeAgent App Scaffold: ${templateId}`);
    if (!template) {
      log.error(`Unknown app template: ${templateId}`);
      note(appTemplates.map((candidate) => candidate.id).join("\n"), "Available templates");
      outro("App scaffold failed.");
      process.exitCode = 1;
      return;
    }

    const sourceDir = resolve(template.templateDir);
    const targetDir = resolve(options.dir ?? template.defaultDir);
    if (!existsSync(sourceDir)) {
      log.error(`Missing template source: ${template.templateDir}`);
      outro("App scaffold failed.");
      process.exitCode = 1;
      return;
    }
    if (existsSync(targetDir) && !options.force) {
      log.error(`Target already exists: ${formatPath(targetDir)}`);
      note("Re-run with --force to overwrite matching template files.", "Existing directory");
      outro("App scaffold stopped before writing files.");
      process.exitCode = 1;
      return;
    }

    const filesCopied = copyDir(sourceDir, targetDir);
    log.success(`created ${formatPath(targetDir)} (${filesCopied} files)`);

    const shouldInstall = Boolean(options.auto || options.install);
    const shouldRunDemo = Boolean(options.auto || options.runDemo);
    const shouldVerify = Boolean(options.auto || options.verify);
    if (shouldInstall || shouldRunDemo || shouldVerify) {
      const receipt = runAppSetupAutomation({
        install: shouldInstall,
        runDemo: shouldRunDemo,
        targetDir,
        templateId: template.id,
        verify: shouldVerify,
      });
      const receiptPath = join(targetDir, ".nodeagent", "setup-receipt.json");
      writeJson(receiptPath, receipt);
      if (receipt.ok) {
        log.success(`wrote ${formatPath(receiptPath)}`);
      } else {
        log.error(`setup failed; receipt wrote ${formatPath(receiptPath)}`);
        process.exitCode = 1;
      }
    }

    note([
      "No API keys are required for the first run.",
      "The app uses a scripted local agent and SQLite durability by default.",
      "The dashboard includes the NodeRoom-style Trace Lens tabs: Review, Builder, Business proof, Runtime trace, and gated Code ownership.",
      "",
      options.auto
        ? "Auto mode already ran install, agent demo, smoke, and build."
        : "Fully automatic setup:",
      options.auto
        ? ""
        : `  npm run nodeagent -- apps scaffold local-dashboard --dir ${formatPath(targetDir)} --auto`,
      "",
      "Run:",
      `  cd ${formatPath(targetDir)}`,
      "  npm run dev",
      "",
      "Optional verification:",
      "  npm run smoke",
    ].join("\n"), template.label);
    outro("Local dashboard scaffold is ready.");
  });

program.parse();

function checkPath(path: string) {
  return {
    ok: existsSync(path),
    message: `${existsSync(path) ? "found" : "missing"} ${path}`,
  };
}

function runHappyPathSpeed(): HappyPathReport {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const phases: TimedPhase[] = [];

  phases.push(timePhase("init", () => {
    const checks = [
      checkPath("package.json"),
      checkPath("node_modules"),
      checkPath("scripts/nodeagent-cli.ts"),
      checkPath("examples/adapters/sqlite-local/sqliteDurableRuntime.ts"),
      checkPath("scripts/nodeagent-sqlite-smoke.ts"),
      checkPath("examples/apps/local-dashboard/template/package.json"),
    ];
    const missing = checks.filter((check) => !check.ok).map((check) => check.message.replace("missing ", ""));
    return {
      ok: missing.length === 0,
      detail: missing.length === 0 ? "repo ready; dependencies installed" : `missing ${missing.join(", ")}`,
    };
  }));

  if (phases[0].ok) {
    for (const script of ["nodeagent:frame:smoke", "nodeagent:durable:smoke", "nodeagent:sqlite:smoke", "nodeagent:local-dashboard:smoke", "examples:guidance:smoke"]) {
      phases.push(runScriptPhase(script));
      if (!phases[phases.length - 1].ok) break;
    }
  }

  const completedAtMs = Date.now();
  return {
    ok: phases.every((phase) => phase.ok),
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    totalMs: completedAtMs - startedAtMs,
    phases,
    summary: {
      provider: "sqlite-local",
      credentialRequired: false,
      command: "npm run nodeagent -- happy-path",
    },
  };
}

function runScripts(scripts: string[]) {
  let ok = true;
  for (const script of scripts) {
    const s = spinner();
    s.start(`npm run ${script}`);
    const result = runNpmScript(script);
    if (result.ok) {
      s.stop(`npm run ${script}`);
      log.success(script);
    } else {
      ok = false;
      s.stop(`npm run ${script}`);
      log.error(script);
      const detail = result.output.trim();
      if (detail) note(detail.slice(-3000), "Command output");
      break;
    }
  }
  return ok;
}

function runAppSetupAutomation({
  install,
  runDemo,
  targetDir,
  templateId,
  verify,
}: {
  install: boolean;
  runDemo: boolean;
  targetDir: string;
  templateId: AppTemplateInfo["id"];
  verify: boolean;
}): AppSetupReceipt {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const phases: AppSetupPhase[] = [];

  if (install) phases.push(runAppCommandPhase(targetDir, "install", ["install"]));
  if (phases.every((phase) => phase.ok) && runDemo) phases.push(runAppCommandPhase(targetDir, "agent demo", ["run", "agent:demo"]));
  if (phases.every((phase) => phase.ok) && verify) {
    phases.push(runAppCommandPhase(targetDir, "smoke", ["run", "smoke"]));
    if (phases.every((phase) => phase.ok)) phases.push(runAppCommandPhase(targetDir, "build", ["run", "build"]));
  }

  const completedAtMs = Date.now();
  return {
    ok: phases.every((phase) => phase.ok),
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    totalMs: completedAtMs - startedAtMs,
    template: templateId,
    targetDir,
    apiKeysRequired: false,
    phases,
    nextSteps: [
      "npm run dev",
      "Open the Vite URL printed by the dev server.",
      "Add model/provider credentials only when upgrading beyond scripted local mode.",
    ],
  };
}

function runAppCommandPhase(targetDir: string, name: string, args: string[]): AppSetupPhase {
  const command = `npm ${args.join(" ")}`;
  const startedAt = performance.now();
  const s = spinner();
  s.start(`${command} (${formatPath(targetDir)})`);
  const result = spawnSync(npmCommand(), args, {
    cwd: targetDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const durationMs = Math.round(performance.now() - startedAt);
  const output = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n");
  if (result.status === 0) {
    s.stop(command);
    log.success(`${name} ${formatMs(durationMs)}`);
  } else {
    s.stop(command);
    log.error(`${name} failed`);
    if (output.trim()) note(output.trim().slice(-3000), "Command output");
  }
  return {
    name,
    command,
    ok: result.status === 0,
    durationMs,
    detail: result.status === 0 ? "completed" : output.slice(-240).replace(/\s+/g, " ").trim() || "failed",
  };
}

function runScriptPhase(script: string): TimedPhase {
  return timePhase(script, () => {
    const result = runNpmScript(script);
    return {
      ok: result.ok,
      detail: result.ok ? "completed" : result.output.slice(-240).replace(/\s+/g, " ").trim() || "failed",
    };
  });
}

function runNpmScript(script: string) {
  const result = spawnSync(npmCommand(), ["run", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    ok: result.status === 0,
    output: [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n"),
  };
}

function timePhase(name: string, fn: () => { ok: boolean; detail: string }): TimedPhase {
  const startedAt = performance.now();
  const result = fn();
  return {
    name,
    ok: result.ok,
    detail: result.detail,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function writeJson(path: string, value: unknown) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function copyDir(sourceDir: string, targetDir: string): number {
  mkdirSync(targetDir, { recursive: true });
  let filesCopied = 0;
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    const stats = statSync(sourcePath);
    if (stats.isDirectory()) {
      filesCopied += copyDir(sourcePath, targetPath);
    } else if (stats.isFile()) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
      filesCopied += 1;
    }
  }
  return filesCopied;
}

function formatPath(path: string) {
  const relativePath = relative(process.cwd(), path);
  return relativePath && !relativePath.startsWith("..") ? relativePath : path;
}
