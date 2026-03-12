/**
 * wardley-map-canvas-insert.ts — Insert action for Wardley Map blocks.
 *
 * Sub-AC 3 of AC 4 (US1): Implements the insert action that:
 *   1. Creates a new linked AFFiNE page (containing a Wardley Map block)
 *   2. Inserts a reference/embed of that page into the Edgeless canvas
 *
 * In the AFFiNE monorepo, page creation goes through the workspace's
 * doc service (e.g., `DocsService.createDoc()`), and surface insertion
 * goes through `SurfaceBlockModel.addElement()` or the Edgeless
 * controller's `addBlock()` API.
 *
 * This spike models the same interfaces so the integration path is clear.
 *
 * @module wardley-map-canvas-insert
 */

import {
  WARDLEY_MAP_FLAVOUR,
  WARDLEY_MAP_DEFAULT_WIDTH,
  WARDLEY_MAP_DEFAULT_HEIGHT,
} from './wardley-map-consts.js';
import { defaultWardleyMapBlockProps, type WardleyMapBlockProps } from './wardley-map-schema.js';
import {
  WARDLEY_MAP_INSERT_EVENT as TOOLBAR_INSERT_EVENT,
  type WardleyMapInsertDetail,
} from './wardley-map-toolbar-button.js';

// ── Types ─────────────────────────────────────────────────────────────

/** Position on the canvas surface (x, y) */
export interface CanvasPosition {
  readonly x: number;
  readonly y: number;
}

/** Options for creating a new Wardley Map on the canvas */
export interface InsertWardleyMapOptions {
  /** Position on the canvas (default: center of viewport or {x:0, y:0}) */
  readonly position?: CanvasPosition;
  /** Initial map title (default: "Untitled Wardley Map") */
  readonly title?: string;
  /** Initial map subtitle (default: empty) */
  readonly subtitle?: string;
  /** Width override (default: 1600) */
  readonly width?: number;
  /** Height override (default: 900) */
  readonly height?: number;
}

/** Result of a successful insert action */
export interface InsertWardleyMapResult {
  /** ID of the newly created page/doc */
  readonly pageId: string;
  /** Title of the created page */
  readonly pageTitle: string;
  /** ID of the Wardley Map block within the page */
  readonly mapBlockId: string;
  /** ID of the surface reference/embed element on the canvas */
  readonly surfaceRefId: string;
  /** Final position on the canvas */
  readonly position: CanvasPosition;
  /** Block props applied */
  readonly blockProps: WardleyMapBlockProps;
}

// ── Doc service interface ─────────────────────────────────────────────
//
// In AFFiNE this would be DocsService / WorkspaceService.

export interface DocService {
  /**
   * Create a new doc/page in the workspace.
   * Returns the new doc's ID.
   */
  createDoc(title: string): string | Promise<string>;

  /**
   * Add a block to an existing doc.
   * Returns the block ID within the doc.
   */
  addBlock(
    docId: string,
    flavour: string,
    props: Record<string, unknown>,
  ): string | Promise<string>;
}

// ── Surface service interface ─────────────────────────────────────────
//
// In AFFiNE this would be the SurfaceBlockModel or Edgeless controller.

export interface SurfaceService {
  /**
   * Add a reference/embed element to the canvas surface.
   * The `linkedPageId` points to the doc containing the Wardley Map block.
   * Returns the surface element ID.
   */
  addReference(
    flavour: string,
    linkedPageId: string,
    xywh: string,
    props?: Record<string, unknown>,
  ): string | Promise<string>;

  /**
   * Get the current viewport center (for default placement).
   * Returns null if viewport info is unavailable.
   */
  getViewportCenter(): CanvasPosition | null;
}

// ── Re-export the toolbar insert event for convenience ────────────────
//
// The toolbar button (`wardley-map-toolbar-button.ts`) dispatches
// `wardley-map-insert` when clicked. The canvas insert handler listens
// for this event and performs the actual page creation + surface insert.

export { TOOLBAR_INSERT_EVENT };

/** Re-export under canonical name for consumers who import from this module */
export const WARDLEY_MAP_INSERT_EVENT = TOOLBAR_INSERT_EVENT;

/** Detail for an insert request event (dispatched by toolbar or programmatic callers) */
export interface InsertRequestDetail {
  readonly options: InsertWardleyMapOptions;
}

/**
 * Create an insert request event.
 * This is the counterpart to the toolbar button's simpler `createInsertEvent`.
 * It carries full options (title, position, size) for programmatic callers.
 */
export function createInsertRequestEvent(
  options: InsertWardleyMapOptions = {},
): CustomEvent<InsertRequestDetail> {
  return new CustomEvent(WARDLEY_MAP_INSERT_EVENT, {
    detail: { options },
    bubbles: true,
    composed: true,
  });
}

/** Event name fired after a Wardley Map has been successfully inserted */
export const WARDLEY_MAP_INSERTED_EVENT = 'wardley-map-inserted' as const;

/** Detail payload for the inserted confirmation event */
export interface InsertedDetail {
  readonly result: InsertWardleyMapResult;
}

/** Create an inserted confirmation event */
export function createInsertedEvent(
  result: InsertWardleyMapResult,
): CustomEvent<InsertedDetail> {
  return new CustomEvent(WARDLEY_MAP_INSERTED_EVENT, {
    detail: { result },
    bubbles: true,
    composed: true,
  });
}

// ── xywh serialization helper ─────────────────────────────────────────

/** Serialize position + dimensions to the "[x,y,w,h]" format used by BlockSuite */
export function serializeXywh(
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  return `[${x},${y},${w},${h}]`;
}

// ── Insert action ─────────────────────────────────────────────────────

/**
 * Default position used when no position is provided and viewport center
 * is unavailable.
 */
const DEFAULT_POSITION: CanvasPosition = { x: 0, y: 0 };

/**
 * Insert a new Wardley Map onto the Edgeless canvas.
 *
 * This is the main action entry point. It:
 *   1. Creates a new AFFiNE page/doc with a Wardley Map block
 *   2. Inserts a surface reference/embed pointing to that page
 *   3. Returns the result with all created IDs
 *
 * In the AFFiNE monorepo, this function would be called from:
 *   - The Edgeless toolbar "Add Wardley Map" button
 *   - A context menu action
 *   - A slash command
 *
 * @param docService   - Service to create pages and add blocks
 * @param surfaceService - Service to add elements to the canvas surface
 * @param options      - Optional overrides for title, position, size
 * @returns Result containing all created IDs and final props
 *
 * @example
 * ```ts
 * const result = await insertWardleyMap(docService, surfaceService, {
 *   title: 'Platform Strategy',
 *   position: { x: 200, y: 100 },
 * });
 * console.log(`Created page: ${result.pageId}, block: ${result.mapBlockId}`);
 * ```
 */
export async function insertWardleyMap(
  docService: DocService,
  surfaceService: SurfaceService,
  options: InsertWardleyMapOptions = {},
): Promise<InsertWardleyMapResult> {
  const title = options.title || 'Untitled Wardley Map';
  const subtitle = options.subtitle || '';
  const width = options.width ?? WARDLEY_MAP_DEFAULT_WIDTH;
  const height = options.height ?? WARDLEY_MAP_DEFAULT_HEIGHT;

  // Determine placement position
  const position =
    options.position ??
    surfaceService.getViewportCenter() ??
    DEFAULT_POSITION;

  // Center the block on the position (so the position is the block center)
  const blockX = position.x - width / 2;
  const blockY = position.y - height / 2;
  const xywh = serializeXywh(blockX, blockY, width, height);

  // Build block props
  const blockProps: WardleyMapBlockProps = {
    ...defaultWardleyMapBlockProps,
    title,
    subtitle,
    width,
    height,
    xywh,
    linkedPageId: null, // will be set after page creation
  };

  // Step 1: Create a new page/doc in the workspace
  const pageId = await docService.createDoc(title);

  // Step 2: Add the Wardley Map block to the new page
  const mapBlockId = await docService.addBlock(
    pageId,
    WARDLEY_MAP_FLAVOUR,
    blockProps as unknown as Record<string, unknown>,
  );

  // Step 3: Update the block's linkedPageId to point to the created page
  //         (self-referential: the block links back to the page it's in)
  const linkedProps: WardleyMapBlockProps = {
    ...blockProps,
    linkedPageId: pageId,
  };

  // Step 4: Insert a surface reference on the canvas
  const surfaceRefId = await surfaceService.addReference(
    WARDLEY_MAP_FLAVOUR,
    pageId,
    xywh,
    { title, subtitle },
  );

  return {
    pageId,
    pageTitle: title,
    mapBlockId,
    surfaceRefId,
    position,
    blockProps: linkedProps,
  };
}

// ── Event handler: toolbar button → insert action ─────────────────────

/**
 * Create a handler that listens for the toolbar button's `wardley-map-insert`
 * event and performs the full insert action (page creation + surface embed).
 *
 * Returns a cleanup function to remove the listener.
 *
 * Usage (in the Edgeless surface host or app shell):
 * ```ts
 * const cleanup = registerInsertHandler(docService, surfaceService, document);
 * // ... later, on teardown:
 * cleanup();
 * ```
 *
 * When the toolbar button is clicked:
 *   1. `wardley-map-insert` event bubbles up to the target
 *   2. Handler calls `insertWardleyMap(...)` with services
 *   3. On success, dispatches `wardley-map-inserted` on the target
 *
 * @param docService     - Workspace doc/page service
 * @param surfaceService - Canvas surface service
 * @param target         - Event target to listen on (default: document)
 * @param options        - Default insert options (can be overridden per-event)
 * @returns Cleanup function to remove the event listener
 */
export function registerInsertHandler(
  docService: DocService,
  surfaceService: SurfaceService,
  target: EventTarget = document,
  options: InsertWardleyMapOptions = {},
): () => void {
  const handler = async (event: Event): Promise<void> => {
    // The toolbar button event carries { source: 'toolbar-button' }
    const _detail = (event as CustomEvent<WardleyMapInsertDetail>).detail;

    try {
      const result = await insertWardleyMap(docService, surfaceService, options);

      // Dispatch confirmation event
      target.dispatchEvent(createInsertedEvent(result));

      console.log(
        `[WardleyMap] Inserted map: page="${result.pageId}", ` +
        `block="${result.mapBlockId}", ref="${result.surfaceRefId}"`,
      );
    } catch (err) {
      console.error('[WardleyMap] Insert failed:', err);
    }
  };

  target.addEventListener(TOOLBAR_INSERT_EVENT, handler);

  // Return cleanup function
  return () => {
    target.removeEventListener(TOOLBAR_INSERT_EVENT, handler);
  };
}

// ── In-memory spike implementations ───────────────────────────────────
//
// For spike/demo purposes only. In the real AFFiNE integration, these
// would be provided by the workspace and edgeless controller modules.

let _nextDocId = 1;
let _nextBlockId = 1;
let _nextRefId = 1;

function generateDocId(): string {
  return `doc-wardley-${_nextDocId++}`;
}

function generateBlockId(): string {
  return `block-wardley-${_nextBlockId++}`;
}

function generateRefId(): string {
  return `ref-wardley-${_nextRefId++}`;
}

/** In-memory page/block store for spike */
export interface SpikeDocEntry {
  readonly id: string;
  readonly title: string;
  readonly blocks: Array<{
    readonly id: string;
    readonly flavour: string;
    readonly props: Record<string, unknown>;
  }>;
}

export class InMemoryDocService implements DocService {
  private readonly _docs = new Map<string, SpikeDocEntry>();

  createDoc(title: string): string {
    const id = generateDocId();
    this._docs.set(id, { id, title, blocks: [] });
    return id;
  }

  addBlock(
    docId: string,
    flavour: string,
    props: Record<string, unknown>,
  ): string {
    const doc = this._docs.get(docId);
    if (!doc) {
      throw new Error(`[WardleyMap] Doc "${docId}" not found.`);
    }
    const blockId = generateBlockId();
    // Mutable push on the readonly array (spike only)
    (doc.blocks as Array<{ id: string; flavour: string; props: Record<string, unknown> }>)
      .push({ id: blockId, flavour, props });
    return blockId;
  }

  /** Get a doc by ID (test/debug helper) */
  getDoc(docId: string): SpikeDocEntry | undefined {
    return this._docs.get(docId);
  }

  /** Get all docs (test/debug helper) */
  getAllDocs(): SpikeDocEntry[] {
    return [...this._docs.values()];
  }

  /** Total doc count (test helper) */
  get size(): number {
    return this._docs.size;
  }

  /** Reset state (test helper) */
  clear(): void {
    this._docs.clear();
    _nextDocId = 1;
    _nextBlockId = 1;
  }
}

/** In-memory surface reference store for spike */
export interface SpikeSurfaceRef {
  readonly id: string;
  readonly flavour: string;
  readonly linkedPageId: string;
  readonly xywh: string;
  readonly props: Record<string, unknown>;
}

export class InMemorySurfaceService implements SurfaceService {
  private readonly _refs = new Map<string, SpikeSurfaceRef>();
  private _viewportCenter: CanvasPosition | null = null;

  addReference(
    flavour: string,
    linkedPageId: string,
    xywh: string,
    props: Record<string, unknown> = {},
  ): string {
    const id = generateRefId();
    this._refs.set(id, { id, flavour, linkedPageId, xywh, props });
    return id;
  }

  getViewportCenter(): CanvasPosition | null {
    return this._viewportCenter;
  }

  /** Set viewport center (test/demo helper) */
  setViewportCenter(center: CanvasPosition | null): void {
    this._viewportCenter = center;
  }

  /** Get a reference by ID (test/debug helper) */
  getRef(refId: string): SpikeSurfaceRef | undefined {
    return this._refs.get(refId);
  }

  /** Get all references (test/debug helper) */
  getAllRefs(): SpikeSurfaceRef[] {
    return [...this._refs.values()];
  }

  /** Total reference count (test helper) */
  get size(): number {
    return this._refs.size;
  }

  /** Reset state (test helper) */
  clear(): void {
    this._refs.clear();
    _nextRefId = 1;
  }
}

/**
 * Reset all spike ID counters (test helper).
 * Call between test runs to ensure deterministic IDs.
 */
export function resetSpikeIds(): void {
  _nextDocId = 1;
  _nextBlockId = 1;
  _nextRefId = 1;
}
