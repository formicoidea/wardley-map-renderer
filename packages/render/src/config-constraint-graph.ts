/**
 * config-constraint-graph.ts
 *
 * Declarative constraint graph for RenderConfig field interactions.
 *
 * Formalises the implicit grammar that was previously buried in imperative
 * validation logic:
 *   - coordinateSpace constrains legend bounds
 *   - layerDeps constrain toggle combinations
 *   - phases interact with evolveStyles keys
 *
 * All constraints are introspectable at runtime so tooling can surface them
 * without executing validation code.
 *
 * @see TIERED_RENDER_CONFIG_TAXONOMY for the 4-tier precedence context that
 *      governs which fields are allowed to impose constraints on others.
 *
 * @scope field-interaction grammar only — not interactivity or annotation.
 */

import { z } from "zod";
import { DEFAULT_COORDINATE_SPACE } from "./coordinate-space.js";
import { LAYER_TOGGLE_DAG, EvolveTypeEnum } from "./schema.js";

// ── ViolationPolicy ──────────────────────────────────────────────────────────

/**
 * What to do when a constraint is violated.
 *
 * - `"error"`  — reject the config; the caller receives a validation failure
 * - `"warn"`   — proceed but surface a diagnostic message
 * - `"coerce"` — silently adjust the offending value to the nearest valid state
 * - `"ignore"` — record the violation but take no action (useful for probes)
 */
export const ViolationPolicyEnum = z.enum(["error", "warn", "coerce", "ignore"]);
export type ViolationPolicy = z.infer<typeof ViolationPolicyEnum>;

// ── Constraint ───────────────────────────────────────────────────────────────

/**
 * A single directed constraint between two RenderConfig fields or sub-schemas.
 *
 * @field source          - The field/sub-schema that *imposes* the constraint
 *                          (e.g. "coordinateSpace")
 * @field target          - The field/sub-schema being *constrained*
 *                          (e.g. "legend")
 * @field rule            - Human-readable description of what the constraint
 *                          enforces (introspectable, never executed here)
 * @field violationPolicy - How to handle a violation of this constraint
 */
export const ConstraintSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  rule: z.string().min(1),
  violationPolicy: ViolationPolicyEnum,
});
export type Constraint = z.infer<typeof ConstraintSchema>;

// ── ConstraintGraph ──────────────────────────────────────────────────────────

/**
 * A named collection of constraints that belong to the same interaction domain.
 *
 * @field name        - Identifier for this constraint group (e.g. "layerDependencies")
 * @field description - Human-readable explanation of what this group models
 * @field constraints - The ordered list of constraints in this group
 */
export const ConstraintGraphSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  constraints: z.array(ConstraintSchema),
});
export type ConstraintGraph = z.infer<typeof ConstraintGraphSchema>;

// ── ConfigConstraintGraph ────────────────────────────────────────────────────

/**
 * Top-level declarative constraint graph for RenderConfig.
 *
 * Each typed slot corresponds to one interaction domain identified in the
 * field-interaction grammar:
 *
 * | slot                 | source field       | constrained field |
 * |----------------------|--------------------|-------------------|
 * | legendBoundsValidation | coordinateSpace  | legend            |
 * | layerDependencies    | background toggles | other toggles     |
 * | phaseStyleAlignment  | phases             | evolveStyles      |
 *
 * The slots are populated lazily — start empty, filled in subsequent Sub-ACs.
 * No runtime logic lives here; this file is pure type/schema declaration.
 */
export const ConfigConstraintGraphSchema = z.object({
  legendBoundsValidation: ConstraintGraphSchema,
  layerDependencies: ConstraintGraphSchema,
  phaseStyleAlignment: ConstraintGraphSchema,
});
export type ConfigConstraintGraph = z.infer<typeof ConfigConstraintGraphSchema>;

// ── Empty (starter) instance ─────────────────────────────────────────────────

/**
 * The canonical empty ConfigConstraintGraph.
 *
 * Runtime logic in subsequent Sub-ACs will populate each slot's `constraints`
 * array. Until then, this value satisfies the schema and acts as a safe
 * default for any consumer that depends on the graph structure.
 */
export const EMPTY_CONFIG_CONSTRAINT_GRAPH: ConfigConstraintGraph = {
  legendBoundsValidation: {
    name: "legendBoundsValidation",
    description:
      "Constraints imposed by coordinateSpace on legend positioning: " +
      "legend anchor and size must stay within the declared canvas bounds.",
    constraints: [],
  },
  layerDependencies: {
    name: "layerDependencies",
    description:
      "Constraints between layer-toggle combinations: certain toggles " +
      "depend on or conflict with others (e.g. showPhaseLabels requires " +
      "showPhaseDividers to be meaningful).",
    constraints: [],
  },
  phaseStyleAlignment: {
    name: "phaseStyleAlignment",
    description:
      "Constraints between phase definitions and evolveStyles: " +
      "evolveStyles keys must be a closed enum derived from the component " +
      "evolution types present in phases.",
    constraints: [],
  },
};

// ============================================================================
// Sub-AC 2 — Executable constraint implementations
//
// Each constraint is a pure function that evaluates one cross-field rule and
// returns a structured ConstraintResult.  The declarative metadata above
// describes the rule; the check function below enforces it.
// ============================================================================

// ── ConstraintViolation ──────────────────────────────────────────────────────

/**
 * A single detected constraint violation — one cross-field inconsistency found
 * by a constraint `check` function.
 */
export interface ConstraintViolation {
  /**
   * Dot-path of the primary field responsible for the violation.
   * Follows the same convention as Zod issue paths
   * (e.g. `"legend.position.x"`, `"filters.layers.evolvesTo"`).
   */
  readonly path: string;
  /** Human-readable description of the violation with actionable guidance. */
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

// ── ConstraintResult ─────────────────────────────────────────────────────────

/**
 * Result returned by an `ExecutableConstraint.check` function.
 *
 * - `valid` — `true` when `violations` is completely empty (no errors, no warnings)
 * - `ok`    — `true` when there are no `"error"`-severity violations; `"warning"`
 *             violations leave `ok` true
 * - `violations` — ordered list of all detected issues (empty when `valid`)
 */
export interface ConstraintResult {
  /** `true` when `violations` is empty (no issues of any severity) */
  readonly valid: boolean;
  /** `true` when no violation has `severity === "error"` (warnings are acceptable) */
  readonly ok: boolean;
  /** All violations found by this check (empty array when `valid`) */
  readonly violations: readonly ConstraintViolation[];
}

// ── ConstraintCheckInput ─────────────────────────────────────────────────────

/**
 * Minimal partial config shape accepted by all `ExecutableConstraint.check`
 * functions.
 *
 * All fields are optional.  Constraints skip checks gracefully when fields are
 * absent, treating them as their logical defaults (matching `RenderConfigSchema`
 * defaults).
 *
 * Intentionally a structural subset — not tied to the full `RenderConfigSchema`
 * so that constraints can be applied against parsed or unparsed config values.
 */
export interface ConstraintCheckInput {
  /**
   * Canvas coordinate space — `width` and `height` used for legend bounds checks.
   * Defaults: 1600 × 800 (from `DEFAULT_COORDINATE_SPACE`).
   */
  coordinateSpace?: {
    width?: number;
    height?: number;
  };
  /**
   * Legend configuration — only `position` is inspected.
   * `string` → named position (always valid).
   * `{x, y}` → explicit pixel anchor (subject to canvas bounds check).
   */
  legend?: {
    position?: string | { x: number; y: number };
  };
  /**
   * Unified visibility filters — `layers` inspected by `layerDependenciesConstraint`.
   * Absent toggle values default to `true` (visible).
   */
  filters?: {
    layers?: Record<string, boolean | undefined>;
  };
  /**
   * Background chrome — `evolutionPhases.phases` inspected by `phaseStyleAlignmentConstraint`.
   */
  background?: {
    evolutionPhases?: {
      /** Array of phase label overrides (`string | undefined` per element). */
      phases?: Array<string | undefined>;
    };
  };
  /**
   * Evolution arrow style map — presence of named keys (`natural`, `ecosystem`,
   * `forced`, `late`) inspected by `phaseStyleAlignmentConstraint`.
   * Typed loosely so callers need not import the strict `EvolveStylesMap` shape.
   */
  evolveStyles?: Partial<Record<string, unknown>>;
}

// ── ExecutableConstraint ─────────────────────────────────────────────────────

/**
 * A constraint rule that combines declarative metadata with an executable
 * `check` function.
 *
 * `metadata` is the JSON-serialisable declarative description (from Sub-AC 1).
 * `check` is the pure function that evaluates the rule against a partial config.
 *
 * @example
 *   const result = legendBoundsValidation.check({
 *     coordinateSpace: { width: 1600, height: 800 },
 *     legend: { position: { x: 9999, y: 0 } },
 *   });
 *   // → { valid: false, ok: false, violations: [{ path: "legend.position.x", severity: "error" }] }
 */
export interface ExecutableConstraint {
  /** Stable camelCase identifier matching the `ConfigConstraintGraph` slot name. */
  readonly id: string;
  /** Declarative metadata (introspectable, JSON-serialisable). */
  readonly metadata: Constraint;
  /**
   * Pure check function — evaluates the constraint rule against a partial config.
   * Absent fields in `config` are treated as their logical defaults.
   */
  readonly check: (config: ConstraintCheckInput) => ConstraintResult;
}

// ── Private helper ────────────────────────────────────────────────────────────

/** Build a ConstraintResult from a list of violations. @internal */
function makeResult(violations: readonly ConstraintViolation[]): ConstraintResult {
  return {
    valid: violations.length === 0,
    ok: !violations.some((v) => v.severity === "error"),
    violations,
  };
}

// ── legendBoundsValidation ────────────────────────────────────────────────────

/**
 * **legendBoundsValidation** — `coordinateSpace → legend.position` bounds check.
 *
 * When `legend.position` is an explicit `{x, y}` pixel coordinate, both `x`
 * and `y` must lie within the canvas area declared by `coordinateSpace.width ×
 * coordinateSpace.height`.
 *
 * - Named positions (`"top-left"`, `"bottom-right"`, `"auto"`, etc.) are
 *   automatically clamped by the renderer and are always valid.
 * - Absent `legend.position` defaults to `"bottom-right"` (named) → valid.
 * - Absent `coordinateSpace` dimensions default to 1600 × 800 px.
 *
 * Violation severity: `"error"` — the legend anchor falls outside the canvas.
 *
 * @example XY position within bounds — valid:
 *   legendBoundsValidation.check({ legend: { position: { x: 100, y: 600 } } })
 *   // → { valid: true, ok: true, violations: [] }
 *
 * @example XY position.x beyond canvas width — error:
 *   legendBoundsValidation.check({ legend: { position: { x: 9999, y: 0 } } })
 *   // → { valid: false, ok: false, violations: [{ path: "legend.position.x", severity: "error" }] }
 */
export const legendBoundsValidation: ExecutableConstraint = {
  id: "legendBoundsValidation",
  metadata: {
    source: "coordinateSpace",
    target: "legend",
    rule:
      "When legend.position is an explicit {x, y} pixel coordinate, " +
      "x must be in [0, coordinateSpace.width] and y in [0, coordinateSpace.height]. " +
      "Named positions ('top-left', 'bottom-right', 'auto', etc.) are always valid.",
    violationPolicy: "error",
  },
  check(config) {
    const pos = config.legend?.position;

    // Named string position or absent — always valid (renderer clamps automatically)
    if (pos === undefined || typeof pos === "string") {
      return makeResult([]);
    }

    // Explicit {x, y} anchor — validate against canvas bounds
    const { x, y } = pos as { x: number; y: number };
    const width = config.coordinateSpace?.width ?? DEFAULT_COORDINATE_SPACE.width;
    const height = config.coordinateSpace?.height ?? DEFAULT_COORDINATE_SPACE.height;

    const violations: ConstraintViolation[] = [];

    if (x < 0 || x > width) {
      violations.push({
        path: "legend.position.x",
        message:
          `legend.position.x (${x}) is outside canvas bounds [0, ${width}]. ` +
          `Reduce x to ≤ ${width} or increase coordinateSpace.width.`,
        severity: "error",
      });
    }

    if (y < 0 || y > height) {
      violations.push({
        path: "legend.position.y",
        message:
          `legend.position.y (${y}) is outside canvas bounds [0, ${height}]. ` +
          `Reduce y to ≤ ${height} or increase coordinateSpace.height.`,
        severity: "error",
      });
    }

    return makeResult(violations);
  },
};

// ── layerDependenciesConstraint ───────────────────────────────────────────────

/**
 * **layerDependenciesConstraint** — DAG-based `filters.layers` reachability check.
 *
 * Traverses `LAYER_TOGGLE_DAG` and reports an error for each edge where the
 * `dependent` layer is enabled (on) while its `requires` layer is disabled (off).
 * A dependent layer produces no meaningful visual output when its required layer
 * is not rendered.
 *
 * Canonical edges (from `LAYER_TOGGLE_DAG`):
 * - `evolvesTo → nodes`: evolution arrows are anchored to node positions
 * - `labels    → nodes`: label placement uses node bounding boxes
 *
 * Absent toggle values default to `true` (visible) — same as each layer renderer.
 *
 * Violation severity: `"error"` — the dependent layer has no valid render target.
 *
 * @example All defaults → valid (all layers default to visible):
 *   layerDependenciesConstraint.check({})
 *   // → { valid: true, ok: true, violations: [] }
 *
 * @example nodes=false, evolvesTo defaults to true → error:
 *   layerDependenciesConstraint.check({ filters: { layers: { nodes: false } } })
 *   // → { valid: false, violations: [{ path: "filters.layers.evolvesTo", severity: "error" }] }
 *
 * @example nodes=false, evolvesTo=false, labels=false → valid:
 *   layerDependenciesConstraint.check({ filters: { layers: { nodes: false, evolvesTo: false, labels: false } } })
 *   // → { valid: true, ok: true, violations: [] }
 */
export const layerDependenciesConstraint: ExecutableConstraint = {
  id: "layerDependencies",
  metadata: {
    source: "filters.layers",
    target: "filters.layers",
    rule:
      "DAG-based reachability: a dependent layer (evolvesTo, labels) cannot be on when " +
      "its required layer (nodes) is off — derived from LAYER_TOGGLE_DAG. " +
      "Absent toggles default to true (visible).",
    violationPolicy: "error",
  },
  check(config) {
    const layers = config.filters?.layers ?? {};
    const violations: ConstraintViolation[] = [];

    for (const edge of LAYER_TOGGLE_DAG) {
      // Absent toggle defaults to true (visible) — same as each layer renderer's default
      const requiredVisible = (layers[edge.requires] as boolean | undefined) ?? true;
      const dependentVisible = (layers[edge.dependent] as boolean | undefined) ?? true;

      if (!requiredVisible && dependentVisible) {
        violations.push({
          path: `filters.layers.${edge.dependent}`,
          message:
            `filters.layers.${edge.dependent} is on but filters.layers.${edge.requires} is off ` +
            `— ${edge.reason}. ` +
            `Set filters.layers.${edge.dependent}: false when filters.layers.${edge.requires}: false.`,
          severity: "error",
        });
      }
    }

    return makeResult(violations);
  },
};

// ── phaseStyleAlignmentConstraint ─────────────────────────────────────────────

/**
 * Number of named `EvolveTypeEnum` keys (excluding `_default`).
 * The "natural" count for the standard 4-zone Wardley Map.
 * @internal
 */
const EVOLVE_TYPE_KEY_COUNT = EvolveTypeEnum.options.length; // 4

/**
 * **phaseStyleAlignmentConstraint** — `phases.length ↔ evolveStyles key count` parity.
 *
 * Advisory parity check: when explicit phase labels AND explicit per-type
 * `evolveStyles` keys are **both** provided, their counts should match to avoid
 * unlabelled zones (phase labels without a style) or unused styles (keys
 * without a corresponding phase label).
 *
 * ## Severity: `"warning"` (not `"error"`)
 *
 * Phase labels and `evolveStyles` keys are **intentionally decoupled** by
 * design — a map with 3 or 5 phase labels is fully valid; `evolveStyles` always
 * uses the same 4 named `EvolveTypeEnum` keys regardless of phase count.
 * This constraint raises a warning (not an error) to flag likely intent
 * mismatches without blocking rendering.
 *
 * ## When the check is skipped
 *
 * - `phases` absent → skip (no labels to align with)
 * - `evolveStyles` absent → skip (no explicit styles to align with)
 * - `evolveStyles` has only `_default`, no per-type keys → skip
 *   (`_default` applies to all phases regardless of count)
 *
 * ## Parity definition
 *
 * Parity holds when:
 *   `phases.length === count(EvolveTypeEnum keys present in evolveStyles)`
 *
 * where "present" means the key exists in `evolveStyles` with a non-`undefined` value,
 * and the counted keys are `natural`, `ecosystem`, `forced`, `late` (not `_default`).
 *
 * @example Matching counts (4 phases, 4 style keys) — valid:
 *   phaseStyleAlignmentConstraint.check({
 *     background: { evolutionPhases: { phases: ["A", "B", "C", "D"] } },
 *     evolveStyles: { natural: {}, ecosystem: {}, forced: {}, late: {} },
 *   })
 *   // → { valid: true, ok: true, violations: [] }
 *
 * @example Mismatching counts — warning:
 *   phaseStyleAlignmentConstraint.check({
 *     background: { evolutionPhases: { phases: ["A", "B", "C"] } },
 *     evolveStyles: { natural: {}, ecosystem: {} },
 *   })
 *   // → { valid: false, ok: true, violations: [{ severity: "warning", ... }] }
 *
 * @example Only _default in evolveStyles — skipped (no per-type keys to align):
 *   phaseStyleAlignmentConstraint.check({
 *     background: { evolutionPhases: { phases: ["A", "B", "C"] } },
 *     evolveStyles: { _default: { stroke: "#888" } },
 *   })
 *   // → { valid: true, ok: true, violations: [] }
 */
export const phaseStyleAlignmentConstraint: ExecutableConstraint = {
  id: "phaseStyleAlignment",
  metadata: {
    source: "background.evolutionPhases.phases",
    target: "evolveStyles",
    rule:
      "Advisory parity: when explicit phase labels and per-type evolveStyles keys are both " +
      "provided, their counts should match to avoid unlabelled zones or unused style keys. " +
      "Only a warning because phases and evolveStyles are intentionally decoupled by design " +
      `(evolveStyles uses ${EVOLVE_TYPE_KEY_COUNT} fixed EvolveTypeEnum keys; phases can have any count ≥ 1).`,
    violationPolicy: "warn",
  },
  check(config) {
    const phases = config.background?.evolutionPhases?.phases;
    const evolveStyles = config.evolveStyles;

    // Skip when either field is absent
    if (phases === undefined || evolveStyles === undefined) {
      return makeResult([]);
    }

    // Count explicit per-type keys (EvolveTypeEnum options present in evolveStyles)
    // Exclude _default — it applies to all phases regardless of count
    const explicitKeys = EvolveTypeEnum.options.filter(
      (k) => evolveStyles[k] !== undefined,
    );

    // Skip when only _default is present — no per-type overrides to align with
    if (explicitKeys.length === 0) {
      return makeResult([]);
    }

    const phaseCount = phases.length;
    const styleKeyCount = explicitKeys.length;

    if (phaseCount === styleKeyCount) {
      return makeResult([]);
    }

    return makeResult([
      {
        path: "background.evolutionPhases.phases",
        message:
          `Phase label count (${phaseCount}) does not match explicit evolveStyles key count ` +
          `(${styleKeyCount} of ${EVOLVE_TYPE_KEY_COUNT} declared: ${explicitKeys.join(", ")}). ` +
          `Some zones may lack a style override or some style keys may have no corresponding ` +
          `phase label. Consider aligning counts or using evolveStyles._default as a fallback.`,
        severity: "warning",
      },
    ]);
  },
};

// ── CONFIG_CONSTRAINT_GRAPH ───────────────────────────────────────────────────

/**
 * The populated `ConfigConstraintGraph` — all three slots filled with their
 * declarative constraint metadata derived from the executable implementations.
 *
 * Use `EXECUTABLE_CONSTRAINT_GRAPH` (the flat array) when you need to run
 * `checkConstraints`.  Use `CONFIG_CONSTRAINT_GRAPH` (this object) when you
 * need to introspect available constraints by slot name.
 *
 * | Slot                   | Source field                      | Constrained field |
 * |------------------------|-----------------------------------|-------------------|
 * | legendBoundsValidation | coordinateSpace                   | legend.position   |
 * | layerDependencies      | filters.layers (LAYER_TOGGLE_DAG) | filters.layers    |
 * | phaseStyleAlignment    | background.evolutionPhases.phases | evolveStyles      |
 */
export const CONFIG_CONSTRAINT_GRAPH: ConfigConstraintGraph = {
  legendBoundsValidation: {
    name: "legendBoundsValidation",
    description:
      "Constraints imposed by coordinateSpace on legend positioning: " +
      "legend anchor and size must stay within the declared canvas bounds.",
    constraints: [legendBoundsValidation.metadata],
  },
  layerDependencies: {
    name: "layerDependencies",
    description:
      "Constraints between layer-toggle combinations: evolvesTo and labels require " +
      "nodes to be on (per LAYER_TOGGLE_DAG). When nodes is off, dependent layers " +
      "must also be off.",
    constraints: [layerDependenciesConstraint.metadata],
  },
  phaseStyleAlignment: {
    name: "phaseStyleAlignment",
    description:
      "Advisory parity between phase label count and explicit evolveStyles key count. " +
      "Raises a warning (not an error) when both are explicitly provided with mismatching counts, " +
      "because phases and evolveStyles are intentionally decoupled by design.",
    constraints: [phaseStyleAlignmentConstraint.metadata],
  },
};

// ── EXECUTABLE_CONSTRAINT_GRAPH ───────────────────────────────────────────────

/**
 * Flat ordered list of executable constraints — suitable for `checkConstraints`.
 *
 * Mirrors the three slots of `CONFIG_CONSTRAINT_GRAPH` as a flat array so
 * that `checkConstraints` can iterate without needing to know the slot names.
 */
export type ExecutableConstraintGraph = readonly ExecutableConstraint[];

/**
 * The canonical executable constraint graph — flat list of all three built-in
 * constraints in declaration order.
 *
 * Pass a subset to `checkConstraints` to run only specific rules.
 */
export const EXECUTABLE_CONSTRAINT_GRAPH: ExecutableConstraintGraph = [
  legendBoundsValidation,
  layerDependenciesConstraint,
  phaseStyleAlignmentConstraint,
] as const;

// ── checkConstraints ──────────────────────────────────────────────────────────

/**
 * Run all constraints in `graph` against `config` and return aggregated results.
 *
 * @param config - Partial render config to evaluate (all fields optional)
 * @param graph  - Constraints to run (defaults to `EXECUTABLE_CONSTRAINT_GRAPH`)
 * @returns
 *   - `valid` — `true` when ALL constraints report zero violations
 *   - `ok`    — `true` when no constraint has any `"error"`-severity violation
 *   - `results` — `ReadonlyMap<constraintId, ConstraintResult>` for per-rule inspection
 *
 * @example
 *   const { valid, ok, results } = checkConstraints({
 *     legend: { position: { x: 9999, y: 0 } },
 *   });
 *   // valid = false, ok = false
 *   // results.get("legendBoundsValidation")!.violations[0].path === "legend.position.x"
 */
export function checkConstraints(
  config: ConstraintCheckInput,
  graph: ExecutableConstraintGraph = EXECUTABLE_CONSTRAINT_GRAPH,
): {
  readonly valid: boolean;
  readonly ok: boolean;
  readonly results: ReadonlyMap<string, ConstraintResult>;
} {
  const entries = new Map<string, ConstraintResult>();

  for (const constraint of graph) {
    entries.set(constraint.id, constraint.check(config));
  }

  const allResults = Array.from(entries.values());

  return {
    valid: allResults.every((r) => r.valid),
    ok: allResults.every((r) => r.ok),
    results: entries,
  };
}
