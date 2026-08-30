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

  onLoad?: () => void
  // eslint-disable-next-line no-unused-vars
  onMove?: (e: MapMoveEvent) => void
  // eslint-disable-next-line no-unused-vars
  onClick?: (e: MapClickEvent) => void
  // eslint-disable-next-line no-unused-vars
  onError?: (err: MapErrorEvent) => void

  // eslint-disable-next-line no-unused-vars
  onMarkerPress?: (e: MarkerPressEvent) => void

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
  | { type: 'markerPress', id: string, payload: { id?: string, index: number, coordinate: [number, number] } }
  | { type: 'call', id: string, payload: { method: string, args: unknown[] } }
  | { type: 'call:result', id: string, result: unknown }
  | { type: 'call:error', id: string, error: string }
  | { type: 'setCamera', id: string, payload: { center?: [number, number], zoom?: number, bearing?: number, pitch?: number } }
  | { type: 'setStyle', id: string, payload: { styleSpec: unknown } }
