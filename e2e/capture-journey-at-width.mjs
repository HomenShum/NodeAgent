/**
 * Journey capture gate, at an arbitrary viewport width.
 *
 * `capture-live-graph-rail.mjs` only ever ran at 1440x900, which is exactly why
 * D1 (the app blanking at every width <= 960px) survived a green gate. This
 * script is the same drive — real Vite dev server, real composer, real loop, no
 * mocks — with the width as a parameter, and with the assertions a stranger on a
 * phone actually cares about:
 *
 *   1. no uncaught page error during the run
 *   2. React is still mounted afterwards (#root has children)
 *   3. the memo card rendered
 *   4. no horizontal overflow at that width
 *   5. the session graph is either populated or explicitly deferred — never
 *      mounted into a zero-width container
 *
 * Two flags widen it to the gate conditions the audit tools cannot reach:
 *
 *   --keyboard  drive the composer with Tab and typed keys only, never
 *               page.fill(), and record the focus path. Condition 6 asks
 *               whether a keyboard user can finish the journey, and
 *               page.fill() answers a different question.
 *   --axe       inject axe-core AFTER the loop has populated the thread and
 *               audit that DOM. The axe CLI can only see the first paint, and
 *               the first paint is the one state with almost nothing in it.
 *
 * Run:  node e2e/capture-journey-at-width.mjs --width 375 --height 812
 *       node e2e/capture-journey-at-width.mjs --width 1440 --height 900
 *       node e2e/capture-journey-at-width.mjs --width 375 --keyboard --axe
 * Exits NONZERO on any failed assertion.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const WIDTH = Number(arg("width", 375));
const HEIGHT = Number(arg("height", 812));
// Wave 2 port. 3000/4173/5173/5177/8787 all collide with sibling agents here.
const PORT = Number(arg("port", 4306));
const LABEL = arg("label", `${WIDTH}`);
const KEYBOARD = process.argv.includes("--keyboard");
const AXE = process.argv.includes("--axe");
// Serious and critical are the two axe impacts this gate treats as "major".
const MAJOR_IMPACTS = new Set(["serious", "critical"]);
const OUT_DIR = join(root, "promotion", "evidence");
const SHOT = join(OUT_DIR, `journey-${LABEL}-run.png`);
const JSON_OUT = join(OUT_DIR, `journey-${LABEL}-observations.json`);
const URL_ = `http://localhost:${PORT}/`;
const TURNS = Number(arg("turns", 1));
const QUESTION =
  "Does our wedge hold versus Acme, and does the runway model survive 18 months?";
// J5 (steering). The second turn feeds the session graph AGAIN, which is a
// different path from the first mount — worth driving at narrow widths.
const FOLLOW_UP = "Ignore Acme — just tell me the runway after the two senior hires.";

const server = spawn(
  process.execPath,
  [join(root, "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"],
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
      const res = await fetch(URL_);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev server did not answer on ${URL_} within ${timeoutMs}ms`);
}

const failures = [];
let observations = {};
let hardFailure = null;
let loopMs = null;
let keyboard = null;
let axeResult = null;

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e)));
  // Own-origin failures are the app's own defects and fail this gate.
  // Third-party ones are recorded but do NOT fail it: index.html:11 pulls
  // Manrope/JetBrains Mono from fonts.googleapis.com, and on a restricted or
  // offline network that woff2 404s and the CSS falls back to system-ui. A
  // stranger behind a proxy must not see a red gate for the app's own code.
  const isOwnOrigin = (u) => typeof u === "string" && u.startsWith(URL_.slice(0, -1));
  const failedRequests = [];
  const thirdPartyFailures = [];
  page.on("requestfailed", (r) =>
    (isOwnOrigin(r.url()) ? failedRequests : thirdPartyFailures).push(`${r.method()} ${r.url()}`),
  );
  // Console errors are recorded separately from uncaught page errors: gate
  // condition 9 asks about BOTH, and a console.error that never throws would
  // otherwise go unobserved.
  const consoleErrors = [];
  const thirdPartyConsoleErrors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const from = m.location()?.url;
    (isOwnOrigin(from) || !from ? consoleErrors : thirdPartyConsoleErrors).push(
      `${m.text()} @ ${from ?? "unknown"}`,
    );
  });

  await page.goto(URL_, { waitUntil: "networkidle" });
  // "attached", not "visible": on the pre-fix tree the rail is display:none at
  // <=960px, and waiting for visibility would fail the script before the
  // journey it is meant to measure ever runs.
  await page.locator('[data-testid="graph-rail"]').waitFor({ state: "attached", timeout: 10_000 });

  // Keyboard mode reaches the composer the way a keyboard user does — Tab
  // presses from the document, then real keystrokes. page.fill() sets .value
  // directly and would pass even if nothing on the page were focusable.
  if (KEYBOARD) {
    const focusPath = [];
    const describe = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { tag: "body", outline: null };
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          cls: el.className || null,
          label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
          // A focus ring that is not drawn is not a focus ring (WIG "Clear
          // focus"). The composer draws its indicator as a border-colour change
          // on the WRAPPER (.na-composer:focus-within), so record that too —
          // reading only `outline` would report "none" on an element that is
          // visibly focused.
          outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
          indicatorBorder: getComputedStyle(el.closest(".na-composer") ?? el).borderColor,
        };
      });
    focusPath.push({ tabs: 0, ...(await describe()) });
    let reached = await page.evaluate(() =>
      document.activeElement?.classList.contains("na-composer-input"),
    );
    for (let i = 1; i <= 12 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      focusPath.push({ tabs: i, ...(await describe()) });
      reached = await page.evaluate(() =>
        document.activeElement?.classList.contains("na-composer-input"),
      );
    }
    keyboard = { reachedComposer: reached, focusPath };
    if (!reached) failures.push("composer never reached by Tab within 12 presses");
    await page.keyboard.type(QUESTION);
  } else {
    await page.fill(".na-composer-input", QUESTION);
  }
  const startedAt = Date.now();
  await page.keyboard.press("Enter");

  // Wait for the memo (last of the four tool cards). If the app blanks, this
  // times out — which is the defect reporting itself rather than a script bug.
  let memoRendered = true;
  try {
    await page.locator(".na-memo").first().waitFor({ timeout: 45_000 });
  } catch {
    memoRendered = false;
  }
  // Composer-Enter to completed memo, at THIS width (gate condition 10).
  loopMs = memoRendered ? Date.now() - startedAt : null;
  await page.waitForTimeout(4_000);

  if (memoRendered && TURNS > 1) {
    const memosBefore = await page.locator(".na-memo").count();
    await page.fill(".na-composer-input", FOLLOW_UP);
    await page.keyboard.press("Enter");
    try {
      await page.waitForFunction(
        (n) => document.querySelectorAll(".na-memo").length > n,
        memosBefore,
        { timeout: 45_000 },
      );
    } catch {
      failures.push(`second turn never produced a memo (still ${memosBefore})`);
    }
    await page.waitForTimeout(4_000);
  }

  observations = await page.evaluate(() => {
    const doc = document.documentElement;
    const rail = document.querySelector('[data-testid="graph-rail"]');
    const canvasHost = document.querySelector('[data-testid="nodegraph-canvas"]');
    const deferred = document.querySelector('[data-testid="graph-rail-deferred"]');
    const rect = rail ? rail.getBoundingClientRect() : null;
    return {
      rootChildren: document.getElementById("root")?.childElementCount ?? 0,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      toolCards: document.querySelectorAll(".na-tool").length,
      memos: document.querySelectorAll(".na-memo").length,
      lastMemoQuestion:
        [...document.querySelectorAll(".na-memo")].at(-1)?.querySelector("p")?.textContent ?? null,
      memoHeading: document.querySelector(".na-memo h2")?.textContent ?? null,
      railWidth: rect ? Math.round(rect.width) : 0,
      railEntities: rail ? Number(rail.getAttribute("data-entities")) : null,
      railEdges: rail ? Number(rail.getAttribute("data-edges")) : null,
      graphMounted: canvasHost !== null,
      graphCanvasWidth: canvasHost ? Math.round(canvasHost.getBoundingClientRect().width) : 0,
      graphDeferred: deferred !== null,
    };
  });

  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: SHOT, fullPage: false });

  // Audit the POPULATED DOM — four tool cards, the memo, the session graph.
  // Same engine the axe CLI runs, resolved from node_modules so this survives
  // a fresh clone rather than depending on an npx cache.
  if (AXE) {
    const require_ = createRequire(import.meta.url);
    await page.addScriptTag({ path: require_.resolve("axe-core") });
    const raw = await page.evaluate(async () => await window.axe.run());
    axeResult = {
      axeVersion: raw.testEngine.version,
      state: "populated",
      passes: raw.passes.length,
      // "incomplete" = axe could not decide, usually because the background is
      // a gradient or a backdrop-filter. Record the targets, not just a count:
      // an unresolved node is exactly the one a human has to measure.
      incomplete: raw.incomplete.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target.join(" ")),
      })),
      violations: raw.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => ({ target: n.target.join(" "), summary: n.failureSummary })),
      })),
    };
    writeFileSync(
      join(OUT_DIR, `axe-populated-${LABEL}.json`),
      `${JSON.stringify({ capturedAt: new Date().toISOString(), viewport: { width: WIDTH, height: HEIGHT }, url: URL_, ...axeResult }, null, 2)}\n`,
    );
    for (const v of axeResult.violations) {
      if (MAJOR_IMPACTS.has(v.impact))
        failures.push(`axe ${v.impact} violation "${v.id}" at ${v.nodes.map((n) => n.target).join(", ")}`);
    }
  }

  if (pageErrors.length) failures.push(`uncaught page errors: ${JSON.stringify(pageErrors)}`);
  if (observations.rootChildren === 0) failures.push("React unmounted — #root is empty (blank page)");
  if (!memoRendered) failures.push("memo card never rendered");
  if (observations.scrollWidth > observations.clientWidth)
    failures.push(`horizontal overflow: scrollWidth ${observations.scrollWidth} > clientWidth ${observations.clientWidth}`);
  // The zero-width mount is the D1 root cause: a graph mounted into a container
  // with no width is what Sigma throws on. Either it has width, or it is
  // explicitly deferred with a visible substitute.
  if (observations.graphMounted && observations.graphCanvasWidth === 0)
    failures.push("session graph mounted into a zero-width container");
  if (!observations.graphMounted && !observations.graphDeferred && observations.railEntities > 0)
    failures.push("session graph neither rendered nor explicitly deferred");
  if (failedRequests.length)
    failures.push(`own-origin failed requests: ${JSON.stringify(failedRequests)}`);
  if (consoleErrors.length) failures.push(`own-origin console errors: ${JSON.stringify(consoleErrors)}`);

  writeFileSync(
    JSON_OUT,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        viewport: { width: WIDTH, height: HEIGHT },
        url: URL_,
        question: QUESTION,
        turns: TURNS,
        followUp: TURNS > 1 ? FOLLOW_UP : null,
        pageErrors,
        consoleErrors,
        failedRequests,
        thirdPartyFailures,
        thirdPartyConsoleErrors,
        memoRendered,
        loopMs,
        keyboard,
        axe: axeResult,
        ...observations,
        result: failures.length ? "FAIL" : "PASS",
        failures,
        screenshot: `promotion/evidence/journey-${LABEL}-run.png`,
      },
      null,
      2,
    )}\n`,
  );

  await browser.close();
} catch (err) {
  hardFailure = err instanceof Error ? err.message : String(err);
} finally {
  stop();
}

if (hardFailure) {
  console.error(`FAIL journey@${WIDTH}: ${hardFailure}`);
  process.exit(1);
}
if (failures.length) {
  console.error(`FAIL journey@${WIDTH}x${HEIGHT}:`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`  observations -> ${JSON_OUT}`);
  process.exit(1);
}
console.log(
  `PASS journey@${WIDTH}x${HEIGHT}: ${observations.toolCards} tool cards, first memo in ${loopMs} ms ` +
    `("${observations.memoHeading}"), ` +
    `rail ${observations.railEntities} entities / ${observations.railEdges} edges ` +
    `(graph ${observations.graphMounted ? `${observations.graphCanvasWidth}px` : "deferred"}), ` +
    (KEYBOARD ? `composer reached in ${keyboard.focusPath.at(-1).tabs} Tab presses, ` : "") +
    (AXE ? `axe ${axeResult.violations.length} violation(s) / 0 serious+critical, ` : "") +
    `no overflow -> ${SHOT}`,
);
