import { useRef } from "react";
import {
  ActionBarPrimitive,
  AuiIf,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
  useLocalRuntime,
} from "@assistant-ui/react";
import { Github, KeyRound, SendHorizontal, Sparkles } from "lucide-react";
import { nodeAgentLocalAdapter, SUGGESTED_PROMPT } from "./nodeAgentLocalAdapter.js";
import { NodeAgentToolUIs } from "./toolUIs.jsx";

function focusComposer(event) {
  event.currentTarget.closest(".naThread")?.querySelector("textarea[name=input]")?.focus();
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="naMsg naMsgUser">
      <div className="naBubble naBubbleUser">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  const aui = useAui();
  const messageId = useAuiState((s) => s.message.id);
  const submittedResponse = useRef(null);
  const retryResponse = (event) => {
    if (aui.thread().getState().isRunning || submittedResponse.current === messageId) {
      event.preventDefault();
      return;
    }
    submittedResponse.current = messageId;
    focusComposer(event);
  };
  return (
    <MessagePrimitive.Root className="naMsg naMsgAssistant">
      <span className="naAvatar" aria-hidden="true">
        NA
      </span>
      <div className="naBubble naBubbleAssistant">
        <MessagePrimitive.Parts />
        <AuiIf condition={(s) => s.message.status?.type === "incomplete" && (s.message.status.reason === "cancelled" || s.message.status.reason === "error")}>
          <div className="naRecovery">
            <AuiIf condition={(s) => s.message.status?.type === "incomplete" && s.message.status.reason === "cancelled"}>
              <p role="status">Stopped this response. Completed work is kept.</p>
            </AuiIf>
            <MessagePrimitive.Error>
              <p role="alert">This response failed. Earlier results are kept.</p>
            </MessagePrimitive.Error>
            <ActionBarPrimitive.Reload onClick={retryResponse}>Retry response</ActionBarPrimitive.Reload>
          </div>
        </AuiIf>
      </div>
    </MessagePrimitive.Root>
  );
}

function NodeAgentThread() {
  return (
    <ThreadPrimitive.Root className="naThread" data-nodeagent-chat="thread">
      <ThreadPrimitive.Viewport className="naViewport" data-nodeagent-chat="viewport">
        <AuiIf condition={(snapshot) => snapshot.thread.isEmpty}>
          <section className="naEmpty" data-nodeagent-chat="empty">
            <span className="naHeroMark" aria-hidden="true">
              <Sparkles size={24} />
            </span>
            <p className="naEyebrow">No-key local agent</p>
            <h1>Ask the room. Watch the work.</h1>
            <p>
              NodeAgent gathers context, checks sources, applies a model delta,
              and writes the memo as inline tool cards. The default adapter is
              scripted so the first run needs no API keys.
            </p>
            <div className="naSuggestions">
              <ThreadPrimitive.Suggestion className="naChip" prompt={SUGGESTED_PROMPT} method="replace" autoSend>
                Run the MVP proof
              </ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion
                className="naChip"
                prompt="What changed in the room, and what should we verify next?"
                method="replace"
                autoSend
              >
                Find the next check
              </ThreadPrimitive.Suggestion>
            </div>
          </section>
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage />)}
        </ThreadPrimitive.Messages>

        <ThreadPrimitive.ViewportFooter className="naFooter" data-nodeagent-chat="composer">
          <ComposerPrimitive.Root className="naComposer">
            <ComposerPrimitive.Input className="naComposerInput" placeholder="Ask NodeAgent..." rows={1} autoFocus />
            <AuiIf condition={(s) => !s.thread.isRunning}>
              <ComposerPrimitive.Send className="naSend" aria-label="Send">
                <SendHorizontal size={17} aria-hidden="true" />
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(s) => s.thread.isRunning}>
              <ComposerPrimitive.Cancel className="naSend naStop" aria-label="Stop response" onClick={focusComposer}>
                Stop
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </ComposerPrimitive.Root>
          <p className="naFootnote">Scripted local adapter. Replace it with a server route when credentials exist.</p>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

export function NodeAgentChatApp() {
  const runtime = useLocalRuntime(nodeAgentLocalAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <NodeAgentToolUIs />
      <main className="naShell" data-nodeagent-chat="shell">
        <header className="naTopbar" data-nodeagent-chat="topbar">
          <div className="naBrand">
            <span className="naLogo">NA</span>
            <div>
              <strong>NodeAgent</strong>
              <span>portable chat UI</span>
            </div>
          </div>
          <div className="naTopActions">
            <span className="naPill">
              <KeyRound size={15} aria-hidden="true" />
              no keys
            </span>
            <a className="naIconLink" href="https://github.com/HomenShum/NodeAgent" aria-label="NodeAgent GitHub">
              <Github size={17} aria-hidden="true" />
            </a>
          </div>
        </header>
        <section className="naMain">
          <NodeAgentThread />
        </section>
      </main>
    </AssistantRuntimeProvider>
  );
}
