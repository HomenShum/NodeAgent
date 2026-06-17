# Coding Agent Notes

This app is intentionally no-key first.

Before changing the chat scaffold, run:

```bash
npm run agent:demo
npm run smoke
npm run build
```

Map files:

- `src/nodeagent-chat/NodeAgentChatApp.jsx` - assistant-ui shell and thread.
- `src/nodeagent-chat/nodeAgentLocalAdapter.js` - local no-key adapter.
- `src/nodeagent-chat/toolUIs.jsx` - inline tool cards.
- `src/styles.css` - portable chat styling.
- `scripts/run-chat-demo.mjs` - writes the local proof receipt.
- `scripts/chat-ui-smoke.mjs` - verifies the scaffold contract.

Rules:

- Keep the first run usable without model/provider credentials.
- Put live model calls behind a server route, worker, or provider adapter.
- Do not expose API keys, raw cookies, long prompt transcripts, or provider
  secrets in browser state, logs, traces, or eval JSON.
- Preserve the `data-nodeagent-chat` attributes so coding agents and browser
  tests can target the chat surfaces deterministically.
