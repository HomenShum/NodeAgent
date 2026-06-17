#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

function runScripts(scripts: string[]) {
  let ok = true;
  for (const script of scripts) {
    const s = spinner();
    s.start(`npm run ${script}`);
    const result = spawnSync(npmCommand(), ["run", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if (result.status === 0) {
      s.stop(`npm run ${script}`);
      log.success(script);
    } else {
      ok = false;
      s.stop(`npm run ${script}`);
      log.error(script);
      const detail = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      if (detail) note(detail.slice(-3000), "Command output");
      break;
    }
  }
  return ok;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
