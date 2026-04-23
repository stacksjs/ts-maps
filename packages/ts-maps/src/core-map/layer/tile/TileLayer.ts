import type { Point } from '../../geometry/Point'
import Browser from '../../core/Browser'
import * as Util from '../../core/Util'
import * as DomEvent from '../../dom/DomEvent'
import { cachedFetch, getDefaultCache, TileCache } from '../../storage'
import { GridLayer } from './GridLayer'

export class TileLayer extends GridLayer {
  declare _url: string
  declare _offlineCache?: TileCache
  declare _activeBlobUrls: Set<string>

  initialize(url: string, options?: any): void {
    super.initialize(options)
    this._url = url

    if (this.options!.attribution === null) {
      const urlHostname = new URL(url, location.href).hostname
      const osmHosts = ['tile.openstreetmap.org', 'tile.osm.org']
      if (osmHosts.some(host => urlHostname.endsWith(host)))
      this.options!.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }

    if (this.options!.detectRetina && Browser.retina && this.options!.maxZoom > 0) {
      this.options!.tileSize = Math.floor(this.options!.tileSize / 2)
      if (!this.options!.zoomReverse) {
        this.options!.zoomOffset++
        this.options!.maxZoom = Math.max(this.options!.minZoom, this.options!.maxZoom - 1)
      }
      else {
        this.options!.zoomOffset--
        this.options!.minZoom = Math.min(this.options!.maxZoom, this.options!.minZoom + 1)
      }
      this.options!.minZoom = Math.max(0, this.options!.minZoom)
    }
    else if (!this.options!.zoomReverse) {
      this.options!.maxZoom = Math.max(this.options!.minZoom, this.options!.maxZoom)
    }
    else {
      this.options!.minZoom = Math.min(this.options!.maxZoom, this.options!.minZoom)
    }

    if (typeof this.options!.subdomains === 'string')
    this.options!.subdomains = this.options!.subdomains.split('')

    const offline = this.options!.offlineCache
    if (offline instanceof TileCache)
      this._offlineCache = offline
    else if (offline === true)
      this._offlineCache = getDefaultCache()

    this._activeBlobUrls = new Set<string>()

    this.on('tileunload', this._onTileRemove)
  }

  setUrl(url: string, noRedraw?: boolean): this {
    if (this._url === url && noRedraw === undefined)
    noRedraw = true
    this._url = url
    if (!noRedraw)
    this.redraw()
    return this
  }

  createTile(coords: Point & { z: number }, done: (err: any, tile: HTMLElement) => void): HTMLElement {
    const tile = document.createElement('img')

    DomEvent.on(tile, 'load', this._tileOnLoad.bind(this, done, tile))
    DomEvent.on(tile, 'error', this._tileOnError.bind(this, done, tile))

    if (this.options!.crossOrigin || this.options!.crossOrigin === '')
    tile.crossOrigin = this.options!.crossOrigin === true ? '' : this.options!.crossOrigin

    if (typeof this.options!.referrerPolicy === 'string')
    tile.referrerPolicy = this.options!.referrerPolicy

    tile.alt = ''

    const url = this.getTileUrl(coords)
    if (this._offlineCache)
      this._resolveThroughCache(tile, url)
    else
      tile.src = url

    return tile
  }

  _resolveThroughCache(tile: HTMLImageElement, url: string): void {
    cachedFetch(url, { cache: this._offlineCache }).then((res) => {
      const URLCtor = (globalThis as any).URL
      if (URLCtor && typeof URLCtor.createObjectURL === 'function' && typeof (globalThis as any).Blob === 'function') {
        const blob = new (globalThis as any).Blob([res.data], { type: res.mime })
        const blobUrl = URLCtor.createObjectURL(blob) as string
        this._activeBlobUrls.add(blobUrl)
        tile.src = blobUrl
      }
      else {
        // No Blob / URL.createObjectURL — fall back to plain URL; `res.data`
        // still populated the cache, which is the point of the trip.
        tile.src = url
      }
    }).catch(() => {
      // Network + cache both failed: surface a load error via the browser's
      // own pathway by attempting the original URL, which will then hit the
      // `errorTileUrl` handler.
      tile.src = url
    })
  }

  getTileUrl(coords: Point & { z: number }): string {
    const data: any = Object.create(this.options!)
    Object.assign(data, {
      r: Browser.retina ? '@2x' : '',
      s: this._getSubdomain(coords),
      x: coords.x,
      y: coords.y,
      z: this._getZoomForUrl(),
    })
    if (this._map && !this._map.options.crs.infinite) {
      const invertedY = this._globalTileRange!.max.y - coords.y
      if (this.options!.tms)
      data.y = invertedY
      data['-y'] = invertedY
    }
    return Util.template(this._url, data)
  }

  _tileOnLoad(done: (err: any, tile: HTMLElement) => void, tile: HTMLElement): void {
    done(null, tile)
  }

  _tileOnError(done: (err: any, tile: HTMLElement) => void, tile: HTMLImageElement, e: any): void {
    const errorUrl = this.options!.errorTileUrl
    if (errorUrl && tile.getAttribute('src') !== errorUrl)
    tile.src = errorUrl
    done(e, tile)
  }

  _onTileRemove(e: any): void {
    e.tile.onload = null
  }

  _getZoomForUrl(): number {
    let zoom = this._tileZoom as number
    const maxZoom = this.options!.maxZoom
    const zoomReverse = this.options!.zoomReverse
    const zoomOffset = this.options!.zoomOffset
    if (zoomReverse)
    zoom = maxZoom - zoom
    return zoom + zoomOffset
  }

  _getSubdomain(tilePoint: Point): string {
    const index = Math.abs(tilePoint.x + tilePoint.y) % this.options!.subdomains.length
    return this.options!.subdomains[index]
  }

  _abortLoading(): void {
    for (const i of Object.keys(this._tiles)) {
      if (this._tiles[i].coords.z !== this._tileZoom) {
        const tile = this._tiles[i].el as HTMLImageElement

        tile.onload = Util.falseFn as any
        tile.onerror = Util.falseFn as any

        if (!tile.complete) {
          tile.setAttribute('src', '')
          const coords = this._tiles[i].coords
          tile.remove()
          delete this._tiles[i]
          this.fire('tileabort', { tile, coords })
        }
      }
    }
  }

  _removeTile(key: string): void {
    const tile = this._tiles[key]
    if (!tile)
    return
    const el = tile.el as HTMLImageElement
    const src = el.getAttribute('src') ?? ''
    if (src.startsWith('blob:') && this._activeBlobUrls.has(src)) {
      const URLCtor = (globalThis as any).URL
      if (URLCtor && typeof URLCtor.revokeObjectURL === 'function')
        URLCtor.revokeObjectURL(src)
      this._activeBlobUrls.delete(src)
    }
    el.setAttribute('src', '')
    super._removeTile(key)
  }

  _tileReady(coords: any, err?: any, tile?: HTMLElement): void {
    if (!this._map || (tile && tile.getAttribute('src') === ''))
    return
    super._tileReady(coords, err, tile)
  }

  _clampZoom(zoom: number): number {
    return Math.round(super._clampZoom(zoom))
  }
}

TileLayer.setDefaultOptions( {
  minZoom: 0,
  maxZoom: 18,
  subdomains: 'abc',
  errorTileUrl: '',
  zoomOffset: 0,
  tms: false,
  zoomReverse: false,
  detectRetina: false,
  crossOrigin: false,
  referrerPolicy: false,
})
