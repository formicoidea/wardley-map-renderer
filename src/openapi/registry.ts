/**
 * OpenAPI route registry for WardleyAPI.
 *
 * Collects API route definitions with Zod request/response schemas,
 * then generates an OpenAPI 3.1.0 specification document.
 *
 * Each route registration includes:
 *   - HTTP method + path
 *   - Summary / description / tags
 *   - Request body schema (Zod) + content type
 *   - Response schemas (Zod) keyed by status code + content type
 *   - Security requirements
 *
 * @module openapi/registry
 */

import type { ZodType } from "zod";

// ── Types ──────────────────────────────────────────────────────

export interface RouteResponseDef {
  description: string;
  contentType: string;
  schema?: ZodType;
}

export interface RouteRequestDef {
  contentType: string;
  schema: ZodType;
  description?: string;
}

export interface RouteRegistration {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  request?: RouteRequestDef;
  responses: Record<string, RouteResponseDef>;
}

// ── Registry singleton ─────────────────────────────────────────

const routes: Map<string, RouteRegistration> = new Map();

/**
 * Register a route definition in the OpenAPI registry.
 *
 * The key is `${method} ${path}` — registering the same key
 * overwrites the previous entry.
 */
export function registerRoute(route: RouteRegistration): void {
  const key = `${route.method} ${route.path}`;
  routes.set(key, route);
}

/**
 * Get all registered routes (ordered by registration time).
 */
export function getRoutes(): RouteRegistration[] {
  return Array.from(routes.values());
}

/**
 * Get a specific route by method + path.
 */
export function getRoute(
  method: string,
  path: string
): RouteRegistration | undefined {
  return routes.get(`${method} ${path}`);
}

/**
 * Check how many routes are registered.
 */
export function registrySize(): number {
  return routes.size;
}

/**
 * Clear all route registrations. Primarily for testing.
 */
export function clearRoutes(): void {
  routes.clear();
}
