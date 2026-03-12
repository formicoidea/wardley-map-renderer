/**
 * wardley-map-context-menu.test.ts — Unit tests for context menu component.
 */

import { describe, it, expect } from 'vitest';

import {
  WARDLEY_MAP_OPEN_SETTINGS_EVENT,
  createOpenSettingsEvent,
  getWardleyMapContextMenuItems,
} from './wardley-map-context-menu.js';

import { WARDLEY_MAP_FLAVOUR } from './wardley-map-consts.js';

// ── Pure function tests ──────────────────────────────────────────────

describe('getWardleyMapContextMenuItems', () => {
  it('returns a settings menu item for affine:wardley-map flavour', () => {
    const onOpen = (id: string) => {};
    const items = getWardleyMapContextMenuItems(WARDLEY_MAP_FLAVOUR, 'block-1', onOpen);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('wardley-map-settings');
    expect(items[0].label).toBe('Wardley Map Settings');
    expect(items[0].icon).toBe('settings');
  });

  it('returns empty array for non-wardley-map flavour', () => {
    const items = getWardleyMapContextMenuItems('affine:note', 'block-1', () => {});
    expect(items).toHaveLength(0);
  });

  it('calls onOpenSettings with the correct blockId when action is invoked', () => {
    let capturedId = '';
    const items = getWardleyMapContextMenuItems(WARDLEY_MAP_FLAVOUR, 'block-42', (id) => {
      capturedId = id;
    });
    items[0].action();
    expect(capturedId).toBe('block-42');
  });
});

describe('createOpenSettingsEvent', () => {
  it('creates a CustomEvent with correct type and detail', () => {
    const event = createOpenSettingsEvent({ blockId: 'block-99' });
    expect(event.type).toBe(WARDLEY_MAP_OPEN_SETTINGS_EVENT);
    expect(event.detail.blockId).toBe('block-99');
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });
});

describe('WARDLEY_MAP_OPEN_SETTINGS_EVENT', () => {
  it('has the expected event name', () => {
    expect(WARDLEY_MAP_OPEN_SETTINGS_EVENT).toBe('wardley-map-open-settings');
  });
});
