/**
 * wardley-map-default-settings.ts — Default settings schema and state management
 * for Wardley Map components on the Edgeless Canvas.
 *
 * Manages three categories of defaults:
 *   1. **Default evolution** — x-axis position (0–1) for newly placed components
 *   2. **Default visibility** — y-axis position (0–1) for newly placed components
 *   3. **Default component style** — visual presentation (shape, color, size)
 *
 * These settings are persisted per-workspace via the edgeless settings
 * infrastructure.  The state manager emits change events so UI panels
 * and the canvas renderer stay in sync.
 *
 * Integrates with `wardley-map-overlay-settings.ts` (toggle panel) and
 * `wardley-map-settings-panel.ts` (feature flag panel) as part of the
 * unified settings surface.
 */

import {
  EVOLUTION_PHASE_CUSTOM,
  EVOLUTION_PHASE_PRODUCT,
} from './wardley-map-consts.js';

// ── Component shape enum ──────────────────────────────────────────

/**
 * Visual shapes available for Wardley Map components.
 * Each shape renders differently on the canvas.
 */
export type ComponentShape = 'circle' | 'square' | 'diamond' | 'pipeline';

/** All valid component shapes, useful for UI selectors */
export const COMPONENT_SHAPES: readonly ComponentShape[] = [
  'circle',
  'square',
  'diamond',
  'pipeline',
] as const;

// ── Component style interface ────────────────────────────────────

/**
 * Visual style properties for a Wardley Map component.
 * Applied as defaults when a new component is added to the map.
 */
export interface ComponentStyle {
  /** Shape of the component node */
  readonly shape: ComponentShape;

  /** Fill color (CSS color string) */
  readonly fillColor: string;

  /** Stroke/border color (CSS color string) */
  readonly strokeColor: string;

  /** Stroke width in canvas units */
  readonly strokeWidth: number;

  /** Component node radius/size in canvas units */
  readonly size: number;

  /** Font size for the component label (px) */
  readonly labelFontSize: number;

  /** Label color (CSS color string) */
  readonly labelColor: string;
}

/** Default component style — standard Wardley Map presentation */
export const DEFAULT_COMPONENT_STYLE: Readonly<ComponentStyle> = {
  shape: 'circle',
  fillColor: '#ffffff',
  strokeColor: '#1e1e1e',
  strokeWidth: 1.5,
  size: 8,
  labelFontSize: 12,
  labelColor: '#1e1e1e',
} as const;

// ── Default settings interface ───────────────────────────────────

/**
 * Complete set of default settings for a Wardley Map.
 * These control the initial state of newly placed components and
 * the map's default presentation.
 */
export interface WardleyMapDefaultSettings {
  /**
   * Default evolution position for new components (0–1).
   * 0 = Genesis (far left), 1 = Commodity (far right).
   * Default: midpoint of Custom-Built zone (~0.2875).
   */
  readonly defaultEvolution: number;

  /**
   * Default visibility position for new components (0–1).
   * 0 = Invisible (bottom), 1 = Visible (top).
   * Default: 0.5 (middle of the value chain).
   */
  readonly defaultVisibility: number;

  /**
   * Default visual style applied to newly created components.
   */
  readonly defaultComponentStyle: ComponentStyle;

  /**
   * Whether to snap new components to the nearest grid line.
   * When true, components are placed at the nearest 0.05 increment.
   */
  readonly snapToGrid: boolean;

  /**
   * Grid snap increment (0–1 range).
   * Only used when `snapToGrid` is true.
   */
  readonly gridSnapIncrement: number;
}

/** Default evolution: midpoint of Custom-Built zone */
export const DEFAULT_EVOLUTION =
  (EVOLUTION_PHASE_CUSTOM + EVOLUTION_PHASE_PRODUCT) / 2;

/** Default visibility: center of the value chain */
export const DEFAULT_VISIBILITY = 0.5;

/** Default grid snap increment */
export const DEFAULT_GRID_SNAP_INCREMENT = 0.05;

/** Canonical default settings object */
export const DEFAULT_WARDLEY_MAP_SETTINGS: Readonly<WardleyMapDefaultSettings> = {
  defaultEvolution: DEFAULT_EVOLUTION,
  defaultVisibility: DEFAULT_VISIBILITY,
  defaultComponentStyle: { ...DEFAULT_COMPONENT_STYLE },
  snapToGrid: true,
  gridSnapIncrement: DEFAULT_GRID_SNAP_INCREMENT,
} as const;

// ── Event types ──────────────────────────────────────────────────

/** Event name dispatched when any default setting changes */
export const WARDLEY_MAP_SETTINGS_CHANGE_EVENT = 'wardley-map-settings-change' as const;

/** Detail payload for settings change events */
export interface SettingsChangeDetail {
  /** The setting key path that changed (e.g. 'defaultEvolution', 'defaultComponentStyle.shape') */
  readonly key: string;
  /** The new value */
  readonly value: unknown;
  /** Full settings snapshot after the change */
  readonly settings: Readonly<WardleyMapDefaultSettings>;
}

/** Create a settings-change custom event */
export function createSettingsChangeEvent(
  detail: SettingsChangeDetail,
): CustomEvent<SettingsChangeDetail> {
  return new CustomEvent(WARDLEY_MAP_SETTINGS_CHANGE_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

// ── Validation helpers ───────────────────────────────────────────

/** Clamp a number to [0, 1] range */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Validate and clamp evolution value */
export function validateEvolution(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EVOLUTION;
  return clamp01(value);
}

/** Validate and clamp visibility value */
export function validateVisibility(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VISIBILITY;
  return clamp01(value);
}

/** Validate a component style, filling in defaults for missing/invalid fields */
export function validateComponentStyle(
  partial: Partial<ComponentStyle>,
): ComponentStyle {
  return {
    shape: COMPONENT_SHAPES.includes(partial.shape as ComponentShape)
      ? (partial.shape as ComponentShape)
      : DEFAULT_COMPONENT_STYLE.shape,
    fillColor: typeof partial.fillColor === 'string' && partial.fillColor.length > 0
      ? partial.fillColor
      : DEFAULT_COMPONENT_STYLE.fillColor,
    strokeColor: typeof partial.strokeColor === 'string' && partial.strokeColor.length > 0
      ? partial.strokeColor
      : DEFAULT_COMPONENT_STYLE.strokeColor,
    strokeWidth: Number.isFinite(partial.strokeWidth) && (partial.strokeWidth as number) > 0
      ? (partial.strokeWidth as number)
      : DEFAULT_COMPONENT_STYLE.strokeWidth,
    size: Number.isFinite(partial.size) && (partial.size as number) > 0
      ? (partial.size as number)
      : DEFAULT_COMPONENT_STYLE.size,
    labelFontSize: Number.isFinite(partial.labelFontSize) && (partial.labelFontSize as number) > 0
      ? (partial.labelFontSize as number)
      : DEFAULT_COMPONENT_STYLE.labelFontSize,
    labelColor: typeof partial.labelColor === 'string' && partial.labelColor.length > 0
      ? partial.labelColor
      : DEFAULT_COMPONENT_STYLE.labelColor,
  };
}

/**
 * Snap a value to the nearest grid increment.
 * Returns the value clamped to [0, 1] and rounded to the nearest increment.
 */
export function snapToGridValue(value: number, increment: number): number {
  const clamped = clamp01(value);
  if (!Number.isFinite(increment) || increment <= 0) return clamped;
  return Math.round(clamped / increment) * increment;
}

// ── Settings Manager ─────────────────────────────────────────────

/**
 * Listener callback for settings changes.
 */
export type SettingsChangeListener = (detail: SettingsChangeDetail) => void;

/**
 * WardleyMapSettingsManager — reactive state manager for Wardley Map defaults.
 *
 * Provides a single source of truth for default component placement and style.
 * Supports:
 *   - Get/set individual settings with validation
 *   - Subscribe to changes via listener callbacks
 *   - Snapshot/restore for undo/redo integration
 *   - Serialization to/from plain objects for persistence
 *
 * Usage:
 * ```ts
 * const manager = new WardleyMapSettingsManager();
 * manager.addListener((detail) => console.log('Changed:', detail.key));
 * manager.setEvolution(0.3);
 * ```
 */
export class WardleyMapSettingsManager {
  private _settings: WardleyMapDefaultSettings;
  private _listeners: Set<SettingsChangeListener> = new Set();

  constructor(initial?: Partial<WardleyMapDefaultSettings>) {
    this._settings = initial
      ? WardleyMapSettingsManager.merge(DEFAULT_WARDLEY_MAP_SETTINGS, initial)
      : { ...DEFAULT_WARDLEY_MAP_SETTINGS, defaultComponentStyle: { ...DEFAULT_COMPONENT_STYLE } };
  }

  // ── Accessors ────────────────────────────────────────────────────

  /** Current settings snapshot (frozen) */
  get settings(): Readonly<WardleyMapDefaultSettings> {
    return this._settings;
  }

  get defaultEvolution(): number {
    return this._settings.defaultEvolution;
  }

  get defaultVisibility(): number {
    return this._settings.defaultVisibility;
  }

  get defaultComponentStyle(): Readonly<ComponentStyle> {
    return this._settings.defaultComponentStyle;
  }

  get snapToGrid(): boolean {
    return this._settings.snapToGrid;
  }

  get gridSnapIncrement(): number {
    return this._settings.gridSnapIncrement;
  }

  // ── Mutators ─────────────────────────────────────────────────────

  /** Set the default evolution value (clamped to 0–1) */
  setEvolution(value: number): void {
    const validated = validateEvolution(value);
    if (validated === this._settings.defaultEvolution) return;
    this._settings = { ...this._settings, defaultEvolution: validated };
    this._notify('defaultEvolution', validated);
  }

  /** Set the default visibility value (clamped to 0–1) */
  setVisibility(value: number): void {
    const validated = validateVisibility(value);
    if (validated === this._settings.defaultVisibility) return;
    this._settings = { ...this._settings, defaultVisibility: validated };
    this._notify('defaultVisibility', validated);
  }

  /** Update the default component style (partial merge) */
  setComponentStyle(partial: Partial<ComponentStyle>): void {
    const merged = validateComponentStyle({
      ...this._settings.defaultComponentStyle,
      ...partial,
    });

    // Check if anything actually changed
    const current = this._settings.defaultComponentStyle;
    const changed = (Object.keys(merged) as (keyof ComponentStyle)[]).some(
      k => merged[k] !== current[k],
    );
    if (!changed) return;

    this._settings = { ...this._settings, defaultComponentStyle: merged };
    this._notify('defaultComponentStyle', merged);
  }

  /** Set the snap-to-grid flag */
  setSnapToGrid(enabled: boolean): void {
    if (enabled === this._settings.snapToGrid) return;
    this._settings = { ...this._settings, snapToGrid: enabled };
    this._notify('snapToGrid', enabled);
  }

  /** Set the grid snap increment */
  setGridSnapIncrement(increment: number): void {
    if (!Number.isFinite(increment) || increment <= 0) return;
    if (increment === this._settings.gridSnapIncrement) return;
    this._settings = { ...this._settings, gridSnapIncrement: increment };
    this._notify('gridSnapIncrement', increment);
  }

  /** Reset all settings to defaults */
  resetToDefaults(): void {
    this._settings = {
      ...DEFAULT_WARDLEY_MAP_SETTINGS,
      defaultComponentStyle: { ...DEFAULT_COMPONENT_STYLE },
    };
    this._notify('*', this._settings);
  }

  // ── Serialization ────────────────────────────────────────────────

  /** Export settings as a plain object for persistence */
  toJSON(): WardleyMapDefaultSettings {
    return {
      ...this._settings,
      defaultComponentStyle: { ...this._settings.defaultComponentStyle },
    };
  }

  /** Import settings from a plain object (with validation) */
  static fromJSON(data: Partial<WardleyMapDefaultSettings>): WardleyMapSettingsManager {
    return new WardleyMapSettingsManager(data);
  }

  /** Merge partial settings into a complete settings object */
  static merge(
    base: Readonly<WardleyMapDefaultSettings>,
    partial: Partial<WardleyMapDefaultSettings>,
  ): WardleyMapDefaultSettings {
    return {
      defaultEvolution: partial.defaultEvolution !== undefined
        ? validateEvolution(partial.defaultEvolution)
        : base.defaultEvolution,
      defaultVisibility: partial.defaultVisibility !== undefined
        ? validateVisibility(partial.defaultVisibility)
        : base.defaultVisibility,
      defaultComponentStyle: partial.defaultComponentStyle
        ? validateComponentStyle({ ...base.defaultComponentStyle, ...partial.defaultComponentStyle })
        : { ...base.defaultComponentStyle },
      snapToGrid: partial.snapToGrid !== undefined
        ? partial.snapToGrid
        : base.snapToGrid,
      gridSnapIncrement: partial.gridSnapIncrement !== undefined
          && Number.isFinite(partial.gridSnapIncrement)
          && partial.gridSnapIncrement > 0
        ? partial.gridSnapIncrement
        : base.gridSnapIncrement,
    };
  }

  // ── Computed helpers ─────────────────────────────────────────────

  /**
   * Compute the snapped evolution value for component placement.
   * If snap-to-grid is enabled, rounds to the nearest grid increment.
   */
  getSnappedEvolution(value?: number): number {
    const raw = value ?? this._settings.defaultEvolution;
    if (!this._settings.snapToGrid) return clamp01(raw);
    return snapToGridValue(raw, this._settings.gridSnapIncrement);
  }

  /**
   * Compute the snapped visibility value for component placement.
   * If snap-to-grid is enabled, rounds to the nearest grid increment.
   */
  getSnappedVisibility(value?: number): number {
    const raw = value ?? this._settings.defaultVisibility;
    if (!this._settings.snapToGrid) return clamp01(raw);
    return snapToGridValue(raw, this._settings.gridSnapIncrement);
  }

  // ── Listener management ──────────────────────────────────────────

  /** Subscribe to settings changes */
  addListener(listener: SettingsChangeListener): void {
    this._listeners.add(listener);
  }

  /** Unsubscribe from settings changes */
  removeListener(listener: SettingsChangeListener): void {
    this._listeners.delete(listener);
  }

  /** Remove all listeners */
  clearListeners(): void {
    this._listeners.clear();
  }

  /** Notify all listeners of a change */
  private _notify(key: string, value: unknown): void {
    const detail: SettingsChangeDetail = {
      key,
      value,
      settings: this._settings,
    };
    for (const listener of this._listeners) {
      listener(detail);
    }
  }
}
