import { afterEach, describe, expect, test } from 'bun:test'
import { control, IndoorMap, loadIMDF, searchIndoor, styles, Map, unzip } from '../src/core-map'
import { evaluate } from '../src/core-map/style-spec/expressions'

// A two-level terminal at SFO, in IMDF: a venue, two levels, a few units,
// a door, an amenity, and two occupants placed by anchors.
const square = (x: number, y: number, size = 0.0004): number[][][] => [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]]
const X = -122.3866
const Y = 37.6155
const feature = (id: string, type: string, geometry: any, properties: Record<string, any>) => ({ type: 'Feature', id, feature_type: type, geometry, properties })

const FILES = {
  venue: { features: [feature('v', 'venue', { type: 'Polygon', coordinates: square(X, Y, 0.002) }, { name: { en: 'SFO Terminal 2' }, category: 'airport' })] },
  level: { features: [
    feature('l0', 'level', { type: 'Polygon', coordinates: square(X, Y, 0.002) }, { ordinal: 0, name: { en: 'Arrivals' }, short_name: { en: '1' } }),
    feature('l1', 'level', { type: 'Polygon', coordinates: square(X, Y, 0.002) }, { ordinal: 1, name: { en: 'Departures' }, short_name: { en: '2' } }),
  ] },
  unit: { features: [
    feature('u-hall', 'unit', { type: 'Polygon', coordinates: square(X, Y) }, { level_id: 'l0', category: 'walkway', name: { en: 'Baggage Claim' } }),
    feature('u-cafe', 'unit', { type: 'Polygon', coordinates: square(X + 0.0005, Y + 0.0005) }, { level_id: 'l1', category: 'foodservice' }),
    feature('u-gate', 'unit', { type: 'Polygon', coordinates: square(X + 0.001, Y + 0.001) }, { level_id: 'l1', category: 'room' }),
    feature('u-wc', 'unit', { type: 'Polygon', coordinates: square(X + 0.0015, Y) }, { level_id: 'l1', category: 'restroom' }),
  ] },
  opening: { features: [feature('o1', 'opening', { type: 'LineString', coordinates: [[X, Y], [X + 0.0001, Y]] }, { level_id: 'l0', category: 'pedestrian' })] },
  amenity: { features: [feature('a-wc', 'amenity', { type: 'Point', coordinates: [X + 0.0017, Y + 0.0002] }, { unit_ids: ['u-wc'], category: 'restroom', name: { en: 'Restrooms' } })] },
  anchor: { features: [
    feature('an-cafe', 'anchor', { type: 'Point', coordinates: [X + 0.0007, Y + 0.0007] }, { unit_id: 'u-cafe' }),
    feature('an-gate', 'anchor', { type: 'Point', coordinates: [X + 0.0012, Y + 0.0012] }, { unit_id: 'u-gate' }),
  ] },
  occupant: { features: [
    feature('oc-cafe', 'occupant', null, { anchor_id: 'an-cafe', category: 'coffee', name: { en: 'Peet\'s Coffee' } }),
    feature('oc-gate', 'occupant', null, { anchor_id: 'an-gate', category: 'gate', name: { en: 'Gate D12' } }),
  ] },
}

/** A zip of the files, as an IMDF archive ships: stored, or deflated. */
async function zip(files: Record<string, unknown>, deflate: boolean): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(`imdf/${name}.geojson`)
    const raw = encoder.encode(JSON.stringify(content))
    const body = deflate ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : raw
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034B50, true)
    lv.setUint16(8, deflate ? 8 : 0, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    const entry = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(entry.buffer)
    cv.setUint32(0, 0x02014B50, true)
    cv.setUint16(10, deflate ? 8 : 0, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    entry.set(nameBytes, 46)
    parts.push(local, body)
    central.push(entry)
    offset += local.length + body.length
  }
  const dirSize = central.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054B50, true)
  ev.setUint16(8, central.length, true)
  ev.setUint16(10, central.length, true)
  ev.setUint32(12, dirSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + dirSize + 22)
  let at = 0
  for (const p of [...parts, ...central, end]) {
    out.set(p, at)
    at += p.length
  }
  return out
}

describe('loadIMDF', () => {
  test('reads the levels in order, their features, and the places to search', async () => {
    const venue = await loadIMDF(FILES)
    expect(venue.name).toBe('SFO Terminal 2')
    expect(venue.levels.map(l => [l.ordinal, l.name, l.shortName])).toEqual([[0, 'Arrivals', '1'], [1, 'Departures', '2']])
    expect(venue.features.get(0)!.map(f => f.feature_type).sort()).toEqual(['opening', 'unit'])
    expect(venue.features.get(1)!.map(f => f.feature_type).sort()).toEqual(['amenity', 'occupant', 'occupant', 'unit', 'unit', 'unit'])
    const names = venue.places.map(p => `${p.name}@${p.level}`).sort()
    expect(names).toEqual(['Baggage Claim@0', 'Gate D12@1', 'Peet\'s Coffee@1', 'Restrooms@1'])
  })

  test('reads a zip, stored or deflated', async () => {
    for (const deflate of [false, true]) {
      const bytes = await zip(FILES, deflate)
      expect([...(await unzip(bytes)).keys()]).toContain('imdf/venue.geojson')
      const venue = await loadIMDF(bytes)
      expect(venue.levels).toHaveLength(2)
    }
  })

  test('finds a gate or a shop by name', async () => {
    const venue = await loadIMDF(FILES)
    expect(searchIndoor(venue, 'gate d').map(p => p.name)).toEqual(['Gate D12'])
    expect(searchIndoor(venue, 'peet')[0]).toMatchObject({ name: 'Peet\'s Coffee', level: 1, levelName: 'Departures' })
    expect(searchIndoor(venue, '')).toEqual([])
  })
})

function makeMap(zoom: number): Map {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 430 })
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  document.body.appendChild(container)
  const map = new Map(container, { zoomAnimation: false, fadeAnimation: false })
  map.setView([Y + 0.001, X + 0.001], zoom)
  map.setStyle(styles.light({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf' }))
  return map
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('IndoorMap', () => {
  test('draws one level at a time, with a picker when close enough', async () => {
    const map = makeMap(17)
    const indoor = await new IndoorMap({ venue: FILES }).addTo(map).ready()
    map.fire('moveend')
    expect(indoor.visible).toBe(true)
    const ids = map.getStyle()!.layers.map(l => l.id)
    expect(ids).toEqual(expect.arrayContaining(['ts-maps-indoor-units', 'ts-maps-indoor-walls', 'ts-maps-indoor-openings', 'ts-maps-indoor-labels']))
    const buttons = [...map.getContainer().querySelectorAll<HTMLElement>('.tsmap-indoor-level')]
    expect(buttons.map(b => b.textContent)).toEqual(['2', '1'])
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true')
    const levels: number[] = []
    indoor.listen((type, e) => type === 'levelchange' && levels.push(e.level))
    buttons[0]!.click()
    expect(indoor.level).toBe(1)
    expect(levels).toEqual([1])
  })

  test('rooms are coloured by what they are', async () => {
    const map = makeMap(17)
    await new IndoorMap({ venue: FILES }).addTo(map).ready()
    const units = map.getStyle()!.layers.find(l => l.id === 'ts-maps-indoor-units')!
    const color = (category: string): unknown => evaluate((units.paint as any)['fill-color'], { zoom: 17, feature: { type: 3, properties: { category } } })
    expect(color('restroom')).toBe('#dbe8f6')
    expect(color('room')).toBe('#f3f1ec')
  })

  test('its plan takes the place of the building it is in while it shows', async () => {
    const map = makeMap(17)
    const indoor = await new IndoorMap({ venue: FILES }).addTo(map).ready()
    map.fire('moveend')
    expect([...(map as any)._scene3d.cleared.values()]).toEqual([indoor.venue!.bounds])
    map.setZoom(13)
    map.fire('moveend')
    expect((map as any)._scene3d.cleared.size).toBe(0)
    map.setZoom(17)
    map.fire('moveend')
    indoor.remove()
    expect((map as any)._scene3d.cleared.size).toBe(0)
  })

  test('sync follows level when it changes, not on every render', async () => {
    const map = makeMap(17)
    const indoor = await new IndoorMap({ venue: FILES }).addTo(map).ready()
    indoor.sync({ level: 1 })
    expect(indoor.level).toBe(1)
    indoor.setLevel(0)
    indoor.sync({ level: 1 })
    expect(indoor.level).toBe(0)
    indoor.sync({ level: 0 })
    indoor.sync({ level: 1 })
    expect(indoor.level).toBe(1)
  })

  test('hides itself zoomed out', async () => {
    const map = makeMap(13)
    const indoor = await new IndoorMap({ venue: FILES }).addTo(map).ready()
    map.fire('moveend')
    expect(indoor.visible).toBe(false)
    expect((map.getContainer().querySelector('.tsmap-indoor-control') as HTMLElement).style.display).toBe('none')
  })

  test('search finds the gate, and choosing it goes to its level', async () => {
    const map = makeMap(17)
    const indoor = await new IndoorMap({ venue: FILES }).addTo(map).ready()
    const search = control.search({ provider: null, offline: null, recents: false, saved: null }).addTo(map)
    indoor.connect(search)
    const [gate] = await search.engine.search('Gate D12')
    expect(gate).toMatchObject({ name: 'Gate D12', address: 'SFO Terminal 2 · Departures' })
    search.select(gate!)
    expect(indoor.level).toBe(1)
  })
})
