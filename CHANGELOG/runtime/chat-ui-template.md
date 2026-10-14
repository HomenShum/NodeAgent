# Generated NodeAgent chat template

## 2026-10-14 — Stop terminates the generated response

A developer using the generated no-key chat can stop a response without later
tool frames or a false completion. Completed partial content stays available;
an explicit retry with a fresh signal completes the original scripted response.

Before: cancellation returned only from a nested tool generator, so the parent
continued. Delays and snapshots did not guard resumed work, and the scaffold
smoke only checked file/source markers. The parent reproduced an already-aborted
run emitting six frames and a false Done against base
`b9b24b2a38f3361b75a1ff65078d56b2feca4eeb`.

After: the existing delay rejects with the caller's cancellation reason and
releases its timer/listener; entry and every snapshot check cancellation. This
uses the accepted main adapter's technique locally, keeping the template
standalone. Its per-run Map remains bounded by four fixed stage IDs. Fixture
scores are explicitly scripted, with no model-quality claim.

`GeneratedChatStopRetry-v1` executes the real adapter through the existing
`npm run smoke` entrypoint while preserving structural checks:

- Original adapter: 2 normal controls pass, 63 cancellation scenarios fail,
  exit 1; raw red evidence was saved before the adapter changed.
- Repaired adapter: all 65 scenarios pass, including all nine pending-delay,
  paused-yield, and resolved-delay microtask boundaries in ordinary and reduced
  motion; pre-aborted runs emit zero frames.
- Retained history, explicit retry, two isolated overlapping runs, four-run
  cancellation bursts, and 128 sustained reduced-motion cancellations across
  all stages with eight successful retries pass. Across the suite, 196
  cancellations are verified, at most four timers coexist, and none remain.
- The complete ten-frame response matches the original SHA-256
  `2d22c784ff41af97ab77cc35bd29e9dfa55bc1eb7736864489d6800061d3acdb`.
- Smoke has a 50-second deadline, bounded frames/output, honest failed receipts,
  and nonzero failure exit. No new framework, dependency, or runtime test knob.

Evidence: the campaign's `evidence/nodeagent-chat-template/` directory retains
original/final source copies, red/green logs and reports, commands, exit codes,
hashes, self-review, and the parent's prior browser evidence. Verification runs
use fresh copied targets, preserving source-generated receipts.

Limitations: this worker proof is adapter/CLI evidence. Fresh generator/build,
same-Chrome Stop/Retry verification, independent review, exact-head CI, and
publication remain with the parent. No UI/styles, models, providers, packages,
credentials, network, commits, or pushes are part of this patch.

**Re your request:** implement the bounded generated-chat cancellation repair —
the standalone template now ends cancelled streams and exercises that contract
in its real smoke path.
