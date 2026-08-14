# Promotion log — NodeAgent

Loop state lives here, in git, so any agent can resume cold. One entry per
iteration. Append; never rewrite history, because the list of things that turned
out to be wrong is more useful to the next reader than the current values alone.

Iteration cap: **10** (default). On reaching the cap without a gate pass, stop
and leave the remaining defect ledger below — a documented stop is a valid
outcome; a silent one is not.

## Entry shape

```
### Iteration N — YYYY-MM-DD
- Journey exercised: J<k> <name>
- Observed: <the defect, with its reproduction — inputs, width, state>
- Fixed: <the change, using existing components; file paths>
- Re-proved: <evidence path showing the defect gone in the rendered app>
- Tests: <command and result>
- Conditions newly PASS: <numbers, or "none">
```

---

## Baseline — 2026-08-13

Wave 1. Measurement only: **nothing in the product was changed.** Fresh clone of
`main` at `837f67b`, Windows 11, Node v22.22.2.

- **App started:** yes. `npm install` (399 packages, exit 0), then
  `node node_modules/vite/bin/vite.js --port 5173 --strictPort` — Vite 6.4.3
  ready in 1234 ms, `GET /` → 200.
- **Journeys drivable:** 4 of 5 (J1, J3, J4, J5 pass; J2 fails on D1). The
  recovery journey the template asks for could not be written at all — see the
  bottom of [PRODUCT_JOURNEYS.md](PRODUCT_JOURNEYS.md).
- **Scorecard at baseline:** 3/12 PASS — see [PRODUCT_GOAL.md](PRODUCT_GOAL.md).
- **Not marked DEFERRED** in the wave context note; this repo was run in full.

### Commands run, with real exit codes

| Command | Exit | Note |
|---|---|---|
| `npm install --no-audit --no-fund` | 0 | 399 packages in ~1 min; deprecation warnings only |
| `npm test` (`vitest run`) | 0 | 7 files, 41 tests, all passed, 7.59 s |
| `npm run build` (`tsc --noEmit && vite build`) | 0 | 777 modules; warns bundle 655.19 kB (gzip 186.72 kB) |
| `node demo/runNodeAgentDemo.mjs` | 0 | prints TRACE, sources, v1→v2 delta, memo, "overall status: OK" |
| `npm run doctor` | 0 | "Doctor passed." |
| `node e2e/capture-live-graph-rail.mjs` | 0 | "PASS live graph rail: 12 entities, 26 edges" — the repo's own gate, run at 1440x900 only |
| Playwright drive of `:5173` at 1440x900 | 0 | J1/J3/J5 evidence, `promotion/evidence/` |
| Playwright drive of `:5173` at 375x812 | 0 (script) | journey FAILED in the app — D1 |
| Playwright drive of `/nodeagent-v1.html` at 375 and 1440 | 0 | prototype renders and runs at both widths |

Not run, and therefore UNVERIFIED rather than passed: any Lighthouse / Core Web
Vitals audit, any axe or screen-reader accessibility audit, any Web Interface
Guidelines review. No secrets were configured, so every live path
(`OPENROUTER_API_KEY`, Convex URL) stayed on its deterministic fallback; the
live-provider and Convex smokes were not exercised.

### The one browser observation that mattered

The repo's own capture gate passes, and it runs at 1440x900. Narrowing the
viewport is what found D1 — an argument for the gate script taking a width
parameter in a later wave.

## Defect ledger

Open defects, most-impactful first. A defect is only listed once it has a
reproduction; a hunch is not a defect.

| # | Severity | Journey | Reproduction | Status |
|---|----------|---------|--------------|--------|
| D1 | Critical | J2 | **FIXED in Iteration 1.** Load `http://localhost:5173/` at any viewport width ≤ 960px (verified at 375, 768 and 960; 961, 1024 and 1440 are fine). Type any question, press Enter. The moment the first loop step feeds the session graph, two uncaught `Sigma: Container has no width.` page errors fire, React unmounts the whole tree (`document.getElementById("root").childElementCount === 0`), and the page goes black — no message, no tool card, no way back except reload. Root cause chain: `@media (max-width: 960px) { .na-rail { display: none } }` in `src/app/styles.css:172` gives the rail zero width; `GraphRailPanel.tsx` still mounts `<NodeGraph>` inside it as soon as `snapshot.nodes.length > 0`; Sigma refuses a zero-width container and throws; nothing in the tree is an error boundary, so the throw takes the app with it. React itself says so in console: "An error occurred in the `<NodeGraph>` component. Consider adding an error boundary to your tree." Evidence: `promotion/evidence/mobile-375-run.png`, `promotion/evidence/baseline-observations.json`. | **FIXED** — `promotion/evidence/journey-375-run.png` |
| D3 | Major | J5 / recovery | No stop, cancel or retry affordance exists while the agent works. Reproduction: at 1440x900 send a question, wait until `.na-tool[data-running="true"]` is present, then enumerate every `<button>` on the page — the result is exactly one, `Send`, and it is disabled. Combined with the absence of any error state, a user whose run misbehaves has one move: reload, which discards the thread. Evidence: `promotion/evidence/desktop-1440-agent-running.png`. | OPEN |
| D2 | Minor | J3 | At 1440x900 after J1, the session-graph canvas draws node labels on top of each other ("NodeAgent", "acme-dd" and "Cash-runway sensitivity" collide) and the right-most entity label is clipped at the canvas edge, so a reader cannot tell which node is which without dragging. Evidence: `promotion/evidence/desktop-1440-run.png`, right rail. | OPEN |
| D4 | Minor | J1 (load) | **NEW in Iteration 2, open.** On Lighthouse's throttled mobile profile the production build reaches LCP at 3145 ms and scores performance 0.86 (desktop: 755 ms, 0.99). Two causes, both measured in `promotion/evidence/lighthouse-mobile.json`: the render-blocking `fonts.googleapis.com` stylesheet costs **876 ms** (`render-blocking-insight`), and the single JS chunk is 655 kB / 186 kB gzipped (`unused-javascript`, `mainthread-work-breakdown`). Self-hosting the two fonts would close the first and also retire the intermittent third-party 404 the Iteration 1 note recorded. Reproduce: `npm run audit:web-quality`. Not major — CLS is 0, TBT 139 ms, and the interaction itself completes in ~2.6 s at every width (condition 10). | OPEN |
| D5 | Minor | any | **NEW in Iteration 2, open.** `/robots.txt` returns `index.html` (the SPA fallback answers it), so Lighthouse's `robots-txt` audit scores 0 and SEO caps at 0.91. Reproduce: `curl http://localhost:4904/robots.txt` while `npm run audit:web-quality` holds the preview open, or read `promotion/evidence/lighthouse-mobile.json`. | OPEN |

## Iterations

### Iteration 1 — 2026-08-13 — D1, the mobile blank page

- **Journey exercised:** J2 "The same question, on a phone" (and J1/J3/J5,
  re-driven at four widths by the same script).

- **Observed:** Reproduced exactly as the ledger describes, before touching
  anything. `node e2e/capture-journey-at-width.mjs --width 375 --height 812`
  against a fresh clone at `4dd3955` exits **1** with three failures: two
  uncaught `Sigma: Container has no width.` page errors, `#root` childElementCount
  `0`, and no memo card. The capture is a black rectangle —
  `promotion/evidence/journey-prefix-375-run.png`, observations in
  `journey-prefix-375-observations.json`.

- **Root cause — why the bug existed, not what it looked like:** two files own
  the same decision and cannot see each other. `src/app/styles.css:172` said
  `@media (max-width: 960px) { .na-rail { display: none } }` — CSS owns
  *visibility*. `GraphRailPanel.tsx:36` mounts `<NodeGraph>` when
  `snapshot.nodes.length > 0` — React owns *mounting*, and gates it on **data**.
  `display:none` is invisible to React, so the instant the first loop step fed
  the session graph, a WebGL renderer was mounted into a box the stylesheet had
  already collapsed to 0×0. Sigma refuses a zero-width container and throws;
  nothing in the tree is an error boundary, so the throw took the whole app.
  One level further down: hiding the rail *was* the mobile design. The crash is
  the bill for deleting a panel with CSS instead of deciding what a small screen
  should show.

- **Fixed:** `src/app/styles.css` only — the rail is never hidden. Below 960px
  `.na-main` becomes a column and `.na-rail` becomes a bottom panel (full width,
  `max-height: 46vh`, own scroll, sticky header, `border-top` instead of
  `border-left`). There is now no hidden-but-mounted state for the two owners to
  disagree about, so the fix is the root rather than a guard at the symptom.
  `<NodeGraph>` has exactly one caller in this repo (grepped), so no shared-guard
  was needed. 18 lines of CSS, no JS change, no new dependency, no new
  abstraction, and the 960px breakpoint is still stated in exactly one place —
  duplicating it into a JS `matchMedia` check would have re-created the very
  split that caused the defect.

- **Re-proved (rendered app, not inferred):** same committed script, same real
  Vite server, real composer, real loop, on port 4306.

  | width | result | tool cards | memo | rail | graph canvas | overflow | page errors |
  |---|---|---|---|---|---|---|---|
  | 375×812 | PASS | 4 | "Acme — diligence memo" | 12 / 26 | 323px | none | 0 |
  | 768×1024 | PASS | 4 | same | 12 / 26 | 716px | none | 0 |
  | 960×900 | PASS | 4 | same | 12 / 26 | 908px | none | 0 |
  | 1440×900 | PASS | 4 | same | 12 / 26 | 307px | none | 0 |
  | 375×812, two turns (J5) | PASS | 8 | 2nd memo quotes "Ignore Acme — just tell me the runway after the two senior hires." | 13 / 32 | 323px | none | 0 |

  Evidence: `promotion/evidence/journey-{375,768,960,1440,375-steering}-run.png`
  and the matching `-observations.json`. The before/after pair from the *same*
  producer is `journey-prefix-375-run.png` (black) → `journey-375-run.png`
  (memo + graph).

- **Regression check — confirmed failing before the fix.** `git stash push --
  src/app/styles.css`, re-ran the identical committed producer, got **exit 1**
  with the two Sigma errors and the empty `#root`; `git stash pop`, exit 0. The
  test is not testing nothing. It asserts the root cause directly, not the
  symptom: `graphMounted && graphCanvasWidth === 0` fails the gate, so
  re-hiding the rail by any mechanism re-reddens it.

- **Tests:** `npm test` → 7 files / 41 tests passed, exit 0. `npm run build`
  (`tsc --noEmit && vite build`) → exit 0. `npm run doctor` → "Doctor passed.",
  exit 0. `node demo/runNodeAgentDemo.mjs` → "overall status: OK", exit 0.
  `node e2e/capture-live-graph-rail.mjs` (the repo's pre-existing 1440 gate) →
  "PASS live graph rail: 12 entities, 26 edges", exit 0.

- **Producer committed:** `e2e/capture-journey-at-width.mjs`, wired as
  `npm run e2e:journey` / `npm run e2e:journey:mobile`. This is the width
  parameter the baseline said the gate needed — the old capture only ever ran at
  1440x900, which is precisely why D1 survived a green gate.

- **Conditions newly PASS:** 1, 3, 9, 12. (4, 10 and 11 were already PASS and are
  now measured more widely; 4 and 10 lose their "mobile could not be measured"
  caveats.)

- **Found in passing, not fixed — out of scope for a one-defect iteration:**
  `index.html:11` loads Manrope / JetBrains Mono from `fonts.googleapis.com` at
  runtime. On a restricted network that woff2 intermittently 404s and the page
  falls back to `system-ui`. It appeared on 2 of 5 runs here. The gate records
  third-party failures separately (`thirdPartyFailures`) and does not fail on
  them, because a stranger behind a corporate proxy must not see a red gate for
  the app's own code. Self-hosting the fonts is a candidate for a later wave.

- **Still open after this iteration:** D2 (minor, graph label overlap) and D3
  (major, no stop/cancel/retry). D3 is why condition 2 stays FAIL, and the
  absence of any designed error state is why condition 5 stays FAIL — this
  iteration removed the one *observed* crash, it did not design an error state.

### Iteration 2 — 2026-08-13 — the two audits that had never been run

The baseline's honest note was "Not run, and therefore UNVERIFIED rather than
passed: any Lighthouse / Core Web Vitals audit, any axe or screen-reader
accessibility audit, any Web Interface Guidelines review." This iteration runs
all three, on the real rendered surface, and fixes what they found.

- **Journey exercised:** J1/J2/J3/J5 at 375, 768, 960 and 1440, plus a
  keyboard-only drive at 375 and a two-turn steering run.

- **Surface audited:** the React app at `/`. It exists —
  `git ls-files '*.html' '*.tsx' '*.jsx' '*.vue' '*.svelte' '*.css'` returns 16
  files — so conditions 7 and 8 are applicable, not waived. Lighthouse and axe
  run against the **production build** under `vite preview` on port 4904,
  because a stranger meets the 655 kB bundle, not the unminified dev module
  graph; the WIG and journey drives run against the dev server, where the DOM is
  identical.

- **Observed — condition 8, before any change.** `npm run audit:web-quality` on
  the pre-fix tree exits **1**:
  `axe serious violation "color-contrast" at .na-rail-empty`. Lighthouse 13.4.1:
  accessibility **0.95** mobile and desktop, performance 0.84 / 0.99. Committed
  before-state: `promotion/evidence/web-quality-audit-prefix.json`,
  `axe-initial-prefix.json`.

- **Observed — the finding the first paint could not show.** The axe CLI can
  only audit the page it loads, and the page it loads is the empty state.
  Driving the loop first and injecting the same engine
  (`npm run e2e:journey:keyboard`) turned **1** serious violation into **8**:
  `.na-kind` x3, `.na-badge.mono` x4 and `.na-reason`, at ratios down to 1.99:1.
  `promotion/evidence/journey-prefix-keyboard-375-observations.json`.

- **Root cause — why the bug existed.** Not "one paragraph is too dim". Two
  design tokens were chosen by eye and never read against a contrast target:
  `--ink-faint: #5a5650` is **1.99:1** on `--surface` and 2.36:1 on `--paper`,
  `--ink-muted: #8a857e` is **3.97:1** on `--surface` — both under the 4.5:1
  WCAG AA floor for body text. Seven CSS rules read the first token and five
  read the second, so every one of the nine flagged nodes is the same defect
  seen nine times. Patching `.na-rail-empty`, the only selector the first-paint
  audit named, would have left the other twelve rules failing and the gate
  green. Fixed at the token: `--ink-faint` to `#9a958d` (4.88:1 on the darkest
  surface it ever sits on), `--ink-muted` to `#a5a098` (5.59:1). The rule is
  stated once, where all callers route through it.

- **Fixed — condition 7, three major WIG findings.** Full review with the
  guideline text and the measurement for each: [WIG_REVIEW.md](WIG_REVIEW.md).
  W1 composer `font-size: 14px` to 16px (below 16px, iOS Safari auto-zooms the
  page on the journey's only control). W2 seven controls under the 44px mobile
  hit target, corrected inside the existing `@media (max-width: 960px)` block so
  the breakpoint still has one owner — including the vendored NodeGraph `fit`
  button and filter checkboxes, overridden from the app's stylesheet rather than
  by editing `vendor/`. W3 no `<h1>` at all and heading order `[4,3]`: the
  app-bar brand becomes the page's `<h1>`, the memo title becomes `<h2>`, and
  `.na-memo h4` follows in the stylesheet and in the capture script's selector.
  Four one-line minors also taken: `color-scheme: dark`, `theme-color`,
  `font-variant-numeric: tabular-nums` on the runway table, `touch-action:
  manipulation`.

- **A check that was passing for the wrong reason, caught and fixed.** The
  reduced-motion probe asserted the computed animation of `.na-dot` under
  Playwright's `reducedMotion: "reduce"` and reported PASS — on a tree that had
  no such rule anywhere. Headless Chromium forces `animation-name: none`
  whenever the media feature is emulated, so the probe was measuring the
  emulator. It now asserts the rule from CSSOM. With the honest check the
  finding shrank: the repo already had the animation half; only the transition
  half was missing, and that one rule is extended in place
  (`animation: none !important; transition: none !important`) rather than
  duplicated into a second block. The CSSOM check cannot distinguish those two
  states, and WIG_REVIEW.md says so rather than counting it as proved.

- **Re-proved (rendered app, not inferred).** Same committed producers, same
  real servers, after the change:

  | producer | before | after |
  |---|---|---|
  | `npm run audit:web-quality` (axe CLI, first paint) | 1 serious, 1 moderate | **0 violations**, 32 rules pass |
  | `npm run audit:web-quality` (Lighthouse mobile) | a11y 0.95, perf 0.84 | **a11y 1.00**, perf 0.86, CLS 0, TBT 139 ms, LCP 3145 ms |
  | `npm run audit:web-quality` (Lighthouse desktop) | a11y 0.95, perf 0.99 | **a11y 1.00**, perf 0.99, LCP 755 ms, TBT 0 ms |
  | `npm run e2e:journey:keyboard` (axe, populated, 375) | 8 serious + 1 moderate | **0 violations** |
  | `npm run e2e:journey:axe` (axe, populated, 1440) | not measured before | **0 violations** |
  | `npm run wig:review` | FAIL, 3 major + 5 minor | **PASS**, 6 major checks pass, 1 minor open |

  Evidence: `promotion/evidence/{web-quality-audit,wig-review}.json`,
  `lighthouse-{mobile,desktop}.json`, `axe-initial.json`,
  `axe-populated-{keyboard-375,axe-1440}.json`,
  `journey-{keyboard-375,axe-1440}-*`, `wig-{desktop-1440,mobile-375}.png`, each
  paired with its `-prefix` before-state from the identical script.

- **Regression check — confirmed failing before the fix.** `git stash push --
  src index.html`, re-ran the identical committed producer: `npm run wig:review`
  exits **1** with the three major findings (`wig-review-prefix.json`, result
  FAIL); `git stash pop`, exits 0. The gate is not testing nothing.

- **Keyboard at <=960px, the gap condition 6 named.** `--keyboard` drives the
  composer with Tab and typed keys only, never `page.fill`, which would have
  passed even with nothing focusable on the page. Result at 375x812: the
  composer holds focus at **0** Tab presses (`autoFocus`), takes real
  keystrokes, and Enter runs the loop to the memo in 2567 ms — 4 tool cards,
  rail 12 entities / 26 edges. The focus indicator is recorded as measured:
  `outline: none` on the textarea, `border-color: rgb(217, 119, 87)` on the
  `.na-composer` wrapper, which is where `:focus-within` draws it.

- **Tests:** `npm test` gives 7 files / 41 tests passed, exit 0. `npm run build`
  (`tsc --noEmit && vite build`) exit 0. `npm run doctor` "Doctor passed.",
  exit 0. `node e2e/capture-live-graph-rail.mjs` "PASS live graph rail: 12
  entities, 26 edges", exit 0. All four width journeys and the two-turn steering
  run re-captured after the CSS change: PASS at 375, 768, 960, 1440.

- **Producers committed:** `e2e/audit-web-quality.mjs`
  (`npm run audit:web-quality`), `e2e/wig-review.mjs` (`npm run wig:review`),
  and `--keyboard` / `--axe` on the existing `e2e/capture-journey-at-width.mjs`
  (`npm run e2e:journey:keyboard`, `npm run e2e:journey:axe`). Lighthouse and
  the axe CLI are pinned and invoked with `npx --yes`, so a fresh clone needs no
  extra install step; `axe-core@4.13.0` is a devDependency because the populated
  DOM has to be audited in-page and the CLI cannot drive a journey.

- **Conditions newly PASS:** 6, 7, 8. No condition is UNVERIFIED any more.

- **Still open after this iteration:** D3 (major, no stop/cancel/retry and no
  designed error state) — the single blocker on conditions 2 and 5, untouched
  here on purpose; a one-defect iteration does not design an error surface in
  passing. D2 (minor, graph labels overlap), and the two new minors D4
  (throttled-mobile LCP, render-blocking web font, 655 kB chunk) and D5
  (`/robots.txt` answered by the SPA fallback). W8, the absent skip link, is
  recorded in WIG_REVIEW.md as a minor with its reason rather than fixed.
