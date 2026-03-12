/**
 * wardley-map-axis-label-edit.test.ts — Unit tests for double-click-to-edit
 * on axis labels (X-axis "Evolution" and Y-axis "Value Chain").
 *
 * Tests cover:
 *   1. createAxisLabelChangeEvent produces correctly-shaped CustomEvent
 *   2. WARDLEY_MAP_AXIS_LABEL_CHANGE_EVENT constant value
 *   3. AxisLabelChangeDetail type contract (axis, previousLabel, newLabel)
 *   4. Default axis label constants (DEFAULT_X_AXIS_LABEL, DEFAULT_Y_AXIS_LABEL)
 *   5. EditingAxis type exhaustiveness
 *
 * Note: Lit element rendering/interaction tests require a browser environment.
 * These tests validate the pure logic contracts.
 */

import { describe, it, expect } from 'vitest';

import {
  WARDLEY_MAP_AXIS_LABEL_CHANGE_EVENT,
  createAxisLabelChangeEvent,
  type AxisLabelChangeDetail,
  type EditingAxis,
} from './wardley-map-block.js';

import {
  DEFAULT_X_AXIS_LABEL,
  DEFAULT_Y_AXIS_LABEL,
} from './wardley-map-consts.js';

// ── Tests ─────────────────────────────────────────────────────────────

describe('Axis Label Edit — Event creation', () => {
  it('WARDLEY_MAP_AXIS_LABEL_CHANGE_EVENT has the expected event name', () => {
    expect(WARDLEY_MAP_AXIS_LABEL_CHANGE_EVENT).toBe('wardley-map-axis-label-change');
  });

  it('createAxisLabelChangeEvent returns a CustomEvent with correct type', () => {
    const detail: AxisLabelChangeDetail = {
      blockId: 'block-1',
      axis: 'x',
      previousLabel: 'Evolution',
      newLabel: 'Maturity',
    };

    const event = createAxisLabelChangeEvent(detail);

    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe('wardley-map-axis-label-change');
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });

  it('event detail contains all required fields for x-axis', () => {
    const detail: AxisLabelChangeDetail = {
      blockId: 'map-42',
      axis: 'x',
      previousLabel: 'Evolution',
      newLabel: 'Maturity',
    };

    const event = createAxisLabelChangeEvent(detail);

    expect(event.detail.blockId).toBe('map-42');
    expect(event.detail.axis).toBe('x');
    expect(event.detail.previousLabel).toBe('Evolution');
    expect(event.detail.newLabel).toBe('Maturity');
  });

  it('event detail contains all required fields for y-axis', () => {
    const detail: AxisLabelChangeDetail = {
      blockId: 'map-99',
      axis: 'y',
      previousLabel: 'Value Chain (Visibility)',
      newLabel: 'Supply Chain',
    };

    const event = createAxisLabelChangeEvent(detail);

    expect(event.detail.blockId).toBe('map-99');
    expect(event.detail.axis).toBe('y');
    expect(event.detail.previousLabel).toBe('Value Chain (Visibility)');
    expect(event.detail.newLabel).toBe('Supply Chain');
  });

  it('event detail preserves the exact strings provided', () => {
    const detail: AxisLabelChangeDetail = {
      blockId: '',
      axis: 'x',
      previousLabel: '',
      newLabel: 'Custom Label with special chars: é à ü',
    };

    const event = createAxisLabelChangeEvent(detail);

    expect(event.detail.newLabel).toBe('Custom Label with special chars: é à ü');
    expect(event.detail.blockId).toBe('');
    expect(event.detail.previousLabel).toBe('');
  });
});

describe('Axis Label Edit — Default constants', () => {
  it('DEFAULT_X_AXIS_LABEL is "Evolution"', () => {
    expect(DEFAULT_X_AXIS_LABEL).toBe('Evolution');
  });

  it('DEFAULT_Y_AXIS_LABEL is "Value Chain (Visibility)"', () => {
    expect(DEFAULT_Y_AXIS_LABEL).toBe('Value Chain (Visibility)');
  });
});

describe('Axis Label Edit — EditingAxis type', () => {
  it('accepts "x" as a valid axis', () => {
    const axis: EditingAxis = 'x';
    expect(axis).toBe('x');
  });

  it('accepts "y" as a valid axis', () => {
    const axis: EditingAxis = 'y';
    expect(axis).toBe('y');
  });

  it('accepts null as "no axis being edited"', () => {
    const axis: EditingAxis = null;
    expect(axis).toBeNull();
  });
});

describe('Axis Label Edit — Event contract edge cases', () => {
  it('changing from default to custom label', () => {
    const detail: AxisLabelChangeDetail = {
      blockId: 'test-block',
      axis: 'x',
      previousLabel: DEFAULT_X_AXIS_LABEL,
      newLabel: 'Technical Maturity',
    };

    const event = createAxisLabelChangeEvent(detail);
    expect(event.detail.previousLabel).toBe('Evolution');
    expect(event.detail.newLabel).toBe('Technical Maturity');
  });

  it('changing y-axis from default to custom label', () => {
    const detail: AxisLabelChangeDetail = {
      blockId: 'test-block',
      axis: 'y',
      previousLabel: DEFAULT_Y_AXIS_LABEL,
      newLabel: 'Strategic Importance',
    };

    const event = createAxisLabelChangeEvent(detail);
    expect(event.detail.previousLabel).toBe('Value Chain (Visibility)');
    expect(event.detail.newLabel).toBe('Strategic Importance');
  });

  it('multiple events can be created independently', () => {
    const event1 = createAxisLabelChangeEvent({
      blockId: 'b1',
      axis: 'x',
      previousLabel: 'A',
      newLabel: 'B',
    });

    const event2 = createAxisLabelChangeEvent({
      blockId: 'b2',
      axis: 'y',
      previousLabel: 'C',
      newLabel: 'D',
    });

    expect(event1.detail.blockId).toBe('b1');
    expect(event2.detail.blockId).toBe('b2');
    expect(event1.detail.axis).toBe('x');
    expect(event2.detail.axis).toBe('y');
  });
});
