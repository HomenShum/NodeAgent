import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  analyzeOmnigentSpec,
  OMNIGENT_NODEAGENT_TARGETS,
  summarizeOmnigentAnalysis,
} from "../src/features/node-agent/runtime/omnigentAdapter";
import { runNodeAgentFrameSmoke } from "./nodeagent-frame-smoke";

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

function detectCli() {
  if (commandExists("omni")) return { checked: true, installed: true, command: "omni" };
  if (commandExists("omnigent")) return { checked: true, installed: true, command: "omnigent" };
  return { checked: true, installed: false };
}

function main() {
  const jsonOut = argValue("--json-out");
  const requireCli = hasFlag("--require-omni-cli");
  const specs = OMNIGENT_NODEAGENT_TARGETS.map((target) => {
    const text = readFileSync(target.path, "utf8");
    return analyzeOmnigentSpec({ path: target.path, profile: target.profile, text });
  });
  const frameSmoke = runNodeAgentFrameSmoke();
  const cli = detectCli();
  const ok = specs.every((spec) => spec.ok) && frameSmoke.ok && (!requireCli || cli.installed);
  const report = {
    ok,
    omnigent: {
      cli,
      runCommands: specs.map((spec) => ({ path: spec.path, command: spec.runCommand })),
    },
    specs,
    nodeagentFrameSmoke: frameSmoke,
  };

  for (const spec of specs) {
    console.log(summarizeOmnigentAnalysis(spec));
    for (const issue of spec.issues) console.log(`  issue: ${issue}`);
  }
  console.log(`nodeagent frame smoke: ${frameSmoke.ok ? "PASS" : "FAIL"} frame=${frameSmoke.frameId} status=${frameSmoke.status}`);
  console.log(cli.installed
    ? `omnigent cli: found ${cli.command}`
    : "omnigent cli: not installed locally; install Omnigent and run `omni run examples/omnigent/nodeagent-worker.yaml` for the outer harness live check");

  if (jsonOut) {
    ensureParent(jsonOut);
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
