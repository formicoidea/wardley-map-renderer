/**
 * wardley-map-block.ts — Lit element that renders a Wardley Map background
 * on the AFFiNE Edgeless Canvas surface.
 *
 * This is the **spike** surface renderer (Sub-ACs 1–4 of US1).
 * It draws:
 *   • A 16:9 white rectangle (1600×900 default)
 *   • Three vertical evolution-phase dividers at x=0.175, 0.4, 0.7
 *   • Phase labels along the bottom (Genesis → Commodity)
 *   • An "Evolution" x-axis label with directional arrow
 *   • A "Value Chain (Visibility)" y-axis label (top = Visible, bottom = Invisible)
 *   • Subtle horizontal grid lines for the visibility axis
 *   • A thin border for edge-only selection affordance
 *   • An optional subtitle spanning 7/8 width with text wrapping
 *   • A linked page indicator (link icon) with navigation on double-click
 *
 * In the real AFFiNE integration this would extend
 * `BlockComponent` from `@blocksuite/lit`.  Here it extends `LitElement`
 * directly so we can validate rendering in isolation.
 */

import { LitElement, html, css, svg, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import {
  WARDLEY_MAP_DEFAULT_WIDTH,
  WARDLEY_MAP_DEFAULT_HEIGHT,
  BORDER_COLOR,
  DIVIDER_COLOR,
  BACKGROUND_COLOR,
  LABEL_COLOR,
  AXIS_LABEL_COLOR,
  SUBTITLE_COLOR,
  SUBTITLE_WIDTH_RATIO,
  SUBTITLE_FONT_SIZE,
  SUBTITLE_LINE_HEIGHT,
  DEFAULT_X_AXIS_LABEL,
  DEFAULT_Y_AXIS_LABEL,
  ZONE_COLORS,
  EQUILIBRIUM_CURVE_COLOR,
  EQUILIBRIUM_CURVE_WIDTH,
  COMPETITION_FREE_ZONE_COLOR,
  COMPETITION_FREE_ZONE_BORDER,
  COMPETITION_FREE_ZONE_END,
  INNOVATION_GRADIENT_START,
  INNOVATION_GRADIENT_END,
  INDUSTRIALISATION_GRADIENT_START,
  INDUSTRIALISATION_GRADIENT_END,
  UNCERTAINTY_GRADIENT_START,
  UNCERTAINTY_GRADIENT_END,
  type EvolutionPhase,
} from './wardley-map-consts.js';
import {
  AXIS_LABEL_FONT_SIZE,
  PHASE_LABEL_FONT_SIZE,
  DIRECTION_LABEL_FONT_SIZE,
  TITLE_FONT_SIZE,
} from './wardley-map-consts.js';
import {
  type EvolutionPhaseRatios,
  type PhaseLabels,
  DEFAULT_PHASE_LABELS,
  DEFAULT_WARDLEY_MAP_TOGGLES,
} from './wardley-map-schema.js';
import {
  createNavigateEvent,
  createLinkChangeEvent,
} from './wardley-map-page-link.js';
import {
  zoomStableFontSize,
  type ZoomStableTextOptions,
} from './wardley-map-zoom-utils.js';

// ── Subtitle edit events ──────────────────────────────────────────

/** Event name fired when the user confirms a subtitle edit */
export const WARDLEY_MAP_SUBTITLE_CHANGE_EVENT = 'wardley-map-subtitle-change' as const;

/** Detail payload for subtitle change events */
export interface SubtitleChangeDetail {
  /** The block ID that changed */
  readonly blockId: string;
  /** Previous subtitle value */
  readonly previousSubtitle: string;
  /** New subtitle value */
  readonly newSubtitle: string;
}

/** Create a subtitle-change custom event */
export function createSubtitleChangeEvent(
  detail: SubtitleChangeDetail,
): CustomEvent<SubtitleChangeDetail> {
  return new CustomEvent(WARDLEY_MAP_SUBTITLE_CHANGE_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

// ── Phase label edit events ──────────────────────────────────────

/** Event name fired when the user confirms a phase label edit */
export const WARDLEY_MAP_PHASE_LABEL_CHANGE_EVENT = 'wardley-map-phase-label-change' as const;

/** Detail payload for phase label change events */
export interface PhaseLabelChangeDetail {
  /** The block ID that changed */
  readonly blockId: string;
  /** Index of the phase (0=Genesis, 1=Custom, 2=Product, 3=Commodity) */
  readonly phaseIndex: number;
  /** Previous label value */
  readonly previousLabel: string;
  /** New label value */
  readonly newLabel: string;
}

/** Create a phase-label-change custom event */
export function createPhaseLabelChangeEvent(
  detail: PhaseLabelChangeDetail,
): CustomEvent<PhaseLabelChangeDetail> {
  return new CustomEvent(WARDLEY_MAP_PHASE_LABEL_CHANGE_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

// ── Axis label edit events ────────────────────────────────────────

/** Which axis label is being edited (null = none) */
export type EditingAxis = 'x' | 'y' | null;

/** Event name fired when the user confirms an axis label edit */
export const WARDLEY_MAP_AXIS_LABEL_CHANGE_EVENT = 'wardley-map-axis-label-change' as const;

/** Detail payload for axis label change events */
export interface AxisLabelChangeDetail {
  /** The block ID that changed */
  readonly blockId: string;
  /** Which axis was edited */
  readonly axis: 'x' | 'y';
  /** Previous label value */
  readonly previousLabel: string;
  /** New label value */
  readonly newLabel: string;
}

/** Create an axis-label-change custom event */
export function createAxisLabelChangeEvent(
  detail: AxisLabelChangeDetail,
): CustomEvent<AxisLabelChangeDetail> {
  return new CustomEvent(WARDLEY_MAP_AXIS_LABEL_CHANGE_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

/** Phase key ordered by phase index */
const PHASE_KEYS: readonly (keyof PhaseLabels)[] = [
  'genesis',
  'customBuilt',
  'product',
  'commodity',
] as const;

// ── Layout margins ────────────────────────────────────────────────
// The map area sits within these margins, leaving space for axis labels.
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 50;

// ── Grid ──────────────────────────────────────────────────────────
const GRID_COLOR = '#e8e8e8';
const GRID_LINE_COUNT = 8; // horizontal grid lines for visibility axis

// ── Helpers ────────────────────────────────────────────────────────

/** Build phase objects from custom ratios and labels */
function buildPhases(
  ratios: EvolutionPhaseRatios,
  labels: PhaseLabels = DEFAULT_PHASE_LABELS,
): readonly EvolutionPhase[] {
  return [
    { label: labels.genesis, startRatio: 0, endRatio: ratios.custom },
    { label: labels.customBuilt, startRatio: ratios.custom, endRatio: ratios.product },
    { label: labels.product, startRatio: ratios.product, endRatio: ratios.commodity },
    { label: labels.commodity, startRatio: ratios.commodity, endRatio: 1.0 },
  ];
}

// ── Component ──────────────────────────────────────────────────────

@customElement('wardley-map-block')
export class WardleyMapBlockElement extends LitElement {
  // -- Reactive properties (map to block model props) ---------------

  @property({ type: Number })
  width = WARDLEY_MAP_DEFAULT_WIDTH;

  @property({ type: Number })
  height = WARDLEY_MAP_DEFAULT_HEIGHT;

  @property({ type: String, attribute: 'map-title' })
  mapTitle = '';

  @property({ type: String, attribute: 'map-subtitle' })
  mapSubtitle = '';

  @property({ type: Number, attribute: 'ratio-custom' })
  ratioCustom = 0.175;

  @property({ type: Number, attribute: 'ratio-product' })
  ratioProduct = 0.4;

  @property({ type: Number, attribute: 'ratio-commodity' })
  ratioCommodity = 0.7;

  /**
   * Current canvas zoom level, passed from the Edgeless surface host.
   * Used to compute inverse-scale font sizes for zoom-stable text.
   * Default 1.0 = no zoom compensation (labels at natural SVG size).
   *
   * @see wardley-map-zoom-utils.ts for the scaling algorithm.
   */
  @property({ type: Number })
  zoom = 1.0;

  // -- Linked page properties (Sub-AC 4) -----------------------------

  /** AFFiNE page ID linked to this map block (null = no link) */
  @property({ type: String, attribute: 'linked-page-id', reflect: true })
  linkedPageId: string | null = null;

  /** Cached display title of the linked page */
  @property({ type: String, attribute: 'linked-page-title' })
  linkedPageTitle = '';

  /** Block ID for event identification */
  @property({ type: String, attribute: 'block-id' })
  blockId = '';

  // -- Read-only mode (when plugin/feature flag is disabled) -----------

  /**
   * When true, the block is in read-only mode:
   *   • Double-click editing of subtitle, phase labels, axis labels is disabled
   *   • Setting linked pages programmatically is blocked
   *   • Cursor styles change to indicate non-interactive state
   *   • The block still renders normally (map data is visible)
   *
   * This is typically set when the Wardley Maps feature flag is disabled
   * but existing map blocks need to be displayed without modification.
   */
  @property({ type: Boolean, reflect: true })
  readonly = false;

  // -- Overlay toggles (wired to WardleyMapToggles from schema) --------

  /** Show evolution (x) and value chain (y) axis lines and labels */
  @property({ type: Boolean, attribute: 'show-axes' })
  showAxes = DEFAULT_WARDLEY_MAP_TOGGLES.showAxes;

  /** Show horizontal grid lines across the visibility axis */
  @property({ type: Boolean, attribute: 'show-grid' })
  showGrid = DEFAULT_WARDLEY_MAP_TOGGLES.showGrid;

  /** Show vertical phase dividers and phase labels */
  @property({ type: Boolean, attribute: 'show-phases' })
  showPhases = DEFAULT_WARDLEY_MAP_TOGGLES.showPhases;

  /** Show coloured zone backgrounds behind each evolution phase */
  @property({ type: Boolean, attribute: 'show-zones' })
  showZones = DEFAULT_WARDLEY_MAP_TOGGLES.showZones;

  /** Show the punctuated-equilibrium overlay */
  @property({ type: Boolean, attribute: 'show-punctuated-equilibrium' })
  showPunctuatedEquilibrium = DEFAULT_WARDLEY_MAP_TOGGLES.showPunctuatedEquilibrium;

  /** Show the competition-free zone indicator */
  @property({ type: Boolean, attribute: 'show-competition-free-zone' })
  showCompetitionFreeZone = DEFAULT_WARDLEY_MAP_TOGGLES.showCompetitionFreeZone;

  /** Intensity gradient: evolution axis */
  @property({ type: Boolean, attribute: 'show-evolution-intensity' })
  showEvolutionIntensity = DEFAULT_WARDLEY_MAP_TOGGLES.showEvolutionIntensity;

  /** Intensity gradient: visibility axis */
  @property({ type: Boolean, attribute: 'show-visibility-intensity' })
  showVisibilityIntensity = DEFAULT_WARDLEY_MAP_TOGGLES.showVisibilityIntensity;

  /** Intensity gradient: activity heat-map */
  @property({ type: Boolean, attribute: 'show-activity-intensity' })
  showActivityIntensity = DEFAULT_WARDLEY_MAP_TOGGLES.showActivityIntensity;

  // -- Phase label properties (custom zone labels) ---------------------

  @property({ type: String, attribute: 'label-genesis' })
  labelGenesis = DEFAULT_PHASE_LABELS.genesis;

  @property({ type: String, attribute: 'label-custom-built' })
  labelCustomBuilt = DEFAULT_PHASE_LABELS.customBuilt;

  @property({ type: String, attribute: 'label-product' })
  labelProduct = DEFAULT_PHASE_LABELS.product;

  @property({ type: String, attribute: 'label-commodity' })
  labelCommodity = DEFAULT_PHASE_LABELS.commodity;

  // -- Axis label properties (editable via double-click) ---------------

  /** Custom X-axis label (default: "Evolution") */
  @property({ type: String, attribute: 'x-axis-label' })
  xAxisLabel = DEFAULT_X_AXIS_LABEL;

  /** Custom Y-axis label (default: "Value Chain (Visibility)") */
  @property({ type: String, attribute: 'y-axis-label' })
  yAxisLabel = DEFAULT_Y_AXIS_LABEL;

  // -- Internal state (subtitle inline editing) -----------------------

  /** Whether the subtitle is currently being edited inline */
  @state()
  private _isEditingSubtitle = false;

  /** Draft value while editing; reset on cancel */
  @state()
  private _subtitleDraft = '';

  // -- Internal state (axis label inline editing) ----------------------

  /** Which axis label is currently being edited (null = none) */
  @state()
  private _editingAxis: EditingAxis = null;

  /** Draft value while editing an axis label; reset on cancel */
  @state()
  private _axisLabelDraft = '';

  // -- Internal state (phase label inline editing) --------------------

  /** Index of the phase label currently being edited (-1 = none) */
  @state()
  private _editingPhaseIndex = -1;

  /** Draft text while editing a phase label */
  @state()
  private _phaseLabelDraft = '';

  // -- Styles -------------------------------------------------------

  static override styles = css`
    :host {
      display: block;
      position: relative;
      user-select: none;
      /* Edge-only selection: pointer-events only on the host border area.
         Interior clicks pass through to children on the surface. */
    }

    .wardley-map-container {
      position: relative;
      overflow: hidden;
    }

    svg {
      display: block;
    }

    /* Linked page indicator icon (top-right corner) */
    .linked-page-indicator {
      position: absolute;
      top: 6px;
      right: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #d0d0d0;
      border-radius: 4px;
      cursor: pointer;
      font-family: Inter, system-ui, sans-serif;
      font-size: 11px;
      color: #555;
      transition: background 0.15s ease, border-color 0.15s ease;
      pointer-events: auto;
      z-index: 1;
    }

    .linked-page-indicator:hover {
      background: rgba(240, 245, 255, 0.95);
      border-color: #1e96eb;
      color: #1e96eb;
    }

    .linked-page-indicator svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .linked-page-title {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Subtitle inline edit input (rendered inside foreignObject) */
    .subtitle-edit-input {
      width: 100%;
      box-sizing: border-box;
      border: 1.5px solid #1e96eb;
      border-radius: 3px;
      background: #ffffff;
      font-family: Inter, sans-serif;
      text-align: center;
      outline: none;
      padding: 2px 6px;
    }

    .subtitle-edit-input:focus {
      border-color: #1e96eb;
      box-shadow: 0 0 0 2px rgba(30, 150, 235, 0.2);
    }

    /* Phase label inline edit input (rendered inside foreignObject) */
    .phase-label-edit-input {
      width: 100%;
      box-sizing: border-box;
      border: 1.5px solid #1e96eb;
      border-radius: 3px;
      background: #ffffff;
      font-family: Inter, sans-serif;
      text-align: center;
      outline: none;
      padding: 2px 4px;
    }

    .phase-label-edit-input:focus {
      border-color: #1e96eb;
      box-shadow: 0 0 0 2px rgba(30, 150, 235, 0.2);
    }

    /* Axis label inline edit overlay (positioned absolute over the SVG) */
    .axis-label-edit-overlay {
      position: absolute;
      z-index: 10;
      pointer-events: auto;
    }

    .axis-label-edit-input {
      box-sizing: border-box;
      border: 1.5px solid #1e96eb;
      border-radius: 3px;
      background: #ffffff;
      font-family: Inter, sans-serif;
      font-weight: 600;
      text-align: center;
      outline: none;
      padding: 2px 6px;
    }

    .axis-label-edit-input:focus {
      border-color: #1e96eb;
      box-shadow: 0 0 0 2px rgba(30, 150, 235, 0.2);
    }
  `;

  // -- Lifecycle ------------------------------------------------------

  override updated(changedProps: Map<PropertyKey, unknown>): void {
    super.updated(changedProps);

    // Auto-focus the axis label edit input when entering edit mode
    if (this._editingAxis) {
      requestAnimationFrame(() => {
        const input = this.shadowRoot?.querySelector<HTMLInputElement>(
          `.axis-label-edit-input[data-axis="${this._editingAxis}"]`,
        );
        if (input) {
          input.focus();
          input.select();
        }
      });
    }

    // Auto-focus the phase label edit input when entering edit mode
    if (this._editingPhaseIndex >= 0) {
      // Use requestAnimationFrame to ensure the foreignObject/input is rendered
      requestAnimationFrame(() => {
        const input = this.shadowRoot?.querySelector('.phase-label-edit-input') as HTMLInputElement | null;
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
  }

  // -- Computed values -----------------------------------------------

  /** Current phase labels from properties */
  private get _phaseLabels(): PhaseLabels {
    return {
      genesis: this.labelGenesis,
      customBuilt: this.labelCustomBuilt,
      product: this.labelProduct,
      commodity: this.labelCommodity,
    };
  }

  private get _phases(): readonly EvolutionPhase[] {
    return buildPhases(
      {
        custom: this.ratioCustom,
        product: this.ratioProduct,
        commodity: this.ratioCommodity,
      },
      this._phaseLabels,
    );
  }

  private get _boundaries(): readonly number[] {
    return [this.ratioCustom, this.ratioProduct, this.ratioCommodity];
  }

  /** Map area width (inside margins) */
  private get _mapWidth(): number {
    return this.width - MARGIN_LEFT - MARGIN_RIGHT;
  }

  /** Map area height (inside margins) */
  private get _mapHeight(): number {
    return this.height - MARGIN_TOP - MARGIN_BOTTOM;
  }

  // -- Render helpers ------------------------------------------------

  /** Convert an evolution ratio (0–1) to an SVG x coordinate */
  private _ratioToX(ratio: number): number {
    return MARGIN_LEFT + ratio * this._mapWidth;
  }

  /**
   * Render a zoom-stable text element.
   *
   * Font size is divided by the current zoom so that when the canvas
   * host scales the block, the visual text size remains constant.
   * Position (anchorX, anchorY) is in SVG coordinate space.
   * An optional rotation can be applied around the anchor point.
   */
  private _zoomText(
    anchorX: number,
    anchorY: number,
    baseFontSize: number,
    text: string,
    opts: ZoomStableTextOptions = {},
  ) {
    const fontSize = zoomStableFontSize(baseFontSize, this.zoom);
    const fill = opts.fill ?? LABEL_COLOR;
    const fontWeight = opts.fontWeight ?? '400';
    const textAnchor = opts.textAnchor ?? 'middle';
    const dominantBaseline = opts.dominantBaseline ?? 'auto';
    const transform = opts.rotate
      ? `rotate(${opts.rotate}, ${anchorX}, ${anchorY})`
      : '';

    return svg`
      <text
        x="${anchorX}"
        y="${anchorY}"
        text-anchor="${textAnchor}"
        dominant-baseline="${dominantBaseline}"
        font-size="${fontSize}"
        font-weight="${fontWeight}"
        font-family="Inter, sans-serif"
        fill="${fill}"
        transform="${transform}"
      >${text}</text>
    `;
  }

  /** Render subtle horizontal grid lines across the map area */
  private _renderGridLines() {
    const lines = [];
    for (let i = 1; i < GRID_LINE_COUNT; i++) {
      const y = MARGIN_TOP + (i / GRID_LINE_COUNT) * this._mapHeight;
      lines.push(svg`
        <line
          x1="${MARGIN_LEFT}" y1="${y}"
          x2="${MARGIN_LEFT + this._mapWidth}" y2="${y}"
          stroke="${GRID_COLOR}"
          stroke-width="0.5"
        />
      `);
    }
    return lines;
  }

  /** Render the three interior vertical divider lines (dashed) */
  private _renderDividers() {
    return this._boundaries.map(ratio => {
      const x = this._ratioToX(ratio);
      return svg`
        <line
          x1="${x}" y1="${MARGIN_TOP}"
          x2="${x}" y2="${MARGIN_TOP + this._mapHeight}"
          stroke="${DIVIDER_COLOR}"
          stroke-width="1"
          stroke-dasharray="6 4"
        />
      `;
    });
  }

  // -- Axis label editing interaction -----------------------------------

  /**
   * Start inline editing of an axis label.
   * Called on double-click of an axis label text element.
   */
  private _startAxisLabelEdit(axis: 'x' | 'y', event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Block editing in read-only mode
    if (this.readonly) return;

    this._editingAxis = axis;
    this._axisLabelDraft = axis === 'x' ? this.xAxisLabel : this.yAxisLabel;
  }

  /**
   * Confirm the axis label edit: update the property and dispatch a change event.
   */
  private _confirmAxisLabelEdit(): void {
    if (!this._editingAxis) return;

    const axis = this._editingAxis;
    const trimmedValue = this._axisLabelDraft.trim();
    const previousLabel = axis === 'x' ? this.xAxisLabel : this.yAxisLabel;

    // Use the default label if the input is empty
    const newLabel = trimmedValue || (axis === 'x' ? DEFAULT_X_AXIS_LABEL : DEFAULT_Y_AXIS_LABEL);

    // Update the property
    if (axis === 'x') {
      this.xAxisLabel = newLabel;
    } else {
      this.yAxisLabel = newLabel;
    }

    // Reset editing state
    this._editingAxis = null;
    this._axisLabelDraft = '';

    // Only dispatch event if the value actually changed
    if (previousLabel !== newLabel) {
      this.dispatchEvent(
        createAxisLabelChangeEvent({
          blockId: this.blockId,
          axis,
          previousLabel,
          newLabel,
        }),
      );
    }
  }

  /**
   * Cancel the axis label edit: discard the draft and close the input.
   */
  private _cancelAxisLabelEdit(): void {
    this._editingAxis = null;
    this._axisLabelDraft = '';
  }

  /**
   * Handle keydown events on the axis label edit input.
   * Enter confirms, Escape cancels.
   */
  private _handleAxisLabelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this._confirmAxisLabelEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this._cancelAxisLabelEdit();
    }
  }

  /**
   * Handle input change on the axis label edit input.
   */
  private _handleAxisLabelInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this._axisLabelDraft = input.value;
  }

  /**
   * Handle blur on the axis label edit input.
   * Confirms the edit (same as pressing Enter).
   */
  private _handleAxisLabelBlur(): void {
    // Only confirm if still editing (blur can fire after Enter/Escape already reset state)
    if (this._editingAxis) {
      this._confirmAxisLabelEdit();
    }
  }

  /**
   * Render the axis label edit overlay (HTML input positioned over the SVG).
   * Rendered as an absolutely-positioned HTML element over the SVG
   * because SVG foreignObject + rotation is complex and unreliable.
   */
  private _renderAxisLabelEditOverlay() {
    if (!this._editingAxis) return nothing;

    /** Width/height of inline edit inputs */
    const X_EDIT_W = 260;
    const X_EDIT_H = 26;
    const Y_EDIT_W = 240;
    const Y_EDIT_H = 26;

    if (this._editingAxis === 'x') {
      // X-axis edit input: centered below the evolution axis arrow
      const arrowY = MARGIN_TOP + this._mapHeight + 35;
      const inputLeft = (this.width - X_EDIT_W) / 2;
      const inputTop = arrowY + 10 - X_EDIT_H / 2 - 2;

      return html`
        <div
          class="axis-label-edit-overlay"
          style="
            left: ${inputLeft}px;
            top: ${inputTop}px;
            width: ${X_EDIT_W}px;
            height: ${X_EDIT_H}px;
          "
        >
          <input
            class="axis-label-edit-input"
            data-axis="x"
            type="text"
            .value=${this._axisLabelDraft}
            style="
              width: 100%;
              height: 100%;
              font-size: ${AXIS_LABEL_FONT_SIZE}px;
              color: ${AXIS_LABEL_COLOR};
            "
            @input=${this._handleAxisLabelInput}
            @keydown=${this._handleAxisLabelKeydown}
            @blur=${this._handleAxisLabelBlur}
            aria-label="Edit X-axis label"
          />
        </div>
      `;
    }

    // Y-axis edit input: rotated -90deg, positioned along the left edge
    const centerY = this.height / 2;
    const inputLeft = 16 - Y_EDIT_W / 2;
    const inputTop = centerY - Y_EDIT_H / 2;

    return html`
      <div
        class="axis-label-edit-overlay"
        style="
          left: ${inputLeft}px;
          top: ${inputTop}px;
          width: ${Y_EDIT_W}px;
          height: ${Y_EDIT_H}px;
          transform: rotate(-90deg);
          transform-origin: center center;
        "
      >
        <input
          class="axis-label-edit-input"
          data-axis="y"
          type="text"
          .value=${this._axisLabelDraft}
          style="
            width: 100%;
            height: 100%;
            font-size: ${AXIS_LABEL_FONT_SIZE}px;
            color: ${AXIS_LABEL_COLOR};
          "
          @input=${this._handleAxisLabelInput}
          @keydown=${this._handleAxisLabelKeydown}
          @blur=${this._handleAxisLabelBlur}
          aria-label="Edit Y-axis label"
        />
      </div>
    `;
  }

  // -- Phase label editing interaction ---------------------------------

  /**
   * Handle double-click on a phase label to enter inline editing mode.
   * Stops propagation so the container's double-click (linked page nav)
   * doesn't fire.
   */
  private _handlePhaseLabelDblClick(phaseIndex: number, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Block editing in read-only mode
    if (this.readonly) return;

    const currentLabel = this._phases[phaseIndex]?.label ?? '';
    this._editingPhaseIndex = phaseIndex;
    this._phaseLabelDraft = currentLabel;
  }

  /** Confirm the phase label edit: update property and dispatch event */
  private _confirmPhaseLabelEdit(): void {
    const idx = this._editingPhaseIndex;
    if (idx < 0 || idx > 3) return;

    const previousLabel = this._phases[idx]?.label ?? '';
    const newLabel = this._phaseLabelDraft.trim();

    // Apply the change to the corresponding label property
    if (newLabel && newLabel !== previousLabel) {
      const key = PHASE_KEYS[idx];
      switch (key) {
        case 'genesis':
          this.labelGenesis = newLabel;
          break;
        case 'customBuilt':
          this.labelCustomBuilt = newLabel;
          break;
        case 'product':
          this.labelProduct = newLabel;
          break;
        case 'commodity':
          this.labelCommodity = newLabel;
          break;
      }

      this.dispatchEvent(
        createPhaseLabelChangeEvent({
          blockId: this.blockId,
          phaseIndex: idx,
          previousLabel,
          newLabel,
        }),
      );
    }

    this._editingPhaseIndex = -1;
    this._phaseLabelDraft = '';
  }

  /** Cancel the phase label edit: revert to previous value */
  private _cancelPhaseLabelEdit(): void {
    this._editingPhaseIndex = -1;
    this._phaseLabelDraft = '';
  }

  /** Handle keydown on the phase label edit input */
  private _handlePhaseLabelKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this._confirmPhaseLabelEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this._cancelPhaseLabelEdit();
    }
  }

  /** Handle blur on the phase label edit input (confirm on focus loss) */
  private _handlePhaseLabelBlur(): void {
    // Only confirm if still in editing mode (not already cancelled via Escape)
    if (this._editingPhaseIndex >= 0) {
      this._confirmPhaseLabelEdit();
    }
  }

  /**
   * Render phase labels centered within each phase zone, below the map area.
   * Supports double-click-to-edit: when a label is being edited, it renders
   * a foreignObject with an inline text input instead of the SVG text element.
   */
  private _renderPhaseLabels() {
    const labelY = MARGIN_TOP + this._mapHeight + 20;
    const fontSize = zoomStableFontSize(PHASE_LABEL_FONT_SIZE, this.zoom);

    return this._phases.map((phase, index) => {
      const centerX = this._ratioToX((phase.startRatio + phase.endRatio) / 2);
      const zoneWidth = this._ratioToX(phase.endRatio) - this._ratioToX(phase.startRatio);

      // If this phase is currently being edited, render an inline input
      if (this._editingPhaseIndex === index) {
        const inputWidth = Math.max(zoneWidth * 0.9, 80);
        const inputHeight = fontSize + 12;
        const inputX = centerX - inputWidth / 2;
        const inputY = labelY - fontSize / 2 - 6;

        return svg`
          <foreignObject
            x="${inputX}"
            y="${inputY}"
            width="${inputWidth}"
            height="${inputHeight}"
          >
            <input
              xmlns="http://www.w3.org/1999/xhtml"
              class="phase-label-edit-input"
              type="text"
              .value=${this._phaseLabelDraft}
              @input=${(e: InputEvent) => {
                this._phaseLabelDraft = (e.target as HTMLInputElement).value;
              }}
              @keydown=${(e: KeyboardEvent) => this._handlePhaseLabelKeyDown(e)}
              @blur=${() => this._handlePhaseLabelBlur()}
              style="
                font-size: ${fontSize}px;
                height: ${inputHeight}px;
              "
            />
          </foreignObject>
        `;
      }

      // Normal rendering: SVG text with double-click handler
      const cursorStyle = this.readonly ? 'cursor: default' : 'cursor: pointer';
      return svg`
        <text
          x="${centerX}"
          y="${labelY}"
          text-anchor="middle"
          font-size="${fontSize}"
          font-weight="400"
          font-family="Inter, sans-serif"
          fill="${LABEL_COLOR}"
          style="${cursorStyle}"
          @dblclick=${(e: MouseEvent) => this._handlePhaseLabelDblClick(index, e)}
        >${phase.label}</text>
      `;
    });
  }

  /**
   * Render the X-axis label with horizontal arrow.
   * The label text is double-clickable for inline editing.
   * When editing, the SVG text is hidden and an HTML input overlay is shown.
   */
  private _renderEvolutionAxis() {
    const axisY = MARGIN_TOP + this._mapHeight;
    const arrowY = MARGIN_TOP + this._mapHeight + 35;

    // When editing x-axis, hide the SVG text (the overlay input is shown instead)
    const showLabel = this._editingAxis !== 'x';

    return svg`
      <!-- Evolution axis line (bottom border of map area) -->
      <line
        x1="${MARGIN_LEFT}" y1="${axisY}"
        x2="${MARGIN_LEFT + this._mapWidth}" y2="${axisY}"
        stroke="${AXIS_LABEL_COLOR}"
        stroke-width="1.5"
        marker-end="url(#arrowhead-right)"
      />

      ${showLabel
        ? svg`
          <!-- X-axis label (double-click to edit) -->
          <text
            x="${this.width / 2}"
            y="${arrowY + 10}"
            text-anchor="middle"
            dominant-baseline="auto"
            font-size="${zoomStableFontSize(AXIS_LABEL_FONT_SIZE, this.zoom)}"
            font-weight="600"
            font-family="Inter, sans-serif"
            fill="${AXIS_LABEL_COLOR}"
            style="cursor: pointer"
            @dblclick=${(e: MouseEvent) => this._startAxisLabelEdit('x', e)}
          >${this.xAxisLabel}</text>
        `
        : nothing}
    `;
  }

  /**
   * Render the Y-axis label with vertical arrow.
   * The label text is double-clickable for inline editing.
   * When editing, the SVG text is hidden and an HTML input overlay is shown.
   */
  private _renderValueChainAxis() {
    const axisX = MARGIN_LEFT;

    // When editing y-axis, hide the SVG text (the overlay input is shown instead)
    const showLabel = this._editingAxis !== 'y';

    return svg`
      <!-- Value chain axis line (left border of map area) -->
      <line
        x1="${axisX}" y1="${MARGIN_TOP}"
        x2="${axisX}" y2="${MARGIN_TOP + this._mapHeight}"
        stroke="${AXIS_LABEL_COLOR}"
        stroke-width="1.5"
        marker-start="url(#arrowhead-up)"
      />

      ${showLabel
        ? svg`
          <!-- Y-axis label (double-click to edit) -->
          <text
            x="16"
            y="${this.height / 2}"
            text-anchor="middle"
            dominant-baseline="auto"
            font-size="${zoomStableFontSize(AXIS_LABEL_FONT_SIZE, this.zoom)}"
            font-weight="600"
            font-family="Inter, sans-serif"
            fill="${AXIS_LABEL_COLOR}"
            transform="rotate(-90, 16, ${this.height / 2})"
            style="cursor: pointer"
            @dblclick=${(e: MouseEvent) => this._startAxisLabelEdit('y', e)}
          >${this.yAxisLabel}</text>
        `
        : nothing}

      <!-- Visibility direction labels (zoom-stable) -->
      ${this._zoomText(
        axisX - 6,
        MARGIN_TOP + 4,
        DIRECTION_LABEL_FONT_SIZE,
        'Visible',
        { fill: LABEL_COLOR, textAnchor: 'end' },
      )}
      ${this._zoomText(
        axisX - 6,
        MARGIN_TOP + this._mapHeight,
        DIRECTION_LABEL_FONT_SIZE,
        'Invisible',
        { fill: LABEL_COLOR, textAnchor: 'end' },
      )}
    `;
  }

  /** Optional map title rendered at the top center (zoom-stable) */
  private _renderTitle() {
    if (!this.mapTitle) return nothing;
    return this._zoomText(
      this.width / 2,
      20,
      TITLE_FONT_SIZE,
      this.mapTitle,
      { fill: AXIS_LABEL_COLOR, fontWeight: '700' },
    );
  }

  // -- Subtitle inline editing handlers --------------------------------

  /**
   * Enter subtitle edit mode on double-click.
   * Initialises the draft with the current subtitle value.
   */
  private _handleSubtitleDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Block editing in read-only mode
    if (this.readonly) return;

    this._subtitleDraft = this.mapSubtitle;
    this._isEditingSubtitle = true;

    // After Lit re-renders, focus the input and select all text
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>(
        '.subtitle-edit-input',
      );
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  /**
   * Confirm the subtitle edit: update the property and dispatch a change event.
   */
  private _confirmSubtitleEdit(): void {
    if (!this._isEditingSubtitle) return;

    const trimmed = this._subtitleDraft.trim();
    const previousSubtitle = this.mapSubtitle;

    this._isEditingSubtitle = false;

    // Only fire event if the value actually changed
    if (trimmed !== previousSubtitle) {
      this.mapSubtitle = trimmed;
      this.dispatchEvent(
        createSubtitleChangeEvent({
          blockId: this.blockId,
          previousSubtitle,
          newSubtitle: trimmed,
        }),
      );
    }
  }

  /**
   * Cancel the subtitle edit: discard changes and exit edit mode.
   */
  private _cancelSubtitleEdit(): void {
    this._isEditingSubtitle = false;
    this._subtitleDraft = '';
  }

  /**
   * Handle keyboard events in the subtitle input.
   * Enter → confirm, Escape → cancel.
   */
  private _handleSubtitleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this._confirmSubtitleEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this._cancelSubtitleEdit();
    }
  }

  /** Track draft text as the user types */
  private _handleSubtitleInput(event: InputEvent): void {
    const target = event.target as HTMLInputElement;
    this._subtitleDraft = target.value;
  }

  /**
   * Subtitle element — spans 7/8 of the map width, centered horizontally.
   * Supports text wrapping via SVG `<foreignObject>` which provides native
   * CSS word-wrap / overflow-wrap. Falls back gracefully when foreignObject
   * is not available (renders nothing).
   *
   * Positioned just below the title (or at top if no title).
   * Font size is zoom-stable via inverse-scale calculation.
   *
   * **Double-click** enters inline edit mode; **Enter** confirms,
   * **Escape** cancels. Blur also confirms (standard UX pattern).
   */
  private _renderSubtitle() {
    // Show nothing only when there is no subtitle AND we're not editing
    if (!this.mapSubtitle && !this._isEditingSubtitle) return nothing;

    // Subtitle area: 7/8 of the full block width, centered
    const subtitleWidth = this.width * SUBTITLE_WIDTH_RATIO;
    const subtitleX = (this.width - subtitleWidth) / 2;
    // Position below title if present, else at the top margin area
    const subtitleY = this.mapTitle ? 26 : 10;
    // Allow enough height for several wrapped lines
    const maxHeight = MARGIN_TOP + 40;
    // Zoom-stable font size for subtitle
    const stableFontSize = zoomStableFontSize(SUBTITLE_FONT_SIZE, this.zoom);
    const stableLineHeight = zoomStableFontSize(SUBTITLE_LINE_HEIGHT, this.zoom);

    if (this._isEditingSubtitle) {
      // ── Edit mode: inline text input ──
      return svg`
        <foreignObject
          x="${subtitleX}"
          y="${subtitleY}"
          width="${subtitleWidth}"
          height="${maxHeight}"
        >
          <input
            xmlns="http://www.w3.org/1999/xhtml"
            class="subtitle-edit-input"
            type="text"
            .value="${this._subtitleDraft}"
            @input="${this._handleSubtitleInput}"
            @keydown="${this._handleSubtitleKeyDown}"
            @blur="${this._confirmSubtitleEdit}"
            style="
              font-size: ${stableFontSize}px;
              line-height: ${stableLineHeight}px;
              color: ${SUBTITLE_COLOR};
            "
            placeholder="Enter subtitle…"
          />
        </foreignObject>
      `;
    }

    // ── Display mode: static text, double-click to edit ──
    return svg`
      <foreignObject
        x="${subtitleX}"
        y="${subtitleY}"
        width="${subtitleWidth}"
        height="${maxHeight}"
      >
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style="
            width: 100%;
            text-align: center;
            font-family: Inter, sans-serif;
            font-size: ${stableFontSize}px;
            line-height: ${stableLineHeight}px;
            color: ${SUBTITLE_COLOR};
            overflow-wrap: break-word;
            word-wrap: break-word;
            hyphens: auto;
            padding: 0 4px;
            cursor: default;
          "
          @dblclick="${this._handleSubtitleDoubleClick}"
        >${this.mapSubtitle}</div>
      </foreignObject>
    `;
  }

  // -- Linked page interaction (Sub-AC 4) ----------------------------

  /**
   * Handle double-click on the map block.
   * If a page is linked, navigates to that page by dispatching a
   * `wardley-map-navigate` custom event.
   */
  private _handleDoubleClick(event: MouseEvent): void {
    if (!this.linkedPageId) return;

    event.preventDefault();
    event.stopPropagation();

    this.dispatchEvent(
      createNavigateEvent({
        mapBlockId: this.blockId,
        targetPageId: this.linkedPageId,
        trigger: 'double-click',
      }),
    );
  }

  /**
   * Handle click on the link icon indicator.
   * Navigates to the linked page via custom event.
   */
  private _handleLinkIconClick(event: MouseEvent): void {
    if (!this.linkedPageId) return;

    event.preventDefault();
    event.stopPropagation();

    this.dispatchEvent(
      createNavigateEvent({
        mapBlockId: this.blockId,
        targetPageId: this.linkedPageId,
        trigger: 'link-icon',
      }),
    );
  }

  /**
   * Set or change the linked page.
   * Dispatches a `wardley-map-link-change` event and updates the property.
   *
   * @param newPageId - The page ID to link (null to unlink)
   * @param newTitle - Display title for the linked page
   */
  setLinkedPage(newPageId: string | null, newTitle = ''): void {
    // Block link changes in read-only mode
    if (this.readonly) return;

    const previousPageId = this.linkedPageId;

    // No-op if same page
    if (previousPageId === newPageId) return;

    this.linkedPageId = newPageId;
    this.linkedPageTitle = newTitle;

    this.dispatchEvent(
      createLinkChangeEvent({
        mapBlockId: this.blockId,
        previousPageId,
        newPageId,
      }),
    );
  }

  /**
   * Render the linked page indicator icon (top-right corner).
   * Only visible when a page is linked.
   */
  private _renderLinkedPageIndicator() {
    if (!this.linkedPageId) return nothing;

    const displayTitle = this.linkedPageTitle || 'Linked page';

    return html`
      <div
        class="linked-page-indicator"
        @click=${this._handleLinkIconClick}
        title="Navigate to: ${displayTitle}"
        role="button"
        tabindex="0"
        aria-label="Navigate to linked page: ${displayTitle}"
      >
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Page/document icon with link indicator -->
          <path
            d="M4 1.5h5.5L13 5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 14V3A1.5 1.5 0 0 1 4.5 1.5H4Z"
            stroke="currentColor"
            stroke-width="1.2"
            fill="none"
          />
          <path
            d="M9.5 1.5V5H13"
            stroke="currentColor"
            stroke-width="1.2"
            fill="none"
          />
          <line x1="5.5" y1="8" x2="10.5" y2="8" stroke="currentColor" stroke-width="1" />
          <line x1="5.5" y1="10.5" x2="9" y2="10.5" stroke="currentColor" stroke-width="1" />
        </svg>
        <span class="linked-page-title">${displayTitle}</span>
      </div>
    `;
  }

  /** Render SVG marker definitions (arrowheads) */
  private _renderDefs() {
    return svg`
      <defs>
        <!-- Right-pointing arrowhead for evolution axis -->
        <marker
          id="arrowhead-right"
          markerWidth="8" markerHeight="6"
          refX="8" refY="3"
          orient="auto"
        >
          <polygon
            points="0 0, 8 3, 0 6"
            fill="${AXIS_LABEL_COLOR}"
          />
        </marker>
        <!-- Upward-pointing arrowhead for value chain axis -->
        <marker
          id="arrowhead-up"
          markerWidth="6" markerHeight="8"
          refX="3" refY="0"
          orient="auto"
        >
          <polygon
            points="0 8, 3 0, 6 8"
            fill="${AXIS_LABEL_COLOR}"
          />
        </marker>
      </defs>
    `;
  }

  // -- Main render ---------------------------------------------------

  override render() {
    return html`
      <div
        class="wardley-map-container"
        style="width:${this.width}px;height:${this.height}px"
        @dblclick=${this._handleDoubleClick}
      >
        <!-- Linked page indicator (top-right, only when linked) -->
        ${this._renderLinkedPageIndicator()}

        <!-- Axis label edit overlay (HTML input over the SVG) -->
        ${this._renderAxisLabelEditOverlay()}

        <svg
          width="${this.width}"
          height="${this.height}"
          viewBox="0 0 ${this.width} ${this.height}"
          xmlns="http://www.w3.org/2000/svg"
        >
          ${this._renderDefs()}

          <!-- Background fill -->
          <rect
            x="0" y="0"
            width="${this.width}" height="${this.height}"
            fill="${BACKGROUND_COLOR}"
            rx="2" ry="2"
          />

          <!-- Border (edge-only selection affordance) -->
          <rect
            x="0.5" y="0.5"
            width="${this.width - 1}" height="${this.height - 1}"
            fill="none"
            stroke="${BORDER_COLOR}"
            stroke-width="1.5"
            rx="2" ry="2"
          />

          <!-- Intensity gradient overlays (rendered behind other elements) -->
          ${this.showEvolutionIntensity ? this._renderEvolutionGradient() : nothing}
          ${this.showVisibilityIntensity ? this._renderVisibilityGradient() : nothing}
          ${this.showActivityIntensity ? this._renderActivityGradient() : nothing}

          <!-- Zone backgrounds (behind grid/dividers) -->
          ${this.showZones ? this._renderZoneBackgrounds() : nothing}

          <!-- Competition-free zone (Genesis area) -->
          ${this.showCompetitionFreeZone ? this._renderCompetitionFreeZone() : nothing}

          <!-- Punctuated equilibrium overlay (at phase boundaries) -->
          ${this.showPunctuatedEquilibrium ? this._renderPunctuatedEquilibrium() : nothing}

          <!-- Subtle horizontal grid lines (visibility axis) -->
          ${this.showGrid ? this._renderGridLines() : nothing}

          <!-- Evolution phase vertical dividers (dashed) -->
          ${this.showPhases ? this._renderDividers() : nothing}

          <!-- Axis lines and labels -->
          ${this.showAxes ? this._renderEvolutionAxis() : nothing}
          ${this.showAxes ? this._renderValueChainAxis() : nothing}

          <!-- Phase labels (below evolution axis) -->
          ${this.showPhases ? this._renderPhaseLabels() : nothing}

          <!-- Optional title -->
          ${this._renderTitle()}

          <!-- Optional subtitle (7/8 width, text wrapping) -->
          ${this._renderSubtitle()}
        </svg>
      </div>
    `;
  }

  // -- Overlay render methods (toggled via settings panel) -------------

  /** Render coloured zone backgrounds behind each evolution phase */
  private _renderZoneBackgrounds() {
    return this._phases.map((phase, i) => {
      const x = this._ratioToX(phase.startRatio);
      const w = this._ratioToX(phase.endRatio) - x;
      const color = ZONE_COLORS[i] ?? ZONE_COLORS[0];
      return svg`
        <rect
          x="${x}" y="${MARGIN_TOP}"
          width="${w}" height="${this._mapHeight}"
          fill="${color}"
        />
      `;
    });
  }

  /** Render competition-free zone shading in Genesis area */
  private _renderCompetitionFreeZone() {
    const zoneEndX = this._ratioToX(COMPETITION_FREE_ZONE_END);
    const zoneWidth = zoneEndX - MARGIN_LEFT;
    return svg`
      <rect
        x="${MARGIN_LEFT}" y="${MARGIN_TOP}"
        width="${zoneWidth}" height="${this._mapHeight}"
        fill="${COMPETITION_FREE_ZONE_COLOR}"
      />
      <line
        x1="${zoneEndX}" y1="${MARGIN_TOP}"
        x2="${zoneEndX}" y2="${MARGIN_TOP + this._mapHeight}"
        stroke="${COMPETITION_FREE_ZONE_BORDER}"
        stroke-width="1.5"
        stroke-dasharray="8 4"
      />
      ${this._zoomText(
        MARGIN_LEFT + zoneWidth / 2,
        MARGIN_TOP + 16,
        10,
        'Competition-free',
        { fill: 'rgba(100, 130, 180, 0.6)', fontWeight: '500' },
      )}
    `;
  }

  /**
   * Render punctuated equilibrium S-curve overlay at phase boundaries.
   * Draws S-curve transition indicators at each boundary, showing how
   * evolution accelerates through phase transitions.
   */
  private _renderPunctuatedEquilibrium() {
    const curveWidth = 30;
    return this._boundaries.map(ratio => {
      const x = this._ratioToX(ratio);
      const y1 = MARGIN_TOP;
      const y2 = MARGIN_TOP + this._mapHeight;
      const midY = (y1 + y2) / 2;
      return svg`
        <path
          d="M ${x - curveWidth / 2} ${y1}
             C ${x - curveWidth / 2} ${midY - 40},
               ${x + curveWidth / 2} ${midY + 40},
               ${x + curveWidth / 2} ${y2}"
          fill="none"
          stroke="${EQUILIBRIUM_CURVE_COLOR}"
          stroke-width="${EQUILIBRIUM_CURVE_WIDTH}"
          stroke-linecap="round"
        />
      `;
    });
  }

  /** Render innovation intensity gradient (horizontal, left-to-right) */
  private _renderEvolutionGradient() {
    return svg`
      <defs>
        <linearGradient id="gradient-innovation" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${INNOVATION_GRADIENT_START}" />
          <stop offset="100%" stop-color="${INNOVATION_GRADIENT_END}" />
        </linearGradient>
      </defs>
      <rect
        x="${MARGIN_LEFT}" y="${MARGIN_TOP}"
        width="${this._mapWidth}" height="${this._mapHeight}"
        fill="url(#gradient-innovation)"
      />
    `;
  }

  /** Render industrialisation intensity gradient (horizontal, right-to-left) */
  private _renderVisibilityGradient() {
    return svg`
      <defs>
        <linearGradient id="gradient-industrialisation" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${INDUSTRIALISATION_GRADIENT_START}" />
          <stop offset="100%" stop-color="${INDUSTRIALISATION_GRADIENT_END}" />
        </linearGradient>
      </defs>
      <rect
        x="${MARGIN_LEFT}" y="${MARGIN_TOP}"
        width="${this._mapWidth}" height="${this._mapHeight}"
        fill="url(#gradient-industrialisation)"
      />
    `;
  }

  /** Render uncertainty intensity gradient (radial from top-left) */
  private _renderActivityGradient() {
    return svg`
      <defs>
        <radialGradient id="gradient-uncertainty" cx="0" cy="0" r="1"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" stop-color="${UNCERTAINTY_GRADIENT_START}" />
          <stop offset="100%" stop-color="${UNCERTAINTY_GRADIENT_END}" />
        </radialGradient>
      </defs>
      <rect
        x="${MARGIN_LEFT}" y="${MARGIN_TOP}"
        width="${this._mapWidth}" height="${this._mapHeight}"
        fill="url(#gradient-uncertainty)"
      />
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wardley-map-block': WardleyMapBlockElement;
  }
}
