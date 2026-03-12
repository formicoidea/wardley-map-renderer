/**
 * WardleyMapBlockSchema — BlockSuite-compatible schema definition.
 *
 * Flavour: `affine:wardley-map`
 * Parent:  `affine:surface` (Edgeless canvas surface)
 *
 * This is a **spike** implementation.  In the real AFFiNE monorepo the
 * schema would be declared with `defineBlockSchema()` from `@blocksuite/store`.
 * Here we model the same shape so the Lit component can consume it.
 */

import {
  WARDLEY_MAP_DEFAULT_WIDTH,
  WARDLEY_MAP_DEFAULT_HEIGHT,
  EVOLUTION_PHASE_CUSTOM,
  EVOLUTION_PHASE_PRODUCT,
  EVOLUTION_PHASE_COMMODITY,
  WARDLEY_MAP_FLAVOUR,
} from './wardley-map-consts.js';

// ── Props type (mirrors BlockSuite schema props) ───────────────────

export interface EvolutionPhaseRatios {
  readonly custom: number;
  readonly product: number;
  readonly commodity: number;
}

/**
 * Custom labels for evolution phase zones.
 * Editable via double-click on zone labels in the canvas.
 */
export interface PhaseLabels {
  genesis: string;
  customBuilt: string;
  product: string;
  commodity: string;
}

export const DEFAULT_PHASE_LABELS: Readonly<PhaseLabels> = {
  genesis: 'Genesis',
  customBuilt: 'Custom-Built',
  product: 'Product (+Rental)',
  commodity: 'Commodity (+Utility)',
} as const;

// ── Toggle properties interface ─────────────────────────────────────

/**
 * Nine boolean toggles controlling visibility of Wardley Map
 * background layers.  Each can be independently enabled/disabled
 * via the settings panel or programmatically.
 */
export interface WardleyMapToggles {
  /** Show evolution (x) and value-chain (y) axis lines and labels */
  showAxes: boolean;

  /** Show horizontal grid lines across the visibility axis */
  showGrid: boolean;

  /** Show vertical phase dividers and phase labels (Genesis → Commodity) */
  showPhases: boolean;

  /** Show coloured zone backgrounds behind each evolution phase */
  showZones: boolean;

  /** Show the punctuated-equilibrium overlay (S-curve transition zones) */
  showPunctuatedEquilibrium: boolean;

  /** Show the competition-free zone indicator (top-left genesis area) */
  showCompetitionFreeZone: boolean;

  /** Intensity gradient: evolution axis (left-to-right shading) */
  showEvolutionIntensity: boolean;

  /** Intensity gradient: visibility axis (top-to-bottom shading) */
  showVisibilityIntensity: boolean;

  /** Intensity gradient: activity heat-map overlay */
  showActivityIntensity: boolean;
}

/** Default toggle values — axes, grid, and phases ON; overlays OFF */
export const DEFAULT_WARDLEY_MAP_TOGGLES: Readonly<WardleyMapToggles> = {
  showAxes: true,
  showGrid: true,
  showPhases: true,
  showZones: false,
  showPunctuatedEquilibrium: false,
  showCompetitionFreeZone: false,
  showEvolutionIntensity: false,
  showVisibilityIntensity: false,
  showActivityIntensity: false,
} as const;

// ── Block props interface ──────────────────────────────────────────

export interface WardleyMapBlockProps extends WardleyMapToggles {
  /** Block flavour identifier */
  readonly flavour: typeof WARDLEY_MAP_FLAVOUR;

  /** Display width in canvas units (default 1600) */
  width: number;

  /** Display height in canvas units (default 900) */
  height: number;

  /** Optional user title for the map */
  title: string;

  /** Optional subtitle — spans 7/8 of map width, supports text wrapping */
  subtitle: string;

  /** Evolution phase boundary ratios (x-axis dividers) */
  evolutionPhaseRatios: EvolutionPhaseRatios;

  /** Position on the surface (x, y) — set by canvas placement */
  xywh: string; // "[x,y,w,h]" serialized

  /**
   * Optional linked AFFiNE page ID.
   *
   * When set, the map block is associated with an AFFiNE page/doc.
   * Double-clicking or clicking the link icon navigates to the page.
   * Null means no page is linked.
   */
  linkedPageId: string | null;

  /** Custom X-axis label (default: "Evolution") */
  xAxisLabel: string;

  /** Custom Y-axis label (default: "Value Chain (Visibility)") */
  yAxisLabel: string;

  /** Custom labels for evolution phase zones */
  phaseLabels: PhaseLabels;
}

// ── Default prop values ────────────────────────────────────────────

export const defaultWardleyMapBlockProps: WardleyMapBlockProps = {
  flavour: WARDLEY_MAP_FLAVOUR,
  width: WARDLEY_MAP_DEFAULT_WIDTH,
  height: WARDLEY_MAP_DEFAULT_HEIGHT,
  title: '',
  subtitle: '',
  evolutionPhaseRatios: {
    custom: EVOLUTION_PHASE_CUSTOM,
    product: EVOLUTION_PHASE_PRODUCT,
    commodity: EVOLUTION_PHASE_COMMODITY,
  },
  xywh: `[0,0,${WARDLEY_MAP_DEFAULT_WIDTH},${WARDLEY_MAP_DEFAULT_HEIGHT}]`,
  linkedPageId: null,
  xAxisLabel: 'Evolution',
  yAxisLabel: 'Value Chain (Visibility)',
  phaseLabels: { ...DEFAULT_PHASE_LABELS },
  // Toggle defaults (spread from canonical defaults object)
  ...DEFAULT_WARDLEY_MAP_TOGGLES,
};

/**
 * Spike-only schema descriptor.
 *
 * In the AFFiNE monorepo this would be:
 *
 * ```ts
 * export const WardleyMapBlockSchema = defineBlockSchema({
 *   flavour: 'affine:wardley-map',
 *   props: () => ({ ...defaultWardleyMapBlockProps }),
 *   metadata: { role: 'content', parent: ['affine:surface'] },
 * });
 * ```
 */
export const WardleyMapBlockSchemaDescriptor = {
  flavour: WARDLEY_MAP_FLAVOUR,
  role: 'content' as const,
  parent: ['affine:surface'] as const,
  props: () => ({ ...defaultWardleyMapBlockProps }),
} as const;
