# NodeAgent chat adapter

## 2026-10-14 — stop at the cancellation boundary

An analyst can stop a response after a tool completes without the adapter later
starting another tool or changing the session graph. Earlier completed response
content remains available, and a fresh retry can complete normally.

The adapter previously returned only from an inner step when cancelled; the
outer generator resumed and recorded graph work. Its other delays never checked
cancellation. The existing delay now rejects on abort and releases its timer
and listener. Every frame checks cancellation before emission, and the shared
step checks immediately before its synchronous graph write. The cancellation
reason unwinds the whole run and the installed assistant-ui runtime reports it
as cancelled.
Pre-aborted runs stop before computing or emitting a response.

Validation:

- The original 41 adapter scenarios against source `c6de499` produced 40
  failures and one passing normal-run control. The final suite has 54 scenarios.
- All nine delay boundaries, reduced-motion delays, paused yields, timer-fired
  races before and after the delay resolves, retained history, retry, overlapping
  runs, a 16-run cancellation burst, and 128 sequential cancellations with
  periodic successful retries are covered. Four installed-SDK scenarios verify
  cancelled status, retained tool results, and unchanged graph state together.
- `npm test -- tests/nodeAgentChatAdapter.test.ts tests/nodeAgentRuntime.test.ts
  tests/reasoningFrameRunner.test.ts tests/nodeAgentEventProtocol.test.ts` passes
  67/67 tests. `npm run typecheck` passes.
- The direct pending-delay probe previously added six graph nodes, eleven edges,
  and the next tool frame after Stop. It now rejects with `AbortError`, retains
  the exact graph snapshot, and emits no next-stage frame.

Browser verification and independent review are separate acceptance work. No
provider smoke, native SQLite tests, model changes, or visual changes are part
of this patch. The generated chat template has a similar cancellation pattern
and remains outside this source-adapter patch.

**Re your request:** improve the in-app agent experience — stopping a response
now ends its asynchronous progress instead of allowing late work to appear.

### Browser checkpoint — 2026-10-14

Chrome on the local deterministic demo retained the first completed memo after
Stop on a second request. The stopped graph stayed at 13 entities / 27 edges;
Retry completed and displayed both memos. The browser stop occurred during
search; exact post-tool timing is covered by the direct adapter scenarios.
Observed console warnings/errors came from installed browser extensions.
This is local behavior evidence, not a production deployment claim.

### Independent review correction — attempt 2

The first candidate (`e96872d196ee2b074f5dddda1c7bae836b309e9622def1a69776a6ea9d1bf26b`)
passed the initial suite but still wrote graph state if Stop arrived after the
delay's own continuation and before its caller resumed. The SDK hid the late
frame and reported cancelled, masking the graph change. Adding one microtask
before Stop reproduced 13 failures: all nine adapter waits and all four SDK
post-tool boundaries. Those exact cases now pass. Guarding the actual frame
and graph-write boundaries replaces the insufficient check inside the delay;
graph writes share one guarded step instead of four separate outer branches.
The first candidate's source, tests, and proof logs remain preserved in the
campaign evidence directory. Exact timing is SDK/test evidence, not browser
timing certification.
