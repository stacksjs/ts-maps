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
    locale,
    controls,
    markers,
    territories,
    self,
    runTrail,
    turnByTurn,
    offlineMaps,
    offlineStore,
    search,
    mapType,
    indoor,
    landmarks,
    trees,
    onLoad,
    onMove,
    onClick,
    onError,
    onReady,
    onMarkerPress,
    onTurnByTurn,
    onOfflineMaps,
    onSearch,
    onMapType,
    onIndoor,
  } = props

  const webviewRef = useRef<WebViewHandle | null>(null)
  const pendingRef = useRef<Map<string, Pending>>(new Map())
  const readyRef = useRef(false)

  const html = useMemo(
    () => buildHtml({ runtime, initial: { center, zoom, bearing, pitch, styleSpec, locale, controls, markers, territories, self, runTrail, turnByTurn, offlineMaps, search, mapType, indoor, landmarks, trees, nativeStore: !!offlineStore } }),
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

  useEffect(() => {
    if (!readyRef.current)
      return
    post({ type: 'setLocale', id: nextId(), payload: { locale: locale ?? null } })
  }, [locale, post])

  // Markers, unlike controls, are live: the initial set is baked into the
  // document, and every change after that goes over the bridge. Reloading the
  // WebView for a moved pin would blank the map and lose the camera.
  useEffect(() => {
    if (!readyRef.current || markers === undefined)
      return
    post({ type: 'setMarkers', id: nextId(), payload: { markers } })
  }, [markers, post])

  useEffect(() => {
    if (!readyRef.current || territories === undefined)
      return
    post({ type: 'setTerritories', id: nextId(), payload: { territories } })
  }, [territories, post])

  useEffect(() => {
    if (!readyRef.current || runTrail === undefined)
      return
    post({ type: 'setRunTrail', id: nextId(), payload: { runTrail } })
  }, [runTrail, post])

  // Compared by value: a spec written inline is a new object every render.
  // The whole spec goes across, options too — the WebView hands every one to
  // the control's `sync`, so nothing in it is read only at mount.
  const turnByTurnKey = JSON.stringify(turnByTurn ?? null)
  useEffect(() => {
    if (!readyRef.current)
      return
    post({ type: 'setTurnByTurn', id: nextId(), payload: { turnByTurn: turnByTurn ?? null } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnByTurnKey, post])

  const offlineMapsKey = JSON.stringify(offlineMaps ?? null)
  useEffect(() => {
    if (!readyRef.current)
      return
    post({ type: 'setOfflineMaps', id: nextId(), payload: { offlineMaps: offlineMaps ?? null } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineMapsKey, post])

  const searchKey = JSON.stringify(search ?? null)
  useEffect(() => {
    if (!readyRef.current)
      return
    post({ type: 'setSearch', id: nextId(), payload: { search: search ?? null } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, post])

  const mapTypeKey = JSON.stringify(mapType ?? null)
  useEffect(() => {
    if (!readyRef.current)
      return
    post({ type: 'setMapType', id: nextId(), payload: { mapType: mapType ?? null } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTypeKey, post])

  const indoorKey = JSON.stringify(indoor ?? null)
  useEffect(() => {
    if (!readyRef.current)
      return
    post({ type: 'setIndoor', id: nextId(), payload: { indoor: indoor ?? null } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indoorKey, post])

  const landmarksKey = JSON.stringify(landmarks ?? null)
  useEffect(() => {
    if (!readyRef.current)
      return
    post({ type: 'setLandmarks', id: nextId(), payload: { landmarks: landmarks ?? null } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarksKey, post])

  const treesKey = JSON.stringify(trees ?? null)
  useEffect(() => {
    if (!readyRef.current)
      return
    post({ type: 'setTrees', id: nextId(), payload: { trees: trees ?? null } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treesKey, post])

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
        case 'markerPress':
          onMarkerPress?.(env.payload)
          break
        case 'turnByTurn':
          onTurnByTurn?.(env.payload)
          break
        case 'offlineMaps':
          onOfflineMaps?.(env.payload)
          break
        case 'search':
          onSearch?.(env.payload)
          break
        case 'mapType':
          onMapType?.(env.payload)
          break
        case 'indoor':
          onIndoor?.(env.payload)
          break
        // The WebView's offline maps, read from and written to the app's storage.
        case 'store': {
          const { op, key, value } = env.payload ?? {}
          const done = Promise.resolve().then((): Promise<string | null | undefined | void> => {
            if (!offlineStore)
              throw new Error('no offlineStore was given to MapView')
            if (op === 'get')
              return offlineStore.get(key)
            if (op === 'set')
              return offlineStore.set(key, value ?? '')
            if (op === 'delete')
              return offlineStore.delete(key)
            throw new Error(`unknown store operation: ${String(op)}`)
          })
          done.then(
            result => post({ type: 'store:result', id: env.id, result: typeof result === 'string' ? result : null }),
            err => post({ type: 'store:error', id: env.id, error: String((err as Error)?.message ?? err) }),
          )
          break
        }
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
    [api, onClick, onError, onLoad, onMove, onReady, onMarkerPress, onTurnByTurn, onOfflineMaps, onSearch, onMapType, onIndoor, offlineStore, post],
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
