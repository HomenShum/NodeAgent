# Product goal — NodeAgent

## Who opens this, and what they are trying to finish

A founder has an investor call in forty minutes. Overnight, a competitor
published a teardown claiming her product's wedge does not hold, and her finance
lead mentioned in passing that monthly burn crept up after two senior hires. The
answer she needs is scattered across a chat room, a benchmark document she
pasted last week, and a spreadsheet whose runway number is now stale. Doing this
by hand means reading the room, hunting for the one document that actually
settles the question, editing a cell, and then writing the whole thing up — and
the part that costs her the call is not the work, it is being unable to say
where each number came from. She opens NodeAgent, types the question in plain
words, and watches four steps happen in front of her: the relevant messages and
documents are pulled out of the room, the sources are ranked so the winning one
is visible, the spreadsheet cell is corrected and its version bumped, and a memo
is written that quotes the claim next to the source it rests on. She leaves
holding a memo she can read aloud, a spreadsheet at a new version, and a picture
of which source fed which conclusion. In the product's own vocabulary that is
one agent loop rendering as four inline tool cards in a chat, with a live
session graph beside it; the whole demo runs with no keys and no account, over a
fixed scenario, so a stranger can reach the finished memo within a minute of
cloning. **NodeAgent answers a messy question from a shared room and hands back
a cited memo, an updated model, and a visible trail of where each part came
from.**

## The gate

This repo is judged by the twelve-condition PROMOTION gate, which lives in one
place and is not restated here:

**https://github.com/HomenShum/NodeKit/blob/main/templates/promotion/GATE.md**

Gate variant: `full`

Scoring vocabulary is PASS / FAIL / **UNVERIFIED**, and UNVERIFIED is never PASS.

## Canonical journeys

The work queue lives in [PRODUCT_JOURNEYS.md](PRODUCT_JOURNEYS.md). A journey
without browser evidence is unfinished, however green the tests are.

## Loop state

Every iteration is recorded in [PROMOTION_LOG.md](PROMOTION_LOG.md) — journey
exercised, defect fixed, evidence path, conditions newly passing. Loop state
lives in git, never in an agent's memory, so any agent can resume the loop cold.

## Current scorecard

Baseline measured 2026-08-13 against commit `837f67b`. Updated by **Iteration 1**
(2026-08-13, D1 fixed), on a clone with `npm install` (399 packages, exit 0) and
the real Vite dev server on `http://localhost:4306`. Browser evidence was
captured with the repo's own Playwright (`promotion/evidence/`), by
`e2e/capture-journey-at-width.mjs` — committed and re-runnable from a fresh
clone.

| # | Condition | Status | Evidence / reason |
|---|-----------|--------|-------------------|
| 1 | Journeys succeed end-to-end in a real browser | PASS | All five drive to their artifact. J1 + J3 at 1440x900 (`evidence/journey-1440-run.png`: four tool cards, memo "Acme — diligence memo", rail 12 entities / 26 edges with the evidence(5) / traversal(21) legend). J2 at 375x812, 768x1024 and 960x900 (`evidence/journey-{375,768,960}-run.png`) — fixed in Iteration 1. J5 at 375x812 over two turns (`evidence/journey-375-steering-run.png`: 8 tool cards, second memo quotes "Ignore Acme — just tell me the runway after the two senior hires.", rail grows 12 → 13 entities). J4 re-run this wave on the CLI half (`npm run demo` → "overall status: OK", exit 0); its browser half keeps the baseline capture (`evidence/proto-375-run.png`, `proto-1440-load.png`) because `nodeagent-v1.html` carries its own inline `<style>` and does not import `src/app/styles.css`, so Iteration 1 provably could not affect it. |
| 2 | No critical or major usability defect open | FAIL | D1 (critical) is fixed and re-proved. **D3 remains open and is Major**: no stop, cancel or retry affordance exists while the agent runs — at 1440 with `.na-tool[data-running="true"]` present, the page has exactly one `<button>`, `Send`, and it is disabled. D2 (graph labels overlap and clip) is minor and also open. |
| 3 | Mobile and desktop both intentional | PASS | Both are now decisions rather than one being the absence of one. Desktop keeps the 360px side rail (`evidence/journey-1440-run.png`, rail width 360px). Below 960px the rail is no longer deleted — `.na-main` becomes a column and the rail becomes a full-width bottom panel capped at `46vh` with its own scroll and a sticky header (`evidence/journey-375-run.png`, rail width 375px, graph canvas 323px). Named ceiling: the graph keeps its intrinsic 440px height and scrolls inside the panel rather than being re-sized per viewport, because re-sizing it needs the 960px breakpoint restated in JS — and two owners of that breakpoint is exactly what caused D1. |
| 4 | No horizontal overflow at supported widths | PASS | `documentElement.scrollWidth === clientWidth` at 375, 768, 960 and 1440, each measured on the **fully populated** post-run state (`evidence/journey-*-observations.json`), plus 375 and 1440 on `/nodeagent-v1.html` from the baseline. The baseline caveat "the populated mobile React layout could not be measured" is now retired: it was measured, at three widths. |
| 5 | Loading/empty/success/error/agent-running designed | FAIL | Empty ("Ask the room" with two suggestion chips), agent-running (`.na-tool[data-running="true"]`, `evidence/desktop-1440-agent-running.png`) and success (four completed tool cards) are all deliberate and observed. There is still no error state: `nodeAgentChatAdapter.run` contains no `catch` and no component error boundary exists. Iteration 1 removed the one *observed* crash; it did not design an error state, so this stays FAIL rather than being quietly upgraded. |
| 6 | Keyboard and basic accessibility pass | UNVERIFIED | Keyboard-only journey verified at 1440: six Tab presses reach the composer, typed keystrokes and Enter run the full loop to the memo, focus rings are `2px solid` on links/chips and a border-colour change on the composer (`evidence/desktop-1440-keyboard-run.png`). No accessibility audit (axe / screen-reader / contrast) has been run, and keyboard use at ≤960px — now reachable since D1 is fixed — has still not been driven. |
| 7 | Web Interface Guidelines: no major unresolved | UNVERIFIED | No WIG review has been run. |
| 8 | Web-quality audit: no major unresolved | UNVERIFIED | No Lighthouse / Core Web Vitals audit has been run; the tool is not installed here. |
| 9 | No unexplained console errors or failed requests | PASS | Zero uncaught page errors, zero own-origin console errors and zero own-origin failed requests at 375, 768, 960 and 1440, each over a full populated run (`evidence/journey-*-observations.json`: `pageErrors`, `consoleErrors`, `failedRequests` all `[]`). The two `Sigma: Container has no width.` errors that made this FAIL are gone at the root. One explained third-party condition remains, recorded separately in `thirdPartyFailures`: `index.html:11` fetches Manrope from `fonts.googleapis.com`, which 404s on a restricted network (2 of 5 runs here) and falls back to `system-ui`. The gate records it and does not fail on it. |
| 10 | Performance does not obstruct interaction | PASS | Composer-Enter to the completed memo, measured per width (`loopMs`): 2653 ms at 375, 2723 ms at 768, 2628 ms at 960, 2616 ms at 1440 — each step renders as it lands rather than at the end. The baseline's "desktop only; ≤960px crashes before any interaction can be timed" scope is retired. The build warns the JS bundle is 655 kB (186 kB gzipped) — noted, not observed to obstruct. |
| 11 | Tests and build green | PASS | Re-run in Iteration 1: `npm test` → 7 files / 41 tests passed, exit 0. `npm run build` (`tsc --noEmit && vite build`) → exit 0. `npm run demo` (the real modules via tsx) → "overall status: OK", exit 0. The zero-deps mirror that used to be cited here was deleted in Wave 3: it printed "OK" unconditionally — see docs/SIMPLIFICATION_REPORT.md. `npm run doctor` → "Doctor passed.", exit 0. `node e2e/capture-live-graph-rail.mjs` → "PASS live graph rail: 12 entities, 26 edges", exit 0. |
| 12 | Verified in the rendered app, not inferred from code | PASS | Iteration 1's fix was proved by driving the real app, not by reading the diff. The identical committed producer `e2e/capture-journey-at-width.mjs` exits **1** on the pre-fix tree (two Sigma page errors, `#root` empty, no memo — `evidence/journey-prefix-375-run.png` is the black rectangle) and **0** on the fixed tree (`evidence/journey-375-run.png`). Both halves of the gate's evidence rule are met: the outputs are committed under `promotion/evidence/`, and the script that regenerates them is committed and runnable as `npm run e2e:journey:mobile`. |

**Status: NOT PROMOTED** — 7/12 PASS (was 3/12 at baseline; conditions 1, 3, 9
and 12 newly PASS in Iteration 1). Conditions 2 and 5 are the remaining FAILs,
both blocked on the same gap: D3, the absent stop/retry and error surface.
