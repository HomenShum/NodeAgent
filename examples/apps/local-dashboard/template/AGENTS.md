# Coding Agent Notes

This app must stay runnable without API keys.

Before changing runtime behavior, run:

```bash
npm run smoke
npm run build
```

Rules:

- Keep the default `NODEAGENT_MODE=scripted` path deterministic and local.
- Use SQLite through `scripts/run-local-agent.mjs` until a provider adapter is intentionally added.
- Do not print secrets into console output, traces, prompts, receipts, or `public/nodeagent-state.json`.
- Preserve Trace Lens labels: `Review`, `Builder`, `Business proof`, `Runtime trace`, and `Code ownership`.
- Keep builder/code-owner data gated until a server-side privileged route exists.
- Keep inspectable surfaces marked with `data-noderoom-surface`.
