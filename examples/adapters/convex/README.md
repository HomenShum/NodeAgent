# Convex Adapter

Status: runnable live contract smoke plus adapter blueprint. The schema tables
and Convex URL reachability are proven by `npm run nodeagent:convex:smoke`;
provider-specific mutation implementations remain app-owned.

Official references:

- Convex CLI project setup: https://docs.convex.dev/cli/overview
- Convex environment variables: https://docs.convex.dev/production/environment-variables
- Convex production deploy keys: https://docs.convex.dev/production/overview

## Credentials

Ask the human for:

| Variable | Purpose |
|---|---|
| `CONVEX_DEPLOYMENT` | selects the Convex deployment for local dev |
| `VITE_CONVEX_URL` | browser/client URL for the live app |
| `CONVEX_DEPLOY_KEY` | CI or production deploys only |

Credential handoff:

```text
I need the Convex deployment values for this app:
- CONVEX_DEPLOYMENT for local Convex dev
- VITE_CONVEX_URL for the browser app
- CONVEX_DEPLOY_KEY only if you want CI/prod deploy

Put them in .env.local or your CI secret store. Do not paste deploy keys into
tracked files or logs.
```

## Spin Up

```bash
npm install
npx convex dev
npm run dev
npm run nodeagent:durable:smoke
npm run nodeagent:convex:smoke
```

## Adapter Mapping

| NodeAgent port | Convex mapping |
|---|---|
| `DurableJobStore` | `nodeagentJobs` table and atomic mutations |
| `DurableFrameStore` | `nodeagentFrames` table |
| `LeaseStore` | `nodeagentLeases` mutation with expiry check |
| `StepJournal` | `nodeagentJournal` table with unique key semantics |
| `DurableScheduler` | scheduled functions or action worker polling runnable jobs |
| `ArtifactStore` | Convex storage or object store reference |
| `ToolRuntime` | Convex actions/mutations wrapped as typed tools |

## Implementation Notes

- Keep durable frame state in Convex tables, not Omnigent YAML or chat history.
- Use mutations for `claimLease` and `writeJournalOnce` so the check and write
  are atomic.
- Store receipt JSON by reference when it becomes large.
- Keep multiplayer room tables separate from runtime job/journal tables.

## Done Criteria

- `npx convex dev` starts without schema errors.
- `npm run nodeagent:convex:smoke` proves the durable table contract and Convex
  URL reachability.
- App-owned provider smoke should prove enqueue, lease, stale lease reclaim,
  journal write once, receipt store/load, and duplicate replay against the
  target app's Convex mutations.
- `npm run prepush` passes.

## Coding-Agent Prompt

```text
Implement a Convex DurableRuntimePorts adapter. Add Convex tables for jobs,
frames, leases, journal, and receipt artifacts. Use atomic mutations for lease
claim and journal writeOnce. Add npm run nodeagent:convex:smoke. Do not change
runReasoningFrame or durableRuntime.ts port semantics.
```
