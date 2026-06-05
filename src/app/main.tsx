import React from "react";
import { createRoot } from "react-dom/client";
import { NodeAgentDemoApp } from "../features/node-agent/components/NodeAgentDemoApp";
import "./styles.css";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <NodeAgentDemoApp />
    </React.StrictMode>,
  );
}
