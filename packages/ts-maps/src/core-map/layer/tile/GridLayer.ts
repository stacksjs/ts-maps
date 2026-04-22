import Browser from '../../core/Browser'
import * as Util from '../../core/Util'
import * as DomUtil from '../../dom/DomUtil'
import { LatLngBounds } from '../../geo/LatLngBounds'
import { Bounds } from '../../geometry/Bounds'
import { Point } from '../../geometry/Point'
import { Layer } from '../Layer'

interface TileEntry {
  el: HTMLElement
  coords: Point & { z: number }
  current: boolean
  loaded?: number
  active?: boolean
  retain?: boolean
}

interface Level {
  el: HTMLElement
  origin: Point
  zoom: number
}

// Generic class for handling a tiled grid of HTML elements.
export class GridLayer extends Layer {
  declare _container?: HTMLElement
  declare _levels: Record<string | number, Level>
  declare _tiles: Record<string, TileEntry>
  declare _level?: Level
  declare _tileZoom?: number
  declare _fadeFrame?: number
  declare _pruneTimeout?: ReturnType<typeof setTimeout>
  declare _noPrune?: boolean
  declare _loading?: boolean
  declare _globalTileRange?: Bounds
  declare _wrapX?: [number, number] | false
  declare _wrapY?: [number, number] | false
  declare _tileSize?: Point
  _onMove?: (...args: any[]) => void
  _abortLoading?(): void

  initialize(options?: any): void {
    Util.setOptions(this as any, options)
  }

  onAdd(_map?: any): void {
    this._initContainer()
    this._levels = {}
    this._tiles = {}
    this._resetView()
  }

  beforeAdd(map: any): void {
    map._addZoomLimit(this)
  }

  onRemove(map: any): void {
    this._removeAllTiles()
    this._container?.remove()
    map._removeZoomLimit(this)
    this._container = undefined
    this._tileZoom = undefined
    clearTimeout(this._pruneTimeout as any)
  }

  bringToFront(): this {
    if (this._map) {
      DomUtil.toFront(this._container!)
      this._setAutoZIndex(Math.max)
    }
    return this
  }

  bringToBack(): this {
    if (this._map) {
      DomUtil.toBack(this._container!)
      this._setAutoZIndex(Math.min)
    }
    return this
  }

  getContainer(): HTMLElement | undefined {
    return this._container
  }

  setOpacity(opacity: number): this {
    this.options!.opacity = opacity
    this._updateOpacity()
    return this
  }

  setZIndex(zIndex: number): this {
    this.options!.zIndex = zIndex
    this._updateZIndex()
    return this
  }

  isLoading(): boolean | undefined {
    return this._loading
  }

  redraw(): this {
    if (this._map) {
      this._removeAllTiles()
      const tileZoom = this._clampZoom(this._map.getZoom())
      if (tileZoom !== this._tileZoom) {
        this._tileZoom = tileZoom
        this._updateLevels()
      }
      this._update()
    }
    return this
  }

  getEvents(): Record<string, any> {
    const events: Record<string, any> = {
      viewprereset: this._invalidateAll,
      viewreset: this._resetView,
      zoom: this._resetView,
      moveend: this._onMoveEnd,
    }

    if (!this.options!.updateWhenIdle) {
      if (!this._onMove)
      this._onMove = Util.throttle(this._onMoveEnd, this.options!.updateInterval, this)
      events.move = this._onMove
    }

    if (this._zoomAnimated)
    events.zoomanim = this._animateZoom

    return events
  }

  createTile(_coords?: any, _done?: any): HTMLElement {
    return document.createElement('div')
  }

  getTileSize(): Point {
    const s = this.options!.tileSize
    return s instanceof Point ? s : new Point(s, s)
  }

  _updateZIndex(): void {
    if (this._container && this.options!.zIndex !== undefined && this.options!.zIndex !== null)
    this._container.style.zIndex = this.options!.zIndex
  }

  _setAutoZIndex(compare: (a: number, b: number) => number): void {
    const layers = this.getPane().children
    let edgeZIndex = -compare(-Infinity, Infinity)
    for (const layer of Array.from(layers) as HTMLElement[]) {
      const zIndex = layer.style.zIndex
      if (layer !== this._container && zIndex)
      edgeZIndex = compare(edgeZIndex, +zIndex)
    }
    if (Number.isFinite(edgeZIndex)) {
      this.options!.zIndex = edgeZIndex + compare(-1, 1)
      this._updateZIndex()
    }
  }

  _updateOpacity(): void {
    if (!this._map)
    return

    this._container!.style.opacity = String(this.options!.opacity)

    const now = Date.now()
    let nextFrame = false
    let willPrune = false

    for (const tile of Object.values(this._tiles ?? {})) {
      if (!tile.current || !tile.loaded)
      continue

      const fade = Math.min(1, (now - tile.loaded) / 200)
      tile.el.style.opacity = String(fade)
      if (fade < 1) {
        nextFrame = true
      }
      else {
        if (tile.active)
        willPrune = true
        else
        this._onOpaqueTile(tile)
        tile.active = true
      }
    }

    if (willPrune && !this._noPrune)
    this._pruneTiles()

    if (nextFrame) {
      if (this._fadeFrame !== undefined)
      cancelAnimationFrame(this._fadeFrame)
      this._fadeFrame = requestAnimationFrame(this._updateOpacity.bind(this))
    }
  }

  _onOpaqueTile(_tile?: TileEntry): void {}

  _initContainer(): void {
    if (this._container)
    return
    this._container = DomUtil.create('div', `tsmap-layer ${this.options!.className ?? ''}`)
    this._updateZIndex()
    if (this.options!.opacity < 1)
    this._updateOpacity()
    this.getPane().appendChild(this._container)
  }

  _updateLevels(): Level | undefined {
    const zoom = this._tileZoom
    const maxZoom = this.options!.maxZoom

    if (zoom === undefined)
    return undefined

    for (let z of Object.keys(this._levels)) {
      const zNum = Number(z)
      z = zNum as any
      if (this._levels[zNum].el.children.length || zNum === zoom) {
        this._levels[zNum].el.style.zIndex = String(maxZoom - Math.abs(zoom - zNum))
        this._onUpdateLevel(zNum)
      }
      else {
        this._levels[zNum].el.remove()
        this._removeTilesAtZoom(zNum)
        this._onRemoveLevel(zNum)
        delete this._levels[zNum]
      }
    }

    let level = this._levels[zoom]
    const map = this._map

    if (!level) {
      level = this._levels[zoom] = {} as Level
      level.el = DomUtil.create('div', 'tsmap-tile-container tsmap-zoom-animated', this._container)
      level.el.style.zIndex = String(maxZoom)
      level.origin = map.project(map.unproject(map.getPixelOrigin()), zoom).round()
      level.zoom = zoom
      this._setZoomTransform(level, map.getCenter(), map.getZoom())
      Util.falseFn(level.el.offsetWidth)
      this._onCreateLevel(level)
    }

    this._level = level
    return level
  }

  _onUpdateLevel(_z: number): void {}
  _onRemoveLevel(_z: number): void {}
  _onCreateLevel(_level: Level): void {}

  _pruneTiles(): void {
    if (!this._map)
    return

    const zoom = this._map.getZoom()
    if (zoom > this.options!.maxZoom || zoom < this.options!.minZoom) {
      this._removeAllTiles()
      return
    }

    for (const tile of Object.values(this._tiles))
    tile.retain = tile.current

    for (const tile of Object.values(this._tiles)) {
      if (tile.current && !tile.active) {
        const coords = tile.coords
        if (!this._retainParent(coords.x, coords.y, coords.z, coords.z - 5))
        this._retainChildren(coords.x, coords.y, coords.z, coords.z + 2)
      }
    }

    for (const [key, tile] of Object.entries(this._tiles)) {
      if (!tile.retain)
      this._removeTile(key)
    }
  }

  _removeTilesAtZoom(zoom: number): void {
    for (const [key, tile] of Object.entries(this._tiles)) {
      if (tile.coords.z === zoom)
      this._removeTile(key)
    }
  }

  _removeAllTiles(): void {
    for (const key of Object.keys(this._tiles))
    this._removeTile(key)
  }

  _invalidateAll(): void {
    for (const z of Object.keys(this._levels)) {
      this._levels[z].el.remove()
      this._onRemoveLevel(Number(z))
      delete this._levels[z]
    }
    this._removeAllTiles()
    this._tileZoom = undefined
  }

  _retainParent(x: number, y: number, z: number, minZoom: number): boolean {
    const x2 = Math.floor(x / 2)
    const y2 = Math.floor(y / 2)
    const z2 = z - 1
    const coords2 = new Point(x2, y2) as Point & { z: number }
    coords2.z = z2

    const key = this._tileCoordsToKey(coords2)
    const tile = this._tiles[key]

    if (tile?.active) {
      tile.retain = true
      return true
    }
    else if (tile?.loaded) {
      tile.retain = true
    }

    if (z2 > minZoom)
    return this._retainParent(x2, y2, z2, minZoom)

    return false
  }

  _retainChildren(x: number, y: number, z: number, maxZoom: number): void {
    for (let i = 2 * x; i < 2 * x + 2; i++) {
      for (let j = 2 * y; j < 2 * y + 2; j++) {
        const coords = new Point(i, j) as Point & { z: number }
        coords.z = z + 1
        const key = this._tileCoordsToKey(coords)
        const tile = this._tiles[key]
        if (tile?.active) {
          tile.retain = true
          continue
        }
        else if (tile?.loaded) {
          tile.retain = true
        }
        if (z + 1 < maxZoom)
        this._retainChildren(i, j, z + 1, maxZoom)
      }
    }
  }

  _resetView(e?: any): void {
    const animating = e && (e.pinch || e.flyTo)
    this._setView(this._map.getCenter(), this._map.getZoom(), animating, animating)
  }

  _animateZoom(e: any): void {
    this._setView(e.center, e.zoom, true, e.noUpdate)
  }

  _clampZoom(zoom: number): number {
    const options = this.options!
    if (options.minNativeZoom !== undefined && zoom < options.minNativeZoom)
    return options.minNativeZoom
    if (options.maxNativeZoom !== undefined && options.maxNativeZoom < zoom)
    return options.maxNativeZoom
    return zoom
  }

  _setView(center: any, zoom: number, noPrune?: boolean, noUpdate?: boolean): void {
    let tileZoom: number | undefined = Math.round(zoom)
    if (
    (this.options!.maxZoom !== undefined && tileZoom > this.options!.maxZoom)
    || (this.options!.minZoom !== undefined && tileZoom < this.options!.minZoom)
    ) {
      tileZoom = undefined
    }
    else {
      tileZoom = this._clampZoom(tileZoom)
    }

    const tileZoomChanged = this.options!.updateWhenZooming && (tileZoom !== this._tileZoom)

    if (!noUpdate || tileZoomChanged) {
      this._tileZoom = tileZoom
      if (this._abortLoading)
      this._abortLoading()

      this._updateLevels()
      this._resetGrid()

      if (tileZoom !== undefined)
      this._update(center)

      if (!noPrune)
      this._pruneTiles()

      this._noPrune = !!noPrune
    }

    this._setZoomTransforms(center, zoom)
  }

  _setZoomTransforms(center: any, zoom: number): void {
    for (const level of Object.values(this._levels))
    this._setZoomTransform(level, center, zoom)
  }

  _setZoomTransform(level: Level, center: any, zoom: number): void {
    const scale = this._map.getZoomScale(zoom, level.zoom)
    const translate = level.origin.multiplyBy(scale).subtract(this._map._getNewPixelOrigin(center, zoom)).round()
    DomUtil.setTransform(level.el, translate, scale)
  }

  _resetGrid(): void {
    const map = this._map
    const crs = map.options.crs
    const tileSize = this._tileSize = this.getTileSize()
    const tileZoom = this._tileZoom!

    const bounds = this._map.getPixelWorldBounds(this._tileZoom)
    if (bounds)
    this._globalTileRange = this._pxBoundsToTileRange(bounds)

    this._wrapX = crs.wrapLng && !this.options!.noWrap && [
    Math.floor(map.project([0, crs.wrapLng[0]], tileZoom).x / tileSize.x),
    Math.ceil(map.project([0, crs.wrapLng[1]], tileZoom).x / tileSize.y),
    ]
    this._wrapY = crs.wrapLat && !this.options!.noWrap && [
    Math.floor(map.project([crs.wrapLat[0], 0], tileZoom).y / tileSize.x),
    Math.ceil(map.project([crs.wrapLat[1], 0], tileZoom).y / tileSize.y),
    ]
  }

  _onMoveEnd(): void {
    if (!this._map || this._map._animatingZoom)
    return
    this._update()
  }

  _getTiledPixelBounds(center: any): Bounds {
    const map = this._map
    const mapZoom = map._animatingZoom ? Math.max(map._animateToZoom, map.getZoom()) : map.getZoom()
    const scale = map.getZoomScale(mapZoom, this._tileZoom as number)
    const pixelCenter = map.project(center, this._tileZoom as number).floor()
    const halfSize = map.getSize().divideBy(scale * 2)
    return new Bounds(pixelCenter.subtract(halfSize), pixelCenter.add(halfSize))
  }

  _update(center?: any): void {
    const map = this._map
    if (!map)
    return
    const zoom = this._clampZoom(map.getZoom())

    if (center === undefined)
    center = map.getCenter()
    if (this._tileZoom === undefined)
    return

    const pixelBounds = this._getTiledPixelBounds(center)
    const tileRange = this._pxBoundsToTileRange(pixelBounds)
    const tileCenter = tileRange.getCenter()
    const queue: Array<Point & { z: number }> = []
    const margin = this.options!.keepBuffer
    const noPruneRange = new Bounds(
    tileRange.getBottomLeft().subtract([margin, -margin]),
    tileRange.getTopRight().add([margin, -margin]),
    )

    if (
    !(Number.isFinite(tileRange.min.x)
    && Number.isFinite(tileRange.min.y)
    && Number.isFinite(tileRange.max.x)
    && Number.isFinite(tileRange.max.y))
    ) {
      throw new Error('Attempted to load an infinite number of tiles')
    }

    for (const tile of Object.values(this._tiles)) {
      const c = tile.coords
      if (c.z !== this._tileZoom || !noPruneRange.contains(new Point(c.x, c.y)))
      tile.current = false
    }

    if (Math.abs(zoom - this._tileZoom) > 1) {
      this._setView(center, zoom)
      return
    }

    for (let j = tileRange.min.y; j <= tileRange.max.y; j++) {
      for (let i = tileRange.min.x; i <= tileRange.max.x; i++) {
        const coords = new Point(i, j) as Point & { z: number }
        coords.z = this._tileZoom

        if (!this._isValidTile(coords))
        continue

        const tile = this._tiles[this._tileCoordsToKey(coords)]
        if (tile)
        tile.current = true
        else
        queue.push(coords)
      }
    }

    queue.sort((a, b) => a.distanceTo(tileCenter) - b.distanceTo(tileCenter))

    if (queue.length !== 0) {
      if (!this._loading) {
        this._loading = true
        this.fire('loading')
      }

      const fragment = document.createDocumentFragment()
      for (const q of queue)
      this._addTile(q, fragment)
      this._level!.el.appendChild(fragment)
    }
  }

  _isValidTile(coords: Point & { z: number }): boolean {
    const crs = this._map.options.crs
    if (!crs.infinite) {
      const bounds = this._globalTileRange!
      if (
      (!crs.wrapLng && (coords.x < bounds.min.x || coords.x > bounds.max.x))
      || (!crs.wrapLat && (coords.y < bounds.min.y || coords.y > bounds.max.y))
      ) {
        return false
      }
    }
    if (!this.options!.bounds)
    return true
    const tileBounds = this._tileCoordsToBounds(coords)
    return new LatLngBounds(this.options!.bounds).overlaps(tileBounds)
  }

  _keyToBounds(key: string): LatLngBounds {
    return this._tileCoordsToBounds(this._keyToTileCoords(key))
  }

  _tileCoordsToNwSe(coords: Point & { z: number }): [any, any] {
    const map = this._map
    const tileSize = this.getTileSize()
    const nwPoint = coords.scaleBy(tileSize)
    const sePoint = nwPoint.add(tileSize)
    const nw = map.unproject(nwPoint, coords.z)
    const se = map.unproject(sePoint, coords.z)
    return [nw, se]
  }

  _tileCoordsToBounds(coords: Point & { z: number }): LatLngBounds {
    const bp = this._tileCoordsToNwSe(coords)
    let bounds = new LatLngBounds(bp[0], bp[1])
    if (!this.options!.noWrap)
    bounds = this._map.wrapLatLngBounds(bounds)
    return bounds
  }

  _tileCoordsToKey(coords: Point & { z: number }): string {
    return `${coords.x}:${coords.y}:${coords.z}`
  }

  _keyToTileCoords(key: string): Point & { z: number } {
    const k = key.split(':')
    const coords = new Point(+k[0], +k[1]) as Point & { z: number }
    coords.z = +k[2]
    return coords
  }

  _removeTile(key: string): void {
    const tile = this._tiles[key]
    if (!tile)
    return
    tile.el.remove()
    delete this._tiles[key]
    this.fire('tileunload', { tile: tile.el, coords: this._keyToTileCoords(key) })
  }

  _initTile(tile: HTMLElement): void {
    tile.classList.add('tsmap-tile')
    const tileSize = this.getTileSize()
    tile.style.width = `${tileSize.x}px`
    tile.style.height = `${tileSize.y}px`
    ; (tile as any).onselectstart = Util.falseFn
    ; (tile as any).onpointermove = Util.falseFn
  }

  _addTile(coords: Point & { z: number }, container: DocumentFragment): void {
    const tilePos = this._getTilePos(coords)
    const key = this._tileCoordsToKey(coords)

    const tile = this.createTile(this._wrapCoords(coords), this._tileReady.bind(this, coords))

    this._initTile(tile)

    if (this.createTile.length < 2)
    requestAnimationFrame(this._tileReady.bind(this, coords, null, tile))

    DomUtil.setPosition(tile, tilePos)

    this._tiles[key] = { el: tile, coords, current: true }

    container.appendChild(tile)
    this.fire('tileloadstart', { tile, coords })
  }

  _tileReady(coords: Point & { z: number }, err?: any, tile?: HTMLElement): void {
    if (err)
    this.fire('tileerror', { error: err, tile, coords })

    const key = this._tileCoordsToKey(coords)
    const entry = this._tiles[key]
    if (!entry)
    return

    entry.loaded = Date.now()
    if (this._map._fadeAnimated) {
      entry.el.style.opacity = '0'
      if (this._fadeFrame !== undefined)
      cancelAnimationFrame(this._fadeFrame)
      this._fadeFrame = requestAnimationFrame(this._updateOpacity.bind(this))
    }
    else {
      entry.active = true
      this._pruneTiles()
    }

    if (!err) {
      entry.el.classList.add('tsmap-tile-loaded')
      this.fire('tileload', { tile: entry.el, coords })
    }

    if (this._noTilesToLoad()) {
      this._loading = false
      this.fire('load')

      if (!this._map._fadeAnimated)
      requestAnimationFrame(this._pruneTiles.bind(this))
      else
      this._pruneTimeout = setTimeout(this._pruneTiles.bind(this), 250)
    }
  }

  _getTilePos(coords: Point & { z: number }): Point {
    return coords.scaleBy(this.getTileSize()).subtract(this._level!.origin)
  }

  _wrapCoords(coords: Point & { z: number }): Point & { z: number } {
    const newCoords = new Point(
    this._wrapX ? Util.wrapNum(coords.x, this._wrapX) : coords.x,
    this._wrapY ? Util.wrapNum(coords.y, this._wrapY) : coords.y,
    ) as Point & { z: number }
    newCoords.z = coords.z
    return newCoords
  }

  _pxBoundsToTileRange(bounds: Bounds): Bounds {
    const tileSize = this.getTileSize()
    return new Bounds(
    bounds.min.unscaleBy(tileSize).floor(),
    bounds.max.unscaleBy(tileSize).ceil().subtract([1, 1]),
    )
  }

  _noTilesToLoad(): boolean {
    return Object.values(this._tiles).every(t => !!t.loaded)
  }
}

GridLayer.setDefaultOptions( {
  tileSize: 256,
  opacity: 1,
  updateWhenIdle: Browser.mobile,
  updateWhenZooming: true,
  updateInterval: 200,
  zIndex: 1,
  bounds: null,
  minZoom: 0,
  maxZoom: undefined,
  maxNativeZoom: undefined,
  minNativeZoom: undefined,
  noWrap: false,
  pane: 'tilePane',
  className: '',
  keepBuffer: 2,
})
