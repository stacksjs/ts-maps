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
