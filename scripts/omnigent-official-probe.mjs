import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const startedAt = new Date();
const args = parseArgs(process.argv.slice(2));
const probes = [];

main();

function main() {
  const direct = firstCommand(["omnigent", "omni"]);
  if (direct) {
    probes.push(runProbe("direct", direct.command, direct.command, []));
  }

  const uv = firstCommand(["uv"]);
  if (uv) {
    probes.push(runProbe("uv", "uv tool run --python 3.12 omnigent", uv.command, ["tool", "run", "--python", "3.12", "omnigent"]));
  }

  if (process.platform === "win32" && firstCommand(["wsl.exe"])) {
    probes.push(runWslUvProbe());
  }

  const usable = probes.find((probe) => probe.ok);
  const report = {
    ok: Boolean(usable),
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    apiKeysRequired: false,
    strategy: usable?.strategy ?? "none",
    probes,
    nextRunCommand: usable ? "omnigent run examples/omnigent/nodeagent-worker.yaml" : undefined,
    issues: usable ? [] : ["official Omnigent CLI was not available through direct PATH, uv, or WSL uv"],
  };
  if (args["json-out"]) writeJson(String(args["json-out"]), report);

  if (report.ok) {
    console.log(`official omnigent probe: PASS strategy=${report.strategy}`);
  } else if (args["skip-if-missing"]) {
    report.ok = true;
    report.issues = ["skipped: official Omnigent CLI not available"];
    if (args["json-out"]) writeJson(String(args["json-out"]), report);
    console.log("official omnigent probe: SKIP missing CLI");
  } else {
    console.error("official omnigent probe: FAIL");
    for (const issue of report.issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
  }
}

function runProbe(strategy, label, command, prefixArgs) {
  const help = spawnSync(command, [...prefixArgs, "--help"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const runHelp = spawnSync(command, [...prefixArgs, "run", "--help"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return formatProbe(strategy, label, help, runHelp);
}

function runWslUvProbe() {
  const uvPrefix = 'export PATH="$HOME/.local/bin:$PATH"; uv tool run --python 3.12 omnigent';
  const help = spawnSync("wsl.exe", ["bash", "-lc", `${uvPrefix} --help`], { encoding: "utf8" });
  const runHelp = spawnSync("wsl.exe", ["bash", "-lc", `${uvPrefix} run --help`], { encoding: "utf8" });
  return formatProbe("wsl-uv", "wsl uv tool run --python 3.12 omnigent", help, runHelp);
}

function formatProbe(strategy, label, help, runHelp) {
  return {
    strategy,
    label,
    ok: help.status === 0 && runHelp.status === 0,
    checks: [
      {
        command: `${label} --help`,
        exitCode: help.status,
        stdout: clean(help.stdout).slice(0, 500),
        stderr: clean(help.stderr).slice(0, 500),
      },
      {
        command: `${label} run --help`,
        exitCode: runHelp.status,
        stdout: clean(runHelp.stdout).slice(0, 500),
        stderr: clean(runHelp.stderr).slice(0, 500),
      },
    ],
  };
}

function firstCommand(commands) {
  for (const command of commands) {
    const check = process.platform === "win32"
      ? spawnSync("where.exe", [command], { encoding: "utf8" })
      : spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
    if (check.status === 0) return { command, path: check.stdout.trim().split(/\r?\n/)[0] };
  }
  return undefined;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[value.slice(2)] = next;
      index += 1;
    } else {
      parsed[value.slice(2)] = true;
    }
  }
  return parsed;
}

function clean(value) {
  let text = value ?? "";
  for (const home of [process.env.USERPROFILE, process.env.HOME]) {
    if (home) text = text.replaceAll(home, "[home]");
  }
  return text
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function writeJson(path, value) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
