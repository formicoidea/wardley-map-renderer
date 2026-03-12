/**
 * Feature flag for Wardley Maps.
 *
 * In the AFFiNE monorepo this would be registered via:
 *   runtimeConfig.enableWardleyMaps
 *
 * Spike: simple boolean flag with category metadata.
 *
 * When the flag transitions from OFF → ON, `onWardleyMapsActivated` is
 * called to auto-create default workspace folders ("Wardley Maps",
 * "Studies") if they don't already exist.
 */

import type { WorkspaceFolderService } from './wardley-map-workspace-init.js';
import { onWardleyMapsActivated } from './wardley-map-workspace-init.js';

export interface FeatureFlagDescriptor {
  readonly name: string;
  readonly category: string;
  readonly configurable: boolean;
  readonly defaultValue: boolean;
  readonly description: string;
}

export const ENABLE_WARDLEY_MAPS_FLAG: FeatureFlagDescriptor = {
  name: 'enable_wardley_maps',
  category: 'blocksuite',
  configurable: true,
  defaultValue: false,
  description:
    'Enables Wardley Map blocks in the Edgeless Canvas. ' +
    'When false, all Wardley Map UI is hidden.',
};

// ── Activation listener registry ─────────────────────────────────────

type ActivationListener = () => void | Promise<void>;

const _activationListeners: ActivationListener[] = [];

/**
 * Register a callback to be invoked when the feature flag transitions
 * OFF → ON. Used internally for folder auto-creation, but also available
 * for other side effects (e.g., analytics, telemetry).
 *
 * Returns unsubscribe function for cleanup (e.g. in disconnectedCallback).
 */
export function onWardleyMapsEnabled(listener: ActivationListener): () => void {
  _activationListeners.push(listener);
  return () => {
    const idx = _activationListeners.indexOf(listener);
    if (idx !== -1) {
      _activationListeners.splice(idx, 1);
    }
  };
}

/**
 * Unregister a previously registered activation listener.
 * @deprecated Prefer using the unsubscribe function returned by `onWardleyMapsEnabled`.
 */
export function offWardleyMapsEnabled(listener: ActivationListener): void {
  const idx = _activationListeners.indexOf(listener);
  if (idx !== -1) {
    _activationListeners.splice(idx, 1);
  }
}

// ── Runtime flag state ───────────────────────────────────────────────

/** Runtime flag state (spike-only; in AFFiNE use runtime config) */
let _enableWardleyMaps = ENABLE_WARDLEY_MAPS_FLAG.defaultValue;

/** Folder service reference (set via `registerFolderService`) */
let _folderService: WorkspaceFolderService | null = null;

export function isWardleyMapsEnabled(): boolean {
  return _enableWardleyMaps;
}

/**
 * Register the workspace folder service so that folder auto-creation
 * can proceed when the flag is toggled on.
 *
 * In the AFFiNE monorepo this would be injected via DI or provided
 * by the workspace module during initialisation.
 */
export function registerFolderService(
  service: WorkspaceFolderService,
): void {
  _folderService = service;
}

/**
 * Set the Wardley Maps feature flag.
 *
 * When transitioning OFF → ON:
 *   1. Updates the flag state
 *   2. If a folder service is registered, auto-creates default folders
 *   3. Notifies all activation listeners
 *
 * @param enabled - New flag state
 */
export async function setWardleyMapsEnabled(
  enabled: boolean,
): Promise<void> {
  const wasEnabled = _enableWardleyMaps;
  _enableWardleyMaps = enabled;

  // Trigger activation side-effects on OFF → ON transition
  if (enabled && !wasEnabled) {
    // Auto-create default folders if service is available
    if (_folderService) {
      await onWardleyMapsActivated(_folderService);
    }

    // Notify listeners
    for (const listener of _activationListeners) {
      await listener();
    }
  }
}
