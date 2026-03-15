/**
 * @wardleyapi/shared-schema — Shared Zod schemas for WardleyAPI
 *
 * This package contains all shared type definitions and Zod schemas
 * used across the WardleyAPI monorepo (API server, CLI, BFF, etc.).
 *
 * @module @wardleyapi/shared-schema
 */

export {
  // Schemas
  RenderConfigSchema,
  ThemeEnum,
  PaletteSchema,
  FontSchema,
  LayerTogglesSchema,
  // Types
  type RenderConfig,
  type Theme,
  type Palette,
  type Font,
  type LayerToggles,
  // Defaults
  DEFAULT_RENDER_CONFIG,
  DEFAULT_PALETTE,
  DEFAULT_FONT,
  DEFAULT_LAYER_TOGGLES,
} from "./render-config.js";

export {
  // Schemas
  ProblemDetailSchema,
  ValidationProblemDetailSchema,
  // Types
  type ProblemDetail,
  type ValidationProblemDetail,
  type ProblemType,
  // Constants
  ProblemTypes,
  PROBLEM_CONTENT_TYPE,
  // Factory helpers
  createProblemDetail,
  createValidationProblem,
} from "./problem-details.js";
