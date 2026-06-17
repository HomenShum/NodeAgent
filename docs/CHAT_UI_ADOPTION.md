# Chat UI Adoption

NodeAgent can be injected as a chat UI into another React repo without taking
over that app's backend, database, or model provider.

## Fast Path

From the NodeAgent repo:

```bash
npm run nodeagent -- apps scaffold chat-ui --dir nodeagent-chat-ui --auto
cd nodeagent-chat-ui
npm run dev
```

From a target repo after this package is available through GitHub or npm:

```bash
npx github:HomenShum/NodeAgent apps scaffold chat-ui --dir nodeagent-chat-ui --auto
cd nodeagent-chat-ui
npm run dev
```

`--auto` installs dependencies, writes the no-key demo receipt, runs smoke, runs
build, and writes `.nodeagent/setup-receipt.json`.

## What Gets Injected

| File | Purpose |
|---|---|
| `src/nodeagent-chat/NodeAgentChatApp.jsx` | assistant-ui shell and Thread |
| `src/nodeagent-chat/nodeAgentLocalAdapter.js` | no-key scripted adapter |
| `src/nodeagent-chat/toolUIs.jsx` | inline tool cards for NodeAgent steps |
| `src/styles.css` | portable responsive chat styling |
| `scripts/run-chat-demo.mjs` | demo receipt writer |
| `scripts/chat-ui-smoke.mjs` | generated-app contract smoke |

The scaffold is intentionally adapter-first. Keep the UI stable and replace the
adapter with a server route, worker, or SDK-backed model runtime when
credentials exist.

## No-Key First

The generated app starts with no provider credentials. The local adapter returns
deterministic context, source, model-delta, and memo payloads so the chat can be
evaluated before account creation or API token handoff.

When a live provider is added:

- ask the human to put secrets in `.env.local` or the provider secret store
- call providers from a server route or worker, not browser code
- keep raw prompts, cookies, API keys, and private data out of traces and eval JSON
- keep `npm run smoke` runnable without credentials

## Coding-Agent Prompt

```text
Inject NodeAgent chat into this repo. Use the chat-ui scaffold first and keep it
no-key. Run install, agent:demo, smoke, and build. Then replace only the local
adapter with our app's server route or worker. Preserve assistant-ui Thread,
inline NodeAgent tool cards, and data-nodeagent-chat attributes. Do not expose
secrets, raw cookies, or long prompt transcripts in client state or logs.
```

## Done Criteria

```bash
npm run agent:demo
npm run smoke
npm run build
```

Then open the Vite URL, send the suggested prompt, and verify the assistant
message renders context, search, model-delta, and memo tool cards.
