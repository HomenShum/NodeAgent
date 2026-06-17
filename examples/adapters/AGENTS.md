# Coding Agent Notes

This directory contains provider adapter guidance for NodeAgent durable runtime
ports. Do not treat a provider folder as production-complete unless its README
lists a runnable smoke and that smoke passes.

Before editing provider guidance or adapter examples, run:

```bash
npm run examples:guidance:smoke
npm run nodeagent:durable:smoke
```

Rules:

- Keep secrets out of files, logs, prompts, traces, and generated eval receipts.
- Keep provider-specific code behind `DurableRuntimePorts`.
- Do not modify `runReasoningFrame` to satisfy a provider.
- Include credential names, official docs links, spin-up commands, and done
  criteria in every provider README.
- Mark blueprint-only examples clearly. Do not imply they are production-ready.
- Every provider adapter must eventually prove enqueue, lease, stale lease
  reclaim, journal `writeOnce`, receipt storage, and replay.
