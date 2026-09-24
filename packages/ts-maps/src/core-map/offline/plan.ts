/**
 * What downloading an area means: every tile URL it needs, counted before
 * anything is fetched.
 *
 * With a map, the URLs come from the map's own tile layers — each asked for
 * its URL exactly as it would ask while drawing, subdomain, retina suffix,
 * 512px zoom shift and all — so what is downloaded is byte for byte what the
 * map will later request. Without one, a region is described by URL templates.
 */

import type { OfflinePlan } from './OfflineStore'
import { glyphUrl } from '../symbols/loadGlyphs'
import { spriteUrl } from '../symbols/loadSprite'

/** `[west, south, east, north]`, `{ west, south, east, north }`, or a `LatLngBounds`. */
export type OfflineBounds
  = | readonly [number, number, number, number]
    | { west: number, south: number, east: number, north: number }
    | { getWest: () => number, getSouth: () => number, getEast: () => number, getNorth: () => number }

/** A tile source described by hand, for downloading without a map. */
export interface OfflineSource {
  /** Template with `{z}`, `{x}` and `{y}`. */
  url: string
  /** Default `'vector'` for `.pbf`/`.mvt` URLs, `'raster'` otherwise. */
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
}

export interface PlannedArea {
  bounds: [number, number, number, number]
  minZoom: number
  maxZoom: number
  sources: string[]
  /** Tiles and resources together. */
  count: number
  kinds: { vector: number, raster: number, resource: number }
  /** Builds the full URL list, which for a large area is worth not doing twice. */
  build: () => OfflinePlan
}

const RASTER_DEFAULT_MAX = 16

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
  kind: 'vector' | 'raster'
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
  const kind = source.type ?? (isVectorUrl(source.url) ? 'vector' : 'raster')
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
    template: source.url,
    zooms,
    url: (x, y, z) => fill(source.url, x, y, z),
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
function styleResources(map: any): string[] {
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
  if (typeof spec.glyphs === 'string') {
    const stacks = new Set<string>()
    for (const layer of spec.layers ?? []) {
      const font = layer.layout?.['text-font']
      if (Array.isArray(font) && font.every((f: unknown) => typeof f === 'string'))
        stacks.add(font.join(','))
    }
    // Basic Latin, Latin-1, Latin Extended, and general punctuation: enough
    // for the names in most of the world's street maps.
    for (const stack of stacks) {
      for (const start of [0, 256, 8192])
        out.push(glyphUrl(spec.glyphs, stack, start))
    }
  }
  return out
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

  const resources = [...new Set([...(area.map ? styleResources(area.map) : []), ...(area.resources ?? [])])]
  const kinds = { vector: 0, raster: 0, resource: resources.length }
  let top = minZoom
  for (const job of jobs) {
    for (const { gridZ, mapZ } of job.zooms) {
      kinds[job.kind] += rangeCount(tileRange(bounds, gridZ))
      top = Math.max(top, mapZ)
    }
  }

  return {
    bounds,
    minZoom,
    maxZoom: maxZoom ?? top,
    sources: jobs.map(j => j.template),
    count: kinds.vector + kinds.raster + kinds.resource,
    kinds,
    build: () => {
      const urls = new Set<string>(resources)
      const index: OfflinePlan['index'] = []
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
            }
          }
        }
      }
      return { urls: [...urls], index }
    },
  }
}
