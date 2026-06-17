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
npm run nodeagent:sqlite:smoke
npm run omnigent:nodeagent:smoke
npm run omnigent:nodeagent:smoke -- --require-omni-cli
npm run omnigent:nodeagent:smoke -- --require-official-omnigent
npm run omnigent:official:probe
```

The first command executes the canonical demo through:

```text
ReasoningFrame -> runNodeAgent -> FrameDelta -> verifier receipt
```

The durable command executes the provider-neutral ports through:

```text
DurableJob -> lease -> runReasoningFrame -> StepJournal -> receipt replay
```

The SQLite command proves the no-cloud provider adapter through:

```text
SQLite tables -> persisted frame -> receipt replay after database reopen
```

The Omnigent command validates `examples/omnigent/*.yaml`, confirms the worker
spec points back to the required NodeAgent proof commands, runs the frame and
durable/provider smokes, and writes `docs/eval/omnigent-nodeagent-smoke.json`.

The smoke separates two CLIs:

- Official Omnigent Python CLI: `omnigent` and its shorter alias `omni`.
- npm `omniagent`: a lightweight local executable probe used by this repo.

The official non-interactive proof is:

```bash
omnigent --help
omnigent run --help
omnigent run examples/omnigent/nodeagent-worker.yaml
```

Use `npm run omnigent:nodeagent:smoke -- --require-official-omnigent` to fail if
the official CLI is missing or its `run` command is not available. The final
`omnigent run ...` command can launch a nested coding-agent harness, so the repo
smoke probes `run --help` by default instead of starting a live nested session.
`npm run omnigent:official:probe` also tries direct PATH, local `uv`, and WSL
`uv` on Windows, then records the result in
`docs/eval/omnigent-official-cli-probe.json`.

The npm `omniagent` proof is:

```bash
npx omniagent hello
npx omniagent profiles --json
```

Those commands prove the local npm wrapper is installed and executable without
starting a nested coding-agent session. The YAML files remain the portable
outer-harness contract for environments that provide an `omnigent run` or
`omni run` compatible runner.

Native Windows caveat: the current official Python Omnigent package can fail
before help output because it imports POSIX-only `signal.SIGUSR1`. In that case,
use WSL, Linux, or macOS for the official `omni run` path and keep the npm
`omniagent` probe as the local Windows executable check.

## Boundary

| Layer | Owns | Repo surface |
|---|---|---|
| Omnigent | outer harness, model/session choice, terminal and sandbox policy | `examples/omnigent/*.yaml` |
| NodeAgent | runtime loop, frames, durable ports, search, spreadsheet deltas, memo, verification | `src/features/node-agent/**` |
| Convex | live multiplayer backend contract | `convex/schema.ts` |

Do not store durable cognition in Omnigent prompt/session memory. Keep it in
NodeAgent frame/context/result data, and prove changes with repo-local tests.
