/**
 * NodeAgentDemoApp — NodeAgent as an assistant-ui application.
 *
 * `useLocalRuntime(nodeAgentChatAdapter)` runs the real loop with no backend;
 * `AssistantRuntimeProvider` makes it available to the Thread; `NodeAgentToolUIs`
 * registers the four inline tool renderers. The whole surface is an assistant-ui
 * chat — the live room IS the thread, and the agent's work renders as tool UIs.
 */

import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { nodeAgentChatAdapter } from "../runtime/nodeAgentChatAdapter";
import { NodeAgentToolUIs } from "./toolUIs";
import { NodeAgentThread } from "./NodeAgentThread";
import { GraphRailPanel } from "./GraphRailPanel";

export function NodeAgentDemoApp() {
  const runtime = useLocalRuntime(nodeAgentChatAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Registers the four tool UIs (collect_context, search_synthesize,
          apply_spreadsheet_delta, write_memo) — render-only, no DOM. */}
      <NodeAgentToolUIs />

      <div className="na-app">
        <header className="na-appbar">
          {/* The product name is the page's one h1. It was a <span>, which left
              the document with no level-one heading at all (axe
              "page-has-heading-one") and made the empty state's <h2> the top of
              a hierarchy that started at 2. */}
          <h1 className="na-brand">
            <span className="na-dot" aria-hidden />
            NodeAgent
            <span className="na-ver mono">on assistant-ui</span>
          </h1>
          <span className="na-spacer" />
          <a className="na-link" href="/nodeagent-v1.html">
            Prototype ↗
          </a>
          <a className="na-link" href="https://github.com/HomenShum/NodeAgent">
            GitHub ↗
          </a>
        </header>

        <main className="na-main">
          <NodeAgentThread />
          {/* Live session graph: every loop step feeds the one GraphSession. */}
          <GraphRailPanel />
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
