import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requiredTables = [
  "nodeagentJobs",
  "nodeagentFrames",
  "nodeagentLeases",
  "nodeagentJournal",
  "nodeagentReceipts",
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const schema = readFileSync("convex/schema.ts", "utf8");
  const issues: string[] = [];
  for (const table of requiredTables) {
    if (!schema.includes(`${table}: defineTable`)) issues.push(`schema missing ${table}`);
  }
  for (const index of ["by_job", "by_frame", "by_resource", "by_key", "by_receipt"]) {
    if (!schema.includes(`.index("${index}"`)) issues.push(`schema missing ${index} index`);
  }
  const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  let convexReachable: boolean | undefined;
  let convexStatus: number | undefined;
  let convexError: string | undefined;
  if (!url) {
    if (!args["skip-if-missing"]) issues.push("CONVEX_URL or VITE_CONVEX_URL is required");
  } else {
    try {
      const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
      convexReachable = response.status < 500;
      convexStatus = response.status;
      if (!convexReachable) issues.push(`Convex URL returned ${response.status}`);
    } catch (error) {
      convexReachable = false;
      convexError = sanitizeError(error);
      issues.push(`Convex URL unreachable: ${convexError}`);
    }
  }
  const report = {
    ok: issues.length === 0,
    startedAt,
    completedAt: new Date().toISOString(),
    requiredTables,
    convexConfigured: !!url,
    convexReachable,
    convexStatus,
    convexError,
    issues,
  };
  if (args["json-out"]) writeJson(args["json-out"], report);
  console.log(`nodeagent convex smoke: ${report.ok ? "PASS" : "FAIL"} tables=${requiredTables.length} convex=${url ? (convexReachable ? "reachable" : "unreachable") : "not_configured"}`);
  if (!report.ok) process.exitCode = 1;
}

function parseArgs(args: string[]) {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2);
    const next = inline ?? args[index + 1];
    if (inline === undefined && next && !next.startsWith("--")) index += 1;
    parsed[key] = next && !next.startsWith("--") ? next : true;
  }
  return parsed;
}

function loadEnvFile(path: string) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return;
  const text = readFileSync(absolute, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    if (process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function sanitizeError(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of Object.values(process.env)) {
    if (value && value.length > 12) message = message.replaceAll(value, "[redacted]");
  }
  return message.replace(/\s+/g, " ").slice(0, 300);
}

function writeJson(path: string | boolean, value: unknown) {
  if (typeof path !== "string") return;
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(sanitizeError(error));
    process.exit(1);
  });
}
