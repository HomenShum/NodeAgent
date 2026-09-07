import { describe, expect, it } from "vitest";

import {
  createNodeAgentEvent,
  validateNodeAgentEvent,
} from "../src/features/node-agent/protocol/events";

describe("nodeagent.event/v1", () => {
  it("creates a valid canonical event", () => {
    const event = createNodeAgentEvent({
      eventId: "evt-1",
      runId: "run-1",
      sequence: 0,
      type: "run.started",
      occurredAt: "2026-07-20T00:00:00.000Z",
      actor: { type: "user", id: "user-1" },
      refs: [{ kind: "artifact", id: "artifact-1", hash: "sha256:abc" }],
      payload: { objective: "Ship the vertical slice" },
    });

    expect(event.schemaVersion).toBe("nodeagent.event/v1");
    expect(validateNodeAgentEvent(event)).toEqual([]);
  });

  it("fails closed on malformed identity, sequence, type, and time", () => {
    expect(() => createNodeAgentEvent({
      eventId: "",
      runId: "",
      sequence: -1,
      type: "Run Started",
      occurredAt: "yesterday",
      payload: null,
    })).toThrow(/eventId.*runId.*sequence.*type.*occurredAt/);
  });

  it("rejects empty optional reference fields", () => {
    expect(() => createNodeAgentEvent({
      eventId: "evt-2",
      runId: "run-1",
      sequence: 1,
      type: "artifact.recorded",
      occurredAt: "2026-07-20T00:00:01.000Z",
      refs: [{ kind: "artifact", id: "artifact-1", uri: "", hash: "" }],
      payload: null,
    })).toThrow(/uri.*hash/);
  });
});
