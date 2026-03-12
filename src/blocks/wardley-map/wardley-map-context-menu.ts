/**
 * wardley-map-context-menu.ts — Right-click context menu entry for Wardley Map blocks.
 *
 * When a Wardley Map block is selected in the Edgeless Canvas,
 * right-clicking shows a context menu containing a "Wardley Map Settings"
 * entry with a settings (gear) icon. Clicking it dispatches a
 * `wardley-map-open-settings` event so the host can open the overlay
 * settings panel.
 *
 * In the real AFFiNE integration this would register as a menu item
 * provider via the Edgeless context menu extension point. Here we model
 * a standalone Lit element for spike validation.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { WARDLEY_MAP_FLAVOUR } from './wardley-map-consts.js';

// ── Event types ──────────────────────────────────────────────────────

/** Event name dispatched when "Wardley Map Settings" is clicked */
export const WARDLEY_MAP_OPEN_SETTINGS_EVENT = 'wardley-map-open-settings' as const;

/** Detail payload for the open-settings event */
export interface OpenSettingsDetail {
  /** The block ID of the selected Wardley Map */
  readonly blockId: string;
}

/** Create the open-settings custom event */
export function createOpenSettingsEvent(
  detail: OpenSettingsDetail,
): CustomEvent<OpenSettingsDetail> {
  return new CustomEvent(WARDLEY_MAP_OPEN_SETTINGS_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

// ── Menu item definition ─────────────────────────────────────────────

/** Describes a context menu item */
export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon: 'settings';
  readonly action: () => void;
  readonly disabled?: boolean;
}

/**
 * Build the Wardley Map context menu items for a given block.
 * Returns an empty array if the block flavour is not `affine:wardley-map`.
 */
export function getWardleyMapContextMenuItems(
  blockFlavour: string,
  blockId: string,
  onOpenSettings: (blockId: string) => void,
): readonly ContextMenuItem[] {
  if (blockFlavour !== WARDLEY_MAP_FLAVOUR) {
    return [];
  }

  return [
    {
      id: 'wardley-map-settings',
      label: 'Wardley Map Settings',
      icon: 'settings',
      action: () => onOpenSettings(blockId),
    },
  ];
}

// ── Lit Component ────────────────────────────────────────────────────

/**
 * `<wardley-map-context-menu>` — A popup context menu rendered when
 * right-clicking a selected Wardley Map block on the Edgeless Canvas.
 *
 * Usage:
 * ```html
 * <wardley-map-context-menu
 *   block-id="block-abc123"
 *   .visible=${true}
 *   .positionX=${event.clientX}
 *   .positionY=${event.clientY}
 * ></wardley-map-context-menu>
 * ```
 */
@customElement('wardley-map-context-menu')
export class WardleyMapContextMenu extends LitElement {
  /** The block ID of the selected Wardley Map */
  @property({ type: String, attribute: 'block-id' })
  blockId = '';

  /** Whether the menu is visible */
  @property({ type: Boolean, reflect: true })
  visible = false;

  /** X position (px) for absolute placement */
  @property({ type: Number, attribute: 'position-x' })
  positionX = 0;

  /** Y position (px) for absolute placement */
  @property({ type: Number, attribute: 'position-y' })
  positionY = 0;

  @state()
  private _hoveredItem: string | null = null;

  // -- Styles ----------------------------------------------------------

  static override styles = css`
    :host {
      position: fixed;
      z-index: 9999;
      pointer-events: none;
      font-family: Inter, system-ui, -apple-system, sans-serif;
    }

    :host([visible]) {
      pointer-events: auto;
    }

    .menu {
      display: none;
      min-width: 200px;
      padding: 4px 0;
      background: #ffffff;
      border: 1px solid #e3e3e3;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12),
                  0 1px 4px rgba(0, 0, 0, 0.08);
      overflow: hidden;
    }

    :host([visible]) .menu {
      display: block;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      cursor: pointer;
      transition: background 0.1s ease;
      user-select: none;
    }

    .menu-item:hover,
    .menu-item[data-hovered] {
      background: #f0f5ff;
    }

    .menu-item:active {
      background: #e0ecff;
    }

    .menu-item-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      color: #555;
    }

    .menu-item:hover .menu-item-icon,
    .menu-item[data-hovered] .menu-item-icon {
      color: #1e96eb;
    }

    .menu-item-label {
      font-size: 13px;
      font-weight: 500;
      color: #1e1e1e;
      line-height: 1.4;
    }

    .menu-separator {
      height: 1px;
      margin: 4px 8px;
      background: #e3e3e3;
    }
  `;

  // -- Lifecycle -------------------------------------------------------

  override connectedCallback(): void {
    super.connectedCallback();
    // Close on outside click
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
    document.addEventListener('click', this._handleOutsideClick);
    document.addEventListener('contextmenu', this._handleOutsideClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleOutsideClick);
    document.removeEventListener('contextmenu', this._handleOutsideClick);
  }

  override updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    // Update position when coords change
    if (
      changedProperties.has('positionX') ||
      changedProperties.has('positionY')
    ) {
      this.style.left = `${this.positionX}px`;
      this.style.top = `${this.positionY}px`;
    }
  }

  // -- Handlers --------------------------------------------------------

  private _handleOutsideClick(event: Event): void {
    if (!this.visible) return;
    const path = event.composedPath();
    if (!path.includes(this)) {
      this.hide();
    }
  }

  private _handleSettingsClick(): void {
    if (!this.blockId) return;

    this.dispatchEvent(createOpenSettingsEvent({ blockId: this.blockId }));
    this.hide();
  }

  private _handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this._handleSettingsClick();
    } else if (event.key === 'Escape') {
      this.hide();
    }
  }

  // -- Public API ------------------------------------------------------

  /** Show the context menu at specified coordinates for a given block */
  show(blockId: string, x: number, y: number): void {
    this.blockId = blockId;
    this.positionX = x;
    this.positionY = y;
    this.visible = true;
    // Focus first item for keyboard accessibility
    this.updateComplete.then(() => {
      const firstItem = this.shadowRoot?.querySelector<HTMLElement>('.menu-item');
      firstItem?.focus();
    });
  }

  /** Hide the context menu */
  hide(): void {
    this.visible = false;
    this._hoveredItem = null;
  }

  // -- Render ----------------------------------------------------------

  /** Settings gear icon (16x16 SVG) */
  private _renderSettingsIcon() {
    return html`
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6.86 1.33h2.28l.36 1.78.12.05a5.3 5.3 0 0 1 1.06.62l.1.08 1.7-.6.91 1.58-1.34 1.18.02.12c.03.2.04.39.04.53s-.01.33-.04.53l-.02.12 1.34 1.18-.91 1.58-1.7-.6-.1.08c-.33.25-.68.46-1.06.62l-.12.05-.36 1.78H6.86l-.36-1.78-.12-.05a5.3 5.3 0 0 1-1.06-.62l-.1-.08-1.7.6-.91-1.58 1.34-1.18-.02-.12A4 4 0 0 1 3.89 8c0-.14.01-.33.04-.53l.02-.12-1.34-1.18.91-1.58 1.7.6.1-.08c.33-.25.68-.46 1.06-.62l.12-.05.36-1.78Z"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
        <circle
          cx="8"
          cy="8"
          r="2"
          stroke="currentColor"
          stroke-width="1.2"
        />
      </svg>
    `;
  }

  override render() {
    if (!this.visible) {
      return html`<div class="menu"></div>`;
    }

    return html`
      <div
        class="menu"
        role="menu"
        aria-label="Wardley Map context menu"
      >
        <div
          class="menu-item"
          role="menuitem"
          tabindex="0"
          ?data-hovered=${this._hoveredItem === 'settings'}
          @click=${this._handleSettingsClick}
          @keydown=${this._handleKeyDown}
          @mouseenter=${() => { this._hoveredItem = 'settings'; }}
          @mouseleave=${() => { this._hoveredItem = null; }}
          aria-label="Wardley Map Settings"
        >
          <span class="menu-item-icon" aria-hidden="true">
            ${this._renderSettingsIcon()}
          </span>
          <span class="menu-item-label">Wardley Map Settings</span>
        </div>
      </div>
    `;
  }
}

// ── Global type augmentation ─────────────────────────────────────────

declare global {
  interface HTMLElementTagNameMap {
    'wardley-map-context-menu': WardleyMapContextMenu;
  }
}
