/**
 * Versioned spreadsheet sync — the collaborative layer over the delta engine.
 *
 * Multiple authors (teammates + the agent) commit deltas against a shared
 * model. Non-overlapping concurrent edits auto-rebase and merge; genuinely
 * conflicting edits are surfaced for the caller to resolve. An append-only,
 * bounded operation log gives every cell a defensible history.
 *
 * Distilled from NodeBench AI's `spreadsheetEvents` log + Convex optimistic
 * mutations. Pattern: operation-log CRDT-lite (last-writer-wins per cell, but
 * only after proving the writes don't touch the same cells).
 *
 * Reliability: BOUND (log capped + evicted), HONEST_STATUS (conflicts returned),
 * DETERMINISTIC (clock injected).
 */

import {
  applySpreadsheetDelta,
} from "./applySpreadsheetDelta";
import type {
  AppliedDelta,
  CellAddress,
  SpreadsheetDelta,
  SpreadsheetModel,
} from "../node-agent/types/nodeAgentTypes";

export const MAX_LOG = 500;

export type CommitOutcome =
  | { ok: true; applied: AppliedDelta; rebased: boolean }
  | { ok: false; conflict: true; cells: CellAddress[] }
  | { ok: false; conflict: false; error: string };

export class VersionedSpreadsheetSync {
  private _model: SpreadsheetModel;
  private _log: AppliedDelta[] = [];

  constructor(model: SpreadsheetModel) {
    this._model = model;
  }

  get model(): SpreadsheetModel {
    return this._model;
  }
  get version(): number {
    return this._model.version;
  }
  /** Most-recent-first applied delta log (bounded). */
  get log(): readonly AppliedDelta[] {
    return this._log;
  }

  /**
   * Commit a delta. If its baseVersion is stale but its target cells were not
   * changed by the deltas it missed, rebase it onto the current version and
   * apply. Otherwise return a conflict listing the contested cells.
   */
  commit(delta: SpreadsheetDelta, now: number = Date.now()): CommitOutcome {
    let effective = delta;
    let rebased = false;

    if (delta.baseVersion !== this._model.version) {
      if (delta.baseVersion > this._model.version) {
        return { ok: false, conflict: false, error: "base_ahead_of_head" };
      }
      const missedCells = this.cellsChangedSince(delta.baseVersion);
      const targetCells = new Set(delta.ops.map((o) => o.address));
      const contested = [...targetCells].filter((c) => missedCells.has(c));
      if (contested.length > 0) {
        return { ok: false, conflict: true, cells: contested.sort() };
      }
      // Safe to rebase: no overlap with intervening changes.
      effective = { ...delta, baseVersion: this._model.version };
      rebased = true;
    }

    const result = applySpreadsheetDelta(this._model, effective, now);
    if (!result.ok) {
      if (result.conflict) {
        return {
          ok: false,
          conflict: true,
          cells: effective.ops.map((o) => o.address).sort(),
        };
      }
      return { ok: false, conflict: false, error: result.error };
    }

    this._model = result.model;
    this.pushLog(result.applied);
    return { ok: true, applied: result.applied, rebased };
  }

  /** Cells changed by every applied delta with toVersion > sinceVersion. */
  private cellsChangedSince(sinceVersion: number): Set<CellAddress> {
    const set = new Set<CellAddress>();
    for (const d of this._log) {
      if (d.toVersion > sinceVersion) {
        for (const c of d.changes) set.add(c.address);
      }
    }
    return set;
  }

  private pushLog(applied: AppliedDelta): void {
    this._log.unshift(applied);
    // BOUND — evict oldest entries beyond the cap.
    if (this._log.length > MAX_LOG) this._log.length = MAX_LOG;
  }
}
