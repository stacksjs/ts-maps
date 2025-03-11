import type { VectorMap } from 'ts-maps'
import type { Tooltip } from './components/tooltip'

export interface MapOptions {
  selector: string
  map: {
    name: string
    projection: 'mercator' | 'miller'
    [key: string]: any
  }
  backgroundColor?: string
  draggable?: boolean
  zoomButtons?: boolean
  zoomOnScroll?: boolean
  zoomOnScrollSpeed?: number
  zoomMax?: number
  zoomMin?: number
  zoomAnimate?: boolean
  showTooltip?: boolean
  zoomStep?: number
  bindTouchEvents?: boolean
  focusOn?: FocusOnOptions
  markers?: MarkerConfig[]
  series?: SeriesConfig
  regions?: string[]
  selectedRegions?: string[]
  selectedMarkers?: string[]
  regionsSelectable?: boolean
  regionsSelectableOne?: boolean
  markersSelectable?: boolean
  markersSelectableOne?: boolean
  regionStyle?: RegionStyle
  regionLabelStyle?: RegionLabelStyle
  markerStyle?: MarkerStyle
  markerLabelStyle?: MarkerLabelStyle
  lines?: {
    elements?: LineConfig[]
    style?: {
      stroke?: string
      strokeWidth?: number
      strokeLinecap?: string
      [key: string]: any
    }
    curvature?: number
  }
  visualizeData?: DataVisualizationOptions
  onLoaded?: () => void
  onViewportChange?: (scale: number, transX: number, transY: number) => void
  onRegionClick?: (event: MouseEvent, code: string) => void
  onRegionSelected?: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => void
  onMarkerClick?: (event: MouseEvent, index: string) => void
  onMarkerSelected?: (event: MouseEvent, index: string, isSelected: boolean, selectedMarkers: string[]) => void
  onRegionTooltipShow?: (event: MouseEvent, tooltip: HTMLElement, code: string) => void
  onMarkerTooltipShow?: (event: MouseEvent, tooltip: HTMLElement, code: string) => void
  [key: string]: any // Allow for event handlers and other properties
}

export interface FocusOnOptions {
  region?: string
  regions?: string[]
  coords?: [number, number]
  x?: number
  y?: number
  scale?: number
  animate?: boolean
}

export interface MarkerConfig {
  name: string
  coords: [number, number]
  style?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    r?: number
    [key: string]: any
  }
  [key: string]: any
}

export interface MarkerConstructorConfig {
  index: string
  map: MapInterface
  label?: boolean
  labelsGroup?: any
  cx: number
  cy: number
  group?: any
  config: MarkerConfig
  isRecentlyCreated?: boolean
}

export interface MarkerStyle {
  initial?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    r?: number
    [key: string]: any
  }
  hover?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    r?: number
    [key: string]: any
  }
  selected?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    r?: number
    [key: string]: any
  }
  selectedHover?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    r?: number
    [key: string]: any
  }
}

export interface LineConfig {
  from: string
  to: string
  style?: {
    stroke?: string
    strokeWidth?: number
    strokeLinecap?: string
    [key: string]: any
  }
  [key: string]: any
}

export interface SeriesConfig {
  attribute: string
  scale?: string[]
  values?: Record<string, number>
  [key: string]: any
}

export interface DataVisualizationOptions {
  scale: [string, string] // Array of two hex colors
  values: Record<string, number | string> // Region code to value mapping
}

/**
 * Type definitions for Italy map data
 */

/**
 * Geographic coordinate point
 */
export interface GeoPoint {
  x: number
  y: number
}

/**
 * Bounding box coordinates
 */
export interface BBox {
  bbox: [GeoPoint, GeoPoint]
}

/**
 * Inset properties for the map
 */
export interface Inset extends BBox {
  width: number
  top: number
  height: number
  left: number
}

/**
 * Region properties
 */
export interface Region {
  path: string
  name: string
}

/**
 * Map of regions by their code
 */
export interface RegionMap {
  [regionCode: string]: Region
}

/**
 * Map data properties
 */
export interface MapData {
  insets: Inset[]
  paths: RegionMap
  height: number
  projection: {
    type: string
    centralMeridian: number
  }
  width: number
}

export interface MapInterface {
  regions: Record<string, Region>
  scale: number
  transX: number
  transY: number
  container: HTMLElement
  canvas: SVGCanvasElement
  params: MapOptions & {
    labels?: {
      markers?: boolean
      regions?: boolean
    }
    series?: {
      markers?: SeriesConfig[]
      regions?: SeriesConfig[]
    }
  }

  // Series
  series: {
    markers: any[]
    regions: any[]
  }

  // Projection methods
  mercator: {
    convert: (lat: number, lng: number) => { x: number, y: number } | false
  }
  miller: {
    convert: (lat: number, lng: number) => { x: number, y: number } | false
  }

  // Internal properties
  _width: number
  _height: number
  _defaultWidth: number
  _defaultHeight: number
  _baseScale: number
  _baseTransX: number
  _baseTransY: number
  _markers?: Record<string, Marker>
  _lines?: Record<string, any>
  _linesGroup?: any
  _markersGroup?: any
  _markerLabelsGroup?: any
  _regionLabelsGroup?: any
  _mapData: MapData
  _tooltip?: Tooltip

  // Methods
  setBackgroundColor: (color: string) => void
  getSelectedRegions: () => string[]
  clearSelectedRegions: (regions?: string[] | undefined) => void
  setSelectedRegions: (regions: string[]) => void
  getSelectedMarkers: () => string[]
  clearSelectedMarkers: () => void
  setSelectedMarkers: (markers: string[]) => void
  addMarkers: (config: MarkerConfig | MarkerConfig[]) => void
  removeMarkers: (markers?: string[]) => void
  addLine: (from: string, to: string, style?: Record<string, string | number>) => void
  addLines: (config: LineConfig[]) => void
  removeLines: (lines: LineConfig[] | string[]) => void
  removeLine: (from: string, to: string) => void
  reset: () => void
  updateSize: () => void
  setFocus: (config: FocusOnOptions) => void
  getInsetForPoint: (x: number, y: number) => any
  getMarkerPosition: (config: MarkerConfig) => { x: number, y: number } | false
  coordsToPoint: (lat: number, lng: number) => { x: number, y: number } | false

  // Internal methods
  _repositionMarkers: () => void
  _repositionLines: () => void
  _repositionLabels: () => void
  _setScale: (scale: number, transX: number, transY: number, isDrag?: boolean, animate?: boolean) => void
  _applyTransform: () => void
  _emit: (eventName: string, args: any[]) => void
}

export interface Region {
  element: {
    shape: {
      style: {
        initial: Record<string, string | number>
      }
      getBBox: () => { x: number, y: number, width: number, height: number }
    }
    select: (state: boolean) => void
    isSelected: boolean
    setStyle: (property: string, value: string) => void
    updateLabelPosition: () => void
  }
}

export interface Marker {
  _uid: string
  config: MarkerConfig
  element: MarkerInstance
}

export interface Line {
  element: {
    remove: () => void
  }
  dispose: () => void
  getConfig: () => LineConfig
  setStyle: (style: Record<string, string | number>) => void
}

export interface EventRegistry {
  [uid: string]: {
    selector: HTMLElement
    handler: EventListenerOrEventListenerObject
  }
}

export interface SVGCanvasElement {
  createGroup: (id: string) => SVGElement
  createPath: (config: Record<string, any>) => SVGElement
  createCircle: (config: Record<string, any>) => SVGElement
  createImage: (config: Record<string, any>) => SVGElement
  createText: (config: Record<string, any>) => SVGElement
  applyTransformParams: (scale: number, transX: number, transY: number) => void
}

export interface LegendOptions {
  map: MapInterface
  series: any
  cssClass?: string
  title?: string
  labelRender?: (label: string) => string
  vertical?: boolean
}

export interface ScaleOptions {
  scale: Record<string, string>
}

export interface SeriesOptions {
  values?: Record<string, number | string>
  attribute?: string
  attributes?: Record<string, string>
  scale?: Record<string, string> | any
  legend?: LegendOptions
}

export interface RegionStyle {
  initial?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    [key: string]: any
  }
  hover?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    [key: string]: any
  }
  selected?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    [key: string]: any
  }
  selectedHover?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    [key: string]: any
  }
}

export interface RegionLabelStyle {
  initial?: {
    fontFamily?: string
    fontSize?: string | number
    fill?: string
    [key: string]: any
  }
  hover?: {
    fontFamily?: string
    fontSize?: string | number
    fill?: string
    [key: string]: any
  }
  selected?: {
    fontFamily?: string
    fontSize?: string | number
    fill?: string
    [key: string]: any
  }
  selectedHover?: {
    fontFamily?: string
    fontSize?: string | number
    fill?: string
    [key: string]: any
  }
}

export interface MarkerLabelStyle {
  initial?: {
    fontFamily?: string
    fontSize?: string | number
    fill?: string
    [key: string]: any
  }
  hover?: {
    fontFamily?: string
    fontSize?: string | number
    fill?: string
    [key: string]: any
  }
  selected?: {
    fontFamily?: string
    fontSize?: string | number
    fill?: string
    [key: string]: any
  }
  selectedHover?: {
    fontFamily?: string
    fontSize?: string | number
    fill?: string
    [key: string]: any
  }
}

export interface MarkerInstance {
  constructor: (config: MarkerConstructorConfig, style: MarkerStyle) => void
  select: (state: boolean) => void
  isSelected: boolean
  remove: () => void
  setStyle: (property: string, value: string | number) => void
  updateLabelPosition: () => void
}

export interface SeriesInstance {
  constructor: (
    config: SeriesConfig,
    elements: Record<string, any>,
    map: MapInterface
  ) => void
  setValues: (values: Record<string, number>) => void
  clear: () => void
  scale: string[]
  values: Record<string, number>
  attribute: string
}

// Add to window object if in browser environment
declare global {
  interface Window {
    VectorMap: typeof VectorMap
  }
}
