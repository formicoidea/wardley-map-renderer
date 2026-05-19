/**
 * Core types for the modular Wardley Map renderer.
 *
 * Architecture: 2-phase rendering pipeline
 *   Phase 1 — Geometry: compute pixel positions from normalised [0-1] coords
 *   Phase 2 — SVG: each layer appends SVG fragments to parts[]
 *
 * Functional approach: RenderContext is passed as parameter (no class).
 *
 * @module render/types
 */

import type { WardleyMap, Component, Relation, ResolvedRenderConfig } from "../schema.js";
import type { KnownRenderableType } from "../renderable-type.js";

/** Component type extracted from schema Component */
type ComponentType = Component["type"];

// ── Layout dimensions ────────────────────────────────────────────

/** Fixed margins in pixels — identical regardless of canvas size or axes state */
export interface Margins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Computed plot area (drawable region inside margins) */
export interface PlotArea {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

// ── Geometry phase output ────────────────────────────────────────

/** Pixel position for a component node */
export interface NodeGeometry {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly component: Component;
}

/** Pixel endpoints for a relation edge */
export interface EdgeGeometry {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly relation: Relation;
}

/** Pixel geometry for an evolvesTo arrow */
export interface EvolveGeometry {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly evolveType: "natural" | "ecosystem" | "forced"| "late";
  readonly component: Component;
  /** When true, inertia barrier lines are rendered at crossed phase boundaries */
  readonly inertia?: boolean;
}

/** Pixel geometry for an inertia barrier line (thick vertical line at phase boundary) */
export interface InertiaGeometry {
  /** X pixel coordinate of the phase boundary */
  readonly x: number;
  /** Top Y pixel coordinate of the inertia line */
  readonly y1: number;
  /** Bottom Y pixel coordinate of the inertia line */
  readonly y2: number;
  /** The associated component */
  readonly component: Component;
}

/** Pixel geometry for a pipeline background rect */
export interface PipelineGeometryPixels {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Handle x position in pixels (from handleEvolution, or midpoint) */
  readonly handleX: number;
  /** Handle y position in pixels (top edge of pipeline rect) */
  readonly handleY: number;
  readonly component: Component;
}

// ── Axes zone geometry ───────────────────────────────────────────

/** Pixel geometry for an evolution phase zone (e.g. Genesis, Custom-Built) */
export interface AxesZoneGeometry {
  /** Phase label (e.g. "Genesis", "Custom-Built") */
  readonly label: string;
  /** Left x pixel coordinate of the zone */
  readonly x: number;
  /** Width of the zone in pixels */
  readonly width: number;
  /** Top y pixel coordinate (same as plot top) */
  readonly y: number;
  /** Height of the zone in pixels (same as plot height) */
  readonly height: number;
  /** Normalised start ratio [0-1] */
  readonly startRatio: number;
  /** Normalised end ratio [0-1] */
  readonly endRatio: number;
}

// ── Bounding box ──────────────────────────────────────────────────

/** Generic axis-aligned bounding box in pixel coordinates */
export interface BoundingBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Bounding box with associated component identity */
export interface ComponentBoundingBox extends BoundingBox {
  readonly id: string;
  readonly component: Component;
}

// ── RenderGeometry (unified Phase 1 output) ─────────────────────

/**
 * RenderGeometry aggregates all pre-computed pixel positions from Phase 1
 * (geometry computation). This is the complete output of the geometry phase
 * before any SVG string generation happens.
 *
 * Each field corresponds to a visual element type that will be rendered
 * by one or more layer renderers in Phase 2.
 */
export interface RenderGeometry {
  /** Pre-computed node pixel positions for all components */
  readonly nodes: ReadonlyArray<NodeGeometry>;

  /** Pre-computed edge pixel endpoints for all relations */
  readonly edges: ReadonlyArray<EdgeGeometry>;

  /** Pre-computed evolvesTo arrow pixel positions */
  readonly evolves: ReadonlyArray<EvolveGeometry>;

  /** Pre-computed inertia barrier line positions (thick vertical lines at phase boundaries) */
  readonly inertiaBarriers: ReadonlyArray<InertiaGeometry>;

  /** Pre-computed pipeline rectangle pixel positions */
  readonly pipelines: ReadonlyArray<PipelineGeometryPixels>;

  /** Pre-computed evolution phase zones in pixel coordinates */
  readonly axesZones: ReadonlyArray<AxesZoneGeometry>;

  /** Bounding boxes for all rendered components (for hit testing / label avoidance) */
  readonly boundingBoxes: ReadonlyArray<ComponentBoundingBox>;
}

// ── RenderOptions (configurable rendering parameters) ────────────

/**
 * RenderOptions controls rendering behaviour. Passed alongside the
 * WardleyMap to the rendering pipeline. All fields are optional with
 * sensible defaults.
 */
export interface RenderOptions {
  /** Override canvas width (defaults to map.renderConfig.width or 1600) */
  readonly width?: number;

  /** Override canvas height (defaults to map.renderConfig.height or 800) */
  readonly height?: number;

  /**
   * Background sub-object — moved from top-level `backgroundColor`.
   * Use `background.color` for the canvas fill color (CSS hex, e.g. "#ffffff").
   * @deprecated top-level `backgroundColor` is removed; use `background.color` instead
   */
  readonly background?: { color?: string };

  /** Whether to render axes (border, grid, phase labels). Defaults to true. */
  readonly showAxes?: boolean;

  /** Whether to render the value chain (y-axis) label and direction indicators */
  readonly showValueChain?: boolean;

  /** Whether to render evolution phase labels below x-axis */
  readonly showPhaseLabels?: boolean;

  /** Font family for all text (defaults to "Inter, sans-serif") */
  readonly fontFamily?: string;

  /** Scale factor for component label font size (1.0 = default 12px) */
  readonly labelScale?: number;

  /**
   * Per-type node circle radii in pixels.
   * `_default` is required when provided and serves as catch-all fallback.
   * Lookup precedence: `nodeRadii[type]` → `nodeRadii._default`
   */
  readonly nodeRadii?: { _default: number } & Record<string, number>;

  /** Enable/disable label collision avoidance (defaults to true) */
  readonly avoidCollisions?: boolean;

  /**
   * Enable interactive SVG elements (data-* attributes, hit areas, handles,
   * plot-area rect). Used by the HTML renderer for drag-and-drop.
   * When true, composeSVG adds an invisible `<rect data-plot-area>` covering
   * the drawable area for client-side coordinate conversion.
   */
  readonly interactive?: boolean;

  /**
   * **Data filter (pre-render):** Component types to exclude from rendering.
   * Filtered components are removed before geometry is computed, affecting ALL layers.
   * @see FiltersSchema.excludeComponentTypes for full distinction vs filters.layers
   */
  readonly excludeComponentTypes?: ReadonlyArray<ComponentType>;

  /**
   * Custom color overrides by component type using the TypeStyleMap pattern.
   * `_default` is required when provided (serves as catch-all fallback).
   * @see TypeColorsSchema in schema.ts
   */
  readonly typeColors?: { readonly _default: string } & { readonly [K in KnownRenderableType]?: string } & { readonly [key: string]: string | undefined };

  /**
   * evolveType → stroke style mapping for evolution arrows.
   * Accepts the closed set of EvolveType keys plus the special `_default` catch-all.
   *
   * Resolution order per style property (highest wins):
   *   1. Explicit per-type key (e.g. `natural.stroke`)
   *   2. `_default.stroke` (when present — mid-level fallback)
   *   3. Hardcoded renderer defaults in evolvesto-layer.ts
   */
  readonly evolveStyles?: {
    readonly _default?: { readonly stroke?: string; readonly strokeDasharray?: string };
  } & Partial<Record<"natural" | "ecosystem" | "forced" | "late", {
    readonly stroke?: string;
    readonly strokeDasharray?: string;
  }>>;
}

// ── RenderContext (immutable bag passed to every layer) ───────────

/**
 * RenderContext aggregates all computed geometry and map data needed
 * by layer renderers. Built during Phase 1 (geometry), consumed
 * during Phase 2 (SVG generation).
 *
 * Passed as a parameter to each LayerRenderer function (functional style).
 */
export interface RenderContext {
  /** Original validated map data */
  readonly map: WardleyMap;

  /** SVG canvas dimensions (from renderConfig + margins) */
  readonly canvasWidth: number;
  readonly canvasHeight: number;

  /** Fixed pixel margins */
  readonly margins: Margins;

  /** Computed drawable plot area */
  readonly plot: PlotArea;

  /** All pre-computed geometry (Phase 1 unified output) */
  readonly geometry: RenderGeometry;

  /** Pre-computed node positions (Phase 1 output) — shortcut to geometry.nodes */
  readonly nodes: ReadonlyArray<NodeGeometry>;

  /** Pre-computed edge positions (Phase 1 output) — shortcut to geometry.edges */
  readonly edges: ReadonlyArray<EdgeGeometry>;

  /** Pre-computed evolvesTo arrow positions (Phase 1 output) — shortcut to geometry.evolves */
  readonly evolves: ReadonlyArray<EvolveGeometry>;

  /** Pre-computed inertia barrier positions (Phase 1 output) — shortcut to geometry.inertiaBarriers */
  readonly inertiaBarriers: ReadonlyArray<InertiaGeometry>;

  /** Pre-computed pipeline rectangles (Phase 1 output) — shortcut to geometry.pipelines */
  readonly pipelines: ReadonlyArray<PipelineGeometryPixels>;

  /** Component lookup by id */
  readonly componentById: ReadonlyMap<string, Component>;

  /** Convert normalised evolution [0-1] → pixel x */
  readonly evoToX: (evolution: number) => number;

  /** Convert normalised visibility [0-1] → pixel y */
  readonly visToY: (visibility: number) => number;

  /** Rendering options (user overrides merged with defaults) */
  readonly options: RenderOptions;

  /** Fully-resolved render config with all defaults applied (from resolveTheme).
   *  Use this instead of ctx.map.renderConfig to avoid manual null-coalescing. */
  readonly resolvedConfig: ResolvedRenderConfig;
}

// ── Layer renderer function type ─────────────────────────────────

/**
 * A layer renderer is a pure function that takes a RenderContext
 * and returns an array of SVG fragment strings.
 *
 * Each layer is responsible for one visual concern:
 *   title, axes, pipelines, edges, evolvesTo, nodes, labels, notes
 *
 * Layers are called in order; their output is concatenated to form
 * the complete SVG body.
 */
export type LayerRenderer = (ctx: RenderContext) => string[];

// ── Layer metadata ───────────────────────────────────────────────

/** Layer names — defines the canonical set of visual layers */
export type LayerName =
  | "title"
  | "axes"
  | "pipelines"
  | "edges"
  | "evolvesTo"
  | "nodes"
  | "steps"
  | "accelerators"
  | "labels"
  | "notes"
  | "legend";

/** A registered layer with its renderer and execution order */
export interface LayerRegistration {
  /** Unique layer name */
  readonly name: LayerName;
  /** Execution order (lower = rendered first = further back in z-order) */
  readonly order: number;
  /** The renderer function */
  readonly render: LayerRenderer;
}
