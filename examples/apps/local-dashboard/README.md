# Local Dashboard Scaffold

Goal: scaffold a local NodeAgent dashboard that behaves like a VisualLabs or
NodeRoom work surface while staying runnable with no cloud account and no model
API key.

The template lives in `template/` and is copied by:

```bash
npm run nodeagent -- apps scaffold local-dashboard --dir nodeagent-local-dashboard
```

## Credentials

None for the default path.

Optional later:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` or another model key | replace the scripted local agent with a live model |
| provider adapter vars | move durability from SQLite to Convex, Postgres, AWS, or Cloudflare |

## Runtime Mapping

| NodeAgent need | Local dashboard mapping |
|---|---|
| jobs / frames / traces | local SQLite database created by `npm run agent:demo` |
| dashboard state | `public/nodeagent-state.json` generated from the SQLite run |
| model calls | deterministic scripted agent by default, no network and no keys |
| tools | app-specific tools live behind the local runtime script first |
| review workflow | Trace Lens with Review and Builder modes |
| code provenance | gated Code ownership panel; do not expose code paths to the client until authorized |

## Trace Lens

The scaffold mirrors the latest NodeRoom trace-tab pattern:

- `Review` is the default safe mode.
- `Builder` is present but locked until the app opts into code-aware access.
- `Business proof` shows evidence, status, and confidence.
- `Runtime trace` shows bounded frame/tool rows.
- `Code ownership` is gated so code provenance never leaks as plain client data.
- UI surfaces carry `data-noderoom-surface` attributes for agent-friendly inspection.

## Spin Up

```bash
npm run nodeagent -- apps scaffold local-dashboard --dir nodeagent-local-dashboard --auto
cd nodeagent-local-dashboard
npm run dev
npm run smoke
```

`--auto` installs dependencies, runs the scripted SQLite agent demo, runs smoke,
runs build, and writes `.nodeagent/setup-receipt.json`. The first useful screen
works before credentials exist. A live model adapter can be added later without
changing the trace UI contract.

## App Tools To Add

| Tool | Purpose |
|---|---|
| `run_local_frame` | execute one deterministic frame against local state |
| `list_trace_rows` | read bounded trace rows by job/frame id |
| `open_business_proof` | return source cards and verifier receipts |
| `request_revision` | enqueue a follow-up frame with reviewer notes |
| `open_code_owner` | privileged server-side lookup for ownership/provenance |

## Done Criteria

- `npm run agent:demo` creates `.nodeagent/nodeagent.sqlite`.
- `npm run dev` opens a dashboard with room state, artifacts, and trace tabs.
- Review mode is usable with no API keys.
- Builder/code ownership is visibly gated until a privileged server route exists.
- `npm run smoke` proves the local SQLite happy path and dashboard state file.
- No secrets are printed into logs, prompts, traces, or `public/nodeagent-state.json`.

## Coding-Agent Prompt

```text
Use NodeAgent's local-dashboard scaffold. Keep the first run no-key by using the
scripted local agent and SQLite. Preserve Trace Lens sections named Review,
Builder, Business proof, Runtime trace, and Code ownership. Put provider writes
behind local runtime tools, and add one smoke proving the app can run from clone
to dashboard state without cloud credentials.
```
