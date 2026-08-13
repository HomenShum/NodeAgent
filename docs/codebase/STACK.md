# Stack

What is installed, what it is for, and what it costs you to know.

## Runtime

| Thing | Version | Where it is declared |
|---|---|---|
| Node | ≥ 20 (developed on 22) | `package.json` `engines` |
| TypeScript | 5.7 | `package.json`, `tsconfig.json` |
| Module system | ESM only (`"type": "module"`) | `package.json` |

## Production dependencies (11)

| Package | What it does here | Where it enters the code |
|---|---|---|
| `@assistant-ui/react` | The chat runtime and its unstyled building blocks. Supplies `useLocalRuntime`, `ThreadPrimitive`, `ComposerPrimitive`, `MessagePrimitive`, and `makeAssistantToolUI`. **This is also the tool-registration mechanism** — there is no home-grown one. | `components/NodeAgentDemoApp.tsx`, `NodeAgentThread.tsx`, `toolUIs.tsx` |
| `react`, `react-dom` | 19.x. The demo app. | `src/app/main.tsx` |
| `sigma`, `graphology`, `graphology-layout-forceatlas2`, `@sigma/node-border` | WebGL graph rendering and layout. **Not imported by our own code** — they are the runtime dependencies of the vendored renderer in `vendor/nodegraph-live/`. | `vendor/nodegraph-live/NodeGraph.js` |
| `commander`, `@clack/prompts` | Command parsing and the pretty terminal output for both CLIs. | `bin/nodeagent.mjs`, `scripts/nodeagent-cli.ts` |
| `better-sqlite3` | Synchronous SQLite. Backs the durable-runtime adapter example. | `examples/adapters/sqlite-local/sqliteDurableRuntime.ts` |
| `convex` | The optional hosted backend. **The demo never calls it**; only the schema and a smoke that reports `convex=not_configured`. | `convex/schema.ts` |

## Dev dependencies (11)

`vite` + `@vitejs/plugin-react` (dev server and build), `vitest` (tests), `tsx`
(runs TypeScript directly for the CLIs, demo and smokes), `playwright` (the
browser checks in `e2e/`), `typescript`, the `@types/*` packages, and
`omniagent` — a CLI **spawned as a binary**, never imported, by
`scripts/omnigent-nodeagent-smoke.ts`.

## Vendored, not installed

`vendor/nodegraph-live/` is a pre-built copy of the `@homenshum/nodegraph-live`
graph renderer, committed as compiled `.js` + `.d.ts` + `.js.map`. It is
imported directly by path:

```ts
// src/features/node-agent/components/GraphRailPanel.tsx:13
import { NodeGraph } from "../../../../vendor/nodegraph-live/react.js";
```

It is excluded from `knip.json` because its unused exports are that library's
public API, not this repo's debt.

## What is deliberately absent

No Tailwind, no component library, no CSS-in-JS — styling is one hand-written
stylesheet, `src/app/styles.css`. No router. No state-management library
(`useSyncExternalStore` against a plain object is the whole store). No ORM. No
Storybook. No documentation site. No linter or formatter is configured; the
`tsconfig` is strict and carries `noUnusedLocals` / `noUnusedParameters`, which
is what actually catches dead bindings here.

## Path aliases

`@` → `src`, `@features` → `src/features`, `@node-agent` →
`src/features/node-agent`. Declared in three places that must agree:
`tsconfig.json` `paths`, `vite.config.ts` `resolve.alias`, and
`vitest.config.ts` `resolve.alias`. Most existing code uses relative imports
anyway.

## Runs with no keys

The default path uses no API key and no account. `.env.example` documents the
optional keys (Convex URL, OpenRouter / Anthropic / OpenAI, Linkup / Brave) that
"light up" live paths; without them the loop runs deterministically over the
fixed scenario in `src/features/node-agent/demoScenario.ts`. `npm run secret-scan`
runs before every push.
