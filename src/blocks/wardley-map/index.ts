/**
 * Wardley Map Block — barrel export
 *
 * Flavour: affine:wardley-map
 * Parent:  affine:surface (Edgeless canvas)
 */

export {
  WardleyMapBlockElement,
  WARDLEY_MAP_PHASE_LABEL_CHANGE_EVENT,
  WARDLEY_MAP_SUBTITLE_CHANGE_EVENT,
  WARDLEY_MAP_AXIS_LABEL_CHANGE_EVENT,
  type PhaseLabelChangeDetail,
  type SubtitleChangeDetail,
  type AxisLabelChangeDetail,
  type EditingAxis,
  createPhaseLabelChangeEvent,
  createSubtitleChangeEvent,
  createAxisLabelChangeEvent,
} from './wardley-map-block.js';

export {
  WardleyMapSettingsPanel,
} from './wardley-map-settings-panel.js';

export {
  type WardleyMapBlockProps,
  type EvolutionPhaseRatios,
  type WardleyMapToggles,
  type PhaseLabels,
  DEFAULT_WARDLEY_MAP_TOGGLES,
  DEFAULT_PHASE_LABELS,
  defaultWardleyMapBlockProps,
  WardleyMapBlockSchemaDescriptor,
} from './wardley-map-schema.js';

export {
  WARDLEY_MAP_FLAVOUR,
  WARDLEY_MAP_DEFAULT_WIDTH,
  WARDLEY_MAP_DEFAULT_HEIGHT,
  EVOLUTION_PHASE_CUSTOM,
  EVOLUTION_PHASE_PRODUCT,
  EVOLUTION_PHASE_COMMODITY,
  EVOLUTION_PHASES,
  EVOLUTION_BOUNDARIES,
  SUBTITLE_WIDTH_RATIO,
  SUBTITLE_FONT_SIZE,
  SUBTITLE_LINE_HEIGHT,
  SUBTITLE_COLOR,
  AXIS_MARGIN_LEFT,
  AXIS_MARGIN_BOTTOM,
  AXIS_MARGIN_TOP,
  AXIS_LABEL_FONT_SIZE,
  PHASE_LABEL_FONT_SIZE,
  DIRECTION_LABEL_FONT_SIZE,
  TITLE_FONT_SIZE,
  ZOOM_LABEL_SCALE_MIN,
  ZOOM_LABEL_SCALE_MAX,
  DEFAULT_X_AXIS_LABEL,
  DEFAULT_Y_AXIS_LABEL,
  DEFAULT_LAYER_VISIBILITY,
  ZONE_COLORS,
  ZONE_COLOR_GENESIS,
  ZONE_COLOR_CUSTOM,
  ZONE_COLOR_PRODUCT,
  ZONE_COLOR_COMMODITY,
  EQUILIBRIUM_CURVE_COLOR,
  EQUILIBRIUM_CURVE_WIDTH,
  COMPETITION_FREE_ZONE_COLOR,
  COMPETITION_FREE_ZONE_BORDER,
  COMPETITION_FREE_ZONE_END,
  INNOVATION_GRADIENT_START,
  INNOVATION_GRADIENT_END,
  INDUSTRIALISATION_GRADIENT_START,
  INDUSTRIALISATION_GRADIENT_END,
  UNCERTAINTY_GRADIENT_START,
  UNCERTAINTY_GRADIENT_END,
  type EvolutionPhase,
  type LayerVisibility,
} from './wardley-map-consts.js';

export {
  clampZoom,
  zoomStableFontSize,
  zoomStableStrokeWidth,
  type ZoomStableTextOptions,
} from './wardley-map-zoom-utils.js';

export {
  type FeatureFlagDescriptor,
  ENABLE_WARDLEY_MAPS_FLAG,
  isWardleyMapsEnabled,
  setWardleyMapsEnabled,
  registerFolderService,
  onWardleyMapsEnabled,
} from './wardley-map-feature-flag.js';

export {
  WARDLEY_MAPS_FOLDER_NAME,
  STUDIES_FOLDER_NAME,
  DEFAULT_WARDLEY_FOLDERS,
  type WorkspaceFolder,
  type WorkspaceFolderService,
  type WardleyInitResult,
  ensureWardleyFolders,
  onWardleyMapsActivated,
  InMemoryFolderService,
} from './wardley-map-workspace-init.js';

export {
  WardleyMapToolbarButton,
  WARDLEY_MAP_INSERT_EVENT,
  type WardleyMapInsertDetail,
  createInsertEvent,
} from './wardley-map-toolbar-button.js';

export {
  WardleyMapOverlaySettings,
  WARDLEY_MAP_TOGGLE_CHANGE_EVENT,
  type ToggleChangeDetail,
  createToggleChangeEvent,
} from './wardley-map-overlay-settings.js';

export {
  type LinkedPageRef,
  type PageNavigationDetail,
  type PageLinkChangeDetail,
  type PageNavigationService,
  WARDLEY_MAP_NAVIGATE_EVENT,
  WARDLEY_MAP_LINK_CHANGE_EVENT,
  createNavigateEvent,
  createLinkChangeEvent,
  InMemoryPageNavigationService,
} from './wardley-map-page-link.js';

export {
  WardleyMapContextMenu,
  WARDLEY_MAP_OPEN_SETTINGS_EVENT,
  type OpenSettingsDetail,
  type ContextMenuItem,
  createOpenSettingsEvent,
  getWardleyMapContextMenuItems,
} from './wardley-map-context-menu.js';

export {
  type CanvasPosition,
  type InsertWardleyMapOptions,
  type InsertWardleyMapResult,
  type DocService,
  type SurfaceService,
  type InsertedDetail,
  type InsertRequestDetail,
  WARDLEY_MAP_INSERTED_EVENT,
  insertWardleyMap,
  createInsertedEvent,
  createInsertRequestEvent,
  serializeXywh,
  registerInsertHandler,
  InMemoryDocService,
  InMemorySurfaceService,
  resetSpikeIds,
} from './wardley-map-canvas-insert.js';
