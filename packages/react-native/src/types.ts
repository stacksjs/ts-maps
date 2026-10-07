import type { ViewStyle } from 'react-native'
import type { KeyValueStorage, SearchCategory } from 'ts-maps'

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
 * Live: changing any of it updates the navigation over the bridge — a new
 * `profile` fetches a showing preview again. An option removed returns to its
 * default. `directions`, the routing provider the other bindings take, is an
 * object and cannot cross the bridge, so the default OSRM server is used, or
 * for transit, OpenTripPlanner at `otpUrl`.
 */
export interface TurnByTurnSpec {
  /** Where the trip starts, `[lat, lng]`. */
  from?: [number, number] | null
  /** Where it ends. With both set, the routes between them are previewed. */
  to?: [number, number] | null
  /** Guide along the chosen route. Off returns to the preview. */
  active?: boolean
  /** `'transit'` is planned by OpenTripPlanner at `otpUrl`. */
  profile?: 'driving' | 'walking' | 'cycling' | 'transit'
  /** An OpenTripPlanner GTFS GraphQL endpoint, for `profile: 'transit'`. */
  otpUrl?: string
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
 * Live: changing any of it updates the control over the bridge, and an option
 * removed returns to its default. `maps` and `geocoder`, which the other
 * bindings take, are objects and cannot cross the bridge, so the WebView's own
 * are used. Anything else — downloading an area from code, listing what is
 * downloaded — goes through `api.call('offline.download', { bounds, name })`,
 * `api.call('offline.list')` and the rest of `map.offline`.
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
 * The map type picker, after Apple Maps — the same thing `<MapType>` is in the
 * other bindings, carried as data. A style cannot cross the bridge, so the
 * WebView builds Explore, Driving and Satellite with `mapTypes()` from the
 * plain options here, and the button and card run inside it.
 *
 * Live: changing `value` shows that type, `open` shows or hides the card and
 * `showTraffic` turns traffic on or off, each only when it changes; changing
 * a `mapTypes()` option builds the types again, changing the traffic provider
 * or key builds the traffic layer again, and `position` moves the button.
 */
export interface MapTypeSpec {
  /** The type showing: `'explore'`, `'driving'` or `'satellite'`. */
  value?: string
  /** Show the card of map types. */
  open?: boolean
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  /** Vector tile URL template(s) for Explore and Driving. */
  tiles: string | string[]
  /** Imagery tile URL template(s) for Satellite. Default Esri World Imagery. */
  imagery?: string | string[]
  /** The imagery's credit. */
  imageryAttribution?: string
  attribution?: string
  maxzoom?: number
  /** The light or dark basemap for Explore and Driving. Default light. */
  theme?: 'light' | 'dark'
  /** Satellite with labels on. Default true. */
  labels?: boolean
  /** Where traffic comes from, for a Traffic switch on the card. With `trafficKey`. */
  trafficProvider?: 'mapbox' | 'tomtom'
  /** The traffic provider's key: a Mapbox access token, or a TomTom API key. */
  trafficKey?: string
  /** With TomTom, show its incidents too, with the same key. */
  incidents?: boolean
  /** Show traffic. */
  showTraffic?: boolean
}

/**
 * One map type event from the map: `{ value }` for `change`, when a type is
 * chosen, `{ open }` for `openchange`, and `{ traffic }` for
 * `trafficchange`, when the card's Traffic switch is turned.
 */
export interface MapTypeBridgeEvent {
  type: 'change' | 'openchange' | 'trafficchange'
  data: Record<string, unknown>
}

/**
 * Search on the map, after Apple Maps — the same thing `<Search>` is in the
 * other bindings, carried as data. The field, suggestions, pins and place
 * cards all run inside the WebView. With `turnByTurn` set too, Directions on
 * a place's card previews the route there; either way a `directions` event
 * reaches `onSearch`, for the app to act on.
 *
 * Live: changing `query` searches over the bridge, and changing an option
 * updates the control; an option removed returns to its default. `provider`,
 * `offline`, `location`, `origin`, `onDirections`, `details`, `shareUrl` and
 * `saved`, which the other bindings take, are objects or functions and cannot
 * cross the bridge, so the defaults are used — `onSearch`'s `directions` event
 * stands in for `onDirections`, a chosen place's hours, phone and website
 * still come from OpenStreetMap and arrive as its `details` event, and Save
 * keeps Favorites in the WebView's own `localStorage`, reporting `save` and
 * `unsave`.
 */
export interface SearchSpec {
  /** Search for this; a category's name runs the category. Empty clears. */
  query?: string
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  placeholder?: string
  /** Find Nearby buttons. Default the first eight of `SEARCH_CATEGORIES`. */
  categories?: SearchCategory[]
  /** Keep Recents. Default true. */
  recents?: boolean
  units?: 'metric' | 'imperial'
  language?: string
  /** Favorites as stars on the map. Default true. */
  showSaved?: boolean
}

/**
 * One search event from the map. `type` is the event's name in the other
 * bindings' terms, and `data` its content as plain data: `{ query, category,
 * places }` for `results`, `{ place }` for `select`, `directions`, `save` and
 * `unsave` (Save on a place's card), and `{ place, details }` for `details`,
 * once a chosen place's hours, phone and website arrive.
 */
export interface SearchBridgeEvent {
  type: 'results' | 'select' | 'details' | 'directions' | 'save' | 'unsave' | 'clear'
  data: Record<string, unknown>
}

/**
 * An indoor map, after Apple Maps — the same thing `<IndoorMap>` is in the
 * other bindings, carried as data. The WebView loads the IMDF archive at
 * `venue` and draws its floor plan one level at a time, with the level picker
 * beside the map. With `search` set too, the venue's shops and gates are found
 * there, and choosing one goes to its level.
 *
 * Live: changing `level` shows that level and `position` moves the picker;
 * changing `venue`, `minZoom` or `language` loads the venue again. A venue's
 * bytes or files, which the other bindings also take, do not cross the bridge
 * well, so it is a URL here.
 */
export interface IndoorSpec {
  /** The IMDF archive: a `.zip` URL, or a folder URL of its files. */
  venue: string
  /** The level showing, by ordinal. Default the ground floor. */
  level?: number
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  /** Zoom below which the plan and the picker are hidden. Default 16. */
  minZoom?: number
  /** The language names are read in. Default English. */
  language?: string
}

/**
 * One indoor map event from the map. `type` is the event's name in the other
 * bindings' terms, and `data` its content as plain data: `{ venue: { id,
 * name, levels } }` for `load`, `{ level, name }` for `levelchange`, and `{
 * visible }` for `visibilitychange`.
 */
export interface IndoorBridgeEvent {
  type: 'load' | 'levelchange' | 'visibilitychange'
  data: Record<string, unknown>
}

/**
 * A glTF model standing where a building is, after Apple Maps' landmarks —
 * the same thing `<Landmark>` is in the other bindings, carried as data. The
 * WebView loads the model at `model` and draws it with the buildings, hiding
 * the labels behind it.
 *
 * Live: changing `position`, `rotation`, `scale`, `altitude` or `opacity`
 * moves the landmark; changing `model`, `replace` or `minZoom` makes it
 * again. Landmarks are matched across updates by `id`, or by index without
 * one. A model's bytes, which the other bindings also take, do not cross the
 * bridge well, so it is a URL here.
 */
export interface LandmarkSpec {
  id?: string
  /** A `.glb` or `.gltf` URL. */
  model: string
  /** Where the model's origin stands: [lat, lng]. */
  position: [number, number]
  /** Metres above the ground. Default 0. */
  altitude?: number
  /** Degrees clockwise. A glTF model faces south at 0. */
  rotation?: number
  /** Default 1: glTF is in metres. */
  scale?: number
  /** Leave out the extruded building under it. Default true. */
  replace?: boolean
  /** Hidden zoomed out further than this. Default 15. */
  minZoom?: number
  opacity?: number
}

/**
 * Trees in the basemap's woods and parks, after Apple Maps — the same thing
 * `<Trees>` is in the other bindings, carried as data. `match`, a function,
 * cannot cross the bridge, so the default one is used. Live.
 */
export interface TreesSpec {
  /** Metres between trees in a wood. Default 9. */
  spacing?: number
  /** Most trees a tile plants. Default 3000. */
  maxPerTile?: number
  /** Default 15. */
  minZoom?: number
  /** Degrees of tilt before trees appear. Default 20. */
  minPitch?: number
  /** Crown colours, picked between per tree. */
  colors?: string[]
  /** Metres. Default [7, 14]. */
  height?: [number, number]
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

  /** Turn-by-turn navigation. Live, like `markers`, options included. */
  turnByTurn?: TurnByTurnSpec

  /** Offline maps: download areas to use with no connection. Live, like `markers`, options included. */
  offlineMaps?: OfflineMapsSpec

  /**
   * Where downloaded maps are kept: the app's own storage, rather than the
   * WebView's IndexedDB, which the OS may clear and the app cannot see.
   * `expoFileSystemStore(FileSystem)` and `reactNativeFsStore(RNFS)` keep
   * them in files; anything with `get`, `set` and `delete` of strings will
   * do. Read when the WebView is built: give it from the first render.
   */
  offlineStore?: KeyValueStorage

  /** Search: places, addresses and kinds of place. Live, like `markers`, options included. */
  search?: SearchSpec

  /** The map type picker: Explore, Driving and Satellite. Live, like `markers`, options included. */
  mapType?: MapTypeSpec

  /** An indoor map: a venue's floor plan, a level at a time. Live, like `markers`, options included. */
  indoor?: IndoorSpec

  /** glTF models standing where buildings are. Live, like `markers`, options included. */
  landmarks?: LandmarkSpec[]

  /** Trees in the basemap's woods and parks: `true` for the defaults. Live, options included. */
  trees?: boolean | TreesSpec

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

  /** Every map type event, as `{ type, data }`. */
  // eslint-disable-next-line no-unused-vars
  onMapType?: (e: MapTypeBridgeEvent) => void

  /** Every indoor map event, as `{ type, data }`. */
  // eslint-disable-next-line no-unused-vars
  onIndoor?: (e: IndoorBridgeEvent) => void

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
  | { type: 'setMapType', id: string, payload: { mapType: MapTypeSpec | null } }
  | { type: 'mapType', id: string, payload: MapTypeBridgeEvent }
  | { type: 'setIndoor', id: string, payload: { indoor: IndoorSpec | null } }
  | { type: 'indoor', id: string, payload: IndoorBridgeEvent }
  | { type: 'setLandmarks', id: string, payload: { landmarks: LandmarkSpec[] | null } }
  | { type: 'setTrees', id: string, payload: { trees: boolean | TreesSpec | null } }
  | { type: 'markerPress', id: string, payload: { id?: string, index: number, coordinate: [number, number] } }
  | { type: 'store', id: string, payload: { op: 'get' | 'set' | 'delete', key: string, value?: string } }
  | { type: 'store:result', id: string, result: string | null }
  | { type: 'store:error', id: string, error: string }
  | { type: 'call', id: string, payload: { method: string, args: unknown[] } }
  | { type: 'call:result', id: string, result: unknown }
  | { type: 'call:error', id: string, error: string }
  | { type: 'setCamera', id: string, payload: { center?: [number, number], zoom?: number, bearing?: number, pitch?: number } }
  | { type: 'setStyle', id: string, payload: { styleSpec: unknown } }
