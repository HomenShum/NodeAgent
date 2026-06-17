import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const startedAt = new Date();
const issues = [];

for (const file of [
  "package.json",
  ".env.example",
  "AGENTS.md",
  "README.md",
  "index.html",
  "public/nodeagent-chat-state.json",
  "src/main.jsx",
  "src/nodeagent-chat/NodeAgentChatApp.jsx",
  "src/nodeagent-chat/nodeAgentLocalAdapter.js",
  "src/nodeagent-chat/toolUIs.jsx",
  "src/styles.css",
]) {
  if (!existsSync(file)) issues.push(`missing ${file}`);
}

if (issues.length === 0) {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const app = readFileSync("src/nodeagent-chat/NodeAgentChatApp.jsx", "utf8");
  const adapter = readFileSync("src/nodeagent-chat/nodeAgentLocalAdapter.js", "utf8");
  const tools = readFileSync("src/nodeagent-chat/toolUIs.jsx", "utf8");
  const readme = readFileSync("README.md", "utf8");
  const env = readFileSync(".env.example", "utf8");

  for (const script of ["dev", "agent:demo", "smoke", "build"]) {
    if (!packageJson.scripts?.[script]) issues.push(`package.json missing ${script}`);
  }
  for (const dependency of ["@assistant-ui/react", "react", "react-dom"]) {
    if (!packageJson.dependencies?.[dependency]) issues.push(`package.json missing ${dependency}`);
  }
  for (const required of ["AssistantRuntimeProvider", "useLocalRuntime", "data-nodeagent-chat", "NodeAgentToolUIs"]) {
    if (!app.includes(required)) issues.push(`NodeAgentChatApp.jsx missing ${required}`);
  }
  for (const required of ["apiKeysRequired: false", "collect_context", "search_synthesize", "apply_model_delta", "write_memo"]) {
    if (!adapter.includes(required)) issues.push(`nodeAgentLocalAdapter.js missing ${required}`);
  }
  for (const required of ["makeAssistantToolUI", "collect_context", "search_synthesize", "apply_model_delta", "write_memo"]) {
    if (!tools.includes(required)) issues.push(`toolUIs.jsx missing ${required}`);
  }
  for (const required of ["## No API Keys", "## Chat Runtime", "npm run agent:demo", "npm run build"]) {
    if (!readme.includes(required)) issues.push(`README.md missing ${required}`);
  }
  if (!env.includes("NODEAGENT_MODE=scripted")) issues.push(".env.example missing scripted mode");
}

const report = {
  ok: issues.length === 0,
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  apiKeysRequired: false,
  scaffold: "chat-ui",
  issues,
};
writeJson("docs/eval/chat-ui-smoke.json", report);

if (issues.length > 0) {
  console.error("nodeagent chat ui smoke: FAIL");
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exitCode = 1;
} else {
  console.log("nodeagent chat ui smoke: PASS");
}

function writeJson(path, value) {
  const parent = dirname(path);
  if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
