import type {
  DataVisualizationOptions,
  FocusOnOptions,
  Line,
  LineConfig,
  MapOptions,
  Marker,
  MarkerConfig,
  Region,
} from './types'
import Tooltip from './components/tooltip'
import core from './core'
import DataVisualization from './data-visualization'
import Events from './defaults/events'
import Defaults from './defaults/options'
import EventHandler from './event-handler'
import SVGCanvasElement from './svg/canvasElement'
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

export class Map {
  static maps: Record<string, any> = {}
  static defaults = Defaults

  // Public properties
  params: MapOptions
  regions: Record<string, Region> = {}
  scale: number = 1
  transX: number = 0
  transY: number = 0
  container!: HTMLElement
  canvas!: SVGCanvasElement
  dataVisualization?: DataVisualization
  legendHorizontal?: HTMLElement
  legendVertical?: HTMLElement
  series?: Record<string, any[]>

  // Private properties
  private _mapData: any
  private _markers: Record<string, Marker> = {}
  private _lines: Record<string, Line> = {}
  private _defaultWidth: number
  private _defaultHeight: number
  private _height: number = 0
  private _width: number = 0
  private _baseScale: number = 1
  private _baseTransX: number = 0
  private _baseTransY: number = 0
  private _tooltip?: Tooltip
  private _linesGroup?: SVGElement
  private _markersGroup?: SVGElement
  private _markerLabelsGroup?: SVGElement

  constructor(options: MapOptions = {} as MapOptions) {
    // Merge the given options with the default options
    this.params = merge(Map.defaults, options, true) as MapOptions

    // Throw an error if the given map name doesn't match
    // the map that was set in map file
    if (!Map.maps[this.params.map]) {
      throw new Error(`Attempt to use map which was not loaded: ${options.map}`)
    }

    this._mapData = Map.maps[this.params.map]
    this._defaultWidth = this._mapData.width
    this._defaultHeight = this._mapData.height

    // `document` is already ready, just initialize now
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

    this.container = getElement(options.selector)
    this.container.classList.add(CONTAINER_CLASS)

    // The map canvas element
    this.canvas = new SVGCanvasElement(this.container)

    // Set the map's background color
    this.setBackgroundColor(options.backgroundColor || '')

    // Create regions
    this._createRegions()

    // Update size
    this.updateSize()

    // Lines group must be created before markers
    // Otherwise the lines will be drawn on top of the markers.
    if (options.lines?.elements) {
      this._linesGroup = this.canvas.createGroup(LINES_GROUP_ID)
    }

    if (options.markers) {
      this._markersGroup = this.canvas.createGroup(MARKERS_GROUP_ID)
      this._markerLabelsGroup = this.canvas.createGroup(MARKERS_LABELS_GROUP_ID)
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
      if (
        ('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch)
      ) {
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

  clearSelectedRegions(regions: string[] | undefined = undefined): void {
    regions = this._normalizeRegions(regions) || this._getSelected('regions')
    regions.forEach((key) => {
      this.regions[key].element.select(false)
    })
  }

  setSelectedRegions(regions: string | string[]): void {
    this.clearSelectedRegions()
    this._setSelected('regions', this._normalizeRegions(regions))
  }

  // Markers

  getSelectedMarkers(): string[] {
    return this._getSelected('_markers')
  }

  clearSelectedMarkers(): void {
    this._clearSelected('_markers')
  }

  setSelectedMarkers(markers: string | string[]): void {
    this._setSelected('_markers', this._normalizeRegions(markers))
  }

  addMarkers(config: MarkerConfig | MarkerConfig[]): void {
    config = Array.isArray(config) ? config : [config]
    this._createMarkers(config, true)
  }

  removeMarkers(markers?: string[]): void {
    if (!markers) {
      markers = Object.keys(this._markers)
    }

    markers.forEach((index) => {
      // Remove the element from the DOM
      this._markers[index].element.remove()
      // Remove the element from markers object
      delete this._markers[index]
    })
  }

  // Lines

  addLine(from: string, to: string, style: Record<string, any> = {}): void {
    console.warn('`addLine` method is deprecated, please use `addLines` instead.')
    this._createLines([{ from, to, style }], true)
  }

  addLines(config: LineConfig | LineConfig[]): void {
    const uids = this._getLinesAsUids()

    if (!Array.isArray(config)) {
      config = [config]
    }

    this._createLines(config.filter((line) => {
      return !(uids.includes(getLineUid(line.from, line.to)))
    }), true)
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

    if (this._lines.hasOwnProperty(uid)) {
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
        catch (e) {}
      })
    }
  }

  extend(name: string, callback: (...args: any[]) => void): void {
    if (typeof (this as any)[name] === 'function') {
      throw new TypeError(`The method [${name}] does already exist, please use another name.`)
    }

    (Map.prototype as any)[name] = callback
  }

  // Private

  _emit(eventName: string, args: any[]): void {
    for (const event in Events) {
      if (Events[event] === eventName && typeof this.params[event] === 'function') {
        this.params[event]?.apply(this, args)
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

  _createMarkers(markers: MarkerConfig[], isRecentlyCreated = false): void {
    // Implementation will be added
  }

  _createLines(lines: LineConfig[], isRecentlyCreated = false): void {
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

  setFocus(config: FocusOnOptions): void {
    // Implementation will be added
  }
}

Object.assign(Map.prototype, core)

export default Map
