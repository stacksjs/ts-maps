/**
 * Style Specification — in-house TypeScript implementation of a subset of the
 * Mapbox GL Style Specification (BSD-3-Clause). Independent rewrite; not a
 * copy. Upstream reference: https://github.com/mapbox/mapbox-gl-style-spec
 */

// ---------- expressions ----------
//
// Expressions are the lambda-calculus-ish DSL used to make paint/layout
// properties data-driven. The parser + evaluator live under
// `./expressions/`; here we just declare the spec shape — an array whose
// first element is the operator name.
export type ExpressionSpecification = unknown[]

// A paint/layout property value is either a literal of the declared type
// or an expression that produces one.
export type PropertyValueSpecification<T> = T | ExpressionSpecification

// ---------- common scalar shapes ----------

export type ColorSpecification = string
export type FormattedSpecification = string | ExpressionSpecification
export type ResolvedImageSpecification = string | ExpressionSpecification
export type PaddingSpecification = number | [number, number] | [number, number, number, number]

// ---------- transition ----------

export interface TransitionSpecification {
  duration?: number
  delay?: number
}

// ---------- light ----------

export interface LightSpecification {
  anchor?: PropertyValueSpecification<'map' | 'viewport'>
  position?: PropertyValueSpecification<[number, number, number]>
  color?: PropertyValueSpecification<ColorSpecification>
  intensity?: PropertyValueSpecification<number>
}

// ---------- sprite ----------

export interface SpriteSource {
  id: string
  url: string
}

// ---------- sources ----------

export type PromoteIdSpecification = string | Record<string, string>

export interface VectorSourceSpecification {
  type: 'vector'
  url?: string
  tiles?: string[]
  bounds?: [number, number, number, number]
  scheme?: 'xyz' | 'tms'
  minzoom?: number
  maxzoom?: number
  attribution?: string
  promoteId?: PromoteIdSpecification
  volatile?: boolean
}

export interface RasterSourceSpecification {
  type: 'raster'
  url?: string
  tiles?: string[]
  bounds?: [number, number, number, number]
  minzoom?: number
  maxzoom?: number
  tileSize?: number
  scheme?: 'xyz' | 'tms'
  attribution?: string
  volatile?: boolean
}

export interface RasterDEMSourceSpecification {
  type: 'raster-dem'
  url?: string
  tiles?: string[]
  bounds?: [number, number, number, number]
  minzoom?: number
  maxzoom?: number
  tileSize?: number
  attribution?: string
  encoding?: 'terrarium' | 'mapbox' | 'custom'
  redFactor?: number
  blueFactor?: number
  greenFactor?: number
  baseShift?: number
  volatile?: boolean
}

export interface GeoJSONSourceSpecification {
  type: 'geojson'
  data?: unknown
  maxzoom?: number
  attribution?: string
  buffer?: number
  filter?: unknown
  tolerance?: number
  cluster?: boolean
  clusterRadius?: number
  clusterMaxZoom?: number
  clusterMinPoints?: number
  clusterProperties?: Record<string, unknown>
  lineMetrics?: boolean
  generateId?: boolean
  promoteId?: PromoteIdSpecification
}

export type SourceSpecification =
  | VectorSourceSpecification
  | RasterSourceSpecification
  | RasterDEMSourceSpecification
  | GeoJSONSourceSpecification

// ---------- filter ----------

export type FilterSpecification = ExpressionSpecification | unknown[]

// ---------- layer types ----------

export type LayerType =
  | 'background'
  | 'fill'
  | 'fill-extrusion'
  | 'line'
  | 'circle'
  | 'symbol'
  | 'raster'

// ---------- background ----------

export interface BackgroundPaintSpecification {
  'background-color'?: PropertyValueSpecification<ColorSpecification>
  'background-opacity'?: PropertyValueSpecification<number>
  'background-pattern'?: PropertyValueSpecification<ResolvedImageSpecification>
}

export interface BackgroundLayoutSpecification {
  visibility?: 'visible' | 'none'
}

export interface BackgroundLayerSpecification {
  id: string
  type: 'background'
  metadata?: Record<string, unknown>
  minzoom?: number
  maxzoom?: number
  layout?: BackgroundLayoutSpecification
  paint?: BackgroundPaintSpecification
}

// ---------- fill ----------

export interface FillPaintSpecification {
  'fill-antialias'?: PropertyValueSpecification<boolean>
  'fill-color'?: PropertyValueSpecification<ColorSpecification>
  'fill-opacity'?: PropertyValueSpecification<number>
  'fill-outline-color'?: PropertyValueSpecification<ColorSpecification>
  'fill-pattern'?: PropertyValueSpecification<ResolvedImageSpecification>
  'fill-translate'?: PropertyValueSpecification<[number, number]>
  'fill-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>
}

export interface FillLayoutSpecification {
  visibility?: 'visible' | 'none'
  'fill-sort-key'?: PropertyValueSpecification<number>
}

export interface FillLayerSpecification {
  id: string
  type: 'fill'
  metadata?: Record<string, unknown>
  source: string
  'source-layer'?: string
  minzoom?: number
  maxzoom?: number
  filter?: FilterSpecification
  layout?: FillLayoutSpecification
  paint?: FillPaintSpecification
}

// ---------- fill-extrusion ----------

export interface FillExtrusionPaintSpecification {
  'fill-extrusion-opacity'?: PropertyValueSpecification<number>
  'fill-extrusion-color'?: PropertyValueSpecification<ColorSpecification>
  'fill-extrusion-translate'?: PropertyValueSpecification<[number, number]>
  'fill-extrusion-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>
  'fill-extrusion-pattern'?: PropertyValueSpecification<ResolvedImageSpecification>
  'fill-extrusion-height'?: PropertyValueSpecification<number>
  'fill-extrusion-base'?: PropertyValueSpecification<number>
  'fill-extrusion-vertical-gradient'?: PropertyValueSpecification<boolean>
}

export interface FillExtrusionLayoutSpecification {
  visibility?: 'visible' | 'none'
}

export interface FillExtrusionLayerSpecification {
  id: string
  type: 'fill-extrusion'
  metadata?: Record<string, unknown>
  source: string
  'source-layer'?: string
  minzoom?: number
  maxzoom?: number
  filter?: FilterSpecification
  layout?: FillExtrusionLayoutSpecification
  paint?: FillExtrusionPaintSpecification
}

// ---------- line ----------

export interface LinePaintSpecification {
  'line-opacity'?: PropertyValueSpecification<number>
  'line-color'?: PropertyValueSpecification<ColorSpecification>
  'line-translate'?: PropertyValueSpecification<[number, number]>
  'line-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>
  'line-width'?: PropertyValueSpecification<number>
  'line-gap-width'?: PropertyValueSpecification<number>
  'line-offset'?: PropertyValueSpecification<number>
  'line-blur'?: PropertyValueSpecification<number>
  'line-dasharray'?: PropertyValueSpecification<number[]>
  'line-pattern'?: PropertyValueSpecification<ResolvedImageSpecification>
  'line-gradient'?: PropertyValueSpecification<ColorSpecification>
}

export interface LineLayoutSpecification {
  visibility?: 'visible' | 'none'
  'line-cap'?: PropertyValueSpecification<'butt' | 'round' | 'square'>
  'line-join'?: PropertyValueSpecification<'bevel' | 'round' | 'miter'>
  'line-miter-limit'?: PropertyValueSpecification<number>
  'line-round-limit'?: PropertyValueSpecification<number>
  'line-sort-key'?: PropertyValueSpecification<number>
}

export interface LineLayerSpecification {
  id: string
  type: 'line'
  metadata?: Record<string, unknown>
  source: string
  'source-layer'?: string
  minzoom?: number
  maxzoom?: number
  filter?: FilterSpecification
  layout?: LineLayoutSpecification
  paint?: LinePaintSpecification
}

// ---------- circle ----------

export interface CirclePaintSpecification {
  'circle-radius'?: PropertyValueSpecification<number>
  'circle-color'?: PropertyValueSpecification<ColorSpecification>
  'circle-blur'?: PropertyValueSpecification<number>
  'circle-opacity'?: PropertyValueSpecification<number>
  'circle-translate'?: PropertyValueSpecification<[number, number]>
  'circle-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>
  'circle-pitch-scale'?: PropertyValueSpecification<'map' | 'viewport'>
  'circle-pitch-alignment'?: PropertyValueSpecification<'map' | 'viewport'>
  'circle-stroke-width'?: PropertyValueSpecification<number>
  'circle-stroke-color'?: PropertyValueSpecification<ColorSpecification>
  'circle-stroke-opacity'?: PropertyValueSpecification<number>
}

export interface CircleLayoutSpecification {
  visibility?: 'visible' | 'none'
  'circle-sort-key'?: PropertyValueSpecification<number>
}

export interface CircleLayerSpecification {
  id: string
  type: 'circle'
  metadata?: Record<string, unknown>
  source: string
  'source-layer'?: string
  minzoom?: number
  maxzoom?: number
  filter?: FilterSpecification
  layout?: CircleLayoutSpecification
  paint?: CirclePaintSpecification
}

// ---------- symbol ----------

export interface SymbolPaintSpecification {
  'icon-opacity'?: PropertyValueSpecification<number>
  'icon-color'?: PropertyValueSpecification<ColorSpecification>
  'icon-halo-color'?: PropertyValueSpecification<ColorSpecification>
  'icon-halo-width'?: PropertyValueSpecification<number>
  'icon-halo-blur'?: PropertyValueSpecification<number>
  'icon-translate'?: PropertyValueSpecification<[number, number]>
  'icon-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>
  'text-opacity'?: PropertyValueSpecification<number>
  'text-color'?: PropertyValueSpecification<ColorSpecification>
  'text-halo-color'?: PropertyValueSpecification<ColorSpecification>
  'text-halo-width'?: PropertyValueSpecification<number>
  'text-halo-blur'?: PropertyValueSpecification<number>
  'text-translate'?: PropertyValueSpecification<[number, number]>
  'text-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>
}

export interface SymbolLayoutSpecification {
  visibility?: 'visible' | 'none'
  'symbol-placement'?: PropertyValueSpecification<'point' | 'line' | 'line-center'>
  'symbol-spacing'?: PropertyValueSpecification<number>
  'symbol-avoid-edges'?: PropertyValueSpecification<boolean>
  'symbol-sort-key'?: PropertyValueSpecification<number>
  'symbol-z-order'?: PropertyValueSpecification<'auto' | 'viewport-y' | 'source'>
  'icon-allow-overlap'?: PropertyValueSpecification<boolean>
  'icon-ignore-placement'?: PropertyValueSpecification<boolean>
  'icon-optional'?: PropertyValueSpecification<boolean>
  'icon-rotation-alignment'?: PropertyValueSpecification<'map' | 'viewport' | 'auto'>
  'icon-size'?: PropertyValueSpecification<number>
  'icon-text-fit'?: PropertyValueSpecification<'none' | 'width' | 'height' | 'both'>
  'icon-text-fit-padding'?: PropertyValueSpecification<[number, number, number, number]>
  'icon-image'?: PropertyValueSpecification<ResolvedImageSpecification>
  'icon-rotate'?: PropertyValueSpecification<number>
  'icon-padding'?: PropertyValueSpecification<PaddingSpecification>
  'icon-keep-upright'?: PropertyValueSpecification<boolean>
  'icon-offset'?: PropertyValueSpecification<[number, number]>
  'icon-anchor'?: PropertyValueSpecification<
    'center' | 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  >
  'icon-pitch-alignment'?: PropertyValueSpecification<'map' | 'viewport' | 'auto'>
  'text-pitch-alignment'?: PropertyValueSpecification<'map' | 'viewport' | 'auto'>
  'text-rotation-alignment'?: PropertyValueSpecification<'map' | 'viewport' | 'auto'>
  'text-field'?: PropertyValueSpecification<FormattedSpecification>
  'text-font'?: PropertyValueSpecification<string[]>
  'text-size'?: PropertyValueSpecification<number>
  'text-max-width'?: PropertyValueSpecification<number>
  'text-line-height'?: PropertyValueSpecification<number>
  'text-letter-spacing'?: PropertyValueSpecification<number>
  'text-justify'?: PropertyValueSpecification<'auto' | 'left' | 'center' | 'right'>
  'text-radial-offset'?: PropertyValueSpecification<number>
  'text-variable-anchor'?: PropertyValueSpecification<string[]>
  'text-anchor'?: PropertyValueSpecification<
    'center' | 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  >
  'text-max-angle'?: PropertyValueSpecification<number>
  'text-writing-mode'?: PropertyValueSpecification<string[]>
  'text-rotate'?: PropertyValueSpecification<number>
  'text-padding'?: PropertyValueSpecification<number>
  'text-keep-upright'?: PropertyValueSpecification<boolean>
  'text-transform'?: PropertyValueSpecification<'none' | 'uppercase' | 'lowercase'>
  'text-offset'?: PropertyValueSpecification<[number, number]>
  'text-allow-overlap'?: PropertyValueSpecification<boolean>
  'text-ignore-placement'?: PropertyValueSpecification<boolean>
  'text-optional'?: PropertyValueSpecification<boolean>
}

export interface SymbolLayerSpecification {
  id: string
  type: 'symbol'
  metadata?: Record<string, unknown>
  source: string
  'source-layer'?: string
  minzoom?: number
  maxzoom?: number
  filter?: FilterSpecification
  layout?: SymbolLayoutSpecification
  paint?: SymbolPaintSpecification
}

// ---------- raster ----------

export interface RasterPaintSpecification {
  'raster-opacity'?: PropertyValueSpecification<number>
  'raster-hue-rotate'?: PropertyValueSpecification<number>
  'raster-brightness-min'?: PropertyValueSpecification<number>
  'raster-brightness-max'?: PropertyValueSpecification<number>
  'raster-saturation'?: PropertyValueSpecification<number>
  'raster-contrast'?: PropertyValueSpecification<number>
  'raster-resampling'?: PropertyValueSpecification<'linear' | 'nearest'>
  'raster-fade-duration'?: PropertyValueSpecification<number>
}

export interface RasterLayoutSpecification {
  visibility?: 'visible' | 'none'
}

export interface RasterLayerSpecification {
  id: string
  type: 'raster'
  metadata?: Record<string, unknown>
  source: string
  'source-layer'?: string
  minzoom?: number
  maxzoom?: number
  layout?: RasterLayoutSpecification
  paint?: RasterPaintSpecification
}

// ---------- layer union ----------

export type LayerSpecification =
  | BackgroundLayerSpecification
  | FillLayerSpecification
  | FillExtrusionLayerSpecification
  | LineLayerSpecification
  | CircleLayerSpecification
  | SymbolLayerSpecification
  | RasterLayerSpecification

// ---------- root style ----------

export interface Style {
  version: 8
  name?: string
  metadata?: Record<string, unknown>
  center?: [number, number]
  zoom?: number
  bearing?: number
  pitch?: number
  light?: LightSpecification
  sources: Record<string, SourceSpecification>
  sprite?: string | SpriteSource[]
  glyphs?: string
  transition?: TransitionSpecification
  layers: LayerSpecification[]
}
