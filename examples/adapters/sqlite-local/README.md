# SQLite Local Adapter

Status: fully runnable local-first durable adapter. No cloud credentials are
required. This is the recommended first provider because it can run in CI and
on a laptop.

## Credentials

None.

Use `.env.example` only to choose local file locations:

```bash
cp examples/adapters/sqlite-local/.env.example .env.local
```

## Spin Up

Target app commands:

```bash
npm install
npm run nodeagent:durable:smoke
npm run nodeagent:sqlite:smoke
npm run nodeagent -- adapters setup sqlite-local --run
```

## Adapter Mapping

| NodeAgent port | SQLite mapping |
|---|---|
| `DurableJobStore` | `nodeagent_jobs` table |
| `DurableFrameStore` | `nodeagent_frames` table |
| `LeaseStore` | `nodeagent_leases` table with `resource_id` primary key |
| `StepJournal` | `nodeagent_journal` table with `key` primary key |
| `DurableScheduler` | query queued jobs by `run_after`, priority, id |
| `ArtifactStore` | JSON column or file path under `NODEAGENT_ARTIFACT_DIR` |
| `ToolRuntime` | app-local tool registry |

## Implementation Notes

- Adapter code: `sqliteDurableRuntime.ts`.
- Provider smoke: `scripts/nodeagent-sqlite-smoke.ts`.
- Use a transaction for lease claim and journal write.
- Store receipts as JSON, not prompt text.
- Make `nodeagent_journal.key` unique so duplicate runs replay.
- Use integer epoch milliseconds for portable timestamps.
- Use local filesystem artifacts only under the app-owned artifact directory.

## Done Criteria

- `npm run nodeagent:durable:smoke` still passes.
- `npm run nodeagent:sqlite:smoke` proves enqueue, persisted frame run, stale
  lease reclaim, journal write once, receipt store/load, and duplicate replay
  after reopening the SQLite database.
- A clean checkout can run with only local files and no external accounts.

## Coding-Agent Prompt

```text
Use the existing SQLite adapter behind DurableRuntimePorts.
Run npm run nodeagent:sqlite:smoke before changing it.
If extending it, keep schema.sql and sqliteDurableRuntime.ts aligned and prove
enqueue, lease, stale lease reclaim, journal writeOnce, receipt storage, and
duplicate replay after database reopen.
```
