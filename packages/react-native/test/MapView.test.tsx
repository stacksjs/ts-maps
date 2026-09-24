import { describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { buildHtml, decode, encode, MapView, nextId } from '../src'

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
    // eslint-disable-next-line no-new-func
    new Function(script)()

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
