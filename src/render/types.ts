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

import type { WardleyMap, Component, Relation } from "../schema.js";

/** Component type extracted from schema Component */
type ComponentType = Component["type"];

// ── Layout dimensions ────────────────────────────────────────────

/** Fixed margins in pixels — identical regardless of gridSize or axes state */
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
  readonly evolveType: "natural" | "ecosystem" | "forced";
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
  /** Override canvas width (defaults to map.gridSize.width) */
  readonly width?: number;

  /** Override canvas height (defaults to map.gridSize.height) */
  readonly height?: number;

  /** Background color (defaults to "#ffffff") */
  readonly backgroundColor?: string;

  /** Whether to render axes (border, grid, phase labels). Defaults to map.axes values. */
  readonly showAxes?: boolean;

  /** Whether to render the value chain (y-axis) label and direction indicators */
  readonly showValueChain?: boolean;

  /** Whether to render evolution phase labels below x-axis */
  readonly showPhaseLabels?: boolean;

  /** Font family for all text (defaults to "Inter, sans-serif") */
  readonly fontFamily?: string;

  /** Scale factor for component label font size (1.0 = default 12px) */
  readonly labelScale?: number;

  /** Node circle radius in pixels (defaults to 5) */
  readonly nodeRadius?: number;

  /** Enable/disable label collision avoidance (defaults to true) */
  readonly avoidCollisions?: boolean;

  /** Component types to exclude from rendering (e.g. ["note"] to hide notes) */
  readonly excludeTypes?: ReadonlyArray<ComponentType>;

  /** Custom color overrides by component type */
  readonly typeColors?: Partial<Record<ComponentType, string>>;

  /** evolveType → stroke style mapping for evolution arrows */
  readonly evolveStyles?: Partial<Record<"natural" | "ecosystem" | "forced", {
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

  /** SVG canvas dimensions (from gridSize + margins) */
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
  | "labels"
  | "notes";

/** A registered layer with its renderer and execution order */
export interface LayerRegistration {
  /** Unique layer name */
  readonly name: LayerName;
  /** Execution order (lower = rendered first = further back in z-order) */
  readonly order: number;
  /** The renderer function */
  readonly render: LayerRenderer;
}
