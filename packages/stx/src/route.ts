import type { TsMap } from 'ts-maps'

/**
 * A recorded route on a map, and a basemap that keeps drawing when its tile
 * service does not answer.
 *
 * Two things every activity page needs and every app ends up writing for
 * itself: resolve vector tiles through a TileJSON (whose URL usually carries a
 * build date, so it cannot be hard-coded) with a fallback chain and a raster
 * last resort; and draw a route the way fitness apps do — a cased line, start
 * and finish, distance markers, framed to fit, with a cursor a chart can move.
 *
 * Everything here takes the ts-maps module (or the bits of it it needs) as an
 * argument rather than importing it. `<Map>` and `<RouteLayer>` pass the one
 * they imported; an app that loads ts-maps lazily, as its own chunk, passes
 * the module it loaded and imports only this file, which then costs it
 * nothing up front.
 */

type TsMapsModule = typeof import('ts-maps')

export type RouteLatLng = [number, number]

export type PageTheme = 'light' | 'dark'

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

/** What `resolveTileJson` needs from its surroundings; injectable for tests. */
export interface TileJsonEnv {
  fetch?: typeof fetch
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
}

export interface ResolveTileJsonOptions extends TileJsonEnv {
  /** Per source, in milliseconds. A hanging source falls through to the next. */
  timeoutMs?: number
  /**
   * Session storage key the answer is kept under, so only the first page of a
   * session waits for it. `false` turns the cache off.
   */
  cacheKey?: string | false
}

export interface ResolvedTiles {
  /** The tile URL template, `{z}/{x}/{y}`. */
  tiles: string
  /** The TileJSON it came from. */
  source: string
  /** The TileJSON's own `attribution`, when it has one. */
  attribution?: string
}

const DEFAULT_CACHE_KEY = 'ts-maps:tilejson:v1'

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  }
  catch {
    // Storage access throws outright in some locked-down WebViews.
    return null
  }
}

async function readTileJson(url: string, fetcher: typeof fetch, timeoutMs: number): Promise<ResolvedTiles | null> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController()
  const timer = setTimeout(() => controller?.abort(), timeoutMs)
  try {
    // Revalidated rather than served from the HTTP cache as is: a rebuild
    // changes which archive the TileJSON names.
    const response = await fetcher(url, { signal: controller?.signal, cache: 'no-cache' })
    if (!response.ok)
      return null
    const body = await response.json() as { tiles?: unknown, attribution?: unknown }
    const tiles = Array.isArray(body?.tiles) && typeof body.tiles[0] === 'string' ? body.tiles[0] : null
    if (!tiles)
      return null
    return { tiles, source: url, ...(typeof body.attribution === 'string' ? { attribution: body.attribution } : {}) }
  }
  catch {
    return null
  }
  finally {
    clearTimeout(timer)
  }
}

/**
 * The tile URL from the first TileJSON in `sources` that answers, or null when
 * none does (offline, blocked) — the caller then draws a raster fallback
 * rather than an empty map.
 *
 * Sources are tried in order, each raced against `timeoutMs`. The answer is
 * kept in session storage under `cacheKey`, keyed by the source list, so a
 * different list never reads another's answer.
 */
export async function resolveTileJson(sources: string | readonly string[], options: ResolveTileJsonOptions = {}): Promise<ResolvedTiles | null> {
  const list = (typeof sources === 'string' ? sources.split(',') : [...sources]).map(s => s.trim()).filter(Boolean)
  const fetcher = options.fetch ?? (typeof fetch === 'function' ? fetch : null)
  if (!list.length || !fetcher)
    return null

  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const key = options.cacheKey === false ? null : `${options.cacheKey ?? DEFAULT_CACHE_KEY}:${list.join('|')}`
  if (key && storage) {
    try {
      const cached = storage.getItem(key)
      if (cached) {
        const parsed = JSON.parse(cached) as ResolvedTiles
        if (parsed && typeof parsed.tiles === 'string')
          return parsed
      }
    }
    catch {}
  }

  for (const source of list) {
    const found = await readTileJson(source, fetcher, options.timeoutMs ?? 6000)
    if (!found)
      continue
    if (key && storage) {
      try {
        storage.setItem(key, JSON.stringify(found))
      }
      catch {}
    }
    return found
  }
  return null
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * The page's light or dark: a `dark` class on `<html>` (how Tailwind-style
 * apps switch), else the system preference.
 */
export function pageTheme(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): PageTheme {
  if (!doc)
    return 'light'
  const root = doc.documentElement
  if (root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark')
    return 'dark'
  if (root.classList.contains('light') || root.getAttribute('data-theme') === 'light')
    return 'light'
  try {
    return doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  catch {
    return 'light'
  }
}

/** Call `onChange` whenever `pageTheme()` changes; returns the unsubscribe. */
export function watchPageTheme(onChange: (theme: PageTheme) => void, doc: Document | undefined = typeof document === 'undefined' ? undefined : document): () => void {
  if (!doc)
    return () => {}
  let current = pageTheme(doc)
  const check = () => {
    const next = pageTheme(doc)
    if (next === current)
      return
    current = next
    onChange(next)
  }
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(check)
  observer?.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  let media: MediaQueryList | null = null
  try {
    media = doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null
  }
  catch {}
  media?.addEventListener?.('change', check)
  return () => {
    observer?.disconnect()
    media?.removeEventListener?.('change', check)
  }
}

// ---------------------------------------------------------------------------
// Basemap
// ---------------------------------------------------------------------------

/** CARTO's keyless raster tiles: the last resort when no vector source answers. */
export const RASTER_FALLBACK: Readonly<Record<PageTheme, string>> = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
}
export const RASTER_FALLBACK_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

export interface BasemapOptions {
  theme: PageTheme
  /** Vector tiles; null or empty draws the raster fallback. */
  tiles?: string | string[] | null
  attribution?: string
  /** Raster tiles for when there are no vector tiles, per theme or one for both. */
  rasterFallback?: string | Partial<Record<PageTheme, string>>
  rasterAttribution?: string
  /** Palette overrides, per theme. */
  palette?: Partial<Record<PageTheme, Record<string, string>>>
  maxzoom?: number
}

/**
 * One of the bundled basemaps over `tiles`, or over raster tiles when there
 * are none. `styles` is ts-maps' `styles` export.
 */
export function basemapStyle(styles: TsMapsModule['styles'], options: BasemapOptions): ReturnType<TsMapsModule['styles']['light']> {
  const build = options.theme === 'dark' ? styles.dark : styles.light
  const palette = options.palette?.[options.theme]
  if (options.tiles && options.tiles.length) {
    return build({
      tiles: options.tiles,
      ...(options.attribution ? { attribution: options.attribution } : {}),
      ...(palette ? { palette } : {}),
    })
  }
  const raster = typeof options.rasterFallback === 'string'
    ? options.rasterFallback
    : options.rasterFallback?.[options.theme] ?? RASTER_FALLBACK[options.theme]
  return build({
    tiles: raster,
    mode: 'raster',
    attribution: options.rasterAttribution ?? RASTER_FALLBACK_ATTRIBUTION,
    ...(options.maxzoom !== undefined ? { maxzoom: options.maxzoom } : {}),
    ...(palette ? { palette } : {}),
  })
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export interface RouteColors {
  line: string
  casing: string
  start: string
  finish: string
  /** The ring around the start and finish dots. */
  ring: string
}

/** Blue line, green start, red finish: what a recorded route looks like everywhere. */
export const ROUTE_COLORS: Readonly<Record<PageTheme, RouteColors>> = {
  light: { line: '#2563eb', casing: '#ffffff', start: '#10b981', finish: '#e11d48', ring: '#ffffff' },
  dark: { line: '#60a5fa', casing: '#0b1220', start: '#34d399', finish: '#fb7185', ring: '#0b1220' },
}

export interface RouteMarker {
  lat: number
  lng: number
  /** Shown in the marker: a distance ("5"), a lap number. */
  label: string
}

export interface RouteOptions {
  theme?: PageTheme
  /** Colour overrides for either theme. */
  colors?: Partial<Record<PageTheme, Partial<RouteColors>>>
  weight?: number
  /** Distance markers along the way. */
  markers?: RouteMarker[]
  /** Frame the route on draw, and again when the container resizes. */
  fit?: boolean
  /** Padding around the fitted route, px. */
  padding?: [number, number]
}

export interface RouteHandle {
  /** Replace the route (and markers) with another, keeping every option. */
  setRoute: (coords: readonly RouteLatLng[], markers?: RouteMarker[]) => void
  /** Redraw in the other theme's colours. */
  setTheme: (theme: PageTheme) => void
  /** A dot at a point on the route (a chart being scrubbed), or none. */
  setCursor: (at: RouteLatLng | null) => void
  /** Frame the whole route. */
  fit: () => void
  /** Whether the camera is still where the last fit put it. */
  showingFit: () => boolean
  remove: () => void
}

function usable(coords: readonly RouteLatLng[]): RouteLatLng[] {
  return coords.filter(c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) as RouteLatLng[]
}

/** HTML for a distance marker's label; the text is escaped. */
export function routeMarkerHtml(label: string): string {
  const text = String(label).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
  return `<span class="ts-map-route-marker">${text}</span>`
}

/**
 * Draw a route on `map` and return a handle to change it.
 *
 * Drawn bottom to top: a casing (so the line has an edge over any ground), the
 * line, the distance markers, then the finish and the start, so a loop shows
 * where it began. Nothing is interactive: a route is a picture of where
 * someone went, and a click on it should reach the map.
 */
export function drawRoute(maps: Pick<TsMapsModule, 'Polyline' | 'CircleMarker' | 'marker' | 'divIcon'>, map: TsMap, coords: readonly RouteLatLng[], options: RouteOptions = {}): RouteHandle {
  const anyMap = map as any
  let theme: PageTheme = options.theme ?? 'light'
  let points = usable(coords)
  let markers = options.markers ?? []
  const weight = options.weight ?? 4.5
  const padding = options.padding ?? [28, 28]
  let layers: any[] = []
  let line: any = null
  let cursor: any = null
  let fitView: { lat: number, lng: number, zoom: number } | null = null

  const colors = (): RouteColors => ({ ...ROUTE_COLORS[theme], ...options.colors?.[theme] })

  function clear(): void {
    for (const layer of layers) {
      try {
        anyMap.removeLayer(layer)
      }
      catch {}
    }
    layers = []
    line = null
  }

  function draw(): void {
    clear()
    if (points.length < 2)
      return
    const ink = colors()
    const add = (layer: any) => {
      layer.addTo(map)
      layers.push(layer)
      return layer
    }
    add(new maps.Polyline(points, { color: ink.casing, weight: weight + 3.5, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false } as any))
    line = add(new maps.Polyline(points, { color: ink.line, weight, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false } as any))
    for (const marker of markers) {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng))
        continue
      add(maps.marker([marker.lat, marker.lng], {
        icon: maps.divIcon({ html: routeMarkerHtml(marker.label), className: 'ts-map-route-marker-icon', iconSize: [22, 22], iconAnchor: [11, 11] } as any),
        interactive: false,
        keyboard: false,
        title: marker.label,
      } as any))
    }
    add(new maps.CircleMarker(points[points.length - 1] as RouteLatLng, { radius: 7, color: ink.ring, weight: 2.5, fillColor: ink.finish, fillOpacity: 1, interactive: false } as any))
    add(new maps.CircleMarker(points[0] as RouteLatLng, { radius: 7, color: ink.ring, weight: 2.5, fillColor: ink.start, fillOpacity: 1, interactive: false } as any))
  }

  function fit(): void {
    if (!line)
      return
    const size = anyMap.getSize?.()
    // A 0×0 container fits to max zoom; wait for a size (see `showingFit`).
    if (size && (size.x < 2 || size.y < 2))
      return
    anyMap.fitBounds(line.getBounds(), { padding, animate: false })
    const centre = anyMap.getCenter()
    fitView = { lat: centre.lat, lng: centre.lng, zoom: anyMap.getZoom() }
  }

  function showingFit(): boolean {
    if (!fitView)
      return true
    const centre = anyMap.getCenter()
    return Math.abs(centre.lat - fitView.lat) < 1e-9 && Math.abs(centre.lng - fitView.lng) < 1e-9 && Math.abs(anyMap.getZoom() - fitView.zoom) < 1e-9
  }

  draw()
  if (options.fit !== false)
    fit()

  return {
    setRoute(next, nextMarkers) {
      points = usable(next)
      if (nextMarkers)
        markers = nextMarkers
      draw()
      if (options.fit !== false)
        fit()
    },
    setTheme(next) {
      if (next === theme)
        return
      theme = next
      draw()
    },
    setCursor(at) {
      if (!at) {
        if (cursor) {
          anyMap.removeLayer(cursor)
          cursor = null
        }
        return
      }
      if (!cursor) {
        cursor = new maps.CircleMarker(at, { radius: 6, color: '#ffffff', weight: 2.5, fillColor: '#0f172a', fillOpacity: 1, interactive: false } as any)
        cursor.addTo(map)
      }
      else {
        cursor.setLatLng(at)
      }
    },
    fit,
    showingFit,
    remove() {
      clear()
      if (cursor) {
        try {
          anyMap.removeLayer(cursor)
        }
        catch {}
        cursor = null
      }
    },
  }
}

/**
 * Re-measure the map when its container changes size, and re-frame the route
 * if the camera is still where the last fit left it — so a panel opening or a
 * phone rotating keeps the route in view, but someone who has zoomed into a
 * climb is not thrown back out.
 */
export function refitOnResize(map: TsMap, route: Pick<RouteHandle, 'fit' | 'showingFit'>): () => void {
  const el = (map as any).getContainer?.() as HTMLElement | undefined
  if (!el || typeof ResizeObserver === 'undefined')
    return () => {}
  let width = el.clientWidth
  let height = el.clientHeight
  const observer = new ResizeObserver(() => {
    if (el.clientWidth === width && el.clientHeight === height)
      return
    width = el.clientWidth
    height = el.clientHeight
    const refit = route.showingFit()
    const sized = map as unknown as { invalidateSize?: (options: { animate: boolean }) => void }
    sized.invalidateSize?.({ animate: false })
    if (refit)
      route.fit()
  })
  observer.observe(el)
  return () => observer.disconnect()
}
