/**
 * NodeAgentDemoApp — the React surface for the agent loop.
 *
 * A compact, live counterpart to nodeagent-v1.html: it imports the SAME ported
 * modules and renders a real AgentRunResult. Editing the question re-runs the
 * grounded pipeline, so the grounding/winner actually responds to input.
 */

import { useMemo, useState } from "react";
import { runNodeAgent } from "../runtime/nodeAgentRuntime";
import { applySpreadsheetDelta } from "../../spreadsheet/applySpreadsheetDelta";
import { buildDemoScenario, DEMO_QUESTION } from "../demoScenario";
import type { AgentRunResult, SpreadsheetModel } from "../types/nodeAgentTypes";

interface RunState {
  result: AgentRunResult;
  model: SpreadsheetModel;
}

function execute(question: string): RunState {
  const scenario = buildDemoScenario();
  const result = runNodeAgent({ ...scenario, question });
  // Apply the same delta for display so the table shows post-delta values.
  let model = scenario.model!;
  if (scenario.modelDelta) {
    const r = applySpreadsheetDelta(model, scenario.modelDelta, scenario.now);
    if (r.ok) model = r.model;
  }
  return { result, model };
}

export function NodeAgentDemoApp() {
  const [question, setQuestion] = useState(DEMO_QUESTION);
  const [run, setRun] = useState<RunState>(() => execute(DEMO_QUESTION));
  const { result, model } = run;

  const groundedRatio = useMemo(
    () => `${result.synthesis.groundedCount}/${result.synthesis.sources.length}`,
    [result],
  );

  return (
    <div className="app">
      <header className="app-head">
        <span className="brand">
          <span className="dot" aria-hidden />
          NodeAgent <span className="ver mono">React demo</span>
        </span>
        <span className="spacer" />
        <a className="btn btn-ghost" href="/nodeagent-v1.html">
          Open full prototype →
        </a>
      </header>
      <p className="lead">
        The same four ported modules — context collector, grounded search,
        versioned spreadsheet, notebook — composed into one loop. Edit the
        question and re-run; grounding responds to what you ask.
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Question"
          style={{
            flex: 1,
            minWidth: 240,
            background: "var(--bg)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)",
            padding: "10px 13px",
            color: "var(--ink)",
            fontSize: 13,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") setRun(execute(question));
          }}
        />
        <button className="btn btn-primary" onClick={() => setRun(execute(question))}>
          ▶ Run the agent
        </button>
      </div>

      {/* Trace */}
      <div className="card span2" style={{ marginTop: 16 }}>
        <h3>
          Trace — overall:{" "}
          <span style={{ color: result.status === "ok" ? "var(--green)" : "var(--accent)" }}>
            {result.status}
          </span>
        </h3>
        <div className="trace">
          {result.steps.map((s) => (
            <span key={s.name} className={`tstep ${s.status}`}>
              {s.name} <span className="d">{s.detail}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid">
        {/* Search */}
        <div className="card">
          <h3>
            Search &amp; synthesize — {result.synthesis.confidence} · grounded {groundedRatio}
          </h3>
          {result.synthesis.sources.map((s) => (
            <div key={s.id} className={`src ${s.winner ? "win" : ""}`}>
              <span className="badge">{s.kind}</span>
              <div>
                <div className="t">
                  [{s.citation}] {s.title}
                </div>
                <div className="s">{s.snippet}</div>
              </div>
              <span className="g">{s.grounding.toFixed(2)}</span>
            </div>
          ))}
          {result.synthesis.answer ? (
            <div className="answer">{result.synthesis.answer}</div>
          ) : (
            <div className="answer" style={{ color: "var(--ink-faint)" }}>
              {result.synthesis.note}
            </div>
          )}
        </div>

        {/* Model */}
        <div className="card">
          <h3>Spreadsheet model — versioned</h3>
          <div className="vrow">
            <span className="vchip">v{model.version}</span>
            <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>
              {result.modelDelta
                ? `${result.modelDelta.changes.length} cells changed`
                : "no change"}
            </span>
          </div>
          <table>
            <tbody>
              {Object.values(model.cells).map((c) => {
                const changed = result.modelDelta?.changes.some((ch) => ch.address === c.address);
                return (
                  <tr key={c.address}>
                    <td>{c.label ?? c.address}</td>
                    <td className={changed ? "delta" : ""}>{c.value}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Memo */}
        <div className="card span2">
          <h3>Notebook memo</h3>
          <div className="memo">
            {result.memo.blocks.map((b) => {
              if (b.type === "heading") return <h4 key={b.id}>{b.text}</h4>;
              if (b.type === "claim")
                return (
                  <div key={b.id} className="claim">
                    <div className="ct">◆ Claim · grounded {b.groundedRatio}</div>
                    {b.text}
                  </div>
                );
              if (b.type === "citation")
                return (
                  <p key={b.id} style={{ color: "var(--ink-muted)", fontSize: 12 }}>
                    ⌗ {b.text}
                  </p>
                );
              return <p key={b.id}>{b.text}</p>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
