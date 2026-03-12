/**
 * Tests for wardley-map-workspace-init — auto-creation of default
 * workspace folders on feature flag activation.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  WARDLEY_MAPS_FOLDER_NAME,
  STUDIES_FOLDER_NAME,
  DEFAULT_WARDLEY_FOLDERS,
  ensureWardleyFolders,
  onWardleyMapsActivated,
  InMemoryFolderService,
} from './wardley-map-workspace-init.js';

describe('wardley-map-workspace-init', () => {
  let service: InMemoryFolderService;

  beforeEach(() => {
    service = new InMemoryFolderService();
  });

  // ── Constants ────────────────────────────────────────────────────

  describe('constants', () => {
    it('defines correct folder names', () => {
      expect(WARDLEY_MAPS_FOLDER_NAME).toBe('Wardley Maps');
      expect(STUDIES_FOLDER_NAME).toBe('Studies');
    });

    it('DEFAULT_WARDLEY_FOLDERS contains both folders', () => {
      expect(DEFAULT_WARDLEY_FOLDERS).toEqual([
        'Wardley Maps',
        'Studies',
      ]);
      expect(DEFAULT_WARDLEY_FOLDERS).toHaveLength(2);
    });
  });

  // ── ensureWardleyFolders ─────────────────────────────────────────

  describe('ensureWardleyFolders', () => {
    it('creates both folders when none exist', async () => {
      const result = await ensureWardleyFolders(service);

      expect(result.created).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
      expect(result.created[0].name).toBe('Wardley Maps');
      expect(result.created[1].name).toBe('Studies');
      expect(service.hasFolder('Wardley Maps')).toBe(true);
      expect(service.hasFolder('Studies')).toBe(true);
    });

    it('skips folders that already exist', async () => {
      // Pre-create "Wardley Maps"
      service.createFolder('Wardley Maps');

      const result = await ensureWardleyFolders(service);

      expect(result.created).toHaveLength(1);
      expect(result.created[0].name).toBe('Studies');
      expect(result.skipped).toEqual(['Wardley Maps']);
    });

    it('skips all folders if both already exist', async () => {
      service.createFolder('Wardley Maps');
      service.createFolder('Studies');

      const result = await ensureWardleyFolders(service);

      expect(result.created).toHaveLength(0);
      expect(result.skipped).toEqual(['Wardley Maps', 'Studies']);
    });

    it('is idempotent — calling twice creates folders only once', async () => {
      await ensureWardleyFolders(service);
      const result = await ensureWardleyFolders(service);

      expect(result.created).toHaveLength(0);
      expect(result.skipped).toHaveLength(2);
      expect(service.size).toBe(2);
    });

    it('created folders have correct metadata', async () => {
      const before = Date.now();
      const result = await ensureWardleyFolders(service);
      const after = Date.now();

      for (const folder of result.created) {
        expect(folder.id).toMatch(/^wardley-folder-\d+$/);
        expect(folder.createdBy).toBe('wardley-maps-init');
        expect(folder.createdAt).toBeGreaterThanOrEqual(before);
        expect(folder.createdAt).toBeLessThanOrEqual(after);
      }
    });

    it('assigns unique IDs to each folder', async () => {
      const result = await ensureWardleyFolders(service);
      const ids = result.created.map(f => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ── onWardleyMapsActivated ───────────────────────────────────────

  describe('onWardleyMapsActivated', () => {
    it('delegates to ensureWardleyFolders', async () => {
      const result = await onWardleyMapsActivated(service);

      expect(result.created).toHaveLength(2);
      expect(service.hasFolder('Wardley Maps')).toBe(true);
      expect(service.hasFolder('Studies')).toBe(true);
    });
  });

  // ── InMemoryFolderService ────────────────────────────────────────

  describe('InMemoryFolderService', () => {
    it('starts empty', () => {
      expect(service.listFolderNames()).toEqual([]);
      expect(service.size).toBe(0);
    });

    it('creates and lists folders', () => {
      service.createFolder('Test');
      expect(service.listFolderNames()).toEqual(['Test']);
      expect(service.hasFolder('Test')).toBe(true);
    });

    it('returns same ID for duplicate creates', () => {
      const id1 = service.createFolder('Test');
      const id2 = service.createFolder('Test');
      expect(id1).toBe(id2);
      expect(service.size).toBe(1);
    });

    it('clears all folders', () => {
      service.createFolder('A');
      service.createFolder('B');
      service.clear();
      expect(service.size).toBe(0);
    });
  });
});
