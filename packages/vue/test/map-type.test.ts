import { describe, expect, test } from 'bun:test'
import { mapTypes, TrafficLayer, trafficSources } from 'ts-maps'
import { createApp, h, nextTick, ref } from 'vue'
import { Map } from '../src/Map'
import { MapType } from '../src/MapType'

const types = mapTypes({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf', imagery: 'https://imagery.test/{z}/{y}/{x}.jpg' })
const settle = async (): Promise<void> => {
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

describe('@ts-maps/vue MapType', () => {
  test('follows value and open, reports them for v-model, and emits a choice', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const value = ref('explore')
    const open = ref(false)
    const changes: string[] = []
    const updates: unknown[] = []
    let control: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: [37.78, -122.42], zoom: 13 }, () => [
        h(MapType as any, {
          types,
          'value': value.value,
          'open': open.value,
          'onChange': (e: any) => changes.push(e.value),
          'onUpdate:value': (v: string) => updates.push(['value', v]),
          'onUpdate:open': (v: boolean) => updates.push(['open', v]),
          'onReady': (c: any) => (control = c),
        }),
      ]),
    })
    app.mount(host)
    await settle()
    expect(host.querySelector('.tsmap-maptype-button')).not.toBeNull()

    value.value = 'driving'
    open.value = true
    await settle()
    expect(control.value).toBe('driving')
    expect(host.querySelector('.tsmap-maptype-card')).not.toBeNull()

    ;(host.querySelector('[data-type="satellite"]') as HTMLElement).click()
    expect(changes).toEqual(['driving', 'satellite'])
    expect(updates).toContainEqual(['value', 'satellite'])
    expect(updates).toContainEqual(['open', true])

    open.value = false
    await settle()
    expect(host.querySelector('.tsmap-maptype-card')).toBeNull()

    app.unmount()
    expect(host.querySelector('.tsmap-maptype-button')).toBeNull()
    host.remove()
  })

  test('follows showTraffic, and reports the Traffic switch for v-model', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const traffic = new TrafficLayer({ source: trafficSources.mapbox('pk.test'), refresh: 0 })
    const showTraffic = ref(false)
    const updates: unknown[] = []
    let control: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: [37.78, -122.42], zoom: 13 }, () => [
        h(MapType as any, {
          types,
          traffic,
          'value': 'explore',
          'showTraffic': showTraffic.value,
          'onTrafficchange': (e: any) => updates.push(['trafficchange', e.traffic]),
          'onUpdate:showTraffic': (v: boolean) => updates.push(['showTraffic', v]),
          'onReady': (c: any) => (control = c),
        }),
      ]),
    })
    app.mount(host)
    await settle()
    expect(traffic.active).toBe(false)

    showTraffic.value = true
    await settle()
    expect(traffic.active).toBe(true)
    expect(control._map.getStyle().layers.map((l: any) => l.id)).toContain('ts-maps-traffic')

    showTraffic.value = false
    await settle()
    expect(traffic.active).toBe(false)

    control.open()
    const toggle = host.querySelector<HTMLInputElement>('[data-setting="traffic"]')!
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    expect(traffic.active).toBe(true)
    expect(updates).toEqual([['trafficchange', true], ['showTraffic', true]])

    app.unmount()
    traffic.remove()
    host.remove()
  })
})
