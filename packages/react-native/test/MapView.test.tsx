import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { buildHtml, decode, encode, expoFileSystemStore, fileNameFor, MapView, nextId, reactNativeFsStore } from '../src'

type WebViewInstance = {
  ref: { postMessage: (msg: string) => void }
  onMessage: ((e: { nativeEvent: { data: string } }) => void) | undefined
}

function getInstances(): WebViewInstance[] {
  return (globalThis as unknown as { __tsMapsRnTestWebViews: WebViewInstance[] })
    .__tsMapsRnTestWebViews
}

function lastInstance(): WebViewInstance {
  const all = getInstances()
  return all[all.length - 1]
}

// Runs the document's inline script as the WebView would. Its message
// listeners are taken away after the test, so one test's map does not answer
// the next one's envelopes.
const stopScripts: Array<() => void> = []
afterEach(() => {
  stopScripts.splice(0).forEach(stop => stop())
})
function runScript(script: string): void {
  const added: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = []
  const targets: EventTarget[] = [window, document]
  const originals = targets.map(t => t.addEventListener)
  targets.forEach((t, i) => {
    t.addEventListener = function (this: EventTarget, type: string, fn: any, opts?: any) {
      if (type === 'message')
        added.push([t, type, fn])
      return originals[i]!.call(this, type, fn, opts)
    } as EventTarget['addEventListener']
  })
  try {
    // eslint-disable-next-line no-new-func
    new Function(script)()
  }
  finally {
    targets.forEach((t, i) => { t.addEventListener = originals[i]! })
    stopScripts.push(() => added.forEach(([t, type, fn]) => t.removeEventListener(type, fn)))
  }
}

describe('bridge envelope', () => {
  test('encode/decode round-trips a known envelope', () => {
    const env = { type: 'load', id: 'x' } as const
    const raw = encode(env)
    expect(decode(raw)).toEqual(env)
  })

  test('decode rejects garbage', () => {
    expect(decode('')).toBeNull()
    expect(decode('not json')).toBeNull()
    expect(decode('{}')).toBeNull()
    expect(decode('{"type":"x"}')).toBeNull()
  })

  test('nextId returns unique strings', () => {
    const a = nextId()
    const b = nextId()
    expect(a).not.toBe(b)
  })
})

describe('buildHtml', () => {
  test('embeds the CDN url when runtime is cdn', () => {
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: {},
    })
    expect(html).toContain('<script src="https://unpkg.com/ts-maps">')
    expect(html).toContain('<div id="map">')
  })

  test('serialises declared controls into the document', () => {
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: {
        controls: [
          { type: 'navigation', position: 'topright' },
          { type: 'geocoder', options: { placeholder: 'Find a place' } },
        ],
      },
    })

    // This binding takes no children, so controls travel as data and are built
    // on the other side of the bridge.
    expect(html).toContain('"type":"navigation"')
    expect(html).toContain('"position":"topright"')
    expect(html).toContain('"placeholder":"Find a place"')
    expect(html).toContain('controlNs[spec.type]')
  })

  test('omits the control step when none are declared', () => {
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: {},
    })
    // The loop is always present; it simply has nothing to iterate.
    expect(html).not.toContain('"type":"navigation"')
  })

  test('bakes the initial markers into the document', () => {
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: {
        markers: [
          { coordinate: [34.02, -118.47], id: 'a', popupHtml: '<b>Here</b>', popupOpen: true },
          { coordinate: [34.03, -118.46], html: '<span>🔥</span>', iconSize: [40, 40] },
        ],
      },
    })

    expect(html).toContain('"coordinate":[34.02,-118.47]')
    expect(html).toContain('"popupHtml"')
    expect(html).toContain('applyMarkers(initial.markers)')
    // A tap reports back over the bridge, with enough to identify which pin.
    expect(html).toContain('"markerPress"')
  })

  test('the runtime accepts marker updates over the bridge', () => {
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: {},
    })
    // Markers are live; a moved pin must not cost a WebView reload.
    expect(html).toContain('env.type === "setMarkers"')
  })

  test('inlines bundledSource when runtime is inline', () => {
    const html = buildHtml({
      runtime: { source: 'inline', bundledSource: '/* pretend bundle */ var x=1;' },
      initial: { zoom: 3 },
    })
    expect(html).toContain('/* pretend bundle */ var x=1;')
    expect(html).toContain('"zoom":3')
  })
})

describe('<MapView>', () => {
  test('passes the runtime URL through to the mocked WebView source', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        createElement(MapView, {
          runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
        }),
      )
    })

    const wv = host.querySelector('[data-testid="webview"]') as HTMLElement
    expect(wv).not.toBeNull()
    const src = JSON.parse(wv.getAttribute('data-source') || '{}')
    expect(src.html).toContain('https://unpkg.com/ts-maps')

    await act(async () => { root.unmount() })
    host.remove()
  })

  test('fires onLoad when the bridge sends a load envelope', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    let loaded = 0
    await act(async () => {
      root.render(
        createElement(MapView, {
          runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
          onLoad: () => { loaded += 1 },
        }),
      )
    })

    const inst = lastInstance()
    await act(async () => {
      inst.onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'load', id: 'l1' }) } })
    })

    expect(loaded).toBe(1)

    await act(async () => { root.unmount() })
    host.remove()
  })

  test('onMove receives the forwarded payload', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const moves: Array<{ center: [number, number], zoom: number, bearing: number, pitch: number }> = []
    await act(async () => {
      root.render(
        createElement(MapView, {
          runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
          onMove: (e) => { moves.push(e) },
        }),
      )
    })

    const inst = lastInstance()
    const payload = { center: [1, 2] as [number, number], zoom: 5, bearing: 30, pitch: 15 }
    await act(async () => {
      inst.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: 'move', id: 'mv1', payload }) },
      })
    })

    expect(moves.length).toBe(1)
    expect(moves[0]).toEqual(payload)

    await act(async () => { root.unmount() })
    host.remove()
  })

  test('call() round-trips through the WebView bridge', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    let api: { call: (m: string, ...args: unknown[]) => Promise<unknown> } | null = null
    await act(async () => {
      root.render(
        createElement(MapView, {
          runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
          onReady: (a) => { api = a },
        }),
      )
    })

    const inst = lastInstance()
    // First we must mark the bridge as loaded so onReady fires.
    await act(async () => {
      inst.onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'load', id: 'l1' }) } })
    })

    expect(api).not.toBeNull()

    // Capture the id the component sends to the WebView so we can reply.
    let sentId = ''
    inst.ref.postMessage = (raw: string) => {
      const env = JSON.parse(raw)
      if (env.type === 'call')
        sentId = env.id
    }

    // Kick off the call (don't await — we need to flush the round-trip first).
    const pending = api!.call('getZoom')

    // Wait a microtask so postMessage has been invoked.
    await act(async () => { await Promise.resolve() })
    expect(sentId).not.toBe('')

    // Mock the WebView-side reply.
    await act(async () => {
      inst.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: 'call:result', id: sentId, result: 12 }) },
      })
    })

    const result = await pending
    expect(result).toBe(12)

    await act(async () => { root.unmount() })
    host.remove()
  })
})

describe('turn-by-turn over the bridge', () => {
  test('the document carries the initial trip and accepts updates', () => {
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { turnByTurn: { from: [37.7955, -122.3937], to: [37.8029, -122.4484], destinationName: 'Palace of Fine Arts' } },
    })
    expect(html).toContain('"destinationName":"Palace of Fine Arts"')
    expect(html).toContain('applyTurnByTurn(initial.turnByTurn)')
    expect(html).toContain('env.type === "setTurnByTurn"')
  })

  test('a changed trip is sent over the bridge, and an unchanged one is not', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const runtime = { source: 'cdn' as const, url: 'https://unpkg.com/ts-maps' }
    const trip = { from: [37.7955, -122.3937] as [number, number], to: [37.8029, -122.4484] as [number, number] }

    await act(async () => {
      root.render(createElement(MapView, { runtime, turnByTurn: trip }))
    })
    const sent: any[] = []
    // The mock hands out a fresh ref handle on each render, so listen on
    // every handle, including the ones renders below will create.
    const instances = getInstances()
    const listen = (i: WebViewInstance): void => {
      i.ref.postMessage = (raw: string) => { sent.push(JSON.parse(raw)) }
    }
    instances.forEach(listen)
    const push = instances.push.bind(instances)
    instances.push = (...items: WebViewInstance[]) => {
      items.forEach(listen)
      return push(...items)
    }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'load', id: 'l1' }) } })
    })

    // Same trip, new object: nothing to send.
    await act(async () => {
      root.render(createElement(MapView, { runtime, turnByTurn: { ...trip } }))
    })
    expect(sent.filter(e => e.type === 'setTurnByTurn').length).toBe(0)

    await act(async () => {
      root.render(createElement(MapView, { runtime, turnByTurn: { ...trip, active: true } }))
    })
    const updates = sent.filter(e => e.type === 'setTurnByTurn')
    expect(updates.length).toBe(1)
    expect(updates[0].payload.turnByTurn.active).toBe(true)

    instances.push = push
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('navigation events reach onTurnByTurn', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const events: any[] = []
    await act(async () => {
      root.render(createElement(MapView, {
        runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
        onTurnByTurn: (e) => { events.push(e) },
      }))
    })
    const inst = lastInstance()
    const payload = { type: 'arrive', data: { distanceRemaining: 3 } }
    await act(async () => {
      inst.onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'turnByTurn', id: 't1', payload }) } })
    })
    expect(events).toEqual([payload])

    await act(async () => { root.unmount() })
    host.remove()
  })
})

describe('offline maps over the bridge', () => {
  test('the document carries the spec and accepts updates', () => {
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { offlineMaps: { position: 'topleft', resources: ['https://tiles.example/planet'] } },
    })
    expect(html).toContain('"resources":["https://tiles.example/planet"]')
    expect(html).toContain('applyOfflineMaps(initial.offlineMaps)')
    expect(html).toContain('env.type === "setOfflineMaps"')
  })

  test('a changed spec is sent over the bridge, and an unchanged one is not', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const runtime = { source: 'cdn' as const, url: 'https://unpkg.com/ts-maps' }
    const spec = { position: 'topright' as const }

    await act(async () => {
      root.render(createElement(MapView, { runtime, offlineMaps: spec }))
    })
    const sent: any[] = []
    const instances = getInstances()
    const listen = (i: WebViewInstance): void => {
      i.ref.postMessage = (raw: string) => { sent.push(JSON.parse(raw)) }
    }
    instances.forEach(listen)
    const push = instances.push.bind(instances)
    instances.push = (...items: WebViewInstance[]) => {
      items.forEach(listen)
      return push(...items)
    }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'load', id: 'l1' }) } })
    })

    await act(async () => {
      root.render(createElement(MapView, { runtime, offlineMaps: { ...spec } }))
    })
    expect(sent.filter(e => e.type === 'setOfflineMaps').length).toBe(0)

    await act(async () => {
      root.render(createElement(MapView, { runtime, offlineMaps: { ...spec, open: true, onlyOffline: true } }))
    })
    const updates = sent.filter(e => e.type === 'setOfflineMaps')
    expect(updates.length).toBe(1)
    expect(updates[0].payload.offlineMaps).toEqual({ position: 'topright', open: true, onlyOffline: true })

    instances.push = push
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('offline maps events reach onOfflineMaps', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const events: any[] = []
    await act(async () => {
      root.render(createElement(MapView, {
        runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
        onOfflineMaps: (e) => { events.push(e) },
      }))
    })
    const payload = { type: 'complete', data: { region: { id: 'r', name: 'Home' } } }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'offlineMaps', id: 'o1', payload }) } })
    })
    expect(events).toEqual([payload])

    await act(async () => { root.unmount() })
    host.remove()
  })

  test('the WebView script builds the control, follows updates, and reaches map.offline', async () => {
    const tsMaps = await import('ts-maps')
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [37.78, -122.42], zoom: 14, offlineMaps: { open: true } },
    })
    // The inline script is the last one in the document.
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const posted: any[] = []
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: (raw: string) => posted.push(JSON.parse(raw)) }
    runScript(script)

    expect(page.querySelector('.tsmap-offline-button')).not.toBeNull()
    expect(page.querySelector('.tsmap-offline-card')).not.toBeNull()
    expect(posted.some(e => e.type === 'offlineMaps' && e.payload.type === 'openchange' && e.payload.data.open === true)).toBe(true)

    // Updates arrive as messages from the native side.
    const deliver = (env: unknown): void => {
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(env) }))
    }
    deliver({ type: 'setOfflineMaps', id: 's1', payload: { offlineMaps: { open: false, onlyOffline: true } } })
    expect(page.querySelector('.tsmap-offline-card')).toBeNull()
    expect(tsMaps.offlineMaps().onlyOffline).toBe(true)
    expect(posted.some(e => e.type === 'offlineMaps' && e.payload.type === 'modechange' && e.payload.data.onlyOffline === true)).toBe(true)

    // A dotted method reaches the manager.
    deliver({ type: 'call', id: 'c1', payload: { method: 'offline.usage', args: [] } })
    await new Promise(r => setTimeout(r, 20))
    const result = posted.find(e => e.type === 'call:result' && e.id === 'c1')
    expect(result?.result).toEqual({ bytes: 0, entries: 0 })

    deliver({ type: 'setOfflineMaps', id: 's2', payload: { offlineMaps: null } })
    expect(page.querySelector('.tsmap-offline-button')).toBeNull()
    tsMaps.offlineMaps().onlyOffline = false
    delete w.tsMaps
    delete w.ReactNativeWebView
    page.remove()
  })
})

describe('map type over the bridge', () => {
  const plain = { tiles: 'https://tiles.test/{z}/{x}/{y}.pbf', imagery: 'https://imagery.test/{z}/{y}/{x}.jpg' }

  test('a changed spec is sent over the bridge, and events reach onMapType', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const runtime = { source: 'cdn' as const, url: 'https://unpkg.com/ts-maps' }
    const events: any[] = []
    const render = (mapType: Record<string, unknown>): Promise<void> => act(async () => {
      root.render(createElement(MapView, { runtime, mapType: mapType as any, onMapType: (e) => { events.push(e) } }))
    })

    await render({ ...plain, value: 'explore' })
    const sent: any[] = []
    const instances = getInstances()
    const listen = (i: WebViewInstance): void => {
      i.ref.postMessage = (raw: string) => { sent.push(JSON.parse(raw)) }
    }
    instances.forEach(listen)
    const push = instances.push.bind(instances)
    instances.push = (...items: WebViewInstance[]) => {
      items.forEach(listen)
      return push(...items)
    }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'load', id: 'l1' }) } })
    })

    await render({ ...plain, value: 'explore' })
    expect(sent.filter(e => e.type === 'setMapType').length).toBe(0)
    await render({ ...plain, value: 'driving', open: true })
    const updates = sent.filter(e => e.type === 'setMapType')
    expect(updates.length).toBe(1)
    expect(updates[0].payload.mapType).toEqual({ ...plain, value: 'driving', open: true })

    const payload = { type: 'change', data: { value: 'satellite' } }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'mapType', id: 'mt1', payload }) } })
    })
    expect(events).toEqual([payload])

    instances.push = push
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('the WebView script builds the types and the control, follows value and open, and reports a choice', async () => {
    const tsMaps = await import('ts-maps')
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [37.78, -122.42], zoom: 13, mapType: { ...plain, value: 'explore' } },
    })
    expect(html).toContain('applyMapType(initial.mapType)')
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const posted: any[] = []
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: (raw: string) => posted.push(JSON.parse(raw)) }
    const deliver = (env: unknown): void => {
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(env) }))
    }
    const changes = (): unknown[] => posted.filter(e => e.type === 'mapType' && e.payload.type === 'change').map(e => e.payload.data.value)
    try {
      runScript(script)
      expect(page.querySelector('.tsmap-maptype-button')).not.toBeNull()

      deliver({ type: 'setMapType', id: 's1', payload: { mapType: { ...plain, value: 'driving', open: true } } })
      expect(page.querySelector('.tsmap-maptype-card')).not.toBeNull()
      expect(changes()).toEqual(['driving'])
      ;(page.querySelector('[data-type="satellite"]') as HTMLElement).click()
      expect(changes()).toEqual(['driving', 'satellite'])

      deliver({ type: 'setMapType', id: 's2', payload: { mapType: { ...plain, value: 'driving', open: false, position: 'bottomleft' } } })
      expect(page.querySelector('.tsmap-maptype-card')).toBeNull()
      expect(page.querySelector('.tsmap-bottom.tsmap-left .tsmap-maptype-button')).not.toBeNull()
      expect(posted.some(e => e.type === 'mapType' && e.payload.type === 'openchange' && e.payload.data.open === false)).toBe(true)

      deliver({ type: 'setMapType', id: 's3', payload: { mapType: null } })
      expect(page.querySelector('.tsmap-maptype-button')).toBeNull()
    }
    finally {
      delete w.tsMaps
      delete w.ReactNativeWebView
      page.remove()
    }
  })

  test('the WebView script builds traffic from a provider and key, follows showTraffic, and reports the switch', async () => {
    const tsMaps = await import('ts-maps')
    const spec = { ...plain, value: 'explore', trafficProvider: 'mapbox' as const, trafficKey: 'pk.test' }
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [37.78, -122.42], zoom: 13, mapType: spec },
    })
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const posted: any[] = []
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: (raw: string) => posted.push(JSON.parse(raw)) }
    const deliver = (env: unknown): void => {
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(env) }))
    }
    // Whether the style has the traffic layer, asked over the bridge.
    let calls = 0
    const hasTraffic = async (): Promise<boolean> => {
      const id = `c${++calls}`
      deliver({ type: 'call', id, payload: { method: 'getStyle' } })
      await new Promise(r => setTimeout(r, 0))
      const reply = posted.find(e => e.type === 'call:result' && e.id === id)
      return reply.result.layers.some((l: any) => l.id === 'ts-maps-traffic')
    }
    try {
      runScript(script)
      deliver({ type: 'setMapType', id: 't1', payload: { mapType: { ...spec, open: true } } })
      expect(page.querySelector('[data-setting="traffic"]')).not.toBeNull()
      expect(await hasTraffic()).toBe(false)

      deliver({ type: 'setMapType', id: 't2', payload: { mapType: { ...spec, open: true, showTraffic: true } } })
      expect(await hasTraffic()).toBe(true)

      deliver({ type: 'setMapType', id: 't3', payload: { mapType: { ...spec, open: true, showTraffic: false } } })
      expect(await hasTraffic()).toBe(false)

      const toggle = page.querySelector<HTMLInputElement>('[data-setting="traffic"]')!
      toggle.checked = true
      toggle.dispatchEvent(new Event('change'))
      expect(await hasTraffic()).toBe(true)
      expect(posted.filter(e => e.type === 'mapType' && e.payload.type === 'trafficchange').map(e => e.payload.data)).toEqual([{ traffic: true }])

      deliver({ type: 'setMapType', id: 't4', payload: { mapType: null } })
      expect(page.querySelector('.tsmap-maptype-button')).toBeNull()
      expect(await hasTraffic()).toBe(false)
    }
    finally {
      delete w.tsMaps
      delete w.ReactNativeWebView
      page.remove()
    }
  })
})

describe('indoor maps over the bridge', () => {
  // A two-level terminal in IMDF, served as a folder of its files: a venue,
  // its levels, and a gate on the upper one.
  const X = -122.3866
  const Y = 37.6155
  const square = (x: number, y: number, size = 0.002): number[][][] => [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]]
  const feature = (id: string, type: string, geometry: any, properties: Record<string, any>) => ({ type: 'Feature', id, feature_type: type, geometry, properties })
  const files: Record<string, unknown> = {
    venue: { features: [feature('v', 'venue', { type: 'Polygon', coordinates: square(X, Y) }, { name: { en: 'SFO Terminal 2' }, category: 'airport' })] },
    level: { features: [
      feature('l0', 'level', { type: 'Polygon', coordinates: square(X, Y) }, { ordinal: 0, name: { en: 'Arrivals' }, short_name: { en: '1' } }),
      feature('l1', 'level', { type: 'Polygon', coordinates: square(X, Y) }, { ordinal: 1, name: { en: 'Departures' }, short_name: { en: '2' } }),
    ] },
    unit: { features: [feature('u-gate', 'unit', { type: 'Polygon', coordinates: square(X + 0.001, Y + 0.001, 0.0004) }, { level_id: 'l1', category: 'room' })] },
    anchor: { features: [feature('an-gate', 'anchor', { type: 'Point', coordinates: [X + 0.0012, Y + 0.0012] }, { unit_id: 'u-gate' })] },
    occupant: { features: [feature('oc-gate', 'occupant', null, { anchor_id: 'an-gate', category: 'gate', name: { en: 'Gate D12' } })] },
  }
  const venue = 'https://venues.test/sfo/'

  test('a changed spec is sent over the bridge, and events reach onIndoor', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const runtime = { source: 'cdn' as const, url: 'https://unpkg.com/ts-maps' }
    const events: any[] = []
    const render = (indoor: Record<string, unknown>): Promise<void> => act(async () => {
      root.render(createElement(MapView, { runtime, indoor: indoor as any, onIndoor: (e) => { events.push(e) } }))
    })

    await render({ venue, level: 0 })
    const sent: any[] = []
    const instances = getInstances()
    const listen = (i: WebViewInstance): void => {
      i.ref.postMessage = (raw: string) => { sent.push(JSON.parse(raw)) }
    }
    instances.forEach(listen)
    const push = instances.push.bind(instances)
    instances.push = (...items: WebViewInstance[]) => {
      items.forEach(listen)
      return push(...items)
    }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'load', id: 'l1' }) } })
    })

    await render({ venue, level: 0 })
    expect(sent.filter(e => e.type === 'setIndoor').length).toBe(0)
    await render({ venue, level: 1 })
    const updates = sent.filter(e => e.type === 'setIndoor')
    expect(updates.length).toBe(1)
    expect(updates[0].payload.indoor).toEqual({ venue, level: 1 })

    const payload = { type: 'levelchange', data: { level: 1, name: 'Departures' } }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'indoor', id: 'in1', payload }) } })
    })
    expect(events).toEqual([payload])

    instances.push = push
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('the WebView script loads the venue, follows level, reports plain events, and links to search', async () => {
    const tsMaps = await import('ts-maps')
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [Y + 0.001, X + 0.001], zoom: 17, search: { recents: false }, indoor: { venue, level: 0 } },
    })
    expect(html).toContain('applyIndoor(initial.indoor)')
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const posted: any[] = []
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: (raw: string) => posted.push(JSON.parse(raw)) }
    const deliver = (env: unknown): void => {
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(env) }))
    }
    const indoorEvents = (type: string): unknown[] => posted.filter(e => e.type === 'indoor' && e.payload.type === type).map(e => e.payload.data)
    // The venue's files; anything else, Photon included, is not found.
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      const name = /^https:\/\/venues\.test\/sfo\/(\w+)\.geojson$/.exec(String(url))?.[1]
      return name && files[name] ? new Response(JSON.stringify(files[name])) : new Response('', { status: 404 })
    }) as any
    try {
      runScript(script)
      await new Promise(r => setTimeout(r, 30))
      // The venue, reduced to plain data.
      const [load] = indoorEvents('load') as any[]
      expect(load.venue.name).toBe('SFO Terminal 2')
      expect(load.venue.levels.map((l: any) => l.ordinal)).toEqual([0, 1])
      expect(Object.keys(load.venue).sort()).toEqual(['id', 'levels', 'name'])
      expect([...page.querySelectorAll('.tsmap-indoor-level')].map(b => b.textContent)).toEqual(['2', '1'])

      deliver({ type: 'setIndoor', id: 'i1', payload: { indoor: { venue, level: 1 } } })
      expect(indoorEvents('levelchange')).toEqual([{ level: 1, name: 'Departures' }])
      ;(page.querySelector('[data-level="0"]') as HTMLElement).click()
      expect(indoorEvents('levelchange')).toEqual([{ level: 1, name: 'Departures' }, { level: 0, name: 'Arrivals' }])

      // The gate is found by the WebView's search, and choosing it goes to its level.
      deliver({ type: 'setSearch', id: 's1', payload: { search: { recents: false, query: 'Gate D12' } } })
      await new Promise(r => setTimeout(r, 30))
      const results = posted.find(e => e.type === 'search' && e.payload.type === 'results')
      expect(results?.payload.data.places[0].name).toBe('Gate D12')
      page.querySelector<HTMLElement>('.tsmap-search-row')!.click()
      expect(indoorEvents('levelchange').at(-1)).toEqual({ level: 1, name: 'Departures' })

      deliver({ type: 'setIndoor', id: 'i2', payload: { indoor: null } })
      expect(page.querySelector('.tsmap-indoor-control')).toBeNull()
    }
    finally {
      globalThis.fetch = original
      delete w.tsMaps
      delete w.ReactNativeWebView
      page.remove()
    }
  })
})

describe('landmarks and trees over the bridge', () => {
  // A 10 m wedge as glTF, its buffer inline, served at a URL.
  const positions = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 10, 0])
  const gltf = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    buffers: [{ byteLength: positions.byteLength, uri: `data:application/octet-stream;base64,${Buffer.from(positions.buffer).toString('base64')}` }],
  }
  const model = 'https://models.test/wedge.gltf'
  const AT: [number, number] = [37.7952, -122.4028]

  test('changed specs are sent over the bridge', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const runtime = { source: 'cdn' as const, url: 'https://unpkg.com/ts-maps' }
    const render = (props: Record<string, unknown>): Promise<void> => act(async () => {
      root.render(createElement(MapView, { runtime, ...props }))
    })

    await render({ landmarks: [{ model, position: AT }], trees: true })
    const sent: any[] = []
    const instances = getInstances()
    const listen = (i: WebViewInstance): void => {
      i.ref.postMessage = (raw: string) => { sent.push(JSON.parse(raw)) }
    }
    instances.forEach(listen)
    const push = instances.push.bind(instances)
    instances.push = (...items: WebViewInstance[]) => {
      items.forEach(listen)
      return push(...items)
    }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'load', id: 'l1' }) } })
    })

    await render({ landmarks: [{ model, position: AT }], trees: true })
    expect(sent.filter(e => e.type === 'setLandmarks' || e.type === 'setTrees').length).toBe(0)
    await render({ landmarks: [{ model, position: AT, rotation: 45 }], trees: { spacing: 12 } })
    const landmarks = sent.filter(e => e.type === 'setLandmarks')
    expect(landmarks.length).toBe(1)
    expect(landmarks[0].payload.landmarks).toEqual([{ model, position: AT, rotation: 45 }])
    const trees = sent.filter(e => e.type === 'setTrees')
    expect(trees.length).toBe(1)
    expect(trees[0].payload.trees).toEqual({ spacing: 12 })

    instances.push = push
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('the WebView script loads the landmark, follows its props, and plants trees', async () => {
    const tsMaps = await import('ts-maps')
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: AT, zoom: 17, landmarks: [{ id: 'tower', model, position: AT }], trees: { spacing: 12 } },
    })
    expect(html).toContain('applyLandmarks(initial.landmarks)')
    expect(html).toContain('applyTrees(initial.trees)')
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const posted: any[] = []
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: (raw: string) => posted.push(JSON.parse(raw)) }
    const deliver = (env: unknown): void => {
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(env) }))
    }
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string) => String(url) === model ? new Response(JSON.stringify(gltf)) : new Response('', { status: 404 })) as any
    try {
      runScript(script)
      const map = w.__tsMapsBridge__.map
      const scene = map._scene3d
      expect(scene.landmarks.size).toBe(1)
      const [first] = [...scene.landmarks] as any[]
      await first.ready()
      expect(first.model.count).toBe(3)
      expect(first.options.replace).toBe(true)
      expect(scene.trees.options.spacing).toBe(12)

      deliver({ type: 'setLandmarks', id: 'm1', payload: { landmarks: [{ id: 'tower', model, position: AT, rotation: 45 }] } })
      expect([...scene.landmarks]).toEqual([first])
      expect(first.options.rotation).toBe(45)

      // A new `replace` makes the landmark again.
      deliver({ type: 'setLandmarks', id: 'm2', payload: { landmarks: [{ id: 'tower', model, position: AT, rotation: 45, replace: false }] } })
      const [second] = [...scene.landmarks] as any[]
      expect(scene.landmarks.size).toBe(1)
      expect(second).not.toBe(first)
      expect(second.options).toMatchObject({ replace: false, rotation: 45 })

      const trees = scene.trees
      deliver({ type: 'setTrees', id: 't1', payload: { trees: true } })
      expect(scene.trees).toBe(trees)
      expect(trees.options.spacing).toBeUndefined()

      deliver({ type: 'setLandmarks', id: 'm3', payload: { landmarks: null } })
      deliver({ type: 'setTrees', id: 't2', payload: { trees: null } })
      expect(scene.landmarks.size).toBe(0)
      expect(scene.trees).toBeUndefined()
      expect(posted.filter(e => e.type === 'error')).toEqual([])
    }
    finally {
      globalThis.fetch = original
      delete w.tsMaps
      delete w.ReactNativeWebView
      page.remove()
    }
  })
})

describe('search over the bridge', () => {
  test('the document carries the spec and accepts updates', () => {
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { search: { query: 'coffee', placeholder: 'Find a place' } },
    })
    expect(html).toContain('"placeholder":"Find a place"')
    expect(html).toContain('applySearch(initial.search)')
    expect(html).toContain('env.type === "setSearch"')
  })

  test('a changed query is sent over the bridge, and an unchanged one is not', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const runtime = { source: 'cdn' as const, url: 'https://unpkg.com/ts-maps' }

    await act(async () => {
      root.render(createElement(MapView, { runtime, search: { query: 'coffee' } }))
    })
    const sent: any[] = []
    const instances = getInstances()
    const listen = (i: WebViewInstance): void => {
      i.ref.postMessage = (raw: string) => { sent.push(JSON.parse(raw)) }
    }
    instances.forEach(listen)
    const push = instances.push.bind(instances)
    instances.push = (...items: WebViewInstance[]) => {
      items.forEach(listen)
      return push(...items)
    }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'load', id: 'l1' }) } })
    })
    await act(async () => {
      root.render(createElement(MapView, { runtime, search: { query: 'coffee' } }))
    })
    expect(sent.filter(e => e.type === 'setSearch').length).toBe(0)
    await act(async () => {
      root.render(createElement(MapView, { runtime, search: { query: 'tacos' } }))
    })
    const updates = sent.filter(e => e.type === 'setSearch')
    expect(updates.length).toBe(1)
    expect(updates[0].payload.search).toEqual({ query: 'tacos' })

    instances.push = push
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('search events reach onSearch', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const events: any[] = []
    await act(async () => {
      root.render(createElement(MapView, {
        runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
        onSearch: (e) => { events.push(e) },
      }))
    })
    const payload = { type: 'select', data: { place: { name: 'Ferry Building' } } }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'search', id: 's1', payload }) } })
    })
    expect(events).toEqual([payload])
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('the WebView script builds search, searches over the bridge, and links Directions to navigation', async () => {
    const tsMaps = await import('ts-maps')
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [37.79, -122.4], zoom: 15, search: { recents: false }, turnByTurn: { voice: false } },
    })
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const posted: any[] = []
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: (raw: string) => posted.push(JSON.parse(raw)) }
    // Photon, answering for the Ferry Building, and Overpass with its details.
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string) => new Response(JSON.stringify(String(url).includes('overpass')
      ? { elements: [{ type: 'node', id: 1, tags: { name: 'Ferry Building', phone: '+1 415 983 8000' } }] }
      : { features: [{ geometry: { type: 'Point', coordinates: [-122.3937, 37.7955] }, properties: { name: 'Ferry Building', osm_key: 'tourism', osm_value: 'attraction', city: 'San Francisco' } }] }))) as any
    try {
      runScript(script)
      expect(page.querySelector('.tsmap-search-input')).not.toBeNull()

      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setSearch', id: 's1', payload: { search: { query: 'ferry building' } } }) }))
      await new Promise(r => setTimeout(r, 30))
      const results = posted.find(e => e.type === 'search' && e.payload.type === 'results')
      expect(results?.payload.data.places[0].name).toBe('Ferry Building')

      // A result's card offers Directions, since navigation is on the map.
      const row = page.querySelector<HTMLElement>('.tsmap-search-row')!
      row.click()
      expect(page.querySelector('[data-action="directions"]')).not.toBeNull()
      expect(posted.some(e => e.type === 'search' && e.payload.type === 'select')).toBe(true)
      // Its details follow, as plain data.
      await new Promise(r => setTimeout(r, 30))
      const details = posted.find(e => e.type === 'search' && e.payload.type === 'details')
      expect(details?.payload.data.place.name).toBe('Ferry Building')
      expect(details?.payload.data.details.phone).toBe('+1 415 983 8000')

      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setSearch', id: 's2', payload: { search: null } }) }))
      expect(page.querySelector('.tsmap-search-input')).toBeNull()
    }
    finally {
      globalThis.fetch = original
      delete w.tsMaps
      delete w.ReactNativeWebView
      page.remove()
    }
  })

  test('the WebView script follows showSaved, and Save reaches onSearch as plain data', async () => {
    const tsMaps = await import('ts-maps')
    // A store cannot cross the bridge: the WebView keeps the page's own.
    const saved = new tsMaps.SavedPlaces({ backend: new tsMaps.MemorySavedPlaces() })
    tsMaps.setSavedPlaces(saved)
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [37.79, -122.4], zoom: 15, search: { recents: false, showSaved: false } },
    })
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const posted: any[] = []
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: (raw: string) => posted.push(JSON.parse(raw)) }
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string) => new Response(JSON.stringify(String(url).includes('overpass')
      ? { elements: [] }
      : { features: [{ geometry: { type: 'Point', coordinates: [-122.3937, 37.7955] }, properties: { name: 'Ferry Building', osm_key: 'tourism', osm_value: 'attraction', city: 'San Francisco' } }] }))) as any
    try {
      runScript(script)
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setSearch', id: 's1', payload: { search: { query: 'ferry building', recents: false, showSaved: false } } }) }))
      await new Promise(r => setTimeout(r, 30))
      page.querySelector<HTMLElement>('.tsmap-search-row')!.click()
      page.querySelector<HTMLElement>('[data-action="save"]')!.click()
      await new Promise(r => setTimeout(r, 30))
      const save = posted.find(e => e.type === 'search' && e.payload.type === 'save')
      expect(save?.payload.data.place.name).toBe('Ferry Building')
      expect(saved.favorites.map(p => p.name)).toEqual(['Ferry Building'])
      // Stars stay off the map while showSaved is false.
      expect(page.querySelector('.tsmap-search-star')).toBeNull()
    }
    finally {
      globalThis.fetch = original
      tsMaps.setSavedPlaces(null)
      delete w.tsMaps
      delete w.ReactNativeWebView
      page.remove()
    }
  })
})

describe('options after mount', () => {
  test('a changed option is sent over the bridge, not only the trip, the panel and the query', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const runtime = { source: 'cdn' as const, url: 'https://unpkg.com/ts-maps' }
    const render = (props: Record<string, unknown>): Promise<void> => act(async () => {
      root.render(createElement(MapView, { runtime, ...props }))
    })

    await render({ turnByTurn: { profile: 'driving' }, offlineMaps: { title: 'Offline' }, search: { placeholder: 'Search' } })
    const sent: any[] = []
    const instances = getInstances()
    const listen = (i: WebViewInstance): void => {
      i.ref.postMessage = (raw: string) => { sent.push(JSON.parse(raw)) }
    }
    instances.forEach(listen)
    const push = instances.push.bind(instances)
    instances.push = (...items: WebViewInstance[]) => {
      items.forEach(listen)
      return push(...items)
    }
    await act(async () => {
      lastInstance().onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'load', id: 'l1' }) } })
    })

    await render({
      turnByTurn: { profile: 'walking', units: 'imperial' },
      offlineMaps: { title: 'Saved maps', position: 'bottomleft', showStatus: false },
      search: { placeholder: 'Where to?', units: 'metric', categories: [{ id: 'cafe', label: 'Cafes', icon: 'cafe', kinds: ['cafe'], synonyms: [] }] },
    })
    expect(sent.find(e => e.type === 'setTurnByTurn')?.payload.turnByTurn).toEqual({ profile: 'walking', units: 'imperial' })
    expect(sent.find(e => e.type === 'setOfflineMaps')?.payload.offlineMaps).toEqual({ title: 'Saved maps', position: 'bottomleft', showStatus: false })
    expect(sent.find(e => e.type === 'setSearch')?.payload.search.placeholder).toBe('Where to?')
    expect(sent.find(e => e.type === 'setSearch')?.payload.search.categories[0].id).toBe('cafe')

    instances.push = push
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('the WebView script follows options into the controls, and a removed one returns to its default', async () => {
    const tsMaps = await import('ts-maps')
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [37.78, -122.42], zoom: 14, offlineMaps: { title: 'Downloads' }, search: { placeholder: 'Find a place', recents: false } },
    })
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: () => {} }
    const deliver = (env: unknown): void => {
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(env) }))
    }
    try {
      runScript(script)
      const button = (): HTMLElement | null => page.querySelector('.tsmap-offline-button')
      const input = (): HTMLInputElement | null => page.querySelector('.tsmap-search-input')
      expect(button()?.getAttribute('title')).toBe('Downloads')
      expect(input()?.getAttribute('placeholder')).toBe('Find a place')

      deliver({ type: 'setOfflineMaps', id: 's1', payload: { offlineMaps: { title: 'Saved maps', position: 'bottomleft' } } })
      deliver({ type: 'setSearch', id: 's2', payload: { search: { placeholder: 'Where to?', recents: false } } })
      expect(button()?.getAttribute('title')).toBe('Saved maps')
      expect(page.querySelector('.tsmap-bottom.tsmap-left .tsmap-offline-button')).not.toBeNull()
      expect(input()?.getAttribute('placeholder')).toBe('Where to?')

      // JSON drops a removed field; the script puts the key back, so the
      // control returns to the default rather than keeping the last value.
      deliver({ type: 'setOfflineMaps', id: 's3', payload: { offlineMaps: {} } })
      deliver({ type: 'setSearch', id: 's4', payload: { search: { recents: false } } })
      expect(button()?.getAttribute('title')).toBe('Offline Maps')
      expect(page.querySelector('.tsmap-top.tsmap-right .tsmap-offline-button')).not.toBeNull()
      expect(input()?.getAttribute('placeholder')).toBe('Search Maps')

      deliver({ type: 'setOfflineMaps', id: 's5', payload: { offlineMaps: null } })
      deliver({ type: 'setSearch', id: 's6', payload: { search: null } })
    }
    finally {
      delete w.tsMaps
      delete w.ReactNativeWebView
      page.remove()
    }
  })

  test('the WebView script fetches a showing preview again for another profile', async () => {
    const tsMaps = await import('ts-maps')
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [37.79, -122.4], zoom: 15, turnByTurn: { from: [37.7955, -122.3937], to: [37.8029, -122.4484], voice: false } },
    })
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const posted: any[] = []
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: (raw: string) => posted.push(JSON.parse(raw)) }
    // OSRM, answering with one straight route.
    const asked: string[] = []
    const line = [[-122.3937, 37.7955], [-122.4484, 37.8029]]
    const original = globalThis.fetch
    globalThis.fetch = (async (input: unknown) => {
      asked.push(String(input))
      return new Response(JSON.stringify({
        code: 'Ok',
        routes: [{
          distance: 5000,
          duration: 600,
          geometry: { type: 'LineString', coordinates: line },
          legs: [{ distance: 5000, duration: 600, steps: [
            { distance: 5000, duration: 600, geometry: { type: 'LineString', coordinates: line }, name: 'Embarcadero', maneuver: { type: 'depart' } },
            { distance: 0, duration: 0, geometry: { type: 'LineString', coordinates: [line[1], line[1]] }, name: '', maneuver: { type: 'arrive' } },
          ] }],
        }],
      }))
    }) as any
    const previews = (): number => posted.filter(e => e.type === 'turnByTurn' && e.payload.type === 'preview').length
    try {
      runScript(script)
      await new Promise(r => setTimeout(r, 30))
      expect(asked.some(u => u.includes('/route/v1/driving/'))).toBe(true)
      expect(previews()).toBe(1)

      const trip = { from: [37.7955, -122.3937], to: [37.8029, -122.4484], voice: false }
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setTurnByTurn', id: 't1', payload: { turnByTurn: { ...trip, profile: 'walking' } } }) }))
      await new Promise(r => setTimeout(r, 30))
      expect(asked.some(u => u.includes('/route/v1/foot/'))).toBe(true)
      expect(previews()).toBe(2)

      // The same options again are a no-op.
      const before = asked.length
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setTurnByTurn', id: 't2', payload: { turnByTurn: { ...trip, profile: 'walking' } } }) }))
      await new Promise(r => setTimeout(r, 30))
      expect(asked.length).toBe(before)

      // Transit is planned by OpenTripPlanner at otpUrl.
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setTurnByTurn', id: 't4', payload: { turnByTurn: { ...trip, profile: 'transit', otpUrl: 'https://otp.test/otp/gtfs/v1' } } }) }))
      await new Promise(r => setTimeout(r, 30))
      expect(asked.at(-1)).toBe('https://otp.test/otp/gtfs/v1')

      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setTurnByTurn', id: 't3', payload: { turnByTurn: null } }) }))
    }
    finally {
      globalThis.fetch = original
      delete w.tsMaps
      delete w.ReactNativeWebView
      page.remove()
    }
  })
})

describe('offline maps in the app\'s storage', () => {
  /** An in-memory stand-in for an app's file system. */
  function files() {
    const data = new Map<string, string>()
    return {
      data,
      expo: {
        documentDirectory: 'file:///docs/',
        readAsStringAsync: async (uri: string) => data.get(uri)!,
        writeAsStringAsync: async (uri: string, contents: string) => void data.set(uri, contents),
        deleteAsync: async (uri: string) => void data.delete(uri),
        getInfoAsync: async (uri: string) => ({ exists: data.has(uri) }),
        makeDirectoryAsync: async () => {},
      },
      rnfs: {
        DocumentDirectoryPath: '/docs',
        readFile: async (path: string) => data.get(path)!,
        writeFile: async (path: string, contents: string) => void data.set(path, contents),
        unlink: async (path: string) => void data.delete(path),
        exists: async (path: string) => data.has(path),
        mkdir: async () => {},
      },
    }
  }

  test('a key is a safe file name, and a long one is hashed', () => {
    expect(fileNameFor('ts-maps/tile/https://tiles.test/14/1/2.pbf')).toMatch(/^[\w.~-]+$/)
    expect(fileNameFor('a/b')).not.toBe(fileNameFor('a~002fb'))
    const long = `ts-maps/tile/https://tiles.test/${'x'.repeat(300)}.pbf`
    expect(fileNameFor(long).length).toBeLessThan(40)
    expect(fileNameFor(long)).not.toBe(fileNameFor(`${long}?v=2`))
  })

  test('Expo and react-native-fs adapters keep strings in files', async () => {
    for (const make of [(f: ReturnType<typeof files>) => expoFileSystemStore(f.expo), (f: ReturnType<typeof files>) => reactNativeFsStore(f.rnfs)]) {
      const fs = files()
      const store = make(fs)
      expect(await store.get('ts-maps/tile/a')).toBeUndefined()
      await store.set('ts-maps/tile/a', 'application/x-protobuf\nAAEC')
      expect(await store.get('ts-maps/tile/a')).toBe('application/x-protobuf\nAAEC')
      expect([...fs.data.keys()][0]).toContain('/ts-maps-offline/')
      await store.delete('ts-maps/tile/a')
      await store.delete('ts-maps/tile/a')
      expect(fs.data.size).toBe(0)
    }
  })

  test('MapView answers the WebView\'s store calls from offlineStore', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const kept = new Map<string, string>([['k', 'v']])
    const offlineStore = {
      get: async (k: string) => kept.get(k),
      set: async (k: string, v: string) => void kept.set(k, v),
      delete: async (k: string) => void kept.delete(k),
    }
    await act(async () => {
      root.render(createElement(MapView, { runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' }, offlineStore }))
    })
    const inst = lastInstance()
    const sent: any[] = []
    inst.ref.postMessage = (raw: string) => { sent.push(JSON.parse(raw)) }
    const ask = async (id: string, payload: unknown): Promise<void> => {
      await act(async () => {
        inst.onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'store', id, payload }) } })
        await new Promise(r => setTimeout(r, 0))
      })
    }
    await ask('s1', { op: 'get', key: 'k' })
    await ask('s2', { op: 'set', key: 'n', value: 'new' })
    await ask('s3', { op: 'get', key: 'missing' })
    await ask('s4', { op: 'rename', key: 'k' })
    expect(sent.find(e => e.id === 's1')).toEqual({ type: 'store:result', id: 's1', result: 'v' })
    expect(kept.get('n')).toBe('new')
    expect(sent.find(e => e.id === 's3')).toEqual({ type: 'store:result', id: 's3', result: null })
    expect(sent.find(e => e.id === 's4')?.type).toBe('store:error')
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('the WebView keeps its offline maps in the app\'s storage, across the bridge', async () => {
    const tsMaps = await import('ts-maps')
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [37.78, -122.42], zoom: 14, nativeStore: true },
    })
    expect(html).toContain('"nativeStore":true')
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    // The app's side: a storage of strings, answering each `store` envelope.
    const kept = new Map<string, string>()
    const posted: any[] = []
    const deliver = (env: unknown): void => {
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(env) }))
    }
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = {
      postMessage: (raw: string) => {
        const env = JSON.parse(raw)
        posted.push(env)
        if (env.type !== 'store')
          return
        const { op, key, value } = env.payload
        if (op === 'set')
          kept.set(key, value)
        if (op === 'delete')
          kept.delete(key)
        setTimeout(() => deliver({ type: 'store:result', id: env.id, result: op === 'get' ? kept.get(key) ?? null : null }), 0)
      },
    }
    runScript(script)

    const maps = tsMaps.offlineMaps()
    expect(maps.store).toBeInstanceOf(tsMaps.KeyValueOfflineStore)
    await maps.store.putRegion({ id: 'r', name: 'Home', bounds: [0, 0, 1, 1], minZoom: 0, maxZoom: 1, sources: [], status: 'complete', tiles: 0, downloaded: 0, bytes: 0, createdAt: 1, updatedAt: 1 })
    expect([...kept.keys()]).toEqual(['ts-maps/region/r', 'ts-maps/meta/regions'])
    expect((await maps.store.listRegions()).map(r => r.name)).toEqual(['Home'])
    expect(posted.filter(e => e.type === 'store').length).toBeGreaterThan(2)

    tsMaps.setOfflineMaps(null)
    delete w.tsMaps
    delete w.ReactNativeWebView
    page.remove()
  })
})
