import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphSession } from "../vendor/nodegraph-live/session.js";
import { GraphRailPanel } from "../src/features/node-agent/components/GraphRailPanel";

const fixture = vi.hoisted(() => ({ session: null as GraphSession | null }));
vi.mock("../src/features/node-agent/graph/agentGraphSession", () => ({
  graphSession: {
    subscribe: (listener: () => void) => fixture.session!.subscribe(listener),
    getSnapshot: () => fixture.session!.getSnapshot(),
    visitsById: () => fixture.session!.visitsById(),
  },
}));
vi.mock("../vendor/nodegraph-live/react.js", () => ({
  NodeGraph: () => { throw new Error("The default reading view must not mount a canvas"); },
}));

beforeEach(() => { fixture.session = new GraphSession(); });
const render = () => renderToStaticMarkup(createElement(GraphRailPanel));
const room = { kind: "room", label: "Acme diligence" };
const source = { kind: "source", label: "Runway evidence" };

describe("an analyst reading the retained session", () => {
  it("starts with an honest empty view and native view controls", () => {
    const html = render();
    expect(html).toContain("Ask the room a question");
    expect(html).toMatch(/aria-pressed="true"[^>]*>List<\/button>/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Map<\/button>/);
    expect(html).not.toContain("graph-entity-list");
    expect(fixture.session!.stats().nodes).toBe(0);
  });

  it("keeps unknown and measured zero distinct for equal names of different kinds", () => {
    fixture.session!.observe([{ kind: "room", label: "Acme", count: 0 }]);
    fixture.session!.observe([{ kind: "source", label: "Acme" }]);
    const html = render();
    expect(html.match(/<summary>/g)).toHaveLength(2);
    expect(html).toContain('class="na-entity-kind">room</span>');
    expect(html).toContain('class="na-entity-kind">source</span>');
    expect(html).toContain("<dt>Measured count</dt><dd>0</dd>");
    expect(html).toContain("<dt>Measured count</dt><dd>unknown — not measured</dd>");
    expect(html).toContain("No relationships observed for this entity.");
  });

  it("reads both measurement and activity for the same pair without changing either", () => {
    fixture.session!.observe([room, source], 0, { eventId: "measurement" });
    fixture.session!.observe([room, source], undefined, { eventId: "activity-1" });
    fixture.session!.observe([room, source], undefined, { eventId: "activity-2" });
    const before = JSON.stringify(fixture.session!.getSnapshot());
    const html = render();
    expect(html).toContain("2 entities · 2 relationships");
    expect(html.match(/data-edge-key=/g)).toHaveLength(4);
    expect(html.match(/>evidence<\/strong>/g)).toHaveLength(2);
    expect(html.match(/>traversal<\/strong>/g)).toHaveLength(2);
    expect(html).toContain("Measurement: 0");
    expect(html).toContain("Observed together: 2 times — activity, not evidence.");
    expect(html).toContain("3 — activity, not evidence strength");
    expect(JSON.stringify(fixture.session!.getSnapshot())).toBe(before);
  });

  it("retains long and HTML-like labels as complete text rather than markup or links", () => {
    const label = 'Finance_<script>alert("example")</script>_' + "long_unbroken_source_".repeat(12);
    fixture.session!.observe([{ kind: "source", label }]);
    const html = render();
    expect(html).toContain('Finance_&lt;script&gt;alert(&quot;example&quot;)&lt;/script&gt;_' + "long_unbroken_source_".repeat(12));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<a ");
  });

  it("shows a supplied curated receipt without presenting its weight as a measurement", () => {
    fixture.session!.assertEdge(room, source, {
      source: "Example registry", release: "2026-09",
      subjectId: "room-1", objectId: "source-1", url: "https://example.invalid/receipt/1",
    }, { weight: 99 });
    const html = render();
    expect(html).toContain("Curated claim · Example registry · 2026-09");
    expect(html).toContain('href="https://example.invalid/receipt/1" target="_blank" rel="noreferrer">Receipt</a>');
    expect(html).not.toContain("Measurement: 99");
  });

  it("reads the updated snapshot after repeated work without keeping a stale count", () => {
    fixture.session!.observe([{ ...room, count: 8 }], undefined, { eventId: "first" });
    expect(render()).toContain("<dt>Measured count</dt><dd>8</dd>");
    for (let i = 0; i < 20; i += 1) {
      fixture.session!.observe([{ ...room, count: 0 }], undefined, { eventId: `later-${i}` });
    }
    const before = JSON.stringify(fixture.session!.getSnapshot());
    const html = render();
    expect(html).toContain("1 entities · 0 relationships");
    expect(html).toContain("<dt>Measured count</dt><dd>0</dd>");
    expect(html).toContain("21 — activity, not evidence strength");
    expect(JSON.stringify(fixture.session!.getSnapshot())).toBe(before);
  });
});
