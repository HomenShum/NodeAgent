# Simplification report — human-readiness pass

Baseline commit `19b38d7`, Windows 11, Node v22.22.2, npm 10.x. Every row below
was produced by running the command in that row, on this machine, before and
after. Where a tool could not see what changed, that is stated rather than
rounded off.

No dependency was added, removed, or upgraded. `package-lock.json` is untouched.

## Measurements

| Measure | Before | After | Change | Evidence command |
|---|---:|---:|---:|---|
| Production files (`src` `bin` `convex` `demo` `scripts`, `.ts/.tsx/.mjs`) | 37 | 36 | −1 (3 deleted, 2 tour-tooling scripts added) | `find src bin convex demo scripts -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' \) \| wc -l` |
| Production source lines (same set) | 6249 | 5844 | −405 (−560 deleted, +155 tour tooling) | `find src bin convex demo scripts -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' \) -exec cat {} + \| wc -l` |
| `src/` files | 21 | 19 | −2 | `find src -type f \| wc -l` |
| `src/` lines | 3375 | 3109 | −266 | `find src -type f -exec cat {} + \| wc -l` |
| `scripts/nodeagent-cli.ts` lines | 597 | 370 | −227 | `wc -l < scripts/nodeagent-cli.ts` |
| Direct dependencies (prod) | 11 | 11 | 0 | `node -e "console.log(Object.keys(require('./package.json').dependencies).length)"` |
| Direct dependencies (dev) | 11 | 11 | 0 | `node -e "console.log(Object.keys(require('./package.json').devDependencies).length)"` |
| npm scripts | 35 | 36 | +1 (−`demo:node`, +`tours:validate`, +`tours:build`) | `node -e "console.log(Object.keys(require('./package.json').scripts).length)"` |
| Knip — unused files | 18 | 16 | −2 | `npx knip@5 --no-exit-code` *(no config, both ends)* |
| Knip — unused exports | 36 | 18 | −18 | `npx knip@5 --no-exit-code` *(no config, both ends)* |
| Knip — unused exported types | 13 | 12 | −1 | `npx knip@5 --no-exit-code` *(no config, both ends)* |
| Knip — unused files, **repo modelled** | — | 0 | — | `npx knip@5 --no-exit-code` *(with the new `knip.json`)* |
| Knip — unused/unlisted dependencies, **repo modelled** | — | 0 | — | same |
| Knip — unused exports, **repo modelled** | — | 4 | — | same |
| Knip — unused exported types, **repo modelled** | — | 10 | — | same |
| jscpd — clones found | 24 | 24 | 0 | `npx jscpd@4 src scripts e2e demo tests bin --reporters console` |
| jscpd — duplicated lines | 290 (3.85%) | 287 (4.11%) | −3 lines, **+0.26 pp** | same |
| dependency-cruiser — circular dependencies | 0 | 0 | 0 | `npx dependency-cruiser@16 --no-config --output-type json src bin demo scripts e2e tests convex` |
| dependency-cruiser — modules cruised | 62 | 61 | −1 | same |
| Tests | 41 passed / 7 files | 41 passed / 7 files | 0 | `npm test` |
| Typecheck | pass | pass | 0 | `npm run typecheck` |
| Build | pass | pass | 0 | `npm run build` |
| Bundle — JS | 655.19 kB (gzip 186.72) | 655.19 kB (gzip 186.72) | 0 | `npm run build` |
| Bundle — CSS | 7.83 kB (gzip 2.36) | 7.83 kB (gzip 2.36) | 0 | `npm run build` |
| **`npm run check` (the repo's own gate)** | **FAILS at stage 8 of 15** | **all 15 stages run; fails only on a pre-existing `npm audit` advisory** | fixed | `npm run check` |
| Browser check @1440x900 | pass | pass — 4 tool cards, memo in 2637 ms, rail 12/26, no overflow | 0 | `node e2e/capture-journey-at-width.mjs --port 4503 --width 1440 --height 900 --label wave3-1440` |
| Browser check @375x812 (the D1 guard) | pass | pass — 4 tool cards, memo in 2544 ms, rail 12/26, graph 323px, no overflow | 0 | `node e2e/capture-journey-at-width.mjs --port 4503 --width 375 --height 812 --label wave3-375` |
| Diff size | — | — | 48 files, +2063 / −766 (documentation is most of the additions) | `git diff --cached --shortstat` |

### Three numbers that need their caveat stated

**jscpd got very slightly worse, and it is right to.** The biggest duplication in
this repo was ~180 lines shared between `bin/nodeagent.mjs` and
`scripts/nodeagent-cli.ts`. jscpd never reported it, because it buckets by
format and compares within a bucket: the `.mjs` copy is `javascript`, the `.ts`
copy is `typescript`. Removing that duplication therefore cannot move jscpd's
number. What moved instead is the denominator — total lines fell, so the same
287 duplicated lines are now a larger share. The remaining clones are argument
parsing and receipt-writing boilerplate shared by the two scaffold smoke
scripts; see *Left unresolved*.

**Knip's before/after is reported twice on purpose.** The baseline ran with no
configuration, so the honest comparison is the no-config row. But no-config knip
was also *wrong* about this repo: it called 9 scaffold-template files "unused"
when they are copied verbatim into a generated app, and it could not see that
`omniagent` is spawned as a binary rather than imported. `knip.json` now
describes the repo — three workspaces, real entry points — which is why the
modelled rows show 0 unused files and 0 unused dependencies. That is modelling,
not suppression: every ignore is named below with its reason.

**The bundle did not change, and should not have.** Everything deleted was
either not imported by the browser app (the tool registry) or not part of the
app at all (a CLI, a standalone demo script).

---

## What was deleted

### 1. `demo/runNodeAgentDemo.mjs` — a second agent loop that could not fail

**81 lines.** This was a hand-written copy of the whole pipeline — stop-word
list, stemmer, token-overlap grounding, ranking weights, confidence gate, and
the runway recompute — so the demo could run without `npm install`. It imported
nothing from `src/`.

Two of its four TRACE lines and its final status were printed string literals:

```js
console.log("\nTRACE\n  ✓ gather   3 context items · 2 active");   // literal
console.log("  ✓ memo     5 blocks");                              // literal
console.log(`\n${bar}\noverall status: OK\n${bar}\n`);             // literal
```

**Proof it was a defect, not a preference.** Setting `GROUNDING_THRESHOLD` in
`src/features/search/searchAndSynthesize.ts` from `0.34` to `0.99` breaks the
real loop. Measured, both commands, same tree:

| Command | Trace line | Final status |
|---|---|---|
| `npx tsx demo/runNodeAgentDemo.ts` (real modules) | `✗ search  Insufficient grounded sources — declining to synthesize` | `overall status: ERROR` |
| `node demo/runNodeAgentDemo.mjs` (the mirror) | `✓ search  3 grounded · confidence high` | `overall status: OK` |

`promotion/PROMOTION_LOG.md` and `promotion/PRODUCT_GOAL.md` condition 11 both
cited `node demo/runNodeAgentDemo.mjs` → `"overall status: OK"`, exit 0 as
evidence the loop worked. That command prints `OK` unconditionally; it was not
evidence of anything.

**What replaced it: nothing new.** `tests/nodeAgentRuntime.test.ts` already
asserted every fact the mirror pretended to demonstrate — status `ok`, winner
`src_bench`, runway `18`, a claim block, determinism. Under the same mutation
that the mirror shrugged off, `npx vitest run tests/nodeAgentRuntime.test.ts`
exits **1** with 3 failures. The proof already existed in a place that can go
red.

Cost: `npm run demo` now requires `npm install`. That is the correct price for a
demo that reports what actually happened.

### 2. `src/features/node-agent/tools/nodeAgentTools.ts` + `src/mcp/toolRegistry.ts` — an unwired tool surface

**243 lines, and one whole vocabulary a reader had to learn.** Six typed tool
wrappers and a progressive-discovery registry with `discoverTools()`,
`workflowChain()`, and `nextTools` hints.

Nothing imported either file. No test, no script, no CLI, no server, no MCP
entry point — verified by grep across the repo. They were, however, documented
as the real thing in four places: `README.md`, `docs/ARCHITECTURE.md`,
`NODE-LOOPS.md` (three references), and `docs/MIGRATION_MAP.md`.

That is the specific trap this pass exists to remove. A new engineer asking
"where are tools registered?" was sent to 243 lines of dead code, while the
mechanism that actually runs — four name strings bound by
`makeAssistantToolUI` in `components/toolUIs.tsx` and emitted by
`runtime/nodeAgentChatAdapter.ts` — went undocumented. All four documents now
point at the live path (`docs/START_HERE.md` Step 6).

The `NodeAgentTool` type survives: `runtime/durableRuntime.ts` uses it for the
`ToolRuntime` port, which is how an embedding app supplies real tools.
`ToolRegistryEntry`, used only by the deleted registry, is gone.

### 3. The duplicate scaffold implementation in `scripts/nodeagent-cli.ts`

**227 lines.** The repo had two implementations of `nodeagent apps scaffold`:
`bin/nodeagent.mjs` (the published entry) and `scripts/nodeagent-cli.ts` (the
dev CLI). Each carried its own copy of the template table, `copyDir`,
`runAppSetupAutomation`, `runAppCommandPhase`, `writeJson`, `npmCommand`,
`formatMs`, and `formatPath` — and **each was proven by a different smoke test**,
so both stayed alive and neither was ever compared to the other.

`bin/nodeagent.mjs` is now the single implementation. `scripts/nodeagent-cli.ts`
keeps the `apps` command as a ~15-line forwarder, so
`npm run nodeagent -- apps scaffold …` still works exactly as before.

### 4. Two notebook functions with no callers

`insertHeading` and `insertEntity` in `src/features/notebook/notebookEditor.ts`
— exported, documented as part of the notebook API, called by nothing and
covered by no test. Deleted. The block types they created (`heading`, `entity`)
remain in the type union and are still rendered by `toMarkdown`, because
`createNotebook` emits a heading block itself.

### 5. Eighteen unnecessary public exports

Symbols exported from a module but used only inside it: `MAX_ITEMS`,
`PRESENCE_TTL_MS`, `relevanceOf`, `MAX_BLOCKS`, `MAX_SOURCES`,
`GROUNDING_THRESHOLD`, `extractiveSynthesizer`, `MAX_CELLS`, `recompute`,
`MAX_LOG`, `isTerminalJobStatus`, `DEMO_SOURCES`, and the four tool-UI
components in `components/toolUIs.tsx`. The code still runs; the API a reader
must consider shrank. `toolUIs.tsx` now exports one thing —
`NodeAgentToolUIs` — instead of five.

---

## Custom code replaced by an existing capability

| Custom code | Replaced by | Why it is better |
|---|---|---|
| `demo/runNodeAgentDemo.mjs` — a re-implementation of grounding, ranking and recompute, asserted by eye | `tests/nodeAgentRuntime.test.ts` under **vitest**, already installed and already asserting the same numbers | The replacement fails when the product breaks; the original could not |
| Second `apps scaffold` implementation in `scripts/nodeagent-cli.ts` | `bin/nodeagent.mjs`, already the published `bin` and already exercised by the chat-ui smoke | One implementation to keep correct instead of two that could disagree silently |
| `src/mcp/toolRegistry.ts` — bespoke tool discovery and workflow chaining | **assistant-ui**'s `makeAssistantToolUI`, already a direct dependency and already the mechanism the app uses | The dependency was already paying for tool registration; the custom registry duplicated the concept without being wired to anything |
| `nodeagent:happy-path:smoke` inside `prepush` | The same six smokes, which `prepush` already runs individually a few steps earlier | Removes a redundant second execution — see below |

---

## A pre-existing defect found and fixed: `npm run check` never passed

This was not on the defect ledger, because no earlier wave ran the repo's own
gate end to end. The baseline ran `npm test`, `npm run build`, `npm run doctor`,
the demo, and the browser capture individually — never `npm run check`.

**Measured on the pristine tree** (`git stash` of all work, same machine):
`npm run check` exits **1** at stage 8 of 15 — `nodeagent:happy-path:smoke`. `nodeagent:local-dashboard:smoke`
passes when run directly, then fails a few seconds later when `happy-path`
re-runs it, reporting all ten scaffolded files missing.

**Root cause.** The local-dashboard smoke reached the scaffolder through
`npm run nodeagent -- apps scaffold local-dashboard --dir <tempdir> --force`.
When that smoke is itself re-run *inside* `happy-path` *inside* `prepush`, the
`--dir <tempdir>` argument does not survive the extra `npm run … --` layers; the
scaffolder writes to its default location, exits **0**, and the smoke finds an
empty temp directory. The chat-ui smoke never hit this because it spawns
`node bin/nodeagent.mjs` directly, with no `npm run --` layer at all.

**Fix — one less process, not one more guard.** The local-dashboard smoke now
spawns `bin/nodeagent.mjs` directly, exactly as the chat-ui smoke does. This is
the same change the deduplication wanted: both smokes now drive the one scaffold
implementation the same way.

**Second cause, same shape.** With that fixed, `check` advanced to
`nodeagent:chat-ui:smoke`, which failed the same way — it runs `npm install`
inside a generated app, three `npm run` levels deep. The structural problem is
that `prepush` runs all six smokes and then runs `happy-path`, which runs the
same six smokes again. `nodeagent:happy-path:smoke` was removed from the
`prepush` chain.

**This is a moved check, not a weakened one.** `happy-path` runs exactly
`init`, `nodeagent:frame:smoke`, `nodeagent:durable:smoke`,
`nodeagent:sqlite:smoke`, `nodeagent:local-dashboard:smoke`,
`nodeagent:chat-ui:smoke`, `examples:guidance:smoke`
(`scripts/nodeagent-cli.ts`, `runHappyPathSpeed`). Every one of those is already
run directly by `prepush` *before* `happy-path` was reached. No coverage is lost
— only the duplicate execution and its timing receipt. The timing receipt is
still produced on demand by `npm run proof`, which is what `nodekit.yaml`
declares as this repo's proof command, and which passes: 7 phases, 65.50 s.

**Result.** `npm run check` now runs all fifteen stages. Every smoke, the
typecheck, all 41 tests and the build pass. It still exits 1, on the last stage
only:

```
npm audit --omit=dev
nanoid  4.0.0 - 5.1.15   Severity: high
via @assistant-ui/core, @assistant-ui/react, assistant-stream
1 high severity vulnerability
```

That advisory is in a transitive dependency of `@assistant-ui/react` and is
untouched by this pass — no dependency or lockfile entry was modified. Fixing it
means upgrading a dependency, which is not structural work and is left for a
maintainer to decide deliberately.

**Since resolved.** A later pass pinned the patched `nanoid` in `overrides`;
`npm run check` now exits 0 with `found 0 vulnerabilities`. See the note under
"Left unresolved" below.

---

## Two checks were re-pointed. Both are stated here so they can be audited.

Neither loosens an assertion. Both move an assertion off a file that no longer
implements the behaviour and onto the file that does — the failure mode being
avoided is a check that stays green while the real code rots.

| Check | Was | Now | Why |
|---|---|---|---|
| `validateCliContract` in `scripts/nodeagent-local-dashboard-scaffold-smoke.ts` | asserts `--auto`, `--install`, `--run-demo`, `--verify`, `setup-receipt.json` appear in `scripts/nodeagent-cli.ts` | asserts the **same five strings** in `bin/nodeagent.mjs`, **plus a new assertion** that `scripts/nodeagent-cli.ts` still forwards to it | The flags are implemented in `bin/nodeagent.mjs`. Checking the forwarder would pass while the real flags disappeared. Net: one more assertion than before. |
| `validateCliContract` in `scripts/nodeagent-chat-ui-scaffold-smoke.ts` | asserts `chat-ui`, `examples/apps/chat-ui/template`, `nodeagent-chat-ui`, `assistant-ui chat scaffold` appear in `scripts/nodeagent-cli.ts` | asserts the **same four strings** in `bin/nodeagent.mjs` | Same reason — the template table lives in `bin/nodeagent.mjs`. |

No test was deleted, skipped, or had an expected value edited. Test count is 41
before and after.

---

## Left unresolved, with reasons

1. ~~**`npm audit` reports 1 high-severity advisory**~~ (`nanoid`, transitive
   via `@assistant-ui/react`). **Resolved after this pass** by adding
   `"nanoid@^5.0.0": "5.1.16"` to the existing `overrides` block — the version
   range `@assistant-ui` already asks for, so no dependency was upgraded across
   a major. `npm run check` now exits 0 on all fifteen stages.

2. **jscpd still reports 24 clones / 287 duplicated lines.** The bulk is
   argument-parsing and receipt-writing boilerplate shared by
   `scripts/nodeagent-chat-ui-scaffold-smoke.ts` and
   `scripts/nodeagent-local-dashboard-scaffold-smoke.ts` (`parseArgs`,
   `writeJson`, the `SmokeReport` shape). Extracting a shared helper would trade
   ~90 duplicated lines for a new module imported by two dev scripts — a wash in
   concepts, so it was left. It is genuinely low-value compression, which is
   where the stop rule says to stop.

3. **Knip's 10 unused exported types are kept.** `DurableFrameRunInput`,
   `DurableFrameRunOutcome`, `CommitOutcome`, `CreateModelInput`,
   `CollectOptions`, `DeltaOpKind`, the three `Omnigent*` types, and
   `DurableFrameRunStatus` all appear in the signatures of exported functions.
   Un-exporting them would make those functions harder to call from an embedding
   app, which is the opposite of the goal.

4. **Knip's 4 unused exports are in a scaffold template**
   (`examples/apps/chat-ui/template/src/nodeagent-chat/toolUIs.jsx`). A template
   is code someone copies and edits; exporting the individual tool cards is how
   they customise one. Left deliberately.

5. **`vendor/nodegraph-live/**` is excluded from knip.** It is a vendored
   third-party build (with its own `.d.ts` and `.js.map` files); its unused
   exports are that library's public API, not this repo's debt. Consequence:
   `sigma`, `@sigma/node-border`, `graphology` and
   `graphology-layout-forceatlas2` are imported only from inside `vendor/`, so
   they are listed in `ignoreDependencies` — they are real runtime dependencies
   of the bundled graph renderer, not dead weight.

6. **`omniagent` is in `ignoreDependencies`.** It is invoked as a binary by
   `scripts/omnigent-nodeagent-smoke.ts:110`, never imported, so knip cannot see
   the use. Verified by reading the spawn site.

7. **Two commands are both called `doctor` and check different things.**
   `npm run doctor` (via `scripts/nodeagent-cli.ts`) checks nine repo paths;
   `nodeagent doctor` (via `bin/nodeagent.mjs`) checks four packaged template
   files. Both are legitimate — one is for a contributor, one for a consumer of
   the published package — but the shared name is confusing. Renaming touches
   the published CLI surface, so it is recorded in
   `docs/codebase/CONCERNS.md` rather than changed here.

8. **The product defects D2 and D3 remain open** (graph label overlap; no stop /
   cancel / retry affordance, and no designed error state). Those are product
   work and belong to the promotion loop, not to a structural pass. They are
   described for a newcomer in `docs/START_HERE.md` Step 8 so nobody has to
   discover them by surprise.

9. *(resolved — the browser check was re-run; see the table row above.)*
