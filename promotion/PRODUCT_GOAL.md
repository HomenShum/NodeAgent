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

Baseline measured 2026-08-13 against commit `837f67b`, on a clone with
`npm install` (399 packages, exit 0) and `npm run dev` on
`http://localhost:5173`. Browser evidence was captured with the repo's own
Playwright (`promotion/evidence/`).

| # | Condition | Status | Evidence / reason |
|---|-----------|--------|-------------------|
| 1 | Journeys succeed end-to-end in a real browser | FAIL | J1, J3, J4, J5 succeed at 1440x900 (`evidence/desktop-1440-run.png`, memo "Acme — diligence memo", rail 12 entities / 26 edges). J2 (same journey on a phone) never renders a single tool card — see D1. |
| 2 | No critical or major usability defect open | FAIL | D1 is critical: the whole app blanks at every width ≤960px the moment the agent's first step runs. D2 (graph labels overlap and clip) is minor and also open. |
| 3 | Mobile and desktop both intentional | FAIL | Desktop is deliberate. Mobile is not: `@media (max-width: 960px)` in `src/app/styles.css` hides the session-graph rail outright with no small-screen substitute, and hiding it is what triggers D1 — `evidence/mobile-375-run.png` is a black rectangle. |
| 4 | No horizontal overflow at supported widths | PASS | Measured `documentElement.scrollWidth === clientWidth` at 375, 768 and 1440 on the React app and at 375 and 1440 on `/nodeagent-v1.html`, including the fully populated 1440 state and the populated 375 prototype (`evidence/baseline-observations.json`, `evidence/proto-375-run.png`). The populated *mobile React* layout could not be measured — D1 destroys it first. |
| 5 | Loading/empty/success/error/agent-running designed | FAIL | Empty ("Ask the room" with two suggestion chips), agent-running (`.na-tool[data-running="true"]`, captured in `evidence/desktop-1440-agent-running.png`) and success (four completed tool cards) are all deliberate and observed. There is no error state at all: `nodeAgentChatAdapter.run` contains no `catch`, no component boundary exists, and the one real error produced a blank page plus React's own console warning "Consider adding an error boundary to your tree". |
| 6 | Keyboard and basic accessibility pass | UNVERIFIED | Keyboard-only journey verified at 1440: six Tab presses reach the composer, typed keystrokes and Enter run the full loop to the memo, focus rings are `2px solid` on links/chips and a border-colour change on the composer (`evidence/desktop-1440-keyboard-run.png`). No accessibility audit (axe / screen-reader / contrast) was run, and keyboard use at ≤960px cannot be checked while D1 stands. |
| 7 | Web Interface Guidelines: no major unresolved | UNVERIFIED | No WIG review was run in this wave. |
| 8 | Web-quality audit: no major unresolved | UNVERIFIED | No Lighthouse / Core Web Vitals audit was run; the tool is not installed here and installing it was out of scope for a baseline. |
| 9 | No unexplained console errors or failed requests | FAIL | At ≤960px, two uncaught page errors per run: "Sigma: Container has no width." At 1440 there are zero page errors, zero 4xx/5xx and zero failed requests — only WebGL driver performance notices from the graph canvas (`evidence/baseline-observations.json`). |
| 10 | Performance does not obstruct interaction | PASS | Composer-Enter to fourth completed tool card: 2653 ms at 1440x900, with each step rendering as it lands rather than at the end (`evidence/baseline-observations.json`, `loopMs`). Scope: desktop only; ≤960px crashes before any interaction can be timed. The build warns the JS bundle is 655 kB (186 kB gzipped) — noted, not observed to obstruct. |
| 11 | Tests and build green | PASS | `npm test` → 7 files / 41 tests passed, exit 0. `npm run build` (`tsc --noEmit && vite build`) → exit 0. `node demo/runNodeAgentDemo.mjs` → "overall status: OK", exit 0. `npm run doctor` → "Doctor passed.", exit 0. `node e2e/capture-live-graph-rail.mjs` → "PASS live graph rail: 12 entities, 26 edges", exit 0. |
| 12 | Verified in the rendered app, not inferred from code | UNVERIFIED | This is a baseline wave: nothing was improved, so there is no improvement to have verified. Every observation above was made in the rendered app or from a command's real exit code, but that is not what this condition scores. |

**Status: NOT PROMOTED** — 3/12 PASS.
