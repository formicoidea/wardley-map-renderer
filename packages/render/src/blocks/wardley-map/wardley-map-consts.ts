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
  { label: 'Custom-Built', startRatio: EVOLUTION_PHASE_CUSTOM, endRatio: EVOLUTION_PHASE_PRODUCT },
  { label: 'Product (+Rental)', startRatio: EVOLUTION_PHASE_PRODUCT, endRatio: EVOLUTION_PHASE_COMMODITY },
  { label: 'Commodity (+Utility)', startRatio: EVOLUTION_PHASE_COMMODITY, endRatio: 1.0 },
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
export const AXIS_MARGIN_LEFT = 28;
/** Bottom margin for the X-axis label area */
export const AXIS_MARGIN_BOTTOM = 28;
/** Top padding for "Visible" indicator */
export const AXIS_MARGIN_TOP = 28;

// ── Font sizes (base sizes at zoom=1.0, in px) ───────────────────
export const AXIS_LABEL_FONT_SIZE = 13;
export const PHASE_LABEL_FONT_SIZE = 12;
export const DIRECTION_LABEL_FONT_SIZE = 10;
export const TITLE_FONT_SIZE = 16;

// ── Default axis labels ─────────────────────────────────────────
export const DEFAULT_X_AXIS_LABEL = 'Evolution';
export const DEFAULT_Y_AXIS_LABEL = 'Value Chain';

// ── i18n locale presets for axis labels ─────────────────────────
/** Resolved axis labels after applying locale defaults + overrides */
export interface ResolvedAxisLabels {
  readonly xAxis: string;
  readonly yAxis: string;
  /**
   * Ordered list of evolution phase labels.
   *
   * Arbitrarily sized — not locked to 4. The default presets use 4 labels
   * (Genesis / Custom-Built / Product / Commodity), but callers may supply any
   * number ≥ 1 to match a map with a different number of evolution zones.
   *
   * ## Known tension with evolveStyles
   * `evolveStyles` keys are a **closed enum** derived from the four named
   * evolution types (natural / ecosystem / forced / late).  `phases` (this field)
   * is now an open-length array.  There is therefore a deliberate mismatch:
   * the *display vocabulary* (how many labelled columns the map shows) is
   * decoupled from the *style vocabulary* (which named arrow types exist).
   *
   * Migration path (future): evolveStyles will be replaced by position-range-based
   * styles that map `[evolutionStart, evolutionEnd]` intervals to arrow styles,
   * removing the hard dependency on named zone labels entirely.
   */
  readonly phases: readonly string[];
  readonly evolutionStart: string;
  readonly evolutionEnd: string;
  readonly visibilityHigh: string;
  readonly visibilityLow: string;
}

/** English (default) axis labels */
export const AXIS_LABELS_EN: ResolvedAxisLabels = {
  xAxis: 'Evolution',
  yAxis: 'Value Chain',
  phases: ['Genesis', 'Custom-Built', 'Product (+Rental)', 'Commodity (+Utility)'],
  evolutionStart: 'Uncharted',
  evolutionEnd: 'Industrialized',
  visibilityHigh: 'Visible',
  visibilityLow: 'Invisible',
} as const;

/** French axis labels */
export const AXIS_LABELS_FR: ResolvedAxisLabels = {
  xAxis: 'Évolution',
  yAxis: 'Chaîne de valeur',
  phases: ['Genèse', 'Sur mesure', 'Produit (+location)', 'Commodité (+utilité)'],
  evolutionStart: 'Inexploré',
  evolutionEnd: 'Industrialisé',
  visibilityHigh: 'Visible',
  visibilityLow: 'Invisible',
} as const;

/** Locale → preset mapping */
export const AXIS_LABELS_BY_LOCALE: Record<string, ResolvedAxisLabels> = {
  en: AXIS_LABELS_EN,
  fr: AXIS_LABELS_FR,
};

/**
 * Resolve axis labels according to the i18n precedence chain:
 *
 * Priority (highest wins):
 *   3. Explicit label strings   — per-field overrides supplied by the caller (always win)
 *   2. Locale preset            — `AXIS_LABELS_EN` or `AXIS_LABELS_FR` selected by `locale`
 *   1. English fallback         — `AXIS_LABELS_EN` used when `locale` is absent or unknown
 *
 * In other words: locale only provides **fallback defaults**; any explicit string supplied
 * for a field replaces the locale-resolved value for that field, regardless of which locale
 * is active.  A caller can therefore pass `locale: "fr"` and `xAxis: "My Label"` to get
 * French labels everywhere except the X-axis title.
 *
 * ## Explicit-empty vs. absent distinction
 *
 * For individual string fields (`xAxis`, `yAxis`, `evolutionStart`, etc.) and for
 * per-element entries of the `phases` array, there is a semantic difference between
 * an **explicit empty string** and an **absent / undefined value**:
 *
 *   - `undefined` (or field omitted)  → use the locale-resolved default for that field
 *   - `''` (empty string)             → render **no label** for that field (explicit suppression)
 *   - `'non-empty string'`            → use exactly that string, overriding the locale preset
 *
 * This distinction is preserved by using the nullish-coalescing operator (`??`) rather
 * than the logical-OR operator (`||`):
 *   `'' ?? preset.xAxis`  →  `''`            (empty string wins — not replaced by preset)
 *   `undefined ?? preset.xAxis`  →  `preset.xAxis`  (absent → locale default)
 *
 * ## Per-element phase label merging
 *
 * When `phases` is provided, **each element** is resolved independently:
 *   - `phases[i] === undefined`  → use the locale preset's `phases[i]` (or `''` if out of range)
 *   - `phases[i] === ''`         → rendered as empty (no label for that phase column)
 *   - `phases[i] === 'Custom'`   → `'Custom'` wins over locale preset for that index only
 *
 * If `phases` is omitted entirely (`undefined`), the full locale preset array is used as-is.
 *
 * @param labels - Optional axis labels from the map schema (locale + per-field overrides)
 * @returns Fully resolved labels ready for rendering (all 7 fields guaranteed non-null)
 */
export function resolveAxisLabels(labels?: {
  locale?: string;
  xAxis?: string;
  yAxis?: string;
  /**
   * Arbitrarily-sized ordered list of phase labels; not locked to 4.
   *
   * Each entry is `string | undefined`:
   *   - `undefined` → use the locale-preset label for that index
   *   - `''`        → suppress the label for that phase column (explicit empty)
   *   - `'text'`    → use exactly `'text'` regardless of locale
   */
  phases?: (string | undefined)[];
  evolutionStart?: string;
  evolutionEnd?: string;
  visibilityHigh?: string;
  visibilityLow?: string;
}): ResolvedAxisLabels {
  const locale = labels?.locale ?? 'en';
  const preset = AXIS_LABELS_BY_LOCALE[locale] ?? AXIS_LABELS_EN;

  // Per-element phase resolution: undefined → locale default; '' → explicit suppression; string → wins
  const resolvedPhases: string[] = labels?.phases
    ? labels.phases.map((p, i) =>
        p === undefined
          ? (preset.phases[i] ?? '') // undefined → use locale default for this index
          : p                        // '' or non-empty: use as-is (preserves explicit suppression)
      )
    : [...preset.phases]; // no override → use full locale preset

  return {
    xAxis: labels?.xAxis ?? preset.xAxis,
    yAxis: labels?.yAxis ?? preset.yAxis,
    phases: resolvedPhases,
    evolutionStart: labels?.evolutionStart ?? preset.evolutionStart,
    evolutionEnd: labels?.evolutionEnd ?? preset.evolutionEnd,
    visibilityHigh: labels?.visibilityHigh ?? preset.visibilityHigh,
    visibilityLow: labels?.visibilityLow ?? preset.visibilityLow,
  };
}

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
