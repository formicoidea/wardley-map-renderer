/**
 * OpenAPI module — registry, route definitions, and spec generation.
 *
 * @module openapi
 */

export {
  registerRoute,
  getRoutes,
  getRoute,
  registrySize,
  clearRoutes,
  type RouteRegistration,
  type RouteRequestDef,
  type RouteResponseDef,
} from "./registry.js";

export {
  registerV1Routes,
  ProblemDetailSchema,
  HealthResponseSchema,
} from "./routes.js";

export { registerSchemas, registerPaths } from "./schemas.js";
