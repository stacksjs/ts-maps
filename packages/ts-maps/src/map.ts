import type {
  FocusOnOptions,
  Line,
  LineConfig,
  MapData,
  MapInterface,
  MapOptions,
  Marker,
  MarkerConfig,
  Region,
  SVGCanvasElement as SVGCanvasElementInterface,
} from './types'
import Tooltip from './components/tooltip'
import core from './core'
import DataVisualization from './data-visualization'
import Events from './defaults/events'
import Defaults from './defaults/options'
import EventHandler from './event-handler'
import Projection from './projection'
import SVGCanvasElement from './svg/canvas-element'
import SVGElement from './svg/base-element'
import {
  createElement,
  getElement,
  getLineUid,
  merge,
  removeElement,
} from './util'

const JVM_PREFIX = 'jvm-'
const CONTAINER_CLASS = `${JVM_PREFIX}container`
const MARKERS_GROUP_ID = `${JVM_PREFIX}markers-group`
const MARKERS_LABELS_GROUP_ID = `${JVM_PREFIX}markers-labels-group`
const LINES_GROUP_ID = `${JVM_PREFIX}lines-group`
const SERIES_CONTAINER_CLASS = `${JVM_PREFIX}series-container`
const SERIES_CONTAINER_H_CLASS = `${SERIES_CONTAINER_CLASS} ${JVM_PREFIX}series-h`
const SERIES_CONTAINER_V_CLASS = `${SERIES_CONTAINER_CLASS} ${JVM_PREFIX}series-v`

export class Map implements MapInterface {
  static maps: { [key: string]: MapData & { [key: string]: any } } = {}
  static defaults: MapOptions = Defaults

  // Public properties
  params: MapOptions
  regions: Record<string, Region> = {}
  scale: number = 1
  transX: number = 0
  transY: number = 0
  container!: HTMLElement
  canvas!: SVGCanvasElementInterface
  dataVisualization?: DataVisualization
  legendHorizontal?: HTMLElement
  legendVertical?: HTMLElement
  series: { markers: any[], regions: any[], [key: string]: any[] } = { markers: [], regions: [] }

  // Properties required by MapInterface
  _mapData: MapData
  _markers: Record<string, Marker> = {}
  _lines: Record<string, Line> = {}
  _defaultWidth: number
  _defaultHeight: number
  _height: number = 0
  _width: number = 0
  _baseScale: number = 1
  _baseTransX: number = 0
  _baseTransY: number = 0
  _tooltip?: Tooltip
  _linesGroup?: SVGElement
  _markersGroup?: SVGElement
  _markerLabelsGroup?: SVGElement
  _canvasImpl!: SVGCanvasElement

  constructor(options: MapOptions = {} as MapOptions) {
    // Merge the given options with the default options
    this.params = merge(Map.defaults, options, true) as MapOptions

    // Throw an error if the given map name doesn't match
    // the map that was set in map file
    const mapParam = this.params.map
    const mapName = typeof mapParam === 'string' ? mapParam : mapParam.name
    const mapData = Map.maps[mapName]
    if (!mapData) {
      throw new Error(`Attempt to use map which was not loaded: ${mapName}`)
    }

    this._mapData = mapData
    this._defaultWidth = this._mapData.width
    this._defaultHeight = this._mapData.height

    // `document` is ready, just initialize now
    if (document.readyState !== 'loading') {
      this._init()
    }
    else {
      // Wait until `document` is ready
      window.addEventListener('DOMContentLoaded', () => this._init())
    }
  }

  _init(): void {
    const options = this.params

    const element = getElement(options.selector)
    if (!element) {
      throw new Error(`Element not found: ${options.selector}`)
    }
    this.container = element as HTMLElement
    this.container.classList.add(CONTAINER_CLASS)

    // The map canvas element
    this._canvasImpl = new SVGCanvasElement(this.container)
    this.canvas = this._canvasImpl as unknown as SVGCanvasElementInterface

    // Set the map's background color
    this.setBackgroundColor(options.backgroundColor || '')

    // Create regions
    this._createRegions()

    // Update size
    this.updateSize()

    // Lines group must be created before markers
    // Otherwise the lines will be drawn on top of the markers.
    if (options.lines?.elements) {
      const group = this._canvasImpl.createGroup(LINES_GROUP_ID)
      if (!group) {
        throw new TypeError('Failed to create lines group')
      }
      this._linesGroup = group
    }

    if (options.markers) {
      const markersGroup = this._canvasImpl.createGroup(MARKERS_GROUP_ID)
      const labelsGroup = this._canvasImpl.createGroup(MARKERS_LABELS_GROUP_ID)
      if (!markersGroup || !labelsGroup) {
        throw new TypeError('Failed to create markers groups')
      }

      this._markersGroup = markersGroup
      this._markerLabelsGroup = labelsGroup
    }

    // Create markers
    this._createMarkers(options.markers || [])

    // Create lines
    this._createLines(options.lines?.elements || [])

    // Position labels
    this._repositionLabels()

    // Setup the container events
    this._setupContainerEvents()

    // Setup regions/markers events
    this._setupElementEvents()

    // Create zoom buttons if `zoomButtons` is presented
    if (options.zoomButtons) {
      this._setupZoomButtons()
    }

    // Create toolip
    if (options.showTooltip) {
      this._tooltip = new Tooltip(this)
    }

    // Set selected regions if any
    if (options.selectedRegions) {
      this._setSelected('regions', options.selectedRegions)
    }

    // Set selected regions if any
    if (options.selectedMarkers) {
      this._setSelected('_markers', options.selectedMarkers)
    }

    // Set focus on a spcific region
    if (options.focusOn) {
      this.setFocus(options.focusOn)
    }

    // Data visualization
    if (options.visualizeData) {
      this.dataVisualization = new DataVisualization(options.visualizeData, this)
    }

    // Bind touch events if true
    if (options.bindTouchEvents) {
      if ('ontouchstart' in window) {
        this._setupContainerTouchEvents()
      }
    }

    // Create series if any
    if (options.series) {
      this.container.appendChild(this.legendHorizontal = createElement(
        'div',
        SERIES_CONTAINER_H_CLASS,
      ))

      this.container.appendChild(this.legendVertical = createElement(
        'div',
        SERIES_CONTAINER_V_CLASS,
      ))

      this._createSeries()
    }

    // Fire loaded event
    this._emit(Events.onLoaded, [this])
  }

  // Public

  setBackgroundColor(color: string): void {
    this.container.style.backgroundColor = color
  }

  // Regions

  getSelectedRegions(): string[] {
    return this._getSelected('regions')
  }

  clearSelectedRegions(regions?: string[]): void {
    const regionsToProcess = this._normalizeRegions(regions) || this._getSelected('regions')
    regionsToProcess.forEach((key) => {
      this.regions[key].element.select(false)
    })
  }

  setSelectedRegions(regions: string | string[]): void {
    this.clearSelectedRegions()
    const normalizedRegions = this._normalizeRegions(regions)
    if (normalizedRegions) {
      this._setSelected('regions', normalizedRegions)
    }
  }

  // Markers

  getSelectedMarkers(): string[] {
    return this._getSelected('_markers')
  }

  clearSelectedMarkers(): void {
    this._clearSelected('_markers')
  }

  setSelectedMarkers(markers: string | string[]): void {
    const normalizedMarkers = this._normalizeRegions(markers)
    if (normalizedMarkers) {
      this._setSelected('_markers', normalizedMarkers)
    }
  }

  addMarkers(config: MarkerConfig | MarkerConfig[]): void {
    const configs = Array.isArray(config) ? config : [config]
    this._createMarkers(configs, true)
  }

  removeMarkers(markers?: string[]): void {
    const toRemove = markers || Object.keys(this._markers)
    toRemove.forEach((index) => {
      const marker = this._markers[index] as any
      if (marker) {
        // Remove the marker using its own remove method
        if (typeof marker.remove === 'function') {
          marker.remove()
        }
        else if (marker.shape) {
          // Remove the shape
          marker.shape.remove()
          // Remove the label if it exists
          if (marker.label) {
            marker.label.remove()
          }
        }
        // Remove the element from markers object
        delete this._markers[index]
      }
    })
  }

  // Lines

  addLine(from: string, to: string, style: Record<string, any> = {}): void {
    console.warn('`addLine` method is deprecated, please use `addLines` instead.')
    this._createLines([{ from, to, style }])
  }

  addLines(config: LineConfig | LineConfig[]): void {
    const uids = this._getLinesAsUids()
    const configs = Array.isArray(config) ? config : [config]

    this._createLines(configs.filter((line) => {
      return !(uids.includes(getLineUid(line.from, line.to)))
    }))
  }

  removeLines(lines: LineConfig[] | string[]): void {
    if (Array.isArray(lines) && typeof lines[0] !== 'string') {
      lines = (lines as LineConfig[]).map(line => getLineUid(line.from, line.to))
    }
    else if (!Array.isArray(lines)) {
      lines = this._getLinesAsUids()
    }

    (lines as string[]).forEach((uid) => {
      this._lines[uid].dispose()
      delete this._lines[uid]
    })
  }

  removeLine(from: string, to: string): void {
    console.warn('`removeLine` method is deprecated, please use `removeLines` instead.')
    const uid = getLineUid(from, to)

    if (Object.prototype.hasOwnProperty.call(this._lines, uid)) {
      this._lines[uid].element.remove()
      delete this._lines[uid]
    }
  }

  // Reset map
  reset(): void {
    for (const key in this.series || {}) {
      for (let i = 0; i < (this.series?.[key]?.length || 0); i++) {
        this.series?.[key][i]?.clear()
      }
    }

    if (this.legendHorizontal) {
      removeElement(this.legendHorizontal)
      this.legendHorizontal = undefined
    }

    if (this.legendVertical) {
      removeElement(this.legendVertical)
      this.legendVertical = undefined
    }

    this.scale = this._baseScale
    this.transX = this._baseTransX
    this.transY = this._baseTransY

    this._applyTransform()
    this.clearSelectedMarkers()
    this.clearSelectedRegions()
    this.removeMarkers()
  }

  // Destroy the map
  destroy(destroyInstance = true): void {
    // Remove event registry
    EventHandler.flush()

    // Remove tooltip from DOM and memory
    this._tooltip?.dispose()

    // Fire destroyed event
    this._emit(Events.onDestroyed, [])

    // Remove references
    if (destroyInstance) {
      Object.keys(this).forEach((key) => {
        try {
          delete (this as any)[key]
        }
        catch {
          // Ignore errors
        }
      })
    }
  }

  extend(name: string, callback: (...args: any[]) => void): void {
    if (typeof (this as any)[name] === 'function') {
      throw new TypeError(`The method [${name}] does already exist, please use another name.`)
    }

    (Map.prototype as any)[name] = callback
  }

  // Required by MapInterface
  mercator = {
    convert: (lat: number, lng: number): false | { x: number, y: number } => {
      const centralMeridian = this._mapData.projection?.centralMeridian || 0
      const result = Projection.merc(lat, lng, centralMeridian)
      return result
    },
  }

  miller = {
    convert: (lat: number, lng: number): false | { x: number, y: number } => {
      const centralMeridian = this._mapData.projection?.centralMeridian || 0
      const result = Projection.mill(lat, lng, centralMeridian)
      return result
    },
  }

  getInsetForPoint(_x: number, _y: number): boolean {
    // Implementation will be added
    return false
  }

  getMarkerPosition(_config: MarkerConfig): false | { x: number, y: number } {
    // Implementation will be added
    return { x: 0, y: 0 }
  }

  coordsToPoint(_lat: number, _lng: number): false | { x: number, y: number } {
    // Implementation will be added
    return { x: 0, y: 0 }
  }

  _repositionMarkers(): void {
    // Implementation will be added
  }

  _repositionLines(): void {
    // Implementation will be added
  }

  _setScale(_scale: number): void {
    // Implementation will be added
  }

  // Private

  _emit(eventName: string, args: any[]): void {
    for (const event in Events) {
      if (Events[event as keyof typeof Events] === eventName && typeof this.params[event as keyof MapOptions] === 'function') {
        this.params[event as keyof MapOptions]?.apply(this, args)
      }
    }
  }

  // Get selected markers/regions
  _getSelected(type: string): string[] {
    const selected: string[] = []

    for (const key in (this as any)[type]) {
      if ((this as any)[type][key].element.isSelected) {
        selected.push(key)
      }
    }

    return selected
  }

  _setSelected(type: string, keys: string[]): void {
    keys.forEach((key) => {
      if ((this as any)[type][key]) {
        (this as any)[type][key].element.select(true)
      }
    })
  }

  _clearSelected(type: string): void {
    this._getSelected(type).forEach((key) => {
      (this as any)[type][key].element.select(false)
    })
  }

  _getLinesAsUids(): string[] {
    return Object.keys(this._lines)
  }

  _normalizeRegions(regions: string | string[] | undefined): string[] | undefined {
    if (!regions)
      return undefined
    return typeof regions === 'string' ? [regions] : regions
  }

  // Core methods
  _createRegions(): void {
    // Implementation will be added
  }

  _createMarkers(_markers: MarkerConfig[], isRecentlyCreated: boolean = false): void {
    // Implementation will be added
  }

  _createLines(_lines: LineConfig[]): void {
    // Implementation will be added
  }

  _createSeries(): void {
    // Implementation will be added
  }

  _repositionLabels(): void {
    // Implementation will be added
  }

  _setupContainerEvents(): void {
    // Implementation will be added
  }

  _setupElementEvents(): void {
    // Implementation will be added
  }

  _setupZoomButtons(): void {
    // Implementation will be added
  }

  _setupContainerTouchEvents(): void {
    // Implementation will be added
  }

  _applyTransform(): void {
    // Implementation will be added
  }

  updateSize(): void {
    // Implementation will be added
  }

  setFocus(_config: FocusOnOptions): void {
    // Implementation will be added
  }
}

Object.assign(Map.prototype, core)

export default Map
