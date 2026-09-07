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
 *   5. the session graph has a readable populated List or visible Map — never
 *      a zero-width canvas or a missing reading surface
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
 * Reading fixtures: --touch, --text200 (all computed font sizes), --reduced-motion.
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
// These explicit observation fixtures do not change application data or handlers.
const TOUCH = process.argv.includes("--touch");
const TEXT200 = process.argv.includes("--text200");
const REDUCED = process.argv.includes("--reduced-motion");
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
let graphReading = null;
let browser = null;
let textStyles = null;
const textFixtures = [];

async function applyTextFixture(page) {
  if (!TEXT200) return;
  const measured = await page.evaluate((saved) => {
    for (const [el, style] of saved) {
      if (!el.isConnected) { saved.delete(el); continue; }
      if (style.value) el.style.setProperty("font-size", style.value, style.priority);
      else el.style.removeProperty("font-size");
    }
    // Measure every current computed size before writing any doubled size.
    const sizes = [...document.querySelectorAll("*")].map((el) => {
      if (!saved.has(el)) saved.set(el, { value: el.style.getPropertyValue("font-size"), priority: el.style.getPropertyPriority("font-size") });
      return [el, parseFloat(getComputedStyle(el).fontSize)];
    });
    for (const [el, size] of sizes) el.style.setProperty("font-size", `${size * 2}px`, "important");
    return { elements: sizes.length, mismatches: sizes.filter(([el, size]) => Math.abs(parseFloat(getComputedStyle(el).fontSize) - size * 2) > 0.01).length };
  }, textStyles);
  textFixtures.push(measured);
  if (measured.mismatches) throw new Error("computed text fixture did not double every current font");
}

// The Vite-served source module is the UI's existing live store. Reading it
// supplies an independent expected payload; this never injects graph data.
const readSession = (page) => page.evaluate(async () => {
  const { graphSession } = await import("/src/features/node-agent/graph/agentGraphSession.ts");
  return structuredClone(graphSession.getSnapshot());
});

async function activate(page, locator, key = "Enter") {
  if (!KEYBOARD) return TOUCH ? locator.tap() : locator.click();
  for (let i = 0; i < 64; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) {
      if (key) await page.keyboard.press(key);
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(`native keyboard could not reach ${await locator.textContent()}`);
}

async function readList(page, snapshot, records, phase = "initial") {
  await applyTextFixture(page);
  const list = page.getByTestId("graph-entity-list");
  await list.waitFor({ state: "visible", timeout: 10_000 });
  const summaries = list.locator("summary");
  if (await summaries.count() !== snapshot.nodes.length) throw new Error("List does not contain every retained entity");
  for (let i = 0; i < snapshot.nodes.length; i += 1) {
    const summary = summaries.nth(i);
    await activate(page, summary);
    const record = await summary.evaluate((el) => {
      const details = el.closest("details");
      const label = el.querySelector(".na-entity-label");
      const r = el.getBoundingClientRect();
      const header = el.closest('[data-testid="graph-rail"]').querySelector(".na-rail-head");
      const range = document.createRange();
      range.selectNodeContents(label);
      const lines = [...range.getClientRects()].map((v) => ({ left: v.left, right: v.right, top: v.top, bottom: v.bottom }));
      const clips = [];
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) {
          const b = p.getBoundingClientRect();
          clips.push({ left: b.left + p.clientLeft, right: b.left + p.clientLeft + p.clientWidth,
            top: b.top + p.clientTop, bottom: b.top + p.clientTop + p.clientHeight });
        }
      }
      return {
        id: details.dataset.nodeId, open: details.open,
        label: label.textContent, kind: el.querySelector(".na-entity-kind").textContent,
        counts: [...details.querySelectorAll(".na-entity-counts dd")].map((n) => n.textContent),
        edges: [...details.querySelectorAll("[data-edge-key]")].map((n) => ({
          key: n.dataset.edgeKey,
          label: n.querySelector(".na-related-label").textContent,
          kind: n.querySelector(".na-entity-kind").textContent,
          type: n.querySelector(".na-relationship-type").textContent,
          reading: n.querySelector("p").textContent,
        })),
        focused: document.activeElement === el,
        stickyHeaderBottom: getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().bottom : null,
        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
        lines, clips, viewport: { width: innerWidth, height: innerHeight },
      };
    });
    records.push(record);
    const node = snapshot.nodes[i];
    const incident = snapshot.edges.filter((e) => e.source === node.id || e.target === node.id);
    if (!record.open || record.id !== node.id || record.label !== node.label || record.kind !== node.type) throw new Error(`wrong entity reading at ${i}`);
    if (record.rect.top < -1 || record.rect.bottom > record.viewport.height + 1) throw new Error(`native summary reading is outside viewport: ${node.label}`);
    if (record.stickyHeaderBottom !== null && record.rect.top < record.stickyHeaderBottom - 1) throw new Error(`native summary reading is covered by the sticky header: ${node.label}`);
    if (record.clips.some((c) => record.rect.top < c.top - 1 || record.rect.bottom > c.bottom + 1)) throw new Error(`native summary reading is clipped by its scrollport: ${node.label}`);
    if (KEYBOARD && !record.focused) throw new Error(`summary lost native focus at ${i}`);
    if (!record.lines.length || record.lines.some((r) => r.right > record.viewport.width + 1 || r.left < -1 || record.clips.some((c) => r.left < c.left - 1 || r.right > c.right + 1))) throw new Error(`entity label clips horizontally: ${node.label}`);
    const count = node.count === undefined ? "unknown — not measured" : node.count.toLocaleString();
    if (record.counts[0] !== count || record.counts[1] !== `${node.visits.toLocaleString()} — activity, not evidence strength`) throw new Error(`wrong measured/activity metadata: ${node.label}`);
    const expectedKeys = incident.map((e) => JSON.stringify([[e.source, e.target].sort()[0], [e.source, e.target].sort()[1], e.type])).sort();
    if (JSON.stringify(record.edges.map((e) => e.key).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`missing, duplicated or mistyped relationship: ${node.label}`);
    for (const edge of incident) {
      const key = JSON.stringify([...([edge.source, edge.target].sort()), edge.type]);
      const actual = record.edges.find((e) => e.key === key);
      const other = snapshot.nodes.find((n) => n.id === (edge.source === node.id ? edge.target : edge.source));
      const reading = edge.type === "evidence" ? `Measurement: ${edge.weight.toLocaleString()}`
        : edge.type === "traversal" ? `Observed together: ${edge.weight.toLocaleString()} times — activity, not evidence.`
          : `Curated claim · ${edge.receipt.source} · ${edge.receipt.release} · Receipt`;
      if (actual.label !== other.label || actual.kind !== other.type || actual.type !== edge.type || actual.reading !== reading) throw new Error(`wrong typed relationship reading: ${node.label}`);
    }
    if (node.label.length === Math.max(...snapshot.nodes.map((n) => n.label.length))) {
      await page.screenshot({ path: join(OUT_DIR, `journey-${LABEL}-long-entity-${phase}-${i}.png`), fullPage: false });
      const relationship = summary.locator("..").locator(".na-relationships > li").first();
      if (await relationship.count()) {
        const reading = record.relationshipReading = { attempts: [], segments: [], complete: false };
        let covered = 0;
        for (let scroll = 0; scroll < 64 && !reading.complete; scroll += 1) {
          const b = await relationship.evaluate((el) => {
            const r = el.getBoundingClientRect(), rail = el.closest('[data-testid="graph-rail"]');
            const c = rail.getBoundingClientRect(), header = rail.querySelector(".na-rail-head");
            const top = Math.max(0, c.top + rail.clientTop,
              getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().bottom : 0);
            return { top, bottom: Math.min(innerHeight, c.top + rail.clientTop + rail.clientHeight),
              y: r.top, height: r.height, x: c.left + c.width / 2 };
          });
          reading.attempts.push(b);
          const start = Math.max(0, b.top - b.y), end = Math.min(b.height, b.bottom - b.y);
          if (start <= covered + 1 && end > covered + 1) {
            const name = `journey-${LABEL}-relationship-${phase}-${i}-${reading.segments.length}.png`;
            await page.screenshot({ path: join(OUT_DIR, name), fullPage: false });
            reading.segments.push({ start, end, file: name }); covered = end;
            reading.complete = covered >= b.height - 1;
          }
          if (!reading.complete) {
            const delta = start > covered + 1 ? b.y + covered - b.top
              : covered === 0 ? b.y - b.top : Math.min((b.bottom - b.top) * 0.7, b.height - covered);
            if (KEYBOARD) await page.keyboard.press(delta < 0 ? "ArrowUp" : "ArrowDown");
            else {
              await page.mouse.move(b.x, (b.top + b.bottom) / 2);
              await page.mouse.wheel(0, delta);
            }
            await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          }
        }
        if (!reading.complete) {
          await page.screenshot({ path: join(OUT_DIR, `journey-${LABEL}-relationship-failure.png`), fullPage: false });
          throw new Error("native scrolling left part of the typed relationship unread");
        }
      }
    }
    await activate(page, summary);
    if (await summary.evaluate((el) => el.closest("details").open)) throw new Error("native summary did not close");
  }
  return records;
}

async function readGraphJourney(page) {
  const snapshot = await readSession(page);
  const rail = page.getByTestId("graph-rail");
  const listButton = rail.getByRole("button", { name: "List", exact: true });
  const mapButton = rail.getByRole("button", { name: "Map", exact: true });
  if (await listButton.getAttribute("aria-pressed") !== "true" || await page.getByTestId("nodegraph-canvas").count()) throw new Error("List was not the default reading view");
  const initial = await page.getByTestId("graph-entity-list").locator("summary").first().evaluate((el) => {
    const r = el.getBoundingClientRect(), rail = el.closest(".na-rail").getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, railTop: rail.top, railBottom: rail.bottom, viewportHeight: innerHeight };
  });
  graphReading = { snapshot, initial, records: [], restoredSessionExact: false };
  if (initial.top < initial.railTop - 1 || initial.bottom > Math.min(initial.railBottom, initial.viewportHeight) + 1) throw new Error("first List entity is not visible at the initial reading position");
  const records = await readList(page, snapshot, graphReading.records);
  await activate(page, mapButton);
  const canvas = page.getByTestId("nodegraph-canvas");
  await canvas.waitFor({ state: "visible", timeout: 10_000 });
  await applyTextFixture(page);
  const box = await canvas.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) throw new Error("Map mounted into an empty container");
  await activate(page, page.getByTestId("nodegraph-fit"));
  const traversal = rail.locator('input[data-filter-type="traversal"]');
  await activate(page, traversal, "Space");
  if (await traversal.isChecked()) throw new Error("native traversal filter did not turn off");
  const visible = snapshot.edges.filter((e) => e.type !== "traversal").length;
  const mapText = await page.getByTestId("nodegraph").locator("header").innerText();
  if (!mapText.includes(`${visible} of ${snapshot.edges.length} relationships shown`)) throw new Error("Map filter count does not match actual typed snapshot");
  await page.screenshot({ path: join(OUT_DIR, `journey-${LABEL}-map-filtered.png`), fullPage: false });
  await activate(page, listButton);
  await page.getByTestId("graph-entity-list").waitFor({ state: "visible", timeout: 10_000 });
  if (await page.getByTestId("nodegraph-canvas").count()) throw new Error("Map remained mounted while List was selected");
  const after = await readSession(page);
  if (JSON.stringify(after) !== JSON.stringify(snapshot)) throw new Error("reading/filtering changed the session");
  if (await page.locator("[data-edge-key]").count() !== snapshot.edges.length * 2) throw new Error("Map filtering leaked into the full List");
  await applyTextFixture(page);
  return { snapshot, initial, records, map: { box, visibleEdges: visible, text: mapText }, restoredSessionExact: true, optionalMapLabelDefect: "unchanged; this is not a canvas-legibility pass" };
}

try {
  await waitForServer();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: TOUCH, reducedMotion: REDUCED ? "reduce" : "no-preference" });

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
  textStyles = await page.evaluateHandle(() => new Map());
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

  mkdirSync(OUT_DIR, { recursive: true });
  await applyTextFixture(page);
  await page.screenshot({ path: join(OUT_DIR, `journey-${LABEL}-default-list.png`), fullPage: false });
  if (memoRendered) graphReading = await readGraphJourney(page);

  if (memoRendered && TURNS > 1) {
    const memosBefore = await page.locator(".na-memo").count();
    await activate(page, page.getByTestId("graph-rail").getByRole("button", { name: "Map", exact: true }));
    const liveCanvas = await page.getByTestId("nodegraph-canvas").elementHandle();
    const composer = page.locator(".na-composer-input");
    await activate(page, composer, null);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(FOLLOW_UP);
    await page.keyboard.press("Enter");
    const composerState = () => composer.evaluate((el) => ({ value: el.value, focused: el === document.activeElement }));
    graphReading.followUp = { records: [], composer: { afterEnter: await composerState() } };
    // State clears on send; wait for that cleared value to reach the DOM before
    // native typing can feed the previous rendered value back into the composer.
    await page.waitForFunction(() => document.querySelector(".na-composer-input")?.value === "", null, { timeout: 5_000 });
    graphReading.followUp.composer.afterReset = await composerState();
    await page.keyboard.type("Unsent review note");
    graphReading.followUp.composer.afterTyping = await composerState();
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
    graphReading.followUp.composer.afterStream = await composerState();
    const focusKept = graphReading.followUp.composer.afterStream.focused;
    const draftKept = graphReading.followUp.composer.afterStream.value === "Unsent review note";
    const mapKept = await liveCanvas.evaluate((el) => el.isConnected && el === document.querySelector('[data-testid="nodegraph-canvas"]'));
    if (!focusKept || !draftKept || !mapKept) failures.push("streaming changed composer focus/draft or remounted the active Map");
    await activate(page, page.getByTestId("graph-rail").getByRole("button", { name: "List", exact: true }));
    const snapshot = await readSession(page);
    Object.assign(graphReading.followUp, { snapshot, focusKept, draftKept, mapKept });
    await readList(page, snapshot, graphReading.followUp.records, "follow-up");
    graphReading.followUp.composer.afterReading = await composerState();
    if (await composer.inputValue() !== "Unsent review note") failures.push("reading the updated List lost the unsent note");
    if (JSON.stringify(await readSession(page)) !== JSON.stringify(snapshot)) failures.push("reading the updated List mutated the session");
  }

  observations = await page.evaluate(() => {
    const doc = document.documentElement;
    const rail = document.querySelector('[data-testid="graph-rail"]');
    const canvasHost = document.querySelector('[data-testid="nodegraph-canvas"]');
    const deferred = document.querySelector('[data-testid="graph-rail-deferred"]');
    const list = document.querySelector('[data-testid="graph-entity-list"]');
    const rect = rail ? rail.getBoundingClientRect() : null;
    return {
      userAgent: navigator.userAgent,
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
      graphListVisible: !!list && list.getBoundingClientRect().width > 0 && list.getBoundingClientRect().height > 0,
      graphListEntities: list?.querySelectorAll("details[data-node-id]").length ?? 0,
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
  if (!observations.graphMounted && !observations.graphListVisible && !observations.graphDeferred && observations.railEntities > 0)
    failures.push("session graph has neither a visible Map, a readable List nor an explicit deferral");
  if (observations.graphListVisible && observations.graphListEntities !== observations.railEntities)
    failures.push("readable List does not contain every retained entity");
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
        observationFixtures: { touchEmulation: TOUCH, computedText200: TEXT200, reducedMotion: REDUCED },
        textFixtures,
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
        graphReading,
        ...observations,
        result: failures.length ? "FAIL" : "PASS",
        failures,
        screenshot: `promotion/evidence/journey-${LABEL}-run.png`,
      },
      null,
      2,
    )}\n`,
  );

} catch (err) {
  hardFailure = err instanceof Error ? err.message : String(err);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(JSON_OUT, `${JSON.stringify({ result: "FAIL", hardFailure, observations, graphReading, failures }, null, 2)}\n`);
} finally {
  try { if (browser) await browser.close(); } finally { stop(); }
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
    `(graph ${observations.graphMounted ? `${observations.graphCanvasWidth}px Map` : observations.graphListVisible ? `${observations.graphListEntities} readable List entities` : "deferred"}), ` +
    (KEYBOARD ? `composer reached in ${keyboard.focusPath.at(-1).tabs} Tab presses, ` : "") +
    (AXE ? `axe ${axeResult.violations.length} violation(s) / 0 serious+critical, ` : "") +
    `no overflow -> ${SHOT}`,
);
