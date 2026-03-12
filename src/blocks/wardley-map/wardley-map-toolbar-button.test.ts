/**
 * wardley-map-toolbar-button.test.ts — Unit tests for the toolbar button
 * feature flag integration and event creation.
 *
 * Tests cover:
 *   1. createInsertEvent produces correctly-shaped CustomEvent
 *   2. Feature flag controls visibility logic
 *   3. WARDLEY_MAP_INSERT_EVENT constant value
 *   4. WardleyMapInsertDetail type contract
 *
 * Note: Lit element rendering tests require a browser environment (jsdom +
 * @open-wc/testing). These tests validate the pure logic contracts. The
 * full Lit rendering is validated via demo.html in a real browser.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  setWardleyMapsEnabled,
  isWardleyMapsEnabled,
  ENABLE_WARDLEY_MAPS_FLAG,
} from './wardley-map-feature-flag.js';

import {
  WARDLEY_MAP_INSERT_EVENT,
  createInsertEvent,
  type WardleyMapInsertDetail,
} from './wardley-map-toolbar-button.js';

// ── Tests ─────────────────────────────────────────────────────────────

describe('WardleyMapToolbarButton — logic', () => {
  beforeEach(async () => {
    // Reset feature flag to default (OFF)
    await setWardleyMapsEnabled(false);
  });

  describe('feature flag integration', () => {
    it('should default to OFF (button hidden)', () => {
      expect(ENABLE_WARDLEY_MAPS_FLAG.defaultValue).toBe(false);
      // After reset, isWardleyMapsEnabled should be false
      expect(isWardleyMapsEnabled()).toBe(false);
    });

    it('should reflect ON state when flag is enabled', async () => {
      await setWardleyMapsEnabled(true);
      expect(isWardleyMapsEnabled()).toBe(true);
    });

    it('should reflect OFF state when flag is disabled', async () => {
      await setWardleyMapsEnabled(true);
      expect(isWardleyMapsEnabled()).toBe(true);

      await setWardleyMapsEnabled(false);
      expect(isWardleyMapsEnabled()).toBe(false);
    });

    it('should handle rapid toggle cycles correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await setWardleyMapsEnabled(true);
        expect(isWardleyMapsEnabled()).toBe(true);
        await setWardleyMapsEnabled(false);
        expect(isWardleyMapsEnabled()).toBe(false);
      }
    });
  });

  describe('createInsertEvent', () => {
    it('should return a CustomEvent with correct type', () => {
      const event = createInsertEvent();
      expect(event).toBeInstanceOf(CustomEvent);
      expect(event.type).toBe('wardley-map-insert');
    });

    it('should have source "toolbar-button" in detail', () => {
      const event = createInsertEvent();
      expect(event.detail.source).toBe('toolbar-button');
    });

    it('should bubble and be composed', () => {
      const event = createInsertEvent();
      expect(event.bubbles).toBe(true);
      expect(event.composed).toBe(true);
    });

    it('should match the WARDLEY_MAP_INSERT_EVENT constant', () => {
      const event = createInsertEvent();
      expect(event.type).toBe(WARDLEY_MAP_INSERT_EVENT);
    });
  });

  describe('WARDLEY_MAP_INSERT_EVENT', () => {
    it('should be "wardley-map-insert"', () => {
      expect(WARDLEY_MAP_INSERT_EVENT).toBe('wardley-map-insert');
    });
  });

  describe('WardleyMapInsertDetail type contract', () => {
    it('should satisfy the WardleyMapInsertDetail interface', () => {
      const detail: WardleyMapInsertDetail = { source: 'toolbar-button' };
      expect(detail.source).toBe('toolbar-button');
    });
  });

  describe('conditional visibility logic', () => {
    it('toolbar should be hidden when flag is OFF (simulated)', () => {
      // This simulates what the Lit element does in render()
      const visible = isWardleyMapsEnabled();
      expect(visible).toBe(false);
      // When visible is false, render() returns `nothing` — button is hidden
    });

    it('toolbar should be visible when flag is ON (simulated)', async () => {
      await setWardleyMapsEnabled(true);
      const visible = isWardleyMapsEnabled();
      expect(visible).toBe(true);
      // When visible is true, render() returns the button template
    });
  });
});
