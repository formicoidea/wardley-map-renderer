/**
 * render-config-constraints.ts — Sub-AC 3: ViolationPolicy evaluator
 *
 * Wires the declarative constraint graph (Sub-ACs 1-2) into the `resolveConfig`
 * merge pipeline by adding a `violationPolicy`-aware evaluation pass.
 *
 * ## Relationship to Sub-ACs 1 and 2
 *
 * Sub-ACs 1-2 (in `config-constraint-graph.ts`) defined:
 *
 *   - **Sub-AC 1** — Declarative schema types: `ConstraintSchema`,
 *     `ConfigConstraintGraph`, `ViolationPolicyEnum`, `EMPTY_CONFIG_CONSTRAINT_GRAPH`.
 *
 *   - **Sub-AC 2** — Executable constraint implementations: `legendBoundsValidation`,
 *     `layerDependenciesConstraint`, `phaseStyleAlignmentConstraint`,
 *     `checkConstraints`, `EXECUTABLE_CONSTRAINT_GRAPH`.
 *
 * Sub-AC 3 (this file) adds:
 *
 *   - `ConstraintPolicy` — three-valued policy for the evaluation pass
 *     (`"warn" | "throw" | "clip"`), distinct from `ViolationPolicyEnum`
 *     (the data-layer enum used inside individual constraint declarations).
 *
 *   - `ConstraintViolationError` — error class thrown when
 *     `policy === "throw"` and violations are found.
 *
 *   - Built-in clip handlers for `legendBoundsValidation` and
 *     `layerDependencies` — the two constraints that support auto-correction.
 *
 *   - `evaluateConstraints` — runs `checkConstraints` and applies the policy:
 *     warn, throw, or clip.  This is the function wired into `resolveConfig`.
 *
 *   - `ConstraintEvaluationOptions` — the options bag accepted by `resolveConfig`
 *     as its optional third argument.
 *
 * ## ViolationPolicy (evaluation-pass)
 *
 * | Policy  | On constraint violations                                         |
 * |---------|------------------------------------------------------------------|
 * | `warn`  | `console.warn` per violation; config returned unchanged (default)|
 * | `throw` | All violations collected; single `ConstraintViolationError` thrown|
 * | `clip`  | Built-in clip handler invoked; falls back to `warn` when absent  |
 *
 * Note: `ConstraintPolicy` (`"warn" | "throw" | "clip"`) is intentionally
 * **different** from `ViolationPolicy` (`"error" | "warn" | "coerce" | "ignore"`)
 * exported from `config-constraint-graph.ts`.  The latter is the per-constraint
 * **data-layer declaration** (what the constraint graph says to do in an ideal
 * world); `ConstraintPolicy` is the **call-site override** passed by the caller
 * to the evaluation pass.
 *
 * @see config-constraint-graph.ts — Sub-ACs 1-2: declarative graph + check fns
 * @see resolve-conflict.ts — wires evaluateConstraints into resolveConfig
 *
 * @module render-config-constraints
 */

import type { RenderConfig, Legend } from "./schema.js";
import { LAYER_TOGGLE_DAG } from "./schema.js";
import {
  EXECUTABLE_CONSTRAINT_GRAPH,
  type ConstraintViolation,
} from "./config-constraint-graph.js";
import { DEFAULT_COORDINATE_SPACE } from "./coordinate-space.js";
import type { DiagnosticsCollector } from "./resolve-diagnostics.js";

// ── ConstraintPolicy ─────────────────────────────────────────────────────────

/**
 * Evaluation-pass policy for how `evaluateConstraints` and `resolveConfig`
 * respond to constraint violations.
 *
 * | Value   | Behavior                                                         |
 * |---------|------------------------------------------------------------------|
 * | `warn`  | `console.warn` per violation; config returned unchanged (default)|
 * | `throw` | All violations collected; `ConstraintViolationError` thrown       |
 * | `clip`  | Built-in clip handler invoked; falls back to `warn` if absent    |
 *
 * **Distinct from `ViolationPolicy`** (`"error" | "warn" | "coerce" | "ignore"`)
 * from `config-constraint-graph.ts` — that is the per-constraint declaration in
 * the data layer.  `ConstraintPolicy` is the caller's runtime instruction to the
 * evaluation pass.
 */
export type ConstraintPolicy = "warn" | "throw" | "clip";

// ── ConstraintViolationError ─────────────────────────────────────────────────

/**
 * Error thrown by {@link evaluateConstraints} when `policy === "throw"` and at
 * least one constraint is violated.
 *
 * All violations are collected in a single pass before throwing so callers
 * receive a complete picture of every constraint violation.
 *
 * @example
 * ```ts
 * try {
 *   resolveConfig(viewer, author, { violationPolicy: "throw" });
 * } catch (err) {
 *   if (err instanceof ConstraintViolationError) {
 *     console.error(err.violations.map(v => v.message).join("\n"));
 *   }
 * }
 * ```
 */
export class ConstraintViolationError extends Error {
  /** All violations detected across the full constraint graph evaluation pass. */
  readonly violations: ReadonlyArray<ConstraintViolation>;

  constructor(violations: ConstraintViolation[]) {
    const messages = violations.map((v) => v.message).join("; ");
    super(`RenderConfig constraint violation(s): ${messages}`);
    this.name = "ConstraintViolationError";
    this.violations = violations;
    // Maintain proper prototype chain for instanceof checks in transpiled JS
    Object.setPrototypeOf(this, ConstraintViolationError.prototype);
  }
}

// ── ConstraintEvaluationOptions ───────────────────────────────────────────────

/**
 * Options bag for constraint evaluation — accepted by {@link evaluateConstraints}
 * and by `resolveConfig` (as an optional third argument).
 */
export interface ConstraintEvaluationOptions {
  /**
   * How to handle constraint violations during the evaluation pass.
   * Default: `"warn"` — non-breaking, backward-compatible.
   *
   * @see ConstraintPolicy — the three-valued policy type
   */
  violationPolicy?: ConstraintPolicy;

  /**
   * Optional mutable container to receive runtime diagnostics after
   * `resolveConfig` completes.
   *
   * When provided, `resolveConfig` inspects the resolved TypeStyleMap fields
   * (`typeColors`, `evolveStyles`, `nodeRadii`) and pushes any unrecognized
   * type keys into `diagnosticsOut.unrecognizedTypes`.
   *
   * When absent (the default), no diagnostic collection occurs — existing
   * behavior is preserved and no side effects are introduced.
   *
   * Create a fresh collector before each call with `createDiagnosticsCollector()`.
   *
   * @example
   * ```ts
   * import { resolveConfig, createDiagnosticsCollector } from "@wardleyapi/render";
   *
   * const collector = createDiagnosticsCollector();
   * const config = resolveConfig(viewer, author, { diagnosticsOut: collector });
   *
   * if (collector.unrecognizedTypes.length > 0) {
   *   console.warn("Unrecognized type keys:", collector.unrecognizedTypes);
   * }
   * ```
   *
   * @see DiagnosticsCollector — the mutable output container type
   * @see createDiagnosticsCollector — factory function (from resolve-diagnostics.ts)
   * @see collectConfigDiagnostics — the underlying inspector function
   */
  diagnosticsOut?: DiagnosticsCollector;
}

// ── Clip helpers ─────────────────────────────────────────────────────────────
//
// Pure functions that produce a corrected RenderConfig for each built-in
// constraint that supports auto-correction.
//
// Clip handlers are keyed by ExecutableConstraint.id and registered in
// CONSTRAINT_CLIP_HANDLERS below.

/** Resolve effective canvas width from a nested v2 RenderConfig. */
function resolveCanvasWidth(config: RenderConfig): number {
  return config.spatial?.coordinateSpace?.width ?? config.spatial?.width ?? DEFAULT_COORDINATE_SPACE.width;
}

/** Resolve effective canvas height from a nested v2 RenderConfig. */
function resolveCanvasHeight(config: RenderConfig): number {
  return config.spatial?.coordinateSpace?.height ?? config.spatial?.height ?? DEFAULT_COORDINATE_SPACE.height;
}

/**
 * Clip handler for `legendBoundsValidation`.
 *
 * Clamps `legend.position.{x, y}` to the valid canvas bounds when the
 * position is an explicit pixel `{x, y}` anchor.  Named string positions
 * (`"top-left"`, `"bottom-right"`, etc.) are returned unchanged.
 */
function clipLegendBounds(config: RenderConfig): RenderConfig {
  const pos = config.legend?.position;
  // Named string positions are always valid — no clip needed
  if (!pos || typeof pos !== "object") return config;

  const maxX = resolveCanvasWidth(config);
  const maxY = resolveCanvasHeight(config);

  const clampedX = Math.max(0, Math.min(pos.x, maxX));
  const clampedY = Math.max(0, Math.min(pos.y, maxY));

  // Return unchanged if already in bounds
  if (clampedX === pos.x && clampedY === pos.y) return config;

  return {
    ...config,
    legend: {
      ...config.legend,
      position: { x: clampedX, y: clampedY },
    } as Legend,
  };
}

/**
 * Clip handler for `layerDependencies`.
 *
 * For each violated edge in `LAYER_TOGGLE_DAG` — where a `dependent` layer is
 * on (or at its default true) while its `requires` layer is off — sets the
 * dependent layer to `false`.
 *
 * Cascades: applying the first clip may expose additional dependency violations
 * (if A→B and B→C, turning off B exposes A→B), but a single pass resolves all
 * because the clip processes all edges before returning.
 */
function clipLayerDependencies(config: RenderConfig): RenderConfig {
  const layers = config.filters?.layers;
  if (!layers) return config;

  let changed = false;
  const patchedLayers: Record<string, boolean | undefined> = { ...layers };

  for (const edge of LAYER_TOGGLE_DAG) {
    const requiredVisible = (patchedLayers[edge.requires] as boolean | undefined) ?? true;
    const dependentVisible = (patchedLayers[edge.dependent] as boolean | undefined) ?? true;

    if (!requiredVisible && dependentVisible) {
      patchedLayers[edge.dependent] = false;
      changed = true;
    }
  }

  if (!changed) return config;

  return {
    ...config,
    filters: {
      ...config.filters,
      layers: patchedLayers as typeof layers,
    },
  };
}

/**
 * Clip handler for `nodeRadiiStrokeWidth`.
 *
 * Bumps `spatial.nodeRadii._default` up to equal `spatial.strokeWidth` when
 * the default radius is smaller than the stroke, avoiding malformed circles.
 */
function clipNodeRadiiStrokeWidth(config: RenderConfig): RenderConfig {
  const strokeWidth = config.spatial?.strokeWidth;
  const defaultRadius = config.spatial?.nodeRadii?._default as number | undefined;

  if (strokeWidth === undefined || defaultRadius === undefined) return config;
  if (defaultRadius >= strokeWidth) return config;

  return {
    ...config,
    spatial: {
      ...config.spatial!,
      nodeRadii: {
        ...config.spatial!.nodeRadii!,
        _default: strokeWidth,
      },
    },
  };
}

// ── CONSTRAINT_CLIP_HANDLERS ─────────────────────────────────────────────────

/**
 * Registry of built-in clip handlers, keyed by `ExecutableConstraint.id`.
 *
 * Only constraints that support meaningful auto-correction have entries:
 *
 * | Constraint ID              | Clip behavior                                        |
 * |----------------------------|------------------------------------------------------|
 * | `legendBoundsValidation`   | Clamp `legend.position.{x,y}` to canvas bounds       |
 * | `layerDependencies`        | Set dependent layers to `false` when required layer off |
 * | `nodeRadiiStrokeWidth`     | Bump `nodeRadii._default` up to `strokeWidth`        |
 * | `phaseStyleAlignment`      | Not clippable — warning only, no auto-correction     |
 * | `strokeWidthFontSizeRatio` | Not clippable — advisory warning only                |
 *
 * @see clipLegendBounds — handler for `legendBoundsValidation`
 * @see clipLayerDependencies — handler for `layerDependencies`
 * @see clipNodeRadiiStrokeWidth — handler for `nodeRadiiStrokeWidth`
 */
export const CONSTRAINT_CLIP_HANDLERS: Readonly<
  Record<string, ((config: RenderConfig) => RenderConfig) | undefined>
> = {
  legendBoundsValidation: clipLegendBounds,
  layerDependencies: clipLayerDependencies,
  nodeRadiiStrokeWidth: clipNodeRadiiStrokeWidth,
  // phaseStyleAlignment: intentionally absent — no sensible auto-correction
  // strokeWidthFontSizeRatio: intentionally absent — advisory warning only
} as const;

// ── evaluateConstraints ───────────────────────────────────────────────────────

/**
 * Evaluate all constraints in `EXECUTABLE_CONSTRAINT_GRAPH` against a resolved
 * `RenderConfig`, applying the specified {@link ConstraintPolicy}.
 *
 * ## Policy behavior
 *
 * ### `"warn"` (default)
 * Emits a `console.warn` for each violation (both `"error"` and `"warning"`
 * severity).  The config is returned **unchanged** — the caller decides whether
 * to act on the diagnostic.
 *
 * ### `"throw"`
 * A full pass over the entire constraint graph is made first, collecting ALL
 * violations.  If any violation is found, a single {@link ConstraintViolationError}
 * is thrown containing the complete list.  This gives callers a comprehensive
 * picture of every constraint violation in one exception.
 *
 * ### `"clip"`
 * For each constraint that reports violations, `CONSTRAINT_CLIP_HANDLERS[id]`
 * is invoked (when available) to produce a corrected config.  The corrected
 * config is passed to subsequent constraints so clips cascade correctly.
 * When no clip handler exists (e.g. `phaseStyleAlignment`), falls back to
 * `"warn"` for that constraint's violations.
 *
 * ## Constraint execution order
 *
 * Constraints are evaluated in `EXECUTABLE_CONSTRAINT_GRAPH` declaration order:
 * 1. `legendBoundsValidation` — coordinateSpace → legend bounds
 * 2. `layerDependencies`      — DAG-based layer toggle reachability
 * 3. `phaseStyleAlignment`    — phases.length ↔ evolveStyles key count parity
 *
 * Under `"clip"` policy, earlier clips feed into later checks — the corrected
 * config is passed forward at each step.
 *
 * @param config - A fully resolved `RenderConfig` (output of `RenderConfigSchema.parse`
 *   or `resolveTheme`).  Constraints are pure functions; Zod is not called here.
 * @param policy - How to respond to violations (default: `"warn"`).
 * @returns The config after applying clips (unchanged under `"warn"`/`"throw"`).
 *
 * @throws {ConstraintViolationError} When `policy === "throw"` and any constraint
 *   reports at least one violation.
 *
 * @see EXECUTABLE_CONSTRAINT_GRAPH — the constraint array (from config-constraint-graph.ts)
 * @see CONSTRAINT_CLIP_HANDLERS — auto-correction handlers keyed by constraint ID
 * @see resolveConfig — calls this function after the multi-config merge
 */
export function evaluateConstraints(
  config: RenderConfig,
  policy: ConstraintPolicy = "warn",
): RenderConfig {
  let result = config;
  const allViolations: ConstraintViolation[] = [];

  for (const constraint of EXECUTABLE_CONSTRAINT_GRAPH) {
    // ConstraintCheckInput is a structural subset of RenderConfig — compatible
    const constraintResult = constraint.check(result as Parameters<typeof constraint.check>[0]);

    if (constraintResult.valid) continue;

    // Collect all violations from this constraint for 'throw' aggregation
    allViolations.push(...constraintResult.violations);

    if (policy === "clip") {
      const clipFn = CONSTRAINT_CLIP_HANDLERS[constraint.id];
      if (clipFn) {
        // Apply clip — pass the corrected config to subsequent constraints
        result = clipFn(result);
      } else {
        // No clip handler — fall back to warn for this constraint's violations
        for (const v of constraintResult.violations) {
          console.warn(
            `[RenderConfig constraint '${constraint.id}'] ${v.message}` +
              ` (no clip handler — config unchanged for this constraint)`,
          );
        }
      }
    } else if (policy === "warn") {
      for (const v of constraintResult.violations) {
        console.warn(`[RenderConfig constraint '${constraint.id}'] ${v.message}`);
      }
    }
    // For 'throw': violations accumulated above; throw after full graph traversal
  }

  // Throw after a complete pass so callers see ALL violations at once
  if (policy === "throw" && allViolations.length > 0) {
    throw new ConstraintViolationError(allViolations);
  }

  return result;
}

// ── RenderConfigValidationError ───────────────────────────────────────────────

/**
 * A typed validation error returned by {@link validateRenderConfig}.
 *
 * Combines the constraint identity with the violation details so callers
 * can programmatically handle errors per constraint and per field path.
 */
export interface RenderConfigValidationError {
  /** Stable camelCase constraint ID (matches `ExecutableConstraint.id`). */
  readonly constraintId: string;
  /**
   * Dot-path of the field responsible for the violation.
   * Follows the same convention as Zod issue paths
   * (e.g. `"legend.position.x"`, `"filters.layers.evolvesTo"`, `"spatial.nodeRadii._default"`).
   */
  readonly path: string;
  /** Human-readable description with actionable guidance. */
  readonly message: string;
  /**
   * Violation severity.
   *
   * - `"error"`   — structurally invalid; renderers should refuse to proceed.
   * - `"warning"` — advisory mismatch; rendering continues but output may not
   *                 match author intent.
   */
  readonly severity: "error" | "warning";
}

// ── RenderConfigValidationResult ──────────────────────────────────────────────

/**
 * Result returned by {@link validateRenderConfig}.
 *
 * Provides both aggregate booleans (`valid`, `ok`) and a flat list of typed
 * errors with full field paths for programmatic consumption.
 */
export interface RenderConfigValidationResult {
  /**
   * `true` when no constraint reports any violation (neither error nor warning).
   * Equivalent to `errors.length === 0`.
   */
  readonly valid: boolean;
  /**
   * `true` when no violation has `severity === "error"`.
   * Warnings leave `ok` as `true` — only hard errors set it to `false`.
   */
  readonly ok: boolean;
  /** Flat list of all validation errors across all constraints, in evaluation order. */
  readonly errors: readonly RenderConfigValidationError[];
}

// ── validateRenderConfig ──────────────────────────────────────────────────────

/**
 * Run all cross-group constraints against a resolved `RenderConfig` and return
 * a typed validation result with field paths.
 *
 * Unlike {@link evaluateConstraints} (which applies a policy: warn/throw/clip),
 * `validateRenderConfig` is a **pure query** — it never mutates the config,
 * never throws, and never emits console warnings. It simply reports what
 * constraints are violated.
 *
 * ## Usage
 *
 * ```ts
 * import { validateRenderConfig } from "@wardleyapi/render";
 *
 * const result = validateRenderConfig(config);
 *
 * if (!result.valid) {
 *   for (const err of result.errors) {
 *     console.log(`[${err.constraintId}] ${err.path}: ${err.message} (${err.severity})`);
 *   }
 * }
 *
 * // Check only hard errors (ignore warnings):
 * if (!result.ok) {
 *   throw new Error("Config has structural errors");
 * }
 * ```
 *
 * ## Constraint evaluation order
 *
 * Constraints are evaluated in `EXECUTABLE_CONSTRAINT_GRAPH` declaration order:
 * 1. `legendBoundsValidation`    — spatial.coordinateSpace → legend bounds
 * 2. `layerDependencies`         — DAG-based layer toggle reachability
 * 3. `phaseStyleAlignment`       — phases.length ↔ evolveStyles key count parity
 * 4. `strokeWidthFontSizeRatio`  — spatial.strokeWidth ↔ typography.labelScale ratio
 * 5. `nodeRadiiStrokeWidth`      — spatial.nodeRadii._default ≥ spatial.strokeWidth
 *
 * Each constraint independently evaluates against the **original** config — no
 * cascading corrections are applied (unlike `evaluateConstraints` with `"clip"` policy).
 *
 * @param config - A fully resolved `RenderConfig` (output of `RenderConfigSchema.parse`
 *   or `resolveConfig`). Constraints are pure functions; Zod is not called here.
 * @returns Typed validation result with field paths for every violation.
 *
 * @see evaluateConstraints — policy-based evaluation (warn/throw/clip)
 * @see checkConstraints — lower-level per-constraint results (Map-based)
 * @see EXECUTABLE_CONSTRAINT_GRAPH — the constraint array
 */
export function validateRenderConfig(
  config: RenderConfig,
): RenderConfigValidationResult {
  const errors: RenderConfigValidationError[] = [];

  for (const constraint of EXECUTABLE_CONSTRAINT_GRAPH) {
    const result = constraint.check(config as Parameters<typeof constraint.check>[0]);

    if (!result.valid) {
      for (const violation of result.violations) {
        errors.push({
          constraintId: constraint.id,
          path: violation.path,
          message: violation.message,
          severity: violation.severity,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    ok: !errors.some((e) => e.severity === "error"),
    errors,
  };
}
