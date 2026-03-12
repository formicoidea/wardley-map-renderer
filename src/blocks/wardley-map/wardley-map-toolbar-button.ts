/**
 * wardley-map-toolbar-button.ts — Edgeless Canvas toolbar button for
 * inserting a Wardley Map block.
 *
 * Sub-AC 2 of AC 4 (US1): Conditionally show/hide the toolbar button
 * based on the Wardley Map plugin activation state (feature flag).
 *
 * Behaviour:
 *   • When `enable_wardley_maps` is OFF → button is hidden (display:none)
 *   • When `enable_wardley_maps` is ON  → button is visible in toolbar
 *   • Clicking the button dispatches a `wardley-map-insert` custom event
 *     that the Edgeless surface host handles to create a new block
 *   • The button automatically reacts to feature flag changes via the
 *     `onWardleyMapsEnabled` listener registry and `wardley-maps-toggle`
 *     bubbling event from the settings panel
 *
 * In the AFFiNE monorepo this would live alongside other Edgeless
 * toolbar buttons (e.g. Frame, Shape, Note). Here it's a standalone
 * Lit element for spike validation.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { isWardleyMapsEnabled, onWardleyMapsEnabled } from './wardley-map-feature-flag.js';

// ── Custom event name ───────────────────────────────────────────────

/** Event dispatched when the toolbar button is clicked to insert a map */
export const WARDLEY_MAP_INSERT_EVENT = 'wardley-map-insert' as const;

export interface WardleyMapInsertDetail {
  /** Source of the insertion request */
  readonly source: 'toolbar-button';
}

/** Create a typed `wardley-map-insert` custom event */
export function createInsertEvent(): CustomEvent<WardleyMapInsertDetail> {
  return new CustomEvent(WARDLEY_MAP_INSERT_EVENT, {
    detail: { source: 'toolbar-button' },
    bubbles: true,
    composed: true,
  });
}

// ── Component ──────────────────────────────────────────────────────

@customElement('wardley-map-toolbar-button')
export class WardleyMapToolbarButton extends LitElement {
  /**
   * Reactive flag state — mirrors `isWardleyMapsEnabled()`.
   * Updated on:
   *   1. Initial connectedCallback
   *   2. `onWardleyMapsEnabled` listener (OFF → ON transition)
   *   3. `wardley-maps-toggle` event (any toggle from settings panel)
   */
  @state()
  private _visible = false;

  // -- Lifecycle ----------------------------------------------------

  override connectedCallback(): void {
    super.connectedCallback();

    // Sync with current flag state
    this._visible = isWardleyMapsEnabled();

    // Listen for OFF → ON activation (from feature flag API)
    onWardleyMapsEnabled(() => {
      this._visible = true;
    });

    // Listen for toggle events from the settings panel (handles ON → OFF too)
    this._boundToggleHandler = this._handleSettingsToggle.bind(this);
    // Listen on window to catch bubbling events from anywhere in the DOM
    window.addEventListener('wardley-maps-toggle', this._boundToggleHandler);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._boundToggleHandler) {
      window.removeEventListener('wardley-maps-toggle', this._boundToggleHandler);
      this._boundToggleHandler = null;
    }
  }

  private _boundToggleHandler: ((e: Event) => void) | null = null;

  /**
   * Handle `wardley-maps-toggle` events from the settings panel.
   * Covers both ON → OFF and OFF → ON transitions.
   */
  private _handleSettingsToggle(event: Event): void {
    const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
    this._visible = detail.enabled;
  }

  // -- Styles -------------------------------------------------------

  static override styles = css`
    :host {
      display: contents;
    }

    :host([hidden]) {
      display: none !important;
    }

    .toolbar-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background: #ffffff;
      cursor: pointer;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: #1e1e1e;
      line-height: 1;
      white-space: nowrap;
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      user-select: none;
    }

    .toolbar-button:hover {
      background: #f5f8ff;
      border-color: #1e96eb;
      color: #1e96eb;
    }

    .toolbar-button:active {
      background: #e8f0fe;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
    }

    .toolbar-button:focus-visible {
      outline: 2px solid #1e96eb;
      outline-offset: 2px;
    }

    .toolbar-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
  `;

  // -- Handlers -----------------------------------------------------

  private _handleClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(createInsertEvent());
  }

  // -- Render -------------------------------------------------------

  override render() {
    // When feature flag is OFF, render nothing
    if (!this._visible) {
      return nothing;
    }

    return html`
      <button
        class="toolbar-button"
        @click=${this._handleClick}
        title="Insert Wardley Map"
        aria-label="Insert Wardley Map block on canvas"
      >
        <span class="toolbar-icon" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <!-- Wardley Map icon: axes + component dots + edges -->
            <rect x="2" y="2" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none" />
            <line x1="4" y1="13" x2="15" y2="13" stroke="currentColor" stroke-width="1" />
            <line x1="4" y1="3" x2="4" y2="13" stroke="currentColor" stroke-width="1" />
            <circle cx="6" cy="5" r="1.2" fill="currentColor" />
            <circle cx="9" cy="8" r="1.2" fill="currentColor" />
            <circle cx="13" cy="11" r="1.2" fill="currentColor" />
            <line x1="6" y1="5" x2="9" y2="8" stroke="currentColor" stroke-width="0.8" />
            <line x1="9" y1="8" x2="13" y2="11" stroke="currentColor" stroke-width="0.8" />
          </svg>
        </span>
        Wardley Map
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wardley-map-toolbar-button': WardleyMapToolbarButton;
  }
}
