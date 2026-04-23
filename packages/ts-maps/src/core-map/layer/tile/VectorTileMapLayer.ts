// VectorTileMapLayer — a map Layer that fetches Mapbox Vector Tiles (MVT /
// `.pbf`), decodes them through the in-house Pbf + VectorTile pipeline, and
// rasterizes the resulting features to a per-tile Canvas2D surface.
//
// Inspired by mapbox-gl-js / maplibre-gl-js architecture; this is an
// independent zero-dep TypeScript implementation.
//
//   - fill / line / circle style layers
//   - minimal filter evaluator (pass-through for forms the expression engine
//     handles upstream)
//   - `queryRenderedFeatures` is backed by a per-tile R-tree for sublinear
//     bbox / point hit-testing, followed by a precise point-in-geometry pass
//   - one <canvas> element per tile

import type { BBox } from '../../geometry/RTree'
import type { Point } from '../../geometry/Point'
import type { CompiledExpression, EvaluationContext } from '../../style-spec/expressions'
import { compile as compileExpression, isExpression } from '../../style-spec/expressions'
import { Pbf } from '../../proto/Pbf'
import { VectorTile } from '../../mvt/VectorTile'
import { VectorTileFeature } from '../../mvt/VectorTileFeature'
import { RTree } from '../../geometry/RTree'
import { CollisionIndex } from '../../symbols/CollisionIndex'
import { GlyphAtlas } from '../../symbols/GlyphAtlas'
import { IconAtlas } from '../../symbols/IconAtlas'
import { cachedFetch, getDefaultCache, TileCache } from '../../storage'
import { earcut, flatten } from '../../geometry/earcut'
import { ortho } from '../../renderer/webgl/mat4'
import { WebGLUnsupportedError } from '../../renderer/webgl/GLContext'
import { WebGLTileRenderer } from '../../renderer/webgl/WebGLTileRenderer'
import { GridLayer } from './GridLayer'
import { composeTileUrl, getSubdomain } from './urlTemplate'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface VectorTileMapLayerOptions {
  /** Tile URL template with `{z}`/`{x}`/`{y}` (and optionally `{s}`). */
  url: string
  subdomains?: string | string[]
  minZoom?: number
  maxZoom?: number
  maxNativeZoom?: number
  tileSize?: number
  attribution?: string
  pane?: string
  className?: string
  crossOrigin?: boolean | string

  /** Display-layer configs evaluated in array order during rendering. */
  layers?: VectorTileStyleLayer[]
  /** Reserved for `map.setStyle` wiring. */
  sources?: Record<string, unknown>

  /** Shared glyph atlas; lazy-created on first symbol draw when omitted. */
  glyphAtlas?: GlyphAtlas
  /** Shared icon atlas; lazy-created on first symbol draw when omitted. */
  iconAtlas?: IconAtlas

  /**
   * Offline / persistent cache for tile bytes. When `true`, the layer uses a
   * shared default cache; when a `TileCache` is passed, that instance is
   * used. When omitted, tile fetches go directly to the network (backwards
   * compatible with the pre-cache behavior).
   */
  offlineCache?: TileCache | boolean

  /**
   * Per-tile rasterization backend. `'canvas2d'` (default) uses the CPU
   * Canvas2D path; `'webgl'` opts into the WebGL renderer for fill / line /
   * circle primitives. Symbol layers fall back to Canvas2D regardless.
   * When WebGL2 is unavailable the layer logs a single warning and
   * silently falls back to `'canvas2d'`.
   */
  renderer?: 'canvas2d' | 'webgl'
}

export interface VectorTileStyleLayer {
  id: string
  type: 'fill' | 'fill-extrusion' | 'line' | 'circle' | 'symbol'
  sourceLayer: string
  minzoom?: number
  maxzoom?: number
  /**
   * Style-spec filter expression. Legacy MVT forms (`==`, `!=`, `<`, `<=`,
   * `>`, `>=`, `in`, `!in`, `has`, `!has`, `all`, `any`, `none`) are
   * evaluated via a fast inline evaluator; modern forms like `case`,
   * `match`, `coalesce`, nested `['get', …]` on either side, etc. route
   * through the full expression engine.
   */
  filter?: unknown
  paint?: VectorTilePaintProperties
  layout?: VectorTileLayoutProperties
  /**
   * Cache slot — populated on first evaluation with either a compiled
   * expression or `false` if the compile failed (pass-through). The
   * renderer mutates this directly; callers shouldn't set it.
   */
  _compiledFilter?: CompiledExpression | false | null
}

export interface VectorTilePaintProperties {
  'fill-color'?: string
  'fill-opacity'?: number
  'fill-outline-color'?: string
  'line-color'?: string
  'line-width'?: number
  'line-opacity'?: number
  'line-dasharray'?: number[] | unknown
  'line-cap'?: 'butt' | 'round' | 'square'
  'line-join'?: 'miter' | 'round' | 'bevel'
  // A style expression — typically an `interpolate` over `line-progress` — that
  // evaluates to a color at each sampled t along the line. When present, the
  // line is stroked with a linear gradient rather than a solid color.
  'line-gradient'?: unknown
  'circle-color'?: string
  'circle-radius'?: number
  'circle-opacity'?: number
  'circle-stroke-color'?: string
  'circle-stroke-width'?: number

  // Fill-extrusion paint props. Height/base may be literal numbers or a style
  // expression (typically `['get', 'height']` for MVT building datasets).
  'fill-extrusion-color'?: string
  'fill-extrusion-opacity'?: number
  'fill-extrusion-height'?: number | unknown
  'fill-extrusion-base'?: number | unknown

  // Symbol paint props. `text-*` colors use CSS color strings.
  'text-color'?: string
  'text-halo-color'?: string
  'text-halo-width'?: number
  'icon-opacity'?: number
}

export interface VectorTileLayoutProperties {
  visibility?: 'visible' | 'none'

  // Symbol layout props. `text-field` supports either a plain string or the
  // `['get', 'k']` accessor used by MapLibre/Mapbox styles.
  'text-field'?: string | unknown
  'text-size'?: number
  'text-font'?: string | string[]
  'text-italic'?: boolean
  'text-bold'?: boolean
  'icon-image'?: string | unknown
  'icon-size'?: number
  'icon-rotate'?: number
  'symbol-placement'?: 'point'
  'symbol-priority'?: number
}

export interface QueryRenderedFeature {
  feature: VectorTileFeature
  layer: VectorTileStyleLayer
  tile: { x: number, y: number, z: number }
}

export interface QueryRenderedFeaturesOptions {
  /** Container-pixel point to hit-test. */
  point?: [number, number] | Point
  /**
   * Container-pixel bounding box as `[[minX, minY], [maxX, maxY]]`. When
   * both `point` and `bbox` are supplied, `bbox` wins.
   */
  bbox?: [[number, number], [number, number]]
  /** Restrict results to these style-layer ids. */
  layers?: string[]
}

// Each R-tree entry holds enough info to recover the originating feature
// cheaply during the precise-geometry pass.
interface RTreeItem {
  featureIndex: number
  sourceLayerName: string
  bbox: BBox
}

// Internal bookkeeping: alongside each Canvas we track the decoded tile so
// `queryRenderedFeatures` can re-project hit-tests to tile-local coords.
interface DecodedTileEntry {
  canvas: HTMLCanvasElement
  tile: VectorTile | null
  coords: { x: number, y: number, z: number }
  abort: AbortController
  /** Per-tile spatial index built once decoding completes. */
  index: RTree<RTreeItem> | null
  /** Lazily-constructed WebGL renderer (only when `renderer: 'webgl'`). */
  gl: WebGLTileRenderer | null
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class VectorTileMapLayer extends GridLayer {
  declare _styleLayers: VectorTileStyleLayer[]
  declare _decodedTiles: Map<HTMLCanvasElement, DecodedTileEntry>
  declare _featureStateLookup?: (src: string, srcLayer: string, id: number | string) => Record<string, unknown>
  declare _sourceId?: string
  declare _glyphAtlas?: GlyphAtlas
  declare _iconAtlas?: IconAtlas
  declare _offlineCache?: TileCache
  declare _webglFallbackWarned?: boolean

  initialize(options?: VectorTileMapLayerOptions): void {
    super.initialize(options)
    this._styleLayers = this.options!.layers ?? []
    this._decodedTiles = new Map()
    this._glyphAtlas = this.options!.glyphAtlas
    this._iconAtlas = this.options!.iconAtlas

    const offline = this.options!.offlineCache
    if (offline instanceof TileCache)
      this._offlineCache = offline
    else if (offline === true)
      this._offlineCache = getDefaultCache()

    if (typeof this.options!.subdomains === 'string')
      this.options!.subdomains = this.options!.subdomains.split('')
  }

  // Lazy accessors — callers may pass atlases via options, but symbol layers
  // work out-of-the-box without any explicit setup.
  getGlyphAtlas(): GlyphAtlas {
    if (!this._glyphAtlas)
      this._glyphAtlas = new GlyphAtlas()
    return this._glyphAtlas
  }

  getIconAtlas(): IconAtlas {
    if (!this._iconAtlas)
      this._iconAtlas = new IconAtlas()
    return this._iconAtlas
  }

  // -------------------------------------------------------------------------
  // Feature-state wiring
  // -------------------------------------------------------------------------

  setFeatureStateLookup(fn: (src: string, srcLayer: string, id: number | string) => Record<string, unknown>): this {
    this._featureStateLookup = fn
    return this
  }

  setSourceId(id: string): this {
    this._sourceId = id
    return this
  }

  // Re-rasterize every already-decoded tile without refetching. Called from
  // TsMap when feature-state changes — pure paint-side update.
  _repaintDecodedTiles(): void {
    for (const entry of this._decodedTiles.values()) {
      if (!entry.tile)
        continue
      if (entry.gl) {
        entry.gl.clear()
      }
      else {
        const ctx = entry.canvas.getContext('2d')
        if (!ctx)
          continue
        ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height)
      }
      try {
        this._drawTile(entry.canvas, entry.tile, { x: entry.coords.x, y: entry.coords.y, z: entry.coords.z } as Point & { z: number })
      }
      catch {
        // Swallow repaint errors — the next tile cycle will retry via fetch.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  setStyleLayers(layers: VectorTileStyleLayer[]): this {
    this._styleLayers = layers
    this.redraw()
    return this
  }

  getStyleLayer(id: string): VectorTileStyleLayer | undefined {
    for (const layer of this._styleLayers) {
      if (layer.id === id)
        return layer
    }
    return undefined
  }

  queryRenderedFeatures(opts?: QueryRenderedFeaturesOptions): QueryRenderedFeature[]
  queryRenderedFeatures(point: Point, opts?: QueryRenderedFeaturesOptions): QueryRenderedFeature[]
  queryRenderedFeatures(
    pointOrOpts?: Point | QueryRenderedFeaturesOptions,
    maybeOpts?: QueryRenderedFeaturesOptions,
  ): QueryRenderedFeature[] {
    // Disambiguate overload. `(point, opts)` and `(opts)` are both accepted;
    // when the first arg is an object with `point`/`bbox`/`layers` we treat
    // it as the options bag.
    let queryPoint: Point | undefined
    let queryBBox: [[number, number], [number, number]] | undefined
    let opts: QueryRenderedFeaturesOptions | undefined

    if (
      pointOrOpts
      && typeof (pointOrOpts as Point).x === 'number'
      && typeof (pointOrOpts as Point).y === 'number'
    ) {
      queryPoint = pointOrOpts as Point
      opts = maybeOpts
    }
    else {
      opts = pointOrOpts as QueryRenderedFeaturesOptions | undefined
      if (opts?.bbox) {
        queryBBox = opts.bbox
      }
      else if (opts?.point) {
        const p = opts.point
        queryPoint = Array.isArray(p) ? ({ x: p[0], y: p[1] } as Point) : p
      }
    }

    const layerFilter = opts?.layers
    const out: QueryRenderedFeature[] = []
    const tileSize = this.getTileSize().x
    const queryZoom = this._map?.getZoom?.() ?? 0

    for (const entry of this._decodedTiles.values()) {
      if (!entry.tile)
        continue

      // If we have no query region at all, return every filtered feature.
      if (queryPoint === undefined && queryBBox === undefined) {
        for (const styleLayer of this._styleLayers) {
          if (layerFilter && !layerFilter.includes(styleLayer.id))
            continue
          if (styleLayer.layout?.visibility === 'none')
            continue
          const mvtLayer = entry.tile.layers[styleLayer.sourceLayer]
          if (!mvtLayer)
            continue
          for (let i = 0; i < mvtLayer.length; i++) {
            const feature = mvtLayer.feature(i)
            if (!filterPasses(styleLayer, feature, queryZoom))
              continue
            out.push({ feature, layer: styleLayer, tile: entry.coords })
          }
        }
        continue
      }

      // Project container coords to this tile's local (tile-extent) space.
      const localQuery = projectQueryToTile(queryPoint, queryBBox, entry.coords, this._map, tileSize)
      if (!localQuery)
        continue

      // Gather candidates via the tile's spatial index (or via a linear scan
      // if the index isn't ready yet — e.g. tests that construct tiles ad hoc).
      const candidates = collectCandidates(entry, localQuery)
      if (candidates.length === 0)
        continue

      // Group candidate feature indexes by source-layer name so we can
      // intersect with the caller's `layers` filter efficiently.
      for (const styleLayer of this._styleLayers) {
        if (layerFilter && !layerFilter.includes(styleLayer.id))
          continue
        if (styleLayer.layout?.visibility === 'none')
          continue

        const mvtLayer = entry.tile.layers[styleLayer.sourceLayer]
        if (!mvtLayer)
          continue

        // Dedupe candidate feature indexes for this source layer — a single
        // feature should never land in `out` twice for the same style layer.
        const seen = new Set<number>()
        for (const cand of candidates) {
          if (cand.sourceLayerName !== styleLayer.sourceLayer)
            continue
          if (seen.has(cand.featureIndex))
            continue
          seen.add(cand.featureIndex)

          const feature = mvtLayer.feature(cand.featureIndex)
          if (!filterPasses(styleLayer, feature, queryZoom))
            continue

          if (featurePreciseHit(feature, localQuery, styleLayer, tileSize))
            out.push({ feature, layer: styleLayer, tile: entry.coords })
        }
      }
    }

    return out
  }

  // -------------------------------------------------------------------------
  // GridLayer overrides
  // -------------------------------------------------------------------------

  createTile(coords: Point & { z: number }, done: (err: any, tile: HTMLElement) => void): HTMLElement {
    const size = this.getTileSize()
    const canvas = document.createElement('canvas')
    canvas.width = size.x
    canvas.height = size.y
    canvas.setAttribute('role', 'presentation')

    const abort = new AbortController()
    const entry: DecodedTileEntry = {
      canvas,
      tile: null,
      coords: { x: coords.x, y: coords.y, z: coords.z },
      abort,
      index: null,
      gl: null,
    }
    this._decodedTiles.set(canvas, entry)

    const url = this.getTileUrl(coords)

    // Use a microtask-friendly fetch: don't throw out of createTile — errors
    // must reach `done()` so GridLayer's tile bookkeeping stays consistent.
    this._fetchAndDraw(url, canvas, entry, coords, done).catch((err) => {
      // Safety net: _fetchAndDraw already funnels errors through `done`.
      // This catch only fires for unexpected programmer errors.
      done(err, canvas)
    })

    return canvas
  }

  onRemove(map: any): void {
    for (const entry of this._decodedTiles.values()) {
      entry.abort.abort()
      entry.gl?.destroy()
    }
    this._decodedTiles.clear()
    super.onRemove(map)
  }

  _removeTile(key: string): void {
    const tile = this._tiles?.[key]
    if (tile) {
      const entry = this._decodedTiles.get(tile.el as HTMLCanvasElement)
      if (entry) {
        entry.abort.abort()
        entry.gl?.destroy()
        this._decodedTiles.delete(tile.el as HTMLCanvasElement)
      }
    }
    super._removeTile(key)
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  getTileUrl(coords: Point & { z: number }): string {
    const data: any = Object.create(this.options!)
    data.s = getSubdomain(coords, this.options!.subdomains ?? 'abc')
    data.x = coords.x
    data.y = coords.y
    data.z = this._getZoomForUrl(coords.z)
    data.r = ''
    return composeTileUrl(this.options!.url, data)
  }

  _getZoomForUrl(z: number): number {
    return z
  }

  async _fetchAndDraw(
    url: string,
    canvas: HTMLCanvasElement,
    entry: DecodedTileEntry,
    coords: Point & { z: number },
    done: (err: any, tile: HTMLElement) => void,
  ): Promise<void> {
    let bytes: Uint8Array
    try {
      bytes = await this._fetchTileBytes(url, entry)
    }
    catch (err: any) {
      done(err, canvas)
      return
    }

    // If the tile was aborted after the body arrived, don't bother decoding.
    if (entry.abort.signal.aborted) {
      done(new DOMException('aborted', 'AbortError'), canvas)
      return
    }

    let tile: VectorTile
    try {
      const pbf = new Pbf(bytes)
      tile = new VectorTile(pbf)
    }
    catch (err) {
      done(err, canvas)
      return
    }

    entry.tile = tile
    entry.index = buildTileIndex(tile)

    try {
      this._drawTile(canvas, tile, coords)
    }
    catch (err) {
      done(err, canvas)
      return
    }

    done(null, canvas)
  }

  async _fetchTileBytes(url: string, entry: DecodedTileEntry): Promise<Uint8Array> {
    // Cache-backed path. Serves from IndexedDB (or memory fallback), falls
    // back to cached bytes when the network is down.
    if (this._offlineCache) {
      const res = await cachedFetch(url, {
        cache: this._offlineCache,
        signal: entry.abort.signal,
      })
      return res.data
    }

    const fetchInit: RequestInit = { signal: entry.abort.signal }
    if (this.options!.crossOrigin === true)
      fetchInit.credentials = 'same-origin'
    else if (typeof this.options!.crossOrigin === 'string')
      fetchInit.credentials = 'include'

    const response = await fetch(url, fetchInit)
    if (!response.ok)
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    return new Uint8Array(await response.arrayBuffer())
  }

  _drawTile(canvas: HTMLCanvasElement, tile: VectorTile, coords: Point & { z: number }): void {
    const size = this.getTileSize().x
    const mapZoom = this._map?.getZoom?.() ?? coords.z
    const sourceId = this._sourceId ?? ''
    const lookup = this._featureStateLookup

    // Pick the rasterization backend. WebGL is opt-in and silently falls
    // back to Canvas2D on unsupported environments.
    const wantsWebGL = this.options!.renderer === 'webgl'
    const entry = this._decodedTiles.get(canvas)
    let glRenderer: WebGLTileRenderer | null = entry?.gl ?? null
    if (wantsWebGL && entry && !glRenderer) {
      try {
        glRenderer = new WebGLTileRenderer(canvas)
        entry.gl = glRenderer
        // Configure an ortho projection from tile-local (0..size) to clip.
        const proj = ortho(0, size, size, 0, -1, 1)
        glRenderer.setProjectionMatrix(proj)
      }
      catch (err) {
        glRenderer = null
        if (err instanceof WebGLUnsupportedError) {
          if (!this._webglFallbackWarned) {
            this._webglFallbackWarned = true
            console.warn('[ts-maps] WebGL2 unavailable; VectorTileMapLayer falling back to Canvas2D.')
          }
        }
        else {
          // Unexpected error: still fall back rather than crashing the tile.
          if (!this._webglFallbackWarned) {
            this._webglFallbackWarned = true
            console.warn('[ts-maps] WebGL initialization failed; falling back to Canvas2D.', err)
          }
        }
      }
    }

    const ctx = glRenderer ? null : canvas.getContext('2d')
    if (!glRenderer && !ctx)
      return
    if (glRenderer) {
      glRenderer.clear()
    }

    // Symbol layers share a per-tile collision index so labels/icons don't
    // overlap. Created lazily and only when a symbol layer is actually drawn.
    let collision: CollisionIndex | null = null

    for (const styleLayer of this._styleLayers) {
      if (styleLayer.layout?.visibility === 'none')
        continue
      if (styleLayer.minzoom !== undefined && mapZoom < styleLayer.minzoom)
        continue
      if (styleLayer.maxzoom !== undefined && mapZoom > styleLayer.maxzoom)
        continue

      const mvtLayer = tile.layers[styleLayer.sourceLayer]
      if (!mvtLayer)
        continue

      // Per-zoom resolution of dasharray (interpolate expression → number[]).
      const paint = styleLayer.paint
      const dashResolved = paint && paint['line-dasharray']
        ? resolvePaintExpression(paint['line-dasharray'], mapZoom, undefined, undefined) as number[] | undefined
        : undefined

      // Compile line-gradient once per draw pass; the sampler below runs it
      // at five `line-progress` points to build a canvas gradient.
      let gradientCompiled: CompiledExpression | null = null
      if (styleLayer.type === 'line' && paint && paint['line-gradient'] !== undefined) {
        try {
          gradientCompiled = compileExpression(paint['line-gradient'], 'color')
        }
        catch {
          gradientCompiled = null
        }
      }

      for (let i = 0; i < mvtLayer.length; i++) {
        const feature = mvtLayer.feature(i)

        if (!filterPasses(styleLayer, feature, mapZoom))
          continue

        const rings = feature.loadGeometry()
        const scale = size / feature.extent

        // Resolve feature state for this feature id, if the host supplied a
        // lookup and the feature carries an id.
        let featureState: Record<string, unknown> | undefined
        if (lookup && feature.id !== undefined)
          featureState = lookup(sourceId, styleLayer.sourceLayer, feature.id as number | string)

        if (styleLayer.type === 'fill') {
          if (glRenderer)
            drawFillGL(glRenderer, rings, scale, paint, mapZoom, feature, featureState)
          else if (ctx)
            drawFill(ctx, rings, scale, paint, mapZoom, feature, featureState)
        }
        else if (styleLayer.type === 'fill-extrusion') {
          // Extrusions require a 3D renderer. In Canvas2D mode we fall back
          // to a flat fill so the layer remains visible (minus depth).
          if (glRenderer)
            drawFillExtrusionGL(glRenderer, rings, scale, paint, mapZoom, feature, featureState)
          else if (ctx)
            drawFill(ctx, rings, scale, paint as VectorTilePaintProperties, mapZoom, feature, featureState)
        }
        else if (styleLayer.type === 'line') {
          if (glRenderer)
            drawLineGL(glRenderer, rings, scale, paint, mapZoom, feature, featureState)
          else if (ctx)
            drawLine(ctx, rings, scale, paint, mapZoom, feature, featureState, dashResolved, gradientCompiled)
        }
        else if (styleLayer.type === 'circle') {
          if (glRenderer)
            drawCircleGL(glRenderer, rings, scale, paint, mapZoom, feature, featureState)
          else if (ctx)
            drawCircle(ctx, rings, scale, paint, mapZoom, feature, featureState)
        }
        else if (styleLayer.type === 'symbol') {
          // Symbol layers require Canvas2D. When the tile canvas is bound to
          // a WebGL context we can't also acquire a 2D context, so symbols
          // are skipped for this pass. A future change will composite
          // symbols onto an overlay canvas.
          if (!ctx)
            continue
          if (!collision)
            collision = new CollisionIndex({ width: size, height: size })
          drawSymbol(
            ctx,
            rings,
            scale,
            styleLayer,
            feature,
            mapZoom,
            featureState,
            this.getGlyphAtlas(),
            this._iconAtlas,
            collision,
          )
        }
      }
    }

    // WebGL post-pass: terrain underlay, custom layers, sky overlay. The
    // map owns all of this state; the tile layer just gives each hook a
    // live GL context + projection matrix.
    if (glRenderer && this._map) {
      const proj = ortho(0, size, size, 0, -1, 1)
      const map = this._map as any
      if (typeof map._drawTerrainForTile === 'function')
        map._drawTerrainForTile(glRenderer, coords, size, proj)
      if (typeof map._invokeCustomLayerRender === 'function')
        map._invokeCustomLayerRender(glRenderer.ctx.gl, proj)
    }
  }
}

VectorTileMapLayer.setDefaultOptions({
  url: '',
  tileSize: 512,
  subdomains: 'abc',
  minZoom: 0,
  maxZoom: 22,
  crossOrigin: false,
  layers: [],
  sources: undefined,
})

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// Resolve a paint value that might be a literal or a style expression. Returns
// `undefined` if the expression fails to compile — callers fall back to a
// reasonable default. Feature state is threaded through the evaluation
// context so `['feature-state', …]` resolves against the lookup table.
function resolvePaintExpression(
  value: unknown,
  zoom: number,
  feature: VectorTileFeature | undefined,
  featureState: Record<string, unknown> | undefined,
): unknown {
  if (!isExpression(value))
    return value
  try {
    const compiled = compileExpression(value as any, 'value')
    const ctx: EvaluationContext = {
      zoom,
      feature: feature
        ? {
            type: feature.type as 1 | 2 | 3,
            id: feature.id as number | string | undefined,
            properties: feature.properties as Record<string, unknown>,
          }
        : undefined,
      featureState,
    }
    return compiled.evaluate(ctx)
  }
  catch {
    return undefined
  }
}

function drawFill(
  ctx: CanvasRenderingContext2D,
  rings: Point[][],
  scale: number,
  paint: VectorTilePaintProperties | undefined,
  zoom: number,
  feature: VectorTileFeature,
  featureState?: Record<string, unknown>,
): void {
  if (rings.length === 0)
    return

  const fillColor = (resolvePaintExpression(paint?.['fill-color'], zoom, feature, featureState) as string | undefined) ?? '#000'
  const fillOpacity = resolvePaintExpression(paint?.['fill-opacity'], zoom, feature, featureState) as number | undefined
  const outline = resolvePaintExpression(paint?.['fill-outline-color'], zoom, feature, featureState) as string | undefined

  ctx.beginPath()
  for (const ring of rings) {
    if (ring.length === 0)
      continue
    ctx.moveTo(ring[0].x * scale, ring[0].y * scale)
    for (let i = 1; i < ring.length; i++)
      ctx.lineTo(ring[i].x * scale, ring[i].y * scale)
  }

  ctx.save()
  if (fillOpacity !== undefined)
    ctx.globalAlpha = fillOpacity
  ctx.fillStyle = fillColor
  ctx.fill('evenodd')
  ctx.restore()

  if (outline) {
    ctx.save()
    ctx.strokeStyle = outline
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }
}

// Sample a compiled gradient expression at five `line-progress` stops. These
// become the colour stops of a canvas linear gradient running from the first
// to last vertex of the projected polyline.
const LINE_GRADIENT_SAMPLES: readonly number[] = [0, 0.25, 0.5, 0.75, 1]

function buildLineGradient(
  ctx: CanvasRenderingContext2D,
  firstRing: Point[],
  scale: number,
  gradientCompiled: CompiledExpression,
  zoom: number,
  feature: VectorTileFeature,
  featureState: Record<string, unknown> | undefined,
): CanvasGradient | string | null {
  if (firstRing.length < 2)
    return null
  const a = firstRing[0]!
  const b = firstRing[firstRing.length - 1]!
  const grad = ctx.createLinearGradient(a.x * scale, a.y * scale, b.x * scale, b.y * scale)
  const evalCtx: EvaluationContext = {
    zoom,
    feature: {
      type: feature.type as 1 | 2 | 3,
      id: feature.id as number | string | undefined,
      properties: feature.properties as Record<string, unknown>,
    },
    featureState,
    lineProgress: 0,
  }
  for (const t of LINE_GRADIENT_SAMPLES) {
    evalCtx.lineProgress = t
    try {
      const colour = gradientCompiled.evaluate(evalCtx)
      if (typeof colour === 'string')
        grad.addColorStop(t, colour)
    }
    catch {
      // Ignore failing samples; the gradient still has whatever stops were
      // successfully added.
    }
  }
  return grad
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  rings: Point[][],
  scale: number,
  paint: VectorTilePaintProperties | undefined,
  zoom: number,
  feature: VectorTileFeature,
  featureState?: Record<string, unknown>,
  dashResolved?: number[],
  gradientCompiled?: CompiledExpression | null,
): void {
  if (rings.length === 0)
    return

  const color = (resolvePaintExpression(paint?.['line-color'], zoom, feature, featureState) as string | undefined) ?? '#000'
  const width = (resolvePaintExpression(paint?.['line-width'], zoom, feature, featureState) as number | undefined) ?? 1
  const opacity = resolvePaintExpression(paint?.['line-opacity'], zoom, feature, featureState) as number | undefined
  const cap = paint?.['line-cap']
  const join = paint?.['line-join']

  ctx.save()
  if (gradientCompiled) {
    const strokeStyle = buildLineGradient(ctx, rings[0]!, scale, gradientCompiled, zoom, feature, featureState)
    ctx.strokeStyle = strokeStyle ?? color
  }
  else {
    ctx.strokeStyle = color
  }
  ctx.lineWidth = width
  if (opacity !== undefined)
    ctx.globalAlpha = opacity
  if (dashResolved && Array.isArray(dashResolved))
    ctx.setLineDash(dashResolved)
  if (cap)
    ctx.lineCap = cap
  if (join)
    ctx.lineJoin = join

  ctx.beginPath()
  for (const ring of rings) {
    if (ring.length === 0)
      continue
    ctx.moveTo(ring[0].x * scale, ring[0].y * scale)
    for (let i = 1; i < ring.length; i++)
      ctx.lineTo(ring[i].x * scale, ring[i].y * scale)
  }
  ctx.stroke()
  ctx.restore()
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  rings: Point[][],
  scale: number,
  paint: VectorTilePaintProperties | undefined,
  zoom: number,
  feature: VectorTileFeature,
  featureState?: Record<string, unknown>,
): void {
  if (rings.length === 0)
    return

  const color = (resolvePaintExpression(paint?.['circle-color'], zoom, feature, featureState) as string | undefined) ?? '#000'
  const radius = (resolvePaintExpression(paint?.['circle-radius'], zoom, feature, featureState) as number | undefined) ?? 4
  const opacity = resolvePaintExpression(paint?.['circle-opacity'], zoom, feature, featureState) as number | undefined
  const strokeColor = resolvePaintExpression(paint?.['circle-stroke-color'], zoom, feature, featureState) as string | undefined
  const strokeWidth = resolvePaintExpression(paint?.['circle-stroke-width'], zoom, feature, featureState) as number | undefined

  ctx.save()
  if (opacity !== undefined)
    ctx.globalAlpha = opacity

  for (const ring of rings) {
    for (const pt of ring) {
      ctx.beginPath()
      ctx.arc(pt.x * scale, pt.y * scale, radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      if (strokeColor && strokeWidth) {
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = strokeWidth
        ctx.stroke()
      }
    }
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Symbol helpers — text + icon rendering for `type: 'symbol'` style layers.
// Placement is `point` only for now; collision is a flat grid across the
// tile. Expressions are evaluated via the full engine so `text-field` and
// `icon-image` support `['get', …]` in addition to plain strings.
// ---------------------------------------------------------------------------

function resolveLayoutExpression(
  value: unknown,
  zoom: number,
  feature: VectorTileFeature | undefined,
  featureState: Record<string, unknown> | undefined,
): unknown {
  return resolvePaintExpression(value, zoom, feature, featureState)
}

function coerceString(v: unknown): string {
  if (v === undefined || v === null)
    return ''
  if (typeof v === 'string')
    return v
  if (typeof v === 'number')
    return String(v)
  if (typeof v === 'boolean')
    return v ? 'true' : 'false'
  return ''
}

function drawSymbol(
  ctx: CanvasRenderingContext2D,
  rings: Point[][],
  scale: number,
  styleLayer: VectorTileStyleLayer,
  feature: VectorTileFeature,
  zoom: number,
  featureState: Record<string, unknown> | undefined,
  glyphAtlas: GlyphAtlas,
  iconAtlas: IconAtlas | undefined,
  collision: CollisionIndex,
): void {
  // Symbols only place at MVT Point geometries today.
  if (feature.type !== 1)
    return
  if (rings.length === 0 || rings[0].length === 0)
    return

  const layout = styleLayer.layout
  const paint = styleLayer.paint

  // Anchor at the first vertex of the feature. Multi-point features place one
  // symbol per vertex.
  for (const ring of rings) {
    for (const pt of ring) {
      const anchorX = pt.x * scale
      const anchorY = pt.y * scale

      // Resolve text + icon once per placement. Expressions can reference
      // feature properties/state.
      const rawField = resolveLayoutExpression(layout?.['text-field'], zoom, feature, featureState)
      const text = coerceString(rawField)
      const textSize = (resolveLayoutExpression(layout?.['text-size'], zoom, feature, featureState) as number | undefined) ?? 16
      const italic = !!resolveLayoutExpression(layout?.['text-italic'], zoom, feature, featureState)
      const bold = !!resolveLayoutExpression(layout?.['text-bold'], zoom, feature, featureState)

      const textColor = (resolveLayoutExpression(paint?.['text-color'], zoom, feature, featureState) as string | undefined) ?? '#000'
      const haloColor = resolveLayoutExpression(paint?.['text-halo-color'], zoom, feature, featureState) as string | undefined
      const haloWidth = resolveLayoutExpression(paint?.['text-halo-width'], zoom, feature, featureState) as number | undefined

      const iconId = coerceString(resolveLayoutExpression(layout?.['icon-image'], zoom, feature, featureState))
      const iconSize = resolveLayoutExpression(layout?.['icon-size'], zoom, feature, featureState) as number | undefined
      const iconRotate = resolveLayoutExpression(layout?.['icon-rotate'], zoom, feature, featureState) as number | undefined
      const iconEntry = iconId && iconAtlas ? iconAtlas.get(iconId) : undefined

      const priority = layout?.['symbol-priority']

      // Measure text + icon to build a collision box that conservatively
      // covers the union of the two primitives at this anchor.
      let minX = anchorX
      let minY = anchorY
      let maxX = anchorX
      let maxY = anchorY

      let textMetrics: { width: number, height: number } | null = null
      if (text) {
        textMetrics = glyphAtlas.measure(text, { italic, bold })
        // Approximate placement: text centred horizontally, sitting on the
        // anchor's baseline. Scale factor mirrors drawText's size/24.
        const scaleFactor = textSize / 24
        const w = textMetrics.width * scaleFactor
        const h = textMetrics.height * scaleFactor
        const tx = anchorX - w / 2
        const ty = anchorY - h
        if (tx < minX)
          minX = tx
        if (ty < minY)
          minY = ty
        if (tx + w > maxX)
          maxX = tx + w
        if (ty + h > maxY)
          maxY = ty + h
      }

      if (iconEntry) {
        const target = iconSize ?? iconEntry.width
        const ix = anchorX - target / 2
        const iy = anchorY - target / 2
        if (ix < minX)
          minX = ix
        if (iy < minY)
          minY = iy
        if (ix + target > maxX)
          maxX = ix + target
        if (iy + target > maxY)
          maxY = iy + target
      }

      // Nothing to place — skip to the next anchor.
      if (!text && !iconEntry)
        continue

      if (!collision.tryInsert({ minX, minY, maxX, maxY, priority }))
        continue

      // Icon first, then text on top.
      if (iconEntry && iconAtlas) {
        iconAtlas.drawIcon(ctx, iconId, anchorX, anchorY, {
          size: iconSize ?? iconEntry.width,
          rotation: iconRotate,
        })
      }

      if (text && textMetrics) {
        const scaleFactor = textSize / 24
        const w = textMetrics.width * scaleFactor
        glyphAtlas.drawText(
          ctx,
          text,
          anchorX - w / 2,
          anchorY,
          {
            color: textColor,
            haloColor,
            haloWidth,
            size: textSize,
            italic,
            bold,
          },
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal filter evaluator — covers the common style-spec forms:
//   ['==', ['get', 'k'], v]    — equality
//   ['!=', ['get', 'k'], v]    — inequality
//   ['in', ['get', 'k'], v1, v2, …]
//   ['has', 'k']               — key presence
//   ['all', …]                 — every child true
//   ['any', …]                 — any child true
//   ['none', …]                — every child false
// Anything else returns true (pass-through) so we don't accidentally suppress
// features the caller intended to draw. The full expression engine owns the
// complete filter semantics; this helper covers the forms commonly needed
// inline during rasterization.
// ---------------------------------------------------------------------------

// Legacy MVT filter fast-path operators — all of these the inline
// evaluator recognises and handles without allocating a compiled
// expression. Anything outside this set triggers the expression-engine
// fallback below.
const LEGACY_FILTER_OPS = new Set<string>([
  'all', 'any', 'none',
  'has', '!has',
  'in', '!in',
  '==', '!=', '<', '<=', '>', '>=',
])

// Entry point used by the style-layer draw loop. Picks the fast inline
// path for plain MVT filters and falls back to the full expression engine
// for anything else (`case`, `match`, `coalesce`, nested `['get', …]`,
// data-driven comparisons, etc.).
//
// The compiled expression is cached on the style layer so a filter with,
// say, 50,000 features only compiles once per tile pass.
function filterPasses(styleLayer: VectorTileStyleLayer, feature: VectorTileFeature, mapZoom: number): boolean {
  const filter = styleLayer.filter
  if (!filter)
    return true
  if (!Array.isArray(filter))
    return true

  const op = filter[0] as unknown
  if (typeof op === 'string' && LEGACY_FILTER_OPS.has(op) && isLegacyShape(filter)) {
    return evaluateFilterLegacy(filter, feature)
  }

  // Route through the full expression engine. Cache the compiled form.
  if (styleLayer._compiledFilter === undefined) {
    try {
      styleLayer._compiledFilter = compileExpression(filter, 'boolean')
    }
    catch {
      // Compile failure: pass through rather than drop every feature.
      // Marked with `false` so we skip the re-compile next tick.
      styleLayer._compiledFilter = false
    }
  }
  const compiled = styleLayer._compiledFilter
  if (!compiled)
    return true

  try {
    const result = compiled.evaluate({
      zoom: mapZoom,
      feature: { type: feature.type, id: feature.id, properties: feature.properties },
    })
    return Boolean(result)
  }
  catch {
    // Runtime evaluation failure (e.g. type coercion on bad data) — pass
    // through, matching upstream Mapbox behaviour where bad filters never
    // suppress features silently.
    return true
  }
}

// Returns true when every operand in a legacy-form filter is either a
// literal (string/number/boolean/null) or the single ['get', k] /
// ['geometry-type'] accessor we can resolve inline. When the filter embeds
// sub-expressions we cede to the full engine.
function isLegacyShape(filter: unknown[]): boolean {
  const op = filter[0] as string
  if (op === 'all' || op === 'any' || op === 'none')
    return filter.slice(1).every(child => Array.isArray(child) && isLegacyShape(child as unknown[]))
  for (let i = 1; i < filter.length; i++) {
    const node = filter[i]
    if (Array.isArray(node)) {
      const head = node[0]
      if (head !== 'get' && head !== 'geometry-type' && head !== '$type')
        return false
    }
  }
  return true
}

function evaluateFilterLegacy(filter: unknown[], feature: VectorTileFeature): boolean {
  const [op, ...rest] = filter as any[]

  if (op === 'all')
    return rest.every(child => evaluateFilterLegacy(child, feature))
  if (op === 'any')
    return rest.some(child => evaluateFilterLegacy(child, feature))
  if (op === 'none')
    return rest.every(child => !evaluateFilterLegacy(child, feature))

  if (op === 'has') {
    const key = rest[0]
    return typeof key === 'string' && key in feature.properties
  }
  if (op === '!has') {
    const key = rest[0]
    return typeof key === 'string' && !(key in feature.properties)
  }

  const left = resolveOperand(rest[0], feature)

  if (op === '==' || op === '!=') {
    const right = resolveOperand(rest[1], feature)
    return op === '==' ? left === right : left !== right
  }
  if (op === '<' || op === '<=' || op === '>' || op === '>=') {
    const right = resolveOperand(rest[1], feature)
    if (typeof left !== 'number' || typeof right !== 'number')
      return false
    return op === '<' ? left < right : op === '<=' ? left <= right : op === '>' ? left > right : left >= right
  }
  if (op === 'in') {
    const values = rest.slice(1).map(v => resolveOperand(v, feature))
    return values.includes(left)
  }
  if (op === '!in') {
    const values = rest.slice(1).map(v => resolveOperand(v, feature))
    return !values.includes(left)
  }

  return true
}

// Back-compat shim for any external caller that imported the old name.
function evaluateFilter(filter: unknown, feature: VectorTileFeature): boolean {
  return filterPasses({ id: '_shim', type: 'fill', sourceLayer: '', filter } as VectorTileStyleLayer, feature, 0)
}

function resolveOperand(node: unknown, feature: VectorTileFeature): unknown {
  if (Array.isArray(node)) {
    if (node[0] === 'get' && typeof node[1] === 'string')
      return feature.properties[node[1]] ?? null
    if (node[0] === 'geometry-type') {
      const t = feature.type
      return t === 1 ? 'Point' : t === 2 ? 'LineString' : t === 3 ? 'Polygon' : 'Unknown'
    }
  }
  return node
}

// ---------------------------------------------------------------------------
// Spatial index + hit-testing
// ---------------------------------------------------------------------------

// Per-query structure holding the point/bbox already projected into a tile's
// local (MVT extent) coordinate space, plus the tile-local scale needed to
// translate pixel tolerances (circle radius, line half-width) into extent
// units for the precise geometry test.
interface LocalQuery {
  kind: 'point' | 'bbox'
  px: number
  py: number
  bbox: BBox
  scale: number // extent per container pixel
}

function buildTileIndex(tile: VectorTile): RTree<RTreeItem> {
  const items: Array<{ bbox: BBox, data: RTreeItem }> = []
  for (const sourceLayerName of Object.keys(tile.layers)) {
    const mvtLayer = tile.layers[sourceLayerName]
    for (let i = 0; i < mvtLayer.length; i++) {
      const feature = mvtLayer.feature(i)
      const fb = feature.bbox()
      const bbox: BBox = [fb[0], fb[1], fb[2], fb[3]]
      items.push({ bbox, data: { featureIndex: i, sourceLayerName, bbox } })
    }
  }
  const tree = new RTree<RTreeItem>()
  tree.load(items)
  return tree
}

function projectQueryToTile(
  queryPoint: Point | undefined,
  queryBBox: [[number, number], [number, number]] | undefined,
  coords: { x: number, y: number, z: number },
  map: any,
  tileSize: number,
): LocalQuery | null {
  if (!map)
    return null

  if (queryBBox) {
    const [[cx0, cy0], [cx1, cy1]] = queryBBox
    const p0 = map.containerPointToLayerPoint?.({ x: cx0, y: cy0 } as Point) ?? { x: cx0, y: cy0 }
    const p1 = map.containerPointToLayerPoint?.({ x: cx1, y: cy1 } as Point) ?? { x: cx1, y: cy1 }
    const localMinX = Math.min(p0.x, p1.x) - coords.x * tileSize
    const localMinY = Math.min(p0.y, p1.y) - coords.y * tileSize
    const localMaxX = Math.max(p0.x, p1.x) - coords.x * tileSize
    const localMaxY = Math.max(p0.y, p1.y) - coords.y * tileSize
    // Reject bboxes that don't intersect the tile rectangle at all.
    if (localMaxX < 0 || localMaxY < 0 || localMinX > tileSize || localMinY > tileSize)
      return null

    // At this stage we don't have a feature yet, so we need a representative
    // extent for scaling. Every feature in a given tile shares a layer-level
    // extent that we can't know here without the layer; fall back to 4096
    // (the MVT default) and let the precise hit-test rescale per feature.
    const extent = 4096
    const scale = extent / tileSize
    return {
      kind: 'bbox',
      px: (localMinX + localMaxX) * 0.5 * scale,
      py: (localMinY + localMaxY) * 0.5 * scale,
      bbox: [localMinX * scale, localMinY * scale, localMaxX * scale, localMaxY * scale],
      scale,
    }
  }

  if (queryPoint) {
    const layerPoint = map.containerPointToLayerPoint?.(queryPoint) ?? queryPoint
    const lx = layerPoint.x - coords.x * tileSize
    const ly = layerPoint.y - coords.y * tileSize
    if (lx < 0 || ly < 0 || lx > tileSize || ly > tileSize)
      return null
    const extent = 4096
    const scale = extent / tileSize
    const px = lx * scale
    const py = ly * scale
    // Pad the point bbox by a small tolerance so line/circle features whose
    // exact geometry just misses the pixel still get candidate-ed.
    const tol = 8 * scale
    return {
      kind: 'point',
      px,
      py,
      bbox: [px - tol, py - tol, px + tol, py + tol],
      scale,
    }
  }

  return null
}

function collectCandidates(entry: DecodedTileEntry, q: LocalQuery): RTreeItem[] {
  if (entry.index) {
    const hits = q.kind === 'point'
      ? entry.index.search(q.bbox)
      : entry.index.search(q.bbox)
    return hits.map(h => h.data)
  }

  // Fallback: no index yet — produce the full candidate set.
  if (!entry.tile)
    return []
  const out: RTreeItem[] = []
  for (const name of Object.keys(entry.tile.layers)) {
    const mvtLayer = entry.tile.layers[name]
    for (let i = 0; i < mvtLayer.length; i++) {
      const f = mvtLayer.feature(i)
      const fb = f.bbox()
      out.push({ featureIndex: i, sourceLayerName: name, bbox: [fb[0], fb[1], fb[2], fb[3]] })
    }
  }
  return out
}

function featurePreciseHit(
  feature: VectorTileFeature,
  q: LocalQuery,
  styleLayer: VectorTileStyleLayer,
  tileSize: number,
): boolean {
  // Rescale the query to the feature's own extent (layers in a single tile
  // can use different extents).
  const scale = feature.extent / tileSize
  const px = q.px * (scale / q.scale)
  const py = q.py * (scale / q.scale)
  const qbbox: BBox = [
    q.bbox[0] * (scale / q.scale),
    q.bbox[1] * (scale / q.scale),
    q.bbox[2] * (scale / q.scale),
    q.bbox[3] * (scale / q.scale),
  ]

  const rings = feature.loadGeometry()

  if (q.kind === 'bbox') {
    // For bbox queries we consider a feature matched if any of its vertices
    // lie inside, or — for polygons — the bbox centre sits inside the poly.
    if (feature.type === 3) {
      if (pointInPolygon({ x: px, y: py }, rings))
        return true
    }
    for (const ring of rings) {
      for (const pt of ring) {
        if (pt.x >= qbbox[0] && pt.x <= qbbox[2] && pt.y >= qbbox[1] && pt.y <= qbbox[3])
          return true
      }
    }
    return false
  }

  if (feature.type === 3)
    return pointInPolygon({ x: px, y: py }, rings)

  if (feature.type === 2) {
    const width = styleLayer.paint?.['line-width'] ?? 1
    const tol = (width / 2 + 4) * scale
    const tolSq = tol * tol
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        if (distanceToSegmentSq({ x: px, y: py }, ring[i - 1], ring[i]) <= tolSq)
          return true
      }
    }
    return false
  }

  if (feature.type === 1) {
    const radius = styleLayer.paint?.['circle-radius'] ?? 4
    const tol = (radius + 2) * scale
    const tolSq = tol * tol
    for (const ring of rings) {
      for (const pt of ring) {
        const dx = pt.x - px
        const dy = pt.y - py
        if (dx * dx + dy * dy <= tolSq)
          return true
      }
    }
    return false
  }

  return false
}

function pointInPolygon(p: { x: number, y: number }, rings: Point[][]): boolean {
  // Even-odd rule across all rings (matches canvas `fill('evenodd')`).
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x
      const yi = ring[i].y
      const xj = ring[j].x
      const yj = ring[j].y
      const intersects
        = ((yi > p.y) !== (yj > p.y))
          && (p.x < ((xj - xi) * (p.y - yi)) / ((yj - yi) || 1) + xi)
      if (intersects)
        inside = !inside
    }
  }
  return inside
}

// ---------------------------------------------------------------------------
// WebGL draw helpers — thin adapters that triangulate/flatten MVT geometry
// into the buffer layout consumed by `WebGLTileRenderer`. Symbol layers are
// intentionally excluded and still go through Canvas2D.
// ---------------------------------------------------------------------------

function drawFillGL(
  gl: WebGLTileRenderer,
  rings: Point[][],
  scale: number,
  paint: VectorTilePaintProperties | undefined,
  zoom: number,
  feature: VectorTileFeature,
  featureState?: Record<string, unknown>,
): void {
  if (rings.length === 0)
    return

  const fillColor = (resolvePaintExpression(paint?.['fill-color'], zoom, feature, featureState) as string | undefined) ?? '#000'
  const fillOpacity = (resolvePaintExpression(paint?.['fill-opacity'], zoom, feature, featureState) as number | undefined) ?? 1
  const rgba = parseCssColor(fillColor, fillOpacity)

  // Scale rings to pixel space before triangulating.
  const ringsAsPoints = rings.map(r => r.map(pt => ({ x: pt.x * scale, y: pt.y * scale })))
  const { vertices, holes } = flatten(ringsAsPoints)
  const indices = earcut(vertices, holes, 2)
  if (indices.length === 0)
    return

  const triBuf = new Float32Array(indices.length * 2)
  for (let i = 0; i < indices.length; i++) {
    triBuf[i * 2] = vertices[indices[i] * 2] as number
    triBuf[i * 2 + 1] = vertices[indices[i] * 2 + 1] as number
  }
  gl.drawFill(triBuf, rgba)
}

// Fill-extrusion draw helper — resolves paint props per feature and forwards
// the footprint to the renderer's 3D extrusion pipeline. Skips features
// whose height does not exceed their base (nothing to extrude).
function drawFillExtrusionGL(
  gl: WebGLTileRenderer,
  rings: Point[][],
  scale: number,
  paint: VectorTilePaintProperties | undefined,
  zoom: number,
  feature: VectorTileFeature,
  featureState?: Record<string, unknown>,
): void {
  if (rings.length === 0)
    return

  const color = (resolvePaintExpression(paint?.['fill-extrusion-color'], zoom, feature, featureState) as string | undefined) ?? '#000'
  const opacity = (resolvePaintExpression(paint?.['fill-extrusion-opacity'], zoom, feature, featureState) as number | undefined) ?? 1
  const height = (resolvePaintExpression(paint?.['fill-extrusion-height'], zoom, feature, featureState) as number | undefined) ?? 0
  const base = (resolvePaintExpression(paint?.['fill-extrusion-base'], zoom, feature, featureState) as number | undefined) ?? 0

  if (height <= base)
    return

  const rgba = parseCssColor(color, 1)
  const scaledRings = rings.map(r => r.map(pt => ({ x: pt.x * scale, y: pt.y * scale })))

  gl.drawFillExtrusion(
    [{ rings: scaledRings }],
    [height * scale],
    [base * scale],
    rgba,
    opacity,
  )
}

function drawLineGL(
  gl: WebGLTileRenderer,
  rings: Point[][],
  scale: number,
  paint: VectorTilePaintProperties | undefined,
  zoom: number,
  feature: VectorTileFeature,
  featureState?: Record<string, unknown>,
): void {
  if (rings.length === 0)
    return

  const color = (resolvePaintExpression(paint?.['line-color'], zoom, feature, featureState) as string | undefined) ?? '#000'
  const width = (resolvePaintExpression(paint?.['line-width'], zoom, feature, featureState) as number | undefined) ?? 1
  const opacity = (resolvePaintExpression(paint?.['line-opacity'], zoom, feature, featureState) as number | undefined) ?? 1
  const rgba = parseCssColor(color, opacity)

  for (const ring of rings) {
    if (ring.length < 2)
      continue
    const buf = new Float32Array(ring.length * 2)
    for (let i = 0; i < ring.length; i++) {
      buf[i * 2] = ring[i].x * scale
      buf[i * 2 + 1] = ring[i].y * scale
    }
    gl.drawLine(buf, {
      width,
      color: rgba,
      cap: paint?.['line-cap'],
      join: paint?.['line-join'],
    })
  }
}

function drawCircleGL(
  gl: WebGLTileRenderer,
  rings: Point[][],
  scale: number,
  paint: VectorTilePaintProperties | undefined,
  zoom: number,
  feature: VectorTileFeature,
  featureState?: Record<string, unknown>,
): void {
  if (rings.length === 0)
    return

  const color = (resolvePaintExpression(paint?.['circle-color'], zoom, feature, featureState) as string | undefined) ?? '#000'
  const radius = (resolvePaintExpression(paint?.['circle-radius'], zoom, feature, featureState) as number | undefined) ?? 4
  const opacity = (resolvePaintExpression(paint?.['circle-opacity'], zoom, feature, featureState) as number | undefined) ?? 1
  const strokeColor = resolvePaintExpression(paint?.['circle-stroke-color'], zoom, feature, featureState) as string | undefined
  const strokeWidth = (resolvePaintExpression(paint?.['circle-stroke-width'], zoom, feature, featureState) as number | undefined) ?? 0

  const rgba = parseCssColor(color, opacity)
  const strokeRgba = strokeColor ? parseCssColor(strokeColor, opacity) : undefined

  // Flatten every vertex of every ring into a single center buffer.
  let count = 0
  for (const ring of rings)
    count += ring.length
  if (count === 0)
    return
  const centers = new Float32Array(count * 2)
  let i = 0
  for (const ring of rings) {
    for (const pt of ring) {
      centers[i++] = pt.x * scale
      centers[i++] = pt.y * scale
    }
  }

  gl.drawCircles(centers, {
    radius,
    color: rgba,
    strokeColor: strokeRgba,
    strokeWidth,
  })
}

// Tiny CSS color parser — covers `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, and
// `rgb(...)` / `rgba(...)`. Returns normalized RGBA in [0, 1]. Unknown input
// resolves to opaque black; callers may still multiply in a separate opacity.
function parseCssColor(input: string, opacity: number): [number, number, number, number] {
  const trimmed = input.trim()
  if (trimmed.charAt(0) === '#') {
    const hex = trimmed.slice(1)
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0] + hex[0], 16) / 255
      const g = Number.parseInt(hex[1] + hex[1], 16) / 255
      const b = Number.parseInt(hex[2] + hex[2], 16) / 255
      return [r, g, b, opacity]
    }
    if (hex.length === 4) {
      const r = Number.parseInt(hex[0] + hex[0], 16) / 255
      const g = Number.parseInt(hex[1] + hex[1], 16) / 255
      const b = Number.parseInt(hex[2] + hex[2], 16) / 255
      const a = Number.parseInt(hex[3] + hex[3], 16) / 255
      return [r, g, b, a * opacity]
    }
    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16) / 255
      const g = Number.parseInt(hex.slice(2, 4), 16) / 255
      const b = Number.parseInt(hex.slice(4, 6), 16) / 255
      return [r, g, b, opacity]
    }
    if (hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16) / 255
      const g = Number.parseInt(hex.slice(2, 4), 16) / 255
      const b = Number.parseInt(hex.slice(4, 6), 16) / 255
      const a = Number.parseInt(hex.slice(6, 8), 16) / 255
      return [r, g, b, a * opacity]
    }
  }
  const rgbMatch = /^rgba?\(([^)]+)\)/i.exec(trimmed)
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map(s => s.trim())
    const r = Number.parseFloat(parts[0] ?? '0') / 255
    const g = Number.parseFloat(parts[1] ?? '0') / 255
    const b = Number.parseFloat(parts[2] ?? '0') / 255
    const a = parts.length > 3 ? Number.parseFloat(parts[3] ?? '1') : 1
    return [r, g, b, a * opacity]
  }
  return [0, 0, 0, opacity]
}

function distanceToSegmentSq(p: { x: number, y: number }, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t = 0
  if (dx !== 0 || dy !== 0) {
    t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)
    if (t > 1)
      t = 1
    else if (t < 0)
      t = 0
  }
  const x = a.x + t * dx - p.x
  const y = a.y + t * dy - p.y
  return x * x + y * y
}
