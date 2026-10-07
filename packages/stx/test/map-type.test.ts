import { describe, expect, test } from 'bun:test'
import { TsMap } from 'ts-maps'
import { mountChildren } from '../src/runtime'

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0))
const plain = { tiles: 'https://tiles.test/{z}/{x}/{y}.pbf', imagery: 'https://imagery.test/{z}/{y}/{x}.jpg' }

function setup(): { root: HTMLElement, map: TsMap } {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const mapEl = document.createElement('div')
  mapEl.style.width = '430px'
  mapEl.style.height = '800px'
  root.appendChild(mapEl)
  return { root, map: new TsMap(mapEl, { center: [37.78, -122.42], zoom: 13 }) }
}

describe('map-type child', () => {
  test('is built from plain options, follows value and open, and reports a choice through DOM events', async () => {
    const { root, map } = setup()
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="map-type" data-options='${JSON.stringify({ ...plain, value: 'explore' })}'></span>`)
    const el = root.querySelector('[data-ts-map-child="map-type"]')!

    let control: any = null
    const seen: Array<[string, unknown]> = []
    root.addEventListener('maptype:ready', (e: any) => {
      control = e.detail.control
    })
    root.addEventListener('maptype:change', (e: any) => seen.push(['change', e.detail.value]))
    root.addEventListener('maptype:openchange', (e: any) => seen.push(['openchange', e.detail.open]))

    const unmount = mountChildren(map, root)
    expect(control).not.toBeNull()
    expect(control.types.map((t: any) => t.id)).toEqual(['explore', 'driving', 'transit', 'satellite'])
    expect(root.querySelector('.tsmap-maptype-button')).not.toBeNull()

    el.setAttribute('data-options', JSON.stringify({ ...plain, value: 'driving', open: true }))
    await tick()
    expect(control.value).toBe('driving')
    expect(root.querySelector('.tsmap-maptype-card')).not.toBeNull()

    ;(root.querySelector('[data-type="satellite"]') as HTMLElement).click()
    expect(seen).toEqual([['change', 'driving'], ['openchange', true], ['change', 'satellite']])

    // The same plain options keep the same types; new ones build new types.
    const types = control.types
    el.setAttribute('data-options', JSON.stringify({ ...plain, value: 'driving', open: false, position: 'bottomleft' }))
    await tick()
    expect(control.types).toBe(types)
    expect(root.querySelector('.tsmap-maptype-card')).toBeNull()
    expect(root.querySelector('.tsmap-bottom.tsmap-left .tsmap-maptype-button')).not.toBeNull()
    el.setAttribute('data-options', JSON.stringify({ ...plain, labels: false, value: 'driving', open: false }))
    await tick()
    expect(control.types).not.toBe(types)

    unmount()
    expect(root.querySelector('.tsmap-maptype-button')).toBeNull()
    root.remove()
  })

  test('builds a traffic layer from a provider and key, follows showTraffic, and reports the switch', async () => {
    const { root, map } = setup()
    const options = { ...plain, value: 'explore', trafficProvider: 'mapbox', trafficKey: 'pk.test' }
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="map-type" data-options='${JSON.stringify(options)}'></span>`)
    const el = root.querySelector('[data-ts-map-child="map-type"]')!

    let control: any = null
    const seen: unknown[] = []
    root.addEventListener('maptype:ready', (e: any) => {
      control = e.detail.control
    })
    root.addEventListener('maptype:trafficchange', (e: any) => seen.push(e.detail.traffic))
    const layers = (): string[] => map.getStyle()!.layers.map(l => l.id)

    const unmount = mountChildren(map, root)
    const traffic = control.options.traffic
    expect(traffic.active).toBe(false)

    el.setAttribute('data-options', JSON.stringify({ ...options, showTraffic: true }))
    await tick()
    expect(traffic.active).toBe(true)
    expect(layers()).toContain('ts-maps-traffic')
    expect((map.getSource('ts-maps-traffic') as any).tiles[0]).toContain('mapbox.mapbox-traffic-v1')

    // A new provider builds a new layer, still showing.
    el.setAttribute('data-options', JSON.stringify({ ...options, trafficProvider: 'tomtom', trafficKey: 'k', showTraffic: true }))
    await tick()
    expect(control.options.traffic).not.toBe(traffic)
    expect(traffic.active).toBe(false)
    expect((map.getSource('ts-maps-traffic') as any).tiles[0]).toContain('api.tomtom.com')

    el.setAttribute('data-options', JSON.stringify({ ...options, trafficProvider: 'tomtom', trafficKey: 'k', showTraffic: false }))
    await tick()
    expect(layers()).not.toContain('ts-maps-traffic')

    control.open()
    const toggle = root.querySelector<HTMLInputElement>('[data-setting="traffic"]')!
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    expect(layers()).toContain('ts-maps-traffic')
    expect(seen).toEqual([true])

    unmount()
    expect(layers()).not.toContain('ts-maps-traffic')
    root.remove()
  })
})
