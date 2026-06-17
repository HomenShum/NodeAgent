import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface GuidanceTarget {
  path: string;
  required: string[];
}

const providerSections = [
  "# ",
  "## Credentials",
  "## Spin Up",
  "## Adapter Mapping",
  "## Done Criteria",
  "## Coding-Agent Prompt",
];

const appSections = [
  "# ",
  "## Credentials",
  "## Spin Up",
  "## Done Criteria",
];

const targets: GuidanceTarget[] = [
  {
    path: "examples/adapters/README.md",
    required: ["## Start Here", "## Adapter Contract", "## Credential Handoff", "## Provider Folders", "## Security Rules", "npm run nodeagent -- happy-path"],
  },
  {
    path: "examples/adapters/AGENTS.md",
    required: ["# Coding Agent Notes", "npm run examples:guidance:smoke", "npm run nodeagent:sqlite:smoke", "Do not modify `runReasoningFrame`"],
  },
  { path: "examples/adapters/sqlite-local/README.md", required: [...providerSections, "fully runnable", "npm run nodeagent:sqlite:smoke"] },
  { path: "examples/adapters/convex/README.md", required: [...providerSections, "https://docs.convex.dev/cli/overview"] },
  { path: "examples/adapters/aws-dynamodb/README.md", required: [...providerSections, "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html"] },
  { path: "examples/adapters/postgres/README.md", required: [...providerSections, "https://www.postgresql.org/docs/current/libpq-connect.html"] },
  { path: "examples/adapters/cloudflare/README.md", required: [...providerSections, "https://developers.cloudflare.com/workers/wrangler/"] },
  {
    path: "examples/apps/README.md",
    required: ["# Sample App Blueprints", "## App Folders", "## Coding Agent Done Criteria", "## Human Credential Handoff"],
  },
  { path: "examples/apps/minimal-portable-agent/README.md", required: [...appSections, "## What To Copy", "## Add App Tools", "## Coding-Agent Prompt"] },
  { path: "examples/apps/aws-hackathon-visual-labs/README.md", required: [...appSections, "## Runtime Mapping", "## App Tools To Add"] },
  { path: "examples/apps/local-design-dashboard/README.md", required: [...appSections, "## Runtime Mapping", "## App Tools To Add"] },
  { path: "examples/apps/local-dashboard/README.md", required: [...appSections, "## Runtime Mapping", "## Trace Lens", "## App Tools To Add", "npm run nodeagent -- apps scaffold local-dashboard", "--auto"] },
  { path: "examples/apps/local-dashboard/template/README.md", required: ["# NodeAgent Local Dashboard", "## No API Keys", "## Spin Up", "## Trace Lens", "## Local Backend", "npm run agent:demo", "setup-receipt.json"] },
  { path: "examples/apps/video-agent-pipeline/README.md", required: [...appSections, "## Runtime Mapping", "## App Tools To Add"] },
];

const supportFiles = [
  "examples/adapters/sqlite-local/.env.example",
  "examples/adapters/sqlite-local/schema.sql",
  "examples/adapters/sqlite-local/sqliteDurableRuntime.ts",
  "examples/adapters/convex/.env.example",
  "examples/adapters/aws-dynamodb/.env.example",
  "examples/adapters/aws-dynamodb/iam-policy.template.json",
  "examples/adapters/postgres/.env.example",
  "examples/adapters/postgres/schema.sql",
  "examples/adapters/cloudflare/.env.example",
  "examples/adapters/cloudflare/wrangler.example.jsonc",
  "examples/apps/minimal-portable-agent/.env.example",
  "examples/apps/minimal-portable-agent/AGENTS.md",
  "examples/apps/local-dashboard/template/.env.example",
  "examples/apps/local-dashboard/template/AGENTS.md",
  "examples/apps/local-dashboard/template/package.json",
  "examples/apps/local-dashboard/template/public/nodeagent-state.json",
  "examples/apps/local-dashboard/template/scripts/run-local-agent.mjs",
  "examples/apps/local-dashboard/template/src/main.jsx",
  "docs/LOCAL_DASHBOARD_WALKTHROUGH.md",
  "docs/screenshots/local-dashboard-overview.png",
  "docs/screenshots/local-dashboard-builder-locked.png",
  "scripts/nodeagent-local-dashboard-scaffold-smoke.ts",
  "scripts/nodeagent-cli.ts",
  "scripts/nodeagent-sqlite-smoke.ts",
];

function main() {
  const issues: string[] = [];

  for (const target of targets) {
    if (!existsSync(target.path)) {
      issues.push(`missing ${target.path}`);
      continue;
    }
    const text = readFileSync(target.path, "utf8");
    for (const required of target.required) {
      if (!text.includes(required)) issues.push(`${target.path} missing ${required}`);
    }
    if (/API_KEY=.*[A-Za-z0-9_-]{12,}/.test(text)) {
      issues.push(`${target.path} appears to contain an inline API key`);
    }
  }

  for (const path of supportFiles) {
    if (!existsSync(path)) issues.push(`missing ${path}`);
  }

  if (issues.length > 0) {
    console.error("example guidance smoke: FAIL");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log(`example guidance smoke: PASS ${targets.length} guides ${supportFiles.length} support files`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
