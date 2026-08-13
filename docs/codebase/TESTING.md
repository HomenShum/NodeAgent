# Testing

What proves what, and how to make each thing fail on purpose — because a check
you have never seen go red is not yet evidence.

## The commands

| Command | What it proves | Time |
|---|---|---|
| `npm test` | 41 unit tests over the four domain modules and the loop | ~3 s |
| `npm run typecheck` | `tsc --noEmit`, strict, `noUnusedLocals` | ~5 s |
| `npm run build` | typecheck + a real Vite production build | ~15 s |
| `npm run demo` | the loop end to end, printed | ~2 s |
| `npm run e2e:journey` | the real app in a real browser at 1440x900 | ~30 s |
| `npm run e2e:journey:mobile` | the same at 375x812 — the D1 guard | ~30 s |
| `npm run proof` | the timed no-cloud path (`happy-path`), 7 phases | ~65 s |
| `npm run check` | everything: secret scan, 6 smokes, typecheck, tests, build, `npm audit` | ~3 min |

## The unit tests (`tests/`, 7 files, 41 tests)

| File | Covers |
|---|---|
| `nodeAgentRuntime.test.ts` | the whole loop over the canonical scenario, plus honest degradation |
| `searchSynthesize.test.ts` | grounding, ranking, the refusal gate, `isSafeFetchUrl` |
| `spreadsheetDelta.test.ts` | apply, recompute dependents, version conflict |
| `durableRuntime.test.ts` | leases, the write-once journal, receipt replay |
| `sqliteDurableRuntime.test.ts` | the same contracts against real SQLite |
| `reasoningFrameRunner.test.ts` | the verifier receipt |
| `omnigentAdapter.test.ts` | profile/spec analysis |

They are scenario-shaped, not assertion-shaped — `spreadsheetDelta.test.ts`
opens with "Analyst correcting an assumption (happy path + recompute)".

## Make it fail, so you know it works

The loop's central claims live in `tests/nodeAgentRuntime.test.ts`. To confirm
they are real, break the product and watch them go red:

```bash
# src/features/search/searchAndSynthesize.ts:34
# GROUNDING_THRESHOLD = 0.34  ->  0.99
npx vitest run tests/nodeAgentRuntime.test.ts     # exits 1, 3 tests fail
npm run demo                                      # prints "overall status: ERROR"
```

Put it back. This exact mutation is why the old zero-dependency demo mirror was
deleted: it printed `overall status: OK` under this mutation because two of its
trace lines and its final status were string literals, and it imported nothing
from `src/`. See `docs/SIMPLIFICATION_REPORT.md`.

For the browser gate, the equivalent is to re-hide the graph rail on narrow
screens (`src/app/styles.css`, the `@media (max-width: 960px)` block at line
181). `e2e/capture-journey-at-width.mjs` asserts the graph canvas is not
zero-width — the *cause* of defect D1, not its symptom — so any mechanism that
re-hides the rail turns the gate red.

## The browser checks (`e2e/`)

`capture-journey-at-width.mjs` starts the real Vite server, drives the real
composer, waits for the memo, and records: tool-card count, memo title, rail
entity/edge counts, graph canvas width, `documentElement.scrollWidth` vs
`clientWidth`, elapsed loop milliseconds, and three separate error buckets —
`pageErrors`, `consoleErrors`, `failedRequests` — with third-party failures kept
apart in `thirdPartyFailures`.

Outputs land in `promotion/evidence/` as a PNG plus an observations JSON. Both
the evidence and the script that regenerates it are committed, which is the
repo's standard: a claim about the rendered app must come with the producer that
reproduces it.

```bash
node e2e/capture-journey-at-width.mjs --port 4503 --width 1440 --height 900 --label my-check
node e2e/capture-journey-at-width.mjs --port 4503 --width 375 --height 812 --label my-check-mobile
```

Pick a free `--port`; the default is 4306.

## The smokes (`scripts/*-smoke.ts`)

Each proves one integration and writes a receipt to `docs/eval/`: `frame`,
`durable`, `sqlite`, `convex` (skips cleanly when unconfigured),
`local-dashboard` and `chat-ui` (each scaffolds a template into a temp dir and
validates the generated app), `live-provider` (skips without a key),
`omnigent`, and `examples:guidance`.

Both scaffold smokes drive `bin/nodeagent.mjs` **directly**, with no
`npm run … --` layer in between. That is deliberate: routing one of them through
`npm run nodeagent -- apps scaffold … --dir <tmp>` used to drop the `--dir`
argument when the smoke was re-run inside `happy-path` inside `prepush`, and
`npm run check` failed from a clean checkout. Keep new smokes on the direct call.

## Known state of the gate

`npm run check` runs all fourteen stages. Every smoke, the typecheck, all 41
tests and the build pass. It exits **1** on the final stage only:
`npm audit --omit=dev` reports one high-severity advisory in `nanoid`, a
transitive dependency of `@assistant-ui/react`. That is a dependency upgrade
decision, not a code defect. Expect that exit code until someone bumps it.

## What is not tested

- **No component tests.** `vitest.config.ts` uses the `node` environment; there
  is no jsdom and no React Testing Library. UI behaviour is covered only by the
  Playwright captures.
- **No accessibility audit.** No axe, no Lighthouse, no contrast check. Keyboard
  navigation has been driven manually at 1440 and recorded in
  `promotion/evidence/desktop-1440-keyboard-run.png`; it has not been driven at
  narrow widths.
- **No test for the absent error state**, because there is no error state — see
  D3 in `promotion/PROMOTION_LOG.md` and `docs/codebase/CONCERNS.md`.
