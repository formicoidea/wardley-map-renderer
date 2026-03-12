/**
 * wardley-map-canvas-insert.test.ts — Tests for the canvas insert action.
 *
 * Sub-AC 3 of AC 4 (US1): Validates that the insert action correctly:
 *   1. Creates a new page with a Wardley Map block
 *   2. Inserts a surface reference on the canvas
 *   3. Links the block to the created page
 *   4. Respects custom options (title, position, size)
 *   5. Falls back to defaults when options are omitted
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  insertWardleyMap,
  InMemoryDocService,
  InMemorySurfaceService,
  resetSpikeIds,
  serializeXywh,
  createInsertRequestEvent,
  createInsertedEvent,
  registerInsertHandler,
  WARDLEY_MAP_INSERT_EVENT,
  WARDLEY_MAP_INSERTED_EVENT,
  type InsertWardleyMapOptions,
  type InsertWardleyMapResult,
  type InsertedDetail,
} from './wardley-map-canvas-insert.js';

import { createInsertEvent } from './wardley-map-toolbar-button.js';

import {
  WARDLEY_MAP_FLAVOUR,
  WARDLEY_MAP_DEFAULT_WIDTH,
  WARDLEY_MAP_DEFAULT_HEIGHT,
} from './wardley-map-consts.js';

describe('wardley-map-canvas-insert', () => {
  let docService: InMemoryDocService;
  let surfaceService: InMemorySurfaceService;

  beforeEach(() => {
    docService = new InMemoryDocService();
    surfaceService = new InMemorySurfaceService();
    resetSpikeIds();
  });

  // ── insertWardleyMap core flow ──────────────────────────────────────

  describe('insertWardleyMap', () => {
    it('creates a page and block with default options', async () => {
      const result = await insertWardleyMap(docService, surfaceService);

      expect(result.pageId).toBe('doc-wardley-1');
      expect(result.pageTitle).toBe('Untitled Wardley Map');
      expect(result.mapBlockId).toBe('block-wardley-1');
      expect(result.surfaceRefId).toBe('ref-wardley-1');
    });

    it('creates the doc in the doc service', async () => {
      const result = await insertWardleyMap(docService, surfaceService);

      expect(docService.size).toBe(1);
      const doc = docService.getDoc(result.pageId);
      expect(doc).toBeDefined();
      expect(doc!.title).toBe('Untitled Wardley Map');
    });

    it('adds a wardley-map block to the created doc', async () => {
      const result = await insertWardleyMap(docService, surfaceService);

      const doc = docService.getDoc(result.pageId);
      expect(doc!.blocks).toHaveLength(1);
      expect(doc!.blocks[0].flavour).toBe(WARDLEY_MAP_FLAVOUR);
      expect(doc!.blocks[0].id).toBe(result.mapBlockId);
    });

    it('inserts a surface reference on the canvas', async () => {
      const result = await insertWardleyMap(docService, surfaceService);

      expect(surfaceService.size).toBe(1);
      const ref = surfaceService.getRef(result.surfaceRefId);
      expect(ref).toBeDefined();
      expect(ref!.flavour).toBe(WARDLEY_MAP_FLAVOUR);
      expect(ref!.linkedPageId).toBe(result.pageId);
    });

    it('uses default position (0,0) when no viewport center', async () => {
      const result = await insertWardleyMap(docService, surfaceService);

      expect(result.position).toEqual({ x: 0, y: 0 });
    });

    it('uses viewport center when available', async () => {
      surfaceService.setViewportCenter({ x: 500, y: 300 });

      const result = await insertWardleyMap(docService, surfaceService);

      expect(result.position).toEqual({ x: 500, y: 300 });
    });

    it('centers the block on the given position', async () => {
      const result = await insertWardleyMap(docService, surfaceService, {
        position: { x: 800, y: 450 },
      });

      // Block should be centered: x - w/2, y - h/2
      const expectedX = 800 - WARDLEY_MAP_DEFAULT_WIDTH / 2;
      const expectedY = 450 - WARDLEY_MAP_DEFAULT_HEIGHT / 2;
      const expectedXywh = serializeXywh(
        expectedX,
        expectedY,
        WARDLEY_MAP_DEFAULT_WIDTH,
        WARDLEY_MAP_DEFAULT_HEIGHT,
      );

      const ref = surfaceService.getRef(result.surfaceRefId);
      expect(ref!.xywh).toBe(expectedXywh);
    });

    it('uses default 16:9 dimensions (1600x900)', async () => {
      const result = await insertWardleyMap(docService, surfaceService);

      expect(result.blockProps.width).toBe(1600);
      expect(result.blockProps.height).toBe(900);
    });

    it('sets linkedPageId to the created page', async () => {
      const result = await insertWardleyMap(docService, surfaceService);

      expect(result.blockProps.linkedPageId).toBe(result.pageId);
    });
  });

  // ── Custom options ──────────────────────────────────────────────────

  describe('custom options', () => {
    it('applies custom title', async () => {
      const result = await insertWardleyMap(docService, surfaceService, {
        title: 'Platform Strategy',
      });

      expect(result.pageTitle).toBe('Platform Strategy');
      expect(result.blockProps.title).toBe('Platform Strategy');

      const doc = docService.getDoc(result.pageId);
      expect(doc!.title).toBe('Platform Strategy');
    });

    it('applies custom subtitle', async () => {
      const result = await insertWardleyMap(docService, surfaceService, {
        subtitle: 'Q1 2026 analysis',
      });

      expect(result.blockProps.subtitle).toBe('Q1 2026 analysis');
    });

    it('applies custom dimensions', async () => {
      const result = await insertWardleyMap(docService, surfaceService, {
        width: 800,
        height: 450,
      });

      expect(result.blockProps.width).toBe(800);
      expect(result.blockProps.height).toBe(450);
    });

    it('applies custom position', async () => {
      const result = await insertWardleyMap(docService, surfaceService, {
        position: { x: 100, y: 200 },
      });

      expect(result.position).toEqual({ x: 100, y: 200 });
    });

    it('explicit position overrides viewport center', async () => {
      surfaceService.setViewportCenter({ x: 999, y: 999 });

      const result = await insertWardleyMap(docService, surfaceService, {
        position: { x: 100, y: 200 },
      });

      expect(result.position).toEqual({ x: 100, y: 200 });
    });

    it('preserves default evolution phase ratios', async () => {
      const result = await insertWardleyMap(docService, surfaceService);

      expect(result.blockProps.evolutionPhaseRatios).toEqual({
        custom: 0.175,
        product: 0.4,
        commodity: 0.7,
      });
    });
  });

  // ── Multiple inserts ────────────────────────────────────────────────

  describe('multiple inserts', () => {
    it('creates unique IDs for each insert', async () => {
      const result1 = await insertWardleyMap(docService, surfaceService, {
        title: 'Map A',
      });
      const result2 = await insertWardleyMap(docService, surfaceService, {
        title: 'Map B',
      });

      expect(result1.pageId).not.toBe(result2.pageId);
      expect(result1.mapBlockId).not.toBe(result2.mapBlockId);
      expect(result1.surfaceRefId).not.toBe(result2.surfaceRefId);
    });

    it('accumulates docs and refs', async () => {
      await insertWardleyMap(docService, surfaceService);
      await insertWardleyMap(docService, surfaceService);
      await insertWardleyMap(docService, surfaceService);

      expect(docService.size).toBe(3);
      expect(surfaceService.size).toBe(3);
    });
  });

  // ── serializeXywh ──────────────────────────────────────────────────

  describe('serializeXywh', () => {
    it('serializes to [x,y,w,h] format', () => {
      expect(serializeXywh(10, 20, 1600, 900)).toBe('[10,20,1600,900]');
    });

    it('handles negative coordinates', () => {
      expect(serializeXywh(-800, -450, 1600, 900)).toBe('[-800,-450,1600,900]');
    });

    it('handles zero values', () => {
      expect(serializeXywh(0, 0, 0, 0)).toBe('[0,0,0,0]');
    });
  });

  // ── Custom events ──────────────────────────────────────────────────

  describe('custom events', () => {
    it('creates insert request event with correct name', () => {
      const event = createInsertRequestEvent({ title: 'Test' });

      expect(event.type).toBe(WARDLEY_MAP_INSERT_EVENT);
      expect(event.type).toBe('wardley-map-insert');
      expect(event.bubbles).toBe(true);
      expect(event.composed).toBe(true);
    });

    it('creates insert request event with options in detail', () => {
      const options = { title: 'My Map', position: { x: 100, y: 200 } };
      const event = createInsertRequestEvent(options);

      expect(event.detail.options).toEqual(options);
    });

    it('creates insert request event with empty options by default', () => {
      const event = createInsertRequestEvent();

      expect(event.detail.options).toEqual({});
    });

    it('creates inserted confirmation event with correct name', async () => {
      const result = await insertWardleyMap(docService, surfaceService);
      const event = createInsertedEvent(result);

      expect(event.type).toBe(WARDLEY_MAP_INSERTED_EVENT);
      expect(event.type).toBe('wardley-map-inserted');
      expect(event.bubbles).toBe(true);
      expect(event.composed).toBe(true);
    });

    it('creates inserted event with result in detail', async () => {
      const result = await insertWardleyMap(docService, surfaceService);
      const event = createInsertedEvent(result);

      expect(event.detail.result).toEqual(result);
      expect(event.detail.result.pageId).toBeDefined();
      expect(event.detail.result.mapBlockId).toBeDefined();
    });
  });

  // ── InMemoryDocService ─────────────────────────────────────────────

  describe('InMemoryDocService', () => {
    it('creates docs with incremented IDs', () => {
      const id1 = docService.createDoc('A');
      const id2 = docService.createDoc('B');

      expect(id1).toBe('doc-wardley-1');
      expect(id2).toBe('doc-wardley-2');
    });

    it('adds blocks to existing docs', () => {
      const docId = docService.createDoc('Test');
      const blockId = docService.addBlock(docId, 'affine:wardley-map', { title: 'x' });

      expect(blockId).toBe('block-wardley-1');
      const doc = docService.getDoc(docId);
      expect(doc!.blocks[0].props.title).toBe('x');
    });

    it('throws when adding block to non-existent doc', () => {
      expect(() => docService.addBlock('no-such-doc', 'test', {})).toThrow(
        /not found/,
      );
    });

    it('getAllDocs returns all created docs', () => {
      docService.createDoc('A');
      docService.createDoc('B');

      expect(docService.getAllDocs()).toHaveLength(2);
    });

    it('clear resets state', () => {
      docService.createDoc('A');
      docService.clear();

      expect(docService.size).toBe(0);
    });
  });

  // ── InMemorySurfaceService ─────────────────────────────────────────

  describe('InMemorySurfaceService', () => {
    it('adds references with incremented IDs', () => {
      const id1 = surfaceService.addReference('test', 'page-1', '[0,0,100,100]');
      const id2 = surfaceService.addReference('test', 'page-2', '[0,0,100,100]');

      expect(id1).toBe('ref-wardley-1');
      expect(id2).toBe('ref-wardley-2');
    });

    it('stores reference props', () => {
      const id = surfaceService.addReference(
        WARDLEY_MAP_FLAVOUR,
        'page-1',
        '[0,0,1600,900]',
        { title: 'Test' },
      );

      const ref = surfaceService.getRef(id);
      expect(ref!.props.title).toBe('Test');
      expect(ref!.linkedPageId).toBe('page-1');
    });

    it('returns null viewport center by default', () => {
      expect(surfaceService.getViewportCenter()).toBeNull();
    });

    it('returns set viewport center', () => {
      surfaceService.setViewportCenter({ x: 400, y: 300 });
      expect(surfaceService.getViewportCenter()).toEqual({ x: 400, y: 300 });
    });

    it('clear resets state', () => {
      surfaceService.addReference('test', 'page-1', '[0,0,100,100]');
      surfaceService.clear();

      expect(surfaceService.size).toBe(0);
    });
  });

  // ── resetSpikeIds ──────────────────────────────────────────────────

  describe('resetSpikeIds', () => {
    it('resets all ID counters', async () => {
      // First insert
      await insertWardleyMap(docService, surfaceService);

      // Reset
      docService.clear();
      surfaceService.clear();
      resetSpikeIds();

      // Second insert should reuse IDs
      const result = await insertWardleyMap(docService, surfaceService);
      expect(result.pageId).toBe('doc-wardley-1');
      expect(result.mapBlockId).toBe('block-wardley-1');
      expect(result.surfaceRefId).toBe('ref-wardley-1');
    });
  });

  // ── registerInsertHandler ───────────────────────────────────────────

  describe('registerInsertHandler', () => {
    it('handles toolbar insert event and creates page + ref', async () => {
      const target = new EventTarget();
      let insertedResult: InsertWardleyMapResult | null = null;

      // Listen for the confirmation event
      target.addEventListener(WARDLEY_MAP_INSERTED_EVENT, ((e: Event) => {
        insertedResult = (e as CustomEvent<InsertedDetail>).detail.result;
      }) as EventListener);

      // Register the handler
      const cleanup = registerInsertHandler(docService, surfaceService, target);

      // Simulate toolbar button click
      const insertEvent = createInsertEvent();
      target.dispatchEvent(insertEvent);

      // Allow async handler to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(insertedResult).not.toBeNull();
      expect(insertedResult!.pageId).toBeDefined();
      expect(insertedResult!.mapBlockId).toBeDefined();
      expect(insertedResult!.surfaceRefId).toBeDefined();
      expect(docService.size).toBe(1);
      expect(surfaceService.size).toBe(1);

      cleanup();
    });

    it('stops handling after cleanup', async () => {
      const target = new EventTarget();
      const cleanup = registerInsertHandler(docService, surfaceService, target);

      // Cleanup immediately
      cleanup();

      // Dispatch event — should NOT be handled
      target.dispatchEvent(createInsertEvent());
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(docService.size).toBe(0);
      expect(surfaceService.size).toBe(0);
    });

    it('passes default options to insertWardleyMap', async () => {
      const target = new EventTarget();
      let insertedResult: InsertWardleyMapResult | null = null;

      target.addEventListener(WARDLEY_MAP_INSERTED_EVENT, ((e: Event) => {
        insertedResult = (e as CustomEvent<InsertedDetail>).detail.result;
      }) as EventListener);

      const cleanup = registerInsertHandler(docService, surfaceService, target, {
        title: 'Custom Default Title',
      });

      target.dispatchEvent(createInsertEvent());
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(insertedResult!.pageTitle).toBe('Custom Default Title');

      cleanup();
    });
  });
});
