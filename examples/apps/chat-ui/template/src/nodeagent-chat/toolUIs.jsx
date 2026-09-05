import { makeAssistantToolUI } from "@assistant-ui/react";

function ToolCard({ children, label, running, status, sub }) {
  const interrupted = running && status.type === "incomplete";
  const interruptedLabel = interrupted ? (status.reason === "cancelled" ? "stopped" : status.reason === "error" ? "failed" : "interrupted") : null;
  return (
    <section className="naTool" data-running={running && !interrupted ? "true" : "false"} data-interrupted={interrupted ? "true" : "false"}>
      <header>
        <strong>{label}</strong>
        <span>{interruptedLabel ?? (running ? "working" : sub ?? "done")}</span>
      </header>
      {!running && children ? <div className="naToolBody">{children}</div> : null}
    </section>
  );
}

export const ContextToolUI = makeAssistantToolUI({
  toolName: "collect_context",
  render: ({ result, status }) => (
    <ToolCard status={status} label="Gather context" running={!result} sub={result ? `${result.items.length} items` : undefined}>
      {result?.items.map((item, index) => (
        <p className="naContextRow" key={index}>
          <span>{item.relevance.toFixed(2)}</span>
          <strong>{item.kind}</strong>
          {item.text}
        </p>
      ))}
    </ToolCard>
  ),
});

export const SearchToolUI = makeAssistantToolUI({
  toolName: "search_synthesize",
  render: ({ result, status }) => (
    <ToolCard status={status}
      label="Search and synthesize"
      running={!result}
      sub={result ? `${result.confidence} confidence` : undefined}
    >
      {result?.sources.map((source) => (
        <div className={source.winner ? "naSource naSourceWin" : "naSource"} key={source.id}>
          <span>{source.kind}</span>
          <strong>[{source.citation}] {source.title}</strong>
          <em>{source.grounding.toFixed(2)}</em>
        </div>
      ))}
      {result?.answer ? <p className="naAnswer">{result.answer}</p> : null}
    </ToolCard>
  ),
});

export const ModelToolUI = makeAssistantToolUI({
  toolName: "apply_model_delta",
  render: ({ result, status }) => {
    const changed = new Set((result?.applied?.changes ?? []).map((change) => change.address));
    return (
      <ToolCard status={status}
        label="Apply model delta"
        running={!result}
        sub={result ? `v${result.model.version}` : undefined}
      >
        <table className="naModelTable">
          <tbody>
            {result &&
              Object.values(result.model.cells).map((cell) => (
                <tr key={cell.address}>
                  <td>{cell.label}</td>
                  <td className={changed.has(cell.address) ? "changed" : ""}>{cell.value}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {result?.applied?.reason ? <p className="naReason">{result.applied.reason}</p> : null}
      </ToolCard>
    );
  },
});

export const MemoToolUI = makeAssistantToolUI({
  toolName: "write_memo",
  render: ({ result, status }) => (
    <ToolCard status={status} label="Write memo" running={!result} sub={result ? `${result.blocks.length} blocks` : undefined}>
      <div className="naMemo">
        {result?.blocks.map((block) => {
          if (block.type === "heading") return <h3 key={block.id}>{block.text}</h3>;
          if (block.type === "claim") {
            return (
              <blockquote key={block.id}>
                <strong>Claim {block.groundedRatio}</strong>
                {block.text}
              </blockquote>
            );
          }
          return <p key={block.id}>{block.text}</p>;
        })}
      </div>
    </ToolCard>
  ),
});

export function NodeAgentToolUIs() {
  return (
    <>
      <ContextToolUI />
      <SearchToolUI />
      <ModelToolUI />
      <MemoToolUI />
    </>
  );
}
