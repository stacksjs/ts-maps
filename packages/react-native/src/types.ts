import type { ViewStyle } from 'react-native'

/**
 * How the ts-maps runtime is delivered to the WebView.
 *
 *   - `cdn`     — the HTML document references `url` from a `<script src>` tag.
 *   - `inline`  — the caller has already bundled ts-maps and hands us the
 *                 JS source as a string (e.g. produced by Metro / bun).
 */
export type MapRuntime =
  | { source: 'cdn', url: string }
  | { source: 'inline', bundledSource: string }

export interface MapMoveEvent {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

export interface MapClickEvent {
  lngLat: [number, number]
  point: [number, number]
}

export interface MapErrorEvent {
  message: string
}

export interface MapApi {
  // eslint-disable-next-line no-unused-vars
  call: (method: string, ...args: unknown[]) => Promise<unknown>
}

/**
 * A control to place on the map.
 *
 * This binding takes no children — the map lives inside a WebView — so
 * controls are declared as data and built on the other side of the bridge.
 * The names match the components the React, Vue, Svelte and Solid bindings
 * export.
 */
/**
 * A marker to place on the map, with an optional popup bound to it.
 *
 * Declared as data for the same reason controls are: the map lives in a
 * WebView, so there are no children to attach components to. `html` and
 * `popupHtml` are inserted into that WebView as markup — treat them the way
 * you would any `dangerouslySetInnerHTML`, and do not build them from
 * untrusted input.
 */
export interface MarkerSpec {
  /** `[lat, lng]`, the order ts-maps takes. */
  coordinate: [number, number]
  /** Your own pin markup. Omit for the default pin. */
  html?: string
  iconSize?: [number, number]
  iconAnchor?: [number, number]
  iconClass?: string
  title?: string
  draggable?: boolean
  opacity?: number
  zIndexOffset?: number
  /** Popup markup. Binds to this marker and opens on tap. */
  popupHtml?: string
  popupOptions?: Record<string, unknown>
  /** Open the popup without a tap. */
  popupOpen?: boolean
  /** Returned with `onMarkerPress` so you can tell which one was tapped. */
  id?: string
}

export interface MarkerPressEvent {
  id?: string
  index: number
  coordinate: [number, number]
}

export interface ControlSpec {
  type: 'zoom' | 'navigation' | 'geocoder' | 'fullscreen' | 'locate' | 'scale' | 'attribution'
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  /** Anything else the underlying control accepts. Must be JSON-serialisable. */
  options?: Record<string, unknown>
}

/**
 * One owner's ground, as data.
 *
 * The map lives in a WebView, so a `TerritoryStore` cannot be handed across —
 * what crosses the bridge is the geometry it produced. Keep the store on the
 * React Native side, and send `store.get(owner)` for each owner whenever it
 * changes.
 */
export interface TerritorySpec {
  owner: string
  /** GeoJSON MultiPolygon coordinates: `[[[[lng, lat], …]]]`. */
  geometry: number[][][][]
  /** Border and fill colour. One is assigned if omitted. */
  color?: string
  fillOpacity?: number
  weight?: number
}

/**
 * Turn-by-turn navigation on the map, after Apple Maps — the same thing
 * `<TurnByTurn>` is in the other bindings, carried as data because a
 * component cannot cross the WebView bridge.
 *
 * Live: changing `from`, `to` or `active` updates the navigation over the
 * bridge. Options are read when it is first set.
 */
export interface TurnByTurnSpec {
  /** Where the trip starts, `[lat, lng]`. */
  from?: [number, number] | null
  /** Where it ends. With both set, the routes between them are previewed. */
  to?: [number, number] | null
  /** Guide along the chosen route. Off returns to the preview. */
  active?: boolean
  profile?: 'driving' | 'walking' | 'cycling'
  units?: 'metric' | 'imperial'
  voice?: boolean
  /** Drive the route instead of following the device. */
  simulate?: boolean | { speed?: number, interval?: number, timeScale?: number }
  alternatives?: boolean
  destinationName?: string
}

/**
 * One navigation event from the map. `type` is the event's name in the other
 * bindings' terms — `preview`, `routeselect`, `start`, `progress`,
 * `instruction`, `reroute`, `arrive`, `end`, `error` — and `data` its content
 * as plain data (times as ISO strings).
 */
export interface TurnByTurnBridgeEvent {
  type: 'preview' | 'routeselect' | 'start' | 'progress' | 'instruction' | 'reroute' | 'arrive' | 'end' | 'error'
  data: Record<string, unknown>
}

/**
 * Offline maps on the map, after Apple Maps — the same thing `<OfflineMaps>`
 * is in the other bindings, carried as data. The button, the list of
 * downloaded maps, the area picker and the offline pill all run inside the
 * WebView, and downloads are kept in its IndexedDB.
 *
 * Live: changing `open` or `onlyOffline` updates the control over the bridge.
 * The other options are read when it is first set. Anything else —
 * downloading an area from code, listing what is downloaded — goes through
 * `api.call('offline.download', { bounds, name })`, `api.call('offline.list')`
 * and the rest of `map.offline`.
 */
export interface OfflineMapsSpec {
  /** Show the panel — the list of downloaded maps. */
  open?: boolean
  /** Never go to the network for map data. */
  onlyOffline?: boolean
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  /** Other URLs to keep with every download, such as a TileJSON. */
  resources?: string[]
  /** The pill shown when the connection drops. Default true. */
  showStatus?: boolean
  title?: string
}

/**
 * One offline maps event from the map. `type` is the event's name in the
 * other bindings' terms, and `data` its content as plain data: `{ regions }`
 * for `change`, `{ region }` for `progress` and `complete`, `{ region,
 * message }` for `error`, `{ id }` for `delete`, `{ onlyOffline }` for
 * `modechange` and `{ open }` for `openchange`.
 */
export interface OfflineMapsBridgeEvent {
  type: 'change' | 'progress' | 'complete' | 'error' | 'delete' | 'modechange' | 'openchange'
  data: Record<string, unknown>
}

/**
 * Search on the map, after Apple Maps — the same thing `<Search>` is in the
 * other bindings, carried as data. The field, suggestions, pins and place
 * cards all run inside the WebView. With `turnByTurn` set too, Directions on
 * a place's card previews the route there; either way a `directions` event
 * reaches `onSearch`, for the app to act on.
 *
 * Live: changing `query` searches over the bridge. The other options are read
 * when it is first set.
 */
export interface SearchSpec {
  /** Search for this; a category's name runs the category. Empty clears. */
  query?: string
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  placeholder?: string
  /** Keep Recents. Default true. */
  recents?: boolean
  units?: 'metric' | 'imperial'
  language?: string
}

/**
 * One search event from the map. `type` is the event's name in the other
 * bindings' terms, and `data` its content as plain data: `{ query, category,
 * places }` for `results`, `{ place }` for `select` and `directions`.
 */
export interface SearchBridgeEvent {
  type: 'results' | 'select' | 'directions' | 'clear'
  data: Record<string, unknown>
}

export interface MapViewProps {
  style?: ViewStyle

  center?: [number, number]
  zoom?: number
  bearing?: number
  pitch?: number

  runtime: MapRuntime

  /** Style-spec object forwarded to `TsMap.setStyle`. */
  styleSpec?: unknown

  /**
   * Controls to place on the map, e.g.
   * `[{ type: 'navigation', position: 'topright' }]`.
   *
   * Applied when the map is built, so changes after mount need a remount —
   * consistent with `runtime`, and unlike the camera, which flows over the
   * bridge.
   */
  controls?: ControlSpec[]

  /**
   * Markers to place, e.g.
   * `[{ coordinate: [34.02, -118.47], popupHtml: '<b>Here</b>' }]`.
   *
   * Unlike `controls`, this one is live: changing the array updates the
   * markers on the map over the bridge, without reloading the WebView. That is
   * what a feed of moving or filtered points needs.
   */
  markers?: MarkerSpec[]

  /**
   * Territories to draw, e.g.
   * `[{ owner: 'me', geometry: store.get('me') }]`.
   *
   * Live, like `markers`: changing the array redraws over the bridge without
   * reloading the WebView, which is what a capture needs to look immediate.
   */
  territories?: TerritorySpec[]

  /** The viewer, whose ground is drawn with the emphasis. */
  self?: string

  /**
   * The runner's path so far, as `[lng, lat]` positions. Live.
   */
  runTrail?: number[][]

  /** Turn-by-turn navigation. Live, like `markers`. */
  turnByTurn?: TurnByTurnSpec

  /** Offline maps: download areas to use with no connection. Live, like `markers`. */
  offlineMaps?: OfflineMapsSpec

  /** Search: places, addresses and kinds of place. Live, like `markers`. */
  search?: SearchSpec

  onLoad?: () => void
  // eslint-disable-next-line no-unused-vars
  onMove?: (e: MapMoveEvent) => void
  // eslint-disable-next-line no-unused-vars
  onClick?: (e: MapClickEvent) => void
  // eslint-disable-next-line no-unused-vars
  onError?: (err: MapErrorEvent) => void

  // eslint-disable-next-line no-unused-vars
  onMarkerPress?: (e: MarkerPressEvent) => void

  /** Every navigation event, as `{ type, data }`. */
  // eslint-disable-next-line no-unused-vars
  onTurnByTurn?: (e: TurnByTurnBridgeEvent) => void

  /** Every offline maps event, as `{ type, data }`. */
  // eslint-disable-next-line no-unused-vars
  onOfflineMaps?: (e: OfflineMapsBridgeEvent) => void

  /** Every search event, as `{ type, data }`. */
  // eslint-disable-next-line no-unused-vars
  onSearch?: (e: SearchBridgeEvent) => void

  // eslint-disable-next-line no-unused-vars
  onReady?: (api: MapApi) => void
}

/**
 * Discriminated union of every message that flows over the WebView bridge.
 * Every envelope carries a `type` and an `id`; `id` is only meaningful for
 * request/response pairs (the `call`/`call:result` flow).
 */
export type BridgeEnvelope =
  | { type: 'load', id: string }
  | { type: 'move', id: string, payload: MapMoveEvent }
  | { type: 'click', id: string, payload: MapClickEvent }
  | { type: 'error', id: string, payload: MapErrorEvent }
  | { type: 'setMarkers', id: string, payload: { markers: unknown[] } }
  | { type: 'setTerritories', id: string, payload: { territories: unknown[] } }
  | { type: 'setRunTrail', id: string, payload: { runTrail: number[][] } }
  | { type: 'setTurnByTurn', id: string, payload: { turnByTurn: TurnByTurnSpec | null } }
  | { type: 'turnByTurn', id: string, payload: TurnByTurnBridgeEvent }
  | { type: 'setOfflineMaps', id: string, payload: { offlineMaps: OfflineMapsSpec | null } }
  | { type: 'offlineMaps', id: string, payload: OfflineMapsBridgeEvent }
  | { type: 'setSearch', id: string, payload: { search: SearchSpec | null } }
  | { type: 'search', id: string, payload: SearchBridgeEvent }
  | { type: 'markerPress', id: string, payload: { id?: string, index: number, coordinate: [number, number] } }
  | { type: 'call', id: string, payload: { method: string, args: unknown[] } }
  | { type: 'call:result', id: string, result: unknown }
  | { type: 'call:error', id: string, error: string }
  | { type: 'setCamera', id: string, payload: { center?: [number, number], zoom?: number, bearing?: number, pitch?: number } }
  | { type: 'setStyle', id: string, payload: { styleSpec: unknown } }
