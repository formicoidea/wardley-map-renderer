/**
 * wardley-map-settings-panel.ts — Settings / integration panel entry for Wardley Maps.
 *
 * Renders a toggle switch wired to the `enable_wardley_maps` feature flag.
 * When toggled ON, Wardley Map blocks become available in the Edgeless Canvas.
 * When toggled OFF, all Wardley Map UI is hidden.
 *
 * In the AFFiNE monorepo this would live in the settings/integration panel
 * (e.g. `packages/frontend/core/src/components/setting-sidebar/`).
 * Here we model a standalone Lit element for spike validation.
 */

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import {
  ENABLE_WARDLEY_MAPS_FLAG,
  isWardleyMapsEnabled,
  setWardleyMapsEnabled,
} from './wardley-map-feature-flag.js';

// ── Component ──────────────────────────────────────────────────────

@customElement('wardley-map-settings-panel')
export class WardleyMapSettingsPanel extends LitElement {
  @state()
  private _enabled = isWardleyMapsEnabled();

  // -- Styles -------------------------------------------------------

  static override styles = css`
    :host {
      display: block;
      font-family: Inter, system-ui, -apple-system, sans-serif;
    }

    .settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border: 1px solid #e3e3e3;
      border-radius: 8px;
      background: #fafafa;
      transition: background 0.15s ease;
    }

    .settings-row:hover {
      background: #f0f0f0;
    }

    .settings-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .settings-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #1e1e1e;
      line-height: 1.4;
    }

    .settings-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .settings-description {
      font-size: 12px;
      color: #8e8e8e;
      line-height: 1.4;
    }

    .settings-badge {
      display: inline-block;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 500;
      color: #6b7280;
      background: #e5e7eb;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    /* Toggle switch */
    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 22px;
      flex-shrink: 0;
      margin-left: 16px;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background-color: #d1d5db;
      border-radius: 11px;
      transition: background-color 0.2s ease;
    }

    .toggle-slider::before {
      content: '';
      position: absolute;
      height: 18px;
      width: 18px;
      left: 2px;
      bottom: 2px;
      background-color: white;
      border-radius: 50%;
      transition: transform 0.2s ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    }

    input:checked + .toggle-slider {
      background-color: #1e96eb;
    }

    input:checked + .toggle-slider::before {
      transform: translateX(18px);
    }

    input:focus-visible + .toggle-slider {
      outline: 2px solid #1e96eb;
      outline-offset: 2px;
    }
  `;

  // -- Handlers -----------------------------------------------------

  private _handleToggle(event: Event): void {
    const input = event.target as HTMLInputElement;
    const enabled = input.checked;
    setWardleyMapsEnabled(enabled);
    this._enabled = enabled;

    this.dispatchEvent(
      new CustomEvent('wardley-maps-toggle', {
        detail: { enabled },
        bubbles: true,
        composed: true,
      })
    );
  }

  // -- Render -------------------------------------------------------

  override render() {
    return html`
      <div class="settings-row" role="group" aria-label="Wardley Maps integration setting">
        <div class="settings-info">
          <div class="settings-label">
            <span class="settings-icon" aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <!-- Simplified Wardley Map icon: axes + dots -->
                <rect x="2" y="2" width="14" height="14" rx="1.5" stroke="#666" stroke-width="1.2" fill="none" />
                <line x1="4" y1="13" x2="15" y2="13" stroke="#666" stroke-width="1" />
                <line x1="4" y1="3" x2="4" y2="13" stroke="#666" stroke-width="1" />
                <circle cx="6" cy="5" r="1.2" fill="#1e96eb" />
                <circle cx="9" cy="8" r="1.2" fill="#1e96eb" />
                <circle cx="13" cy="11" r="1.2" fill="#1e96eb" />
                <line x1="6" y1="5" x2="9" y2="8" stroke="#1e96eb" stroke-width="0.8" />
                <line x1="9" y1="8" x2="13" y2="11" stroke="#1e96eb" stroke-width="0.8" />
              </svg>
            </span>
            Wardley Maps
            <span class="settings-badge">${ENABLE_WARDLEY_MAPS_FLAG.category}</span>
          </div>
          <div class="settings-description">
            ${ENABLE_WARDLEY_MAPS_FLAG.description}
          </div>
        </div>

        <label class="toggle-switch" title="${this._enabled ? 'Disable' : 'Enable'} Wardley Maps">
          <input
            type="checkbox"
            .checked=${this._enabled}
            @change=${this._handleToggle}
            aria-label="Enable Wardley Maps"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wardley-map-settings-panel': WardleyMapSettingsPanel;
  }
}
