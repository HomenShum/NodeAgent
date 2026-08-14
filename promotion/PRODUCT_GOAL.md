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
(2026-08-13, D1 fixed) and **Iteration 2** (2026-08-13, the audits: conditions
6, 7, 8), on a fresh clone with `npm install` (400 packages, exit 0), the real
Vite dev server on `http://localhost:4904` and the production build under `vite
preview` on the same port. Browser evidence was captured with the repo's own
Playwright (`promotion/evidence/`) by `e2e/capture-journey-at-width.mjs`,
`e2e/wig-review.mjs` and `e2e/audit-web-quality.mjs` — all committed and
re-runnable from a fresh clone via `npm run e2e:journey`, `npm run wig:review`
and `npm run audit:web-quality`.

| # | Condition | Status | Evidence / reason |
|---|-----------|--------|-------------------|
| 1 | Journeys succeed end-to-end in a real browser | PASS | All five drive to their artifact. J1 + J3 at 1440x900 (`evidence/journey-1440-run.png`: four tool cards, memo "Acme — diligence memo", rail 12 entities / 26 edges with the evidence(5) / traversal(21) legend). J2 at 375x812, 768x1024 and 960x900 (`evidence/journey-{375,768,960}-run.png`) — fixed in Iteration 1. J5 at 375x812 over two turns (`evidence/journey-375-steering-run.png`: 8 tool cards, second memo quotes "Ignore Acme — just tell me the runway after the two senior hires.", rail grows 12 → 13 entities). J4 re-run this wave on the CLI half (`npm run demo` → "overall status: OK", exit 0); its browser half keeps the baseline capture (`evidence/proto-375-run.png`, `proto-1440-load.png`) because `nodeagent-v1.html` carries its own inline `<style>` and does not import `src/app/styles.css`, so Iteration 1 provably could not affect it. |
| 2 | No critical or major usability defect open | FAIL | D1 (critical) is fixed and re-proved. **D3 remains open and is Major**: no stop, cancel or retry affordance exists while the agent runs — at 1440 with `.na-tool[data-running="true"]` present, the page has exactly one `<button>`, `Send`, and it is disabled. D2 (graph labels overlap and clip) is minor and also open. |
| 3 | Mobile and desktop both intentional | PASS | Both are now decisions rather than one being the absence of one. Desktop keeps the 360px side rail (`evidence/journey-1440-run.png`, rail width 360px). Below 960px the rail is no longer deleted — `.na-main` becomes a column and the rail becomes a full-width bottom panel capped at `46vh` with its own scroll and a sticky header (`evidence/journey-375-run.png`, rail width 375px, graph canvas 323px). Named ceiling: the graph keeps its intrinsic 440px height and scrolls inside the panel rather than being re-sized per viewport, because re-sizing it needs the 960px breakpoint restated in JS — and two owners of that breakpoint is exactly what caused D1. |
| 4 | No horizontal overflow at supported widths | PASS | `documentElement.scrollWidth === clientWidth` at 375, 768, 960 and 1440, each measured on the **fully populated** post-run state (`evidence/journey-*-observations.json`), plus 375 and 1440 on `/nodeagent-v1.html` from the baseline. The baseline caveat "the populated mobile React layout could not be measured" is now retired: it was measured, at three widths. |
| 5 | Loading/empty/success/error/agent-running designed | FAIL | Empty ("Ask the room" with two suggestion chips), agent-running (`.na-tool[data-running="true"]`, `evidence/desktop-1440-agent-running.png`) and success (four completed tool cards) are all deliberate and observed. There is still no error state: `nodeAgentChatAdapter.run` contains no `catch` and no component error boundary exists. Iteration 1 removed the one *observed* crash; it did not design an error state, so this stays FAIL rather than being quietly upgraded. |
| 6 | Keyboard and basic accessibility pass | PASS | Both halves now measured, and both gaps the baseline named are closed. **Keyboard at ≤960px**, the untested one: `npm run e2e:journey:keyboard` drives 375x812 with Tab and typed keys only — never `page.fill` — and the composer is focused after **0** Tab presses (`autoFocus`), takes real keystrokes, and Enter runs the full loop to the memo (4 tool cards, 2567 ms, `evidence/journey-keyboard-375-observations.json`, `journey-keyboard-375-run.png`). The focus indicator is recorded as measured, not assumed: `outline: none` on the textarea with `border-color: rgb(217, 119, 87)` on the `.na-composer` wrapper, which is where `:focus-within` draws it. **Accessibility audit**, the missing one: axe-core 4.13.0 reports **0 violations** on the first paint (`evidence/axe-initial.json`) and **0** on the populated DOM at both 375 and 1440 (`evidence/axe-populated-{keyboard-375,axe-1440}.json`), and Lighthouse 13.4.1 scores accessibility **1.00** on mobile and desktop. Before this wave the same tools reported 1 serious violation at first paint and **8** once the loop had run — see condition 7 and the ledger. |
| 7 | Web Interface Guidelines: no major unresolved | PASS | Reviewed against the live checklist at https://vercel.com/design/guidelines (reachable; fetched 2026-08-13), item by item, on the rendered app at 1440x900 and 375x812. Three **major** findings, each with the guideline and the DOM measurement, all fixed and re-proved: **W1** composer `font-size: 14px` → iOS Safari auto-zoom on the journey's only control; **W2** seven controls under the 44px mobile hit target (`.na-link` 66x19, `.na-send` 34x34, the vendored NodeGraph `fit` button 28x21, its filter labels 93x19/133x19); **W3** no `<h1>` and heading order `[4,3]`. Five minor findings: four fixed (`color-scheme`, `theme-color`, tabular numbers, `touch-action`), one open with its reason (no skip link — the composer is `autoFocus`, so a keyboard user starts past the nav at 0 Tab presses). Full review: [WIG_REVIEW.md](WIG_REVIEW.md). Producer `npm run wig:review` → `evidence/wig-review.json` + `wig-{desktop-1440,mobile-375}.png`; before-state from the identical script on the stashed tree is `evidence/wig-review-prefix.json` (result FAIL, the three majors). **This is a review, not a Lighthouse score**: Lighthouse scored 0.95 accessibility / 1.0 best-practices on the tree where all three majors were true, and does not measure any of them. |
| 8 | Web-quality audit: no major unresolved | PASS | Both named tools run against the **production build** (`vite preview`, not the dev server), by the committed producer `npm run audit:web-quality` → `evidence/web-quality-audit.json`. `npx --yes lighthouse@13.4.1` — mobile: performance 0.86, **accessibility 1.00**, best-practices 1.00, SEO 0.91, CLS **0**, LCP 3145 ms, TBT 139 ms; desktop: performance 0.99, accessibility 1.00, best-practices 1.00, CLS 0.003, LCP 755 ms, TBT 0 ms. Full reports committed: `evidence/lighthouse-{mobile,desktop}.json`. `npx --yes @axe-core/cli@4.13.0` — **0 violations**, 32 rules passed (`evidence/axe-initial.json`). Before this wave: accessibility 0.95 and a serious `color-contrast` violation, `evidence/{web-quality-audit,axe-initial}-prefix.json`. Minor findings left open, recorded not hidden (D4): mobile LCP 3.1 s sits in the "needs improvement" band under Lighthouse's throttling, charged to the 655 kB bundle and the render-blocking `fonts.googleapis.com` stylesheet (876 ms); `robots-txt` fails because the SPA fallback answers `/robots.txt` with `index.html`. Neither is major and neither obstructs interaction — see condition 10. |
| 9 | No unexplained console errors or failed requests | PASS | Zero uncaught page errors, zero own-origin console errors and zero own-origin failed requests at 375, 768, 960 and 1440, each over a full populated run (`evidence/journey-*-observations.json`: `pageErrors`, `consoleErrors`, `failedRequests` all `[]`). The two `Sigma: Container has no width.` errors that made this FAIL are gone at the root. One explained third-party condition remains, recorded separately in `thirdPartyFailures`: `index.html:11` fetches Manrope from `fonts.googleapis.com`, which 404s on a restricted network (2 of 5 runs here) and falls back to `system-ui`. The gate records it and does not fail on it. |
| 10 | Performance does not obstruct interaction | PASS | Composer-Enter to the completed memo, re-measured this wave per width (`loopMs`): 2578 ms at 375, 2693 ms at 768, 2673 ms at 960, 2666 ms at 1440 — each step renders as it lands rather than at the end. Corroborated by Lighthouse on the production build (`evidence/lighthouse-{mobile,desktop}.json`): **CLS 0** on mobile / 0.003 desktop, TBT 139 ms / 0 ms, desktop LCP 755 ms. Throttled-mobile LCP is 3145 ms, which is the load, not the interaction — a real user's first tap is answered in 2.6 s of agent work either way. The 655 kB bundle (186 kB gzipped) and the render-blocking web font are logged as D4, not as an obstruction. |
| 11 | Tests and build green | PASS | Re-run in Iteration 1: `npm test` → 7 files / 41 tests passed, exit 0. `npm run build` (`tsc --noEmit && vite build`) → exit 0. `npm run demo` (the real modules via tsx) → "overall status: OK", exit 0. The zero-deps mirror that used to be cited here was deleted in Wave 3: it printed "OK" unconditionally — see docs/SIMPLIFICATION_REPORT.md. `npm run doctor` → "Doctor passed.", exit 0. `node e2e/capture-live-graph-rail.mjs` → "PASS live graph rail: 12 entities, 26 edges", exit 0. |
| 12 | Verified in the rendered app, not inferred from code | PASS | Iteration 1's fix was proved by driving the real app, not by reading the diff. The identical committed producer `e2e/capture-journey-at-width.mjs` exits **1** on the pre-fix tree (two Sigma page errors, `#root` empty, no memo — `evidence/journey-prefix-375-run.png` is the black rectangle) and **0** on the fixed tree (`evidence/journey-375-run.png`). Both halves of the gate's evidence rule are met: the outputs are committed under `promotion/evidence/`, and the script that regenerates them is committed and runnable as `npm run e2e:journey:mobile`. |

**Status: NOT PROMOTED** — 10/12 PASS (3/12 at baseline; 1, 3, 9, 12 in
Iteration 1; **6, 7 and 8 in Iteration 2**). No condition is UNVERIFIED any
more. Conditions 2 and 5 are the only remaining FAILs, and both are blocked on
the same single gap: **D3** — no stop, cancel or retry affordance while the
agent runs, and no designed error state. Nothing else stands between this repo
and PROMOTED.
