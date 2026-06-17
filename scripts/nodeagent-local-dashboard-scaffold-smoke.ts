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
    databaseProvider: "sqlite-local";
    traceTabs: string[];
  };
}

const requiredFiles = [
  "package.json",
  "README.md",
  "AGENTS.md",
  ".env.example",
  "vite.config.mjs",
  "index.html",
  "public/nodeagent-state.json",
  "src/main.jsx",
  "src/styles.css",
  "scripts/run-local-agent.mjs",
];

function main() {
  const startedAt = new Date().toISOString();
  const options = parseArgs(process.argv.slice(2));
  const tempDir = mkdtempSync(join(tmpdir(), "nodeagent-local-dashboard-"));
  const targetDir = join(tempDir, "app");
  const scaffoldArgs = ["run", "nodeagent", "--", "apps", "scaffold", "local-dashboard", "--dir", targetDir, "--force"];
  const result = spawnSync(npmCommand(), scaffoldArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  const issues: string[] = [];
  if (result.status !== 0) {
    issues.push(`scaffold command failed: ${[result.stdout, result.stderr].join("\n").slice(-1000)}`);
  }

  for (const file of requiredFiles) {
    if (!existsSync(join(targetDir, file))) issues.push(`missing ${file}`);
  }

  if (issues.length === 0) {
    validateGeneratedApp(targetDir, issues);
  }
  validateCliContract(issues);
  validateWalkthrough(issues);

  const report: SmokeReport = {
    ok: issues.length === 0,
    startedAt,
    completedAt: new Date().toISOString(),
    targetDir,
    requiredFiles,
    issues,
    summary: {
      scaffoldCommand: "npm run nodeagent -- apps scaffold local-dashboard --dir nodeagent-local-dashboard",
      apiKeysRequired: false,
      databaseProvider: "sqlite-local",
      traceTabs: ["Review", "Builder", "Business proof", "Runtime trace", "Code ownership"],
    },
  };

  if (options["json-out"]) writeJson(options["json-out"], report);

  if (report.ok) {
    console.log(`local dashboard scaffold smoke: PASS ${requiredFiles.length} files`);
  } else {
    console.error("local dashboard scaffold smoke: FAIL");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
  }

  if (tempDir.startsWith(tmpdir())) rmSync(tempDir, { recursive: true, force: true });
}

function validateWalkthrough(issues: string[]) {
  for (const file of [
    "docs/LOCAL_DASHBOARD_WALKTHROUGH.md",
    "docs/screenshots/local-dashboard-overview.png",
    "docs/screenshots/local-dashboard-builder-locked.png",
  ]) {
    if (!existsSync(file)) issues.push(`missing ${file}`);
  }
  if (existsSync("docs/LOCAL_DASHBOARD_WALKTHROUGH.md")) {
    const walkthrough = readFileSync("docs/LOCAL_DASHBOARD_WALKTHROUGH.md", "utf8");
    for (const required of ["Visual Walkthrough", "local-dashboard-overview.png", "local-dashboard-builder-locked.png", "--auto", "setup-receipt.json"]) {
      if (!walkthrough.includes(required)) issues.push(`docs/LOCAL_DASHBOARD_WALKTHROUGH.md missing ${required}`);
    }
  }
}

function validateCliContract(issues: string[]) {
  const cli = readFileSync("scripts/nodeagent-cli.ts", "utf8");
  for (const required of ["--auto", "--install", "--run-demo", "--verify", "setup-receipt.json"]) {
    if (!cli.includes(required)) issues.push(`nodeagent-cli.ts missing ${required}`);
  }
}

function validateGeneratedApp(targetDir: string, issues: string[]) {
  const packageJson = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const mainJs = readFileSync(join(targetDir, "src/main.jsx"), "utf8");
  const runner = readFileSync(join(targetDir, "scripts/run-local-agent.mjs"), "utf8");
  const readme = readFileSync(join(targetDir, "README.md"), "utf8");
  const envExample = readFileSync(join(targetDir, ".env.example"), "utf8");

  for (const script of ["dev", "agent:demo", "smoke"]) {
    if (!packageJson.scripts?.[script]) issues.push(`package.json missing ${script} script`);
  }
  for (const dependency of ["better-sqlite3", "react", "react-dom"]) {
    if (!packageJson.dependencies?.[dependency]) issues.push(`package.json missing ${dependency}`);
  }
  for (const required of ["Review", "Builder", "Business proof", "Runtime trace", "Code ownership", "data-noderoom-surface"]) {
    if (!mainJs.includes(required)) issues.push(`src/main.jsx missing ${required}`);
  }
  for (const required of ["better-sqlite3", "nodeagent-state.json", "scripted", "apiKeysRequired: false"]) {
    if (!runner.includes(required)) issues.push(`scripts/run-local-agent.mjs missing ${required}`);
  }
  for (const required of ["## No API Keys", "npm run agent:demo", "Trace Lens", "SQLite"]) {
    if (!readme.includes(required)) issues.push(`README.md missing ${required}`);
  }
  if (!envExample.includes("NODEAGENT_MODE=scripted")) issues.push(".env.example missing scripted mode");
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

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
