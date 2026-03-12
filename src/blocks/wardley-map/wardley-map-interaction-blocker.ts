/**
 * wardley-map-interaction-blocker.ts — Blocks all user interactions on
 * Wardley Map blocks when the feature flag is disabled.
 *
 * When the `enable_wardley_maps` flag is OFF, existing Wardley Map blocks
 * already placed on the canvas must become fully inert:
 *   • click, dblclick, mousedown, pointerdown — suppressed
 *   • hover (mouseover, mouseenter) — suppressed
 *   • contextmenu — suppressed
 *   • selection via keyboard or programmatic means — suppressed
 *   • pointer-events: none on the host element
 *
 * The blocker attaches/detaches automatically when the flag state changes
 * via `syncBlockerState()`, or can be manually controlled via
 * `attachBlocker()` / `detachBlocker()`.
 *
 * Usage in the block element:
 *   - Call `syncBlockerState(element)` after each render or flag change
 *   - Or use `attachBlocker(element)` / `detachBlocker(element)` directly
 */

import { isWardleyMapsEnabled } from './wardley-map-feature-flag.js';

// ── Blocked event types ──────────────────────────────────────────────

/**
 * All DOM event types that are suppressed when the plugin is disabled.
 */
export const BLOCKED_EVENT_TYPES = [
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'pointermove',
  'mouseover',
  'mouseenter',
  'mouseleave',
  'contextmenu',
  'focus',
  'focusin',
  'keydown',
  'keyup',
  'dragstart',
  'drop',
  'touchstart',
  'touchmove',
  'touchend',
] as const;

export type BlockedEventType = (typeof BLOCKED_EVENT_TYPES)[number];

// ── CSS class applied when blocked ───────────────────────────────────

/** CSS class added to the host element when interactions are blocked */
export const BLOCKED_CLASS = 'wardley-map--disabled' as const;

/**
 * Inline styles applied to the host when blocked.
 * pointer-events: none prevents all mouse/touch interaction.
 * user-select: none prevents text selection.
 * opacity: 0.5 provides a visual cue that the block is disabled.
 * cursor: not-allowed is set on the wrapper (parent) for visual feedback.
 */
export const BLOCKED_STYLES = {
  pointerEvents: 'none',
  userSelect: 'none',
  opacity: '0.5',
  cursor: 'default',
} as const;

// ── Internal tracking ────────────────────────────────────────────────

/** WeakSet of elements that currently have the blocker attached */
const _blockedElements = new WeakSet<HTMLElement>();

/** WeakMap storing the event listener references for cleanup */
const _listenerMap = new WeakMap<
  HTMLElement,
  Map<string, EventListener>
>();

// ── Core event suppressor ────────────────────────────────────────────

/**
 * Event handler that stops propagation and prevents default for all
 * blocked event types. Captures phase ensures we intercept before
 * any other handlers.
 */
function suppressEvent(event: Event): void {
  event.stopPropagation();
  event.stopImmediatePropagation();
  event.preventDefault();
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Attach the interaction blocker to a Wardley Map block element.
 *
 * This adds capturing-phase event listeners that suppress all user
 * interactions, applies the disabled CSS class, and sets inline styles
 * to prevent pointer events.
 *
 * Safe to call multiple times — will no-op if already attached.
 *
 * @param element - The Wardley Map block host element
 */
export function attachBlocker(element: HTMLElement): void {
  if (_blockedElements.has(element)) {
    return; // Already blocked
  }

  // Register capturing-phase event listeners
  const listeners = new Map<string, EventListener>();
  for (const eventType of BLOCKED_EVENT_TYPES) {
    const listener = suppressEvent as EventListener;
    element.addEventListener(eventType, listener, { capture: true });
    listeners.set(eventType, listener);
  }
  _listenerMap.set(element, listeners);

  // Apply CSS class and inline styles
  element.classList.add(BLOCKED_CLASS);
  element.style.pointerEvents = BLOCKED_STYLES.pointerEvents;
  element.style.userSelect = BLOCKED_STYLES.userSelect;
  element.style.opacity = BLOCKED_STYLES.opacity;
  element.style.cursor = BLOCKED_STYLES.cursor;

  // Set ARIA attribute for accessibility
  element.setAttribute('aria-disabled', 'true');
  element.setAttribute('inert', '');

  _blockedElements.add(element);
}

/**
 * Detach the interaction blocker from a Wardley Map block element.
 *
 * Removes all capturing-phase event listeners, the disabled CSS class,
 * and resets inline styles.
 *
 * Safe to call multiple times — will no-op if not currently blocked.
 *
 * @param element - The Wardley Map block host element
 */
export function detachBlocker(element: HTMLElement): void {
  if (!_blockedElements.has(element)) {
    return; // Not blocked
  }

  // Remove capturing-phase event listeners
  const listeners = _listenerMap.get(element);
  if (listeners) {
    for (const [eventType, listener] of listeners) {
      element.removeEventListener(eventType, listener, { capture: true });
    }
    _listenerMap.delete(element);
  }

  // Remove CSS class and inline styles
  element.classList.remove(BLOCKED_CLASS);
  element.style.pointerEvents = '';
  element.style.userSelect = '';
  element.style.opacity = '';
  element.style.cursor = '';

  // Remove ARIA attributes
  element.removeAttribute('aria-disabled');
  element.removeAttribute('inert');

  _blockedElements.delete(element);
}

/**
 * Check whether the blocker is currently attached to an element.
 *
 * @param element - The element to check
 * @returns true if the blocker is active on this element
 */
export function isBlocked(element: HTMLElement): boolean {
  return _blockedElements.has(element);
}

/**
 * Synchronise the blocker state with the current feature flag value.
 *
 * Call this after each render or when the flag may have changed.
 * It will attach the blocker if the flag is OFF, or detach it if ON.
 *
 * @param element - The Wardley Map block host element
 * @returns true if the block is now disabled (blocker attached)
 */
export function syncBlockerState(element: HTMLElement): boolean {
  const enabled = isWardleyMapsEnabled();

  if (enabled) {
    detachBlocker(element);
    return false;
  } else {
    attachBlocker(element);
    return true;
  }
}

/**
 * Attach blockers to all Wardley Map block elements found in a
 * container (e.g., the Edgeless surface root). Useful for bulk
 * sync when the flag changes.
 *
 * @param container - The container element to search within
 * @param selector - CSS selector for Wardley Map blocks (default: 'wardley-map-block')
 * @returns Number of blocks that were processed
 */
export function syncAllBlockers(
  container: ParentNode,
  selector = 'wardley-map-block',
): number {
  const blocks = container.querySelectorAll<HTMLElement>(selector);
  let count = 0;
  for (const block of blocks) {
    syncBlockerState(block);
    count++;
  }
  return count;
}
