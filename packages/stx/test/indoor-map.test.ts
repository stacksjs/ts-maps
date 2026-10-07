import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { TsMap } from 'ts-maps'
import { mountChildren } from '../src/runtime'

// A two-level terminal in IMDF: a venue, its levels, and a gate on the upper one.
const X = -122.3866
const Y = 37.6155
const square = (x: number, y: number, size = 0.002): number[][][] => [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]]
const feature = (id: string, type: string, geometry: any, properties: Record<string, any>) => ({ type: 'Feature', id, feature_type: type, geometry, properties })
const VENUE: Record<string, unknown> = {
  venue: { features: [feature('v', 'venue', { type: 'Polygon', coordinates: square(X, Y) }, { name: { en: 'SFO Terminal 2' }, category: 'airport' })] },
  level: { features: [
    feature('l0', 'level', { type: 'Polygon', coordinates: square(X, Y) }, { ordinal: 0, name: { en: 'Arrivals' }, short_name: { en: '1' } }),
    feature('l1', 'level', { type: 'Polygon', coordinates: square(X, Y) }, { ordinal: 1, name: { en: 'Departures' }, short_name: { en: '2' } }),
  ] },
  unit: { features: [feature('u-gate', 'unit', { type: 'Polygon', coordinates: square(X + 0.001, Y + 0.001, 0.0004) }, { level_id: 'l1', category: 'room' })] },
  anchor: { features: [feature('an-gate', 'anchor', { type: 'Point', coordinates: [X + 0.0012, Y + 0.0012] }, { unit_id: 'u-gate' })] },
  occupant: { features: [feature('oc-gate', 'occupant', null, { anchor_id: 'an-gate', category: 'gate', name: { en: 'Gate D12' } })] },
}

// The venue as a folder of its files, served at https://venues.test/sfo/.
const original = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = (async (url: string) => {
    const name = /^https:\/\/venues\.test\/sfo\/(\w+)\.geojson$/.exec(String(url))?.[1]
    return name && VENUE[name] ? new Response(JSON.stringify(VENUE[name])) : new Response('', { status: 404 })
  }) as any
})
afterAll(() => {
  globalThis.fetch = original
})
afterEach(() => {
  document.body.replaceChildren()
})

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0))

describe('indoor-map child', () => {
  test('loads the venue from its URL, follows level, reports through DOM events, and links to Search', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const mapEl = document.createElement('div')
    mapEl.style.width = '430px'
    mapEl.style.height = '800px'
    root.appendChild(mapEl)
    const map = new TsMap(mapEl, { center: [Y + 0.001, X + 0.001], zoom: 17 })

    // The indoor map written before Search: they are linked all the same.
    const options = { venue: 'https://venues.test/sfo/', level: 0 }
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="indoor-map" data-options='${JSON.stringify(options)}'></span>`)
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="search" data-options='${JSON.stringify({ recents: false })}'></span>`)
    const el = root.querySelector('[data-ts-map-child="indoor-map"]')!

    let control: any = null
    let search: any = null
    const seen: Array<[string, unknown]> = []
    root.addEventListener('indoor:ready', (e: any) => { control = e.detail.control })
    // A live provider cannot come from markup: the page hands over none, so
    // search asks only the map.
    root.addEventListener('search:ready', (e: any) => {
      search = e.detail.control
      search.sync({ provider: null, offline: null, details: null, saved: null })
    })
    root.addEventListener('indoor:load', (e: any) => seen.push(['load', e.detail.venue.name]))
    root.addEventListener('indoor:levelchange', (e: any) => seen.push(['levelchange', e.detail.level]))

    const unmount = mountChildren(map, root)
    expect(control).not.toBeNull()
    await control.ready()
    expect(seen).toEqual([['load', 'SFO Terminal 2']])
    expect([...root.querySelectorAll('.tsmap-indoor-level')].map(b => b.textContent)).toEqual(['2', '1'])

    el.setAttribute('data-options', JSON.stringify({ ...options, level: 1 }))
    await tick()
    expect(control.level).toBe(1)
    expect(seen).toContainEqual(['levelchange', 1])

    ;(root.querySelector('[data-level="0"]') as HTMLElement).click()
    expect(seen).toContainEqual(['levelchange', 0])

    const [gate] = await search.engine.search('Gate D12')
    expect(gate).toMatchObject({ name: 'Gate D12', address: 'SFO Terminal 2 · Departures' })
    search.select(gate)
    expect(control.level).toBe(1)

    // Another language makes the control again, still found by search.
    const first = control
    el.setAttribute('data-options', JSON.stringify({ ...options, level: 1, language: 'fr' }))
    await tick()
    expect(control).not.toBe(first)
    await control.ready()
    expect(control.level).toBe(1)
    expect(root.querySelectorAll('.tsmap-indoor-control')).toHaveLength(1)
    expect((await search.engine.search('Gate D12')).map((p: any) => p.name)).toEqual(['Gate D12'])

    unmount()
    expect(root.querySelector('.tsmap-indoor-control')).toBeNull()
  })
})
