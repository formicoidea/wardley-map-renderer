/**
 * wardley-map-page-link.ts — Page link service for Wardley Map blocks.
 *
 * Sub-AC 4 of US1: Each Wardley Map block can be associated with an
 * AFFiNE page. Clicking/interacting with the map block navigates to
 * or references the linked page.
 *
 * In the AFFiNE monorepo, page navigation would go through the
 * workspace's page/doc service (e.g., `WorkspaceService.openDoc()`).
 * This spike models the same interface so the integration path is clear.
 *
 * @module wardley-map-page-link
 */

// ── Types ─────────────────────────────────────────────────────────────

/** Minimal page reference for linking */
export interface LinkedPageRef {
  /** AFFiNE page/doc ID */
  readonly pageId: string;
  /** Display title (cached for UI, may be stale) */
  readonly title: string;
}

/** Event detail emitted when the user requests page navigation */
export interface PageNavigationDetail {
  /** The Wardley Map block ID that initiated navigation */
  readonly mapBlockId: string;
  /** Target page ID to navigate to */
  readonly targetPageId: string;
  /** How navigation was triggered */
  readonly trigger: 'double-click' | 'link-icon' | 'context-menu';
}

/** Event detail emitted when a page link is changed */
export interface PageLinkChangeDetail {
  /** The Wardley Map block ID */
  readonly mapBlockId: string;
  /** Previous page ID (null if no previous link) */
  readonly previousPageId: string | null;
  /** New page ID (null if link is being removed) */
  readonly newPageId: string | null;
}

// ── Custom event names ────────────────────────────────────────────────

/** Fired when the user wants to navigate to the linked page */
export const WARDLEY_MAP_NAVIGATE_EVENT = 'wardley-map-navigate' as const;

/** Fired when a page link is set, changed, or removed */
export const WARDLEY_MAP_LINK_CHANGE_EVENT = 'wardley-map-link-change' as const;

// ── Page navigation service interface ─────────────────────────────────
//
// In the AFFiNE monorepo this would be the workspace's page/doc service.
// We define a minimal interface so the navigation logic is testable.

export interface PageNavigationService {
  /** Navigate to a page by ID. Returns true if navigation succeeded. */
  navigateToPage(pageId: string): boolean | Promise<boolean>;

  /** Resolve a page ID to its current title (for display). */
  getPageTitle(pageId: string): string | null | Promise<string | null>;

  /** Check if a page exists. */
  pageExists(pageId: string): boolean | Promise<boolean>;
}

// ── Event factory helpers ─────────────────────────────────────────────

/** Create a navigate-to-page custom event */
export function createNavigateEvent(
  detail: PageNavigationDetail,
): CustomEvent<PageNavigationDetail> {
  return new CustomEvent(WARDLEY_MAP_NAVIGATE_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

/** Create a link-change custom event */
export function createLinkChangeEvent(
  detail: PageLinkChangeDetail,
): CustomEvent<PageLinkChangeDetail> {
  return new CustomEvent(WARDLEY_MAP_LINK_CHANGE_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

// ── In-memory spike implementation ────────────────────────────────────
//
// For spike/demo purposes only. In the real AFFiNE integration, the
// PageNavigationService would be provided by the workspace module.

export class InMemoryPageNavigationService implements PageNavigationService {
  private readonly _pages = new Map<string, string>(); // id → title
  private _lastNavigatedTo: string | null = null;

  /** Register a page (test/demo helper) */
  registerPage(pageId: string, title: string): void {
    this._pages.set(pageId, title);
  }

  /** Remove a page (test/demo helper) */
  removePage(pageId: string): void {
    this._pages.delete(pageId);
  }

  /** Get the last navigated-to page ID (test helper) */
  get lastNavigatedTo(): string | null {
    return this._lastNavigatedTo;
  }

  navigateToPage(pageId: string): boolean {
    if (!this._pages.has(pageId)) {
      console.warn(
        `[WardleyMap] Cannot navigate: page "${pageId}" not found.`,
      );
      return false;
    }
    this._lastNavigatedTo = pageId;
    console.log(
      `[WardleyMap] Navigated to page "${pageId}" (${this._pages.get(pageId)})`,
    );
    return true;
  }

  getPageTitle(pageId: string): string | null {
    return this._pages.get(pageId) ?? null;
  }

  pageExists(pageId: string): boolean {
    return this._pages.has(pageId);
  }

  /** Reset state (test helper) */
  clear(): void {
    this._pages.clear();
    this._lastNavigatedTo = null;
  }
}
