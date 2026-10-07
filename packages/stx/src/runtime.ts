import type { IndoorMapOptions, LandmarkOptions, MapTypeControlOptions, MapTypeOption, MapTypesOptions, TsMap } from 'ts-maps'
import type { PageTheme, ResolveTileJsonOptions, RouteLatLng, RouteMarker, RouteOptions } from './route'
import { CircleMarker, control, divIcon, IndoorMap, Landmark, marker as makeMarker, MapTypeControl, mapTypes, OfflineMapsControl, Polyline, popup as makePopup, RunTrailLayer, SearchControl, styles, TerritoryLayer, tileLayer, TomTomIncidents, TrafficLayer, trafficSources, Trees, TURN_BY_TURN_EVENTS, TurnByTurn } from 'ts-maps'
import { basemapStyle, drawRoute, pageTheme, refitOnResize, resolveTileJson, watchPageTheme } from './route'

/**
 * How the components in this package become things on a map.
 *
 * React, Vue, Svelte and Solid each give a child component its own instance
 * and its own lifecycle, so `<Marker>` can create a marker for itself. stx
 * does not work that way: a component's `<script client>` is emitted once per
 * *definition*, not per use. Ten `<Marker>` tags produce ten pieces of markup
 * and exactly one script — so a marker that builds itself in its own script
 * yields one marker no matter how many you write.
 *
 * The grain of the framework is the other way round: children render data,
 * and one script reads it. So every child here is pure server-rendered markup
 * carrying `data-` attributes, and `<Map>` walks its own subtree once on mount
 * and builds what it finds. That also removes the ordering problem entirely —
 * there is only one script, and it runs after the markup exists.
 *
 * Everything below is plain DOM in and map objects out, which is what makes it
 * testable without a framework at all.
 */

/** Attribute a child renders to declare what it is. */
export const CHILD_ATTRIBUTE = 'data-ts-map-child'

interface MapHost extends HTMLElement {
  __tsMap?: TsMap | null
}

/** Publish a map on its container so host code can reach it. */
export function publishMap(container: HTMLElement, map: TsMap): void {
  (container as MapHost).__tsMap = map
  container.setAttribute('data-ts-map', '')
}

export function unpublishMap(container: HTMLElement): void {
  (container as MapHost).__tsMap = null
  container.removeAttribute('data-ts-map')
}

/** The nearest enclosing map, from any element inside it. */
export function findMap(from: Element | null | undefined): TsMap | null {
  return ((from?.closest?.('[data-ts-map]') ?? null) as MapHost | null)?.__tsMap ?? null
}

/**
 * Read a JSON `data-` attribute.
 *
 * Returns the fallback rather than throwing on malformed JSON: one bad marker
 * should not take the whole map down with it.
 */
export function readJson<T>(el: Element, name: string, fallback: T): T {
  const raw = el.getAttribute(name)
  if (raw === null || raw === '')
    return fallback
  try {
    return JSON.parse(raw) as T
  }
  catch {
    console.warn(`[ts-maps] ignoring malformed ${name} on`, el)
    return fallback
  }
}

/**
 * Drop `undefined` values.
 *
 * stx passes every declared prop through, so an option the author never set
 * still arrives — and handing `undefined` to a control or layer overrides its
 * default with nothing.
 */
export function definedOnly(options: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined)
      out[key] = value
  }
  return out
}

/**
 * Turn the props `<Map>` forwarded into the options TsMap wants.
 *
 * Defaults live here rather than in the component because stx materialises a
 * `const` only for props the caller actually passed: a default written in the
 * template evaluates to undefined for anything omitted, and then disappears
 * from the serialised object. In TypeScript it is just a default.
 */
export interface MapProps {
  center?: [number, number]
  zoom?: number
  minZoom?: number
  maxZoom?: number
  bearing?: number
  pitch?: number
  theme?: 'light' | 'dark' | 'auto'
  /** The language the built-in controls speak, unless one has its own. Default the browser's. */
  locale?: string
  styleSpec?: unknown
  /** `'auto'` follows the page: a `dark` class on `<html>`, else the system setting. */
  basemap?: 'dark' | 'light' | 'auto'
  tiles?: string | string[]
  tilesAttribution?: string
  basemapMode?: 'vector' | 'raster'
  /**
   * TileJSON URLs to take the vector tile URL from, tried in order (a list, or
   * one comma-separated string). For a tile service whose URLs carry a build
   * date. When none answers the map draws `rasterFallback`, never nothing.
   */
  tilejson?: string | string[]
  /** Raster tiles for when no TileJSON answers; CARTO's by default. */
  rasterFallback?: string | Partial<Record<PageTheme, string>>
  /** Palette overrides for the bundled basemaps, per theme. */
  palette?: Partial<Record<PageTheme, Record<string, string>>>
  /** Share gestures with a scrolling page: two fingers or ⌘ + wheel move the map. */
  cooperativeGestures?: boolean
  zoomControl?: boolean
  attributionControl?: boolean
}

export function mapOptionsFrom(props: MapProps): Record<string, unknown> {
  const style = props.styleSpec ?? buildBasemap(props)

  return definedOnly({
    center: props.center ?? [0, 0],
    zoom: props.zoom ?? 2,
    minZoom: props.minZoom,
    maxZoom: props.maxZoom,
    bearing: props.bearing ?? 0,
    pitch: props.pitch ?? 0,
    theme: props.theme ?? (props.basemap === 'auto' ? pageTheme() : 'light'),
    locale: props.locale,
    zoomControl: props.zoomControl ?? true,
    attributionControl: props.attributionControl ?? true,
    cooperativeGestures: props.cooperativeGestures,
    style,
  })
}

function hasTileJson(props: MapProps): boolean {
  return Array.isArray(props.tilejson) ? props.tilejson.length > 0 : !!props.tilejson
}

/** One of the bundled basemaps, when `basemap` names one and `tiles` is set. */
function buildBasemap(props: MapProps): unknown {
  if (props.basemap !== 'dark' && props.basemap !== 'light' && props.basemap !== 'auto')
    return undefined
  // Drawn by `attachBasemap` once the TileJSON answers: painting a fallback
  // first would download a screenful of tiles only to replace them.
  if (hasTileJson(props))
    return undefined
  if (!props.tiles || (Array.isArray(props.tiles) && props.tiles.length === 0)) {
    console.warn('[ts-maps] <Map basemap> needs a `tiles` url or a `tilejson`; ignoring')
    return undefined
  }

  const theme = props.basemap === 'auto' ? pageTheme() : props.basemap
  return styles[theme]({
    tiles: props.tiles,
    mode: props.basemapMode ?? 'vector',
    attribution: props.tilesAttribution,
    ...(props.palette?.[theme] ? { palette: props.palette[theme] } : {}),
  })
}

/**
 * The parts of a basemap that cannot be decided when the map is built: tiles
 * from a TileJSON (with its fallback chain), and a basemap that follows the
 * page between light and dark. Returns the teardown; a no-op when the props
 * ask for neither.
 */
export function attachBasemap(map: TsMap, props: MapProps, env: Pick<ResolveTileJsonOptions, 'fetch' | 'storage'> & { doc?: Document } = {}): () => void {
  const fromTileJson = hasTileJson(props)
  const auto = props.basemap === 'auto'
  if (props.styleSpec || (!fromTileJson && !auto) || (props.basemap !== 'light' && props.basemap !== 'dark' && !auto))
    return () => {}
  if (!fromTileJson && !props.tiles)
    return () => {}

  const anyMap = map as any
  let alive = true
  let ready = !fromTileJson
  let tiles: string | string[] | null = fromTileJson ? null : (props.tiles ?? null)
  let attribution = props.tilesAttribution
  const theme = (): PageTheme => (auto ? pageTheme(env.doc) : props.basemap as PageTheme)
  const apply = () => {
    anyMap.setStyle(basemapStyle(styles, {
      theme: theme(),
      tiles,
      attribution,
      rasterFallback: props.rasterFallback,
      palette: props.palette,
    }))
  }

  if (fromTileJson) {
    void resolveTileJson(props.tilejson as string | string[], { fetch: env.fetch, storage: env.storage }).then((found) => {
      // The map may have been removed while the lookup was in flight.
      if (!alive)
        return
      tiles = found?.tiles ?? null
      attribution = props.tilesAttribution ?? found?.attribution
      ready = true
      apply()
    })
  }

  const stopWatching = auto
    ? watchPageTheme((next) => {
        if (!alive)
          return
        anyMap.setTheme?.(next)
        if (ready)
          apply()
      }, env.doc)
    : () => {}

  return () => {
    alive = false
    stopWatching()
  }
}

type Removable = { remove: () => unknown }

/** What `<MapType>` builds its types from with `mapTypes()`: plain data, unlike the types themselves. */
const MAP_TYPES_PROPS = ['tiles', 'imagery', 'imageryAttribution', 'attribution', 'maxzoom', 'theme', 'labels'] as const

/** What `<MapType>` builds its traffic layer from: a provider and its key. */
const TRAFFIC_PROPS = ['trafficProvider', 'trafficKey', 'incidents'] as const

/**
 * The traffic layer plain options describe: `trafficProvider` (`'mapbox'`
 * or `'tomtom'`) and `trafficKey` for flow, and with TomTom, `incidents` for
 * its incidents with the same key. None without a provider and a key.
 */
function trafficFrom(props: Record<string, any>): TrafficLayer | undefined {
  const { trafficProvider: provider, trafficKey: key, incidents } = props
  if (!key || (provider !== 'mapbox' && provider !== 'tomtom'))
    return undefined
  return new TrafficLayer({
    source: trafficSources[provider as 'mapbox' | 'tomtom'](key),
    ...(incidents && provider === 'tomtom' ? { incidents: new TomTomIncidents({ key }) } : {}),
  })
}

/**
 * The props `<TurnByTurn>`, `<Search>`, `<OfflineMaps>`, `<MapType>`,
 * `<IndoorMap>`, `<Landmark>` and `<Trees>` render. Live objects — a manager, a provider, a callback — cannot come from
 * markup, so they are not here, and what the page hands the control itself is
 * never reset by the markup.
 */
const MARKUP_PROPS = {
  'turn-by-turn': ['from', 'to', 'active', 'profile', 'units', 'voice', 'simulate', 'alternatives', 'destinationName', 'locale'],
  'search': ['query', 'position', 'placeholder', 'categories', 'recents', 'units', 'language', 'locale', 'showSaved'],
  'offline-maps': ['open', 'onlyOffline', 'position', 'resources', 'showStatus', 'title', 'locale'],
  'map-type': ['value', 'open', 'position', 'showTraffic', 'locale', ...MAP_TYPES_PROPS, ...TRAFFIC_PROPS],
  'indoor-map': ['venue', 'level', 'position', 'minZoom', 'language', 'locale'],
  'landmark': ['model', 'position', 'altitude', 'rotation', 'scale', 'replace', 'minZoom', 'opacity'],
  'trees': ['spacing', 'maxPerTile', 'minZoom', 'minPitch', 'colors', 'height'],
} as const

/**
 * Hand `apply` the props `el` renders, now and whenever its `data-options`
 * changes, for a control's `sync` to follow. Every key is present, undefined
 * for a prop not passed, so one that goes away goes back to its default.
 * Returns the way to stop.
 */
function followProps(el: Element, keys: readonly string[], apply: (props: Record<string, any>) => unknown): () => void {
  const read = (): Record<string, any> => {
    const raw = readJson<Record<string, unknown>>(el, 'data-options', {})
    return Object.fromEntries(keys.map(key => [key, raw[key]]))
  }
  apply(read())
  if (typeof MutationObserver === 'undefined')
    return () => {}
  const observer = new MutationObserver(() => apply(read()))
  observer.observe(el, { attributes: true, attributeFilter: ['data-options'] })
  return () => observer.disconnect()
}

/** Build the popup declared by a `<template data-ts-map-child="popup">`. */
function buildPopup(el: HTMLTemplateElement): { instance: any, open: boolean, lat?: number, lng?: number } {
  const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))

  // The markup between the tags is the content, handed over as an element so
  // it keeps whatever styling and structure the author wrote.
  const holder = document.createElement('div')
  holder.appendChild(el.content ? el.content.cloneNode(true) : document.createDocumentFragment())

  const instance = makePopup(options).setContent(holder)
  const lat = el.hasAttribute('data-lat') ? Number(el.getAttribute('data-lat')) : undefined
  const lng = el.hasAttribute('data-lng') ? Number(el.getAttribute('data-lng')) : undefined

  return { instance, open: el.hasAttribute('data-open'), lat, lng }
}

/**
 * Build every child declared in `root`, and return a teardown for all of them.
 *
 * Children are read once, at mount. A page that adds markers later should do
 * so through the map itself — see `findMap`. `<TurnByTurn>`, `<Search>`,
 * `<OfflineMaps>`, `<MapType>`, `<IndoorMap>`, `<Landmark>` and `<Trees>` go
 * on following their `data-options` after that.
 */
export function mountChildren(map: TsMap, root: HTMLElement): () => void {
  const created: Removable[] = []
  const anyMap = map as any
  // Search's Directions previews routes on the map's TurnByTurn, whichever
  // of the two is written first.
  let nav: TurnByTurn | undefined
  const searches: SearchControl[] = []
  // An indoor map's places are found by every search in the map, whichever
  // is written first: each one links itself again once all are built.
  const indoorLinks: Array<() => void> = []

  const ensureStyle = (): void => {
    // A source or layer needs a style to live in; starting an empty one means
    // <Source> and <Layer> work without <Map> being handed a styleSpec first.
    if (!anyMap.getStyle?.())
      anyMap.setStyle({ version: 8, sources: {}, layers: [] })
  }

  for (const el of Array.from(root.querySelectorAll(`[${CHILD_ATTRIBUTE}]`))) {
    const kind = el.getAttribute(CHILD_ATTRIBUTE)

    try {
      switch (kind) {
        case 'tile-layer': {
          const url = el.getAttribute('data-url') ?? ''
          const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          created.push(tileLayer(url, options).addTo(map) as Removable)
          break
        }

        case 'territory-layer': {
          const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          const layer = new TerritoryLayer(options)
          anyMap.addLayer(layer)
          created.push(layer as unknown as Removable)
          // The store and its geometry are live objects that markup cannot
          // carry, so the page is handed the layer to configure.
          root.dispatchEvent(new CustomEvent('territory:ready', { bubbles: true, detail: { layer } }))
          break
        }

        case 'run-trail-layer': {
          const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          const layer = new RunTrailLayer(options)
          anyMap.addLayer(layer)
          created.push(layer as unknown as Removable)
          root.dispatchEvent(new CustomEvent('runtrail:ready', { bubbles: true, detail: { layer } }))
          break
        }

        case 'route': {
          const coords = readJson<RouteLatLng[]>(el, 'data-coords', [])
          const { theme: wanted, markers, ...rest } = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {})) as Omit<RouteOptions, 'theme'> & { theme?: PageTheme | 'auto', markers?: RouteMarker[] }
          const auto = wanted === undefined || wanted === 'auto'
          const route = drawRoute({ Polyline, CircleMarker, marker: makeMarker, divIcon }, map, coords, {
            ...rest,
            markers: markers ?? [],
            theme: auto ? pageTheme() : wanted,
          })
          const stopTheme = auto ? watchPageTheme(next => route.setTheme(next)) : () => {}
          const stopResize = rest.fit === false ? () => {} : refitOnResize(map, route)
          // A route the page fetches after render is handed over here:
          // `e.detail.route.setRoute(coords, markers)`, and `setCursor` for a
          // chart that follows along.
          root.dispatchEvent(new CustomEvent('route:ready', { bubbles: true, detail: { route } }))
          created.push({
            remove: () => {
              stopTheme()
              stopResize()
              route.remove()
            },
          })
          break
        }

        case 'turn-by-turn': {
          // eslint-disable-next-line no-unused-vars
          const { from, to, active, ...options } = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          nav = new TurnByTurn(map, options)
          const current = nav
          // Every event, as a DOM event: stx props are data, so a callback
          // cannot be one. The names are the core ones, prefixed.
          for (const event of Object.keys(TURN_BY_TURN_EVENTS)) {
            current.on(event, (detail: unknown) => {
              root.dispatchEvent(new CustomEvent(`turnbyturn:${event}`, { bubbles: true, detail }))
            })
          }
          root.dispatchEvent(new CustomEvent('turnbyturn:ready', { bubbles: true, detail: { nav: current } }))
          const unfollow = followProps(el, MARKUP_PROPS['turn-by-turn'], props => current.sync(props))
          created.push({
            remove: () => {
              unfollow()
              current.stop()
            },
          })
          break
        }

        case 'search': {
          // eslint-disable-next-line no-unused-vars
          const { query, ...options } = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          const search = new SearchControl(options)
          search.addTo(map)
          searches.push(search)
          const unlisten = search.listen((event, detail) => {
            root.dispatchEvent(new CustomEvent(`search:${event}`, { bubbles: true, detail }))
          })
          root.dispatchEvent(new CustomEvent('search:ready', { bubbles: true, detail: { control: search } }))
          const unfollow = followProps(el, MARKUP_PROPS.search, props => search.sync(props))
          created.push({
            remove: () => {
              unfollow()
              unlisten()
              search.remove()
            },
          })
          break
        }

        case 'offline-maps': {
          // eslint-disable-next-line no-unused-vars
          const { open, onlyOffline, ...options } = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          const offline = new OfflineMapsControl(options)
          offline.addTo(map)
          // Every event, as a DOM event: stx props are data, so a callback
          // cannot be one. The names are the core ones, prefixed.
          const unlisten = offline.listen((event, detail) => {
            root.dispatchEvent(new CustomEvent(`offlinemaps:${event}`, { bubbles: true, detail }))
          })
          root.dispatchEvent(new CustomEvent('offlinemaps:ready', { bubbles: true, detail: { control: offline } }))
          const unfollow = followProps(el, MARKUP_PROPS['offline-maps'], props => offline.sync(props))
          created.push({
            remove: () => {
              unfollow()
              unlisten()
              offline.remove()
            },
          })
          break
        }

        case 'map-type': {
          // A style is not data markup can carry, so the types are built here
          // from the plain options of `mapTypes()`, and built again only when
          // those change.
          const typesFrom = (props: Record<string, any>): { key: string, types: MapTypeOption[] } => {
            const given = definedOnly(Object.fromEntries(MAP_TYPES_PROPS.map(key => [key, props[key]])))
            return { key: JSON.stringify(given), types: mapTypes(given as unknown as MapTypesOptions) }
          }
          const raw = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          let built = typesFrom(raw)
          // A traffic layer is a live object too: built here from a provider
          // and its key, and built again when those change.
          const trafficKeyOf = (props: Record<string, any>): string => JSON.stringify(TRAFFIC_PROPS.map(key => props[key] ?? null))
          let trafficKey = trafficKeyOf(raw)
          const picker = new MapTypeControl(definedOnly({ types: built.types, value: raw.value, position: raw.position, title: raw.title, traffic: trafficFrom(raw), locale: raw.locale }) as MapTypeControlOptions)
          picker.addTo(map)
          // Every event, as a DOM event: stx props are data, so a callback
          // cannot be one. The names are the core ones, prefixed.
          const unlisten = picker.listen((event, detail) => {
            root.dispatchEvent(new CustomEvent(`maptype:${event}`, { bubbles: true, detail }))
          })
          root.dispatchEvent(new CustomEvent('maptype:ready', { bubbles: true, detail: { control: picker } }))
          const unfollow = followProps(el, MARKUP_PROPS['map-type'], (props) => {
            const next = typesFrom(props)
            if (next.key !== built.key)
              built = next
            if (trafficKeyOf(props) !== trafficKey) {
              trafficKey = trafficKeyOf(props)
              const was = picker.options.traffic
              const on = !!was?.active
              was?.remove()
              const traffic = trafficFrom(props)
              picker.options.traffic = traffic
              if (on)
                traffic?.addTo(map)
            }
            picker.sync({ types: built.types, value: props.value, open: props.open, position: props.position, showTraffic: props.showTraffic, locale: props.locale })
          })
          created.push({
            remove: () => {
              unfollow()
              unlisten()
              picker.remove()
              picker.options.traffic?.remove()
            },
          })
          break
        }

        case 'indoor-map': {
          // The venue is a URL: markup carries data, not an archive's bytes or
          // a loaded venue. A new venue, `minZoom`, `language` or `locale`
          // makes the control again, and the searches are connected to the new
          // one.
          let indoor: IndoorMap | null = null
          let built: string | undefined
          let latest: Record<string, any> = {}
          let unlisten = (): void => {}
          let unlinks: Array<() => void> = []
          const link = (): void => {
            unlinks.forEach(stop => stop())
            unlinks = indoor ? searches.map(search => indoor!.connect(search)) : []
          }
          const teardown = (): void => {
            unlinks.forEach(stop => stop())
            unlinks = []
            unlisten()
            unlisten = () => {}
            indoor?.remove()
            indoor = null
          }
          const build = (props: Record<string, any>): void => {
            teardown()
            if (!props.venue) {
              console.warn('[ts-maps] <IndoorMap> needs a `venue` url; ignoring')
              return
            }
            const made = new IndoorMap(definedOnly({ venue: props.venue, level: props.level, position: props.position, minZoom: props.minZoom, language: props.language, locale: props.locale }) as unknown as IndoorMapOptions)
            indoor = made
            made.addTo(map)
            // Every event, as a DOM event: stx props are data, so a callback
            // cannot be one. The names are the core ones, prefixed.
            unlisten = made.listen((event, detail) => {
              root.dispatchEvent(new CustomEvent(`indoor:${event}`, { bubbles: true, detail }))
            })
            root.dispatchEvent(new CustomEvent('indoor:ready', { bubbles: true, detail: { control: made } }))
            link()
            // A level asked for while the venue was loading is shown once it has.
            made.ready().then(() => {
              if (indoor === made)
                made.sync({ level: latest.level })
            }, () => {})
          }
          const unfollow = followProps(el, MARKUP_PROPS['indoor-map'], (props) => {
            latest = props
            const key = JSON.stringify([props.venue, props.minZoom, props.language, props.locale])
            if (key !== built) {
              built = key
              build(props)
            }
            else {
              indoor?.sync({ level: props.level, position: props.position })
            }
          })
          indoorLinks.push(link)
          created.push({
            remove: () => {
              unfollow()
              teardown()
            },
          })
          break
        }

        case 'landmark': {
          // The model is a URL or a glTF's JSON: markup carries data, not
          // bytes. A new model, `replace` or `minZoom` makes the landmark
          // again; the rest goes to its `sync`.
          let landmark: Landmark | null = null
          let built: string | undefined
          const unfollow = followProps(el, MARKUP_PROPS.landmark, (props) => {
            const key = JSON.stringify([props.model, props.replace, props.minZoom])
            if (key === built && landmark) {
              landmark.sync({ position: props.position, rotation: props.rotation, scale: props.scale, altitude: props.altitude, opacity: props.opacity })
              return
            }
            built = key
            landmark?.remove()
            landmark = null
            if (!props.model || props.position == null) {
              console.warn('[ts-maps] <Landmark> needs a `model` and a `position`; ignoring')
              return
            }
            landmark = new Landmark(definedOnly(props) as unknown as LandmarkOptions).addTo(map)
            root.dispatchEvent(new CustomEvent('landmark:ready', { bubbles: true, detail: { landmark } }))
          })
          created.push({
            remove: () => {
              unfollow()
              landmark?.remove()
            },
          })
          break
        }

        case 'trees': {
          // `match` is a function, which markup cannot carry: it is not among
          // the props followed, so one the page hands `setOptions` stays.
          let applied = ''
          const trees = new Trees()
          const unfollow = followProps(el, MARKUP_PROPS.trees, (props) => {
            const key = JSON.stringify(props)
            if (key === applied)
              return
            applied = key
            trees.setOptions(props)
          })
          trees.addTo(map)
          root.dispatchEvent(new CustomEvent('trees:ready', { bubbles: true, detail: { trees } }))
          created.push({
            remove: () => {
              unfollow()
              trees.remove()
            },
          })
          break
        }

        case 'control': {
          const type = el.getAttribute('data-type') ?? ''
          const factory = (control as unknown as Record<string, (o?: unknown) => any>)[type]
          if (typeof factory !== 'function') {
            console.warn(`[ts-maps] unknown control type: ${type}`)
            break
          }
          const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          created.push(factory(options).addTo(map) as Removable)
          break
        }

        case 'marker': {
          const lat = Number(el.getAttribute('data-lat') ?? 0)
          const lng = Number(el.getAttribute('data-lng') ?? 0)
          const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          const icon = definedOnly(readJson<Record<string, unknown>>(el, 'data-icon', {}))

          if (icon.html !== undefined)
            options.icon = divIcon(icon)

          const instance = makeMarker([lat, lng], options).addTo(map)
          created.push(instance as Removable)

          // A popup written inside the marker binds to it and opens on click.
          const nested = el.querySelector('template[data-ts-map-child="popup"]') as HTMLTemplateElement | null
          if (nested) {
            const { instance: popupInstance, open } = buildPopup(nested)
            const bindable = instance as any
            bindable.bindPopup(popupInstance)
            if (open)
              bindable.openPopup()
          }

          // A DOM event rather than a callback prop: stx passes props as data,
          // so a function cannot cross the component boundary. It bubbles, so
          // one listener on the map container can serve every marker.
          const eventName = el.getAttribute('data-click-event') || 'marker:click'
          const emitter = instance as any
          emitter.on('click', (event: any) => {
            el.dispatchEvent(new CustomEvent(eventName, {
              bubbles: true,
              detail: { marker: instance, latlng: event?.latlng, originalEvent: event },
            }))
          })
          break
        }

        case 'popup': {
          // Only free-standing popups are built here; one inside a marker was
          // already bound above.
          if (el.closest(`[${CHILD_ATTRIBUTE}="marker"]`))
            break
          const { instance, open, lat, lng } = buildPopup(el as HTMLTemplateElement)
          if (lat !== undefined && lng !== undefined) {
            instance.setLatLng([lat, lng])
            if (open)
              instance.openOn(map)
          }
          created.push({ remove: () => anyMap.closePopup(instance) })
          break
        }

        case 'source': {
          ensureStyle()
          const id = el.getAttribute('data-id') ?? ''
          const spec = definedOnly(readJson<Record<string, unknown>>(el, 'data-spec', {}))
          anyMap.addSource(id, spec)
          created.push({ remove: () => anyMap.removeSource(id) })
          break
        }

        case 'layer': {
          ensureStyle()
          const spec = definedOnly(readJson<Record<string, unknown>>(el, 'data-spec', {}))
          const before = el.getAttribute('data-before') ?? undefined
          anyMap.addStyleLayer(spec, before)
          created.push({ remove: () => anyMap.removeStyleLayer(spec.id) })
          break
        }

        default:
          console.warn(`[ts-maps] unknown map child: ${kind}`)
      }
    }
    catch (error) {
      // One malformed child should not stop the rest of the map from building.
      console.warn(`[ts-maps] failed to build ${kind}`, error)
    }
  }

  if (nav) {
    for (const search of searches) {
      if (!search.options.turnByTurn)
        search.sync({ turnByTurn: nav })
    }
  }
  for (const link of indoorLinks)
    link()

  return () => {
    // Reverse order: layers come off before the sources they read from.
    for (const item of created.reverse()) {
      try {
        item.remove()
      }
      catch {
        // Already gone with the map.
      }
    }
    created.length = 0
  }
}

// eslint-disable-next-line no-unused-vars
export type MapEventHandler = (e: any) => void

/**
 * Subscribe to a map event for as long as the caller lives.
 *
 * The equivalent of `useMapEvent` in the other bindings, spelled for a
 * framework where a component holds a DOM element rather than a context value.
 */
export function onMapEvent(
  from: Element | null | undefined,
  event: string,
  handler: MapEventHandler,
): () => void {
  const map = findMap(from)
  if (!map)
    return () => {}

  map.on(event, handler)
  return () => map.off(event, handler)
}
