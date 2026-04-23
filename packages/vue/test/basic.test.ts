import { describe, expect, test } from 'bun:test'
import { createApp, h, nextTick } from 'vue'
import { Layer, Map, mapKey, Marker, Popup, Source, TileLayer, useMap, useMapEvent } from '../src'

describe('@ts-maps/vue exports', () => {
  test('module exports the public surface', () => {
    expect(Map).toBeDefined()
    expect(Marker).toBeDefined()
    expect(Popup).toBeDefined()
    expect(TileLayer).toBeDefined()
    expect(Source).toBeDefined()
    expect(Layer).toBeDefined()
    expect(typeof useMap).toBe('function')
    expect(typeof useMapEvent).toBe('function')
    expect(typeof mapKey).toBe('symbol')
  })

  test('<Map> name matches TsMap', () => {
    expect((Map as unknown as { name: string }).name).toBe('TsMap')
  })
})

describe('<Map> client mount', () => {
  test('creates a TsMap instance via load-map emit', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    let received: unknown = null
    const app = createApp({
      render(): unknown {
        return h(Map as unknown as any, {
          containerClass: 'ts-map-host',
          center: [0, 0],
          zoom: 3,
          'onLoad-map': (m: unknown): void => {
            received = m
          },
        })
      },
    })
    app.mount(host)
    // Size the rendered map container manually so TsMap can initialize.
    const mapEl = host.querySelector('.ts-map-host') as HTMLElement | null
    if (mapEl) {
      mapEl.style.width = '800px'
      mapEl.style.height = '600px'
    }
    await nextTick()
    expect(received).not.toBeNull()

    app.unmount()
    host.remove()
  })

  test('useMap throws outside a <Map>', () => {
    let caught: Error | null = null
    const Consumer = {
      setup(): () => unknown {
        try {
          useMap()
        }
        catch (e) {
          caught = e as Error
        }
        return () => null
      },
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(Consumer)
    app.mount(host)
    app.unmount()
    host.remove()
    expect(caught).not.toBeNull()
    expect((caught as unknown as Error).message).toMatch(/useMap/)
  })
})
