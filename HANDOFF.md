# NodeAgent developer handoff

## Current runtime salvage on main 6112cabe

This candidate selectively integrates the preserved runtime/event/Pi seam onto current main `6112cabe1f56a6279890206e35d03b9e339c02f5`. It retains the current chat, graph, scripts, templates, tours and security overrides. The original primary draft and branch are preserved separately. Read [the packed runtime instructions](README.md#packed-runtime-and-optional-pi-adapter) for the current scoped package name, CLI template paths, optional peer and completion/error/cost contract.

Use Node 22.19 or newer, `npm ci`, `npm run check`, then `npm pack`. The normal check retains its existing missing-credential skips for Convex/live-provider paths; a skipped provider check is not provider proof. Its generated JSON receipts belong to the run that wrote them. Historical checked-in smoke receipts and the evidence packets below retain their original source identities. Fresh run logs, exact source bindings, packed-consumer results and failed attempts are retained separately for independent review.

The adapter's original fulfilled-result assumption confused terminal SDK failure with successful completion. Its new public contract accepts only natural completion without tools as `done`. Real SDK 0.80.10 event streams now cover failure, abort, truncation, callback failure and bounded concurrent/repeated requests using injected local ports. Runtime and adapter entrypoints are ESM with declarations. The optional SDK is not loaded by the root/runtime import. The package allowlist includes both existing CLI templates and the chat template lock; no npm publication is performed by this work.

The actual 2026-09-07 local proof passed the normal check once: 57 tests across nine files, typecheck, library/UI builds, frame/durable/SQLite, both scaffold smokes, three tours/36 steps/11 citations and a zero-finding production audit. The full development install still reported nine advisories (three moderate, five high, one critical). Convex was not configured, live-provider work skipped, and the official Omnigent CLI was absent; the separate npm `omniagent` probe passed.

The actual tarball has 37 exact source/build members, including all 15 chat and 11 dashboard template files, the chat lock and npm's three automatically included ancestor READMEs. Its SHA-256 is `02c71cb9bb0389f4b74cae22749da3335560873c22bee46e116b3c285343849f`. The final tarball is a documentation-only successor, SHA-256 `3c0b306137e2f5e4cade8619305186837013c9d2eafa40dceb6d8d0a70b6eea0`: only its README install instructions changed (chat `npm ci`, dashboard first `npm install`). Its other 36 members are byte-exact to the executed consumer tarball; that executable proof is carried forward, and the final README is separately reviewed. Both fresh installs reported zero audit findings. One installed consumer verified root/runtime imports with the optional peer absent, a typed missing-peer error, doctor and both exact scaffold copies. A separate exact-Pi consumer exercised ten concurrent and ten repeated completion/tool/truncation/error/abort outcomes using the actual built adapter and SDK stream primitive. Source scenarios also covered caller abort and rejected text callbacks. These are local fixture outcomes, with zero provider requests, not provider or production-load proof.

This slice does not change the UI's response-recovery semantics or assess its pixels again. Existing graph/readability/accessibility, development-advisory, human, provider and deployment limits below remain. A passed local source or packed-consumer check cannot establish production readiness or a full grade.

---

# Historical consumer and UI handoff

Read this file first, then [the runtime walkthrough](docs/START_HERE.md). The current consumer/recovery repair merged in PR4 at canonical `5362505`; the source-header follow-on below starts from that exact revision. At that historical checkpoint, the separately preserved Pi draft was not integrated. Independent source and installed-consumer review passes for the bounded slice below. The [portable judgment](evidence/current-consumer-20260905/judge/E6e_NODEAGENT_CURRENT_CONSUMER_FINAL_JUDGE.md.txt), manifest and Git history identify the reviewed implementation and its later publication metadata.

A developer can run the repository's local scenario and generate a separate chat application without credentials. Both chats use scripted local adapters; displayed confidence numbers come from fixtures. Their browser conversations reset on reload. The library's durable/SQLite demonstration is a separate integration and does not persist either browser chat.

Use Node 22; this proof used Node 22.22.2. From this repository run `npm ci`, `npm test`, `npm run build` and `npm run tours:validate`. The 41 tests, typecheck/build, three tours/36 steps and 11 walkthrough citations pass. To generate a consumer, run `npm pack`, install that exact tarball in a new empty npm project, then use its installed CLI:

```powershell
node node_modules/nodeagent/bin/nodeagent.mjs doctor
node node_modules/nodeagent/bin/nodeagent.mjs apps scaffold chat-ui --dir "../NodeAgent Chat" --auto
Set-Location "../NodeAgent Chat"
npm run dev
```

`--auto` performs normal install, demo, smoke and build. Keep the included template lock; use `npm ci` for repeatable reinstall. Existing-target refusal was verified with an owner sentinel and without force. Each failed and repaired consumer was retained separately.

The original unlocked template resolved incompatible assistant-ui dependencies and failed its first real prompt despite smoke/build passing. A tested compatible template lock fixes that install seam without changing dependency ranges. The final packed consumer binds 242 source/tarball/installed files and the exact generated lock. Its tarball SHA-256 is `1a6e980a684f433fcdc80021eb5569fa5c4b94e09a71e8a2adbe5d821e654c69`. That package predates this final handoff/evidence metadata; it is an uncommitted candidate proof, not a published release certificate.

Both current chats expose **Stop response**, visible incomplete/failed tool status, and explicit **Retry response**. Stop ends response display updates and keeps completed work. It cannot undo work already computed by the adapter, graph facts already recorded, durable work or external actions. Retry re-executes only the current response through the native runtime and preserves earlier turns. It is never automatic. A synchronous claim on the current response ID rejects immediate double activation; actual SDK IDs were observed to change on each retry, so a second failed response remains retryable. This is a local UI guarantee, not external-service idempotency or provider cancellation.

[Portable evidence](evidence/current-consumer-20260905/README.md) contains the actual before boundaries, failure history, command logs, source bindings and final browser reports. The response-recovery run passed 289 checks and saved 76 captures across 320/390/768/1024/1440/1920 for both source and installed generated apps. It covers ordinary pointer/keyboard Stop, stable incomplete output, preserved earlier cards/graph snapshot, failure then explicit retry then failure again then explicit recovery, duplicate activation, pointer target stability, keyboard-visible error/Retry at enlarged text, and reload reset. An additional 12 turns produced 15 responses/60 cards in 21.182 seconds generated and 29.482 seconds source. These are bounded accumulation checks, not production longevity measurements.

The unchanged first-run scenario separately passed 59 checks/25 captures on the final installed app, including eight sequential turns/32 cards in 13.968 seconds. Reproduce the two browser journeys from the source checkout with a fresh installed generated target and NEW output directories:

```powershell
node e2e/current-consumer-proof.mjs "<generated app>" "<new baseline evidence>"
node e2e/current-consumer-recovery-proof.mjs "<generated app>" "<new recovery evidence>"
```

Separate offline frame/durable/SQLite runs completed. SQLite closed/reopened the retained database and replayed the same frame with one journal entry; lease exclusion, expiry recovery and fencing passed. Use `nodeagent:frame:smoke`, `nodeagent:durable:smoke` and `nodeagent:sqlite:smoke` for that separate library integration. Their fixture confidence is not an external provider measurement.

Remaining limits are explicit. The prior source-header overflow is corrected by the separately judged header follow-on below; existing enlarged empty-state clipping and graph readability remain open. The text fixture is not an operating-system zoom certificate. The source graph still needs its own visual/readability assessment. There is no React render-error boundary or New Thread control. Full visual, responsive, accessibility and performance grades remain null. Source full audit has nine development advisories, including one critical; the locked generated app has four development advisories, three high and one low. Both recorded production-only audits have zero findings. Those full-audit findings remain open.

No provider, Convex, login, external-host hook, deployment or Pi capability was activated. The historical dependency checkpoint and previous promotion records retain their original outcomes. This handoff closes the bounded offline consumer and response-recovery implementation for independent review; it does not claim complete repository readiness.


Independent replay adds130 checks/34 captures, including late Stop after an actual completed tool result and two distinct failed-response Retry identities. Fresh41 tests, typecheck and citations pass. The original publication judgment records60 line-ending mismatches; packet-local attributes preserve those exact raw bytes before commit. Graph readability, development advisories, browser reset and provider/durability limits remain unchanged; the later header repair is reviewed separately below. This local source/installed proof does not certify deployment or the whole product.


## Source header reflow follow-on

The two resource links now stay together when enlarged text requires a second row. The header grows with its content; all six normal header layouts remain unchanged. [The portable packet](evidence/header-reflow-20260905/README.md) contains matched before/after pixels, the independent60-check/14-capture review and the old-layout knockout. Root's72 header assertions,145 existing response-recovery assertions/38 captures,41 tests, typecheck/build and citations pass. No generated consumer or runtime adapter changed. The prior44-criterion assessment still binds5362505; this bounded repair does not automatically replace its historical scores or certify complete grades.

Replay the current header with `node e2e/header-reflow-proof.mjs . "<absolute new output directory>" after` after installing the checked-in dependencies and Chromium. The source-bound record and Git history identify this follow-on's eventual commit; no production deployment is claimed.
