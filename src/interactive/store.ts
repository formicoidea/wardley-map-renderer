/**
 * Editor state: current map, net op log and undo/redo snapshots (no DOM).
 *
 * Invariant: `applyDiffOps(original, ops)` equals `map` — undo restores the
 * previous op log, so the log is always the net diff from `original`.
 *
 * @module interactive/store
 */

import { applyDiffOps, type DiffOp } from "../diff-ops-apply.js";
import type { WardleyMap } from "../schema.js";

interface Snap { map: WardleyMap; ops: DiffOp[] }

const HISTORY = 200;

export function createStore(initial: WardleyMap) {
  let original = initial;
  let cur: Snap = { map: initial, ops: [] };
  let past: Snap[] = [];
  let future: Snap[] = [];
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
    /** Map with `ops` applied (one clone), without committing. @throws on an invalid op */
    preview: (ops: readonly DiffOp[]) => applyDiffOps(cur.map, ops),
    /** Apply `ops` as ONE undo step (all or nothing). @throws on an invalid op (state unchanged) */
    commit(ops: readonly DiffOp[]): void {
      if (!ops.length) return;
      const map = applyDiffOps(cur.map, ops);
      push({ map, ops: [...cur.ops, ...structuredClone(ops as DiffOp[])] });
    },
    undo: () => step(past, future),
    redo: () => step(future, past),
    /** Back to the original map (undoable). */
    reset(): void {
      if (cur.ops.length) push({ map: original, ops: [] });
    },
    /**
     * `sent` (the current or an earlier `ops` value) was delivered: the map it
     * produces becomes the baseline, `ops` keeps only later edits and history is
     * cleared. False (state unchanged) when `ops` no longer extends `sent`.
     */
    checkpoint(sent: readonly DiffOp[] = cur.ops): boolean {
      if (sent.some((op, i) => cur.ops[i] !== op)) return false;
      original = sent === cur.ops ? cur.map : applyDiffOps(original, sent);
      cur = { map: cur.map, ops: cur.ops.slice(sent.length) };
      past = [];
      future = [];
      return true;
    },
  };
}

export type Store = ReturnType<typeof createStore>;
