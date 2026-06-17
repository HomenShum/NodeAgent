# Durable Runtime

NodeAgent's durable runtime is provider-neutral. The core frame runner does not
know about Convex, Postgres, DynamoDB, SQLite, SQS, Step Functions, or any other
database or queue. It depends on ports in
[`durableRuntime.ts`](../src/features/node-agent/runtime/durableRuntime.ts), and
apps supply adapters.

## Runnable Proof

```bash
npm run nodeagent:frame:smoke
npm run nodeagent:durable:smoke
npm run nodeagent:sqlite:smoke
npm run omnigent:nodeagent:smoke
npm run examples:guidance:smoke
npm run prepush
```

`nodeagent:durable:smoke` uses the in-memory adapter to prove:

- a queued `ReasoningFrame` can be scheduled and run
- worker leases fence active jobs
- stale leases can be reclaimed with a higher fencing token
- the step journal is idempotent
- a duplicate run replays the stored receipt instead of executing again
- the verifier receipt is stored as an artifact and can be loaded later

The JSON receipt is written to
[`docs/eval/nodeagent-durable-smoke.json`](eval/nodeagent-durable-smoke.json).

`nodeagent:sqlite:smoke` uses the real SQLite adapter in
[`examples/adapters/sqlite-local/sqliteDurableRuntime.ts`](../examples/adapters/sqlite-local/sqliteDurableRuntime.ts).
It creates a temporary SQLite database, runs a durable frame, reopens through a
second runtime, and proves duplicate execution replays the persisted receipt.

## Ports

| Port | Required behavior |
|---|---|
| `DurableJobStore` | create, update, and list runnable jobs by status, priority, and `runAfter` |
| `DurableFrameStore` | persist frame status, evidence, and receipt references |
| `LeaseStore` | claim, release, expire, and fence worker leases |
| `StepJournal` | `writeOnce` idempotency for frame/tool receipts |
| `DurableScheduler` | enqueue frames and return the next runnable job |
| `ArtifactStore` | store JSON receipts and result references |
| `ToolRuntime` | run typed tools behind policy context |
| `PolicyContext` | carry auth, tenant, scope, egress, and spend boundaries |

## Adapter Checklist

When porting NodeAgent into another repo, implement adapters behind the ports
instead of changing the frame runner:

1. Store jobs, frames, leases, and journal keys transactionally.
2. Make `StepJournal.writeOnce` atomic.
3. Make lease claim atomic and attach a monotonic fencing token.
4. Store receipts/artifacts separately from prompt transcripts.
5. Keep app-specific writes inside tools; do not mutate backend state directly
   from the frame runner.
6. Add provider-specific smokes for resume, stale lease reclaim, duplicate
   journal replay, and one real app tool.

## Provider Mapping

| Target | Job/frame/lease/journal | Scheduler | Artifacts |
|---|---|---|---|
| Convex | Convex tables with indexed ids and atomic mutations | Convex scheduled functions / action workers | Convex storage or object store |
| AWS | DynamoDB conditional writes | SQS, EventBridge, or Step Functions | S3 |
| Postgres | tables with unique journal keys and advisory/row locks | pg-boss, graphile-worker, or external queue | S3/R2/local object store |
| SQLite/local | SQLite tables with unique keys | local worker loop | filesystem |
| Cloudflare | D1 or Durable Objects | Queues / Workflows | R2 |

If a provider requires edits to `runReasoningFrame` or `runDurableReasoningFrame`,
the adapter is leaking provider concerns into NodeAgent core.

## Coding-Agent Blueprints

Use these folders when adapting NodeAgent into another repo:

- [`examples/adapters`](../examples/adapters/README.md): provider adapter
  guidance for SQLite/local, Convex, AWS DynamoDB/SQS/S3, Postgres, and
  Cloudflare D1/R2/Queues.
- [`examples/apps`](../examples/apps/README.md): sample app maps for a minimal
  portable agent, AWS-Hackathon/VisualLabs, local design dashboards, and video
  agent pipelines.

Every provider/app README must include credentials, spin-up commands, done
criteria, and coding-agent handoff guidance. The structural check is:

```bash
npm run examples:guidance:smoke
```

The guided CLI wraps the same checks with Commander and Clack:

```bash
npm run nodeagent -- doctor
npm run nodeagent -- happy-path
npm run nodeagent -- smoke
npm run nodeagent -- adapters setup sqlite-local --run
```

The timed happy path writes:

```bash
npm run nodeagent:happy-path:smoke
# -> docs/eval/nodeagent-happy-path-speed.json
```
