// Built-in basemap styles. See `basemap.ts` for why these are functions.

export { dark, light } from './basemap'
export { transit, TRANSIT_COLORS } from './transit'
export { ESRI_WORLD_IMAGERY, ESRI_WORLD_IMAGERY_ATTRIBUTION, hybrid, satellite } from './imagery'
export type { ImageryOptions } from './imagery'
export type { BasemapFonts, BasemapStyleOptions, SourceLayerKey } from './basemap'
export { DARK, LIGHT } from './palette'
export type { Palette } from './palette'
export { resolveTileJSON } from './tilejson'
export type { ResolvedTileJSON, ResolveTileJSONOptions } from './tilejson'
