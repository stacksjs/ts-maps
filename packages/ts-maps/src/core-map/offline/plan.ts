/**
 * What downloading an area means: every tile URL it needs, counted before
 * anything is fetched.
 *
 * With a map, the URLs come from the map's own tile layers — each asked for
 * its URL exactly as it would ask while drawing, subdomain, retina suffix,
 * 512px zoom shift and all — so what is downloaded is byte for byte what the
 * map will later request. Without one, a region is described by URL templates.
 */

import type { OfflineGlyphs, OfflinePlan } from './OfflineStore'
import { isPMTilesUrl, pmtilesSourceUrl, pmtilesTileUrl } from '../pmtiles/protocol'
import { glyphUrl } from '../symbols/loadGlyphs'
import { spriteUrl } from '../symbols/loadSprite'

/** `[west, south, east, north]`, `{ west, south, east, north }`, or a `LatLngBounds`. */
export type OfflineBounds
  = | readonly [number, number, number, number]
    | { west: number, south: number, east: number, north: number }
    | { getWest: () => number, getSouth: () => number, getEast: () => number, getNorth: () => number }

/** A tile source described by hand, for downloading without a map. */
export interface OfflineSource {
  /** Template with `{z}`, `{x}` and `{y}`, or a `pmtiles://` archive. */
  url: string
  /** Default `'vector'` for `.pbf`/`.mvt` URLs and `pmtiles://` archives, `'raster'` otherwise. */
  type?: 'vector' | 'raster'
  /** Default 512 for vector, 256 for raster. */
  tileSize?: number
  /** The source's own zoom range, in its tile zooms. */
  minZoom?: number
  maxZoom?: number
}

export interface OfflineArea {
  bounds: OfflineBounds
  /** Lowest map zoom to keep. Default 0: the whole way out is only a few tiles. */
  minZoom?: number
  /**
   * Highest map zoom to keep. By default a vector source's top zoom — its
   * tiles carry every detail and are drawn sharply at any zoom past it — and
   * zoom 16 for images, which past that multiply fast.
   */
  maxZoom?: number
  /** The map whose layers say what to download. */
  map?: any
  /** Sources to download, instead of or as well as a map's. */
  sources?: OfflineSource[]
  /** Other URLs to keep: a TileJSON, a style document. */
  resources?: string[]
  /**
   * Glyph ranges to keep, by their first code point (`1024` for Cyrillic,
   * `19968` and up for CJK), as well as the Latin ones and whatever the
   * area's names turn out to need. Only for a style with a `glyphs` server.
   */
  glyphRanges?: number[]
  /**
   * Deepest zoom of terrain (DEM) tiles to keep, when the map has terrain on.
   * A DEM tile is several times a vector tile, and past this the map draws
   * terrain from the deepest one kept, as it does past the DEM's own top
   * zoom. Default 12.
   */
  terrainMaxZoom?: number
}

export interface PlannedArea {
  bounds: [number, number, number, number]
  minZoom: number
  maxZoom: number
  sources: string[]
  /** Tiles and resources together. */
  count: number
  kinds: { vector: number, raster: number, resource: number, terrain: number }
  /** The style's glyph server, when it has one. */
  glyphs?: OfflineGlyphs
  /** Builds the full URL list, which for a large area is worth not doing twice. */
  build: () => OfflinePlan
}

const RASTER_DEFAULT_MAX = 16
const TERRAIN_DEFAULT_MAX = 12

export function normalizeBounds(b: OfflineBounds): [number, number, number, number] {
  let out: [number, number, number, number]
  if (Array.isArray(b))
    out = [b[0], b[1], b[2], b[3]]
  else if (typeof (b as any).getWest === 'function')
    out = [(b as any).getWest(), (b as any).getSouth(), (b as any).getEast(), (b as any).getNorth()]
  else
    out = [(b as any).west, (b as any).south, (b as any).east, (b as any).north]
  const [w, s, e, n] = out
  return [
    Math.max(-180, Math.min(w, e)),
    Math.max(-85.0511, Math.min(s, n)),
    Math.min(180, Math.max(w, e)),
    Math.min(85.0511, Math.max(s, n)),
  ]
}

/** Fraction of the world across, 0 at the antimeridian west. */
export function lngToUnit(lng: number): number {
  return (lng + 180) / 360
}

/** Fraction of the world down, 0 at the top of Web Mercator. */
export function latToUnit(lat: number): number {
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

export function unitToLat(y: number): number {
  const n = Math.PI - 2 * Math.PI * y
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

export function unitToLng(x: number): number {
  return x * 360 - 180
}

/** The tiles covering `bounds` in a grid `2^z` across. */
export function tileRange(bounds: [number, number, number, number], z: number): { x0: number, x1: number, y0: number, y1: number } {
  const n = 2 ** z
  const clamp = (v: number): number => Math.max(0, Math.min(n - 1, v))
  const [w, s, e, north] = bounds
  // The east and south edges are exclusive: an area ending exactly on a tile
  // boundary does not need the tile beyond it.
  const edge = (u: number): number => Math.ceil(u * n) - 1
  return {
    x0: clamp(Math.floor(lngToUnit(w) * n)),
    x1: clamp(Math.max(Math.floor(lngToUnit(w) * n), edge(lngToUnit(e)))),
    y0: clamp(Math.floor(latToUnit(north) * n)),
    y1: clamp(Math.max(Math.floor(latToUnit(north) * n), edge(latToUnit(s)))),
  }
}

function rangeCount(r: { x0: number, x1: number, y0: number, y1: number }): number {
  return (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1)
}

interface TileJob {
  kind: 'vector' | 'raster' | 'terrain'
  template: string
  /** Grid zooms to walk, and how many tiles across each grid is. */
  zooms: Array<{ z: number, gridZ: number, mapZ: number }>
  url: (x: number, y: number, z: number) => string
  /** For vector tiles at the top zoom: the tile the URL names, for indexing. */
  indexAt?: number
  server: (x: number, y: number, z: number) => { x: number, y: number, z: number }
}

function isVectorUrl(url: string): boolean {
  return /\.(?:pbf|mvt)(?:$|\?)/i.test(url)
}

function fill(template: string, x: number, y: number, z: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}

function jobForSource(source: OfflineSource, minZoom: number, maxZoom: number | undefined): TileJob {
  // An archive downloads under its synthetic tile URLs, which are what the
  // map asks the offline store for.
  const template = isPMTilesUrl(source.url) ? pmtilesTileUrl(source.url) : source.url
  const kind = source.type ?? (isVectorUrl(template) || isPMTilesUrl(template) ? 'vector' : 'raster')
  const tileSize = source.tileSize ?? (kind === 'vector' ? 512 : 256)
  const shift = Math.round(Math.log2(tileSize / 256))
  const srcMin = source.minZoom ?? 0
  const srcMax = source.maxZoom ?? (kind === 'vector' ? 14 : 19)
  const top = Math.min(srcMax, (maxZoom ?? (kind === 'vector' ? Infinity : RASTER_DEFAULT_MAX)) - shift)
  const zooms: Array<{ z: number, gridZ: number, mapZ: number }> = []
  for (let z = Math.max(srcMin, minZoom - shift, 0); z <= top; z++)
    zooms.push({ z, gridZ: z, mapZ: z + shift })
  return {
    kind,
    template,
    zooms,
    url: (x, y, z) => fill(template, x, y, z),
    indexAt: kind === 'vector' ? top : undefined,
    server: (x, y, z) => ({ x, y, z }),
  }
}

/** A tile layer on the map, walked the way the layer itself walks its grid. */
function jobForLayer(layer: any, minZoom: number, maxZoom: number | undefined): TileJob | undefined {
  if (typeof layer?.getTileUrl !== 'function' || typeof layer.getTileSize !== 'function')
    return undefined
  const options = layer.options ?? {}
  if (options.localSource)
    return undefined
  const vector = typeof layer._subTile === 'function'
  const template: string | undefined = vector ? options.url : layer._url
  if (!template)
    return undefined
  const tileSize = layer.getTileSize().x as number
  // Tile indices are over a grid `2^z * 256 / tileSize` across.
  const gridShift = Math.round(Math.log2(tileSize / 256))

  let top: number
  let bottom = options.minNativeZoom ?? options.minZoom ?? 0
  if (vector) {
    top = options.sourceMaxZoom ?? options.maxNativeZoom ?? 14 + gridShift
    if (maxZoom !== undefined)
      top = Math.min(top, Math.floor(maxZoom))
  }
  else {
    top = Math.min(options.maxNativeZoom ?? options.maxZoom ?? 18, maxZoom ?? RASTER_DEFAULT_MAX)
  }
  bottom = Math.max(bottom, Math.floor(minZoom), gridShift)
  const zooms: Array<{ z: number, gridZ: number, mapZ: number }> = []
  for (let z = bottom; z <= top; z++)
    zooms.push({ z, gridZ: z - gridShift, mapZ: z })

  return {
    kind: vector ? 'vector' : 'raster',
    template,
    zooms,
    url: (x, y, z) => layer.getTileUrl({ x, y, z }),
    indexAt: vector ? top : undefined,
    server: (x, y, z) => {
      const sub = layer._subTile({ x, y, z })
      return { x: sub.x, y: sub.y, z: layer._getZoomForUrl(sub.z) }
    },
  }
}

/** The style's own files: sprite sheets, glyph ranges for common scripts, and the style document. */
/** Basic Latin, Latin-1 and Latin Extended, and general punctuation. */
export const LATIN_GLYPH_RANGES: readonly number[] = [0, 256, 8192]

/**
 * The properties a style's labels read: `name` from `['get', 'name']` or
 * `'{name}'`, and so on. Fallbacks in a `coalesce` count too.
 */
export function labelKeys(layers: any[]): string[] {
  const keys = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const m of value.matchAll(/\{([^{}]+)\}/g))
        keys.add(m[1]!)
    }
    else if (Array.isArray(value)) {
      if (value[0] === 'get' && typeof value[1] === 'string')
        keys.add(value[1])
      for (const v of value) walk(v)
    }
  }
  for (const layer of layers) {
    if (layer?.type === 'symbol')
      walk(layer.layout?.['text-field'])
  }
  return keys.size ? [...keys] : ['name']
}

function styleGlyphs(spec: any, extra: number[] = []): OfflineGlyphs | undefined {
  if (typeof spec?.glyphs !== 'string')
    return undefined
  const stacks = new Set<string>()
  for (const layer of spec.layers ?? []) {
    const font = layer.layout?.['text-font']
    if (Array.isArray(font) && font.every((f: unknown) => typeof f === 'string'))
      stacks.add(font.join(','))
  }
  if (!stacks.size)
    return undefined
  const ranges = [...new Set([...LATIN_GLYPH_RANGES, ...extra.map(r => Math.floor(r / 256) * 256)])].sort((a, b) => a - b)
  return { template: spec.glyphs, stacks: [...stacks], keys: labelKeys(spec.layers ?? []), ranges }
}

/** Every glyph URL for some ranges of a style's fonts. */
export function glyphUrls(glyphs: OfflineGlyphs, ranges: readonly number[]): string[] {
  const out: string[] = []
  for (const stack of glyphs.stacks) {
    for (const start of ranges)
      out.push(glyphUrl(glyphs.template, stack, start))
  }
  return out
}

function styleResources(map: any, glyphs: OfflineGlyphs | undefined): string[] {
  const out: string[] = []
  if (typeof map?._styleUrl === 'string')
    out.push(map._styleUrl)
  const spec = map?._style?.spec
  if (!spec)
    return out
  const sprites: string[] = typeof spec.sprite === 'string'
    ? [spec.sprite]
    : Array.isArray(spec.sprite) ? spec.sprite.map((s: any) => s?.url).filter(Boolean) : []
  for (const base of sprites) {
    for (const ratio of [1, 2])
      out.push(spriteUrl(base, 'json', ratio), spriteUrl(base, 'png', ratio))
  }
  // The Latin ranges cover the names in most of the world's street maps, and
  // any asked for; others are added once the area's names have been read.
  if (glyphs)
    out.push(...glyphUrls(glyphs, glyphs.ranges))
  return out
}

/**
 * The DEM tiles terrain will ask for, when the map has it on: the raster-dem
 * source `setTerrain` names, which no tile layer draws. Terrain asks for them
 * where the vector tiles it lies under are, on their 512px grid, so a DEM
 * tile at grid zoom `z` serves map zoom `z + 1`.
 */
function terrainJob(map: any, minZoom: number, maxZoom: number, cap: number): TileJob | undefined {
  const terrain = map?._terrain
  const spec = terrain ? map._style?.spec?.sources?.[terrain.source] : undefined
  const template = Array.isArray(spec?.tiles) ? spec.tiles[0] : undefined
  if (spec?.type !== 'raster-dem' || typeof template !== 'string')
    return undefined
  const shift = 1
  const top = Math.min(spec.maxzoom ?? 22, cap, Math.floor(maxZoom) - shift)
  const zooms: Array<{ z: number, gridZ: number, mapZ: number }> = []
  for (let z = Math.max(spec.minzoom ?? 0, Math.floor(minZoom) - shift, 0); z <= top; z++)
    zooms.push({ z, gridZ: z, mapZ: z + shift })
  return {
    kind: 'terrain',
    template,
    zooms,
    url: (x, y, z) => fill(template, x, y, z),
    server: (x, y, z) => ({ x, y, z }),
  }
}

function tileLayersOf(map: any): any[] {
  const out: any[] = []
  if (typeof map?.eachLayer === 'function')
    map.eachLayer((layer: any) => { out.push(layer) })
  return out
}

/** Count what an area needs, and hand back how to list it. */
export function planArea(area: OfflineArea): PlannedArea {
  const bounds = normalizeBounds(area.bounds)
  const minZoom = Math.max(0, Math.floor(area.minZoom ?? 0))
  const maxZoom = area.maxZoom

  const jobs: TileJob[] = []
  const seen = new Set<string>()
  for (const layer of area.map ? tileLayersOf(area.map) : []) {
    const job = jobForLayer(layer, minZoom, maxZoom)
    // Two style layers drawing one source are one layer here, but guard
    // against the same URL twice anyway.
    if (job && !seen.has(job.template)) {
      seen.add(job.template)
      jobs.push(job)
    }
  }
  for (const source of area.sources ?? []) {
    if (!seen.has(source.url)) {
      seen.add(source.url)
      jobs.push(jobForSource(source, minZoom, maxZoom))
    }
  }

  // An archive's TileJSON is kept with its tiles: offline, it is how the map
  // learns the archive's top zoom (see `VectorTileMapLayer.sourceReady`).
  const archives = jobs.filter(job => isPMTilesUrl(job.template)).map(job => pmtilesSourceUrl(job.template))
  const glyphs = area.map ? styleGlyphs(area.map._style?.spec, area.glyphRanges) : undefined
  const resources = [...new Set([...(area.map ? styleResources(area.map, glyphs) : []), ...archives, ...(area.resources ?? [])])]
  const kinds = { vector: 0, raster: 0, resource: resources.length, terrain: 0 }
  let top = minZoom
  for (const job of jobs) {
    for (const { gridZ, mapZ } of job.zooms) {
      kinds[job.kind] += rangeCount(tileRange(bounds, gridZ))
      top = Math.max(top, mapZ)
    }
  }
  // Terrain is planned last, to the zooms the rest of the area goes to.
  const dem = area.map ? terrainJob(area.map, minZoom, maxZoom ?? top, area.terrainMaxZoom ?? TERRAIN_DEFAULT_MAX) : undefined
  if (dem && !seen.has(dem.template)) {
    seen.add(dem.template)
    jobs.push(dem)
    for (const { gridZ } of dem.zooms)
      kinds.terrain += rangeCount(tileRange(bounds, gridZ))
  }

  return {
    bounds,
    minZoom,
    maxZoom: maxZoom ?? top,
    sources: jobs.map(j => j.template),
    count: kinds.vector + kinds.raster + kinds.resource + kinds.terrain,
    kinds,
    ...(glyphs ? { glyphs } : {}),
    build: () => {
      const urls = new Set<string>(resources)
      const index: OfflinePlan['index'] = []
      const terrain: string[] = []
      for (const job of jobs) {
        for (const { z, gridZ } of job.zooms) {
          const r = tileRange(bounds, gridZ)
          for (let x = r.x0; x <= r.x1; x++) {
            for (let y = r.y0; y <= r.y1; y++) {
              const url = job.url(x, y, z)
              if (urls.has(url))
                continue
              urls.add(url)
              if (z === job.indexAt)
                index.push({ url, ...job.server(x, y, z) })
              if (job.kind === 'terrain')
                terrain.push(url)
            }
          }
        }
      }
      return { urls: [...urls], index, ...(glyphs ? { glyphs } : {}), ...(terrain.length ? { terrain } : {}) }
    },
  }
}
