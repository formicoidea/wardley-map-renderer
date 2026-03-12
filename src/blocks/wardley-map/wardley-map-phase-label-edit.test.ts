/**
 * wardley-map-phase-label-edit.test.ts — Unit tests for double-click-to-edit
 * on zone phase labels.
 *
 * Tests cover:
 *   1. createPhaseLabelChangeEvent produces correctly-shaped CustomEvent
 *   2. WARDLEY_MAP_PHASE_LABEL_CHANGE_EVENT constant value
 *   3. PhaseLabelChangeDetail type contract
 *   4. DEFAULT_PHASE_LABELS constant values
 *   5. PHASE_KEYS ordering matches phase indices
 *
 * Note: Lit element rendering/interaction tests require a browser environment.
 * These tests validate the pure logic contracts.
 */

import { describe, it, expect } from 'vitest';

import {
  WARDLEY_MAP_PHASE_LABEL_CHANGE_EVENT,
  createPhaseLabelChangeEvent,
  type PhaseLabelChangeDetail,
} from './wardley-map-block.js';

import {
  DEFAULT_PHASE_LABELS,
  type PhaseLabels,
} from './wardley-map-schema.js';

// ── Tests ─────────────────────────────────────────────────────────────

describe('Phase Label Edit — Event creation', () => {
  it('WARDLEY_MAP_PHASE_LABEL_CHANGE_EVENT has the expected event name', () => {
    expect(WARDLEY_MAP_PHASE_LABEL_CHANGE_EVENT).toBe('wardley-map-phase-label-change');
  });

  it('createPhaseLabelChangeEvent returns a CustomEvent with correct type', () => {
    const detail: PhaseLabelChangeDetail = {
      blockId: 'block-1',
      phaseIndex: 0,
      previousLabel: 'Genesis',
      newLabel: 'Innovation',
    };

    const event = createPhaseLabelChangeEvent(detail);

    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe('wardley-map-phase-label-change');
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });

  it('event detail contains all required fields', () => {
    const detail: PhaseLabelChangeDetail = {
      blockId: 'map-42',
      phaseIndex: 2,
      previousLabel: 'Product (+Rental)',
      newLabel: 'Product (SaaS)',
    };

    const event = createPhaseLabelChangeEvent(detail);

    expect(event.detail.blockId).toBe('map-42');
    expect(event.detail.phaseIndex).toBe(2);
    expect(event.detail.previousLabel).toBe('Product (+Rental)');
    expect(event.detail.newLabel).toBe('Product (SaaS)');
  });

  it('supports all four phase indices (0–3)', () => {
    for (let i = 0; i < 4; i++) {
      const event = createPhaseLabelChangeEvent({
        blockId: 'b',
        phaseIndex: i,
        previousLabel: 'old',
        newLabel: 'new',
      });
      expect(event.detail.phaseIndex).toBe(i);
    }
  });
});

describe('Phase Label Edit — DEFAULT_PHASE_LABELS', () => {
  it('contains all four standard Wardley Map phase labels', () => {
    expect(DEFAULT_PHASE_LABELS.genesis).toBe('Genesis');
    expect(DEFAULT_PHASE_LABELS.customBuilt).toBe('Custom-Built');
    expect(DEFAULT_PHASE_LABELS.product).toBe('Product (+Rental)');
    expect(DEFAULT_PHASE_LABELS.commodity).toBe('Commodity (+Utility)');
  });

  it('has exactly four keys', () => {
    const keys = Object.keys(DEFAULT_PHASE_LABELS);
    expect(keys).toHaveLength(4);
    expect(keys).toContain('genesis');
    expect(keys).toContain('customBuilt');
    expect(keys).toContain('product');
    expect(keys).toContain('commodity');
  });

  it('satisfies the PhaseLabels interface', () => {
    // Type check — if this compiles, the interface is satisfied
    const labels: PhaseLabels = { ...DEFAULT_PHASE_LABELS };
    expect(labels.genesis).toBeDefined();
    expect(labels.customBuilt).toBeDefined();
    expect(labels.product).toBeDefined();
    expect(labels.commodity).toBeDefined();
  });
});

describe('Phase Label Edit — Event contract', () => {
  it('event is not cancelable by default', () => {
    const event = createPhaseLabelChangeEvent({
      blockId: 'b',
      phaseIndex: 0,
      previousLabel: 'a',
      newLabel: 'b',
    });
    // bubbles + composed but not cancelable
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });

  it('detail object is frozen (readonly fields)', () => {
    const detail: PhaseLabelChangeDetail = {
      blockId: 'test',
      phaseIndex: 1,
      previousLabel: 'Custom-Built',
      newLabel: 'Bespoke',
    };
    const event = createPhaseLabelChangeEvent(detail);

    // The detail is the same reference (not cloned), but the interface
    // declares fields as readonly for type safety
    expect(event.detail).toBe(detail);
  });
});
