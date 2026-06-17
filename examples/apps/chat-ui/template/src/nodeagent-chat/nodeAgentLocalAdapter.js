export const SUGGESTED_PROMPT = "Does the local NodeAgent wedge hold for an MVP?";

const demo = {
  context: {
    items: [
      { relevance: 0.94, kind: "room", text: "User wants a portable agent chat that works before API keys exist." },
      { relevance: 0.88, kind: "runtime", text: "The local adapter must be replaceable by a server route or worker." },
      { relevance: 0.82, kind: "proof", text: "Smoke and build should pass in the generated target app." },
    ],
    activeParticipants: 3,
  },
  synthesis: {
    confidence: "high",
    groundedCount: 3,
    sources: [
      { id: "src-1", kind: "README", title: "No-key local adapter requirement", citation: "A", grounding: 0.94, winner: true },
      { id: "src-2", kind: "SMOKE", title: "Generated app smoke and build", citation: "B", grounding: 0.87, winner: false },
      { id: "src-3", kind: "RUNTIME", title: "Server route upgrade seam", citation: "C", grounding: 0.81, winner: false },
    ],
    answer:
      "Yes. The generated chat starts with a scripted adapter and assistant-ui thread, then upgrades by replacing the adapter with a server route.",
    note: "",
  },
  model: {
    version: 2,
    cells: {
      A1: { address: "A1", label: "First run", value: "no keys" },
      A2: { address: "A2", label: "Adapter", value: "local" },
      A3: { address: "A3", label: "Upgrade", value: "server route" },
    },
  },
  delta: {
    changes: [{ address: "A2", from: "planned", to: "local" }],
    reason: "Keep the first demo runnable before credentials are available.",
  },
  memo: {
    title: "Portable NodeAgent chat proof",
    blocks: [
      { id: "h", type: "heading", text: "Portable NodeAgent chat proof" },
      {
        id: "c",
        type: "claim",
        groundedRatio: 0.93,
        text: "The scaffold can be dropped into another React app and run without model keys.",
      },
      { id: "p", type: "paragraph", text: "Replace the local adapter only after the server-side provider path exists." },
      {
        id: "done",
        type: "paragraph",
        text: "Done. The chat UI is running locally with no provider credentials.",
      },
      { id: "cite", type: "citation", text: "Sources: local README, smoke receipt, runtime adapter seam." },
    ],
  },
};

function lastUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const text = (message.content ?? [])
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join(" ")
      .trim();
    if (text) return text;
  }
  return SUGGESTED_PROMPT;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const nodeAgentLocalAdapter = {
  apiKeysRequired: false,
  async *run({ messages, abortSignal }) {
    const question = lastUserText(messages);
    const reduced = prefersReducedMotion();
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, reduced ? 0 : ms));
    const parts = new Map();
    let lead = `Running local NodeAgent for: ${question}`;

    const snapshot = () => ({
      content: [{ type: "text", text: lead }, ...Array.from(parts.values())],
    });

    async function* step(id, toolName, args, result) {
      parts.set(id, { type: "tool-call", toolCallId: id, toolName, args });
      yield snapshot();
      if (abortSignal.aborted) return;
      await delay(260);
      parts.set(id, { type: "tool-call", toolCallId: id, toolName, args, result });
      yield snapshot();
      await delay(120);
    }

    yield snapshot();
    await delay(180);
    yield* step("ctx", "collect_context", { focus: question }, demo.context);
    yield* step("search", "search_synthesize", { query: question }, demo.synthesis);
    yield* step("model", "apply_model_delta", { sheet: "MVP readiness" }, { applied: demo.delta, model: demo.model });
    yield* step("memo", "write_memo", { title: demo.memo.title }, demo.memo);

    lead = "Done. The chat UI is running locally with no provider credentials; swap the adapter when the live route exists.";
    yield snapshot();
  },
};
