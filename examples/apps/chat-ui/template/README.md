# NodeAgent Chat UI

This is a portable assistant-ui chat scaffold for NodeAgent. It gives another
repo a working local chat surface, inline tool cards, and a no-key scripted
adapter that can later be replaced by a live model or durable worker route.

## No API Keys

The default path does not need OpenAI, Anthropic, Convex, AWS, Postgres, or any
cloud credential. `npm run agent:demo` writes:

- `public/nodeagent-chat-state.json`
- `docs/eval/chat-ui-demo.json`

When you are ready for a live model, add credentials to `.env.local` and move
the provider call behind a server route or worker. Do not call provider APIs
from browser code with raw keys.

## Spin Up

Use Node.js 20.19+ within Node 20, or Node.js 22.12+ (`^20.19.0 || >=22.12.0`),
as required by Vite 8 and its React plugin.

```bash
npm install
npm run agent:demo
npm run dev
```

Open the URL printed by Vite, usually `http://127.0.0.1:5173`.

The production build uses Vite 8's default browser targets: Chrome/Edge 111,
Firefox 114 and Safari 16.4. These are newer than Vite 6's defaults; older-browser
compatibility has not been tested. See the official
[Vite 7 migration guide](https://v7.vite.dev/guide/migration) and
[Vite 8 migration guide](https://vite.dev/guide/migration).

Verify the scaffold:

```bash
npm run smoke
npm run build
```

If this app was generated with:

```bash
npm run nodeagent -- apps scaffold chat-ui --dir nodeagent-chat-ui --auto
```

the install, demo receipt, smoke, and build already ran. The automation receipt
is `.nodeagent/setup-receipt.json`.

## Chat Runtime

The chat is built on `@assistant-ui/react`:

- `NodeAgentChatApp.jsx` uses `useLocalRuntime(nodeAgentLocalAdapter)`.
- `toolUIs.jsx` registers four inline tool cards.
- `nodeAgentLocalAdapter.js` streams a deterministic context/search/model/memo
  run with no network calls.

To go live, replace `nodeAgentLocalAdapter` with a fetch-backed adapter that
calls your server route or worker. Keep the UI and tool-card payload shape
stable so the no-key smoke remains useful.

## Integration Notes

Copy `src/nodeagent-chat/` and `src/styles.css` into an existing Vite/React app,
or keep this app as a standalone demo. The root element carries
`data-nodeagent-chat="shell"` and each major region has stable attributes for
coding-agent and browser verification.

## Credential Upgrade Path

1. Keep `npm run smoke` no-key.
2. Add `.env.local` only on the developer machine.
3. Move model calls behind `/api/nodeagent/chat` or a worker.
4. Persist durable state in your adapter, not in chat transcripts.
5. Add a live-provider smoke that skips when credentials are absent.
