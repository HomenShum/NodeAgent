/**
 * The four NodeAgent capabilities, rendered as assistant-ui tool UIs.
 *
 * Each `makeAssistantToolUI` registers an inline renderer for one tool name. As
 * the local-runtime adapter streams its tool calls, these cards appear *inside*
 * the assistant's message — the generative-UI pattern assistant-ui is built for.
 *
 * Prior art: assistant-ui makeAssistantToolUI
 * (https://github.com/assistant-ui/assistant-ui).
 */

import type { ReactNode } from "react";
import { makeAssistantToolUI, type ToolCallMessagePartStatus } from "@assistant-ui/react";
import type {
  ContextToolResult,
  MemoToolResult,
  ModelToolResult,
  SearchToolResult,
} from "../runtime/nodeAgentChatAdapter";

function ToolCard({
  icon,
  label,
  sub,
  running,
  status,
  children,
}: {
  icon: string;
  label: string;
  sub?: string;
  running: boolean;
  status: ToolCallMessagePartStatus;
  children?: ReactNode;
}) {
  const interrupted = running && status.type === "incomplete";
  const interruptedLabel = interrupted ? (status.reason === "cancelled" ? "stopped" : status.reason === "error" ? "failed" : "interrupted") : null;
  return (
    <div className="na-tool" data-running={running && !interrupted ? "true" : "false"} data-interrupted={interrupted ? "true" : "false"}>
      <div className="na-tool-h">
        <span className="na-tool-i" aria-hidden>
          {icon}
        </span>
        <span className="na-tool-label">{label}</span>
        {interrupted ? (
          <span className="na-tool-status na-interrupted">{interruptedLabel}</span>
        ) : running ? (
          <span className="na-tool-status na-running">
            <i className="na-spin" aria-hidden /> working…
          </span>
        ) : (
          <span className="na-tool-status na-done">{sub ?? "done"}</span>
        )}
      </div>
      {!running && children ? <div className="na-tool-b">{children}</div> : null}
    </div>
  );
}

/* 1 — collect_context */
const ContextToolUI = makeAssistantToolUI<{ focus: string }, ContextToolResult>({
  toolName: "collect_context",
  render: ({ result, status }) => (
    <ToolCard status={status}
      icon="💬"
      label="Gather room context"
      running={!result}
      sub={result ? `${result.items.length} items · ${result.activeParticipants} active` : undefined}
    >
      {result?.items.map((it, i) => (
        <div className="na-ctx" key={i}>
          <span className="na-rel mono">{it.relevance.toFixed(2)}</span>
          <span className="na-kind">{it.kind}</span>
          <span className="na-txt">{it.text}</span>
        </div>
      ))}
    </ToolCard>
  ),
});

/* 2 — search_synthesize */
const SearchToolUI = makeAssistantToolUI<{ query: string }, SearchToolResult>({
  toolName: "search_synthesize",
  render: ({ result, status }) => (
    <ToolCard status={status}
      icon="🔎"
      label="Search & synthesize"
      running={!result}
      sub={result ? `${result.confidence} · grounded ${result.groundedCount}/${result.sources.length}` : undefined}
    >
      {result?.sources.map((s) => (
        <div className={`na-src${s.winner ? " win" : ""}`} key={s.id}>
          <span className="na-badge mono">{s.kind}</span>
          <span className="na-src-t">
            [{s.citation}] {s.title}
          </span>
          <span className="na-g mono">{s.grounding.toFixed(2)}</span>
        </div>
      ))}
      {result?.answer ? (
        <div className="na-answer">{result.answer}</div>
      ) : result ? (
        <div className="na-answer na-faint">{result.note}</div>
      ) : null}
    </ToolCard>
  ),
});

/* 3 — apply_spreadsheet_delta */
const SpreadsheetToolUI = makeAssistantToolUI<{ sheet: string }, ModelToolResult>({
  toolName: "apply_spreadsheet_delta",
  render: ({ result, status }) => {
    const changed = new Set((result?.applied?.changes ?? []).map((c) => c.address));
    return (
      <ToolCard status={status}
        icon="▦"
        label="Update model"
        running={!result}
        sub={result ? `v${result.model.version} · ${result.applied?.changes.length ?? 0} cells` : undefined}
      >
        <table className="na-sheet mono">
          <tbody>
            {result &&
              Object.values(result.model.cells).map((c) => (
                <tr key={c.address}>
                  <td>{c.label ?? c.address}</td>
                  <td className={changed.has(c.address) ? "na-delta" : ""}>{c.value}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {result?.applied?.reason ? (
          <div className="na-reason mono">↳ {result.applied.reason}</div>
        ) : null}
      </ToolCard>
    );
  },
});

/* 4 — write_memo */
const MemoToolUI = makeAssistantToolUI<{ title: string }, MemoToolResult>({
  toolName: "write_memo",
  render: ({ result, status }) => (
    <ToolCard status={status}
      icon="✎"
      label="Write memo"
      running={!result}
      sub={result ? `${result.blocks.length} blocks` : undefined}
    >
      <div className="na-memo">
        {result?.blocks.map((b) => {
          // h2, not h4: the memo title sits one level under the page <h1>. As
          // an h4 it skipped two levels and axe reported "heading-order" — a
          // screen-reader user jumping by heading would hear the memo
          // announced as a sub-sub-section of nothing.
          if (b.type === "heading") return <h2 key={b.id}>{b.text}</h2>;
          if (b.type === "claim")
            return (
              <div className="na-claim" key={b.id}>
                <div className="na-claim-t mono">◆ Claim · grounded {b.groundedRatio}</div>
                {b.text}
              </div>
            );
          if (b.type === "citation")
            return (
              <p className="na-cite-line" key={b.id}>
                ⌗ {b.text}
              </p>
            );
          return <p key={b.id}>{b.text}</p>;
        })}
      </div>
    </ToolCard>
  ),
});

/** Render once to register all four tool UIs with the runtime. */
export function NodeAgentToolUIs() {
  return (
    <>
      <ContextToolUI />
      <SearchToolUI />
      <SpreadsheetToolUI />
      <MemoToolUI />
    </>
  );
}
