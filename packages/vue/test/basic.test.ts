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

  test('<Map> name matches MapInstance', () => {
    expect((Map as unknown as { name: string }).name).toBe('MapInstance')
  })
})

describe('<Map> client mount', () => {
  test('creates a MapInstance instance via load-map emit', async () => {
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
    // Size the rendered map container manually so MapInstance can initialize.
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

describe('<Map> pitch limits', () => {
  test('maxPitch and minPitch reach the map', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    let received: any = null
    const app = createApp({
      render(): unknown {
        return h(Map as unknown as any, {
          center: [0, 0],
          zoom: 3,
          maxPitch: 70,
          minPitch: 10,
          'onLoad-map': (m: unknown): void => {
            received = m
          },
        })
      },
    })
    app.mount(host)
    await nextTick()
    expect(received.options.maxPitch).toBe(70)
    expect(received.options.minPitch).toBe(10)

    app.unmount()
    host.remove()
  })
})

describe('<Map> drag to rotate', () => {
  test('dragRotate and pitchWithRotate reach the map, and are left to its defaults when not given', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const mount = async (props: Record<string, unknown>): Promise<{ map: any, app: ReturnType<typeof createApp> }> => {
      let map: any = null
      const app = createApp({
        render(): unknown {
          return h(Map as unknown as any, {
            center: [0, 0],
            zoom: 3,
            ...props,
            'onLoad-map': (m: unknown): void => {
              map = m
            },
          })
        },
      })
      app.mount(host)
      await nextTick()
      return { map, app }
    }

    const off = await mount({ dragRotate: false, pitchWithRotate: false })
    expect(off.map.options.dragRotate).toBe(false)
    expect(off.map.options.pitchWithRotate).toBe(false)
    expect(off.map.dragRotate.enabled()).toBe(false)
    off.app.unmount()

    // A Boolean prop left out must not arrive as `false`.
    const plain = await mount({})
    expect(plain.map.options.dragRotate).toBe(true)
    expect(plain.map.options.pitchWithRotate).toBe(true)
    plain.app.unmount()

    host.remove()
  })
})
