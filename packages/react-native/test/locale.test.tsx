import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { buildHtml, MapView } from '../src'

type WebViewInstance = {
  ref: { postMessage: (msg: string) => void }
  onMessage: ((e: { nativeEvent: { data: string } }) => void) | undefined
}

function getInstances(): WebViewInstance[] {
  return (globalThis as unknown as { __tsMapsRnTestWebViews: WebViewInstance[] }).__tsMapsRnTestWebViews
}

function lastInstance(): WebViewInstance {
  const all = getInstances()
  return all[all.length - 1]
}

// Runs the document's inline script as the WebView would, its message
// listeners taken away after the test.
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

describe('locale over the bridge', () => {
  test('the document carries the locale and accepts a new one', () => {
    const html = buildHtml({ runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' }, initial: { locale: 'de' } })
    expect(html).toContain('"locale":"de"')
    expect(html).toContain('env.type === "setLocale"')
  })

  test('a changed locale is sent over the bridge, and an unchanged one is not', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const runtime = { source: 'cdn' as const, url: 'https://unpkg.com/ts-maps' }
    const render = (locale?: string): Promise<void> => act(async () => {
      root.render(createElement(MapView, { runtime, locale }))
    })

    await render('de')
    // Every render records an instance; each one's ref is listened to.
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
    await render('de')
    expect(sent.filter(e => e.type === 'setLocale')).toHaveLength(0)
    await render('en')
    await render(undefined)
    expect(sent.filter(e => e.type === 'setLocale').map(e => e.payload.locale)).toEqual(['en', null])

    instances.push = push
    await act(async () => { root.unmount() })
    host.remove()
  })

  test('the WebView script builds the map in German, and relabels its controls for a new locale', async () => {
    const tsMaps = await import('ts-maps')
    const html = buildHtml({
      runtime: { source: 'cdn', url: 'https://unpkg.com/ts-maps' },
      initial: { center: [37.79, -122.4], zoom: 15, locale: 'de', search: { recents: false }, offlineMaps: {}, turnByTurn: { voice: false } },
    })
    const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
    const page = document.createElement('div')
    page.innerHTML = '<div id="map" style="width:400px;height:600px"></div>'
    document.body.appendChild(page)
    const w = window as any
    w.tsMaps = tsMaps
    w.ReactNativeWebView = { postMessage: () => {} }
    try {
      runScript(script)
      const input = (): Element | null => page.querySelector('.tsmap-search-input')
      const button = (): Element | null => page.querySelector('.tsmap-offline-button')
      expect(input()?.getAttribute('placeholder')).toBe('Karten durchsuchen')
      expect(button()?.getAttribute('title')).toBe('Karten offline')
      expect(page.querySelector('.tsmap-control-zoom-in')?.getAttribute('title')).toBe('Vergrößern')

      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setLocale', id: 'x1', payload: { locale: 'en' } }) }))
      expect(w.__tsMapsBridge__.map.options.locale).toBe('en')
      expect(input()?.getAttribute('placeholder')).toBe('Search Maps')
      expect(button()?.getAttribute('title')).toBe('Offline Maps')
    }
    finally {
      delete w.tsMaps
      delete w.ReactNativeWebView
      page.remove()
    }
  })
})
