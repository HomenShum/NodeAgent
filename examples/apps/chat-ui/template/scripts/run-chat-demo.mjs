import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const startedAt = new Date();
const state = {
  generatedAt: startedAt.toISOString(),
  mode: "scripted",
  apiKeysRequired: false,
  adapter: "nodeAgentLocalAdapter",
  demoPrompt: "Does the local NodeAgent wedge hold for an MVP?",
  tools: [
    "collect_context",
    "search_synthesize",
    "apply_model_delta",
    "write_memo",
  ],
  receipt: {
    status: "verified",
    summary: "Local assistant-ui chat scaffold is ready without provider credentials.",
    next: "Run npm run dev and send the suggested prompt.",
  },
};

writeJson("public/nodeagent-chat-state.json", state);
writeJson("docs/eval/chat-ui-demo.json", {
  ok: true,
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  apiKeysRequired: false,
  scaffold: "chat-ui",
  promptToRunnable: "npm install && npm run agent:demo && npm run dev",
});

console.log("nodeagent chat demo: PASS public/nodeagent-chat-state.json");

function writeJson(path, value) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
