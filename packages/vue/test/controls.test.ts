import { describe, expect, test } from 'bun:test'
import { createApp, h, nextTick } from 'vue'
import {
  AttributionControl,
  FullscreenControl,
  GeocoderControl,
  LocateControl,
  Map,
  NavigationControl,
  ScaleControl,
  ZoomControl,
} from '../src'

/**
 * Controls used to be reachable only through `useMap()` and a watcher. These
 * cover the declarative wrappers: that each attaches to the map, detaches when
 * unmounted, and passes its options through.
 */

async function mount(children: unknown[]): Promise<{ host: HTMLElement, app: ReturnType<typeof createApp> }> {
  const host = document.createElement('div')
  document.body.appendChild(host)

  const app = createApp({
    render(): unknown {
      return h(Map as unknown as any, {
        containerClass: 'ts-map-host',
        center: [34.02, -118.47],
        zoom: 12,
      }, () => children)
    },
  })
  app.mount(host)

  // TsMap needs a sized container before it will initialise.
  const mapEl = host.querySelector('.ts-map-host') as HTMLElement | null
  if (mapEl) {
    mapEl.style.width = '800px'
    mapEl.style.height = '600px'
  }
  await nextTick()
  await nextTick()

  return { host, app }
}

describe('@ts-maps/vue controls', () => {
  test('every control is exported', () => {
    for (const Control of [
      ZoomControl,
      NavigationControl,
      GeocoderControl,
      FullscreenControl,
      LocateControl,
      ScaleControl,
      AttributionControl,
    ])
      expect(Control).toBeDefined()
  })

  test('component names are prefixed for template use', () => {
    expect((NavigationControl as unknown as { name: string }).name).toBe('TsNavigationControl')
    expect((GeocoderControl as unknown as { name: string }).name).toBe('TsGeocoderControl')
  })

  test('a control mounts into the map, in the position it asked for', async () => {
    const { host, app } = await mount([
      h(NavigationControl as unknown as any, { position: 'topright' }),
    ])

    const nav = host.querySelector('.tsmap-control-navigation')
    expect(nav).not.toBeNull()
    expect(nav!.closest('.tsmap-top.tsmap-right')).not.toBeNull()

    app.unmount()
    host.remove()
  })

  test('options reach the underlying control', async () => {
    const { host, app } = await mount([
      h(GeocoderControl as unknown as any, { options: { placeholder: 'Find a place' } }),
    ])

    const input = host.querySelector('.tsmap-control-geocoder-input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.placeholder).toBe('Find a place')

    app.unmount()
    host.remove()
  })

  test('several controls coexist', async () => {
    const { host, app } = await mount([
      h(NavigationControl as unknown as any, { position: 'topright' }),
      h(ScaleControl as unknown as any, { position: 'bottomleft' }),
      h(FullscreenControl as unknown as any, { position: 'topright' }),
    ])

    expect(host.querySelector('.tsmap-control-navigation')).not.toBeNull()
    expect(host.querySelector('.tsmap-control-scale')).not.toBeNull()
    expect(host.querySelector('.tsmap-control-fullscreen')).not.toBeNull()

    app.unmount()
    host.remove()
  })

  test('unmounting takes the control with it', async () => {
    const { host, app } = await mount([h(ScaleControl as unknown as any, {})])
    expect(host.querySelector('.tsmap-control-scale')).not.toBeNull()

    app.unmount()
    expect(host.querySelector('.tsmap-control-scale')).toBeNull()
    host.remove()
  })
})

describe('territory components', () => {
  const RING: number[][] = [
    [-118.475, 34.018],
    [-118.470, 34.018],
    [-118.470, 34.022],
    [-118.475, 34.022],
    [-118.475, 34.018],
  ]

  /**
   * The overlay pane both layers draw into. A canvas is not matched by a class
   * selector in this DOM, so the pane is what gets counted.
   */
  function overlay(host: HTMLElement): HTMLElement {
    return host.querySelector('.tsmap-overlay-pane') as HTMLElement
  }

  test('a territory layer mounts into the map', async () => {
    const { TerritoryLayer } = await import('../src/TerritoryLayer')
    const { TerritoryStore } = await import('ts-maps')
    const store = new TerritoryStore()
    store.capture('sam', RING)

    const { host, app } = await mount([h(TerritoryLayer as any, { store, self: 'sam' })])
    expect(overlay(host).children.length).toBe(1)

    const pane = overlay(host)
    app.unmount()
    expect(pane.children.length).toBe(0)
    host.remove()
  })

  test('a run trail layer takes its track', async () => {
    const { RunTrailLayer } = await import('../src/TerritoryLayer')
    const { host, app } = await mount([h(RunTrailLayer as any, {
      track: [[-118.47, 34.02], [-118.469, 34.021]],
    })])
    expect(overlay(host).children.length).toBe(1)
    app.unmount()
    host.remove()
  })
})
