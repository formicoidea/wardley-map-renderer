/**
 * Wardley Map block constants.
 *
 * Evolution phase ratios define the vertical divider positions on the
 * evolution axis (x-axis).  Each value is the **start** of the named phase
 * expressed as a 0–1 ratio of the block width.
 *
 * ┌──────────┬─────────────┬──────────────────┬─────────────────────┐
 * │ Genesis  │ Custom-Built│ Product (+Rental) │ Commodity (+Utility)│
 * │ 0 — 0.175│ 0.175 — 0.4 │ 0.4 — 0.7        │ 0.7 — 1.0           │
 * └──────────┴─────────────┴──────────────────┴─────────────────────┘
 */

// ── Default block dimensions (16:9) ────────────────────────────────
export const WARDLEY_MAP_DEFAULT_WIDTH = 1600;
export const WARDLEY_MAP_DEFAULT_HEIGHT = 900;

// ── Evolution phase boundary ratios ────────────────────────────────
export const EVOLUTION_PHASE_CUSTOM = 0.175;
export const EVOLUTION_PHASE_PRODUCT = 0.4;
export const EVOLUTION_PHASE_COMMODITY = 0.7;

/** Ordered phase definitions for rendering */
export interface EvolutionPhase {
  readonly label: string;
  readonly startRatio: number;
  readonly endRatio: number;
}

export const EVOLUTION_PHASES: readonly EvolutionPhase[] = [
  { label: 'Genesis', startRatio: 0, endRatio: EVOLUTION_PHASE_CUSTOM },
  { label: 'Custom', startRatio: EVOLUTION_PHASE_CUSTOM, endRatio: EVOLUTION_PHASE_PRODUCT },
  { label: 'Product (+rental)', startRatio: EVOLUTION_PHASE_PRODUCT, endRatio: EVOLUTION_PHASE_COMMODITY },
  { label: 'Commodity (+utility)', startRatio: EVOLUTION_PHASE_COMMODITY, endRatio: 1.0 },
] as const;

/** Boundary x-ratios (the three interior dividers) */
export const EVOLUTION_BOUNDARIES = [
  EVOLUTION_PHASE_CUSTOM,
  EVOLUTION_PHASE_PRODUCT,
  EVOLUTION_PHASE_COMMODITY,
] as const;

// ── Block flavour identifier ───────────────────────────────────────
export const WARDLEY_MAP_FLAVOUR = 'affine:wardley-map' as const;

// ── Visual constants ───────────────────────────────────────────────
export const AXIS_LABEL_FONT = '13px Inter, sans-serif';
export const PHASE_LABEL_FONT = '11px Inter, sans-serif';
export const BORDER_COLOR = '#c0c0c0';
export const DIVIDER_COLOR = '#444444';
export const BACKGROUND_COLOR = '#ffffff';
export const LABEL_COLOR = '#666666';
export const AXIS_LABEL_COLOR = '#444444';
export const SUBTITLE_COLOR = '#666666';

// ── Subtitle layout ──────────────────────────────────────────────
/** Subtitle spans 7/8 of the map width */
export const SUBTITLE_WIDTH_RATIO = 7 / 8;
export const SUBTITLE_FONT_SIZE = 13;
export const SUBTITLE_LINE_HEIGHT = 18;

// ── Layout margins (canvas units) ─────────────────────────────────
/** Left margin for the Y-axis label area */
export const AXIS_MARGIN_LEFT = 48;
/** Bottom margin for the X-axis label area */
export const AXIS_MARGIN_BOTTOM = 48;
/** Top padding for "Visible" indicator */
export const AXIS_MARGIN_TOP = 24;

// ── Font sizes (base sizes at zoom=1.0, in px) ───────────────────
export const AXIS_LABEL_FONT_SIZE = 13;
export const PHASE_LABEL_FONT_SIZE = 12;
export const DIRECTION_LABEL_FONT_SIZE = 10;
export const TITLE_FONT_SIZE = 16;

// ── Default axis labels ─────────────────────────────────────────
export const DEFAULT_X_AXIS_LABEL = 'Evolution';
export const DEFAULT_Y_AXIS_LABEL = 'Value Chain';

/** Zoom clamp bounds — labels never shrink below MIN or grow above MAX */
export const ZOOM_LABEL_SCALE_MIN = 0.5;
export const ZOOM_LABEL_SCALE_MAX = 3.0;

// ── Layer visibility toggles ──────────────────────────────────────
/**
 * Each boolean controls the visibility of a visual layer on the map.
 * Defaults are chosen for a clean, standard Wardley Map presentation.
 */
export interface LayerVisibility {
  /** Axis lines (evolution x-axis + value chain y-axis) */
  readonly showAxes: boolean;
  /** Phase labels below x-axis (Genesis, Custom-Built, Product, Commodity) */
  readonly showPhaseLabels: boolean;
  /** Colored background shading per evolution zone */
  readonly showZoneShading: boolean;
  /** S-curve overlay showing punctuated equilibrium */
  readonly showEquilibriumCurve: boolean;
  /** Highlighted region marking competition-free (genesis) zone */
  readonly showCompetitionFreeZone: boolean;
  /** Intensity gradient: innovation activity (higher in Genesis) */
  readonly showInnovationGradient: boolean;
  /** Intensity gradient: industrialisation pressure (higher in Commodity) */
  readonly showIndustrialisationGradient: boolean;
  /** Intensity gradient: market uncertainty (higher in Genesis, fading right) */
  readonly showUncertaintyGradient: boolean;
}

/** Default layer visibility — standard Wardley Map view */
export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  showAxes: true,
  showPhaseLabels: true,
  showZoneShading: false,
  showEquilibriumCurve: false,
  showCompetitionFreeZone: false,
  showInnovationGradient: false,
  showIndustrialisationGradient: false,
  showUncertaintyGradient: false,
};

// ── Zone shading colors (subtle, per evolution phase) ─────────────
/** Genesis zone — cool blue-gray (exploration / uncertainty) */
export const ZONE_COLOR_GENESIS = 'rgba(200, 220, 240, 0.18)';
/** Custom-Built zone — warm beige (bespoke construction) */
export const ZONE_COLOR_CUSTOM = 'rgba(240, 230, 200, 0.18)';
/** Product zone — light green (emerging standardisation) */
export const ZONE_COLOR_PRODUCT = 'rgba(210, 240, 210, 0.18)';
/** Commodity zone — light gray (utility / known quantities) */
export const ZONE_COLOR_COMMODITY = 'rgba(220, 220, 220, 0.18)';

/** Ordered zone colors matching EVOLUTION_PHASES order */
export const ZONE_COLORS = [
  ZONE_COLOR_GENESIS,
  ZONE_COLOR_CUSTOM,
  ZONE_COLOR_PRODUCT,
  ZONE_COLOR_COMMODITY,
] as const;

// ── Punctuated equilibrium curve ──────────────────────────────────
/** Stroke color for the S-curve */
export const EQUILIBRIUM_CURVE_COLOR = 'rgba(120, 120, 180, 0.45)';
/** Stroke width for the S-curve */
export const EQUILIBRIUM_CURVE_WIDTH = 2.5;

// ── Competition-free zone ─────────────────────────────────────────
/** Fill color for the competition-free (genesis) overlay */
export const COMPETITION_FREE_ZONE_COLOR = 'rgba(180, 200, 240, 0.12)';
/** Border color for competition-free zone boundary */
export const COMPETITION_FREE_ZONE_BORDER = 'rgba(140, 170, 220, 0.35)';
/** The competition-free zone spans genesis (0 → custom boundary) */
export const COMPETITION_FREE_ZONE_END = EVOLUTION_PHASE_CUSTOM;

// ── Intensity gradient colors ─────────────────────────────────────
/** Innovation gradient: saturated on the left (genesis), fading right */
export const INNOVATION_GRADIENT_START = 'rgba(100, 140, 220, 0.22)';
export const INNOVATION_GRADIENT_END = 'rgba(100, 140, 220, 0.0)';

/** Industrialisation gradient: fading left, saturated right (commodity) */
export const INDUSTRIALISATION_GRADIENT_START = 'rgba(180, 180, 180, 0.0)';
export const INDUSTRIALISATION_GRADIENT_END = 'rgba(180, 180, 180, 0.22)';

/** Uncertainty gradient: saturated top-left, fading toward bottom-right */
export const UNCERTAINTY_GRADIENT_START = 'rgba(220, 180, 100, 0.18)';
export const UNCERTAINTY_GRADIENT_END = 'rgba(220, 180, 100, 0.0)';
