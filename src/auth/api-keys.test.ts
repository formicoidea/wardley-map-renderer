import { describe, it, expect } from "vitest";
import { ApiKeyRegistry, buildRegistryFromEnv } from "./api-keys.js";

describe("ApiKeyRegistry", () => {
  it("looks up a valid key and returns the entry", () => {
    const registry = new ApiKeyRegistry([
      { key: "sk-abc123", name: "prod" },
      { key: "sk-def456", name: "staging" },
    ]);
    const entry = registry.lookup("sk-abc123");
    expect(entry).toEqual({ key: "sk-abc123", name: "prod" });
    expect(registry.isValid("sk-abc123")).toBe(true);
  });

  it("returns undefined for an unknown key", () => {
    const registry = new ApiKeyRegistry([{ key: "sk-abc123", name: "prod" }]);
    expect(registry.lookup("sk-wrong")).toBeUndefined();
    expect(registry.isValid("sk-wrong")).toBe(false);
  });

  it("ignores empty/whitespace-only keys", () => {
    const registry = new ApiKeyRegistry([
      { key: "", name: "empty" },
      { key: "   ", name: "spaces" },
      { key: "sk-valid", name: "valid" },
    ]);
    expect(registry.size).toBe(1);
    expect(registry.isValid("sk-valid")).toBe(true);
  });

  it("reports enabled=false when no keys", () => {
    const registry = new ApiKeyRegistry([]);
    expect(registry.enabled).toBe(false);
    expect(registry.size).toBe(0);
  });

  it("reports enabled=true when keys exist", () => {
    const registry = new ApiKeyRegistry([{ key: "sk-x", name: "x" }]);
    expect(registry.enabled).toBe(true);
  });
});

describe("buildRegistryFromEnv", () => {
  it("loads from API_KEY (single key)", () => {
    const registry = buildRegistryFromEnv({ API_KEY: "sk-single" });
    expect(registry.size).toBe(1);
    expect(registry.isValid("sk-single")).toBe(true);
    expect(registry.lookup("sk-single")?.name).toBe("default");
  });

  it("loads from API_KEYS (comma-separated)", () => {
    const registry = buildRegistryFromEnv({ API_KEYS: "sk-a,sk-b,sk-c" });
    expect(registry.size).toBe(3);
    expect(registry.isValid("sk-a")).toBe(true);
    expect(registry.isValid("sk-b")).toBe(true);
    expect(registry.isValid("sk-c")).toBe(true);
  });

  it("trims whitespace in comma-separated keys", () => {
    const registry = buildRegistryFromEnv({ API_KEYS: " sk-a , sk-b " });
    expect(registry.size).toBe(2);
    expect(registry.isValid("sk-a")).toBe(true);
    expect(registry.isValid("sk-b")).toBe(true);
  });

  it("loads from API_KEYS_JSON with metadata", () => {
    const json = JSON.stringify([
      { key: "sk-json1", name: "production", scopes: ["render"] },
      { key: "sk-json2", name: "staging" },
    ]);
    const registry = buildRegistryFromEnv({ API_KEYS_JSON: json });
    expect(registry.size).toBe(2);
    const entry = registry.lookup("sk-json1");
    expect(entry?.name).toBe("production");
    expect(entry?.scopes).toEqual(["render"]);
  });

  it("merges all three sources", () => {
    const json = JSON.stringify([{ key: "sk-json", name: "json" }]);
    const registry = buildRegistryFromEnv({
      API_KEYS_JSON: json,
      API_KEYS: "sk-csv",
      API_KEY: "sk-single",
    });
    expect(registry.size).toBe(3);
    expect(registry.isValid("sk-json")).toBe(true);
    expect(registry.isValid("sk-csv")).toBe(true);
    expect(registry.isValid("sk-single")).toBe(true);
  });

  it("deduplicates keys (first entry wins)", () => {
    const json = JSON.stringify([{ key: "sk-dup", name: "from-json" }]);
    const registry = buildRegistryFromEnv({
      API_KEYS_JSON: json,
      API_KEYS: "sk-dup",
    });
    expect(registry.size).toBe(1);
    // JSON has higher priority, so the name should be "from-json"
    expect(registry.lookup("sk-dup")?.name).toBe("from-json");
  });

  it("returns empty registry when no env vars set", () => {
    const registry = buildRegistryFromEnv({});
    expect(registry.size).toBe(0);
    expect(registry.enabled).toBe(false);
  });

  it("handles malformed API_KEYS_JSON gracefully", () => {
    const registry = buildRegistryFromEnv({
      API_KEYS_JSON: "not-valid-json{{{",
      API_KEY: "sk-fallback",
    });
    // Should skip bad JSON but still load API_KEY
    expect(registry.size).toBe(1);
    expect(registry.isValid("sk-fallback")).toBe(true);
  });

  it("handles API_KEYS_JSON that is not an array", () => {
    const registry = buildRegistryFromEnv({
      API_KEYS_JSON: '{"key":"sk-obj"}',
      API_KEY: "sk-fallback",
    });
    // Object instead of array → ignored
    expect(registry.size).toBe(1);
    expect(registry.isValid("sk-fallback")).toBe(true);
  });

  it("skips empty API_KEY", () => {
    const registry = buildRegistryFromEnv({ API_KEY: "  " });
    expect(registry.size).toBe(0);
  });

  it("skips empty segments in API_KEYS", () => {
    const registry = buildRegistryFromEnv({ API_KEYS: "sk-a,,sk-b," });
    expect(registry.size).toBe(2);
  });
});
