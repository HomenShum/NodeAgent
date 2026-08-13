# Conventions

Patterns this codebase actually follows, stated so you can match them rather
than infer them.

## Purity and injected time

Domain modules take `now` as a parameter and default it:

```ts
// src/features/notebook/notebookEditor.ts
export function appendParagraph(doc: NotebookDoc, text: string, now: number = Date.now()): NotebookDoc
```

Every call inside the loop passes an explicit `now`. This is why
`buildDemoScenario()` with a fixed `DEMO_NOW` produces byte-identical output and
why `tests/nodeAgentRuntime.test.ts` can compare rendered markdown directly.
**Never call `Date.now()` inside a domain function body.**

## Results, not exceptions

Anything that can legitimately fail returns a discriminated union:

```ts
export type DeltaResult =
  | { ok: true; model: SpreadsheetModel; applied: AppliedDelta }
  | { ok: false; conflict: true; expected: number; actual: number }
  | { ok: false; conflict: false; error: string };
```

Callers branch on `ok`. Exceptions are for genuine bugs, and the loop catches
those too (`safe()` in `nodeAgentRuntime.ts:171`) so one broken step cannot end
the run.

## Immutability

Domain functions return new objects; they never mutate their input.
`applySpreadsheetDelta` builds a new `cells` record and returns a new model. The
one deliberate exception is `VersionedSpreadsheetSync`, a small class holding
`_model` and a bounded `_log`, which exists precisely to own that mutation in
one place.

## Bounds on every collection

Every accumulating structure has a cap and an eviction rule, with the constant
declared at the top of its file: `MAX_ITEMS` (12 context items), `MAX_SOURCES`
(50), `MAX_CELLS`, `MAX_BLOCKS` (2000), `MAX_LOG`. These are module-private —
they document a limit for a reader, not an API for a caller.

```ts
private pushLog(applied: AppliedDelta): void {
  this._log.unshift(applied);
  if (this._log.length > MAX_LOG) this._log.length = MAX_LOG;   // BOUND
}
```

## Export only what is used

A symbol is exported when something outside its file imports it. Helpers used
only within a module stay module-private. `tsconfig.json` sets `noUnusedLocals`
and `noUnusedParameters`, so `npm run typecheck` fails on a binding left behind;
`npx knip` catches the export nobody imports.

## File header comments carry the "why"

Every non-trivial module opens with a block comment explaining the decision, not
the mechanics — and where a rule came from. The strongest example is
`graph/agentGraphSession.ts`, whose header states the honesty contract in full,
including why `assertEdge` is never called. Match this: explain the constraint,
name the prior art, and say what the code refuses to do.

## Naming

- Functions are verbs: `collectContext`, `searchAndSynthesize`,
  `applySpreadsheetDelta`, `runNodeAgent`.
- Types are the domain noun: `RoomContext`, `RankedSource`, `AppliedDelta`,
  `NotebookDoc`. All of them live in one file,
  `features/node-agent/types/nodeAgentTypes.ts`.
- Tool names are `snake_case` strings (`collect_context`) because they are wire
  identifiers shared with the UI, not TypeScript symbols.
- React components are `PascalCase` files under `components/`; everything else is
  `camelCase.ts`.

## Style

Double quotes, semicolons, two-space indent, trailing commas in multi-line
literals, ~100-column lines. There is **no linter or formatter configured** —
match the surrounding file by hand.

## Imports

Relative paths are the norm in `src/`, even the deep ones. The `@`/`@features`/
`@node-agent` aliases exist and work, but if you use them remember they are
declared in three files that must agree: `tsconfig.json`, `vite.config.ts`,
`vitest.config.ts`.

## Scripts and receipts

Each proof is `scripts/nodeagent-<thing>-smoke.ts`, wired as
`npm run nodeagent:<thing>:smoke`, writing a JSON receipt to `docs/eval/`. A
smoke prints one line — `<thing> smoke: PASS …` or `FAIL` with each issue — and
sets `process.exitCode = 1` on failure. Receipts under `docs/eval/` are
generated; never hand-edit them.

## Behaviour changes need evidence, not argument

`promotion/PROMOTION_LOG.md` is append-only: each entry records the defect with
its reproduction, the root cause, the fix, and the re-proof from the rendered
app. Add an entry; never rewrite an old one. A number that has been falsified
gets a new line, not a quiet correction.
