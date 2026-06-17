# Provider Adapter Examples

These examples are written for coding agents and humans porting NodeAgent into
another repo. The rule is simple: the target app adds adapters and tools; it
does not fork NodeAgent core.

## Start Here

1. Pick the provider folder that matches the target repo.
2. Copy the provider `.env.example` into the target app as `.env.local` or the
   platform's secret store.
3. Ask the human for only the missing credentials listed in the provider README.
4. Implement the adapter behind the ports in
   `src/features/node-agent/runtime/durableRuntime.ts`.
5. Run the contract smokes before claiming the app is spinnable:

```bash
npm run nodeagent:frame:smoke
npm run nodeagent:durable:smoke
npm run nodeagent:sqlite:smoke
npm run omnigent:nodeagent:smoke
npm run examples:guidance:smoke
npm run prepush
```

Pretty CLI path:

```bash
npm run nodeagent -- doctor
npm run nodeagent -- happy-path
npm run nodeagent -- adapters list
npm run nodeagent -- adapters setup sqlite-local --run
```

## Adapter Contract

Every provider adapter must preserve these behaviors:

| Behavior | Required proof |
|---|---|
| enqueue frame | a job row exists and is runnable after `runAfter` |
| claim lease | only one active worker can hold the job lease |
| stale lease reclaim | expired leases can be claimed with a higher fencing token |
| run frame | `runReasoningFrame` receives the persisted `ReasoningFrame` |
| write receipt | verifier receipt is stored outside prompt transcript memory |
| write journal once | duplicate execution cannot duplicate side effects |
| replay duplicate | a second run returns the stored receipt |

## Credential Handoff

Coding agents must not invent, print, or commit secrets. Use this handoff:

```text
I need these credentials to spin up the selected provider:
- PROVIDER_VAR_NAME: why it is needed
- PROVIDER_VAR_NAME_2: why it is needed

Put them in .env.local or the platform secret store. Do not paste raw secrets
into chat logs if your workflow records prompts.
```

After the human provides credentials, the agent should:

1. run the provider CLI auth check or connection check
2. create missing tables/queues/buckets with least-privilege names
3. run the provider-specific durable smoke
4. run `npm run prepush`
5. report exactly which provider resources were created

## Provider Folders

| Folder | Status | Best first use |
|---|---|---|
| `sqlite-local` | fully runnable, no cloud credentials | desktop/local dev, CI proof, offline demo |
| `convex` | runnable live contract smoke + adapter blueprint | existing NodeBench/Convex-style multiplayer app |
| `aws-dynamodb` | AWS durable blueprint | AWS-Hackathon / VisualLabs style apps |
| `postgres` | SQL durable blueprint | Neon, Supabase, Railway, RDS, local Postgres |
| `cloudflare` | edge durable blueprint | Workers, D1, R2, Queues, Workflows |

## Security Rules

- Never store durable cognition in prompts, chat transcripts, or Omnigent YAML.
- Never expose raw cookies, API keys, access tokens, or database URLs to tool
  outputs or traces.
- Prefer short-lived or role-based auth when the provider supports it.
- Keep analytics stores separate from transactional job/frame/journal state.
- If a provider needs a core runtime change, fix the adapter boundary instead.
