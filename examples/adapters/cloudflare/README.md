# Cloudflare Adapter

Status: blueprint for an edge durable adapter.

Official references:

- Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/
- Workers environment variables: https://developers.cloudflare.com/workers/configuration/environment-variables/
- API tokens: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/

## Credentials

Ask the human for:

| Variable | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | account for Workers/D1/R2/Queues |
| `CLOUDFLARE_API_TOKEN` | local or CI deploy token |
| `NODEAGENT_D1_DATABASE_ID` | D1 database id for jobs/frames/leases/journal |
| `NODEAGENT_R2_BUCKET` | R2 bucket for receipts/artifacts |
| `NODEAGENT_QUEUE_NAME` | Queue name if using Queues scheduler |

Credential handoff:

```text
I need Cloudflare deployment credentials:
- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN with the minimum Worker/D1/R2/Queue permissions
- NODEAGENT_D1_DATABASE_ID
- NODEAGENT_R2_BUCKET
- NODEAGENT_QUEUE_NAME if using Queues

Put secrets in Wrangler secrets or CI secrets. Do not commit API tokens.
```

## Spin Up

```bash
npx wrangler whoami
npm install
npm run nodeagent:durable:smoke
# after the Cloudflare adapter exists:
npm run nodeagent:cloudflare:smoke
```

## Adapter Mapping

| NodeAgent port | Cloudflare mapping |
|---|---|
| `DurableJobStore` | D1 table or Durable Object state |
| `DurableFrameStore` | D1 table or Durable Object state |
| `LeaseStore` | Durable Object preferred, or D1 transaction with expiry |
| `StepJournal` | D1 unique key or Durable Object atomic state |
| `DurableScheduler` | Queues or Workflows |
| `ArtifactStore` | R2 object storage |
| `ToolRuntime` | Worker-bound tools and services |

## Implementation Notes

- Prefer a Durable Object for lease and journal atomicity if workers may run
  concurrently across regions.
- Use R2 for receipts/artifacts larger than a small JSON row.
- Keep text vars in Wrangler config and secrets in Wrangler secrets.
- Do not expose Cloudflare tokens to browser code.

## Done Criteria

- `npx wrangler whoami` works.
- Provider smoke proves enqueue, lease, stale lease reclaim, journal write once,
  receipt store/load, and duplicate replay.
- Deployment config keeps secrets out of `wrangler.example.jsonc`.

## Coding-Agent Prompt

```text
Implement a Cloudflare DurableRuntimePorts adapter using D1 or Durable Objects
for jobs, frames, leases, and journal, R2 for artifacts, and Queues/Workflows
for scheduling. Add npm run nodeagent:cloudflare:smoke. Keep secrets in
Wrangler secrets or CI, never in the repo.
```
