# Integrations

Everything outside this process, and what happens when it is absent. The short
answer: **nothing external is required, and by default nothing external is
contacted.**

## Status at a glance

| Integration | Required? | Default behaviour without it | Where |
|---|---|---|---|
| Model provider (OpenRouter / Anthropic / OpenAI) | no | The loop runs deterministically over a fixed scenario. No call is made. | `.env.example`, `scripts/nodeagent-live-provider-smoke.ts` |
| Web retrieval (Linkup / Brave) | no | Sources come from `demoScenario.ts`. | `.env.example` |
| Convex | no | Never connected. `npm run nodeagent:convex:smoke` reports `convex=not_configured` and passes. | `convex/schema.ts` |
| SQLite (`better-sqlite3`) | no | Only the SQLite adapter example and its smoke touch it, in a temp file. | `examples/adapters/sqlite-local/` |
| `omniagent` CLI | no | Probe reports "not installed locally" and the smoke still passes. | `scripts/omnigent-nodeagent-smoke.ts:110` |
| Google Fonts | no | **Loaded at runtime** by `index.html:11`. On a restricted network the woff2 404s and the page falls back to `system-ui`. | `index.html` |
| Playwright browsers | for `e2e/` only | The browser captures cannot run. | `e2e/` |

## The one unconditional outbound request

`index.html:11` fetches Manrope and JetBrains Mono from `fonts.googleapis.com`
at page load. This is the only network call the demo makes by default. It was
observed to fail on 2 of 5 runs behind a restricted network during the promotion
baseline; the browser gate records third-party failures in a separate
`thirdPartyFailures` field and deliberately does not fail on them, so a stranger
behind a corporate proxy does not see a red gate for this app's own code.
Self-hosting the fonts is an open candidate (`CONCERNS.md`).

## Model provider

The seam is one optional function, not a client library:

```ts
// src/features/search/searchAndSynthesize.ts
export interface SynthesizeOptions {
  synthesizer?: (input: { query: string; grounded: RankedSource[] }) => string;
  maxSources?: number;
}
```

Omit it and a deterministic extractive synthesizer quotes the winning source
verbatim — synthesis without generation, so it cannot hallucinate. Pass one and
a live model writes the prose. Ranking, grounding, citation numbering and the
refusal-to-answer gate stay deterministic either way; generation is the only
stochastic step, and it is injectable.

To take the whole app live, replace `nodeAgentChatAdapter` in
`components/NodeAgentDemoApp.tsx:17` with a server-backed adapter. The tool UIs
and the four domain modules do not change.

### Outbound URL safety

`isSafeFetchUrl` in `searchAndSynthesize.ts:165` validates any URL before the
live retrieval adapter fetches it: `http`/`https` only, and it blocks
`localhost`, loopback, RFC1918, `169.254.0.0/16` (cloud metadata),
`metadata.google.internal`, and `.internal` / `.local` hosts. This exists
because an agent generates URLs from reasoning — one hallucinated
`http://169.254.169.254/…` is a credential leak.

## Convex

`convex/schema.ts` declares the tables for a live collaborative room. The demo
never connects. The smoke verifies the schema parses and reports
`convex=not_configured`, which is a pass. Configure `VITE_CONVEX_URL` and
`CONVEX_DEPLOYMENT` in `.env.local` to change that.

## Durable persistence

`runtime/durableRuntime.ts` defines the ports; `createInMemoryDurableRuntime()`
is the reference adapter used by tests and smokes;
`examples/adapters/sqlite-local/sqliteDurableRuntime.ts` is the runnable
provider. `examples/adapters/{convex,aws-dynamodb,postgres,cloudflare}/` are
**blueprints — README and schema only, no code that runs**. Their status is
declared in `scripts/nodeagent-cli.ts` (`runnable` vs `blueprint`); check that
list before assuming an adapter exists.

## Secrets

No key is needed for anything in the default path. Real values go in
`.env.local`, which is gitignored and scanned by `npm run secret-scan` — the
first step of `npm run check`. Never echo a secret into a log, prompt, trace, or
eval receipt.

## GitHub Actions

`.github/workflows/ci.yml` runs on Ubuntu: `npm ci`, installs ffmpeg and `uv`,
then `npm run walkthroughs:check`, `npm run omnigent:official:probe`,
`npm run prepush`, and finally `git diff --exit-code -- docs/walkthroughs` to
catch unintended media mutations. Note that CI checks the *pipeline*, not
byte-identical re-renders — ffmpeg output is not deterministic across builds.
`.github/workflows/node-platform-conformance.yml` runs a reusable workflow
pinned to the NodeKit repo.
