/**
 * wardley-map-overlay-settings.ts — Settings panel for Wardley Map overlays.
 *
 * Renders 9 toggle switches organized in two logical groups:
 *
 * **Overlay Toggles (6):**
 *   1. Axes — evolution (x) and value chain (y) axis lines
 *   2. Grid Lines — subtle horizontal grid lines
 *   3. Phase Dividers — vertical dashed phase boundary lines
 *   4. Phase Labels (Zones) — zone label text below evolution axis
 *   5. Punctuated Equilibrium — S-curve transition zone markers
 *   6. Competition-free Zone — shading in Genesis area
 *
 * **Intensity Gradients (3):**
 *   7. Evolution Gradient — horizontal maturity progression shading
 *   8. Visibility Gradient — vertical visibility falloff shading
 *   9. Activity Gradient — heat-map overlay for component density
 *
 * Each toggle is wired to the corresponding `WardleyMapToggles` property
 * on the block model. Changes dispatch a `wardley-map-toggle-change` event
 * with the property key and new boolean value.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import {
  type WardleyMapToggles,
  DEFAULT_WARDLEY_MAP_TOGGLES,
} from './wardley-map-schema.js';

// ── Event types ──────────────────────────────────────────────────────

/** Event name dispatched when any toggle changes */
export const WARDLEY_MAP_TOGGLE_CHANGE_EVENT = 'wardley-map-toggle-change' as const;

/** Detail payload for toggle change events */
export interface ToggleChangeDetail {
  /** The toggle property key that changed (e.g. 'showAxes') */
  readonly key: keyof WardleyMapToggles;
  /** New boolean value */
  readonly value: boolean;
  /** All current toggle values after the change */
  readonly toggles: Readonly<WardleyMapToggles>;
}

/** Create a toggle-change custom event */
export function createToggleChangeEvent(
  detail: ToggleChangeDetail,
): CustomEvent<ToggleChangeDetail> {
  return new CustomEvent(WARDLEY_MAP_TOGGLE_CHANGE_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

// ── Toggle definitions ───────────────────────────────────────────────

interface ToggleDefinition {
  readonly key: keyof WardleyMapToggles;
  readonly label: string;
  readonly description: string;
  readonly group: 'overlay' | 'gradient';
}

/**
 * Ordered list of all 9 toggle definitions.
 * The panel renders them in this order, grouped by category.
 */
const TOGGLE_DEFINITIONS: readonly ToggleDefinition[] = [
  // ── Overlay toggles (6) ──
  {
    key: 'showAxes',
    label: 'Axes',
    description: 'Evolution (x) and Value Chain (y) axis lines with arrows',
    group: 'overlay',
  },
  {
    key: 'showGrid',
    label: 'Grid Lines',
    description: 'Subtle horizontal lines across the visibility axis',
    group: 'overlay',
  },
  {
    key: 'showPhases',
    label: 'Phase Dividers',
    description: 'Vertical dashed lines at evolution phase boundaries',
    group: 'overlay',
  },
  {
    key: 'showZones',
    label: 'Zone Backgrounds',
    description: 'Coloured backgrounds behind each evolution phase',
    group: 'overlay',
  },
  {
    key: 'showPunctuatedEquilibrium',
    label: 'Punctuated Equilibrium',
    description: 'S-curve transition zones at phase boundaries',
    group: 'overlay',
  },
  {
    key: 'showCompetitionFreeZone',
    label: 'Competition-free Zone',
    description: 'Shaded indicator in the Genesis area (top-left)',
    group: 'overlay',
  },
  // ── Intensity gradients (3) ──
  {
    key: 'showEvolutionIntensity',
    label: 'Evolution Gradient',
    description: 'Horizontal shading showing maturity progression',
    group: 'gradient',
  },
  {
    key: 'showVisibilityIntensity',
    label: 'Visibility Gradient',
    description: 'Vertical shading showing visibility falloff',
    group: 'gradient',
  },
  {
    key: 'showActivityIntensity',
    label: 'Activity Gradient',
    description: 'Heat-map overlay for component activity density',
    group: 'gradient',
  },
] as const;

// ── Component ────────────────────────────────────────────────────────

@customElement('wardley-map-overlay-settings')
export class WardleyMapOverlaySettings extends LitElement {
  // -- Reactive properties (mirror WardleyMapToggles) ------------------

  @property({ type: Boolean, attribute: 'show-axes' })
  showAxes = DEFAULT_WARDLEY_MAP_TOGGLES.showAxes;

  @property({ type: Boolean, attribute: 'show-grid' })
  showGrid = DEFAULT_WARDLEY_MAP_TOGGLES.showGrid;

  @property({ type: Boolean, attribute: 'show-phases' })
  showPhases = DEFAULT_WARDLEY_MAP_TOGGLES.showPhases;

  @property({ type: Boolean, attribute: 'show-zones' })
  showZones = DEFAULT_WARDLEY_MAP_TOGGLES.showZones;

  @property({ type: Boolean, attribute: 'show-punctuated-equilibrium' })
  showPunctuatedEquilibrium = DEFAULT_WARDLEY_MAP_TOGGLES.showPunctuatedEquilibrium;

  @property({ type: Boolean, attribute: 'show-competition-free-zone' })
  showCompetitionFreeZone = DEFAULT_WARDLEY_MAP_TOGGLES.showCompetitionFreeZone;

  @property({ type: Boolean, attribute: 'show-evolution-intensity' })
  showEvolutionIntensity = DEFAULT_WARDLEY_MAP_TOGGLES.showEvolutionIntensity;

  @property({ type: Boolean, attribute: 'show-visibility-intensity' })
  showVisibilityIntensity = DEFAULT_WARDLEY_MAP_TOGGLES.showVisibilityIntensity;

  @property({ type: Boolean, attribute: 'show-activity-intensity' })
  showActivityIntensity = DEFAULT_WARDLEY_MAP_TOGGLES.showActivityIntensity;

  // -- Styles ----------------------------------------------------------

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

    /* ── Group sections ── */

    .group {
      padding: 8px 0;
    }

    .group + .group {
      border-top: 1px solid #ebebeb;
    }

    .group-label {
      padding: 4px 16px 6px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #999;
    }

    /* ── Toggle rows ── */

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 16px;
      gap: 12px;
      transition: background 0.12s ease;
    }

    .toggle-row:hover {
      background: #f0f0f0;
    }

    .toggle-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }

    .toggle-label {
      font-size: 13px;
      font-weight: 500;
      color: #1e1e1e;
      line-height: 1.4;
    }

    .toggle-description {
      font-size: 11px;
      color: #999;
      line-height: 1.3;
    }

    /* ── Eye-icon toggle button ── */

    .eye-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      border: 1px solid transparent;
      border-radius: 6px;
      background: none;
      cursor: pointer;
      padding: 0;
      color: #1e96eb;
      transition: all 0.15s ease;
    }

    .eye-toggle:hover {
      background: #e8f4fd;
      border-color: #c5e1f7;
    }

    .eye-toggle[aria-pressed="false"] {
      color: #b0b0b0;
    }

    .eye-toggle[aria-pressed="false"]:hover {
      background: #f5f5f5;
      border-color: #e0e0e0;
      color: #888;
    }

    .eye-toggle:focus-visible {
      outline: 2px solid #1e96eb;
      outline-offset: 2px;
    }

    .eye-toggle svg {
      width: 18px;
      height: 18px;
    }

    /* ── Reset button ── */

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
  `;

  // -- Getters ---------------------------------------------------------

  /** Returns the current toggle state as a WardleyMapToggles object */
  get toggles(): WardleyMapToggles {
    return {
      showAxes: this.showAxes,
      showGrid: this.showGrid,
      showPhases: this.showPhases,
      showZones: this.showZones,
      showPunctuatedEquilibrium: this.showPunctuatedEquilibrium,
      showCompetitionFreeZone: this.showCompetitionFreeZone,
      showEvolutionIntensity: this.showEvolutionIntensity,
      showVisibilityIntensity: this.showVisibilityIntensity,
      showActivityIntensity: this.showActivityIntensity,
    };
  }

  /** Read the current value of a toggle by key */
  private _getToggleValue(key: keyof WardleyMapToggles): boolean {
    return this[key];
  }

  // -- Handlers --------------------------------------------------------

  /**
   * Handle an eye-icon toggle click.
   * Flips the boolean, updates the local property, and dispatches a change event.
   */
  private _handleToggle(key: keyof WardleyMapToggles): void {
    const value = !this._getToggleValue(key);

    // Update the reactive property
    (this as Record<string, unknown>)[key] = value;

    // Dispatch change event with updated toggles
    this.dispatchEvent(
      createToggleChangeEvent({
        key,
        value,
        toggles: this.toggles,
      }),
    );
  }

  /**
   * Reset all toggles to their default values.
   * Dispatches a change event for each toggle that actually changed.
   */
  resetToDefaults(): void {
    const keys = Object.keys(DEFAULT_WARDLEY_MAP_TOGGLES) as (keyof WardleyMapToggles)[];
    for (const key of keys) {
      const defaultValue = DEFAULT_WARDLEY_MAP_TOGGLES[key];
      if (this[key] !== defaultValue) {
        (this as Record<string, unknown>)[key] = defaultValue;
        this.dispatchEvent(
          createToggleChangeEvent({
            key,
            value: defaultValue,
            toggles: this.toggles,
          }),
        );
      }
    }
  }

  /**
   * Programmatically set all toggles from a WardleyMapToggles object.
   * Useful for syncing from block model on initial load.
   */
  setToggles(toggles: Partial<WardleyMapToggles>): void {
    const keys = Object.keys(toggles) as (keyof WardleyMapToggles)[];
    for (const key of keys) {
      const value = toggles[key];
      if (value !== undefined) {
        (this as Record<string, unknown>)[key] = value;
      }
    }
  }

  // -- Render ----------------------------------------------------------

  /** SVG path for the open-eye icon (visible state) */
  private _renderEyeOpen() {
    return html`
      <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1.5 9s3-5.5 7.5-5.5S16.5 9 16.5 9s-3 5.5-7.5 5.5S1.5 9 1.5 9Z"
              stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="9" cy="9" r="2.5"
                stroke="currentColor" stroke-width="1.3" />
      </svg>
    `;
  }

  /** SVG path for the closed-eye icon (hidden state — eye with diagonal slash) */
  private _renderEyeClosed() {
    return html`
      <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1.5 9s3-5.5 7.5-5.5S16.5 9 16.5 9s-3 5.5-7.5 5.5S1.5 9 1.5 9Z"
              stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"
              opacity="0.4" />
        <circle cx="9" cy="9" r="2.5"
                stroke="currentColor" stroke-width="1.3" opacity="0.4" />
        <line x1="3" y1="15" x2="15" y2="3"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    `;
  }

  private _renderToggleRow(def: ToggleDefinition) {
    const visible = this._getToggleValue(def.key);
    const ariaLabel = `Toggle ${def.label} visibility`;
    const title = visible ? `Hide ${def.label}` : `Show ${def.label}`;

    return html`
      <div class="toggle-row" role="group" aria-label="${def.label}">
        <div class="toggle-info">
          <span class="toggle-label">${def.label}</span>
          <span class="toggle-description">${def.description}</span>
        </div>
        <button
          class="eye-toggle"
          aria-pressed="${visible ? 'true' : 'false'}"
          aria-label="${ariaLabel}"
          title="${title}"
          @click=${() => this._handleToggle(def.key)}
        >
          ${visible ? this._renderEyeOpen() : this._renderEyeClosed()}
        </button>
      </div>
    `;
  }

  private _renderGroup(groupKey: 'overlay' | 'gradient', label: string) {
    const defs = TOGGLE_DEFINITIONS.filter(d => d.group === groupKey);
    if (defs.length === 0) return nothing;

    return html`
      <div class="group">
        <div class="group-label">${label}</div>
        ${defs.map(def => this._renderToggleRow(def))}
      </div>
    `;
  }

  override render() {
    return html`
      <div class="panel" role="region" aria-label="Wardley Map overlay settings">
        <div class="panel-header">
          <span class="panel-header-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Layers/overlay icon -->
              <path d="M8 1L1 5l7 4 7-4-7-4Z" stroke="#555" stroke-width="1.2" fill="none" />
              <path d="M1 8l7 4 7-4" stroke="#555" stroke-width="1.2" fill="none" />
              <path d="M1 11l7 4 7-4" stroke="#555" stroke-width="1.2" fill="none" />
            </svg>
          </span>
          Map Overlays
        </div>

        ${this._renderGroup('overlay', 'Overlay Toggles')}
        ${this._renderGroup('gradient', 'Intensity Gradients')}

        <div class="panel-footer">
          <button
            class="reset-button"
            @click=${() => this.resetToDefaults()}
            title="Reset all toggles to default values"
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
    'wardley-map-overlay-settings': WardleyMapOverlaySettings;
  }
}
