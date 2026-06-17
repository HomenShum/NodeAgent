# Postgres Adapter

Status: blueprint for a SQL durable adapter.

Official references:

- PostgreSQL connection strings: https://www.postgresql.org/docs/current/libpq-connect.html
- Neon app connection strings: https://neon.com/docs/connect/connect-from-any-app

This folder works for Neon, Supabase, Railway, RDS Postgres, local Postgres, or
another provider that exposes a normal Postgres connection string.

## Credentials

Ask the human for:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection URI |
| `NODEAGENT_SCHEMA` | optional schema name for runtime tables |
| `NODEAGENT_ARTIFACT_BUCKET` | optional object store if receipts should not live in SQL |

Credential handoff:

```text
I need a Postgres DATABASE_URL for NodeAgent durable runtime tables.
Use a least-privilege role if possible. Put DATABASE_URL in .env.local or the
platform secret store. Do not paste it into tracked files or logs.
```

## Spin Up

```bash
npm install
npm run nodeagent:durable:smoke
# after the Postgres adapter exists:
npm run nodeagent:postgres:migrate
npm run nodeagent:postgres:smoke
```

## Adapter Mapping

| NodeAgent port | Postgres mapping |
|---|---|
| `DurableJobStore` | `nodeagent_jobs` table |
| `DurableFrameStore` | `nodeagent_frames` table |
| `LeaseStore` | `nodeagent_leases` row lock or upsert with expiry predicate |
| `StepJournal` | `nodeagent_journal.key` primary key |
| `DurableScheduler` | SQL query, pg-boss, graphile-worker, or external queue |
| `ArtifactStore` | JSONB table for small receipts, object store for large ones |
| `ToolRuntime` | app server tool registry |

## Implementation Notes

- Use transactions for lease claim and journal write.
- Prefer `insert ... on conflict do nothing` for journal idempotency.
- Keep receipt JSON in `jsonb` until it becomes large enough to move to object
  storage by reference.
- Use `for update skip locked` only if the adapter owns worker polling.

## Done Criteria

- Migration creates tables without touching app-owned data.
- Provider smoke proves enqueue, lease, stale lease reclaim, journal write once,
  receipt store/load, and duplicate replay.
- `DATABASE_URL` never appears in logs or generated docs.

## Coding-Agent Prompt

```text
Implement a Postgres DurableRuntimePorts adapter. Use schema.sql as the table
shape. Add migration and npm run nodeagent:postgres:smoke. Use unique journal
keys, transactional lease claim, and receipt replay. Do not change NodeAgent
core frame semantics.
```
