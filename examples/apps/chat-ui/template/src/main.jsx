import React from "react";
import { createRoot } from "react-dom/client";
import { NodeAgentChatApp } from "./nodeagent-chat/NodeAgentChatApp.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <NodeAgentChatApp />
  </React.StrictMode>,
);
