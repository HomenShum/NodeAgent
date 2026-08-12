/**
 * GraphRailPanel — the live session graph as a right-rail panel.
 *
 * Renders the vendored @homenshum/nodegraph-live <NodeGraph> over the one
 * per-app-session GraphSession. Data arrives via useSyncExternalStore, so the
 * rail streams as the agent loop feeds `session.observe(...)` step by step.
 * Edge grammar is the renderer's, not ours: measured evidence, curated
 * assertions (never emitted here — see agentGraphSession.ts), and traversal
 * history never look alike.
 */

import { useSyncExternalStore } from "react";
import { NodeGraph } from "../../../../vendor/nodegraph-live/react.js";
import { graphSession } from "../graph/agentGraphSession";

export function GraphRailPanel() {
  const snapshot = useSyncExternalStore(
    graphSession.subscribe,
    graphSession.getSnapshot,
    graphSession.getSnapshot,
  );

  return (
    <aside
      className="na-rail"
      data-testid="graph-rail"
      data-entities={snapshot.nodes.length}
      data-edges={snapshot.edges.length}
    >
      <div className="na-rail-head">
        <span>Session graph</span>
        <span className="na-rail-meta mono">
          {snapshot.nodes.length} entities · {snapshot.edges.length} edges
        </span>
      </div>
      {snapshot.nodes.length === 0 ? (
        <p className="na-rail-empty">
          Ask the room a question — each loop step streams the entities it
          actually touched into this graph.
        </p>
      ) : (
        <div className="na-rail-graph">
          <NodeGraph
            nodes={snapshot.nodes}
            edges={snapshot.edges}
            visits={graphSession.visitsById()}
            dark
            height={440}
          />
        </div>
      )}
    </aside>
  );
}
