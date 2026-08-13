// Generates .tours/*.tour with line numbers resolved from the real files.
// Every step names an anchor substring; the generator finds it and fails loudly
// if it is absent, and writes it into the step so scripts/validate-tours.mjs can
// assert the line still holds it. A line number alone would stay in range while
// the code under it moved.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: node build-tours.mjs <repo-root>");

const cache = new Map();
function lineOf(file, anchor) {
  if (!cache.has(file)) cache.set(file, readFileSync(join(root, file), "utf8").split("\n"));
  const lines = cache.get(file);
  const i = lines.findIndex((l) => l.includes(anchor));
  if (i < 0) throw new Error(`ANCHOR NOT FOUND in ${file}: ${JSON.stringify(anchor)}`);
  return i + 1;
}

const tours = [
  {
    file: "01-primary-user-flow.tour",
    title: "1 · A question becomes a memo",
    description:
      "Follow one user request from the page load to the finished memo. Start here if you have never seen this repo.",
    steps: [
      ["index.html", '<script type="module"', "The whole app is one page. This tag is the only entry point — there is no router and no server."],
      ["src/app/main.tsx", "createRoot(el).render", "Mount one component. That is the entire job of the entry file."],
      ["src/features/node-agent/components/NodeAgentDemoApp.tsx", "const runtime = useLocalRuntime", "The one decision that says HOW the agent runs. `useLocalRuntime` comes from the installed @assistant-ui/react package and gives us a working chat runtime in exchange for one adapter object. Swapping this adapter for a server-backed one is the single edit that takes this demo to production."],
      ["src/features/node-agent/components/NodeAgentDemoApp.tsx", "<NodeAgentToolUIs />", "Renders nothing visible. It exists to register the four inline tool cards with the runtime — see tour step 6."],
      ["src/features/node-agent/components/NodeAgentThread.tsx", "<ComposerPrimitive.Send", "The control the user actually presses. Note it is the only button on the page while a run is in flight, and it is disabled — there is no cancel. That is open defect D3."],
      ["src/features/node-agent/runtime/nodeAgentChatAdapter.ts", "async *run({ messages, abortSignal })", "Pressing Enter lands here. This is the bridge between the chat UI and the agent."],
      ["src/features/node-agent/runtime/nodeAgentChatAdapter.ts", "const result = runNodeAgent(scenario)", "The surprise worth knowing early: this call is SYNCHRONOUS and all four steps finish right here, before anything renders. The streaming a user sees is this function pacing out results that already exist."],
      ["src/features/node-agent/runtime/nodeAgentRuntime.ts", "export function runNodeAgent", "The loop itself. Four numbered blocks, top to bottom, no framework. If you read one function in this repo, read this one."],
      ["src/features/node-agent/components/toolUIs.tsx", 'toolName: "collect_context"', "Tool REGISTRATION. A tool here is a name string with a card bound to it — there is no model doing tool-calling, no schema registry, no dispatch table."],
      ["src/features/node-agent/runtime/nodeAgentChatAdapter.ts", 'yield* step("ctx", "collect_context"', "Tool INVOCATION, using the exact same name string. If these two lists ever disagree the card silently does not render and the run still reports success. Nothing enforces the match."],
      ["src/features/node-agent/runtime/nodeAgentChatAdapter.ts", "parts.set(id, { type: \"tool-call\", toolCallId: id, toolName, args })", "How a card appears then fills in: yield the call (card shows 'working…'), pause, yield the same call plus its result (card shows the real data)."],
      ["src/features/node-agent/graph/agentGraphSession.ts", "graphSession.observe(", "After each step, record the entities that step genuinely touched. Read the file header above for the honesty contract: a count is passed only when something was really counted."],
      ["src/features/node-agent/components/GraphRailPanel.tsx", "const snapshot = useSyncExternalStore", "The side panel subscribes to that session, so the graph grows as the run proceeds. This is the entire state-management story — no library."],
      ["src/features/node-agent/runtime/nodeAgentChatAdapter.ts", "const runway = result.modelDelta?.changes.find", "The closing line quotes real numbers off the result — the grounded count and the recomputed runway — rather than a canned success message."],
    ],
  },
  {
    file: "02-agent-execution.tour",
    title: "2 · The four steps, and what each refuses to do",
    description:
      "The domain modules behind the loop. Each is pure, deterministic, and defined as much by what it declines to do as by what it produces.",
    steps: [
      ["src/features/node-agent/demoScenario.ts", "export function buildDemoScenario", "Everything runs on this one fixed scenario: a room with three people, four sources, and a spreadsheet whose monthly-spend figure is wrong on purpose (510 instead of 420) so the agent's correction is visible."],
      ["src/features/node-agent/demoScenario.ts", "export const DEMO_NOW", "A frozen clock. Every domain function takes `now` as a parameter, which is why output is byte-stable and tests can compare rendered markdown directly."],
      ["src/features/chat/contextCollector.ts", "export function tokenize", "Step 1 starts here. Lowercase, drop stop-words, light plural stemming. This same tokenizer is reused by the search module — one definition of 'do these words overlap'."],
      ["src/features/chat/contextCollector.ts", "const MAX_ITEMS", "Every accumulating collection in this codebase has a cap declared at the top of its file. Agents amplify unbounded growth, so this is a convention, not a one-off."],
      ["src/features/search/searchAndSynthesize.ts", "export function rankSources", "Step 2. Blend how well a source overlaps the question with the retrieval score it arrived with, sort, then assign citation numbers 1..n."],
      ["src/features/search/searchAndSynthesize.ts", 'if (confidence === "low" || grounded.length === 0)', "The most important branch in the repo. When the sources are weak it returns an EMPTY answer plus a stated reason instead of writing plausible prose. Refusing to fabricate is the product."],
      ["src/features/search/searchAndSynthesize.ts", "export function isSafeFetchUrl", "Guards the live retrieval path: http/https only, and private, loopback and cloud-metadata addresses are blocked. An agent invents URLs from reasoning, and one hallucinated 169.254.169.254 is a credential leak."],
      ["src/features/spreadsheet/versionedSpreadsheetSync.ts", "commit(delta: SpreadsheetDelta", "Step 3, and the only real validation rule in the app. If your change was written against an older version but nobody touched your cells, it is moved forward silently; if somebody did, you are told which cells clash instead of winning by arriving last."],
      ["src/features/spreadsheet/applySpreadsheetDelta.ts", "function recompute", "Correcting one cell recomputes the cells that depend on it, and BOTH the edit and the recomputed dependents are recorded in the audit — which is what lets the memo say 'runway now 18'."],
      ["src/features/notebook/notebookEditor.ts", "export function insertClaim", "Step 4. The unit that makes a memo defensible: a statement plus the citations supporting it plus the ratio of grounded sources. Not a paragraph with a footnote."],
      ["src/features/node-agent/runtime/nodeAgentRuntime.ts", "const hadError = steps.some", "The honesty rule: `ok` only when every step completed, `partial` when a memo shipped without grounding, `error` otherwise. Nothing else may report success on this run's behalf."],
      ["src/features/node-agent/runtime/durableRuntime.ts", "export interface ToolRuntime", "For embedders: real tools are supplied through this port, behind a policy context. The browser demo does not use any of the durable layer — it has no persistence at all."],
    ],
  },
  {
    file: "03-debug-and-recovery.tour",
    title: "3 · When it breaks: what catches it, and what does not",
    description:
      "Failure handling, the two gaps you must know about before your first change, and how to make every check in this repo go red on purpose.",
    steps: [
      ["src/features/node-agent/runtime/nodeAgentRuntime.ts", "function safe<T>", "The loop's whole failure story. A throwing step is recorded as an error and given a fallback so later steps still run and the user still gets a memo that admits the gap. The loop never throws."],
      ["src/features/node-agent/runtime/nodeAgentChatAdapter.ts", "if (abortSignal.aborted) return", "The abort signal is checked BETWEEN steps only — because the loop already finished synchronously before this generator started yielding. Nothing in the UI is wired to trigger it (defect D3)."],
      ["src/features/node-agent/components/NodeAgentDemoApp.tsx", "<AssistantRuntimeProvider runtime={runtime}>", "GAP: no component in this tree is a React error boundary, and the adapter has no catch. A throw in any child unmounts the whole app to a blank page. That is exactly how defect D1 presented. A fix starts on this line."],
      ["src/app/styles.css", "@media (max-width: 960px)", "The site of defect D1. This block used to say `.na-rail { display: none }`. CSS owned visibility, React owned mounting and gated on data — so a WebGL renderer was mounted into a 0x0 box, threw, and took the app down. The rail is now a bottom panel instead: one owner, no hidden-but-mounted state."],
      ["e2e/capture-journey-at-width.mjs", "graphMounted:", "The browser gate asserts the graph canvas is not zero-width — the CAUSE of D1, not its symptom. Re-hide the rail by any mechanism and this turns red."],
      ["tests/nodeAgentRuntime.test.ts", "completes all four steps with status ok", "The loop's central claims. To prove they are not decorative: set GROUNDING_THRESHOLD in src/features/search/searchAndSynthesize.ts from 0.34 to 0.99 and run `npx vitest run tests/nodeAgentRuntime.test.ts` — that one file exits 1 with three failures. The whole suite (`npm test`) exits 1 with seven, across four files. Put it back."],
      ["tests/nodeAgentRuntime.test.ts", "returns partial (not ok, not crash)", "The degradation case: weak sources must produce `partial` and still ship a memo, not a crash and not a fake success."],
      ["src/features/search/searchAndSynthesize.ts", "const GROUNDING_THRESHOLD", "The knob the mutation above turns. A deleted demo script used to hard-code its own copy of this number and print 'overall status: OK' regardless — see docs/SIMPLIFICATION_REPORT.md for why that was removed."],
      ["scripts/nodeagent-local-dashboard-scaffold-smoke.ts", "Drive bin/nodeagent.mjs directly", "A trap worth knowing: reaching a tool through nested `npm run x -- --flag value` silently dropped the --dir argument on Windows, so the scaffolder exited 0 having written nothing and `npm run check` failed from a clean checkout. Both scaffold smokes now call the binary directly."],
      ["package.json", '"prepush":', "The full gate: fifteen stages, and it exits 0 from a clean checkout. The last stage, `npm audit --omit=dev`, is why the `overrides` block below pins a patched `nanoid` — @assistant-ui reaches a vulnerable one transitively, and a gate that a new engineer cannot pass is worse than no gate."],
    ],
  },
];

mkdirSync(join(root, ".tours"), { recursive: true });
for (const tour of tours) {
  const steps = tour.steps.map(([file, anchor, description]) => ({
    file,
    line: lineOf(file, anchor),
    anchor,
    description,
  }));
  writeFileSync(
    join(root, ".tours", tour.file),
    JSON.stringify({ $schema: "https://aka.ms/codetour-schema", title: tour.title, description: tour.description, steps }, null, 2) + "\n",
  );
  console.log(`wrote .tours/${tour.file} (${steps.length} steps)`);
}
