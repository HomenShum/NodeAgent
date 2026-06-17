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

```bash
npm install
npm run agent:demo
npm run dev
```

Open the URL printed by Vite, usually `http://127.0.0.1:5173`.

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
