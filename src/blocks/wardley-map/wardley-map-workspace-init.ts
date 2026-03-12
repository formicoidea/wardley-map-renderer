/**
 * wardley-map-workspace-init.ts — Auto-creation of default workspace folders
 * when the Wardley Maps feature flag is activated.
 *
 * Sub-AC 3 of AC 2 (US1): When the `enable_wardley_maps` feature flag is
 * toggled ON and the default folders don't yet exist, this module creates:
 *
 *   • "Wardley Maps" — top-level folder for map documents
 *   • "Studies"      — top-level folder for strategy study collections
 *
 * In the AFFiNE monorepo, folder creation would go through the workspace
 * collection/doc service. This spike models the same interface so the
 * integration path is clear.
 *
 * @module wardley-map-workspace-init
 */

// ── Default folder names ─────────────────────────────────────────────
export const WARDLEY_MAPS_FOLDER_NAME = 'Wardley Maps';
export const STUDIES_FOLDER_NAME = 'Studies';

export const DEFAULT_WARDLEY_FOLDERS = [
  WARDLEY_MAPS_FOLDER_NAME,
  STUDIES_FOLDER_NAME,
] as const;

// ── Folder metadata ──────────────────────────────────────────────────

export interface WorkspaceFolder {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly createdBy: 'wardley-maps-init';
}

// ── Workspace folder service interface ───────────────────────────────
//
// In the real AFFiNE monorepo this would be the workspace's
// collection/folder service. We define a minimal interface here so that
// the init logic is testable and integration-ready.

export interface WorkspaceFolderService {
  /** List existing top-level folder names */
  listFolderNames(): string[] | Promise<string[]>;

  /** Create a new top-level folder, returns its ID */
  createFolder(name: string): string | Promise<string>;
}

// ── Init result ──────────────────────────────────────────────────────

export interface WardleyInitResult {
  /** Folders that were created (empty if they already existed) */
  readonly created: readonly WorkspaceFolder[];
  /** Folders that already existed and were skipped */
  readonly skipped: readonly string[];
}

// ── Core init function ───────────────────────────────────────────────

/**
 * Ensure default Wardley workspace folders exist.
 *
 * Called when the `enable_wardley_maps` feature flag is toggled ON.
 * Idempotent: only creates folders that don't already exist.
 *
 * @param service - The workspace folder service (or mock for spike)
 * @returns Result describing what was created vs. skipped
 */
export async function ensureWardleyFolders(
  service: WorkspaceFolderService,
): Promise<WardleyInitResult> {
  const existingNames = await service.listFolderNames();
  const existingSet = new Set(existingNames);

  const created: WorkspaceFolder[] = [];
  const skipped: string[] = [];

  for (const folderName of DEFAULT_WARDLEY_FOLDERS) {
    if (existingSet.has(folderName)) {
      skipped.push(folderName);
      continue;
    }

    const id = await service.createFolder(folderName);
    created.push({
      id,
      name: folderName,
      createdAt: Date.now(),
      createdBy: 'wardley-maps-init',
    });
  }

  return { created, skipped } as const;
}

// ── Activation handler ───────────────────────────────────────────────

/**
 * Handle the Wardley Maps feature flag being toggled ON.
 *
 * This is the entry point called by the feature flag toggle handler.
 * It ensures folders exist and returns the init result.
 *
 * In the AFFiNE monorepo, this would be wired to the feature flag
 * `onChange` callback:
 *
 * ```ts
 * featureFlags.onChange('enable_wardley_maps', async (enabled) => {
 *   if (enabled) {
 *     await onWardleyMapsActivated(workspaceFolderService);
 *   }
 * });
 * ```
 */
export async function onWardleyMapsActivated(
  service: WorkspaceFolderService,
): Promise<WardleyInitResult> {
  return ensureWardleyFolders(service);
}

// ── In-memory spike implementation ───────────────────────────────────
//
// For spike/demo purposes only. In the real AFFiNE integration, the
// WorkspaceFolderService would be provided by the workspace module.

let _nextId = 1;

function generateFolderId(): string {
  return `wardley-folder-${_nextId++}`;
}

export class InMemoryFolderService implements WorkspaceFolderService {
  private readonly _folders = new Map<string, string>(); // name → id

  listFolderNames(): string[] {
    return [...this._folders.keys()];
  }

  createFolder(name: string): string {
    if (this._folders.has(name)) {
      return this._folders.get(name)!;
    }
    const id = generateFolderId();
    this._folders.set(name, id);
    return id;
  }

  /** Check if a folder exists (test helper) */
  hasFolder(name: string): boolean {
    return this._folders.has(name);
  }

  /** Get folder count (test helper) */
  get size(): number {
    return this._folders.size;
  }

  /** Reset state (test helper) */
  clear(): void {
    this._folders.clear();
  }
}
