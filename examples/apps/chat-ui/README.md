# Chat UI Scaffold

Goal: inject the NodeAgent assistant-ui chat into any repo, demo, MVP, or
prototype without requiring API keys on the first run.

The template lives in `template/` and is copied by:

```bash
npm run nodeagent -- apps scaffold chat-ui --dir nodeagent-chat-ui --auto
```

After this package is installed from GitHub or npm, the same command shape is:

```bash
npx github:HomenShum/NodeAgent apps scaffold chat-ui --dir nodeagent-chat-ui --auto
```

## Credentials

None for the default path.

Optional later:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` or another model key | replace the scripted local chat adapter with a live model route |
| provider adapter vars | move jobs, frames, traces, and artifacts to Convex, Postgres, AWS, Cloudflare, or another durable backend |

## Runtime Mapping

| NodeAgent need | Chat UI mapping |
|---|---|
| chat surface | `src/nodeagent-chat/NodeAgentChatApp.jsx` using `@assistant-ui/react` |
| local model adapter | `nodeAgentLocalAdapter.js`, no network and no keys |
| tool UIs | `toolUIs.jsx` for context, search, model delta, and memo cards |
| app integration seam | replace the local adapter with a fetch-backed or SDK-backed adapter |
| smoke proof | `npm run agent:demo`, `npm run smoke`, and `npm run build` |

## Spin Up

```bash
npm run nodeagent -- apps scaffold chat-ui --dir nodeagent-chat-ui --auto
cd nodeagent-chat-ui
npm run dev
```

`--auto` installs dependencies, writes a local demo receipt, runs smoke, runs
build, and writes `.nodeagent/setup-receipt.json`.

## App Tools To Add

| Tool | Purpose |
|---|---|
| `read_room_context` | gather bounded project, room, or workflow context |
| `search_sources` | retrieve source-backed evidence |
| `apply_domain_delta` | update the app-specific model through a typed tool |
| `write_user_memo` | produce the final cited artifact |
| `verify_answer` | return a receipt for the UI and trace system |

## Done Criteria

- `npm run dev` opens the chat UI with no credentials.
- The first prompt runs the local adapter and renders inline tool cards.
- `npm run agent:demo` writes `public/nodeagent-chat-state.json`.
- `npm run smoke` proves the injectable files and no-key contract.
- `npm run build` passes in the generated app.
- Live providers are added behind server routes or workers, never directly in
  browser code.

## Coding-Agent Prompt

```text
Inject NodeAgent's chat-ui scaffold into this app. Keep the first path no-key:
use the local adapter, assistant-ui thread, and inline tool cards. Run install,
agent:demo, smoke, and build. Then document exactly where to replace the local
adapter with our live model or durable worker route. Do not expose API keys,
raw prompts, cookies, or provider secrets in client state, traces, or logs.
```
