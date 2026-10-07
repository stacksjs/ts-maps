import { describe, expect, test } from 'bun:test'
import { createApp, h, nextTick, ref } from 'vue'
import { IndoorMap } from '../src/IndoorMap'
import { Map } from '../src/Map'

// A two-level terminal in IMDF: a venue, its levels, and a gate on the upper one.
const X = -122.3866
const Y = 37.6155
const square = (x: number, y: number, size = 0.002): number[][][] => [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]]
const feature = (id: string, type: string, geometry: any, properties: Record<string, any>) => ({ type: 'Feature', id, feature_type: type, geometry, properties })
const VENUE = {
  venue: { features: [feature('v', 'venue', { type: 'Polygon', coordinates: square(X, Y) }, { name: { en: 'SFO Terminal 2' }, category: 'airport' })] },
  level: { features: [
    feature('l0', 'level', { type: 'Polygon', coordinates: square(X, Y) }, { ordinal: 0, name: { en: 'Arrivals' }, short_name: { en: '1' } }),
    feature('l1', 'level', { type: 'Polygon', coordinates: square(X, Y) }, { ordinal: 1, name: { en: 'Departures' }, short_name: { en: '2' } }),
  ] },
  unit: { features: [feature('u-gate', 'unit', { type: 'Polygon', coordinates: square(X + 0.001, Y + 0.001, 0.0004) }, { level_id: 'l1', category: 'room' })] },
  anchor: { features: [feature('an-gate', 'anchor', { type: 'Point', coordinates: [X + 0.0012, Y + 0.0012] }, { unit_id: 'u-gate' })] },
  occupant: { features: [feature('oc-gate', 'occupant', null, { anchor_id: 'an-gate', category: 'gate', name: { en: 'Gate D12' } })] },
}

const settle = async (): Promise<void> => {
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

describe('@ts-maps/vue IndoorMap', () => {
  test('follows level, reports it for v-model, and emits a level chosen on the picker', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const level = ref<number | undefined>(undefined)
    const changes: number[] = []
    let control: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: [Y + 0.001, X + 0.001], zoom: 17 }, () => [
        h(IndoorMap as any, {
          'venue': VENUE,
          'level': level.value,
          'onLevelchange': (e: any) => changes.push(e.level),
          'onUpdate:level': (v: number) => (level.value = v),
          'onReady': (c: any) => (control = c),
        }),
      ]),
    })
    app.mount(host)
    await settle()
    await control.ready()
    await settle()
    // The level showing, reported for v-model.
    expect(level.value).toBe(0)
    expect([...host.querySelectorAll('.tsmap-indoor-level')].map(b => b.textContent)).toEqual(['2', '1'])

    level.value = 1
    await settle()
    expect(control.level).toBe(1)
    expect(changes).toEqual([1])

    ;(host.querySelector('[data-level="0"]') as HTMLElement).click()
    await settle()
    expect(changes).toEqual([1, 0])
    expect(level.value).toBe(0)

    app.unmount()
    expect(host.querySelector('.tsmap-indoor-control')).toBeNull()
    host.remove()
  })
})
