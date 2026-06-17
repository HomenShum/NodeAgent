# NodeAgent Local Dashboard

This is a local-first dashboard scaffold for NodeAgent. It gives you a
VisualLabs/NodeRoom-style shell with a no-key scripted agent, SQLite durability,
and Trace Lens review tabs.

## No API Keys

The first run does not need OpenAI, Anthropic, Convex, AWS, Postgres, or any
cloud credential. `npm run agent:demo` runs a deterministic local agent and
writes:

- `.nodeagent/nodeagent.sqlite`
- `public/nodeagent-state.json`
- `docs/eval/local-dashboard-smoke.json` when `npm run smoke` is used

When you are ready for a live model, add credentials in `.env.local` and replace
the scripted model adapter. Do not make live keys required for the default demo.

## Spin Up

```bash
npm install
npm run agent:demo
npm run dev
```

Open the URL printed by Vite, usually `http://127.0.0.1:5173`.

Verify the local backend path:

```bash
npm run smoke
npm run build
```

## Trace Lens

The dashboard includes the NodeRoom-style trace workflow:

- `Review`: safe default mode for inspecting business evidence.
- `Builder`: visible but locked until the app grants code-aware access.
- `Business proof`: source cards, confidence, and verifier status.
- `Runtime trace`: bounded frame/tool events from the local run.
- `Code ownership`: gated provenance panel.

Surface elements use `data-noderoom-surface` so coding agents and browser tests
can target the same UI regions deterministically.

## Local Backend

`scripts/run-local-agent.mjs` creates the SQLite tables below and writes seed
state for the UI:

| Table | Purpose |
|---|---|
| `jobs` | one durable local job/run |
| `frames` | frame status and receipt summary |
| `traces` | bounded runtime events |
| `proofs` | business proof evidence cards |

This is intentionally small. Port it by replacing the script with your app's
`DurableRuntimePorts` adapter while keeping the same state shape for the UI.

## Credential Upgrade Path

1. Keep the scripted path as `npm run smoke`.
2. Add `.env.local` with provider keys only on the developer machine.
3. Move model calls behind a server route or worker.
4. Keep traces redacted and bounded.
5. Add a live-provider smoke that skips when credentials are absent.
