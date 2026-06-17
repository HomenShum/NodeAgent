#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { intro, log, note, outro, spinner } from "@clack/prompts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const appTemplates = [
  {
    id: "local-dashboard",
    label: "Local dashboard",
    templateDir: "examples/apps/local-dashboard/template",
    defaultDir: "nodeagent-local-dashboard",
    credentials: [],
    summary: "VisualLabs/NodeRoom-style dashboard with SQLite and Trace Lens tabs.",
    autoNote:
      "The dashboard includes the NodeRoom-style Trace Lens tabs: Review, Builder, Business proof, Runtime trace, and gated Code ownership.",
  },
  {
    id: "chat-ui",
    label: "Chat UI",
    templateDir: "examples/apps/chat-ui/template",
    defaultDir: "nodeagent-chat-ui",
    credentials: [],
    summary: "assistant-ui chat scaffold with a no-key local adapter and inline tool cards.",
    autoNote:
      "The chat uses assistant-ui, a scripted local adapter, and inline NodeAgent tool cards; replace the adapter with a server route when credentials exist.",
  },
];

const program = new Command();

program
  .name("nodeagent")
  .description("Inject NodeAgent app scaffolds into another repo.")
  .version("0.1.0");

program
  .command("doctor")
  .description("Check that packaged app templates are available.")
  .action(() => {
    intro("NodeAgent Doctor");
    const checks = [
      checkPath("examples/apps/chat-ui/template/package.json"),
      checkPath("examples/apps/local-dashboard/template/package.json"),
      checkPath("examples/apps/chat-ui/template/src/nodeagent-chat/NodeAgentChatApp.jsx"),
      checkPath("examples/apps/local-dashboard/template/src/main.jsx"),
    ];
    for (const check of checks) {
      if (check.ok) log.success(check.message);
      else log.error(check.message);
    }
    note(
      [
        "No-key chat UI scaffold:",
        "  nodeagent apps scaffold chat-ui --dir nodeagent-chat-ui --auto",
        "",
        "No-key dashboard scaffold:",
        "  nodeagent apps scaffold local-dashboard --dir nodeagent-local-dashboard --auto",
      ].join("\n"),
      "Next",
    );
    const ok = checks.every((check) => check.ok);
    outro(ok ? "Doctor passed." : "Doctor found missing template files.");
    if (!ok) process.exitCode = 1;
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
      log.info(`${template.id.padEnd(16)} ${template.defaultDir.padEnd(28)} credentials: ${credentials}  ${template.summary}`);
    }
    outro("Use `nodeagent apps scaffold chat-ui --dir nodeagent-chat-ui --auto` for the no-key chat, or `local-dashboard` for the dashboard shell.");
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
  .action((templateId, options) => {
    const template = appTemplates.find((candidate) => candidate.id === templateId);
    intro(`NodeAgent App Scaffold: ${templateId}`);
    if (!template) {
      log.error(`Unknown app template: ${templateId}`);
      note(appTemplates.map((candidate) => candidate.id).join("\n"), "Available templates");
      outro("App scaffold failed.");
      process.exitCode = 1;
      return;
    }

    const sourceDir = resolve(packageRoot, template.templateDir);
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

    note(
      [
        "No API keys are required for the first run.",
        template.autoNote,
        "",
        options.auto ? "Auto mode already ran install, agent demo, smoke, and build." : "Fully automatic setup:",
        options.auto ? "" : `  nodeagent apps scaffold ${template.id} --dir ${formatPath(targetDir)} --auto`,
        "",
        "Run:",
        `  cd ${formatPath(targetDir)}`,
        "  npm run dev",
        "",
        "Optional verification:",
        "  npm run smoke",
      ].join("\n"),
      template.label,
    );
    outro(`${template.label} scaffold is ready.`);
  });

program.parse();

function checkPath(path) {
  const fullPath = resolve(packageRoot, path);
  return {
    ok: existsSync(fullPath),
    message: `${existsSync(fullPath) ? "found" : "missing"} ${path}`,
  };
}

function runAppSetupAutomation({ install, runDemo, targetDir, templateId, verify }) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const phases = [];

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

function runAppCommandPhase(targetDir, name, args) {
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

function copyDir(sourceDir, targetDir) {
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

function writeJson(path, value) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function formatPath(path) {
  const relativePath = relative(process.cwd(), path);
  return relativePath && !relativePath.startsWith("..") ? relativePath : path;
}
