import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Boxes,
  Braces,
  CheckCircle2,
  Database,
  KeyRound,
  Lock,
  Play,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import "./styles.css";

const seedState = {
  generatedAt: "loading",
  mode: "scripted",
  apiKeysRequired: false,
  database: { provider: "sqlite-local", path: ".nodeagent/nodeagent.sqlite", ready: false },
  capabilities: { builderCapable: false, codeOwnership: "locked" },
  statusCards: [
    { label: "Agent", value: "scripted", detail: "deterministic local runner" },
    { label: "Durability", value: "SQLite", detail: "local database" },
    { label: "Credentials", value: "none", detail: "no API keys required" },
  ],
  jobs: [],
  surfaces: [],
  proofs: [],
  traces: [],
  artifacts: [],
};

function App() {
  const [state, setState] = useState(seedState);
  const [activeSurfaceId, setActiveSurfaceId] = useState("workSurface.traceStrip");
  const [activeMode, setActiveMode] = useState("review");

  useEffect(() => {
    fetch("/nodeagent-state.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : seedState))
      .then((nextState) => {
        setState(nextState);
        if (nextState.surfaces?.[0]?.id) setActiveSurfaceId(nextState.surfaces[0].id);
      })
      .catch(() => setState(seedState));
  }, []);

  const activeSurface = useMemo(
    () => state.surfaces.find((surface) => surface.id === activeSurfaceId) ?? state.surfaces[0],
    [activeSurfaceId, state.surfaces],
  );

  return (
    <main className="appShell">
      <aside className="sidebar" aria-label="Local dashboard navigation">
        <div className="brand">
          <div className="brandMark">NA</div>
          <div>
            <strong>NodeAgent</strong>
            <span>Local Dashboard</span>
          </div>
        </div>
        <nav className="navList">
          {[
            ["Room", Boxes],
            ["Runs", Play],
            ["Trace", Braces],
            ["Data", Database],
          ].map(([label, Icon]) => (
            <button key={label} type="button" className={label === "Trace" ? "navItem active" : "navItem"}>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebarNote">
          <KeyRound size={16} aria-hidden="true" />
          <span>No API keys required for the scripted SQLite path.</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar" data-noderoom-surface="shell.statusStrip">
          <div>
            <p className="eyebrow">Local-first agent runtime</p>
            <h1>Traceable dashboard scaffold</h1>
          </div>
          <div className="topbarActions">
            <span className="pill">
              <ShieldCheck size={15} aria-hidden="true" />
              {state.mode}
            </span>
            <span className="pill muted">
              <Database size={15} aria-hidden="true" />
              {state.database.provider}
            </span>
          </div>
        </header>

        <section className="statusGrid" aria-label="Runtime status">
          {state.statusCards.map((card) => (
            <article key={card.label} className="statBlock">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </article>
          ))}
        </section>

        <section className="mainGrid">
          <div className="workColumn">
            <section className="sectionBand" aria-label="Current run">
              <div className="sectionHeader">
                <div>
                  <p className="eyebrow">Run</p>
                  <h2>{state.jobs[0]?.title ?? "Local dashboard happy path"}</h2>
                </div>
                <span className="statusBadge">{state.jobs[0]?.status ?? "ready"}</span>
              </div>
              <p className="bodyText">
                {state.jobs[0]?.summary ??
                  "Run npm run agent:demo to write a SQLite receipt and refresh the dashboard state."}
              </p>
              <div className="commandStrip">
                <TerminalSquare size={18} aria-hidden="true" />
                <code>npm run agent:demo && npm run dev</code>
              </div>
            </section>

            <section className="surfaceList" aria-label="Inspectable surfaces">
              {state.surfaces.map((surface) => (
                <button
                  key={surface.id}
                  type="button"
                  className={surface.id === activeSurfaceId ? "surfaceRow selected" : "surfaceRow"}
                  data-noderoom-surface={surface.id}
                  onClick={() => setActiveSurfaceId(surface.id)}
                >
                  <span>
                    <strong>{surface.label}</strong>
                    <small>{surface.description}</small>
                  </span>
                  <em>{surface.status}</em>
                </button>
              ))}
            </section>
          </div>

          <TraceLens
            activeMode={activeMode}
            activeSurface={activeSurface}
            capabilities={state.capabilities}
            proofs={state.proofs}
            setActiveMode={setActiveMode}
            traces={state.traces}
          />
        </section>
      </section>
    </main>
  );
}

function TraceLens({ activeMode, activeSurface, capabilities, proofs, setActiveMode, traces }) {
  const builderLocked = !capabilities.builderCapable;

  return (
    <aside className="traceLens" data-noderoom-surface={activeSurface?.id ?? "workSurface.traceStrip"}>
      <div className="traceHeader">
        <div>
          <p className="eyebrow">Trace Lens</p>
          <h2>{activeSurface?.label ?? "Trace strip"}</h2>
        </div>
        <CheckCircle2 size={20} aria-hidden="true" />
      </div>

      <div className="modeTabs" role="tablist" aria-label="Trace modes">
        <button
          type="button"
          className={activeMode === "review" ? "active" : ""}
          onClick={() => setActiveMode("review")}
        >
          Review
        </button>
        <button
          type="button"
          className={activeMode === "builder" ? "active" : ""}
          onClick={() => setActiveMode("builder")}
        >
          Builder
          {builderLocked ? <Lock size={13} aria-hidden="true" /> : null}
        </button>
      </div>

      {activeMode === "builder" && builderLocked ? (
        <section className="lockedPanel">
          <Lock size={22} aria-hidden="true" />
          <h3>Builder mode is gated</h3>
          <p>
            Keep code provenance on the server until this app has an explicit privileged route. Review mode remains fully usable.
          </p>
        </section>
      ) : (
        <>
          <TraceSection title="Business proof">
            <div className="proofStack">
              {proofs.map((proof) => (
                <article key={proof.id} className="proofItem">
                  <div>
                    <strong>{proof.title}</strong>
                    <small>{proof.source}</small>
                  </div>
                  <span>{Math.round(proof.confidence * 100)}%</span>
                  <p>{proof.detail}</p>
                </article>
              ))}
            </div>
          </TraceSection>

          <TraceSection title="Runtime trace">
            <ol className="traceRows">
              {traces.map((trace) => (
                <li key={trace.id}>
                  <span>{trace.phase}</span>
                  <strong>{trace.summary}</strong>
                  <em>{trace.durationMs}ms</em>
                </li>
              ))}
            </ol>
          </TraceSection>

          <TraceSection title="Code ownership">
            <div className="ownership">
              <Lock size={18} aria-hidden="true" />
              <span>{capabilities.codeOwnership === "locked" ? "Locked until privileged builder access exists." : "Available"}</span>
            </div>
          </TraceSection>
        </>
      )}
    </aside>
  );
}

function TraceSection({ children, title }) {
  return (
    <section className="traceSection">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
