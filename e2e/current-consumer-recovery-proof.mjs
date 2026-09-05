import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer as portProbe } from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const source = path.resolve(import.meta.dirname, '..');
const consumer = path.resolve(process.argv[2] ?? '');
const output = path.resolve(process.argv[3] ?? '');
assert.ok(process.argv[2] && process.argv[3], 'Provide a real installed generated app and NEW output directory');
await mkdir(output, { recursive: false });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = execFileSync('git', ['ls-files', '-z'], { cwd: source, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).toString().split('\0').filter(f => f && !path.basename(f).startsWith('.env'));
sourceFiles.push('e2e/current-consumer-proof.mjs', 'e2e/current-consumer-recovery-proof.mjs', 'examples/apps/chat-ui/template/package-lock.json');
const consumerFiles = ['package.json', 'package-lock.json', 'index.html', 'vite.config.mjs', 'src/main.jsx', 'src/styles.css', 'src/nodeagent-chat/NodeAgentChatApp.jsx', 'src/nodeagent-chat/nodeAgentLocalAdapter.js', 'src/nodeagent-chat/toolUIs.jsx'];
const hashFiles = async (root, files) => Object.fromEntries(await Promise.all(files.map(async f => [f, sha(await readFile(path.join(root, f)))])));
const report = { namedProof: 'NODEAGENT-RESPONSE-RECOVERY-01', startedAt: new Date().toISOString(), sourceBefore: await hashFiles(source, sourceFiles), consumerBefore: await hashFiles(consumer, consumerFiles), passed: false, checks: [], cells: [], captures: [], requests: [], grade: null };
const check = (value, name) => { report.checks.push({ name, passed: Boolean(value) }); assert.ok(value, name); };
let browser, server, page;
let kind, tool, bubble, composer;
const surfaces = process.argv[4] === '--source-only' ? ['source'] : ['generated', 'source'];
async function start(root) {
  const probe = portProbe(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  server = await createServer({ root, envDir: false, server: { host: '127.0.0.1', port, strictPort: true, open: false } }); await server.listen(); return 'http://127.0.0.1:' + port;
}
async function snapshot(name, target = composer) {
  if (target) await page.locator(target).scrollIntoViewIfNeeded();
  let prior = await page.content();
  for (let i = 0; i < 16; i++) { await page.waitForTimeout(200); const current = await page.content(); if (current === prior) break; prior = current; }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const html = await page.content();
  await writeFile(path.join(output, name + '.before.html'), html);
  await page.screenshot({ path: path.join(output, name + '.png'), caret: 'initial' });
  const after = await page.content(); await writeFile(path.join(output, name + '.html'), after);
  check(after === html, name + ' exact DOM during settled screenshot');
  const state = await page.evaluate(() => ({ layout: [...document.querySelectorAll('.na-recovery,.naRecovery,.na-footer,.naFooter,.na-viewport,.naViewport')].map(e=>({class:e.className,scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,box:JSON.parse(JSON.stringify(e.getBoundingClientRect()))})), viewport: { width: innerWidth, height: innerHeight }, scroll: { x: scrollX, y: scrollY }, text: document.body.innerText, overflow: document.documentElement.scrollWidth - innerWidth, focus: { tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label') }, buttons: [...document.querySelectorAll('button')].map(b => ({ label: b.getAttribute('aria-label') || b.textContent, disabled: b.disabled })) }));
  await writeFile(path.join(output, name + '.json'), JSON.stringify(state, null, 2) + '\n');
  report.captures.push({ name, pngSha256: sha(await readFile(path.join(output, name + '.png'))), state }); return state;
}
async function send(question) {
  await page.locator('textarea[name="input"]').fill(question);
  await page.getByRole('button', { name: 'Send', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Send"]')?.disabled === false);
  await page.locator('textarea[name="input"]').press('Enter');
}
async function idleWithCards(count) {
  await page.waitForFunction(({ tool, count }) => document.querySelectorAll(tool).length === count && !document.querySelector('button[aria-label="Stop response"]'), { tool, count });
}
async function activateRetry(retry, keyboard, cell, phase) {
  if (keyboard) { await retry.focus(); await page.keyboard.press('Enter'); return; }
  await retry.evaluate(e => {
    window.proofPointerMotion = {};
    const rect = () => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    e.addEventListener('mousedown', () => window.proofPointerMotion.down = rect(), { once: true });
    document.addEventListener('mouseup', () => window.proofPointerMotion.up = rect(), { once: true, capture: true });
  });
  await retry.dblclick();
  const motion = await page.evaluate(() => window.proofPointerMotion);
  (cell.pointerActivations ??= []).push({ phase, ...motion });
  check(Boolean(motion.down && motion.up) && JSON.stringify(motion.down) === JSON.stringify(motion.up), kind + ' pointer Retry stays in place before activation ' + phase + ' ' + cell.width);
}
async function graph() {
  if (kind === 'generated') return null;
  return page.evaluate(async () => { const m = await import('/src/features/node-agent/graph/agentGraphSession.ts'); return m.graphSession.getSnapshot(); });
}
async function installPartialFailure() {
  await page.evaluate(async ({ modulePath, key }) => {
    const module = await import(modulePath), original = module[key].run;
    window.proofAttempts = [];
    module[key].run = async function* (args) {
      if (window.proofAttempts.length >= 64) throw new Error('PROOF FIXTURE: attempt bound exceeded');
      const attempt = { id: args.unstable_assistantMessageId, parentId: args.unstable_parentId, injectedFailure: window.proofAttempts.length < 2 };
      window.proofAttempts.push(attempt);
      window.proofCurrentMessage = args.unstable_getMessage;
      for await (const frame of original(args)) {
        yield frame;
        const tools = frame.content.filter(p => p.type === 'tool-call');
        if (attempt.injectedFailure && tools.some(p => p.result) && tools.some(p => !p.result)) throw new Error('PROOF FIXTURE: second tool failed after the first actual result.');
      }
    };
  }, { modulePath: kind === 'generated' ? '/src/nodeagent-chat/nodeAgentLocalAdapter.js' : '/src/features/node-agent/runtime/nodeAgentChatAdapter.ts', key: kind === 'generated' ? 'nodeAgentLocalAdapter' : 'nodeAgentChatAdapter' });
}
try {
  browser = await chromium.launch({ headless: true }); report.browser = browser.version(); report.node = process.version;
  for (kind of surfaces) {
    const base = await start(kind === 'generated' ? consumer : source);
    tool = kind === 'generated' ? '.naTool' : '.na-tool'; bubble = kind === 'generated' ? '.naMsgAssistant .naBubble' : '.na-msg-assistant .na-bubble'; composer = kind === 'generated' ? '.naComposer' : '.na-composer';
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      const ctx = await browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 960 }, colorScheme: 'dark' });
      await ctx.route('**/*', route => { const request = route.request(), url = new URL(request.url()); if (report.requests.length < 2000) report.requests.push({ origin: url.origin, path: url.pathname, method: request.method() }); return url.origin === base || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname) ? route.continue() : route.abort(); });
      page = await ctx.newPage(); page.setDefaultTimeout(16000);
      const cell = { kind, width, errors: [], checksStart: report.checks.length, capturesStart: report.captures.length }; report.cells.push(cell); page.on('pageerror', error => cell.errors.push(error.message));
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.locator('textarea[name="input"]').waitFor();
      const question = kind === 'generated' ? 'Does the local NodeAgent wedge hold for an MVP?' : 'Does our wedge hold versus Acme, and does the runway model survive 18 months?';
      await snapshot(kind + '-empty-' + width);
      await send(question); await idleWithCards(4); await page.waitForTimeout(700);
      const earlier = await page.locator(bubble).first().innerText(); const graphBefore = await graph();
      await send(question); await page.locator(tool + '[data-running="true"]').first().waitFor();
      const stop = page.getByRole('button', { name: 'Stop response', exact: true }); const began = Date.now();
      if ([390, 1024, 1920].includes(width)) { await stop.focus(); await page.keyboard.press('Enter'); cell.stopInput = 'keyboard'; } else { await stop.click(); cell.stopInput = 'pointer'; }
      await page.getByText('Stopped this response. Completed work is kept.', { exact: true }).waitFor(); cell.stopLatencyMs = Date.now() - began;
      check(await page.locator(tool + '[data-interrupted="true"]').last().innerText().then(t => t.includes('stopped')), kind + ' native incomplete tool shows stopped ' + width);
      check(await page.locator(bubble).first().innerText() === earlier, kind + ' Stop preserves earlier completed response ' + width);
      const stoppedText = await page.locator(bubble).last().innerText(), stoppedGraph = await graph();
      check(!stoppedText.includes('Done.'), kind + ' stopped response has no fake Done ' + width);
      await page.waitForTimeout(750); check(await page.locator(bubble).last().innerText() === stoppedText, kind + ' stopped response remains stable ' + width); assert.deepEqual(await graph(), stoppedGraph); assert.deepEqual(stoppedGraph, graphBefore);
      await snapshot(kind + '-stopped-' + width);
      check(await page.locator('textarea[name="input"]').evaluate(e => e === document.activeElement), kind + ' Stop retains keyboard continuation focus ' + width);
      await page.getByRole('button', { name: 'Retry response', exact: true }).click(); await idleWithCards(8); check(await page.locator(bubble).count() === 2, kind + ' stopped Retry replaces only current response ' + width);
      await installPartialFailure(); await send(question);
      await page.getByRole('alert').filter({ hasText: 'This response failed.' }).waitFor();
      check(await page.locator(tool + '[data-interrupted="true"]').last().innerText().then(t => t.includes('failed')), kind + ' partial failure names failed tool ' + width);
      await page.waitForTimeout(750); check(await page.evaluate(() => window.proofAttempts.length === 1), kind + ' failed response does not retry automatically ' + width);
      await snapshot(kind + '-error-' + width);
      const retry = page.getByRole('button', { name: 'Retry response', exact: true });
      await activateRetry(retry, [390, 1024, 1920].includes(width), cell, 'fail-again');
      await page.waitForFunction(() => window.proofAttempts.length >= 2 && window.proofCurrentMessage().status?.type === 'incomplete');
      await page.getByRole('alert').filter({ hasText: 'This response failed.' }).waitFor();
      await page.waitForTimeout(750);
      check(await page.evaluate(() => window.proofAttempts.length === 2), kind + ' first explicit Retry fails once with no automatic or duplicate retry ' + width);
      await snapshot(kind + '-error-again-' + width);
      if (width === 390) {
        cell.enlargement = await page.evaluate(() => {
          const targets = [...document.querySelectorAll('*')].filter(e => e.matches('textarea,input,button') || [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
          const originals = targets.map(e => ({ e, style: e.getAttribute('style'), size: parseFloat(getComputedStyle(e).fontSize) }));
          window.proofRestoreText = () => originals.forEach(({ e, style }) => style === null ? e.removeAttribute('style') : e.setAttribute('style', style));
          originals.forEach(({ e, size }) => e.style.fontSize = size * 2 + 'px');
          return { method: 'Test-only original computed text sizes sampled before any mutation, then doubled; not operating-system zoom.', elements: originals.length };
        });
        await page.locator('textarea[name="input"]').focus();
        await page.keyboard.press('Shift+Tab');
        check(await retry.evaluate(e => e === document.activeElement), kind + ' enlarged Retry reachable from composer by keyboard ' + width);
        const enlarged = await snapshot(kind + '-error-text-200-' + width, null);
        cell.enlargement.documentOverflow = enlarged.overflow;
        const changedBounds = await page.locator('.na-recovery,.naRecovery,' + composer).evaluateAll(es => es.map(e => ({ class: e.className, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, overflow: e.scrollWidth - e.clientWidth })));
        cell.enlargement.changedBounds = changedBounds;
        check(changedBounds.every(b => b.left >= -1 && b.right <= width + 1 && b.overflow <= 1), kind + ' enlarged recovery and composer fit ' + width);
        check(await retry.evaluate(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.y >= 0 && r.bottom <= innerHeight && (hit === e || e.contains(hit)); }), kind + ' enlarged Retry paints visibly without overlay obstruction ' + width);
        check(await page.getByRole('alert').evaluate(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.y >= 0 && r.bottom <= innerHeight && (hit === e || e.contains(hit)); }), kind + ' enlarged failure explanation remains visible with Retry ' + width);
        await page.evaluate(() => window.proofRestoreText());
      }
      await activateRetry(retry, [390, 1024, 1920].includes(width), cell, 'recover');
      await idleWithCards(12); cell.attempts = await page.evaluate(() => window.proofAttempts);
      check(cell.attempts.length === 3, kind + ' second explicit Retry recovers once despite repeated activation ' + width);
      check(cell.attempts.every(a => typeof a.id === 'string' && a.id.length > 0) && new Set(cell.attempts.map(a => a.id)).size === 3, kind + ' SDK creates a fresh response identity for both retries ' + width);
      check(new Set(cell.attempts.map(a => a.parentId)).size === 1, kind + ' retries retain the same user parent ' + width);
      check(await page.locator(bubble).first().innerText() === earlier, kind + ' recovery retains earlier evidence ' + width);
      check(await page.getByRole('alert').count() === 0, kind + ' recovered response removes failure notice ' + width);
      await snapshot(kind + '-recovered-' + width);
      if (width === 390) {
        const begin = Date.now(); for (let i = 0; i < 12; i++) { await send(question); await idleWithCards(4 * (4 + i)); }
        cell.accumulation = { additionalTurns: 12, totalResponses: 15, toolCards: 60, elapsedMs: Date.now() - begin };
        await snapshot(kind + '-accumulated-' + width);
      }
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('textarea[name="input"]').waitFor(); check(await page.locator(tool).count() === 0, kind + ' reload resets browser session honestly ' + width);
      await snapshot(kind + '-reloaded-' + width);
      check(cell.errors.every(e => e.includes('PROOF FIXTURE: second tool failed')), kind + ' only the intentional adapter fault reaches page errors ' + width);
      cell.checksEnd = report.checks.length; cell.capturesEnd = report.captures.length; await ctx.close();
    }
    await server.close(); server = null;
  }
  check(report.requests.every(r => r.method === 'GET'), 'no browser writes or provider requests');
  report.sourceAfter = await hashFiles(source, sourceFiles); report.consumerAfter = await hashFiles(consumer, consumerFiles); assert.deepEqual(report.sourceAfter, report.sourceBefore); assert.deepEqual(report.consumerAfter, report.consumerBefore);
  report.passed = true;
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1;
  if (page && !page.isClosed()) { await writeFile(path.join(output, 'failure.html'), await page.content()); await page.screenshot({ path: path.join(output, 'failure.png'), caret: 'initial' }).catch(() => {}); }
} finally {
  await browser?.close(); await server?.close(); report.finishedAt = new Date().toISOString(); await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output, passed: report.passed, checks: report.checks.length, captures: report.captures.length, error: report.error }));
}
