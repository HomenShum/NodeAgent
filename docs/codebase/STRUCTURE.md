# Structure

Where things live, and — more usefully — which directories you can ignore on
day one.

## The whole tree

```
index.html                  the one page; loads src/app/main.tsx
nodeagent-v1.html           a standalone no-build prototype (inline <style>,
                            imports nothing from src/) — a separate artifact

src/
  app/                      main.tsx (mounts React), styles.css (all styling)
  features/
    node-agent/             the agent itself
      components/           NodeAgentDemoApp · NodeAgentThread · toolUIs ·
                            GraphRailPanel
      runtime/              nodeAgentRuntime (THE LOOP) · nodeAgentChatAdapter
                            (loop -> chat) · reasoningFrameRunner ·
                            durableRuntime · omnigentAdapter
      graph/                agentGraphSession — feeds the live graph rail
      types/                nodeAgentTypes.ts — every shared contract
      demoScenario.ts       the one fixed scenario every surface runs
    chat/                   contextCollector — rank room messages/documents
    search/                 searchAndSynthesize — ground, rank, cite, or decline
    spreadsheet/            applySpreadsheetDelta · versionedSpreadsheetSync
    notebook/               notebookEditor — build and render the memo

tests/                      7 vitest files, 41 tests
e2e/                        Playwright captures that drive the real dev server
demo/runNodeAgentDemo.ts    the loop, printed to a terminal
bin/nodeagent.mjs           the published CLI — the ONLY scaffold implementation
scripts/                    13 dev scripts: the pretty CLI + one smoke per proof
convex/schema.ts            hosted-backend schema; not used by the demo
vendor/nodegraph-live/      vendored graph renderer (third-party build)
examples/
  adapters/                 one runnable (sqlite-local) + four blueprints
  apps/*/template/          scaffold templates — copied verbatim into new repos
promotion/                  product goal, journeys, defect ledger, evidence
docs/                       this documentation
.tours/                     CodeTour files
```

## The five files that matter

If you read only these you can follow any request through the system:

1. `src/features/node-agent/runtime/nodeAgentRuntime.ts` — the loop.
2. `src/features/node-agent/runtime/nodeAgentChatAdapter.ts` — loop → chat.
3. `src/features/node-agent/components/toolUIs.tsx` — the four tool names.
4. `src/features/node-agent/demoScenario.ts` — the data everything runs on.
5. `src/features/node-agent/types/nodeAgentTypes.ts` — the shared contracts.

## Directories you can ignore on day one

| Directory | Why you can skip it |
|---|---|
| `vendor/` | Third-party compiled output. Read `GraphRailPanel.tsx` instead — it is the only caller. |
| `examples/apps/*/template/` | Files copied into a *generated* project. They are not part of this app and are deliberately duplicative of it. |
| `examples/adapters/{aws-dynamodb,postgres,cloudflare}/` | READMEs and schemas only — blueprints, no code that runs. |
| `convex/` | One schema file. The demo never connects. |
| `docs/eval/*.json` | Generated receipts, rewritten by smokes. Never hand-edit. |
| `promotion/evidence/` | Generated screenshots and observation JSON. |
| `nodeagent-v1.html` | A parallel prototype with its own inline styles. Changing `src/` cannot affect it, and vice versa. |

That leaves roughly 19 files in `src/` — about 3,100 lines — as the actual
codebase.

## Naming shape

- One concept per file, named for the concept: `contextCollector.ts`,
  `searchAndSynthesize.ts`, `applySpreadsheetDelta.ts`, `notebookEditor.ts`.
- `features/<domain>/` for pure domain logic with no React import.
- `features/node-agent/` for anything that knows about *the agent* as opposed to
  one capability.
- `components/` is the only place React lives inside `features/`.
- Smoke scripts are `scripts/nodeagent-<thing>-smoke.ts`, each with a matching
  `npm run nodeagent:<thing>:smoke` and a JSON receipt in `docs/eval/`.

## Where a new capability goes

A fifth step in the loop touches exactly three files — `nodeAgentRuntime.ts`
(run it), `toolUIs.tsx` (name it and draw it), `nodeAgentChatAdapter.ts` (emit
it under the same name) — plus its own pure module under `src/features/<domain>/`.
See `docs/START_HERE.md`, "Where to make your first change".
