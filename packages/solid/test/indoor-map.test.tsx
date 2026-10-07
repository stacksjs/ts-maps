import { describe, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { IndoorMap } from '../src/IndoorMap'
import { Map } from '../src/Map'
import { Search } from '../src/Search'

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

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0))

describe('@ts-maps/solid IndoorMap', () => {
  test('follows level, reports a level chosen on the picker, and connects to search', async () => {
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const [level, setLevel] = createSignal<number | undefined>(0)
    const [search, setSearch] = createSignal<any>(undefined)
    const levels: number[] = []
    let control: any
    const dispose = render(() => (
      <Map class="map" center={[Y + 0.001, X + 0.001]} zoom={17}>
        <Search provider={null} offline={null} recents={false} details={null} saved={null} onReady={setSearch} />
        <IndoorMap
          venue={VENUE}
          level={level()}
          search={search()}
          onReady={(c) => { control = c }}
          onLevelChange={e => levels.push(e.level)}
        />
      </Map>
    ), el)

    await settle()
    await control.ready()
    expect([...el.querySelectorAll('.tsmap-indoor-level')].map(b => b.textContent)).toEqual(['2', '1'])
    setLevel(1)
    expect(control.level).toBe(1)
    expect(levels).toEqual([1])
    ;(el.querySelector('[data-level="0"]') as HTMLElement).click()
    expect(levels).toEqual([1, 0])

    const [gate] = await search().engine.search('Gate D12')
    search().select(gate)
    expect(control.level).toBe(1)

    dispose()
    expect(el.querySelector('.tsmap-indoor-control')).toBeNull()
    el.remove()
  })
})
