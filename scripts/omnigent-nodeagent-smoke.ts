import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  analyzeOmnigentSpec,
  OMNIGENT_NODEAGENT_TARGETS,
  summarizeOmnigentAnalysis,
} from "../src/features/node-agent/runtime/omnigentAdapter";
import { runNodeAgentDurableSmoke } from "./nodeagent-durable-smoke";
import { runNodeAgentFrameSmoke } from "./nodeagent-frame-smoke";
import { runNodeAgentSqliteSmoke } from "./nodeagent-sqlite-smoke";

type CliProbe = ReturnType<typeof runCliProbe>;
type DetectedCli =
  | { checked: true; installed: true; command: string; probe: CliProbe }
  | { checked: true; installed: false };

function argValue(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function commandExists(command: string) {
  const check = process.platform === "win32"
    ? spawnSync("where.exe", [command], { encoding: "utf8" })
    : spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return check.status === 0;
}

function ensureParent(path: string) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
}

function runCliProbe(command: string) {
  const hello = spawnSync(command, ["hello"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const profiles = spawnSync(command, ["profiles", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    ok: hello.status === 0 && profiles.status === 0,
    checks: [
      { command: `${command} hello`, exitCode: hello.status, stdout: (hello.stdout ?? "").trim().slice(0, 120) },
      { command: `${command} profiles --json`, exitCode: profiles.status, stdout: (profiles.stdout ?? "").trim().slice(0, 120) },
    ],
  };
}

function detectCli(): DetectedCli {
  for (const command of ["omni", "omnigent", "omniagent", "omni-agent"]) {
    if (!commandExists(command)) continue;
    return { checked: true, installed: true, command, probe: runCliProbe(command) };
  }
  return { checked: true, installed: false };
}

async function main() {
  const jsonOut = argValue("--json-out");
  const requireCli = hasFlag("--require-omni-cli");
  const specs = OMNIGENT_NODEAGENT_TARGETS.map((target) => {
    const text = readFileSync(target.path, "utf8");
    return analyzeOmnigentSpec({ path: target.path, profile: target.profile, text });
  });
  const frameSmoke = runNodeAgentFrameSmoke();
  const durableSmoke = await runNodeAgentDurableSmoke();
  const sqliteSmoke = await runNodeAgentSqliteSmoke();
  const cli = detectCli();
  const ok = specs.every((spec) => spec.ok)
    && frameSmoke.ok
    && durableSmoke.ok
    && sqliteSmoke.ok
    && (!cli.installed || cli.probe.ok)
    && (!requireCli || cli.installed);
  const report = {
    ok,
    omnigent: {
      cli,
      runCommands: specs.map((spec) => ({ path: spec.path, command: spec.runCommand })),
    },
    specs,
    nodeagentFrameSmoke: frameSmoke,
    nodeagentDurableSmoke: durableSmoke,
    nodeagentSqliteSmoke: sqliteSmoke,
  };

  for (const spec of specs) {
    console.log(summarizeOmnigentAnalysis(spec));
    for (const issue of spec.issues) console.log(`  issue: ${issue}`);
  }
  console.log(`nodeagent frame smoke: ${frameSmoke.ok ? "PASS" : "FAIL"} frame=${frameSmoke.frameId} status=${frameSmoke.status}`);
  console.log(`nodeagent durable smoke: ${durableSmoke.ok ? "PASS" : "FAIL"} frame=${durableSmoke.frameId} job=${durableSmoke.jobId} replay=${durableSmoke.replay.status}`);
  console.log(`nodeagent sqlite smoke: ${sqliteSmoke.ok ? "PASS" : "FAIL"} frame=${sqliteSmoke.frameId} job=${sqliteSmoke.jobId} replay=${sqliteSmoke.replayAfterReopen.status}`);
  if (cli.installed) {
    console.log(`omnigent cli: found ${cli.command} probe=${cli.probe.ok ? "PASS" : "FAIL"}`);
    for (const check of cli.probe.checks) console.log(`  ${check.command}: exit=${check.exitCode} ${check.stdout}`);
  } else {
    console.log("omnigent cli: not installed locally; install `omniagent` and run `npm run omnigent:nodeagent:smoke -- --require-omni-cli`");
  }

  if (jsonOut) {
    ensureParent(jsonOut);
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
