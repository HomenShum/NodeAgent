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
| D1 | Critical | J2 | Load `http://localhost:5173/` at any viewport width ≤ 960px (verified at 375, 768 and 960; 961, 1024 and 1440 are fine). Type any question, press Enter. The moment the first loop step feeds the session graph, two uncaught `Sigma: Container has no width.` page errors fire, React unmounts the whole tree (`document.getElementById("root").childElementCount === 0`), and the page goes black — no message, no tool card, no way back except reload. Root cause chain: `@media (max-width: 960px) { .na-rail { display: none } }` in `src/app/styles.css:172` gives the rail zero width; `GraphRailPanel.tsx` still mounts `<NodeGraph>` inside it as soon as `snapshot.nodes.length > 0`; Sigma refuses a zero-width container and throws; nothing in the tree is an error boundary, so the throw takes the app with it. React itself says so in console: "An error occurred in the `<NodeGraph>` component. Consider adding an error boundary to your tree." Evidence: `promotion/evidence/mobile-375-run.png`, `promotion/evidence/baseline-observations.json`. | OPEN |
| D2 | Minor | J3 | At 1440x900 after J1, the session-graph canvas draws node labels on top of each other ("NodeAgent", "acme-dd" and "Cash-runway sensitivity" collide) and the right-most entity label is clipped at the canvas edge, so a reader cannot tell which node is which without dragging. Evidence: `promotion/evidence/desktop-1440-run.png`, right rail. | OPEN |
| D3 | Major | J5 / recovery | No stop, cancel or retry affordance exists while the agent works. Reproduction: at 1440x900 send a question, wait until `.na-tool[data-running="true"]` is present, then enumerate every `<button>` on the page — the result is exactly one, `Send`, and it is disabled. Combined with the absence of any error state, a user whose run misbehaves has one move: reload, which discards the thread. Evidence: `promotion/evidence/desktop-1440-agent-running.png`. | OPEN |

## Iterations

_none yet — Wave 1 is measurement only._
