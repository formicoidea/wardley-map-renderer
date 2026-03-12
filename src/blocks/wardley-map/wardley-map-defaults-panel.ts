/**
 * wardley-map-defaults-panel.ts — Editor settings panel for Wardley Map default values.
 *
 * Renders form controls (sliders, number inputs, text inputs, dropdowns) for
 * each configurable Wardley Map property:
 *
 * **Dimensions:**
 *   - Width (number input, default 1600)
 *   - Height (number input, default 900)
 *   - Aspect ratio preset dropdown (16:9, 4:3, 1:1, Custom)
 *
 * **Evolution Phase Ratios (sliders 0–1):**
 *   - Custom boundary (default 0.175)
 *   - Product boundary (default 0.4)
 *   - Commodity boundary (default 0.7)
 *
 * **Labels (text inputs):**
 *   - X-axis label (default: "Evolution")
 *   - Y-axis label (default: "Value Chain (Visibility)")
 *   - Phase labels: Genesis, Custom-Built, Product, Commodity
 *
 * Changes dispatch a `wardley-map-defaults-change` event with the property
 * key and new value, so parent components can update block state.
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import {
  WARDLEY_MAP_DEFAULT_WIDTH,
  WARDLEY_MAP_DEFAULT_HEIGHT,
  EVOLUTION_PHASE_CUSTOM,
  EVOLUTION_PHASE_PRODUCT,
  EVOLUTION_PHASE_COMMODITY,
  DEFAULT_X_AXIS_LABEL,
  DEFAULT_Y_AXIS_LABEL,
} from './wardley-map-consts.js';

import {
  type EvolutionPhaseRatios,
  type PhaseLabels,
  DEFAULT_PHASE_LABELS,
} from './wardley-map-schema.js';

// ── Event types ──────────────────────────────────────────────────────

/** Event name dispatched when any default value changes */
export const WARDLEY_MAP_DEFAULTS_CHANGE_EVENT = 'wardley-map-defaults-change' as const;

/** Property keys that can change in the defaults panel */
export type DefaultsChangeKey =
  | 'width'
  | 'height'
  | 'evolutionPhaseRatios'
  | 'xAxisLabel'
  | 'yAxisLabel'
  | 'phaseLabels';

/** Detail payload for defaults change events */
export interface DefaultsChangeDetail {
  /** The property key that changed */
  readonly key: DefaultsChangeKey;
  /** New value (type depends on key) */
  readonly value: number | string | EvolutionPhaseRatios | PhaseLabels;
  /** Full current defaults snapshot after the change */
  readonly defaults: Readonly<WardleyMapDefaults>;
}

/** All configurable default values */
export interface WardleyMapDefaults {
  readonly width: number;
  readonly height: number;
  readonly evolutionPhaseRatios: EvolutionPhaseRatios;
  readonly xAxisLabel: string;
  readonly yAxisLabel: string;
  readonly phaseLabels: PhaseLabels;
}

/** Create a defaults-change custom event */
export function createDefaultsChangeEvent(
  detail: DefaultsChangeDetail,
): CustomEvent<DefaultsChangeDetail> {
  return new CustomEvent(WARDLEY_MAP_DEFAULTS_CHANGE_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

// ── Aspect ratio presets ─────────────────────────────────────────────

interface AspectRatioPreset {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

const ASPECT_RATIO_PRESETS: readonly AspectRatioPreset[] = [
  { label: '16:9 (default)', width: 1600, height: 900 },
  { label: '4:3', width: 1600, height: 1200 },
  { label: '1:1', width: 1200, height: 1200 },
  { label: '21:9 (ultrawide)', width: 2100, height: 900 },
] as const;

// ── Slider constraints ───────────────────────────────────────────────

/** Minimum gap between adjacent evolution boundaries */
const MIN_BOUNDARY_GAP = 0.05;

/** Width / height constraints */
const MIN_DIMENSION = 400;
const MAX_DIMENSION = 4000;
const DIMENSION_STEP = 100;

// ── Component ────────────────────────────────────────────────────────

@customElement('wardley-map-defaults-panel')
export class WardleyMapDefaultsPanel extends LitElement {
  // -- Reactive properties ------------------------------------------------

  @property({ type: Number }) width = WARDLEY_MAP_DEFAULT_WIDTH;
  @property({ type: Number }) height = WARDLEY_MAP_DEFAULT_HEIGHT;

  @property({ type: Number, attribute: 'phase-custom' })
  phaseCustom = EVOLUTION_PHASE_CUSTOM;

  @property({ type: Number, attribute: 'phase-product' })
  phaseProduct = EVOLUTION_PHASE_PRODUCT;

  @property({ type: Number, attribute: 'phase-commodity' })
  phaseCommodity = EVOLUTION_PHASE_COMMODITY;

  @property({ type: String, attribute: 'x-axis-label' })
  xAxisLabel = DEFAULT_X_AXIS_LABEL;

  @property({ type: String, attribute: 'y-axis-label' })
  yAxisLabel = DEFAULT_Y_AXIS_LABEL;

  @property({ type: String, attribute: 'label-genesis' })
  labelGenesis = DEFAULT_PHASE_LABELS.genesis;

  @property({ type: String, attribute: 'label-custom-built' })
  labelCustomBuilt = DEFAULT_PHASE_LABELS.customBuilt;

  @property({ type: String, attribute: 'label-product' })
  labelProduct = DEFAULT_PHASE_LABELS.product;

  @property({ type: String, attribute: 'label-commodity' })
  labelCommodity = DEFAULT_PHASE_LABELS.commodity;

  // -- Styles -------------------------------------------------------------

  static override styles = css`
    :host {
      display: block;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      color: #1e1e1e;
    }

    .panel {
      border: 1px solid #e3e3e3;
      border-radius: 8px;
      background: #fafafa;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e3e3e3;
      font-size: 13px;
      font-weight: 600;
      color: #333;
    }

    .panel-header-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    /* ── Section groups ── */

    .section {
      padding: 10px 0;
    }

    .section + .section {
      border-top: 1px solid #ebebeb;
    }

    .section-label {
      padding: 4px 16px 8px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #999;
    }

    /* ── Form rows ── */

    .form-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 16px;
      gap: 12px;
    }

    .form-row:hover {
      background: #f0f0f0;
    }

    .form-label {
      font-size: 12px;
      font-weight: 500;
      color: #444;
      min-width: 100px;
      flex-shrink: 0;
    }

    .form-control {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      justify-content: flex-end;
    }

    /* ── Number input ── */

    .number-input {
      width: 72px;
      padding: 4px 8px;
      font-size: 12px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: #1e1e1e;
      background: white;
      border: 1px solid #d0d0d0;
      border-radius: 4px;
      text-align: right;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .number-input:focus {
      border-color: #1e96eb;
      box-shadow: 0 0 0 2px rgba(30, 150, 235, 0.15);
    }

    /* ── Text input ── */

    .text-input {
      width: 180px;
      padding: 4px 8px;
      font-size: 12px;
      font-family: Inter, system-ui, sans-serif;
      color: #1e1e1e;
      background: white;
      border: 1px solid #d0d0d0;
      border-radius: 4px;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .text-input:focus {
      border-color: #1e96eb;
      box-shadow: 0 0 0 2px rgba(30, 150, 235, 0.15);
    }

    /* ── Slider ── */

    .slider-container {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      justify-content: flex-end;
    }

    .slider {
      width: 120px;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: #d1d5db;
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }

    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #1e96eb;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: transform 0.1s ease;
    }

    .slider::-webkit-slider-thumb:hover {
      transform: scale(1.15);
    }

    .slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #1e96eb;
      cursor: pointer;
      border: none;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .slider-value {
      font-size: 11px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: #666;
      min-width: 36px;
      text-align: right;
    }

    /* ── Dropdown ── */

    .dropdown {
      padding: 4px 8px;
      font-size: 12px;
      font-family: Inter, system-ui, sans-serif;
      color: #1e1e1e;
      background: white;
      border: 1px solid #d0d0d0;
      border-radius: 4px;
      cursor: pointer;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .dropdown:focus {
      border-color: #1e96eb;
      box-shadow: 0 0 0 2px rgba(30, 150, 235, 0.15);
    }

    /* ── Phase ratio visual indicator ── */

    .phase-bar {
      display: flex;
      height: 6px;
      border-radius: 3px;
      overflow: hidden;
      margin: 4px 16px 8px;
      background: #e5e7eb;
    }

    .phase-bar-segment {
      height: 100%;
      transition: width 0.2s ease;
    }

    .phase-bar-genesis {
      background: rgba(200, 220, 240, 0.7);
    }

    .phase-bar-custom {
      background: rgba(240, 230, 200, 0.7);
    }

    .phase-bar-product {
      background: rgba(210, 240, 210, 0.7);
    }

    .phase-bar-commodity {
      background: rgba(220, 220, 220, 0.7);
    }

    /* ── Footer ── */

    .panel-footer {
      display: flex;
      justify-content: flex-end;
      padding: 8px 16px;
      border-top: 1px solid #e3e3e3;
      background: #f5f5f5;
    }

    .reset-button {
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 500;
      color: #666;
      background: white;
      border: 1px solid #d0d0d0;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .reset-button:hover {
      color: #333;
      border-color: #999;
      background: #f5f5f5;
    }

    .reset-button:focus-visible {
      outline: 2px solid #1e96eb;
      outline-offset: 2px;
    }

    /* ── Dimension row (paired inputs) ── */

    .dimension-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .dimension-sep {
      font-size: 12px;
      color: #999;
    }
  `;

  // -- Getters ------------------------------------------------------------

  /** Current evolution phase ratios */
  get evolutionPhaseRatios(): EvolutionPhaseRatios {
    return {
      custom: this.phaseCustom,
      product: this.phaseProduct,
      commodity: this.phaseCommodity,
    };
  }

  /** Current phase labels */
  get phaseLabels(): PhaseLabels {
    return {
      genesis: this.labelGenesis,
      customBuilt: this.labelCustomBuilt,
      product: this.labelProduct,
      commodity: this.labelCommodity,
    };
  }

  /** Full defaults snapshot */
  get defaults(): WardleyMapDefaults {
    return {
      width: this.width,
      height: this.height,
      evolutionPhaseRatios: this.evolutionPhaseRatios,
      xAxisLabel: this.xAxisLabel,
      yAxisLabel: this.yAxisLabel,
      phaseLabels: this.phaseLabels,
    };
  }

  // -- Dispatch helper ----------------------------------------------------

  private _emitChange(key: DefaultsChangeKey, value: DefaultsChangeDetail['value']): void {
    this.dispatchEvent(
      createDefaultsChangeEvent({
        key,
        value,
        defaults: this.defaults,
      }),
    );
  }

  // -- Handlers: Dimensions -----------------------------------------------

  private _handleWidthChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, parseInt(input.value, 10) || MIN_DIMENSION));
    this.width = value;
    input.value = String(value);
    this._emitChange('width', value);
  }

  private _handleHeightChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, parseInt(input.value, 10) || MIN_DIMENSION));
    this.height = value;
    input.value = String(value);
    this._emitChange('height', value);
  }

  private _handleAspectRatioPreset(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const index = parseInt(select.value, 10);
    if (index >= 0 && index < ASPECT_RATIO_PRESETS.length) {
      const preset = ASPECT_RATIO_PRESETS[index];
      this.width = preset.width;
      this.height = preset.height;
      this._emitChange('width', preset.width);
      this._emitChange('height', preset.height);
    }
  }

  // -- Handlers: Evolution phase ratios -----------------------------------

  private _handlePhaseCustom(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = parseFloat(input.value);
    // Clamp: must be at least MIN_BOUNDARY_GAP, and < product - gap
    value = Math.max(MIN_BOUNDARY_GAP, Math.min(value, this.phaseProduct - MIN_BOUNDARY_GAP));
    this.phaseCustom = value;
    this._emitChange('evolutionPhaseRatios', this.evolutionPhaseRatios);
  }

  private _handlePhaseProduct(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = parseFloat(input.value);
    // Clamp: must be > custom + gap, and < commodity - gap
    value = Math.max(this.phaseCustom + MIN_BOUNDARY_GAP, Math.min(value, this.phaseCommodity - MIN_BOUNDARY_GAP));
    this.phaseProduct = value;
    this._emitChange('evolutionPhaseRatios', this.evolutionPhaseRatios);
  }

  private _handlePhaseCommodity(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = parseFloat(input.value);
    // Clamp: must be > product + gap, and < 1.0 - gap
    value = Math.max(this.phaseProduct + MIN_BOUNDARY_GAP, Math.min(value, 1.0 - MIN_BOUNDARY_GAP));
    this.phaseCommodity = value;
    this._emitChange('evolutionPhaseRatios', this.evolutionPhaseRatios);
  }

  // -- Handlers: Labels ---------------------------------------------------

  private _handleXAxisLabel(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.xAxisLabel = input.value;
    this._emitChange('xAxisLabel', input.value);
  }

  private _handleYAxisLabel(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.yAxisLabel = input.value;
    this._emitChange('yAxisLabel', input.value);
  }

  private _handlePhaseLabelChange(
    field: keyof PhaseLabels,
    event: Event,
  ): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    switch (field) {
      case 'genesis':
        this.labelGenesis = value;
        break;
      case 'customBuilt':
        this.labelCustomBuilt = value;
        break;
      case 'product':
        this.labelProduct = value;
        break;
      case 'commodity':
        this.labelCommodity = value;
        break;
    }
    this._emitChange('phaseLabels', this.phaseLabels);
  }

  // -- Public API ---------------------------------------------------------

  /** Reset all defaults to their initial values */
  resetToDefaults(): void {
    this.width = WARDLEY_MAP_DEFAULT_WIDTH;
    this.height = WARDLEY_MAP_DEFAULT_HEIGHT;
    this.phaseCustom = EVOLUTION_PHASE_CUSTOM;
    this.phaseProduct = EVOLUTION_PHASE_PRODUCT;
    this.phaseCommodity = EVOLUTION_PHASE_COMMODITY;
    this.xAxisLabel = DEFAULT_X_AXIS_LABEL;
    this.yAxisLabel = DEFAULT_Y_AXIS_LABEL;
    this.labelGenesis = DEFAULT_PHASE_LABELS.genesis;
    this.labelCustomBuilt = DEFAULT_PHASE_LABELS.customBuilt;
    this.labelProduct = DEFAULT_PHASE_LABELS.product;
    this.labelCommodity = DEFAULT_PHASE_LABELS.commodity;

    // Emit all changes
    this._emitChange('width', this.width);
    this._emitChange('height', this.height);
    this._emitChange('evolutionPhaseRatios', this.evolutionPhaseRatios);
    this._emitChange('xAxisLabel', this.xAxisLabel);
    this._emitChange('yAxisLabel', this.yAxisLabel);
    this._emitChange('phaseLabels', this.phaseLabels);
  }

  /** Programmatically set all defaults from a partial object */
  setDefaults(defaults: Partial<WardleyMapDefaults>): void {
    if (defaults.width !== undefined) this.width = defaults.width;
    if (defaults.height !== undefined) this.height = defaults.height;
    if (defaults.evolutionPhaseRatios) {
      this.phaseCustom = defaults.evolutionPhaseRatios.custom;
      this.phaseProduct = defaults.evolutionPhaseRatios.product;
      this.phaseCommodity = defaults.evolutionPhaseRatios.commodity;
    }
    if (defaults.xAxisLabel !== undefined) this.xAxisLabel = defaults.xAxisLabel;
    if (defaults.yAxisLabel !== undefined) this.yAxisLabel = defaults.yAxisLabel;
    if (defaults.phaseLabels) {
      this.labelGenesis = defaults.phaseLabels.genesis;
      this.labelCustomBuilt = defaults.phaseLabels.customBuilt;
      this.labelProduct = defaults.phaseLabels.product;
      this.labelCommodity = defaults.phaseLabels.commodity;
    }
  }

  // -- Render: Dimensions section -----------------------------------------

  private _renderDimensionsSection() {
    // Detect current aspect preset
    const currentPresetIndex = ASPECT_RATIO_PRESETS.findIndex(
      p => p.width === this.width && p.height === this.height,
    );

    return html`
      <div class="section">
        <div class="section-label">Dimensions</div>

        <div class="form-row">
          <span class="form-label">Aspect Ratio</span>
          <div class="form-control">
            <select
              class="dropdown"
              @change=${this._handleAspectRatioPreset}
              aria-label="Aspect ratio preset"
            >
              ${ASPECT_RATIO_PRESETS.map(
                (preset, i) => html`
                  <option value="${i}" ?selected=${i === currentPresetIndex}>
                    ${preset.label}
                  </option>
                `,
              )}
              <option value="-1" ?selected=${currentPresetIndex === -1}>
                Custom
              </option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <span class="form-label">Size (px)</span>
          <div class="form-control">
            <div class="dimension-row">
              <input
                type="number"
                class="number-input"
                .value=${String(this.width)}
                min="${MIN_DIMENSION}"
                max="${MAX_DIMENSION}"
                step="${DIMENSION_STEP}"
                @change=${this._handleWidthChange}
                aria-label="Map width in pixels"
              />
              <span class="dimension-sep">×</span>
              <input
                type="number"
                class="number-input"
                .value=${String(this.height)}
                min="${MIN_DIMENSION}"
                max="${MAX_DIMENSION}"
                step="${DIMENSION_STEP}"
                @change=${this._handleHeightChange}
                aria-label="Map height in pixels"
              />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // -- Render: Evolution phase ratios section ------------------------------

  private _renderPhaseRatiosSection() {
    return html`
      <div class="section">
        <div class="section-label">Evolution Phase Boundaries</div>

        <!-- Visual phase bar -->
        <div class="phase-bar" role="img" aria-label="Phase ratio visualization">
          <div
            class="phase-bar-segment phase-bar-genesis"
            style="width: ${this.phaseCustom * 100}%"
          ></div>
          <div
            class="phase-bar-segment phase-bar-custom"
            style="width: ${(this.phaseProduct - this.phaseCustom) * 100}%"
          ></div>
          <div
            class="phase-bar-segment phase-bar-product"
            style="width: ${(this.phaseCommodity - this.phaseProduct) * 100}%"
          ></div>
          <div
            class="phase-bar-segment phase-bar-commodity"
            style="width: ${(1.0 - this.phaseCommodity) * 100}%"
          ></div>
        </div>

        <div class="form-row">
          <span class="form-label">Custom boundary</span>
          <div class="slider-container">
            <input
              type="range"
              class="slider"
              min="0.05"
              max="0.95"
              step="0.005"
              .value=${String(this.phaseCustom)}
              @input=${this._handlePhaseCustom}
              aria-label="Custom-Built phase boundary ratio"
            />
            <span class="slider-value">${this.phaseCustom.toFixed(3)}</span>
          </div>
        </div>

        <div class="form-row">
          <span class="form-label">Product boundary</span>
          <div class="slider-container">
            <input
              type="range"
              class="slider"
              min="0.05"
              max="0.95"
              step="0.005"
              .value=${String(this.phaseProduct)}
              @input=${this._handlePhaseProduct}
              aria-label="Product phase boundary ratio"
            />
            <span class="slider-value">${this.phaseProduct.toFixed(3)}</span>
          </div>
        </div>

        <div class="form-row">
          <span class="form-label">Commodity boundary</span>
          <div class="slider-container">
            <input
              type="range"
              class="slider"
              min="0.05"
              max="0.95"
              step="0.005"
              .value=${String(this.phaseCommodity)}
              @input=${this._handlePhaseCommodity}
              aria-label="Commodity phase boundary ratio"
            />
            <span class="slider-value">${this.phaseCommodity.toFixed(3)}</span>
          </div>
        </div>
      </div>
    `;
  }

  // -- Render: Axis labels section ----------------------------------------

  private _renderAxisLabelsSection() {
    return html`
      <div class="section">
        <div class="section-label">Axis Labels</div>

        <div class="form-row">
          <span class="form-label">X-axis</span>
          <div class="form-control">
            <input
              type="text"
              class="text-input"
              .value=${this.xAxisLabel}
              @change=${this._handleXAxisLabel}
              placeholder="${DEFAULT_X_AXIS_LABEL}"
              aria-label="X-axis label"
            />
          </div>
        </div>

        <div class="form-row">
          <span class="form-label">Y-axis</span>
          <div class="form-control">
            <input
              type="text"
              class="text-input"
              .value=${this.yAxisLabel}
              @change=${this._handleYAxisLabel}
              placeholder="${DEFAULT_Y_AXIS_LABEL}"
              aria-label="Y-axis label"
            />
          </div>
        </div>
      </div>
    `;
  }

  // -- Render: Phase labels section ---------------------------------------

  private _renderPhaseLabelsSection() {
    const fields: { field: keyof PhaseLabels; label: string; placeholder: string }[] = [
      { field: 'genesis', label: 'Genesis', placeholder: DEFAULT_PHASE_LABELS.genesis },
      { field: 'customBuilt', label: 'Custom-Built', placeholder: DEFAULT_PHASE_LABELS.customBuilt },
      { field: 'product', label: 'Product', placeholder: DEFAULT_PHASE_LABELS.product },
      { field: 'commodity', label: 'Commodity', placeholder: DEFAULT_PHASE_LABELS.commodity },
    ];

    return html`
      <div class="section">
        <div class="section-label">Phase Labels</div>

        ${fields.map(
          ({ field, label, placeholder }) => html`
            <div class="form-row">
              <span class="form-label">${label}</span>
              <div class="form-control">
                <input
                  type="text"
                  class="text-input"
                  .value=${this._getPhaseLabelValue(field)}
                  @change=${(e: Event) => this._handlePhaseLabelChange(field, e)}
                  placeholder="${placeholder}"
                  aria-label="${label} phase label"
                />
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }

  /** Get the current value of a phase label by field key */
  private _getPhaseLabelValue(field: keyof PhaseLabels): string {
    switch (field) {
      case 'genesis':
        return this.labelGenesis;
      case 'customBuilt':
        return this.labelCustomBuilt;
      case 'product':
        return this.labelProduct;
      case 'commodity':
        return this.labelCommodity;
    }
  }

  // -- Render: main -------------------------------------------------------

  override render() {
    return html`
      <div class="panel" role="region" aria-label="Wardley Map default settings">
        <div class="panel-header">
          <span class="panel-header-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Settings/gear icon -->
              <path
                d="M6.5 1.5h3l.5 2 1.5.7 1.8-1 2.1 2.1-1 1.8.7 1.5 2 .5v3l-2 .5-0.7 1.5 1 1.8-2.1 2.1-1.8-1-1.5.7-.5 2h-3l-.5-2-1.5-.7-1.8 1-2.1-2.1 1-1.8-.7-1.5-2-.5v-3l2-.5.7-1.5-1-1.8 2.1-2.1 1.8 1 1.5-.7z"
                stroke="#555"
                stroke-width="1"
                fill="none"
              />
              <circle cx="8" cy="8" r="2.5" stroke="#555" stroke-width="1" fill="none" />
            </svg>
          </span>
          Map Defaults
        </div>

        ${this._renderDimensionsSection()}
        ${this._renderPhaseRatiosSection()}
        ${this._renderAxisLabelsSection()}
        ${this._renderPhaseLabelsSection()}

        <div class="panel-footer">
          <button
            class="reset-button"
            @click=${() => this.resetToDefaults()}
            title="Reset all values to defaults"
          >
            Reset defaults
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wardley-map-defaults-panel': WardleyMapDefaultsPanel;
  }
}
