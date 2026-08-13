/**
 * Versioned spreadsheet delta engine.
 *
 * Every edit is a tracked delta with a version bump and a before/after audit —
 * never a silent overwrite. This is the production form of the discipline a
 * banking model demands: a wrong assumption must be a defensible, reversible
 * change, not a mystery.
 *
 * Distilled from NodeBench AI `convex/domains/integrations/spreadsheets.ts`
 * (applyOperations) + the `spreadsheetEvents` operation log, reduced to pure,
 * deterministic, dependency-free TypeScript.
 *
 * Reliability (see .claude/rules/agentic_reliability.md):
 *   - BOUND:         deltas are capped (MAX_OPS) and models are capped (MAX_CELLS).
 *   - HONEST_STATUS: optimistic-concurrency conflicts are surfaced, not swallowed.
 *   - DETERMINISTIC: no Date.now() inside the math; `now` is injectable.
 */

import type {
  AppliedDelta,
  CellAddress,
  DeltaResult,
  SpreadsheetCell,
  SpreadsheetDelta,
  SpreadsheetModel,
} from "../node-agent/types/nodeAgentTypes";

export const MAX_OPS = 256;
const MAX_CELLS = 10_000;

export interface CreateModelInput {
  id: string;
  name: string;
  cells: Array<Omit<SpreadsheetCell, "value"> & { value?: number }>;
  now?: number;
}

/** Build a fresh model at version 1 with formulas resolved. */
export function createModel(input: CreateModelInput): SpreadsheetModel {
  const cells: Record<CellAddress, SpreadsheetCell> = {};
  for (const c of input.cells) {
    cells[c.address] = { ...c, value: c.value ?? 0 };
  }
  const model: SpreadsheetModel = {
    id: input.id,
    name: input.name,
    version: 1,
    cells,
    updatedAt: input.now ?? Date.now(),
  };
  recompute(model.cells);
  return model;
}

/**
 * Apply a delta with optimistic concurrency.
 *
 * Returns a discriminated result: ok, version-conflict, or a bounded error.
 * The caller decides how to reconcile a conflict (re-base, reject, or merge).
 */
export function applySpreadsheetDelta(
  model: SpreadsheetModel,
  delta: SpreadsheetDelta,
  now: number = Date.now(),
): DeltaResult {
  // BOUND — reject oversized deltas rather than process unbounded work.
  if (delta.ops.length === 0) {
    return { ok: false, conflict: false, error: "empty_delta" };
  }
  if (delta.ops.length > MAX_OPS) {
    return { ok: false, conflict: false, error: "too_many_ops" };
  }

  // HONEST_STATUS — optimistic concurrency. Stale base => conflict, not overwrite.
  if (delta.baseVersion !== model.version) {
    return {
      ok: false,
      conflict: true,
      expected: delta.baseVersion,
      actual: model.version,
    };
  }

  // Snapshot prior values for the audit (including dependents recomputed below).
  const before: Record<CellAddress, number | null> = {};
  const snapshot = (addr: CellAddress) => {
    if (!(addr in before)) before[addr] = model.cells[addr]?.value ?? null;
  };

  const next: Record<CellAddress, SpreadsheetCell> = structuredCloneCells(
    model.cells,
  );

  for (const op of delta.ops) {
    snapshot(op.address);
    const existing = next[op.address];
    switch (op.kind) {
      case "set":
        next[op.address] = {
          address: op.address,
          label: existing?.label,
          value: op.value ?? 0,
        };
        break;
      case "formula":
        next[op.address] = {
          address: op.address,
          label: existing?.label,
          value: existing?.value ?? 0,
          formula: op.formula,
        };
        break;
      case "clear":
        next[op.address] = {
          address: op.address,
          label: existing?.label,
          value: 0,
        };
        break;
      default:
        return { ok: false, conflict: false, error: "unknown_op" };
    }
  }

  if (Object.keys(next).length > MAX_CELLS) {
    return { ok: false, conflict: false, error: "model_too_large" };
  }

  // Recompute formula-dependent cells to a fixpoint (bounded passes).
  const touched = recompute(next);
  for (const addr of touched) snapshot(addr);

  // Build the audit: only cells whose value actually changed.
  const changes: AppliedDelta["changes"] = [];
  for (const addr of Object.keys(before)) {
    const from = before[addr];
    const to = next[addr]?.value ?? 0;
    if (from !== to) changes.push({ address: addr, from, to });
  }

  const applied: AppliedDelta = {
    fromVersion: model.version,
    toVersion: model.version + 1,
    changes,
    author: delta.author,
    reason: delta.reason,
    appliedAt: now,
  };

  const updated: SpreadsheetModel = {
    ...model,
    version: model.version + 1,
    cells: next,
    updatedAt: now,
  };

  return { ok: true, model: updated, applied };
}

/* ───────────────────────── formula recompute ───────────────────────── */

/**
 * Resolve every formula cell to a number, iterating to a fixpoint.
 * Returns the set of cell addresses whose value changed.
 *
 * Bounded: at most `cells.length` passes (a DAG of N nodes settles in <= N
 * passes; cycles stop at the bound and keep their last value — no infinite loop).
 */
function recompute(cells: Record<CellAddress, SpreadsheetCell>): CellAddress[] {
  const addresses = Object.keys(cells);
  const changed = new Set<CellAddress>();
  let pass = 0;
  let dirty = true;
  while (dirty && pass < addresses.length + 1) {
    dirty = false;
    pass++;
    for (const addr of addresses) {
      const cell = cells[addr];
      if (!cell.formula) continue;
      const resolved = evalFormula(cell.formula, cells);
      if (resolved !== null && resolved !== cell.value) {
        cell.value = resolved;
        changed.add(addr);
        dirty = true;
      }
    }
  }
  return [...changed];
}

/**
 * Evaluate an arithmetic formula referencing cell addresses.
 * Supports + - * / , parentheses, numbers, and cell addresses (A1 style).
 * No `eval` — a tiny recursive-descent parser keeps it safe and deterministic.
 * Returns null on parse error or divide-by-zero (cell keeps its prior value).
 */
export function evalFormula(
  formula: string,
  cells: Record<CellAddress, SpreadsheetCell>,
): number | null {
  const tokens = tokenize(formula);
  if (!tokens) return null;
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  // expr := term (('+'|'-') term)*
  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };
  // term := factor (('*'|'/') factor)*
  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const right = parseFactor();
      if (right === null) return null;
      if (op === "/" && right === 0) return null; // honest: no Infinity/NaN
      left = op === "*" ? left * right : left / right;
    }
    return left;
  };
  // factor := number | address | '(' expr ')'
  const parseFactor = (): number | null => {
    const t = next();
    if (t === undefined) return null;
    if (t === "(") {
      const inner = parseExpr();
      if (inner === null || next() !== ")") return null;
      return inner;
    }
    if (/^-?\d/.test(t)) return Number(t);
    if (/^[A-Za-z]+\d+$/.test(t)) {
      const ref = cells[t];
      return ref ? ref.value : null;
    }
    return null;
  };

  const result = parseExpr();
  return pos === tokens.length && result !== null ? round(result) : null;
}

function tokenize(formula: string): string[] | null {
  const tokens: string[] = [];
  const re = /\s*([A-Za-z]+\d+|\d+\.?\d*|[()+\-*/])/y;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(formula)) !== null) {
    tokens.push(m[1]);
    consumed = re.lastIndex;
  }
  // Reject trailing garbage the tokenizer couldn't consume.
  return consumed === formula.length && tokens.length > 0 ? tokens : null;
}

function structuredCloneCells(
  cells: Record<CellAddress, SpreadsheetCell>,
): Record<CellAddress, SpreadsheetCell> {
  const out: Record<CellAddress, SpreadsheetCell> = {};
  for (const [k, v] of Object.entries(cells)) out[k] = { ...v };
  return out;
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
