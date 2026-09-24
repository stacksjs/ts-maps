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
  /** World tile range and wrap limits per zoom, for tiles off the main level. */
  declare _grids?: Map<number, { range: Bounds | undefined, wrapX: [number, number] | false, wrapY: [number, number] | false }>
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
      // Turning or tilting the camera changes which ground is in view (see
      // `_getTiledPixelBounds`) without moving the centre.
      rotateend: this._onMoveEnd,
      pitchend: this._onMoveEnd,
    }

    if (!this.options!.updateWhenIdle) {
      if (!this._onMove)
      this._onMove = Util.throttle(this._onMoveEnd, this.options!.updateInterval, this)
      events.move = this._onMove
      events.rotate = this._onMove
      events.pitch = this._onMove
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

    const level = this._levelFor(zoom)
    this._level = level
    return level
  }

  /**
   * The container for tiles of zoom `z`, created on first use.
   *
   * A flat map shows one level at a time, plus whatever is standing in during
   * a zoom. A tilted one shows several at once — fine tiles near the camera,
   * coarser ones in the distance — each in its own container scaled to the
   * current zoom.
   */
  _levelFor(z: number): Level {
    let level = this._levels[z]
    if (level)
    return level

    const map = this._map
    const maxZoom = this.options!.maxZoom ?? 30
    level = this._levels[z] = {} as Level
    level.el = DomUtil.create('div', 'tsmap-tile-container tsmap-zoom-animated', this._container)
    // Finer levels over coarser ones, wherever the two meet.
    level.el.style.zIndex = String(maxZoom - Math.abs((this._tileZoom ?? z) - z))
    level.origin = map.project(map.unproject(map.getPixelOrigin()), z).round()
    level.zoom = z
    this._setZoomTransform(level, map.getCenter(), map.getZoom())
    Util.falseFn(level.el.offsetWidth)
    this._onCreateLevel(level)
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
    const animating = e && (e.pinch || e.flyTo || e.relayout)
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
    this._grids = undefined

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

  /** The world's tile range and wrap limits at zoom `z`. */
  _gridFor(z: number): { range: Bounds | undefined, wrapX: [number, number] | false, wrapY: [number, number] | false } {
    if (z === this._tileZoom)
    return { range: this._globalTileRange, wrapX: this._wrapX ?? false, wrapY: this._wrapY ?? false }

    this._grids ??= new Map()
    const cached = this._grids.get(z)
    if (cached)
    return cached

    const map = this._map
    const crs = map.options.crs
    const tileSize = this.getTileSize()
    const bounds = map.getPixelWorldBounds(z)
    const grid = {
      range: bounds ? this._pxBoundsToTileRange(bounds) : undefined,
      wrapX: (crs.wrapLng && !this.options!.noWrap && [
        Math.floor(map.project([0, crs.wrapLng[0]], z).x / tileSize.x),
        Math.ceil(map.project([0, crs.wrapLng[1]], z).x / tileSize.y),
      ]) as [number, number] | false,
      wrapY: (crs.wrapLat && !this.options!.noWrap && [
        Math.floor(map.project([crs.wrapLat[0], 0], z).y / tileSize.x),
        Math.ceil(map.project([crs.wrapLat[1], 0], z).y / tileSize.y),
      ]) as [number, number] | false,
    }
    this._grids.set(z, grid)
    return grid
  }

  /**
   * The tiles a rotated or tilted view needs: every tile the visible ground
   * touches, each at the coarsest zoom that still looks sharp where it sits.
   *
   * A tilted view shrinks the ground towards the horizon, so a tile near the
   * top of the screen covers a fraction of the pixels it would near the
   * bottom. Loading it at full detail anyway is how a 60° view came to need
   * seven times the tiles of a flat one — most of them drawn a few pixels
   * across. Apple Maps and Mapbox both drop detail with distance instead, and
   * this does the same: a quadtree walk from a few levels up, splitting a tile
   * only while its nearest corner is magnified on screen enough to need its
   * children. Near the camera that ends at the view's own zoom; in the
   * distance it stops a level, two, or more above it.
   *
   * On a map that is only rotated nothing shrinks, so every tile comes out at
   * the view's zoom — but only those the turned view actually touches, rather
   * than the whole box around it.
   */
  _coveringTiles(center: any): Array<Point & { z: number }> {
    const map = this._map
    const tileZoom = this._tileZoom as number
    const mapZoom = map.getZoom()
    const size = map.getSize()
    const T = this.getTileSize().x
    const options = this.options!
    const floor = Math.max(0, options.minNativeZoom ?? options.minZoom ?? 0)
    const minZ = Math.max(floor, Math.min(tileZoom, tileZoom - (options.detailLevels ?? 5)))

    // The ground the view sees, in pixels at the map's zoom, relative to the
    // centre. A screen rectangle seen through a perspective camera lands on
    // the ground as a convex quadrilateral.
    const cap = Math.max(size.x, size.y) * 8
    const poly = [new Point(0, 0), new Point(size.x, 0), new Point(size.x, size.y), new Point(0, size.y)].map((corner) => {
      const g: Point = map._groundOffset(corner)
      return new Point(Math.max(-cap, Math.min(cap, g.x)), Math.max(-cap, Math.min(cap, g.y)))
    })

    // How much the ground is magnified at a point, relative to the view's
    // centre: 1 on a flat map, above 1 nearer the camera, below it further
    // away. Undoes the bearing to get the point's distance along the tilt.
    const pitch = map._pitch as number
    const geometry = pitch ? map._cameraGeometry() : null
    const bearing = ((map._bearing as number) * Math.PI) / 180
    const sinB = Math.sin(bearing)
    const cosB = Math.cos(bearing)
    const sinT = Math.sin((pitch * Math.PI) / 180)
    const magnification = (x: number, y: number): number => {
      if (!geometry)
      return 1
      const along = x * sinB + y * cosB
      const depth = geometry.h - along * sinT
      return depth <= geometry.h * 0.05 ? Infinity : geometry.h / depth
    }

    const centerPx = map.project(center, mapZoom)
    const out: Array<Point & { z: number }> = []
    const limit = 600

    const visit = (x: number, y: number, z: number): void => {
      if (out.length >= limit)
      return
      const coords = new Point(x, y) as Point & { z: number }
      coords.z = z
      if (!this._isValidTile(coords))
      return

      const k = map.getZoomScale(mapZoom, z)
      const x0 = x * T * k - centerPx.x
      const y0 = y * T * k - centerPx.y
      const x1 = x0 + T * k
      const y1 = y0 + T * k
      if (!rectTouchesPolygon(x0, y0, x1, y1, poly))
      return

      const s = Math.max(magnification(x0, y0), magnification(x1, y0), magnification(x0, y1), magnification(x1, y1))
      const wanted = Number.isFinite(s) ? Math.round(mapZoom + Math.log2(s)) : tileZoom
      if (z < Math.min(tileZoom, wanted)) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++)
          visit(x * 2 + dx, y * 2 + dy, z + 1)
        }
        return
      }
      out.push(coords)
    }

    // Start from the coarsest level over the polygon's bounding box.
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of poly) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const k = map.getZoomScale(mapZoom, minZ) * T
    for (let y = Math.floor((centerPx.y + minY) / k); y <= Math.floor((centerPx.y + maxY) / k); y++) {
      for (let x = Math.floor((centerPx.x + minX) / k); x <= Math.floor((centerPx.x + maxX) / k); x++)
      visit(x, y, minZ)
    }

    // Nearest the centre first, finest first: what the eye lands on loads
    // before the horizon does.
    const distance = (c: Point & { z: number }): number => {
      const kk = map.getZoomScale(mapZoom, c.z) * T
      return Math.hypot((c.x + 0.5) * kk - centerPx.x, (c.y + 0.5) * kk - centerPx.y)
    }
    return out.sort((a, b) => b.z - a.z || distance(a) - distance(b))
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
    const size = map.getSize()

    // Rotated or tilted, the view covers more ground than its own rectangle —
    // the corners of a rotated view reach past it, and the top of a tilted one
    // reaches far into the distance. Cover the ground the corners actually
    // see, capped so a view near the horizon does not ask for a city's worth
    // of tiles.
    if ((map._bearing || map._pitch) && map._groundOffset) {
      const cap = Math.max(size.x, size.y) * 2
      let min = new Point(Infinity, Infinity)
      let max = new Point(-Infinity, -Infinity)
      for (const corner of [new Point(0, 0), new Point(size.x, 0), new Point(0, size.y), new Point(size.x, size.y)]) {
        const g: Point = map._groundOffset(corner)
        const x = Math.max(-cap, Math.min(cap, g.x)) / scale
        const y = Math.max(-cap, Math.min(cap, g.y)) / scale
        min = new Point(Math.min(min.x, x), Math.min(min.y, y))
        max = new Point(Math.max(max.x, x), Math.max(max.y, y))
      }
      return new Bounds(pixelCenter.add(min), pixelCenter.add(max))
    }

    const halfSize = size.divideBy(scale * 2)
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

    if ((map._bearing || map._pitch) && map._groundOffset) {
      this._updateCovering(center)
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

  /** `_update` for a rotated or tilted view: see `_coveringTiles`. */
  _updateCovering(center: any): void {
    const covering = this._coveringTiles(center)
    for (const tile of Object.values(this._tiles))
    tile.current = false

    const queue: Array<Point & { z: number }> = []
    for (const coords of covering) {
      const tile = this._tiles[this._tileCoordsToKey(coords)]
      if (tile)
      tile.current = true
      else
      queue.push(coords)
    }
    if (!queue.length)
    return

    if (!this._loading) {
      this._loading = true
      this.fire('loading')
    }

    // One fragment per level: each zoom's tiles live in their own container.
    const fragments = new Map<number, DocumentFragment>()
    for (const coords of queue) {
      let fragment = fragments.get(coords.z)
      if (!fragment) {
        fragment = document.createDocumentFragment()
        fragments.set(coords.z, fragment)
      }
      this._addTile(coords, fragment)
    }
    for (const [z, fragment] of fragments)
    this._levelFor(z).el.appendChild(fragment)
  }

  _isValidTile(coords: Point & { z: number }): boolean {
    const crs = this._map.options.crs
    if (!crs.infinite) {
      const bounds = this._gridFor(coords.z).range!
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
    tile.style.height = `${tileSize.y}px`;
    (tile as any).onselectstart = Util.falseFn;
    (tile as any).onpointermove = Util.falseFn
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
    const level = this._levels[coords.z] ?? this._levelFor(coords.z)
    return coords.scaleBy(this.getTileSize()).subtract(level.origin)
  }

  _wrapCoords(coords: Point & { z: number }): Point & { z: number } {
    const { wrapX, wrapY } = this._gridFor(coords.z)
    const newCoords = new Point(
    wrapX ? Util.wrapNum(coords.x, wrapX) : coords.x,
    wrapY ? Util.wrapNum(coords.y, wrapY) : coords.y,
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
  /**
   * How many zoom levels coarser than the view's own a tilted map may use for
   * distant ground. `0` keeps full detail all the way to the horizon.
   */
  detailLevels: 5,
})

/**
 * Whether an axis-aligned rectangle and a convex polygon overlap, by the
 * separating-axis test: they are apart exactly when some edge of either
 * shape has them on opposite sides of it.
 */
function rectTouchesPolygon(x0: number, y0: number, x1: number, y1: number, poly: Point[]): boolean {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (maxX < x0 || minX > x1 || maxY < y0 || minY > y1)
    return false

  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const nx = a.y - b.y
    const ny = b.x - a.x
    let pMin = Infinity
    let pMax = -Infinity
    for (const p of poly) {
      const d = p.x * nx + p.y * ny
      pMin = Math.min(pMin, d)
      pMax = Math.max(pMax, d)
    }
    let rMin = Infinity
    let rMax = -Infinity
    for (const [cx, cy] of corners) {
      const d = cx! * nx + cy! * ny
      rMin = Math.min(rMin, d)
      rMax = Math.max(rMax, d)
    }
    if (rMax < pMin || rMin > pMax)
      return false
  }
  return true
}
