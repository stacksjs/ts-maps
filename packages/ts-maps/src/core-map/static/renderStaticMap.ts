import type { CompiledExpression } from '../style-spec/expressions'
import type { LayerSpecification, Style as StyleSpecification } from '../style-spec/types'
import { compile, convertLegacyFilter, formatColor } from '../style-spec/expressions'
import { isPMTilesUrl, pmtilesTileJSON, pmtilesTileUrl, withPMTiles } from '../pmtiles/protocol'
import { VectorTile } from '../mvt'
import { Pbf } from '../proto'

/**
 * A map drawn once, as SVG, from the same vector tiles and the same style the
 * interactive map uses.
 *
 * The interactive map paints through WebGL, which needs a browser, a GPU and a
 * page that stays open. A share card, an Open Graph image or a blog figure
 * needs none of that: it needs the map as it looks, once, at a fixed size. A
 * screenshot of the live map would do, at the cost of a headless browser and a
 * raster that goes soft the moment it is scaled. Raster tiles from a third
 * party would do too, in someone else's style, under someone else's terms.
 *
 * So this walks the style in order, the way the renderer does, and writes each
 * fill and line layer out as SVG paths, then places the point labels. The
 * result is vector all the way down: it stays sharp at any size, it is the
 * app's own palette, and it comes from whichever tile server the style points
 * at, including one of our own.
 *
 * What it draws: `background`, `fill`, `fill-extrusion` (flat, as seen from
 * straight above), `line`, and `symbol` text at points. What it leaves out:
 * raster and hillshade sources, icons, and labels that follow a line, none of
 * which a static figure at this scale misses.
 */

/**
 * Where the drawing's top-left corner is in Web Mercator, with the world as a
 * unit square (0..1 on each axis, north up), and how many output pixels one
 * unit spans. The same convention as `ts-images`' activity cards, so a route
 * projected there lands on the streets drawn here.
 */
export interface StaticMapView {
  left: number
  top: number
  scale: number
}

export interface StaticMapOptions {
  style: StyleSpecification
  width: number
  height: number
  view: StaticMapView
  /**
   * Defaults to `globalThis.fetch`. A `pmtiles://` source reads its archive
   * through this too, with `Range` headers in `init`, so pass `init` along.
   */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
  /** Draw point labels (places, water names). Defaults to true. */
  labels?: boolean
  /** Prefixes the ids this markup defines, so two maps can share a document. */
  idPrefix?: string
  /** The CSS family a label falls back to after the style's own font. */
  fontFamily?: string
  /**
   * Lines drawn over the map afterwards, such as a route, in output pixels.
   * A label that would sit under one is left out rather than covered.
   */
  avoid?: Array<Array<[number, number]>>
  /** How far a label keeps from `avoid`, in pixels. Defaults to 6. */
  avoidPadding?: number
  /**
   * Places within this many pixels of `avoid` are named before any other
   * label. Defaults to 48.
   */
  avoidNear?: number
  /**
   * Rectangles, `[left, top, right, bottom]` in output pixels, that no label
   * may enter: where a caller will draw its own text, such as a credit line.
   */
  reserve?: Array<[number, number, number, number]>
}

export interface StaticMap {
  /** SVG markup covering 0..width × 0..height, with no root `<svg>` element. */
  markup: string
  /** The tile sources' attribution, as plain text. */
  attribution: string
  /** The style zoom the map was drawn at. */
  zoom: number
  /** How many tiles were fetched. */
  tiles: number
}

interface LngLat {
  lat: number
  lng: number
}

export function mercatorX(lng: number): number {
  return (lng + 180) / 360
}

export function mercatorY(lat: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const radians = clamped * Math.PI / 180
  return (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2
}

/**
 * The view that fits `points` into a `width` × `height` drawing with `padding`
 * on every side, centred, never closer than `maxZoom`.
 */
export function staticMapView(points: LngLat[], width: number, height: number, padding = 32, maxZoom = 17): StaticMapView | null {
  const valid = points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
  if (valid.length === 0)
    return null
  const xs = valid.map(point => mercatorX(point.lng))
  const ys = valid.map(point => mercatorY(point.lat))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const fit = Math.min(
    Math.max(1, width - padding * 2) / Math.max(maxX - minX, Number.EPSILON),
    Math.max(1, height - padding * 2) / Math.max(maxY - minY, Number.EPSILON),
  )
  const scale = Math.max(Math.max(width, height), Math.min(fit, 512 * 2 ** maxZoom))
  return {
    left: (minX + maxX) / 2 - width / 2 / scale,
    top: (minY + maxY) / 2 - height / 2 / scale,
    scale,
  }
}

/** The style zoom at which one world unit spans `scale` pixels: 512px tiles. */
export function staticMapZoom(view: StaticMapView): number {
  return Math.log2(view.scale / 512)
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Attribution arrives as HTML for a map control; a figure wants the words. */
function plainAttribution(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replaceAll('&copy;', '©')
    .replaceAll('&amp;', '&')
    .replaceAll('&nbsp;', ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Feature = {
  type: 1 | 2 | 3
  id?: number | string
  properties: Record<string, unknown>
}

/**
 * Compiled once per layer and property, then evaluated per feature. A value
 * that is not an expression compiles to a constant, so the hot path has one
 * shape either way.
 */
class LayerEvaluator {
  private cache = new Map<string, CompiledExpression | null>()
  private filter: CompiledExpression | null | undefined

  constructor(private layer: LayerSpecification, private zoom: number) {}

  private compiled(group: 'paint' | 'layout', name: string, type: 'color' | 'number' | 'value' | 'string'): CompiledExpression | null {
    const key = `${group}:${name}`
    if (!this.cache.has(key)) {
      const value = ((this.layer as unknown as Record<string, unknown>)[group] as Record<string, unknown> | undefined)?.[name]
      let expression: CompiledExpression | null = null
      if (value !== undefined) {
        try {
          expression = compile(value, type)
        }
        catch {
          expression = null
        }
      }
      this.cache.set(key, expression)
    }
    return this.cache.get(key) ?? null
  }

  get(group: 'paint' | 'layout', name: string, type: 'color' | 'number' | 'value' | 'string', feature?: Feature): unknown {
    const expression = this.compiled(group, name, type)
    if (!expression)
      return undefined
    try {
      return expression.evaluate({ zoom: this.zoom, feature })
    }
    catch {
      return undefined
    }
  }

  number(group: 'paint' | 'layout', name: string, fallback: number, feature?: Feature): number {
    const value = this.get(group, name, 'number', feature)
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }

  color(name: string, fallback: string, feature?: Feature): string {
    const value = this.get('paint', name, 'color', feature)
    if (typeof value === 'string')
      return value
    if (Array.isArray(value) && value.length === 4)
      return formatColor(value as [number, number, number, number])
    if (value && typeof value === 'object' && 'r' in value) {
      const c = value as { r: number, g: number, b: number, a: number }
      return formatColor([c.r, c.g, c.b, c.a])
    }
    return fallback
  }

  passes(feature: Feature): boolean {
    if (this.filter === undefined) {
      const raw = (this.layer as { filter?: unknown }).filter
      if (!Array.isArray(raw)) {
        this.filter = null
      }
      else {
        try {
          this.filter = compile(convertLegacyFilter(raw), 'boolean')
        }
        catch {
          // A filter that will not compile lets everything through, as the
          // live renderer does, rather than silently emptying the layer.
          this.filter = null
        }
      }
    }
    if (!this.filter)
      return true
    try {
      return this.filter.evaluate({ zoom: this.zoom, feature }) === true
    }
    catch {
      return false
    }
  }
}

interface LoadedTile {
  x: number
  y: number
  z: number
  tile: VectorTile
  clipId: string
}

async function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  // Some servers hand back the stored gzip without a Content-Encoding header,
  // so fetch does not undo it. Gzip always starts 1f 8b; a protobuf never does.
  if (bytes.length < 2 || bytes[0] !== 0x1F || bytes[1] !== 0x8B)
    return bytes
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function tileUrl(template: string, z: number, x: number, y: number): string {
  return template
    .replaceAll('{z}', String(z))
    .replaceAll('{x}', String(x))
    .replaceAll('{y}', String(y))
    .replaceAll('{s}', 'abc'[(x + y) % 3]!)
}

interface ResolvedSource {
  tiles: string[]
  minzoom: number
  maxzoom: number
  attribution: string
}

async function resolveSource(source: Record<string, unknown>, doFetch: NonNullable<StaticMapOptions['fetch']>, archiveFetch?: StaticMapOptions['fetch']): Promise<ResolvedSource | null> {
  let tiles = Array.isArray(source.tiles) ? source.tiles as string[] : []
  let minzoom = typeof source.minzoom === 'number' ? source.minzoom : undefined
  let maxzoom = typeof source.maxzoom === 'number' ? source.maxzoom : undefined
  let attribution = typeof source.attribution === 'string' ? source.attribution : ''
  const archiveUrl = isPMTilesUrl(source.url) ? source.url : undefined
  if (tiles.length === 0 && typeof source.url === 'string' && !archiveUrl) {
    // A TileJSON: the live tile URL, its zoom range and its credit, which is
    // how a server publishes a versioned path without breaking its clients.
    const response = await doFetch(source.url)
    if (!response.ok)
      return null
    const tilejson = await response.json() as { tiles?: string[], minzoom?: number, maxzoom?: number, attribution?: string }
    tiles = tilejson.tiles ?? []
    minzoom = tilejson.minzoom ?? minzoom
    maxzoom = tilejson.maxzoom ?? maxzoom
    attribution = attribution || tilejson.attribution || ''
  }
  // A PMTiles archive, as the source's `url` or a TileJSON's `tiles[0]`: what
  // neither the source nor the TileJSON said comes from the archive itself.
  const archive = archiveUrl ?? tiles.find(isPMTilesUrl)
  if (archive) {
    const tilejson = await pmtilesTileJSON(archive, { fetch: archiveFetch })
    tiles = tiles.length ? tiles.map(t => isPMTilesUrl(t) ? pmtilesTileUrl(t) : t) : tilejson.tiles
    minzoom ??= tilejson.minzoom
    maxzoom ??= tilejson.maxzoom
    attribution = attribution || tilejson.attribution || ''
  }
  return tiles.length ? { tiles, minzoom: minzoom ?? 0, maxzoom: maxzoom ?? 14, attribution } : null
}

const FONT_TOKENS: Array<[string, 'bold' | 'semibold' | 'medium' | 'italic' | 'regular' | 'light']> = [
  ['Semibold', 'semibold'],
  ['Bold', 'bold'],
  ['Medium', 'medium'],
  ['Italic', 'italic'],
  ['Oblique', 'italic'],
  ['Regular', 'regular'],
  ['Light', 'light'],
]

/** "Geist Semibold" → a CSS family with the weight and slant pulled out. */
function resolveFont(textFont: unknown, fallback: string): { family: string, weight: number, italic: boolean } {
  const names = Array.isArray(textFont) ? textFont : typeof textFont === 'string' ? [textFont] : []
  let weight = 400
  let italic = false
  const families: string[] = []
  for (const raw of names) {
    if (typeof raw !== 'string' || !raw)
      continue
    let name = raw
    for (const [token, kind] of FONT_TOKENS) {
      if (!name.includes(token))
        continue
      name = name.replace(token, '')
      if (kind === 'italic')
        italic = true
      else if (kind === 'bold')
        weight = 700
      else if (kind === 'semibold')
        weight = 600
      else if (kind === 'medium')
        weight = Math.max(weight, 500)
      else if (kind === 'light')
        weight = 300
    }
    const cleaned = name.replace(/\s+/g, ' ').trim()
    if (cleaned)
      families.push(cleaned.includes(' ') ? `'${cleaned}'` : cleaned)
  }
  families.push(fallback)
  return { family: families.join(', '), weight, italic }
}

function textOf(value: unknown, properties: Record<string, unknown>): string {
  if (typeof value === 'string')
    // Legacy token form: "{name}".
    return value.replace(/\{([^}]+)\}/g, (_, key: string) => String(properties[key] ?? ''))
  if (value && typeof value === 'object' && Array.isArray((value as { sections?: unknown[] }).sections))
    return (value as { sections: Array<{ text?: string }> }).sections.map(section => section.text ?? '').join('')
  return value == null ? '' : String(value)
}

interface Label {
  text: string
  x: number
  y: number
  size: number
  font: { family: string, weight: number, italic: boolean }
  letterSpacing: number
  color: string
  haloColor: string
  haloWidth: number
  opacity: number
  anchor: string
  padding: number
  priority: number
  box: [number, number, number, number]
  textWidth: number
}

/**
 * A label's width by estimate: a figure has no font metrics to ask. Measured
 * per character class on a grotesque, because a single average undercounts
 * capitals badly, and the uppercase tracked-out neighbourhood names are
 * exactly the labels most likely to be packed side by side.
 */
function estimateTextWidth(text: string, size: number, weight: number, letterSpacing: number): number {
  let ems = 0
  for (const char of text) {
    if (char === ' ')
      ems += 0.28
    else if (/[MW]/.test(char))
      ems += 0.86
    else if (/[A-Z0-9]/.test(char))
      ems += 0.68
    else if (/[il.,'’]/.test(char))
      ems += 0.26
    else if (/[mw]/.test(char))
      ems += 0.82
    else
      ems += 0.56
  }
  const bold = weight >= 600 ? 1.05 : 1
  return (ems * bold + Math.max(0, [...text].length - 1) * letterSpacing) * size
}

function labelBox(x: number, y: number, width: number, height: number, anchor: string): [number, number, number, number] {
  let left = x - width / 2
  let top = y - height / 2
  if (anchor.includes('left'))
    left = x
  if (anchor.includes('right'))
    left = x - width
  if (anchor.startsWith('top'))
    top = y
  if (anchor.startsWith('bottom'))
    top = y - height
  return [left, top, left + width, top + height]
}

function overlaps(a: [number, number, number, number], b: [number, number, number, number], padding: number): boolean {
  return a[0] - padding < b[2] && a[2] + padding > b[0] && a[1] - padding < b[3] && a[3] + padding > b[1]
}

function avoidPaddingFor(options: StaticMapOptions): number {
  return options.avoidPadding ?? 6
}

function distanceToSegment(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / length))
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))
}

function distanceToLines(px: number, py: number, lines: Array<Array<[number, number]>>): number {
  let best = Infinity
  for (const line of lines) {
    for (let index = 1; index < line.length; index++)
      best = Math.min(best, distanceToSegment(px, py, line[index - 1]!, line[index]!))
  }
  return best
}

/** Whether the segment a→b crosses the rectangle, which counts its inside. */
function segmentHitsBox(a: [number, number], b: [number, number], box: [number, number, number, number]): boolean {
  const [left, top, right, bottom] = box
  // Liang–Barsky: clip the segment's parameter range against each edge.
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const edges: Array<[number, number]> = [[-dx, a[0] - left], [dx, right - a[0]], [-dy, a[1] - top], [dy, bottom - a[1]]]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0)
        return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1)
        return false
      t0 = Math.max(t0, t)
    }
    else {
      if (t < t0)
        return false
      t1 = Math.min(t1, t)
    }
  }
  return t0 <= t1
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/**
 * Draws `style` over the area `view` covers, `width` × `height` pixels, as SVG
 * markup. Tiles come from the style's own vector sources, fetched once each.
 */
export async function renderStaticMap(options: StaticMapOptions): Promise<StaticMap> {
  const { style, width, height, view } = options
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  // Tiles named `pmtiles://` are read from their archive; everything else is
  // fetched as before.
  const tileFetch = withPMTiles(options.fetch)
  const prefix = options.idPrefix ?? 'static-map'
  const zoom = staticMapZoom(view)
  const fallbackFont = options.fontFamily ?? 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif'

  const layers = (style.layers ?? []).filter((layer) => {
    const visibility = (layer as { layout?: { visibility?: string } }).layout?.visibility
    if (visibility === 'none')
      return false
    if (typeof layer.minzoom === 'number' && zoom < layer.minzoom)
      return false
    if (typeof layer.maxzoom === 'number' && zoom >= layer.maxzoom)
      return false
    return true
  })

  // Fetch each vector source the visible layers use, at one tile zoom: the
  // style zoom rounded up, so geometry is never coarser than what it is drawn
  // at, capped by what the source publishes (beyond that it is overzoomed).
  const sourceIds = new Set(layers.map(layer => (layer as { source?: string }).source).filter((id): id is string => !!id))
  const tilesBySource = new Map<string, LoadedTile[]>()
  const attributions: string[] = []
  let fetched = 0
  let clipIndex = 0
  const clipDefs: string[] = []

  for (const id of sourceIds) {
    const source = style.sources?.[id] as unknown as Record<string, unknown> | undefined
    if (!source || source.type !== 'vector')
      continue
    const resolved = await resolveSource(source, doFetch, options.fetch)
    if (!resolved)
      continue
    if (resolved.attribution)
      attributions.push(plainAttribution(resolved.attribution))

    const z = Math.max(resolved.minzoom, Math.min(resolved.maxzoom, Math.ceil(zoom - 1e-9)))
    const count = 2 ** z
    const right = view.left + width / view.scale
    const bottom = view.top + height / view.scale
    const wanted: Array<{ x: number, y: number, wrapX: number }> = []
    for (let y = Math.max(0, Math.floor(view.top * count)); y <= Math.min(count - 1, Math.ceil(bottom * count) - 1); y++) {
      for (let x = Math.floor(view.left * count); x <= Math.ceil(right * count) - 1; x++)
        wanted.push({ x, y, wrapX: ((x % count) + count) % count })
    }

    const loaded = await Promise.all(wanted.map(async ({ x, y, wrapX }): Promise<LoadedTile | null> => {
      try {
        const template = resolved.tiles[(wrapX + y) % resolved.tiles.length]!
        const response = await tileFetch(tileUrl(template, z, wrapX, y))
        if (!response.ok)
          return null
        const bytes = await gunzipIfNeeded(new Uint8Array(await response.arrayBuffer()))
        if (bytes.length === 0)
          return null
        fetched++
        const clipId = `${prefix}-tile-${clipIndex++}`
        // Each tile is clipped to its own square. Tiles carry a buffer of
        // their neighbours' geometry, and drawing it twice darkens every
        // translucent fill along the seams.
        const tx = (x / count - view.left) * view.scale
        const ty = (y / count - view.top) * view.scale
        const size = view.scale / count
        clipDefs.push(`<clipPath id="${clipId}"><rect x="${round(tx)}" y="${round(ty)}" width="${round(size + 0.2)}" height="${round(size + 0.2)}"/></clipPath>`)
        return { x, y, z, tile: new VectorTile(new Pbf(bytes)), clipId }
      }
      catch {
        return null
      }
    }))
    tilesBySource.set(id, loaded.filter((tile): tile is LoadedTile => tile !== null))
  }

  const parts: string[] = []
  const labels: Label[] = []

  layers.forEach((layer, layerIndex) => {
    const evaluator = new LayerEvaluator(layer, zoom)
    const type = layer.type

    if (type === 'background') {
      const color = evaluator.color('background-color', '#000000')
      const opacity = evaluator.number('paint', 'background-opacity', 1)
      parts.push(`<rect width="${width}" height="${height}" fill="${escapeXml(color)}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}/>`)
      return
    }
    if (type !== 'fill' && type !== 'fill-extrusion' && type !== 'line' && type !== 'symbol')
      return

    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer']
    const tiles = tilesBySource.get((layer as { source?: string }).source ?? '') ?? []
    if (!sourceLayer || tiles.length === 0)
      return

    for (const loaded of tiles) {
      const tileLayer = loaded.tile.layers[sourceLayer]
      if (!tileLayer)
        continue
      const count = 2 ** loaded.z
      const extent = tileLayer.extent || 4096
      const project = (gx: number, gy: number): [number, number] => [
        ((loaded.x + gx / extent) / count - view.left) * view.scale,
        ((loaded.y + gy / extent) / count - view.top) * view.scale,
      ]

      // Features that share a resolved paint share one path element.
      const groups = new Map<string, { attrs: string, d: string[] }>()

      for (let i = 0; i < tileLayer.length; i++) {
        const raw = tileLayer.feature(i)
        const feature: Feature = { type: raw.type as 1 | 2 | 3, id: raw.id, properties: raw.properties }
        if (!evaluator.passes(feature))
          continue

        if (type === 'symbol') {
          if (options.labels === false || feature.type !== 1)
            continue
          const placement = evaluator.get('layout', 'symbol-placement', 'string', feature)
          if (placement && placement !== 'point')
            continue
          let text = textOf(evaluator.get('layout', 'text-field', 'value', feature), feature.properties).trim()
          if (!text)
            continue
          const transform = evaluator.get('layout', 'text-transform', 'string', feature)
          if (transform === 'uppercase')
            text = text.toUpperCase()
          else if (transform === 'lowercase')
            text = text.toLowerCase()
          const size = evaluator.number('layout', 'text-size', 16, feature)
          const letterSpacing = evaluator.number('layout', 'text-letter-spacing', 0, feature)
          const anchor = String(evaluator.get('layout', 'text-anchor', 'string', feature) ?? 'center')
          const offset = evaluator.get('layout', 'text-offset', 'value', feature)
          const padding = evaluator.number('layout', 'text-padding', 2, feature)
          const sortKey = evaluator.number('layout', 'symbol-sort-key', 0, feature)
          const font = resolveFont((layer as { layout?: Record<string, unknown> }).layout?.['text-font'], fallbackFont)
          for (const ring of raw.loadGeometry()) {
            for (const point of ring) {
              let [x, y] = project(point.x, point.y)
              if (Array.isArray(offset) && offset.length === 2) {
                x += Number(offset[0]) * size
                y += Number(offset[1]) * size
              }
              const textWidth = estimateTextWidth(text, size, font.weight, letterSpacing)
              labels.push({
                text,
                x,
                y,
                size,
                font,
                letterSpacing,
                color: evaluator.color('text-color', '#000000', feature),
                haloColor: evaluator.color('text-halo-color', 'rgba(0,0,0,0)', feature),
                haloWidth: evaluator.number('paint', 'text-halo-width', 0, feature),
                opacity: evaluator.number('paint', 'text-opacity', 1, feature),
                anchor,
                padding,
                // Later layers win, then the lower sort key within a layer.
                priority: layerIndex * 1e6 - sortKey,
                box: labelBox(x, y, textWidth, size * 1.2, anchor),
                textWidth,
              })
            }
          }
          continue
        }

        const isFill = type === 'fill' || type === 'fill-extrusion'
        if (isFill && feature.type !== 3)
          continue
        if (type === 'line' && feature.type === 1)
          continue

        let attrs: string
        if (isFill) {
          const prefix_ = type === 'fill' ? 'fill' : 'fill-extrusion'
          const color = evaluator.color(`${prefix_}-color`, '#000000', feature)
          const opacity = evaluator.number('paint', `${prefix_}-opacity`, 1, feature)
          if (opacity <= 0)
            continue
          attrs = `fill="${escapeXml(color)}"${opacity < 1 ? ` fill-opacity="${Math.round(opacity * 1000) / 1000}"` : ''}`
        }
        else {
          const color = evaluator.color('line-color', '#000000', feature)
          const lineWidth = evaluator.number('paint', 'line-width', 1, feature)
          const opacity = evaluator.number('paint', 'line-opacity', 1, feature)
          if (opacity <= 0 || lineWidth < 0.05)
            continue
          const cap = String(evaluator.get('layout', 'line-cap', 'string', feature) ?? 'butt')
          const join = String(evaluator.get('layout', 'line-join', 'string', feature) ?? 'miter')
          const dashes = evaluator.get('paint', 'line-dasharray', 'value', feature)
          // Dash lengths are in line widths, as the spec defines them.
          const dash = Array.isArray(dashes) && dashes.every(n => typeof n === 'number')
            ? ` stroke-dasharray="${(dashes as number[]).map(n => round(Math.max(0.1, n * lineWidth))).join(' ')}"`
            : ''
          attrs = `fill="none" stroke="${escapeXml(color)}" stroke-width="${Math.round(lineWidth * 100) / 100}" stroke-linecap="${cap}" stroke-linejoin="${join}"${opacity < 1 ? ` stroke-opacity="${Math.round(opacity * 1000) / 1000}"` : ''}${dash}`
        }

        const close = feature.type === 3 ? 'Z' : ''
        let d = ''
        for (const ring of raw.loadGeometry()) {
          if (ring.length < 2)
            continue
          d += ring.map((point, index) => {
            const [x, y] = project(point.x, point.y)
            return `${index === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`
          }).join('') + close
        }
        if (!d)
          continue
        let group = groups.get(attrs)
        if (!group) {
          group = { attrs, d: [] }
          groups.set(attrs, group)
        }
        group.d.push(d)
      }

      if (groups.size) {
        const paths = [...groups.values()].map(group => `<path ${group.attrs} d="${group.d.join('')}"/>`).join('')
        parts.push(`<g clip-path="url(#${loaded.clipId})">${paths}</g>`)
      }
    }
  })

  // Labels last, greedily: the most important first, each kept only if it
  // fits inside the drawing and clears every label already placed. The same
  // name arriving from two tiles' buffers is the same label.
  // With a route to avoid, the places it passes go first: a route map is
  // there to say where the run went, so those names outrank a bigger place
  // across the map. Within each group the style's own order stands.
  if (options.avoid?.length) {
    const near = (options.avoidNear ?? 48) + avoidPaddingFor(options)
    for (const label of labels) {
      if (distanceToLines(label.x, label.y, options.avoid) <= near)
        label.priority += 1e9
    }
  }
  labels.sort((a, b) => b.priority - a.priority)
  // Tiles carry a margin of their neighbours' features, so a place near a
  // tile edge arrives once per tile. Keep the first, the highest priority.
  const unique = labels.filter((label, index) => !labels.some((other, at) => at < index && other.text === label.text && Math.hypot(other.x - label.x, other.y - label.y) < 2))
  const placed: Label[] = []
  const avoidPadding = avoidPaddingFor(options)
  for (const label of unique) {
    // A label that a route would cover first tries the other sides of its
    // point, half an em clear and then further out, before it is given up:
    // the places a route runs through are the ones most worth naming, and a
    // coastal route runs right past the point a coastal town is pinned to.
    const candidates: Array<{ anchor: string, x: number, y: number }> = [{ anchor: label.anchor, x: label.x, y: label.y }]
    if (options.avoid?.length && label.anchor === 'center') {
      for (const ems of [0.5, 1.5, 3]) {
        const gap = label.size * ems
        candidates.push(
          { anchor: 'left', x: label.x + gap, y: label.y },
          { anchor: 'right', x: label.x - gap, y: label.y },
          { anchor: 'top', x: label.x, y: label.y + gap },
          { anchor: 'bottom', x: label.x, y: label.y - gap },
        )
      }
    }
    for (const candidate of candidates) {
      const box = labelBox(candidate.x, candidate.y, label.textWidth, label.size * 1.2, candidate.anchor)
      const [left, top, right, bottom] = box
      if (left < 4 || top < 4 || right > width - 4 || bottom > height - 4)
        continue
      if (options.reserve?.some(area => overlaps(box, area, 2)))
        continue
      if (options.avoid?.length) {
        const grown: [number, number, number, number] = [left - avoidPadding, top - avoidPadding, right + avoidPadding, bottom + avoidPadding]
        const covered = options.avoid.some(line => line.some((point, index) => index > 0 && segmentHitsBox(line[index - 1]!, point, grown)))
        if (covered)
          continue
      }
      if (placed.some(other => other.text === label.text && Math.hypot(other.x - candidate.x, other.y - candidate.y) < 64))
        break
      if (placed.some(other => overlaps(box, other.box, Math.max(label.padding, other.padding))))
        continue
      placed.push({ ...label, ...candidate, box })
      break
    }

  }
  for (const label of placed) {
    const anchor = label.anchor.includes('left') ? 'start' : label.anchor.includes('right') ? 'end' : 'middle'
    const centreY = (label.box[1] + label.box[3]) / 2
    const halo = label.haloWidth > 0
      ? ` stroke="${escapeXml(label.haloColor)}" stroke-width="${Math.round(label.haloWidth * 2 * 100) / 100}" stroke-linejoin="round" paint-order="stroke"`
      : ''
    parts.push(`<text x="${round(label.x)}" y="${round(centreY)}" text-anchor="${anchor}" dominant-baseline="central" font-family="${escapeXml(label.font.family)}" font-size="${Math.round(label.size * 100) / 100}" font-weight="${label.font.weight}"${label.font.italic ? ' font-style="italic"' : ''}${label.letterSpacing ? ` letter-spacing="${Math.round(label.letterSpacing * label.size * 100) / 100}"` : ''} fill="${escapeXml(label.color)}"${label.opacity < 1 ? ` fill-opacity="${label.opacity}"` : ''}${halo}>${escapeXml(label.text)}</text>`)
  }

  return {
    markup: `<defs>${clipDefs.join('')}</defs>${parts.join('')}`,
    attribution: [...new Set(attributions)].join(' '),
    zoom,
    tiles: fetched,
  }
}

/** Wraps a rendered map in a standalone SVG document. */
export function staticMapSvg(map: StaticMap, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${map.markup}</svg>`
}
