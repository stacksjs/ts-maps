import type { ReactElement } from 'react'
import type { BridgeEnvelope, MapApi, MapViewProps } from './types'
import { createElement, useCallback, useEffect, useMemo, useRef } from 'react'
import WebView from 'react-native-webview'
import { decode, encode, nextId } from './bridge'
import { buildHtml } from './html'

type Pending = {
  // eslint-disable-next-line no-unused-vars
  resolve: (value: unknown) => void
  // eslint-disable-next-line no-unused-vars
  reject: (reason: unknown) => void
}

type WebViewHandle = {
  postMessage?: (msg: string) => void
  injectJavaScript?: (js: string) => void
}

/**
 * Renders the ts-maps runtime inside a `react-native-webview` and proxies
 * camera state + events over a JSON postMessage bridge.
 *
 * ts-maps is a browser-JS library, so on iOS/Android we host it inside a
 * WebView. A native GL implementation is out of scope for this package.
 */
export function MapView(props: MapViewProps): ReactElement {
  const {
    style,
    center,
    zoom,
    bearing,
    pitch,
    runtime,
    styleSpec,
    onLoad,
    onMove,
    onClick,
    onError,
    onReady,
  } = props

  const webviewRef = useRef<WebViewHandle | null>(null)
  const pendingRef = useRef<Map<string, Pending>>(new Map())
  const readyRef = useRef(false)

  const html = useMemo(
    () => buildHtml({ runtime, initial: { center, zoom, bearing, pitch, styleSpec } }),
    // We intentionally only rebuild the HTML on runtime identity changes —
    // camera + style updates flow over the bridge after load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runtime],
  )

  const post = useCallback((env: BridgeEnvelope): void => {
    const handle = webviewRef.current
    const raw = encode(env)
    if (handle?.postMessage) {
      handle.postMessage(raw)
      return
    }
    if (handle?.injectJavaScript) {
      // Fallback for platforms where postMessage is unavailable.
      const safe = raw.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
      handle.injectJavaScript(`window.dispatchEvent(new MessageEvent('message', { data: \`${safe}\` })); true;`)
    }
  }, [])

  const call = useCallback(
    (method: string, ...args: unknown[]): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const id = nextId()
        pendingRef.current.set(id, { resolve, reject })
        post({ type: 'call', id, payload: { method, args } })
      })
    },
    [post],
  )

  const api = useMemo<MapApi>(() => ({ call }), [call])

  useEffect(() => {
    if (readyRef.current)
      onReady?.(api)
  }, [api, onReady])

  // Sync camera after load — before load the initial values are already
  // baked into the HTML document.
  useEffect(() => {
    if (!readyRef.current)
      return
    post({
      type: 'setCamera',
      id: nextId(),
      payload: { center, zoom, bearing, pitch },
    })
  }, [center, zoom, bearing, pitch, post])

  useEffect(() => {
    if (!readyRef.current || styleSpec === undefined)
      return
    post({ type: 'setStyle', id: nextId(), payload: { styleSpec } })
  }, [styleSpec, post])

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const env = decode(event.nativeEvent?.data)
      if (!env)
        return
      switch (env.type) {
        case 'load': {
          readyRef.current = true
          onLoad?.()
          onReady?.(api)
          break
        }
        case 'move':
          onMove?.(env.payload)
          break
        case 'click':
          onClick?.(env.payload)
          break
        case 'error':
          onError?.(env.payload)
          break
        case 'call:result': {
          const p = pendingRef.current.get(env.id)
          if (p) {
            pendingRef.current.delete(env.id)
            p.resolve(env.result)
          }
          break
        }
        case 'call:error': {
          const p = pendingRef.current.get(env.id)
          if (p) {
            pendingRef.current.delete(env.id)
            p.reject(new Error(env.error))
          }
          break
        }
        default:
          break
      }
    },
    [api, onClick, onError, onLoad, onMove, onReady],
  )

  // react-native-webview isn't typed well across versions, and `WebView`
  // is itself a component factory. We fall back to `createElement` + `any`
  // to keep the surface minimal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createElement(WebView as any, {
    ref: webviewRef,
    source: { html },
    originWhitelist: ['*'],
    javaScriptEnabled: true,
    domStorageEnabled: true,
    style,
    onMessage: handleMessage,
  })
}
