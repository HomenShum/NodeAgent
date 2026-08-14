# Web Interface Guidelines review — NodeAgent

PROMOTION condition 7. Reviewed **2026-08-13**, wave 3, against
`http://localhost:4904/` — the real React app on the real dev server, driven to
the populated state (four tool cards, the memo, the live session graph) at
1440x900 and 375x812.

Checklist source, fetched live on the day of the review:
**https://vercel.com/design/guidelines** — reachable; the full checklist
(Interactions, Animations, Layout, Content, Forms, Performance, Design,
Copywriting) was retrieved and reviewed item by item.

## This is a review, not a score

A Lighthouse run is **not** a Web Interface Guidelines review, and nothing here
is derived from one. Lighthouse never asks whether a hit target is big enough
for a thumb, whether a text field is small enough to make iOS Safari zoom the
page, whether an animation that runs forever has a reduced-motion escape, or
whether the browser's own chrome matches the page behind it. Every one of those
was a real finding here, and Lighthouse scored **0.95 accessibility / 1.0
best-practices on the same tree** while all of them were true.

The two artefacts are therefore separate and both committed:

| | Condition | Producer | Artifact |
|---|---|---|---|
| Web-quality audit | 8 | `npm run audit:web-quality` (`e2e/audit-web-quality.mjs`) | `evidence/web-quality-audit.json`, `lighthouse-{mobile,desktop}.json`, `axe-initial.json` |
| WIG review | 7 | `npm run wig:review` (`e2e/wig-review.mjs`) + this document | `evidence/wig-review.json`, `wig-{desktop-1440,mobile-375}.png` |

`e2e/wig-review.mjs` measures the checklist items a machine can settle and
writes each measurement next to the guideline it belongs to. The judgement —
which findings are major — is made here, by a reader, against those numbers.

## Major findings

All three were found by this review, fixed in the same pass, and re-proved by
re-running the producer. The before-state numbers are not recollections: they
are in `evidence/wig-review-prefix.json`, produced by the identical script
against the pre-fix tree (`git stash push -- src index.html`).

### W1 — the composer is 14px, so iOS Safari zooms the page on first tap

- **Guideline:** Interactions — *"Mobile input size — `<input>` font ≥16px on
  mobile to prevent iOS Safari auto-zoom."*
- **Measured before:** `.na-composer-input` computed `font-size: 14px` at 375w
  (`wig-review-prefix.json`, check 1).
- **What it costs a user:** the composer is the only control in the primary
  journey. On an iPhone, tapping a sub-16px field makes Safari zoom the viewport
  and the layout jumps under the thumb — on the very first interaction of the
  product's one job.
- **Fixed:** `src/app/styles.css` — `.na-composer-input` font-size 14px → 16px.
- **Re-proved:** `wig-review.json` check 1, `composer font-size 16px at 375w`,
  screenshot `evidence/wig-mobile-375.png`.

### W2 — seven controls below the 44px mobile hit target

- **Guideline:** Interactions — *"Match visual & hit targets — expand hit
  targets <24px to ≥24px; 44px minimum on mobile"*, and *"No dead zones on
  controls — checkboxes & radios share a single generous hit target with
  label."*
- **Measured before,** at 375w on the populated DOM: `a.na-link` 66x19 and
  50x19 (Prototype, GitHub), `textarea.na-composer-input` 285x33,
  `button.na-send` 34x34, and inside the vendored NodeGraph rail the `fit`
  button at 28x21 with the two filter labels at 93x19 and 133x19.
- **What it costs a user:** a 19px-tall link in a 54px app bar is a coin-flip
  tap; the graph filter checkboxes are the controls that decide what the session
  graph shows.
- **Fixed:** `src/app/styles.css`, inside the existing `@media (max-width:
  960px)` block, so the breakpoint is still stated in exactly one place. The
  vendored control is corrected from the app's own stylesheet rather than by
  editing `vendor/nodegraph-live`, which stays a verbatim copy.
- **Re-proved:** `wig-review.json` check 3, `0 control(s) under 44px at 375w`;
  every control now measures ≥44 (`a.na-link` 66x44, `.na-composer-input`
  275x44, `.na-send` 44x44, `fit` 44x44, filter labels 93x44 and 133x44).
  Screenshot `evidence/wig-mobile-375.png`.
- **Note on the measurement itself:** the probe reports a checkbox's hit target
  as its wrapping `<label>`, not the 13x13 box the browser paints, because that
  is what the guideline asks about. It also drops elements with
  `pointer-events: none`, zero size, or an `aria-hidden` ancestor — assistant-ui
  ships a hidden autosize mirror `<textarea>`, and reporting a defect on an
  element no finger can reach would be a false finding.

### W3 — no `<h1>`, and a heading order that starts at 4

- **Guideline:** Content — *"Headings & skip link — hierarchical `<h1–h6>`"*,
  and *"Semantics before ARIA."*
- **Measured before:** desktop populated heading levels `[4, 3]`
  (`wig-review-prefix.json`, check 5). axe-core agreed independently:
  `page-has-heading-one`, moderate, on `html`
  (`evidence/axe-initial-prefix.json`).
- **What it costs a user:** a screen-reader user navigating by heading lands in
  a document whose first landmark is a level-4 heading under nothing. The memo —
  the artifact the whole journey exists to produce — is announced as a
  sub-sub-section.
- **Fixed:** the app-bar brand becomes the page's one `<h1>`
  (`NodeAgentDemoApp.tsx`), and the memo title becomes `<h2>` instead of `<h4>`
  (`toolUIs.tsx`), which is the level it actually sits at. `.na-memo h4` →
  `.na-memo h2` in the stylesheet and in the capture script's `memoHeading`
  selector.
- **Re-proved:** `wig-review.json` check 5, `desktop populated headings:
  [1,2,3]`; axe `heading-order` and `page-has-heading-one` both gone
  (`evidence/axe-populated-axe-1440.json`, 0 violations).

## Minor findings

Recorded, not all fixed. Four were one-line corrections and were taken in the
same pass; one is left open with its reason.

| # | Guideline | Measured before | Disposition |
|---|---|---|---|
| W4 | Design — *Set the appropriate `color-scheme`* | `html color-scheme: normal` on a dark app | **Fixed** — `html { color-scheme: dark }`. `data-theme="dark"` is an app attribute; the browser reads only `color-scheme`, and without it scrollbars and native controls paint light. |
| W5 | Design — *Browser UI matches your background (`theme-color`)* | `theme-color` meta absent | **Fixed** — `<meta name="theme-color" content="#151413">` in `index.html`. |
| W6 | Content — *Tabular numbers for comparisons* | `.na-sheet td font-variant-numeric: normal` | **Fixed** — `font-variant-numeric: tabular-nums`. This table is the runway model; proportional digits make a column of figures wobble. |
| W7 | Interactions — *Prevent double-tap zoom on controls* | 8 of 8 controls without `touch-action: manipulation` | **Fixed** — one rule on `a, button, input, textarea, select, label`. |
| W8 | Content — *Headings & skip link (skip-to-content link)* | no skip link | **OPEN, minor.** Two links precede the composer and the composer is `autoFocus`, so a keyboard user starts past the navigation already — measured: the composer is focused after **0** Tab presses at 375w (`evidence/journey-keyboard-375-observations.json`). A skip link would save nobody a keystroke here. Revisit if the app bar grows. |

## Items reviewed and already passing

Measured, not assumed: `viewport` meta permits zoom
(`width=device-width, initial-scale=1.0, viewport-fit=cover` — no
`user-scalable=no`); every button and link has an accessible name (`.na-send`
carries `aria-label="Send"`, decorative glyphs are `aria-hidden`); `<title>` is
set; `:focus-visible` draws a 2px accent outline and the composer draws its own
indicator as `.na-composer:focus-within { border-color: var(--accent) }`
(measured as `rgb(217, 119, 87)` — the probe records the wrapper's border, since
reading `outline` alone reports "none" on an element that is visibly focused);
the ellipsis character `…` is used in the placeholder rather than three periods.

## The check that was passing for the wrong reason

The reduced-motion probe originally asserted the computed animation of
`.na-dot` under Playwright's `reducedMotion: "reduce"`. It reported
`animation-name: none` and **passed on a tree with no such rule anywhere** —
headless Chromium forces animations off whenever that media feature is
emulated, so the probe was measuring the emulator, not the page. A check that
cannot fail is not a check. It now asserts the rule itself, read out of CSSOM.

With the honest check, the finding is smaller than it first looked: the repo
already had `@media (prefers-reduced-motion: reduce) { * { animation: none
!important } }`, so the animation half was never broken. What was missing is the
transition half — `.na-chip` and `.na-composer` still animated border and colour
under `reduce`. That rule is now extended in place rather than duplicated:
`{ animation: none !important; transition: none !important; }`. **The CSSOM
check does not distinguish those two states**, so this specific extension is
justified by reading the rule, not by the gate — said plainly here rather than
counted as a proved fix.

## Out of scope for this review, still open

- **D2 (minor, open):** session-graph node labels overlap and the right-most one
  clips — visible in `evidence/journey-axe-1440-run.png`. Inside the vendored
  renderer's layout, not a stylesheet fix.
- **D3 (major, open):** no stop, cancel or retry affordance while the agent
  runs, and no designed error state. This is a WIG finding too — Content, *"No
  dead ends — every screen offers next step or recovery path."* It is the
  standing blocker on conditions 2 and 5 and is **not** resolved by this pass;
  counting it here would be double-booking a known defect as a new one.

## Re-run this review

    npm ci
    npm run wig:review          # DOM measurements -> promotion/evidence/wig-review.json
    npm run audit:web-quality   # lighthouse + axe  -> promotion/evidence/web-quality-audit.json

Both exit non-zero on a major finding. To confirm the gate can still fail:
`git stash push -- src index.html && npm run wig:review` reports the three major
findings above; `git stash pop` restores.
