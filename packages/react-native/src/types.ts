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

export interface MapViewProps {
  style?: ViewStyle

  center?: [number, number]
  zoom?: number
  bearing?: number
  pitch?: number

  runtime: MapRuntime

  /** Style-spec object forwarded to `TsMap.setStyle`. */
  styleSpec?: unknown

  onLoad?: () => void
  // eslint-disable-next-line no-unused-vars
  onMove?: (e: MapMoveEvent) => void
  // eslint-disable-next-line no-unused-vars
  onClick?: (e: MapClickEvent) => void
  // eslint-disable-next-line no-unused-vars
  onError?: (err: MapErrorEvent) => void

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
  | { type: 'call', id: string, payload: { method: string, args: unknown[] } }
  | { type: 'call:result', id: string, result: unknown }
  | { type: 'call:error', id: string, error: string }
  | { type: 'setCamera', id: string, payload: { center?: [number, number], zoom?: number, bearing?: number, pitch?: number } }
  | { type: 'setStyle', id: string, payload: { styleSpec: unknown } }
