/**
 * Web-quality audit gate (PROMOTION condition 8).
 *
 * Runs the two audits the gate names, against the PRODUCTION build served by
 * `vite preview` — not the dev server. A stranger meets the bundle, not the
 * unminified module graph, so auditing the dev server would report a
 * performance number no user will ever experience.
 *
 *   1. Lighthouse 13.4.1 — performance, accessibility, best-practices, SEO,
 *      Core Web Vitals. Run twice: mobile (the default form factor, throttled)
 *      and desktop.
 *   2. axe-core CLI 4.13.0 — WCAG violations on the first paint.
 *
 * Both tools come from `npx --yes <pkg>@<pinned version>`, so this is
 * re-runnable from a fresh clone with no extra install step, and the version is
 * pinned so a later wave measures the same thing.
 *
 * The populated state (four tool cards, a memo and the session graph) is a
 * different DOM, and the axe CLI cannot drive a journey. It is audited by
 * `capture-journey-at-width.mjs --axe`, which injects the same axe-core engine
 * after the loop has run.
 *
 * Run:  node e2e/audit-web-quality.mjs
 *       node e2e/audit-web-quality.mjs --no-build     (reuse dist/)
 * Exits NONZERO on any serious/critical axe violation, or if the Lighthouse
 * accessibility category drops below 0.90.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, "promotion", "evidence");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const has = (name) => process.argv.includes(`--${name}`);

const PORT = Number(arg("port", 4904));
const URL_ = `http://127.0.0.1:${PORT}/`;
const LH_VERSION = "13.4.1";
const AXE_CLI_VERSION = "4.13.0";
// Serious and critical are the two axe impacts the gate treats as "major".
const MAJOR_IMPACTS = new Set(["serious", "critical"]);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

mkdirSync(OUT_DIR, { recursive: true });

const commands = [];
function run(cmd, args, label) {
  const printable = `${cmd} ${args.join(" ")}`;
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  commands.push({ label, command: printable, exit: res.status });
  return res.status;
}

if (!has("no-build")) {
  if (run(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "build"], "build") !== 0) {
    console.error("FAIL web-quality: production build failed");
    process.exit(1);
  }
} else if (!existsSync(join(root, "dist", "index.html"))) {
  console.error("FAIL web-quality: --no-build but dist/index.html does not exist");
  process.exit(1);
}

const server = spawn(
  process.execPath,
  [
    join(root, "node_modules", "vite", "bin", "vite.js"),
    "preview",
    "--port",
    String(PORT),
    "--strictPort",
    "--host",
    "127.0.0.1",
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
server.stderr.on("data", (d) => process.stderr.write(d));
const stop = () => {
  if (!server.killed) server.kill();
};
process.on("exit", stop);

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(URL_)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`vite preview did not answer on ${URL_} within ${timeoutMs}ms`);
}

const failures = [];
let summary = {};

try {
  await waitForServer();

  // --- Lighthouse, both form factors -------------------------------------
  const lighthouse = {};
  for (const [formFactor, extra] of [
    ["mobile", []],
    ["desktop", ["--preset=desktop"]],
  ]) {
    const out = join(OUT_DIR, `lighthouse-${formFactor}.json`);
    run(
      npx,
      [
        "--yes",
        `lighthouse@${LH_VERSION}`,
        URL_,
        "--output=json",
        `--output-path=${out}`,
        '--chrome-flags="--headless"',
        "--quiet",
        ...extra,
      ],
      `lighthouse-${formFactor}`,
    );
    if (!existsSync(out)) {
      failures.push(`lighthouse (${formFactor}) produced no report`);
      continue;
    }
    const lhr = JSON.parse(readFileSync(out, "utf8"));
    const num = (id) => lhr.audits[id]?.numericValue ?? null;
    lighthouse[formFactor] = {
      report: `promotion/evidence/lighthouse-${formFactor}.json`,
      lighthouseVersion: lhr.lighthouseVersion,
      fetchTime: lhr.fetchTime,
      categories: Object.fromEntries(Object.entries(lhr.categories).map(([k, c]) => [k, c.score])),
      metrics: {
        firstContentfulPaintMs: num("first-contentful-paint"),
        largestContentfulPaintMs: num("largest-contentful-paint"),
        cumulativeLayoutShift: num("cumulative-layout-shift"),
        totalBlockingTimeMs: num("total-blocking-time"),
        speedIndexMs: num("speed-index"),
        timeToInteractiveMs: num("interactive"),
      },
      // Every audit the run scored below 1, so a reader can see what was
      // traded away rather than only the rolled-up category number.
      failedAudits: Object.entries(lhr.audits)
        .filter(
          ([, a]) =>
            a.score !== null && a.score < 1 && !["informative", "notApplicable"].includes(a.scoreDisplayMode),
        )
        .map(([id, a]) => ({ id, score: a.score, title: a.title })),
    };
    const a11y = lhr.categories.accessibility?.score ?? 0;
    if (a11y < 0.9) failures.push(`lighthouse ${formFactor} accessibility ${a11y} < 0.90`);
  }

  // --- axe-core CLI, first paint -----------------------------------------
  const axeOut = join(OUT_DIR, "axe-initial.json");
  // --save is resolved against the CLI's cwd, so an absolute path gets
  // concatenated onto it. Pass the repo-relative one.
  run(
    npx,
    ["--yes", `@axe-core/cli@${AXE_CLI_VERSION}`, URL_, "--save", "promotion/evidence/axe-initial.json"],
    "axe-initial",
  );
  let axe = null;
  if (!existsSync(axeOut)) {
    failures.push("axe CLI produced no report");
  } else {
    const [result] = JSON.parse(readFileSync(axeOut, "utf8"));
    axe = {
      report: "promotion/evidence/axe-initial.json",
      url: result.url,
      axeVersion: result.testEngine.version,
      timestamp: result.timestamp,
      passes: result.passes.length,
      incomplete: result.incomplete.length,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target.join(" ")),
      })),
    };
    for (const v of axe.violations) {
      if (MAJOR_IMPACTS.has(v.impact)) failures.push(`axe ${v.impact} violation "${v.id}" at ${v.nodes.join(", ")}`);
    }
  }

  summary = {
    capturedAt: new Date().toISOString(),
    surface: `${URL_} (vite preview — the production build, not the dev server)`,
    commands,
    lighthouse,
    axe,
    // Moderate/minor axe violations and sub-1 Lighthouse audits are recorded
    // but do not fail this gate; the gate condition is "no MAJOR unresolved".
    result: failures.length ? "FAIL" : "PASS",
    failures,
  };
  writeFileSync(join(OUT_DIR, "web-quality-audit.json"), `${JSON.stringify(summary, null, 2)}\n`);
} catch (err) {
  console.error(`FAIL web-quality: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  stop();
}

if (failures.length) {
  console.error("FAIL web-quality audit:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
const cat = (f) => Object.entries(summary.lighthouse[f]?.categories ?? {}).map(([k, v]) => `${k} ${v}`).join(", ");
console.log(
  `PASS web-quality: lighthouse mobile [${cat("mobile")}], desktop [${cat("desktop")}]; ` +
    `axe ${summary.axe.violations.length} violation(s), 0 serious/critical -> promotion/evidence/web-quality-audit.json`,
);
