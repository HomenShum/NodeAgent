/**
 * Live graph rail RECORDING gate.
 *
 * Same real path as e2e/capture-live-graph-rail.mjs — real Vite dev server,
 * real chat composer, real demo loop, no mocks — but records a video instead
 * of a still: the question is TYPED character-by-character into the composer,
 * submitted, and the clip runs until the tool UIs and the right-rail session
 * graph have visibly populated from the live loop's session.observe() calls.
 *
 * Output: e2e/.recordings/live-graph-rail.webm (convert to GIF with ffmpeg —
 * see docs/GRAPH_INTEGRATION.md). Exits NONZERO if the rail never populates.
 * Run: `node e2e/record-live-graph-rail.mjs`
 */

import { spawn } from "node:child_process";
import { mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5199; // distinct from capture gate's 5177 and dev's 5173
const URL_ = `http://localhost:${PORT}/`;
const VIDEO_DIR = join(root, "e2e", ".recordings");
const OUT = join(VIDEO_DIR, "live-graph-rail.webm");
const QUESTION =
  "Does our wedge hold versus Acme, and does the runway model survive 18 months?";

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

let failed = false;
try {
  await waitForServer();
  mkdirSync(VIDEO_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 860 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1400, height: 860 } },
  });
  const page = await context.newPage();
  await page.goto(URL_, { waitUntil: "networkidle" });

  // The rail must be EMPTY before the run, or the clip proves nothing.
  const rail = page.locator('[data-testid="graph-rail"]');
  await rail.waitFor({ timeout: 10_000 });
  const before = Number(await rail.getAttribute("data-entities"));
  if (before !== 0) throw new Error(`rail already had ${before} entities before the run`);

  // A beat on the empty state, then type the question like a person would.
  await page.waitForTimeout(1_500);
  await page.click(".na-composer-input");
  await page.type(".na-composer-input", QUESTION, { delay: 45 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");

  // The loop streams four steps; the rail must fill as they complete.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="graph-rail"]');
      return el !== null && Number(el.getAttribute("data-entities")) > 0;
    },
    undefined,
    { timeout: 60_000 },
  );

  // Let the force layout settle and the ingestion motion window close on film.
  await page.waitForTimeout(6_000);

  const entities = Number(await rail.getAttribute("data-entities"));
  const edges = Number(await rail.getAttribute("data-edges"));
  const video = page.video();
  await context.close(); // flushes the webm
  await browser.close();

  if (!(entities > 0)) throw new Error("graph rail is empty after the demo loop");
  const rawPath = await video.path();
  renameSync(rawPath, OUT);
  console.log(`PASS live graph rail recording: ${entities} entities, ${edges} edges -> ${OUT}`);
} catch (err) {
  failed = true;
  console.error(`FAIL live graph rail recording: ${err instanceof Error ? err.message : err}`);
} finally {
  stop();
}
process.exit(failed ? 1 : 0);
