/**
 * Live graph rail capture gate.
 *
 * Starts the real Vite dev server, drives the REAL demo loop through the chat
 * composer (no mocks, no injected state), waits for the right-rail session
 * graph to report >0 entities via its data-entities attribute, and screenshots
 * the populated dashboard to docs/media/live-graph-rail.png.
 *
 * Exits NONZERO if the rail never populates — an empty rail is a failed gate,
 * not a soft warning. Run: `node e2e/capture-live-graph-rail.mjs`
 * (requires `npx playwright install chromium` once).
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5177;
const URL_ = `http://localhost:${PORT}/`;
const OUT = join(root, "docs", "media", "live-graph-rail.png");
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
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL_, { waitUntil: "networkidle" });

  // The rail exists but must be EMPTY before the run — otherwise this capture
  // would prove nothing about the live loop feeding it.
  const rail = page.locator('[data-testid="graph-rail"]');
  await rail.waitFor({ timeout: 10_000 });
  const before = Number(await rail.getAttribute("data-entities"));
  if (before !== 0) throw new Error(`rail already had ${before} entities before the run`);

  // Drive the real demo loop through the real composer.
  await page.fill(".na-composer-input", QUESTION);
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

  // Let the force layout settle and the ingestion motion window close.
  await page.waitForTimeout(4_000);

  const entities = Number(await rail.getAttribute("data-entities"));
  const edges = Number(await rail.getAttribute("data-edges"));
  mkdirSync(dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, fullPage: false });
  await browser.close();

  if (!(entities > 0)) throw new Error("graph rail is empty after the demo loop");
  console.log(`PASS live graph rail: ${entities} entities, ${edges} edges -> ${OUT}`);
} catch (err) {
  failed = true;
  console.error(`FAIL live graph rail capture: ${err instanceof Error ? err.message : err}`);
} finally {
  stop();
}
process.exit(failed ? 1 : 0);
