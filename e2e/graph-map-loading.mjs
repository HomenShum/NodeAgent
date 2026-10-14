/** Production-browser regression: npm run build; node e2e/graph-map-loading.mjs dist <new-evidence-dir> */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const dist = path.resolve(process.argv[2] || "dist");
assert(process.argv[3], "Pass a new evidence directory; existing evidence is never overwritten");
const out = path.resolve(process.argv[3]);
fs.mkdirSync(out); // Exclusive directory creation preserves failed runs too.
const assets = new Map();
for (const file of ["index.html", ...fs.readdirSync(path.join(dist, "assets")).filter(f => /\.(js|css)$/.test(f)).map(f => `assets/${f}`)]) {
  const source = path.join(dist, file);
  assert(fs.statSync(source).size <= 5_000_000 && assets.size < 24, "Bound static fixture memory");
  const body = fs.readFileSync(source);
  assets.set(`/${file}`, { body: gzipSync(body), rawBytes: body.length, sha256: createHash("sha256").update(body).digest("hex"), type: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" });
}
const save = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
save("assets.json", [...assets].map(([file, a]) => ({ file, gzipBytes: a.body.length, rawBytes: a.rawBytes, sha256: a.sha256 })));
const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  const asset = assets.get(req.url === "/" ? "/index.html" : req.url);
  if (!asset) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": asset.type, "Content-Encoding": "gzip", "Content-Length": asset.body.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(req.method === "HEAD" ? undefined : asset.body);
});
server.requestTimeout = server.headersTimeout = 10_000;
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const prompt = "Does our wedge hold versus Acme, and does the runway model survive 18 months?";
let browser;
const receipts = [];

async function scenario(width, mode) {
  const key = `${width}-${mode}`;
  const viewport = { width, height: width === 375 ? 812 : 900 };
  const context = await browser.newContext({ viewport, colorScheme: "dark", serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const scripts = new Set(), scriptRequests = [], errors = [], consoleErrors = [], blocked = [];
  let armed = false, heldRoute;
  const receipt = { key, viewport, mode, errors, consoleErrors, blocked, scriptRequests, checks: [] };
  const check = label => receipt.checks.push(label);
  const boundedPush = (list, value) => { assert(list.length < 100, "Bound browser evidence"); list.push(value); };
  const rail = page.getByTestId("graph-rail");
  const list = page.getByRole("button", { name: "List", exact: true });
  const map = page.getByRole("button", { name: "Map", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const done = page.getByText(/^Done\./);
  const graphCounts = () => rail.evaluate(el => ({ entities: el.dataset.entities, edges: el.dataset.edges }));
  const capture = async name => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page overflow");
    await page.screenshot({ path: path.join(out, `${key}-${name}.png`), fullPage: true });
    fs.writeFileSync(path.join(out, `${key}-${name}.txt`), await page.locator("body").innerText(), { flag: "wx" });
  };
  const ask = async text => {
    const count = await done.count();
    await page.getByRole("textbox").fill(text);
    await send.click();
    await done.nth(count).waitFor();
    await send.waitFor();
  };
  try {
    page.on("pageerror", error => boundedPush(errors, error.message));
    page.on("console", msg => { if (msg.type() === "error") boundedPush(consoleErrors, msg.text()); });
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { boundedPush(blocked, url.origin); return route.abort("blockedbyclient"); }
      if (route.request().resourceType() === "script") {
        assert(scripts.size < 24, "Bound script requests");
        scripts.add(url.pathname);
        boundedPush(scriptRequests, url.pathname);
        if (armed && mode === "failure") return route.abort("failed");
        if (armed && mode === "delay") { assert(!heldRoute, "Only one optional renderer request"); heldRoute = route; return; }
      }
      return route.continue();
    });
    await page.goto(origin, { waitUntil: "networkidle" });
    assert(await page.getByRole("textbox").isEditable());
    await capture("empty");
    const initialScripts = new Set(scripts);
    const initialRequestCount = scriptRequests.length;
    receipt.initialRequestedGzipBytes = [...initialScripts].reduce((n, file) => n + assets.get(file).body.length, 0);
    if (mode === "early") {
      await map.click();
      assert.equal(await rail.locator("canvas").count(), 0);
      assert((await rail.innerText()).includes("Ask the room a question"));
      assert.equal(scriptRequests.length, initialRequestCount, "Empty Map must not request renderer code");
      check("Map selected before data retains honest empty state");
    }
    if (mode === "early") {
      await ask(prompt);
      await rail.locator("canvas").first().waitFor();
      assert.equal(scripts.size - initialScripts.size, 1, "Map requests its renderer only after data arrives");
      await list.click();
      assert(Number((await graphCounts()).entities) > 0);
      await capture("populated");
      check("Early Map renders the arriving session; List retains it");
    } else {
      await ask(prompt);
      if (mode === "normal") for (let i = 0; i < 2; i++) await ask(`${prompt} Follow-up ${i + 1}.`);
      assert.deepEqual(scripts, initialScripts, "Several completed List runs must not request Map code");
      const counts = await graphCounts();
      assert(Number(counts.entities) > 0 && Number(counts.edges) > 0);
      await rail.locator("summary").first().click();
      assert((await rail.innerText()).includes("Measured count"));
      const retained = await page.locator(".na-msg-assistant").allTextContents();
      armed = true;
      const started = performance.now();
      await map.click();
      if (mode === "normal") {
        await rail.locator("canvas").first().waitFor();
        receipt.firstMapMs = performance.now() - started;
        receipt.mapScripts = [...scripts].filter(file => !initialScripts.has(file));
        assert.equal(receipt.mapScripts.length, 1, "Selecting Map must request one previously unloaded renderer chunk");
        assert.deepEqual(await graphCounts(), counts);
        assert.deepEqual(await page.locator(".na-msg-assistant").allTextContents(), retained);
        await capture("populated");
        for (let i = 0; i < 20; i++) { await list.click(); await map.click(); await rail.locator("canvas").first().waitFor(); }
        assert.equal(scripts.size, initialScripts.size + 1);
        assert.equal(scriptRequests.length, initialRequestCount + 1, "View switching must not redownload even the same URL");
        assert.deepEqual(await graphCounts(), counts);
        check("Three completed runs, same graph, 20 toggles, no repeat download");
      } else {
        await rail.getByRole(mode === "delay" ? "status" : "alert").waitFor();
        assert((await rail.innerText()).includes(mode === "delay" ? "Loading map" : "Map unavailable"));
        await capture(mode === "delay" ? "loading" : "error");
        assert.deepEqual(await page.locator(".na-msg-assistant").allTextContents(), retained);
        await list.focus(); await page.keyboard.press("Enter");
        assert(await page.getByTestId("graph-entity-list").isVisible());
        await ask(`${prompt} Continue while Map is unavailable.`);
        check("Keyboard List recovery and a new complete answer while Map unavailable");
        if (mode === "delay") {
          assert(heldRoute, "Map request held until explicitly released");
          armed = false;
          await heldRoute.continue(); heldRoute = undefined;
          await map.click(); await rail.locator("canvas").first().waitFor();
          await capture("released");
        }
      }
      const completed = await done.count();
      const prior = await done.allTextContents();
      await page.getByRole("textbox").fill(`${prompt} A response we will stop.`);
      await send.click();
      await page.getByRole("button", { name: "Stop response", exact: true }).waitFor();
      await list.click(); await map.click();
      await page.getByRole("button", { name: "Stop response", exact: true }).click();
      await page.getByText("Stopped this response. Completed work is kept.").waitFor();
      assert.deepEqual(await done.allTextContents(), prior);
      await page.getByRole("button", { name: "Retry response", exact: true }).click();
      await done.nth(completed).waitFor(); await send.waitFor();
      assert.deepEqual((await done.allTextContents()).slice(0, completed), prior);
      await list.click();
      assert(await page.getByTestId("graph-entity-list").isVisible());
      await capture("recovered");
      check("Stop/Retry during view switching preserves previous complete answers");
    }
    receipt.cumulativeRequestedGzipBytes = [...scripts].reduce((n, file) => n + assets.get(file).body.length, 0);
    assert.equal(scriptRequests.length, initialRequestCount + 1, "One renderer request for this whole session, even after failure");
    assert.equal(errors.length, 0, "Optional Map failure must not become an uncaught application error");
    const unexpectedConsole = consoleErrors.filter(message => !/ERR_BLOCKED_BY_CLIENT|ERR_FAILED|Failed to fetch dynamically imported module|Importing a module script failed/.test(message));
    assert.deepEqual(unexpectedConsole, [], "No unexplained console errors");
    receipt.status = "pass";
    console.log(JSON.stringify(receipt));
  } catch (error) {
    receipt.status = "fail"; receipt.failure = error.stack;
    await page.screenshot({ path: path.join(out, `${key}-failure.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    if (heldRoute) await heldRoute.abort().catch(() => {});
    save(`${key}.json`, receipt); receipts.push(receipt); await context.close();
  }
}
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 375]) for (const mode of ["normal", "delay", "failure", "early"]) await scenario(width, mode);
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  save("results.json", { browser: browser?.version(), scope: "Local production bundle, deterministic fixture, external requests blocked; no model/provider or deployment claim", receipts });
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
