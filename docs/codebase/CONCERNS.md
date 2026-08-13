# Concerns

Known problems, ranked by what they cost a user or a new engineer. Each one has
a reproduction or a file reference. Nothing here is a hunch.

Product defects live in `promotion/PROMOTION_LOG.md` with full reproductions;
this page is the engineering view and includes things that ledger does not
track.

## P1 — a user can get stuck, and cannot be told why

### 1. No error state anywhere in the UI

`runtime/nodeAgentChatAdapter.ts` has no `try`/`catch`, and no component in the
tree is a React error boundary. A throw inside any rendered child unmounts the
whole app to a blank page with no message and no way back except reload.

This is not theoretical: it is exactly how defect D1 presented — two
`Sigma: Container has no width.` errors took the entire app down, and React said
so in the console ("Consider adding an error boundary to your tree"). D1's cause
was fixed; the missing boundary was not.

Where a fix goes: a boundary in `components/NodeAgentDemoApp.tsx` and a `catch`
in the adapter's generator that yields a failed-state message. Scored as
condition 5 FAIL in `promotion/PRODUCT_GOAL.md`.

### 2. No stop, cancel, or retry (defect D3)

Reproduction: at 1440x900 send a question, wait until
`.na-tool[data-running="true"]` appears, then enumerate every `<button>` on the
page. There is exactly one — `Send` — and it is disabled. A user whose run
misbehaves can only reload, discarding the thread.

The adapter *does* receive an `abortSignal` and checks it between steps
(`nodeAgentChatAdapter.ts:98`), so the runtime half already exists; what is
missing is a control wired to it. Scored as condition 2 FAIL.

### 3. "New Thread" is a single-thread runtime

`useLocalRuntime` holds one thread. Any thread-list affordance is a no-op. Do
not add one without changing the runtime underneath it.

## P2 — correctness and maintenance traps

### 4. The tool-name lists can silently disagree

A tool renders only if the `toolName` in `components/toolUIs.tsx` exactly matches
the name the adapter emits in `runtime/nodeAgentChatAdapter.ts`. A typo produces
**no error** — the card simply does not appear, and the run still reports `ok`.
Two files must agree, with nothing enforcing it. Adding a fifth step is where
this will bite.

### 5. A transitive dependency is pinned by hand

`npm audit --omit=dev` used to report a high-severity advisory in `nanoid`
(GHSA-28wg-ghj8-5hjv, transitive via `@assistant-ui/react`), and it was the one
stage that failed `npm run check` from a clean checkout. `package.json` now
carries `"nanoid@^5.0.0": "5.1.16"` in `overrides`, next to the existing
`esbuild` and `ws` pins: the patched version is semver-compatible with what
`@assistant-ui` asks for, and the range key leaves `postcss`'s CommonJS
`nanoid@3` alone (forcing ESM 5.x on it would break the Vite build).

Plain `npm audit`, without `--omit=dev`, still reports 8 advisories including
that same `nanoid` one — it also covers `<3.3.16`, and `vite → postcss` pulls
`nanoid@3.3.12`. Every one of those is dev-only and none reaches the shipped
bundle, which is why the gate scopes itself to production dependencies.

The pin is the concern. It is our number, not the upstream's, so when
`@assistant-ui` bumps its own `nanoid` this override can silently hold the tree
back. Delete it, run `npm install && npm audit --omit=dev`, and if that is clean
the pin has done its job and should go.

### 6. Two different commands are both called `doctor`

`npm run doctor` (→ `scripts/nodeagent-cli.ts`) checks nine repo paths.
`nodeagent doctor` (→ `bin/nodeagent.mjs`) checks four packaged template files.
Both are legitimate — one serves a contributor, one a consumer of the published
package — but sharing a name means the answer to "did doctor pass?" depends on
which one you ran. Renaming touches the published CLI surface, so it was
recorded rather than changed.

### 7. Nested `npm run` drops arguments

Reaching a script through `npm run x -- --flag value` inside another `npm run`
inside a third is not reliable on Windows: the `--dir <path>` argument was
silently lost and the scaffolder exited **0** having written nothing. This cost
the repo a permanently failing `npm run check` that nobody noticed, because
`check` had never been run end to end. Both scaffold smokes now spawn
`bin/nodeagent.mjs` directly. **Do not add a new smoke that reaches a tool
through a nested `npm run … --`.**

### 8. Fonts are fetched from a third party at runtime

`index.html:11` loads Manrope and JetBrains Mono from `fonts.googleapis.com`.
On a restricted network the woff2 intermittently 404s (2 of 5 runs during the
promotion baseline) and the page falls back to `system-ui`. Self-hosting the two
fonts removes the app's only unconditional outbound request.

### 9. Graph labels overlap (defect D2, minor)

At 1440x900 after a run, node labels draw on top of each other ("NodeAgent",
"acme-dd", "Cash-runway sensitivity" collide) and the right-most label clips at
the canvas edge. Evidence: `promotion/evidence/desktop-1440-run.png`. A reader
cannot tell which node is which without dragging.

## P3 — accepted, with reasons

### 10. `runNodeAgent` is synchronous; streaming is simulated

All four steps complete before the first card renders. The adapter paces them
out with `await tick(360)`. Consequences: the abort signal only takes effect
between steps, and per-step latency is not real. This is a deliberate demo
simplification, but it is invisible from the UI, so it is written down here and
in `docs/START_HERE.md` Step 6.

### 11. The bundle is 655 kB (186 kB gzipped) in one chunk

Vite warns on every build. The bulk is the WebGL graph renderer and its
`graphology`/`sigma` dependencies. Code-splitting the rail behind a dynamic
import is the obvious move; it was not done because it changes load behaviour
and belongs with a measurement, not with a structural pass.

### 12. Duplicate boilerplate across the two scaffold smokes

jscpd reports 24 clones / 287 duplicated lines, mostly `parseArgs`, `writeJson`
and the report shape shared by `nodeagent-chat-ui-scaffold-smoke.ts` and
`nodeagent-local-dashboard-scaffold-smoke.ts`. Extracting a helper trades ~90
duplicated lines for a new shared module imported by two dev scripts — roughly
neutral in concepts, so it was left.

### 13. jscpd cannot see cross-language duplication

It buckets by format, so a `.mjs` file is never compared against a `.ts` one.
The largest duplication this repo ever had — ~180 lines shared between
`bin/nodeagent.mjs` and `scripts/nodeagent-cli.ts` — was invisible to it. Do not
read a low jscpd score as an absence of duplication here.

### 14. No accessibility audit has ever been run

No axe, no Lighthouse, no contrast check, no screen-reader pass. Keyboard
navigation was driven manually at 1440 only. Conditions 6, 7 and 8 in
`promotion/PRODUCT_GOAL.md` are **UNVERIFIED**, which is not the same as passing.

### 15. `convex/` and four adapter blueprints are aspirational

`convex/schema.ts` is never connected by the demo. The `aws-dynamodb`,
`postgres` and `cloudflare` adapter directories contain READMEs and schemas
only — no running code. `scripts/nodeagent-cli.ts` marks each as `runnable` or
`blueprint`; trust that list.
