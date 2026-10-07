import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'

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
  flushSync()
  await new Promise(r => setTimeout(r, 0))
  flushSync()
}

describe('@ts-maps/svelte IndoorMap', () => {
  test('follows level, binds it back, reports a level chosen on the picker, and connects to search', async () => {
    const WithIndoorMap = (await import('./fixtures/WithIndoorMap.svelte')).default
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const events: Array<[string, unknown]> = []
    const app = mount(WithIndoorMap, { target: el, props: { venue: VENUE, center: [Y + 0.001, X + 0.001], events } }) as any

    await settle()
    await app.getControl().ready()
    await settle()
    // The level showing, bound back.
    expect(app.state().level).toBe(0)
    expect([...el.querySelectorAll('.tsmap-indoor-level')].map(b => b.textContent)).toEqual(['2', '1'])

    const control = app.getControl()
    app.setLevel(1)
    await settle()
    expect(app.getControl()).toBe(control)
    expect(control.level).toBe(1)
    expect(events).toEqual([['levelchange', 1]])

    // Chosen on the picker: the bound level follows.
    ;(el.querySelector('[data-level="0"]') as HTMLElement).click()
    await settle()
    expect(events).toEqual([['levelchange', 1], ['levelchange', 0]])
    expect(app.state().level).toBe(0)

    // Chosen in search: the venue's gate goes to its level.
    const search = app.getSearch()
    const [gate] = await search.engine.search('Gate D12')
    search.select(gate)
    await settle()
    expect(app.getControl().level).toBe(1)
    expect(app.state().level).toBe(1)

    unmount(app)
    flushSync()
    expect(el.querySelector('.tsmap-indoor-control')).toBeNull()
    el.remove()
  })
})
