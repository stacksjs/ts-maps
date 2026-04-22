// Public entry: the modern interactive map API is primary.
// The legacy VectorMap API remains available for backwards compatibility.
export * from './core-map'
export { default } from './core-map'

// Legacy VectorMap API (choropleth, built-in world/country maps, analytics).
// MapData is re-exported here because the built-in map data modules reference it.
// For the full set of legacy types, import from 'ts-maps/types' directly.
export type {
  DataVisualizationOptions,
  MapData,
  MapInterface,
  MarkerStyle,
  RegionMapData,
  RegionStyle,
  SeriesConfig,
} from './types'
export { VectorMap } from './vector-map'
export * from './analytics'
