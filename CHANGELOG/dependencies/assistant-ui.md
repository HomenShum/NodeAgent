# assistant-ui

## 2026-10-14 — before the framework migration

An analyst needs to stop a response without losing completed work, then choose
when to retry. A developer generating the no-key chat starter needs the same
behavior. Both apps currently declare `@assistant-ui/react` `^0.14.14` and lock
React integration 0.14.14, core 0.2.10 and store 0.2.13. Their Retry guards use
the callable `aui.thread()` scope accessor.

The [0.15 migration guide](https://www.assistant-ui.com/docs/migrations/v0-15)
replaces that accessor with `aui.thread`. This bounded migration updates both
dependency graphs and both guards while retaining cancellation, completed
history and explicit recovery. The selected release is
[@assistant-ui/react 0.15.28](https://registry.npmjs.org/@assistant-ui/react/0.15.28).

Before editing, the frozen base `ab31d8958063e4f6d4a4012dab3ff23153f3843f`
passed a clean root install, all 117 tests, typecheck and build. An actually
generated starter passed its clean install, demo, all 65 runtime smoke
scenarios and build. Baseline dist files were archived and compared byte for
byte for the separate Chrome proof. Private raw logs and SHA-256 manifests
are held under the campaign evidence directory `nodeagent-assistant-ui`.

## 2026-10-14 — migrated candidate and observed tradeoff

Both manifests now declare `@assistant-ui/react` `^0.15.28`. Ordinary npm lock
generation resolves React integration 0.15.28, core **0.3.28** and store 0.3.20
in both apps. React and ReactDOM remain 19.2.7, and all other direct ranges and
existing overrides are unchanged. The two Retry guards now read `aui.thread`;
their status, duplicate-submission and focus behavior is unchanged. No tests,
CSS, layout, media or provider/model routes changed.

The root lock adds one package record, removes 114 and changes 79; the template
adds one, removes 117 and changes 78 (changed counts include the lock root).
The graph includes assistant-ui's newer core/store/tap/cloud/stream packages,
Radix 1.8.1 and removal of duplicate nested Radix packages, plus npm's ordinary
re-resolution of compatible transitive ranges. These are not all exact minimum
versions. The complete before/after records are in `dependency-graph-delta.json`.
No integrity fields were hand-edited, no peer bypass or forced audit fix was
used, and no new direct dependency or override was added.

Node 22.22.2/npm 10.9.7 passed both clean installs. All 230 root and 52 template
lock entries declaring a Node engine accept this Node version. The installed
React/ReactDOM versions satisfy assistant-ui's `^18 || ^19` peers, and both
complete `npm ls --all --json` checks passed. Other Node versions were not run.

Observed candidate verification, with raw command metadata and logs retained:

- The same 117 root scenarios passed, with identical names/statuses and zero
  failed, skipped or todo cases. Four cases instantiate the installed
  `LocalThreadRuntimeCore` and check retained tool results at cancellation
  boundaries. No SDK test changes were necessary.
- Root typecheck/build, frame/durable/SQLite smoke, three tours/36 steps and
  example guidance passed. `npm pack` built the library and produced a local
  tarball successfully; nothing was published.
- The actual generator's automatic scaffold check passed all 17 required files.
  A separate fresh starter passed clean `npm ci`, dependency inspection, demo,
  all 65 runtime scenarios and build.
- Fresh root production and full audits, and the starter full audit, each
  reported zero vulnerabilities.
- Existing vendor sourcemap and root large-chunk warnings remain. The larger
  starter now also emits a large-chunk warning.

The framework adds a material download cost, so functional success alone is
insufficient for publication readiness:

| Built JavaScript | Before bytes | After bytes | Before gzip bytes | After gzip bytes |
| --- | ---: | ---: | ---: | ---: |
| Root | 664,993 | 923,713 | 189,429 | 269,094 |
| Generated starter | 422,247 | 669,977 | 123,034 | 198,798 |

The table uses exact file sizes and the same Node `gzipSync` settings for both
artifacts. Vite 8's starter build reports 124.35/201.04 kB compressed with its
own reporting settings. Both apps' CSS assets are byte-identical before/after.
Source-map attribution estimates that core contributes about 164k of the added
generated characters, followed by the React layer (29k), cloud (25k), stream
(16k), tap (12k) and store (11k). This is approximate emitted-character
attribution, not independently additive gzip sizes.

The installed React package exposes only its root entry and declares
`sideEffects: false`. Its `useLocalRuntime` re-exports the implementation from
`@assistant-ui/core/react`, which itself references cloud-adapter and remote
thread-list hooks; the runtime also includes voice, dictation and queue support.
Read-only inspection found no supported narrower import that retains the same
runtime behavior. No alternate implementation or optimization was attempted.
See private `bundle-analysis.json` and `bundle-import-seams.json` for the exact
artifacts and source excerpts.

Publication readiness is **pending the performance tradeoff**, separate rendered
Chrome proof and independent review. This candidate does not establish improved
model quality, faster interaction or production deployment. Live-provider
probes, local prepush/check, provider calls, publishing and deployment were
intentionally excluded; canonical campaign registration remains on its existing
policy hold.

## 2026-10-14 — compatibility correction and draft-only decision

A developer selecting the starter's previously advertised Node 20 runtime would
now receive an unsupported dependency graph: core 0.3.28 and assistant-stream
0.3.51 require nanoid 6.0.2, whose Node branches are `^22 || ^24 || >=26`.
The earlier current-host check passed on Node 22.22.2 but did not establish the
full advertised engine contract. The owned manifests now state the intersection
of all installed dependency engine ranges:

| Surface | Supported Node branches |
| --- | --- |
| Root checkout/package | `^22.19.0 || ^24.0.0 || ^26.0.0` |
| Generated chat starter | `^22.12.0 || ^24.0.0 || >=26.0.0` |

This is a compatibility break for Node 20, 23 and 25. The root's existing
better-sqlite3 range also excludes Node 27+, so the root deliberately does not
advertise the starter's open-ended 26+ branch. The starter README now gives
the exact branches. The reserved root README retains its existing Node 22.19
minimum prose; precision about the supported branch matrix is a follow-up after
the separate model-refresh work, not an expansion of this change.

Ordinary npm regeneration changed only each lock's root engine declaration;
assertions confirmed every other lock record and manifest field stayed identical
to the pre-correction candidate. Neither existing smoke script had an engine
assertion to update, so no product tests changed. Full-range `semver.subset`
checks passed against all 229 root and 51 starter dependency engine declarations,
with 17 explicit boundary versions including rejection of Node 20/23/25 and
root Node 27. These are declared-compatibility checks; actual runtime execution
remains limited to Node 22.22.2.

After the metadata repair, the actual generator check, separate starter's 65
scenarios, both dependency-tree checks and both builds passed again. The
previous 117 root scenarios and clean audits remain evidence for the unchanged
installed package graph. The rebuilds retain the same JavaScript/CSS assets.

**Decision: preserve the current released 0.14 line and keep this 0.15.28
migration as a reviewable draft. Do not merge it on version freshness alone.**
The measured static bundle regression has no demonstrated compensating latency
or reliability improvement on this application's workload. Performance
acceptance or upstream modularity remains outstanding. Separate Chrome proof,
exact-tree binding and independent review remain the parent's responsibility;
none of these checks establishes deployment, improved performance or model quality.
