#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
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
    status: "blueprint",
    guide: "examples/adapters/convex/README.md",
    credentials: ["CONVEX_DEPLOYMENT", "VITE_CONVEX_URL", "CONVEX_DEPLOY_KEY"],
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

const program = new Command();

program
  .name("nodeagent")
  .description("Pretty CLI for NodeAgent checks, adapter guidance, and local provider smokes.")
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
      : ["nodeagent:frame:smoke", "nodeagent:durable:smoke", "nodeagent:sqlite:smoke", "examples:guidance:smoke"];
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
    ];
    const missing = checks.filter((check) => !check.ok).map((check) => check.message.replace("missing ", ""));
    return {
      ok: missing.length === 0,
      detail: missing.length === 0 ? "repo ready; dependencies installed" : `missing ${missing.join(", ")}`,
    };
  }));

  if (phases[0].ok) {
    for (const script of ["nodeagent:frame:smoke", "nodeagent:durable:smoke", "nodeagent:sqlite:smoke", "examples:guidance:smoke"]) {
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
