# Canonical journeys — NodeAgent

Five real workflows. Not feature tours: a journey is one person, one goal, and
the artifact they hold when it worked. These are the promotion loop's work
queue, exercised in order of importance.

**A journey with no browser evidence is unfinished**, regardless of test status.

## Journey shape

Each journey states, in this order:

- **Persona and situation** — who arrived, and why today.
- **Goal** — what they want to be true when they leave.
- **Steps** — what they actually do, in the UI, in order.
- **Done when** — the observable artifact or state that proves completion.
- **Evidence** — path to the capture that shows it working. Empty until proven.

---

## J1 — "Answer the room and give me something I can read aloud"

- **Persona and situation:** The founder with an investor call in forty minutes,
  at a laptop. A competitor teardown landed overnight and the runway number in
  her sheet is stale.
- **Goal:** One typed question turns into a cited memo, a corrected model, and a
  visible trail of which source fed which conclusion.
- **Surface it drives:** `npm run dev` → `http://localhost:5173/`, the
  assistant-ui thread in `src/features/node-agent/components/NodeAgentThread.tsx`
  with the four tool cards from `toolUIs.tsx`.
- **Steps:**
  1. Open `http://localhost:5173/` at 1440x900. The thread is empty and offers
     two suggestion chips.
  2. Type "Does our wedge hold versus Acme, and does the runway model survive 18
     months?" into the composer ("Ask the room anything…") and press Enter.
  3. Watch the four tool cards land in order: Gather room context, Search &
     synthesize, Update model, Write memo.
- **Done when:** The fourth card shows the memo headed "Acme — diligence memo"
  with a CLAIM block reading "grounded 3/4" and a `room://benchmark` citation
  line; the Update model card shows Runway (months) changed to 18 at v2.
- **Evidence:** `promotion/evidence/desktop-1440-run.png` (also
  `desktop-1440-empty.png` for the empty state).
- **Baseline result:** PASS — 2653 ms from Enter to the completed memo.

## J2 — The same question, on a phone

- **Persona and situation:** The same founder, in the car on the way to the
  call, on a 375px-wide phone screen.
- **Goal:** Reach the same memo on a small screen.
- **Surface it drives:** the same route at 375x812; the responsive rules in
  `src/app/styles.css` (`@media (max-width: 640px)` and the ≤960px block that
  turns the rail into a bottom panel) and the conditional `<NodeGraph>` mount in
  `GraphRailPanel.tsx`.
- **Steps:**
  1. Open the app at 375x812. The empty state renders correctly.
  2. Type the question and press Enter.
- **Done when:** The memo card is readable at 375px with no horizontal scroll,
  and the session graph is either shown in a small-screen form or deliberately
  and visibly deferred.
- **Evidence:** `promotion/evidence/journey-375-run.png` (the memo plus the
  session graph as a bottom panel), `journey-375-observations.json`; also
  `journey-768-run.png` and `journey-960-run.png`.
  `promotion/evidence/mobile-375-empty.png` remains the empty state, and
  `journey-prefix-375-run.png` is kept deliberately: it is the same producer run
  on the pre-fix tree, so the before/after pair is reproducible rather than
  remembered.
- **Baseline result:** FAIL — defect D1. The page went blank at every width
  ≤960px the instant the first step ran.
- **Iteration 1 result:** PASS. Four tool cards, memo "Acme — diligence memo",
  rail 12 entities / 26 edges in a 323px-wide canvas, `scrollWidth === clientWidth`
  at 375, zero page errors, 2653 ms from Enter to memo. Reproduce with
  `npm run e2e:journey:mobile` (exit 0; exit 1 on the pre-fix tree).

## J3 — "Where did that number come from?"

- **Persona and situation:** The founder's investor, reading the memo over her
  shoulder, asks which source the latency claim rests on.
- **Goal:** Point at the evidence without leaving the page or trusting prose.
- **Surface it drives:** the ranked-source list in the Search & synthesize card
  and the right-rail session graph
  (`src/features/node-agent/graph/agentGraphSession.ts` +
  `GraphRailPanel.tsx`, `[data-testid="graph-rail"]`).
- **Steps:**
  1. Run J1.
  2. Read the ranked sources — the winner is marked and each carries a grounding
     score (RAG `room://benchmark` 0.44, DOC `finance://burn` 0.56, DOC
     `diligence://wedge` 0.44, WEB Acme teardown 0.11).
  3. Read the rail header and its edge-type legend.
- **Done when:** The rail reports "12 entities · 26 edges" with the legend
  separating **evidence (5)** — edges carrying a count the host actually measured
  — from **traversal (21)**, labelled "interaction frequency, not evidence
  strength".
- **Evidence:** `promotion/evidence/desktop-1440-run.png` (rail legend and
  counts legible at the right).
- **Baseline result:** PASS, with a named ceiling. No **assertion** edge is ever
  drawn, because the renderer's `AssertionReceipt` needs a source *plus a
  release/version*, and NodeAgent's `Citation` type
  (`src/features/node-agent/types/nodeAgentTypes.ts:94`) has no release field.
  The receipt is therefore source-level, never release-pinned. The repo states
  this openly rather than faking the edge; it is a real API gap and a candidate
  for a later wave.

## J4 — A stranger proves it in one command, with no keys

- **Persona and situation:** An engineer who found the repo, will not create an
  account, and will give it about sixty seconds.
- **Goal:** See the real loop produce real output before installing anything.
- **Surface it drives:** `npm run demo` (the real modules via tsx), `npm run doctor`,
  and the no-build browser mirror `/nodeagent-v1.html`.
- **Steps:**
  1. `npm install` then `npm run demo`.
  2. Open `/nodeagent-v1.html` and press "▶ Run the agent".
- **Done when:** The CLI prints the TRACE (gather / search / model / memo), the
  model delta v1 → v2, the memo, and "overall status: OK" with exit 0; the
  prototype page renders the CLAIM block with "GROUNDED 3/4".
- **Evidence:** `promotion/evidence/proto-375-run.png`,
  `promotion/evidence/proto-1440-load.png`; CLI transcript in
  [PROMOTION_LOG.md](PROMOTION_LOG.md).
- **Baseline result:** PASS. Notably the prototype survives 375px where the
  React app does not — same content, no WebGL rail.

## J5 — Correcting the agent mid-conversation (steering)

- **Persona and situation:** The founder decides the Acme comparison is a
  distraction and wants the runway answer on its own.
- **Goal:** Send a corrective follow-up and see it take effect.
- **Surface it drives:** the second turn through the same composer;
  `nodeAgentChatAdapter.run` reads the last user message and the graph session
  accumulates across turns.
- **Steps:**
  1. Run J1.
  2. Send "Ignore Acme — just tell me the runway after the two senior hires."
- **Done when:** A second assistant turn runs its own four cards, and the new
  memo visibly reflects the new question.
- **Evidence:** `promotion/evidence/desktop-1440-second-turn.png`.
- **Baseline result:** PASS, shallow. The second memo does quote the new
  question and the rail grows 12 → 13 entities, but the sources, the model delta
  and the answer are byte-identical, because the demo scenario is fixed. Steering
  is visible; it is not yet consequential.
- **Iteration 1 addition:** now also driven at 375x812, where the second turn
  feeds the session graph a second time — the path most likely to re-trigger D1.
  8 tool cards, second memo quoting "Ignore Acme — just tell me the runway after
  the two senior hires.", rail 13 entities / 32 edges, zero page errors
  (`promotion/evidence/journey-375-steering-run.png`, reproduce with
  `node e2e/capture-journey-at-width.mjs --width 375 --height 812 --turns 2`).
  The shallowness above is unchanged and still the honest ceiling.

---

## Journeys every agent surface owes

- **Recovery — does not currently exist as a surface, and that is the finding.**
  There is no cancel or stop control while the loop runs (checked in the rendered
  app: no button with a stop/cancel label at any point in a run), no error state,
  and no retry. When the loop did fail for real (J2 / D1) the user lost the whole
  page and the conversation with it. Iteration 1 removed that particular failure
  at its root, which means the gap is no longer *demonstrated* — but it is not
  closed: there is still no error state and no retry, so the next unhandled throw
  will do the same thing. Writing a recovery journey is still open work (D3).
- **Steering — J5.** Drivable, with the ceiling recorded above.
- **Receipt — J3.** Drivable, with the release-pinning gap recorded above.
