/**
 * API Key storage and lookup mechanism.
 *
 * Supports multiple API keys loaded from environment variables.
 *
 * Key sources (checked in order):
 *   1. `API_KEYS` env var — comma-separated list of keys
 *      e.g. "sk-abc123,sk-def456"
 *   2. `API_KEYS_JSON` env var — JSON array with metadata
 *      e.g. '[{"key":"sk-abc123","name":"prod"},{"key":"sk-def456","name":"staging"}]'
 *   3. `API_KEY` env var — single key (backward-compatible shorthand)
 *
 * All keys are stored in a Map for O(1) lookup.
 *
 * @module auth/api-keys
 */

export interface ApiKeyEntry {
  /** The raw key string (used for lookup). */
  key: string;
  /** Human-readable name for logging/auditing. */
  name: string;
  /** Optional scopes for future RBAC — not enforced in v1. */
  scopes?: string[];
}

/** Immutable registry of valid API keys. */
export class ApiKeyRegistry {
  private readonly keys: Map<string, ApiKeyEntry>;

  constructor(entries: ApiKeyEntry[]) {
    this.keys = new Map();
    for (const entry of entries) {
      if (entry.key && entry.key.trim().length > 0) {
        this.keys.set(entry.key, entry);
      }
    }
  }

  /** Look up a key. Returns the entry if valid, undefined otherwise. */
  lookup(key: string): ApiKeyEntry | undefined {
    return this.keys.get(key);
  }

  /** Check if a key is valid. */
  isValid(key: string): boolean {
    return this.keys.has(key);
  }

  /** Number of registered keys. */
  get size(): number {
    return this.keys.size;
  }

  /** Whether the registry has any keys at all (auth is enabled). */
  get enabled(): boolean {
    return this.keys.size > 0;
  }
}

/**
 * Parse API_KEYS_JSON env var.
 * Expected format: JSON array of { key: string, name?: string, scopes?: string[] }
 */
function parseKeysJson(raw: string): ApiKeyEntry[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e: unknown) => typeof e === "object" && e !== null && "key" in e)
      .map((e: Record<string, unknown>, i: number) => ({
        key: String(e.key),
        name: typeof e.name === "string" ? e.name : `key-json-${i}`,
        scopes: Array.isArray(e.scopes) ? e.scopes.map(String) : undefined,
      }));
  } catch {
    return [];
  }
}

/**
 * Parse API_KEYS env var (comma-separated plain keys).
 */
function parseKeysCsv(raw: string): ApiKeyEntry[] {
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .map((k, i) => ({ key: k, name: `key-${i}` }));
}

/**
 * Build an ApiKeyRegistry from environment variables.
 *
 * Priority: API_KEYS_JSON > API_KEYS > API_KEY
 * All sources are merged (not exclusive) so you can combine them.
 */
export function buildRegistryFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): ApiKeyRegistry {
  const entries: ApiKeyEntry[] = [];

  // 1. API_KEYS_JSON — richest format
  if (env.API_KEYS_JSON) {
    entries.push(...parseKeysJson(env.API_KEYS_JSON));
  }

  // 2. API_KEYS — comma-separated
  if (env.API_KEYS) {
    entries.push(...parseKeysCsv(env.API_KEYS));
  }

  // 3. API_KEY — single key fallback
  if (env.API_KEY && env.API_KEY.trim().length > 0) {
    entries.push({ key: env.API_KEY.trim(), name: "default" });
  }

  // Deduplicate by key (first entry wins)
  const seen = new Set<string>();
  const deduped: ApiKeyEntry[] = [];
  for (const e of entries) {
    if (!seen.has(e.key)) {
      seen.add(e.key);
      deduped.push(e);
    }
  }

  return new ApiKeyRegistry(deduped);
}
