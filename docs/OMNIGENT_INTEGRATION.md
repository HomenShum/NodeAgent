# Omnigent Integration

NodeAgent treats Omnigent as an optional outer meta-harness. Omnigent can choose
the coding harness, model, terminal, sandbox, and policy layer; NodeAgent owns
the runtime loop, reasoning frames, grounded search, versioned spreadsheet
deltas, notebook memo output, and verification receipts.

## Runnable Proof

From the repo root:

```bash
npm run nodeagent:frame:smoke
npm run nodeagent:durable:smoke
npm run omnigent:nodeagent:smoke
```

The first command executes the canonical demo through:

```text
ReasoningFrame -> runNodeAgent -> FrameDelta -> verifier receipt
```

The durable command executes the provider-neutral ports through:

```text
DurableJob -> lease -> runReasoningFrame -> StepJournal -> receipt replay
```

The Omnigent command validates `examples/omnigent/*.yaml`, confirms the worker
spec points back to the required NodeAgent proof commands, runs the frame and
durable smokes, and writes `docs/eval/omnigent-nodeagent-smoke.json`.

The smoke does not require the Omnigent CLI. When the CLI is installed, run the
outer harness check with:

```bash
omni run examples/omnigent/nodeagent-worker.yaml
omni run examples/omnigent/nodeagent-reviewer.yaml
```

## Boundary

| Layer | Owns | Repo surface |
|---|---|---|
| Omnigent | outer harness, model/session choice, terminal and sandbox policy | `examples/omnigent/*.yaml` |
| NodeAgent | runtime loop, frames, durable ports, search, spreadsheet deltas, memo, verification | `src/features/node-agent/**` |
| Convex | live multiplayer backend contract | `convex/schema.ts` |

Do not store durable cognition in Omnigent prompt/session memory. Keep it in
NodeAgent frame/context/result data, and prove changes with repo-local tests.
