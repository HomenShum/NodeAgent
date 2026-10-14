# Test toolchain

## 2026-10-14 — bounded development dependency remediation

A maintainer needs cancellation and recovery checks to remain trustworthy while
removing vulnerable development dependencies. A runner migration can change mock
and timer behavior, so acceptance compares the same named scenarios and unchanged
assertions. This patch preserves all 117 cases while updating the dependency owner.

| Package | Before | After |
| --- | --- | --- |
| vitest | 3.2.6 | exact 4.1.11 |
| @vitest/mocker | 3.2.6 | 4.1.11 |
| tinypool | 1.1.1 | absent |
| brace-expansion | 5.0.9 | 5.0.12, within minimatch's existing `^5.0.5` |
| source-map-js | 1.2.1 | 1.2.2, within PostCSS's existing `^1.2.1` |

Vitest's required transitive changes account for the remaining lock delta. The
offline installation uses cached Chai 6.2.2, std-env 4.2.0 and tinyrainbow 3.1.1,
each within its published parent range; no new direct dependency or override was
added. Runtime dependencies, Vite 6.4.3, configuration, source and tests are unchanged.

Vitest 4.1.11 is the selected patched 4.x release, not the latest major. Its Node
range is `^20.0.0 || ^22.0.0 || >=24.0.0`; local Node 22.22.2/npm 10.9.7 and CI's
Node 22 satisfy it. Node 21/23 are outside that development-tool range. Node 20/24
were not exercised here. See the [4.x migration guide](https://v4.vitest.dev/guide/migration),
[Vitest metadata](https://registry.npmjs.org/vitest/4.1.11),
[brace-expansion metadata](https://registry.npmjs.org/brace-expansion/5.0.12) and
[source-map-js metadata](https://registry.npmjs.org/source-map-js/1.2.2).

Observed validation on the final lock:

- Reproducible offline `npm ci` with install scripts enabled passed, including the
  SQLite native binding. Earlier network/cache failures remain in private evidence.
- Baseline and candidate each passed 117/117 cases in 11 files, with zero failed,
  skipped or todo cases. File, ancestor titles, title, full name and status match
  exactly. Existing assertions include Stop/Retry microtask races, overlapping
  runs, 128 repeated cancellations, degraded results and reopened SQLite state.
- Typecheck, build, all 3 source tours/36 steps, and frame/durable/SQLite smoke
  reports passed. Full `npm ls --all --json` passed.
- The supplied audit recorded five affected packages/seven distinct advisories
  (1 moderate, 2 high, 2 critical package entries). No installed version remains
  in those supplied advisory ranges. A fresh full audit was attempted but failed
  with registry `EACCES`; its current vulnerability count is **unknown**, not zero.
  A successful fresh audit remains required before publication.
- Existing vendor sourcemap, large-chunk and dependency deprecation warnings were
  retained. The separate chat-template lock still contains source-map-js 1.2.1;
  it is outside this root-toolchain patch. No agent-quality gain was measured.

To reproduce with registry access, set `$proofDir` to an existing private evidence
directory outside the checkout, then run from the repository root in PowerShell:

```powershell
npm ci --no-audit --no-fund
npm test -- --reporter=json "--outputFile=$proofDir/full-suite.json"
npm run typecheck
npm run build
npm run tours:validate
node node_modules/tsx/dist/cli.mjs scripts/nodeagent-frame-smoke.ts --json-out "$proofDir/frame.json"
node node_modules/tsx/dist/cli.mjs scripts/nodeagent-durable-smoke.ts --json-out "$proofDir/durable.json"
node node_modules/tsx/dist/cli.mjs scripts/nodeagent-sqlite-smoke.ts --json-out "$proofDir/sqlite.json"
npm ls --all --json
npm audit --include=dev --json
git diff --check
```

Local full prepush, Convex/live-provider smoke, provider calls, publishing and
deployment were intentionally excluded. The parent owns independent review and CI.

### Follow-up verification — 2026-10-14

The coordinating host completed the network-dependent gate above: a fresh full
audit returned zero vulnerabilities, including development dependencies, against
lock SHA-256 `48891fb41b2c880fe5d03b12913f9a706eb563285bc028f380fec7024bfb021d`.
The lock stayed unchanged during that check. All 16 added or updated package
integrities also matched their exact published npm versions. The earlier
restricted-process failure remains recorded; this follow-up resolves its audit
blocker. Independent review and exact-head CI remain separate publication gates.
