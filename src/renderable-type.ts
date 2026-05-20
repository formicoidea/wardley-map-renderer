/**
 * Rendering-local type vocabulary for component types.
 *
 * This module declares the rendering package's own type vocabulary, deliberately
 * decoupled from the data-schema `ComponentType` enum. The rendering layer should
 * not import or depend on the data-layer enum at runtime; instead, component types
 * are mapped to `RenderableType` at the data-boundary (e.g. in build-context.ts).
 *
 * Design:
 *  - `KnownRenderableType` — closed union of well-known literals that the renderer
 *    has explicit visual handling for.
 *  - `BrandedRenderableType` — opaque branded string for future/unknown types that
 *    must still be accepted without breaking the renderer.
 *  - `RenderableType` — the public union: known | branded.
 *
 * Extensibility contract:
 *  - Known types have first-class style keys in TypeStyleMap implementations.
 *  - Unknown types fall through to `_default` in every TypeStyleMap lookup.
 *  - Callers use `asRenderableType` to brand an arbitrary string into the union
 *    when bridging from the data layer.
 */

// ---------------------------------------------------------------------------
// Known literals — update this union when the renderer gains explicit support
// for a new visual archetype. Do NOT import ComponentType from schema.ts here.
// ---------------------------------------------------------------------------

export type KnownRenderableType =
  | "component"
  | "user-need"
  | "pipeline"
  | "note"
  | "anchor"
  | "market"
  | "ecosystem";

/** Tuple of all known renderable type literals (useful for Zod enums, iteration). */
export const KNOWN_RENDERABLE_TYPES = [
  "component",
  "user-need",
  "pipeline",
  "note",
  "anchor",
  "market",
  "ecosystem",
] as const satisfies readonly KnownRenderableType[];

// ---------------------------------------------------------------------------
// Branded extensibility string — allows future/unknown component types to
// pass through the type system without a full enum update.
// ---------------------------------------------------------------------------

/** A string that has been explicitly asserted as a valid renderable type key. */
export type BrandedRenderableType = string & { readonly __renderable: true };

// ---------------------------------------------------------------------------
// Public union
// ---------------------------------------------------------------------------

/**
 * A rendering-local component-type identifier.
 * Either a well-known literal handled explicitly by renderer layers,
 * or a branded string for unknown/future types (which fall back to `_default`
 * in every TypeStyleMap lookup).
 */
export type RenderableType = KnownRenderableType | BrandedRenderableType;

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `value` is one of the well-known renderable type literals.
 * Use this when you need to branch on explicit renderer behaviour.
 *
 * @example
 * if (isKnownRenderableType(comp.type)) {
 *   // guaranteed first-class visual handling
 * }
 */
export function isKnownRenderableType(
  value: string
): value is KnownRenderableType {
  return (KNOWN_RENDERABLE_TYPES as readonly string[]).includes(value);
}

/**
 * Returns `true` when `value` is any `RenderableType` (known or branded).
 * Since every string can technically be branded, this is mainly useful as a
 * nominal check after `asRenderableType` has been called.
 */
export function isRenderableType(value: unknown): value is RenderableType {
  return typeof value === "string" && value.length > 0;
}

// ---------------------------------------------------------------------------
// Brand helper
// ---------------------------------------------------------------------------

/**
 * Brands an arbitrary non-empty string as a `RenderableType`.
 *
 * Use this at the data-layer boundary (e.g. in `build-context.ts`) to convert
 * a data-schema component type string into the rendering vocabulary without
 * importing the data-schema enum.
 *
 * Throws if `value` is empty, since an empty type key is not meaningful.
 *
 * @example
 * // In build-context.ts — the only place that should know about data-layer types
 * const renderableType = asRenderableType(component.type);
 */
export function asRenderableType(value: string): RenderableType {
  if (!value || value.trim().length === 0) {
    throw new TypeError(
      `asRenderableType: value must be a non-empty string, got ${JSON.stringify(value)}`
    );
  }
  // If it's a known literal, return as-is (the union covers it).
  // Otherwise cast to the branded type — the caller asserts it's meaningful.
  return value as RenderableType;
}

// ---------------------------------------------------------------------------
// Boundary translation — the single coupling point between data vocabulary
// and render vocabulary.  Keep this as the ONLY place that enumerates
// data-schema component-type strings inside the render package.
// ---------------------------------------------------------------------------

/**
 * The '_default' sentinel string returned by `mapComponentType` for unknown types.
 *
 * This is the TypeStyleMap fallback key: every TypeStyleMap implementation
 * (nodeRadii, typeColors, evolveStyles) uses `_default` as its catch-all
 * entry.  When `mapComponentType` returns this sentinel, TypeStyleMap lookups
 * on `map["_default"]` find the fallback value directly.
 *
 * Exported so callers can compare against it without hard-coding the string.
 */
export const DEFAULT_RENDERABLE_TYPE_SENTINEL = "_default" as const;

/**
 * Closed set of data-layer component type strings that map 1:1 to a named
 * `KnownRenderableType`.  This is the ONLY place inside the render package
 * that enumerates data-schema type strings — all other render modules should
 * import `RenderableType` and call `mapComponentType` at the boundary.
 *
 * Intentionally typed as `ReadonlySet<string>` (not as a `ComponentType` set)
 * to avoid importing the data-schema enum at runtime.
 */
const KNOWN_DATA_COMPONENT_TYPES: ReadonlySet<string> = new Set<string>([
  "component",
  "user-need",
  "pipeline",
  "note",
  "anchor",
  "market",
  "ecosystem",
]);

/**
 * Boundary translation function: maps a data-layer component type string to its
 * `RenderableType` counterpart.
 *
 * This is the **single coupling point** between the data schema vocabulary and the
 * render vocabulary.  Render layers should call this at the data boundary (e.g. in
 * `build-context.ts`) and work exclusively with `RenderableType` values thereafter.
 *
 * ## Mapping rules
 * 1. **Known types** — "component" | "user-need" | "pipeline" | "note" | "anchor" | "market" | "ecosystem"
 *    map 1:1 to their identically-named `KnownRenderableType` counterpart.
 * 2. **'_default' sentinel** — passed as input is returned as-is; it is the
 *    TypeStyleMap fallback key and is valid in the rendering vocabulary.
 * 3. **Unknown types** — any other string (including empty string) maps to the
 *    `'_default'` sentinel, allowing TypeStyleMap lookups to fall back gracefully.
 *
 * ## Non-breaking evolution
 * Future data-schema component types not yet listed in `KNOWN_DATA_COMPONENT_TYPES`
 * will automatically receive `'_default'` styling.  Add the new type to the set
 * only when the renderer gains first-class visual handling for it.
 *
 * @param dataType - A component type string from the data layer (e.g. `comp.type`)
 * @returns The corresponding `RenderableType`, or `'_default'` for unknown/unmapped types
 *
 * @example Known types — identity mapping:
 *   mapComponentType("component")  // → "component"  (KnownRenderableType)
 *   mapComponentType("user-need")  // → "user-need"  (KnownRenderableType)
 *   mapComponentType("pipeline")   // → "pipeline"   (KnownRenderableType)
 *   mapComponentType("note")       // → "note"        (KnownRenderableType)
 *   mapComponentType("anchor")     // → "anchor"      (KnownRenderableType)
 *
 * @example Sentinel passed as input — returned as-is:
 *   mapComponentType("_default")   // → "_default"   (BrandedRenderableType)
 *
 * @example Unknown types — graceful fallback to sentinel:
 *   mapComponentType("widget")     // → "_default"   (BrandedRenderableType)
 *   mapComponentType("")           // → "_default"   (BrandedRenderableType)
 *   mapComponentType("COMPONENT")  // → "_default"   (case-sensitive)
 */
/**
 * Map a node's (type, subtype) to its effective `RenderableType` — the appearance
 * vocabulary the symbol renderers understand.
 *
 * Bridges the new node taxonomy (type ∈ anchor|component|pipeline, plus a component
 * `subtype`) onto the legacy renderable vocabulary so visual output is preserved:
 *   - anchor   → "anchor"
 *   - pipeline → "pipeline"
 *   - component + market    → "market"
 *   - component + ecosystem → "ecosystem"
 *   - component + userNeed  → "user-need"
 *   - component + (functional | solution | supplier | none) → "component"
 *     (no dedicated symbol yet — fall back to the generic component glyph)
 *
 * @param type    - node type ("anchor" | "component" | "pipeline")
 * @param subtype - optional component subtype
 */
export function componentRenderableType(type: string, subtype?: string): RenderableType {
  if (type === "anchor") return "anchor";
  if (type === "pipeline") return "pipeline";
  switch (subtype) {
    case "market":
      return "market";
    case "ecosystem":
      return "ecosystem";
    case "userNeed":
      return "user-need";
    default:
      return "component";
  }
}

export function mapComponentType(dataType: string): RenderableType {
  if (KNOWN_DATA_COMPONENT_TYPES.has(dataType)) {
    // Known data type — return as KnownRenderableType (no branding needed,
    // it already satisfies the KnownRenderableType branch of the union).
    return dataType as KnownRenderableType;
  }
  // Emit a structured diagnostic warning for truly unknown types so consumers
  // can detect data-schema drift early.  The sentinel '_default' passed as
  // input is a deliberate no-op (idempotent) — suppress the warning in that case.
  //
  // Structured format (JSON) replaces the previous ad-hoc string so callers
  // and tooling can parse/intercept it consistently.
  if (dataType !== DEFAULT_RENDERABLE_TYPE_SENTINEL) {
    const diagnosticEntry = {
      code: "UNRECOGNIZED_RENDERABLE_TYPE" as const,
      dataType,
      recognitionLevel: "unrecognized" as const,
      message: `Unknown component type "${dataType}" — falling back to "_default" styling.`,
      hint: "Add the type to KNOWN_DATA_COMPONENT_TYPES in renderable-type.ts when the renderer gains first-class visual handling.",
    };
    console.warn(`[mapComponentType] ${JSON.stringify(diagnosticEntry)}`);
  }
  // Unknown type (or already the sentinel) — return '_default' branded as
  // BrandedRenderableType so TypeStyleMap lookups hit the fallback key directly.
  return DEFAULT_RENDERABLE_TYPE_SENTINEL as BrandedRenderableType;
}
