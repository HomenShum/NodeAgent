/**
 * Spreadsheet delta engine + versioned sync — scenario-based tests.
 *
 * Personas:
 *   - Analyst correcting an assumption (happy path + recompute)
 *   - Two teammates editing concurrently (rebase vs conflict)
 *   - An agent in a loop hammering the model (accumulation + bounds)
 *   - Adversarial input (divide-by-zero, garbage formula, oversized delta)
 */

import { describe, it, expect } from "vitest";
import {
  applySpreadsheetDelta,
  createModel,
  evalFormula,
  MAX_OPS,
} from "../src/features/spreadsheet/applySpreadsheetDelta";
import { VersionedSpreadsheetSync } from "../src/features/spreadsheet/versionedSpreadsheetSync";
import type { SpreadsheetDelta } from "../src/features/node-agent/types/nodeAgentTypes";

const NOW = 1_750_000_000_000;

function runwayModel(burn = 510) {
  return createModel({
    id: "runway",
    name: "Cash-runway",
    cells: [
      { address: "B1", label: "burn", value: burn },
      { address: "B2", label: "cash", value: 7560 },
      { address: "B3", label: "runway", formula: "B2 / B1" },
    ],
    now: NOW,
  });
}

const setBurn = (baseVersion: number, value: number): SpreadsheetDelta => ({
  baseVersion,
  author: "analyst",
  ops: [{ kind: "set", address: "B1", value }],
});

describe("createModel + recompute", () => {
  it("resolves formulas on creation (7560 / 510 = 14.82)", () => {
    const m = runwayModel();
    expect(m.version).toBe(1);
    expect(m.cells.B3.value).toBeCloseTo(14.823, 2);
  });
});

describe("happy path: analyst corrects the burn assumption", () => {
  it("applies a set, bumps version, recomputes the dependent runway to 18.0", () => {
    const m = runwayModel();
    const res = applySpreadsheetDelta(m, setBurn(1, 420), NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model.version).toBe(2);
    expect(res.model.cells.B3.value).toBe(18);
    // Audit captures BOTH the edited cell and the recomputed dependent.
    const addrs = res.applied.changes.map((c) => c.address).sort();
    expect(addrs).toEqual(["B1", "B3"]);
    const runway = res.applied.changes.find((c) => c.address === "B3");
    expect(runway).toMatchObject({ from: expect.any(Number), to: 18 });
  });

  it("does not mutate the input model (immutability)", () => {
    const m = runwayModel();
    applySpreadsheetDelta(m, setBurn(1, 420), NOW);
    expect(m.version).toBe(1);
    expect(m.cells.B1.value).toBe(510);
  });
});

describe("optimistic concurrency (HONEST_STATUS)", () => {
  it("rejects a stale base version as a conflict, not a silent overwrite", () => {
    const m = runwayModel();
    const res = applySpreadsheetDelta(m, setBurn(99, 420), NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.conflict).toBe(true);
    if (res.conflict) {
      expect(res.expected).toBe(99);
      expect(res.actual).toBe(1);
    }
  });
});

describe("bounds (BOUND)", () => {
  it("rejects an empty delta", () => {
    const res = applySpreadsheetDelta(runwayModel(), { baseVersion: 1, author: "x", ops: [] }, NOW);
    expect(res).toMatchObject({ ok: false, conflict: false, error: "empty_delta" });
  });

  it("rejects a delta exceeding MAX_OPS", () => {
    const ops = Array.from({ length: MAX_OPS + 1 }, (_, i) => ({ kind: "set" as const, address: `Z${i}`, value: i }));
    const res = applySpreadsheetDelta(runwayModel(), { baseVersion: 1, author: "x", ops }, NOW);
    expect(res).toMatchObject({ ok: false, error: "too_many_ops" });
  });
});

describe("adversarial formulas (HONEST math — no NaN/Infinity)", () => {
  it("divide-by-zero yields null, so the cell keeps its prior value", () => {
    const cells = { B1: { address: "B1", value: 0 }, B2: { address: "B2", value: 10 } };
    expect(evalFormula("B2 / B1", cells)).toBeNull();
  });
  it("rejects garbage / injection-y formulas", () => {
    const cells = { A1: { address: "A1", value: 1 } };
    expect(evalFormula("A1; DROP TABLE", cells)).toBeNull();
    expect(evalFormula("A1 + ", cells)).toBeNull();
    expect(evalFormula("", cells)).toBeNull();
  });
  it("respects operator precedence and parentheses", () => {
    const cells = { A1: { address: "A1", value: 2 }, A2: { address: "A2", value: 3 } };
    expect(evalFormula("A1 + A2 * 2", cells)).toBe(8);
    expect(evalFormula("(A1 + A2) * 2", cells)).toBe(10);
  });
});

describe("versioned sync: two teammates editing concurrently", () => {
  it("auto-rebases a non-overlapping concurrent edit and merges it", () => {
    const sync = new VersionedSpreadsheetSync(runwayModel());
    // Teammate A edits burn (B1) -> version 2
    expect(sync.commit(setBurn(1, 420), NOW).ok).toBe(true);
    expect(sync.version).toBe(2);
    // Teammate B edits cash (B2) but still based on version 1 — disjoint cell, safe to rebase.
    const editCash: SpreadsheetDelta = { baseVersion: 1, author: "B", ops: [{ kind: "set", address: "B2", value: 8000 }] };
    const out = sync.commit(editCash, NOW);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.rebased).toBe(true);
    expect(sync.version).toBe(3);
    expect(sync.model.cells.B1.value).toBe(420); // A preserved
    expect(sync.model.cells.B2.value).toBe(8000); // B merged
  });

  it("surfaces a genuine conflict when both edit the same cell on a stale base", () => {
    const sync = new VersionedSpreadsheetSync(runwayModel());
    sync.commit(setBurn(1, 420), NOW); // A -> v2 (touched B1)
    const out = sync.commit(setBurn(1, 600), NOW); // B also edits B1 on stale base
    expect(out.ok).toBe(false);
    if (!out.ok && out.conflict) expect(out.cells).toContain("B1");
  });
});

describe("long-running accumulation (agent loop)", () => {
  it("stays monotonic and bounded over many sequential deltas", () => {
    const sync = new VersionedSpreadsheetSync(runwayModel());
    for (let i = 0; i < 50; i++) {
      const out = sync.commit(setBurn(sync.version, 400 + i), NOW + i);
      expect(out.ok).toBe(true);
    }
    expect(sync.version).toBe(51);
    expect(sync.model.cells.B3.value).toBeCloseTo(7560 / 449, 2);
    // Most-recent-first log, every entry present and bounded.
    expect(sync.log.length).toBe(50);
    expect(sync.log[0].toVersion).toBe(51);
  });
});

describe("determinism (DETERMINISTIC)", () => {
  it("same ops + same clock => identical applied result", () => {
    const a = applySpreadsheetDelta(runwayModel(), setBurn(1, 420), NOW);
    const b = applySpreadsheetDelta(runwayModel(), setBurn(1, 420), NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
