import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { IndoorMap, Map, Search } from '../src'

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

const roots: Array<{ root: ReturnType<typeof createRoot>, host: HTMLElement }> = []
afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
})

function mount(): { host: HTMLElement, render: (props: Record<string, unknown>, search?: Record<string, unknown>) => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push({ root, host })
  return {
    host,
    render: (props, search) => act(() => {
      root.render(createElement(Map, { center: [Y + 0.001, X + 0.001], zoom: 17, containerStyle: { width: '430px', height: '800px' } },
        search && createElement(Search, { provider: null, offline: null, recents: false, details: null, saved: null, ...search }),
        createElement(IndoorMap, { venue: VENUE, ...props } as any)))
    }),
  }
}

describe('@ts-maps/react IndoorMap', () => {
  test('follows level, and reports a level chosen on the picker', async () => {
    const { host, render } = mount()
    const levels: number[] = []
    let control: any
    const handlers = { onLevelChange: (e: any) => levels.push(e.level), onReady: (c: any) => (control = c) }
    render({ ...handlers, level: 0 })
    await act(() => control.ready())
    expect(control.venue.name).toBe('SFO Terminal 2')
    expect([...host.querySelectorAll('.tsmap-indoor-level')].map(b => b.textContent)).toEqual(['2', '1'])

    render({ ...handlers, level: 1 })
    expect(control.level).toBe(1)
    expect(levels).toEqual([1])

    host.querySelector<HTMLElement>('[data-level="0"]')!.click()
    expect(control.level).toBe(0)
    expect(levels).toEqual([1, 0])
  })

  test('connects to search, so choosing a gate goes to its level', async () => {
    const { render } = mount()
    let search: any
    let control: any
    const searchProps = { onReady: (c: any) => (search = c) }
    render({ onReady: (c: any) => (control = c) }, searchProps)
    render({ search }, searchProps)
    await act(() => control.ready())
    expect(control.level).toBe(0)

    const [gate] = await search.engine.search('Gate D12')
    expect(gate).toMatchObject({ name: 'Gate D12', address: 'SFO Terminal 2 · Departures' })
    act(() => search.select(gate))
    expect(control.level).toBe(1)
  })
})
