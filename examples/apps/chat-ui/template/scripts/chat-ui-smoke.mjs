import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";

const startedAt = new Date();
const issues = [];

for (const file of [
  "package.json",
  ".env.example",
  "AGENTS.md",
  "README.md",
  "index.html",
  "public/nodeagent-chat-state.json",
  "src/main.jsx",
  "src/nodeagent-chat/NodeAgentChatApp.jsx",
  "src/nodeagent-chat/nodeAgentLocalAdapter.js",
  "src/nodeagent-chat/toolUIs.jsx",
  "src/styles.css",
]) {
  if (!existsSync(file)) issues.push(`missing ${file}`);
}

if (issues.length === 0) {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const app = readFileSync("src/nodeagent-chat/NodeAgentChatApp.jsx", "utf8");
  const adapter = readFileSync("src/nodeagent-chat/nodeAgentLocalAdapter.js", "utf8");
  const tools = readFileSync("src/nodeagent-chat/toolUIs.jsx", "utf8");
  const readme = readFileSync("README.md", "utf8");
  const env = readFileSync(".env.example", "utf8");

  for (const script of ["dev", "agent:demo", "smoke", "build"]) {
    if (!packageJson.scripts?.[script]) issues.push(`package.json missing ${script}`);
  }
  for (const dependency of ["@assistant-ui/react", "react", "react-dom"]) {
    if (!packageJson.dependencies?.[dependency]) issues.push(`package.json missing ${dependency}`);
  }
  for (const required of ["AssistantRuntimeProvider", "useLocalRuntime", "data-nodeagent-chat", "NodeAgentToolUIs"]) {
    if (!app.includes(required)) issues.push(`NodeAgentChatApp.jsx missing ${required}`);
  }
  for (const required of ["apiKeysRequired: false", "collect_context", "search_synthesize", "apply_model_delta", "write_memo"]) {
    if (!adapter.includes(required)) issues.push(`nodeAgentLocalAdapter.js missing ${required}`);
  }
  for (const required of ["makeAssistantToolUI", "collect_context", "search_synthesize", "apply_model_delta", "write_memo"]) {
    if (!tools.includes(required)) issues.push(`toolUIs.jsx missing ${required}`);
  }
  for (const required of ["## No API Keys", "## Chat Runtime", "npm run agent:demo", "npm run build"]) {
    if (!readme.includes(required)) issues.push(`README.md missing ${required}`);
  }
  if (!env.includes("NODEAGENT_MODE=scripted")) issues.push(".env.example missing scripted mode");
}

const runtime = { proof: "GeneratedChatStopRetry-v1", passed: 0, failed: 0, scenarios: [] };
if (issues.length === 0) {
  const deadline = setTimeout(() => {
    issues.push("runtime exceeded 50 seconds");
    reportResult();
    process.exit(1);
  }, 50_000);
  try {
    await checkRuntime();
  } catch (error) {
    issues.push(`runtime setup: ${String(error).slice(0, 500)}`);
  } finally {
    clearTimeout(deadline);
  }
}

reportResult();

function reportResult() {
  writeJson("docs/eval/chat-ui-smoke.json", {
    ok: issues.length === 0,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    apiKeysRequired: false,
    scaffold: "chat-ui",
    runtime,
    issues,
  });
  if (issues.length > 0) {
    console.error("nodeagent chat ui smoke: FAIL");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(`nodeagent chat ui smoke: PASS (${runtime.passed} runtime scenarios)`);
  }
}

async function checkRuntime() {
  const { nodeAgentLocalAdapter: adapter, SUGGESTED_PROMPT } = await import("../src/nodeagent-chat/nodeAgentLocalAdapter.js");
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = new Set();
  const sessions = [];
  let afterTimer;
  let peakTimers = 0;
  let cancellations = 0;

  // Observe real timers; preserve ordinary/zero-delay scheduling and restore globals.
  globalThis.setTimeout = (callback, ms, ...args) => {
    assert.ok(timers.size < 4, "at most four concurrent adapter waits");
    const hook = afterTimer;
    afterTimer = undefined;
    const timer = nativeSetTimeout(() => {
      timers.delete(timer);
      callback(...args);
      // Stop after the delay's own continuation, before its caller publishes.
      if (hook) queueMicrotask(hook);
    }, ms);
    timers.add(timer);
    peakTimers = Math.max(peakTimers, timers.size);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    timers.delete(timer);
    nativeClearTimeout(timer);
  };

  const user = (text) => ({ role: "user", content: [{ type: "text", text }] });
  const observe = (pending) => pending.then(value => ({ value }), error => ({ error }));
  function start(messages = [user(SUGGESTED_PROMPT)]) {
    assert.ok(sessions.length < 4, "at most four retained test sessions");
    const controller = new AbortController();
    const session = { controller, run: adapter.run({ messages, abortSignal: controller.signal }) };
    sessions.push(session);
    return session;
  }
  function released(session) {
    assert.equal(getEventListeners(session.controller.signal, "abort").length, 0, "abort listeners released");
  }
  async function advance(session, count) {
    const frames = [];
    for (let i = 0; i < count; i++) {
      const result = await session.run.next();
      assert.equal(result.done, false, "requested partial frame exists");
      assert.ok(result.value.content.length <= 5, "text plus at most four fixed tools");
      frames.push(result.value);
    }
    return frames;
  }
  async function complete(session, frames = []) {
    for (let i = frames.length; i <= 10; i++) {
      const result = await session.run.next();
      if (result.done) {
        assert.equal(frames.length, 10, "original ten-frame response");
        const content = frames.at(-1).content;
        assert.match(content[0].text, /^Done\./);
        assert.deepEqual(content.slice(1).map(part => part.toolName), [
          "collect_context", "search_synthesize", "apply_model_delta", "write_memo",
        ]);
        assert.ok(content.slice(1).every(part => part.result !== undefined));
        released(session);
        return frames;
      }
      assert.ok(result.value.content.length <= 5, "bounded frame content");
      frames.push(result.value);
    }
    assert.fail("response exceeded ten-frame budget");
  }
  async function stopped(session, pending) {
    const result = await pending;
    assert.equal(result.error?.name, "AbortError", "Stop must reject, never emit another frame or false Done");
    assert.equal(result.error, session.controller.signal.reason, "preserve SDK cancellation reason");
    assert.equal(result.value, undefined);
    assert.equal((await session.run.next()).done, true, "parent generator terminated");
    released(session);
    cancellations += 1;
  }
  async function scenario(name, check) {
    const started = performance.now();
    try {
      await check();
      assert.equal(timers.size, 0, "no remaining adapter timers");
      for (const session of sessions) released(session);
      runtime.passed += 1;
      runtime.scenarios.push({ name, ok: true, durationMs: Math.round(performance.now() - started) });
    } catch (error) {
      const detail = String(error).slice(0, 500);
      runtime.failed += 1;
      runtime.scenarios.push({ name, ok: false, detail, durationMs: Math.round(performance.now() - started) });
      issues.push(`${name}: ${detail}`);
    } finally {
      afterTimer = undefined;
      for (const session of sessions) {
        session.controller.abort();
        await session.run.return();
      }
      sessions.length = 0;
      for (const timer of timers) nativeClearTimeout(timer);
      timers.clear();
    }
  }

  try {
    for (const reduced of [false, true]) {
      Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: reduced }) } });
      const mode = reduced ? "reduced motion" : "ordinary timing";
      await scenario(`${mode}: developer lets all four scripted tools finish`, async () => {
        const frames = await complete(start());
        // Captured from the original adapter; scores are scripted fixtures, not model quality.
        assert.equal(createHash("sha256").update(JSON.stringify(frames)).digest("hex"),
          "2d22c784ff41af97ab77cc35bd29e9dfa55bc1eb7736864489d6800061d3acdb",
          "all original content and frame order preserved");
      });
      await scenario(`${mode}: developer stops before the first frame`, async () => {
        const session = start();
        session.controller.abort();
        await stopped(session, observe(session.run.next()));
      });
      for (let boundary = 1; boundary <= 9; boundary++) {
        for (const timing of ["pending delay", "paused yield", "resolved-delay microtask"]) {
          await scenario(`${mode}: Stop at frame ${boundary}, ${timing}`, async () => {
            const session = start();
            const frames = await advance(session, boundary);
            const retained = structuredClone(frames);
            let pending;
            if (timing === "paused yield") {
              session.controller.abort();
              pending = observe(session.run.next());
            } else if (timing === "resolved-delay microtask") {
              const reason = Object.assign(new Error("Developer stopped this response"), { name: "AbortError" });
              afterTimer = () => session.controller.abort(reason);
              pending = observe(session.run.next());
            } else {
              pending = observe(session.run.next());
              assert.equal(timers.size, 1, "Stop arrives while a real timer is pending");
              session.controller.abort();
              const remainingTimers = timers.size;
              const remainingListeners = getEventListeners(session.controller.signal, "abort").length;
              await stopped(session, pending);
              assert.equal(remainingTimers, 0, "abort clears timer synchronously");
              assert.equal(remainingListeners, 0, "abort removes listener synchronously");
            }
            if (timing !== "pending delay") await stopped(session, pending);
            assert.deepEqual(frames, retained, "completed partial content is retained");
          });
        }
      }
      await scenario(`${mode}: developer retries without losing an earlier answer`, async () => {
        const earlier = await complete(start());
        const question = `${SUGGESTED_PROMPT} Please recheck.`;
        const history = [user(SUGGESTED_PROMPT), { role: "assistant", content: earlier.at(-1).content }, user(question)];
        const retained = structuredClone(history);
        const session = start(history);
        await advance(session, 3);
        const pending = observe(session.run.next());
        session.controller.abort();
        await stopped(session, pending);
        const retried = await complete(start(history));
        assert.equal(retried.at(-1).content[1].args.focus, question);
        assert.deepEqual(retried.at(-1).content.map(part => part.result), earlier.at(-1).content.map(part => part.result));
        assert.deepEqual(history, retained);
      });
      await scenario(`${mode}: stopping one developer leaves the other run isolated`, async () => {
        const cancelled = start([user("Cancel this request")]);
        const continuing = start([user("Keep this request")]);
        await advance(cancelled, 1);
        const frames = await advance(continuing, 1);
        const pending = observe(cancelled.run.next());
        const active = continuing.run.next();
        cancelled.controller.abort();
        await stopped(cancelled, pending);
        frames.push((await active).value);
        const finished = await complete(continuing, frames);
        assert.equal(finished.at(-1).content[1].args.focus, "Keep this request");
        assert.equal(finished.at(-1).content[2].args.query, "Keep this request");
      });
      await scenario(`${mode}: four developers stop together`, async () => {
        const burst = Array.from({ length: 4 }, () => start());
        for (const session of burst) await advance(session, 1);
        const pending = burst.map(session => observe(session.run.next()));
        assert.equal(timers.size, 4);
        burst.forEach(session => session.controller.abort());
        const remaining = timers.size;
        for (let i = 0; i < burst.length; i++) await stopped(burst[i], pending[i]);
        assert.equal(remaining, 0, "burst releases all timers immediately");
      });
    }
    await scenario("long session: 128 stops across all stages with periodic explicit retries", async () => {
      for (let i = 0; i < 128; i++) {
        const session = start();
        await advance(session, i % 9 + 1);
        const pending = observe(session.run.next());
        session.controller.abort();
        await stopped(session, pending);
        assert.equal(timers.size, 0, `no resources accumulated at stop ${i + 1}`);
        sessions.length = 0;
        if (i % 16 === 15) {
          await complete(start());
          assert.equal(timers.size, 0);
          sessions.length = 0;
        }
      }
    });
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    Object.assign(runtime, { cancellations, peakTimers, remainingTimers: timers.size });
  }
}

function writeJson(path, value) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
