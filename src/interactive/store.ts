/**
 * Editor state: current map, net op log and undo/redo snapshots (no DOM).
 *
 * Invariant: `applyDiffOps(original, ops)` equals `map` — undo restores the
 * previous op log, so the log is always the net diff from `original`.
 *
 * @module interactive/store
 */

import { applyDiffOp, type DiffOp } from "../diff-ops-apply.js";
import type { WardleyMap } from "../schema.js";

interface Snap { map: WardleyMap; ops: DiffOp[] }

const HISTORY = 200;

export function createStore(initial: WardleyMap) {
  let original = initial;
  let cur: Snap = { map: initial, ops: [] };
  let past: Snap[] = [];
  let future: Snap[] = [];
  const applyAll = (map: WardleyMap, ops: readonly DiffOp[]) => ops.reduce((m, op) => applyDiffOp(m, op), map);
  const push = (next: Snap) => {
    past.push(cur);
    if (past.length > HISTORY) past.shift();
    future = [];
    cur = next;
  };
  const step = (from: Snap[], to: Snap[]) => {
    const s = from.pop();
    if (!s) return false;
    to.push(cur);
    cur = s;
    return true;
  };

  return {
    get map() { return cur.map; },
    get ops(): readonly DiffOp[] { return cur.ops; },
    get original() { return original; },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    /** Map with `ops` applied, without committing. @throws on an invalid op */
    preview: (ops: readonly DiffOp[]) => applyAll(cur.map, ops),
    /** Apply `ops` as ONE undo step (all or nothing). @throws on an invalid op (state unchanged) */
    commit(ops: readonly DiffOp[]): void {
      if (!ops.length) return;
      const map = applyAll(cur.map, ops);
      push({ map, ops: [...cur.ops, ...structuredClone(ops as DiffOp[])] });
    },
    undo: () => step(past, future),
    redo: () => step(future, past),
    /** Back to the original map (undoable). */
    reset(): void {
      if (cur.ops.length) push({ map: original, ops: [] });
    },
    /** Accept the current map as the new baseline (edits were delivered). */
    clearDiff(): void {
      original = cur.map;
      cur = { map: cur.map, ops: [] };
      past = [];
      future = [];
    },
  };
}

export type Store = ReturnType<typeof createStore>;
