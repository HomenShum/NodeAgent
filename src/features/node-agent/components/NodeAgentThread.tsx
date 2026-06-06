/**
 * NodeAgentThread — a custom-styled assistant-ui Thread.
 *
 * Built from assistant-ui's headless primitives (`ThreadPrimitive`,
 * `MessagePrimitive`, `ComposerPrimitive`) and themed with the NodeBench design
 * DNA — no Tailwind, no shadcn. The assistant's message renders text plus the
 * four tool UIs inline (registered in toolUIs.tsx).
 */

import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { DEMO_QUESTION } from "../demoScenario";

function UserMessage() {
  return (
    <MessagePrimitive.Root className="na-msg na-msg-user">
      <div className="na-bubble na-bubble-user">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="na-msg na-msg-assistant">
      <span className="na-av" aria-hidden>
        ◆
      </span>
      <div className="na-bubble na-bubble-assistant">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

export function NodeAgentThread() {
  return (
    <ThreadPrimitive.Root className="na-thread">
      <ThreadPrimitive.Viewport className="na-viewport">
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <div className="na-empty">
            <span className="na-av na-av-lg" aria-hidden>
              ◆
            </span>
            <h2>Ask the room</h2>
            <p>
              NodeAgent gathers the relevant context, finds the right document for the right
              answer, updates the model as a versioned delta, and writes the cited memo — and
              you watch each step render inline.
            </p>
            <div className="na-suggestions">
              <ThreadPrimitive.Suggestion
                className="na-chip"
                prompt={DEMO_QUESTION}
                method="replace"
                autoSend
              >
                Does our wedge hold + survive 18 months? →
              </ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion
                className="na-chip"
                prompt="What changed since the last investor update, and does the model still hold?"
                method="replace"
                autoSend
              >
                What changed since last update? →
              </ThreadPrimitive.Suggestion>
            </div>
          </div>
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) =>
            message.role === "user" ? <UserMessage /> : <AssistantMessage />
          }
        </ThreadPrimitive.Messages>

        <ThreadPrimitive.ViewportFooter className="na-footer">
          <ComposerPrimitive.Root className="na-composer">
            <ComposerPrimitive.Input
              className="na-composer-input"
              placeholder="Ask the room anything…"
              rows={1}
              autoFocus
            />
            <ComposerPrimitive.Send className="na-send" aria-label="Send">
              ↑
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
          <p className="na-disclaimer">
            Deterministic demo — no keys. The agent runs the real ported modules over a fixed
            scenario.
          </p>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
