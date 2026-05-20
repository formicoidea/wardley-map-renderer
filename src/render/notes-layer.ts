/**
 * NotesLayer — no-op.
 *
 * `note` was removed from the node taxonomy (notes are no longer a node type).
 * This layer is retained as an empty renderer to preserve the layer registration
 * and z-order in the orchestrator without changing behaviour for note-free maps.
 *
 * @module render/notes-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";

export const renderNotesLayer: LayerRenderer = (_ctx: RenderContext): string[] => [];
