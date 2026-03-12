/**
 * wardley-map-defaults-service.ts — Workspace-level default settings for new Wardley Maps.
 *
 * Sub-AC 3 of AC 7 (US1): Provides a service that stores configurable defaults
 * applied to every newly created Wardley Map block. When a user changes overlay
 * toggles, axis labels, or phase labels, those preferences are persisted here
 * and carried forward to the next `insertWardleyMap()` call.
 *
 * In the AFFiNE monorepo this would be backed by the workspace's
 * settings store (e.g. `WorkspacePropertiesAdapter`). Here we model
 * an in-memory service with change notification for spike validation.
 *
 * @module wardley-map-defaults-service
 */

import {
  type WardleyMapBlockProps,
  type WardleyMapToggles,
  type PhaseLabels,
  type EvolutionPhaseRatios,
  DEFAULT_WARDLEY_MAP_TOGGLES,
  DEFAULT_PHASE_LABELS,
  defaultWardleyMapBlockProps,
} from './wardley-map-schema.js';

import {
  WARDLEY_MAP_DEFAULT_WIDTH,
  WARDLEY_MAP_DEFAULT_HEIGHT,
  DEFAULT_X_AXIS_LABEL,
  DEFAULT_Y_AXIS_LABEL,
} from './wardley-map-consts.js';

// ── Types ─────────────────────────────────────────────────────────────

/**
 * Subset of WardleyMapBlockProps that can be configured as workspace defaults.
 * Excludes per-instance properties like xywh, linkedPageId, title, subtitle.
 */
export interface WardleyMapDefaults {
  /** Default toggle states for overlay layers */
  readonly toggles: Readonly<WardleyMapToggles>;

  /** Default phase labels */
  readonly phaseLabels: Readonly<PhaseLabels>;

  /** Default evolution phase boundary ratios */
  readonly evolutionPhaseRatios: Readonly<EvolutionPhaseRatios>;

  /** Default X-axis label */
  readonly xAxisLabel: string;

  /** Default Y-axis label */
  readonly yAxisLabel: string;

  /** Default width in canvas units */
  readonly width: number;

  /** Default height in canvas units */
  readonly height: number;
}

/** Callback type for defaults change listeners */
export type DefaultsChangeListener = (defaults: WardleyMapDefaults) => void;

// ── Event types ───────────────────────────────────────────────────────

/** Event name dispatched when workspace defaults change */
export const WARDLEY_MAP_DEFAULTS_CHANGE_EVENT = 'wardley-map-defaults-change' as const;

/** Detail payload for defaults change events */
export interface DefaultsChangeDetail {
  /** The full current defaults after the change */
  readonly defaults: WardleyMapDefaults;
  /** Which keys were changed (for selective update) */
  readonly changedKeys: ReadonlyArray<keyof WardleyMapDefaults>;
}

/** Create a defaults-change custom event */
export function createDefaultsChangeEvent(
  detail: DefaultsChangeDetail,
): CustomEvent<DefaultsChangeDetail> {
  return new CustomEvent(WARDLEY_MAP_DEFAULTS_CHANGE_EVENT, {
    detail,
    bubbles: true,
    composed: true,
  });
}

// ── Canonical defaults ────────────────────────────────────────────────

/** The factory defaults (not user-configured — these are the "reset" target) */
export const FACTORY_DEFAULTS: Readonly<WardleyMapDefaults> = {
  toggles: { ...DEFAULT_WARDLEY_MAP_TOGGLES },
  phaseLabels: { ...DEFAULT_PHASE_LABELS },
  evolutionPhaseRatios: {
    custom: defaultWardleyMapBlockProps.evolutionPhaseRatios.custom,
    product: defaultWardleyMapBlockProps.evolutionPhaseRatios.product,
    commodity: defaultWardleyMapBlockProps.evolutionPhaseRatios.commodity,
  },
  xAxisLabel: DEFAULT_X_AXIS_LABEL,
  yAxisLabel: DEFAULT_Y_AXIS_LABEL,
  width: WARDLEY_MAP_DEFAULT_WIDTH,
  height: WARDLEY_MAP_DEFAULT_HEIGHT,
} as const;

// ── Service interface ─────────────────────────────────────────────────

/**
 * Interface for workspace-level Wardley Map defaults management.
 *
 * Implementations back this with workspace properties in AFFiNE
 * or in-memory storage for the spike.
 */
export interface WardleyMapDefaultsService {
  /** Get the current workspace defaults */
  getDefaults(): WardleyMapDefaults;

  /** Update one or more default settings (partial merge) */
  updateDefaults(partial: Partial<WardleyMapDefaults>): void;

  /** Update a single toggle default */
  updateToggle(key: keyof WardleyMapToggles, value: boolean): void;

  /** Update phase labels defaults */
  updatePhaseLabels(labels: Partial<PhaseLabels>): void;

  /** Update axis label defaults */
  updateAxisLabel(axis: 'x' | 'y', label: string): void;

  /** Reset all defaults back to factory settings */
  resetToFactory(): void;

  /** Register a listener for defaults changes */
  onChange(listener: DefaultsChangeListener): () => void;
}

// ── Helper: apply defaults to block props ─────────────────────────────

/**
 * Apply workspace defaults to a set of block props.
 *
 * This merges the defaults into the canonical `defaultWardleyMapBlockProps`,
 * producing a new props object suitable for block creation.
 *
 * Per-instance overrides (title, subtitle, xywh, linkedPageId) are NOT
 * sourced from defaults — they come from the insert options.
 */
export function applyDefaultsToBlockProps(
  defaults: WardleyMapDefaults,
  overrides?: Partial<Pick<WardleyMapBlockProps, 'title' | 'subtitle' | 'xywh' | 'linkedPageId' | 'width' | 'height'>>,
): WardleyMapBlockProps {
  return {
    ...defaultWardleyMapBlockProps,
    // Workspace defaults
    ...defaults.toggles,
    phaseLabels: { ...defaults.phaseLabels },
    evolutionPhaseRatios: { ...defaults.evolutionPhaseRatios },
    xAxisLabel: defaults.xAxisLabel,
    yAxisLabel: defaults.yAxisLabel,
    width: defaults.width,
    height: defaults.height,
    // Per-instance overrides
    ...(overrides ?? {}),
  };
}

// ── In-memory implementation ──────────────────────────────────────────

/**
 * In-memory implementation of the defaults service.
 *
 * For the spike, defaults are stored in memory. In the AFFiNE monorepo,
 * this would be backed by WorkspacePropertiesAdapter or a similar
 * persistent store.
 */
export class InMemoryDefaultsService implements WardleyMapDefaultsService {
  private _defaults: WardleyMapDefaults;
  private readonly _listeners = new Set<DefaultsChangeListener>();

  constructor(initial?: Partial<WardleyMapDefaults>) {
    this._defaults = {
      ...FACTORY_DEFAULTS,
      ...(initial ?? {}),
      toggles: {
        ...FACTORY_DEFAULTS.toggles,
        ...(initial?.toggles ?? {}),
      },
      phaseLabels: {
        ...FACTORY_DEFAULTS.phaseLabels,
        ...(initial?.phaseLabels ?? {}),
      },
      evolutionPhaseRatios: {
        ...FACTORY_DEFAULTS.evolutionPhaseRatios,
        ...(initial?.evolutionPhaseRatios ?? {}),
      },
    };
  }

  getDefaults(): WardleyMapDefaults {
    return { ...this._defaults };
  }

  updateDefaults(partial: Partial<WardleyMapDefaults>): void {
    const changedKeys: (keyof WardleyMapDefaults)[] = [];

    if (partial.toggles !== undefined) {
      this._defaults = {
        ...this._defaults,
        toggles: { ...this._defaults.toggles, ...partial.toggles },
      };
      changedKeys.push('toggles');
    }
    if (partial.phaseLabels !== undefined) {
      this._defaults = {
        ...this._defaults,
        phaseLabels: { ...this._defaults.phaseLabels, ...partial.phaseLabels },
      };
      changedKeys.push('phaseLabels');
    }
    if (partial.evolutionPhaseRatios !== undefined) {
      this._defaults = {
        ...this._defaults,
        evolutionPhaseRatios: {
          ...this._defaults.evolutionPhaseRatios,
          ...partial.evolutionPhaseRatios,
        },
      };
      changedKeys.push('evolutionPhaseRatios');
    }
    if (partial.xAxisLabel !== undefined) {
      this._defaults = { ...this._defaults, xAxisLabel: partial.xAxisLabel };
      changedKeys.push('xAxisLabel');
    }
    if (partial.yAxisLabel !== undefined) {
      this._defaults = { ...this._defaults, yAxisLabel: partial.yAxisLabel };
      changedKeys.push('yAxisLabel');
    }
    if (partial.width !== undefined) {
      this._defaults = { ...this._defaults, width: partial.width };
      changedKeys.push('width');
    }
    if (partial.height !== undefined) {
      this._defaults = { ...this._defaults, height: partial.height };
      changedKeys.push('height');
    }

    if (changedKeys.length > 0) {
      this._notifyListeners(changedKeys);
    }
  }

  updateToggle(key: keyof WardleyMapToggles, value: boolean): void {
    this._defaults = {
      ...this._defaults,
      toggles: { ...this._defaults.toggles, [key]: value },
    };
    this._notifyListeners(['toggles']);
  }

  updatePhaseLabels(labels: Partial<PhaseLabels>): void {
    this._defaults = {
      ...this._defaults,
      phaseLabels: { ...this._defaults.phaseLabels, ...labels },
    };
    this._notifyListeners(['phaseLabels']);
  }

  updateAxisLabel(axis: 'x' | 'y', label: string): void {
    if (axis === 'x') {
      this._defaults = { ...this._defaults, xAxisLabel: label };
      this._notifyListeners(['xAxisLabel']);
    } else {
      this._defaults = { ...this._defaults, yAxisLabel: label };
      this._notifyListeners(['yAxisLabel']);
    }
  }

  resetToFactory(): void {
    this._defaults = { ...FACTORY_DEFAULTS };
    this._notifyListeners([
      'toggles',
      'phaseLabels',
      'evolutionPhaseRatios',
      'xAxisLabel',
      'yAxisLabel',
      'width',
      'height',
    ]);
  }

  onChange(listener: DefaultsChangeListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /** Number of registered listeners (test helper) */
  get listenerCount(): number {
    return this._listeners.size;
  }

  private _notifyListeners(changedKeys: (keyof WardleyMapDefaults)[]): void {
    const snapshot = this.getDefaults();
    for (const listener of this._listeners) {
      listener(snapshot);
    }
  }
}
