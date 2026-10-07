import { afterEach, describe, expect, test } from 'bun:test'
import type { Route } from '../src/core-map/services/types'
import { control, mapTypes, styles, TomTomIncidents, TrafficLayer, trafficNote, trafficSources, TsMap } from '../src/core-map'
import { GoogleDirections } from '../src/core-map/services/providers/Google'
import { MapboxDirections } from '../src/core-map/services/providers/Mapbox'

const TILES = 'https://tiles.test/{z}/{x}/{y}.pbf'

function makeMap(): TsMap {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 430 })
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false, fadeAnimation: false })
  map.setView([37.78, -122.42], 13)
  map.setStyle(styles.light({ tiles: TILES }))
  return map
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  document.body.replaceChildren()
})

describe('TrafficLayer', () => {
  test('draws flow under the labels, coloured by congestion, and takes it away again', () => {
    const map = makeMap()
    const traffic = new TrafficLayer({ source: trafficSources.mapbox('pk.test'), refresh: 0 }).addTo(map)
    const ids = map.getStyle()!.layers.map(l => l.id)
    expect(ids).toContain('ts-maps-traffic')
    // Beneath the first label, so names stay on top.
    expect(ids.indexOf('ts-maps-traffic')).toBe(ids.indexOf('road-label') - 1)
    const layer = map.getStyleLayer('ts-maps-traffic') as any
    expect(layer['source-layer']).toBe('traffic')
    expect(JSON.stringify(layer.paint['line-color'])).toContain('#a1171f')
    expect((map.getSource('ts-maps-traffic') as any).tiles[0]).toContain('mapbox.mapbox-traffic-v1')
    traffic.remove()
    expect(map.getStyle()!.layers.map(l => l.id)).not.toContain('ts-maps-traffic')
    expect(map.getSource('ts-maps-traffic')).toBeUndefined()
  })

  test('TomTom flow reads its relative speed into the same four colours', () => {
    const tomtom = trafficSources.tomtom('k')
    expect(tomtom.sourceLayer).toBe('Traffic flow')
    expect(JSON.stringify(tomtom.congestion)).toContain('traffic_level')
  })

  test('refreshing fetches the tiles anew rather than from the HTTP cache', () => {
    const map = makeMap()
    const traffic = new TrafficLayer({ source: trafficSources.mapbox('pk.test'), refresh: 0 }).addTo(map)
    const before = (map.getSource('ts-maps-traffic') as any).tiles[0]
    traffic.refresh()
    expect((map.getSource('ts-maps-traffic') as any).tiles[0]).not.toBe(before)
  })

  test('shows incidents with a card, from TomTom', async () => {
    const asked: string[] = []
    const incidents = new TomTomIncidents({
      key: 'k',
      fetch: (async (url: string) => {
        asked.push(url)
        return new Response(JSON.stringify({ incidents: [
          { geometry: { type: 'LineString', coordinates: [[-122.418, 37.781], [-122.417, 37.782]] }, properties: { id: 'a1', iconCategory: 1, events: [{ description: 'Accident' }], from: 'Market St', to: '5th St', delay: 420, roadNumbers: ['US-101'] } },
          { geometry: { type: 'Point', coordinates: [-122.41, 37.79] }, properties: { id: 'r1', iconCategory: 9, events: [{ description: 'Roadworks' }] } },
        ] }))
      }) as unknown as typeof fetch,
    })
    const map = makeMap()
    const traffic = new TrafficLayer({ incidents, refresh: 0 })
    const loaded = new Promise(resolve => map.once('trafficincidents', resolve))
    traffic.addTo(map)
    await loaded
    expect(asked[0]).toContain('incidentDetails')
    expect(traffic.incidents.map(i => [i.type, i.description, i.delay])).toEqual([['accident', 'Accident', 420], ['roadworks', 'Roadworks', undefined]])
    expect(traffic.incidents[0]!.road).toBe('US-101 · Market St to 5th St')
    expect(map.getContainer().querySelectorAll('.tsmap-traffic-incident')).toHaveLength(2)
    traffic.remove()
    expect(map.getContainer().querySelectorAll('.tsmap-traffic-incident')).toHaveLength(0)
  })

  test('is carried from one map type to the next, and switched from the picker', () => {
    const map = makeMap()
    const traffic = new TrafficLayer({ source: trafficSources.mapbox('pk.test'), refresh: 0 })
    const picker = control.mapType({ types: mapTypes({ tiles: TILES }), traffic }).addTo(map)
    picker.open()
    const toggle = map.getContainer().querySelector<HTMLInputElement>('[data-setting="traffic"]')!
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    expect(traffic.active).toBe(true)
    picker.select('satellite')
    expect(map.getStyle()!.layers.map(l => l.id)).toContain('ts-maps-traffic')
    picker.sync({ showTraffic: false })
    expect(traffic.active).toBe(false)
  })
})

describe('traffic-aware directions', () => {
  const step = { distance: 1000, duration: 120, geometry: { type: 'LineString', coordinates: [[0, 0], [0.01, 0]] }, maneuver: { type: 'depart' } }

  test('Mapbox drives with driving-traffic and reports the delay', async () => {
    const asked: string[] = []
    globalThis.fetch = (async (url: string) => {
      asked.push(url)
      return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 1000, duration: 600, duration_typical: 360, geometry: step.geometry, legs: [{ distance: 1000, duration: 600, steps: [step] }] }] }))
    }) as unknown as typeof fetch
    const [route] = await new MapboxDirections({ accessToken: 'pk.test', traffic: true }).getDirections([{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }])
    expect(asked[0]).toContain('/mapbox/driving-traffic/')
    expect(route).toMatchObject({ duration: 600, typicalDuration: 360, traffic: true })
    // Walking has no traffic.
    await new MapboxDirections({ accessToken: 'pk.test', traffic: true }).getDirections([{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }], { profile: 'walking' })
    expect(asked[1]).toContain('/mapbox/walking/')
  })

  test('Google leaves now and reports time in traffic', async () => {
    const asked: string[] = []
    globalThis.fetch = (async (url: string) => {
      asked.push(url)
      return new Response(JSON.stringify({ status: 'OK', routes: [{ legs: [{ distance: { value: 1000 }, duration: { value: 360 }, duration_in_traffic: { value: 540 }, steps: [] }] }] }))
    }) as unknown as typeof fetch
    const [route] = await new GoogleDirections({ apiKey: 'k', traffic: true }).getDirections([{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }])
    expect(asked[0]).toContain('departure_time=now')
    expect(route).toMatchObject({ duration: 540, typicalDuration: 360, traffic: true })
  })

  test('the preview says how much traffic costs', () => {
    const route = (duration: number, typicalDuration?: number): Route => ({ distance: 5000, duration, typicalDuration, traffic: typicalDuration !== undefined, geometry: [], steps: [] })
    expect(trafficNote(route(600))).toBe('')
    expect(trafficNote(route(610, 600))).toContain('Light traffic')
    expect(trafficNote(route(840, 600))).toContain('4 min delay')
    expect(trafficNote(route(840, 600))).toContain('moderate')
    expect(trafficNote(route(1500, 600))).toContain('heavy')
  })
})
