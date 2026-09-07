/** Readable entities and optional spatial exploration of one live session. */
import { useId, useState, useSyncExternalStore } from "react";
import type { GraphEdge } from "../../../../vendor/nodegraph-live/index.js";
import { NodeGraph } from "../../../../vendor/nodegraph-live/react.js";
import { graphSession } from "../graph/agentGraphSession";

export function GraphRailPanel() {
  const snapshot = useSyncExternalStore(
    graphSession.subscribe,
    graphSession.getSnapshot,
    graphSession.getSnapshot,
  );
  const [view, setView] = useState<"list" | "map">("list");
  const id = useId();
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const adjacent = new Map(snapshot.nodes.map((node) => [node.id, [] as GraphEdge[]]));
  for (const edge of snapshot.edges) {
    adjacent.get(edge.source)!.push(edge);
    adjacent.get(edge.target)!.push(edge);
  }

  return (
    <aside
      className="na-rail"
      aria-labelledby={`${id}-title`}
      data-testid="graph-rail"
      data-entities={snapshot.nodes.length}
      data-edges={snapshot.edges.length}
    >
      <div className="na-rail-head">
        <h2 id={`${id}-title`}>Session graph</h2>
        <span className="na-rail-meta mono">
          {snapshot.nodes.length} entities · {snapshot.edges.length} relationships
        </span>
      </div>
      <div className="na-graph-views" role="group" aria-label="Session graph view">
        <button type="button" aria-pressed={view === "list"} aria-controls={`${id}-view`} onClick={() => setView("list")}>List</button>
        <button type="button" aria-pressed={view === "map"} aria-controls={`${id}-view`} onClick={() => setView("map")}>Map</button>
      </div>
      <div id={`${id}-view`}>
        {snapshot.nodes.length === 0 ? (
          <p className="na-rail-empty">
            Ask the room a question — each loop step streams the entities it
            actually touched into this graph.
          </p>
        ) : view === "list" ? (
          <ul className="na-graph-list" data-testid="graph-entity-list" aria-label="Session entities">
            {snapshot.nodes.map((node) => (
              <li key={node.id}>
                <details data-node-id={node.id}>
                  <summary>
                    <span className="na-entity-label">{node.label}</span>
                    <span className="na-entity-kind">{node.type}</span>
                  </summary>
                  <div className="na-entity-body">
                    <dl className="na-entity-counts">
                      <dt>Measured count</dt>
                      <dd>{node.count === undefined ? "unknown — not measured" : node.count.toLocaleString()}</dd>
                      <dt>Visits</dt>
                      <dd>{node.visits.toLocaleString()} — activity, not evidence strength</dd>
                    </dl>
                    {adjacent.get(node.id)!.length === 0 ? (
                      <p>No relationships observed for this entity.</p>
                    ) : (
                      <ul className="na-relationships" aria-label={`Relationships for ${node.label}`}>
                        {adjacent.get(node.id)!.map((edge) => {
                          const other = nodes.get(edge.source === node.id ? edge.target : edge.source)!;
                          const key = JSON.stringify([...([edge.source, edge.target].sort()), edge.type]);
                          return (
                            <li key={key} data-edge-key={key}>
                              <span className="na-related-label">{other.label}</span>
                              <span className="na-entity-kind">{other.type}</span>
                              <strong className="na-relationship-type">{edge.type}</strong>
                              {edge.type === "assertion" ? (
                                <p>Curated claim · {edge.receipt.source} · {edge.receipt.release} · <a href={edge.receipt.url} target="_blank" rel="noreferrer">Receipt</a></p>
                              ) : edge.type === "evidence" ? (
                                <p>Measurement: {edge.weight.toLocaleString()}</p>
                              ) : (
                                <p>Observed together: {edge.weight.toLocaleString()} times — activity, not evidence.</p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <div className="na-rail-graph">
            <p className="na-map-help">Explore connections here. Use List for full names and all typed relationships.</p>
            <NodeGraph
              nodes={snapshot.nodes}
              edges={snapshot.edges}
              visits={graphSession.visitsById()}
              dark
              height={440}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
