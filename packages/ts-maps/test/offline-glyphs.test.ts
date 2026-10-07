import { describe, expect, test } from 'bun:test'
import { labelGlyphRanges, MemoryOfflineStore, OfflineMaps, planArea } from '../src/core-map/offline'
import { labelKeys, latToUnit, lngToUnit, unitToLat, unitToLng } from '../src/core-map/offline/plan'
import { encodeTile } from './helpers/mvt'

// Sofia, at the zoom OpenMapTiles publishes its full detail. Its names are
// Cyrillic, which the Latin glyph ranges every download keeps do not cover.
const Z = 14
const X = Math.floor(lngToUnit(23.32) * 2 ** Z)
const Y = Math.floor(latToUnit(42.69) * 2 ** Z)
const at = (px: number, py: number): { lat: number, lng: number } => ({ lat: unitToLat((Y + py / 4096) / 2 ** Z), lng: unitToLng((X + px / 4096) / 2 ** Z) })
const BOUNDS: [number, number, number, number] = [at(1000, 3000).lng, at(1000, 3000).lat, at(3000, 1000).lng, at(3000, 1000).lat]

function sofiaTile(): Uint8Array {
  return encodeTile({
    place: [{ type: 1, props: { 'name': 'София', 'name:latin': 'Sofia', 'class': 'city' }, lines: [[[2000, 2000]]] }],
    poi: [{ type: 1, props: { 'name': 'مقهى', 'name:latin': 'Maqha', 'class': 'cafe' }, lines: [[[2100, 2100]]] }],
    transportation_name: [{ type: 2, props: { name: 'Vitosha – Boulevard', class: 'primary' }, lines: [[[500, 1000], [3500, 1000]]] }],
  })
}

const GLYPHS = 'https://fonts.test/{fontstack}/{range}.pbf'

/** Enough of a map for planning: a style with a glyph server, and no tile layers of its own. */
function styledMap(layers: unknown[]): unknown {
  return { _style: { spec: { version: 8, glyphs: GLYPHS, sources: {}, layers } }, eachLayer: () => {} }
}

const LABELS = [
  { id: 'place', type: 'symbol', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'] } },
  { id: 'poi', type: 'symbol', layout: { 'text-field': '{name}', 'text-font': ['Noto Sans Regular'] } },
]

describe('glyph ranges for an offline area', () => {
  test('the label keys come from the style', () => {
    expect(labelKeys(LABELS)).toEqual(['name'])
    expect(labelKeys([{ type: 'symbol', layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']] } }])).toEqual(['name:en', 'name'])
    expect(labelKeys([])).toEqual(['name'])
  })

  test('a tile names the blocks its labels need, Latin and punctuation aside', () => {
    expect([...labelGlyphRanges(sofiaTile(), ['name'])].sort((a, b) => a - b)).toEqual([1024, 1536])
    // Read from the key the style labels with, not every name in every language.
    expect([...labelGlyphRanges(sofiaTile(), ['name:latin'])]).toEqual([])
  })

  test('planning keeps the Latin ranges and any asked for', () => {
    const planned = planArea({ bounds: BOUNDS, minZoom: 14, maxZoom: 14, map: styledMap(LABELS), sources: [{ url: 'https://tiles.test/{z}/{x}/{y}.pbf', maxZoom: 14 }], glyphRanges: [0x0E00] })
    const urls = planned.build().urls.filter(u => u.startsWith('https://fonts.test'))
    expect(urls).toEqual([0, 256, 3584, 8192].map(r => `https://fonts.test/Noto%20Sans%20Regular/${r}-${r + 255}.pbf`))
  })

  test('a download fetches the ranges its names need, and keeps them with the region', async () => {
    const requests: string[] = []
    const maps = new OfflineMaps({
      store: new MemoryOfflineStore(),
      fetch: async (url: string) => {
        requests.push(url)
        return url.startsWith('https://fonts.test')
          ? new Response(new Uint8Array([1, 2, 3]) as unknown as BodyInit, { headers: { 'content-type': 'application/x-protobuf' } })
          : new Response(sofiaTile() as unknown as BodyInit, { headers: { 'content-type': 'application/x-protobuf' } })
      },
    })
    const region = await maps.download({ bounds: BOUNDS, minZoom: 14, maxZoom: 14, map: styledMap(LABELS), sources: [{ url: 'https://tiles.test/{z}/{x}/{y}.pbf', maxZoom: 14 }] })
    expect(region.status).toBe('complete')
    const glyphs = requests.filter(u => u.startsWith('https://fonts.test')).map(u => u.split('/').pop())
    expect(glyphs).toEqual(['0-255.pbf', '256-511.pbf', '8192-8447.pbf', '1024-1279.pbf', '1536-1791.pbf'])
    expect(region.tiles).toBe(region.downloaded)
    // Read back offline like any other file of the region.
    expect(await maps.lookup('https://fonts.test/Noto%20Sans%20Regular/1024-1279.pbf')).toBeDefined()
    // And deleted with it.
    await maps.delete(region.id)
    expect(await maps.lookup('https://fonts.test/Noto%20Sans%20Regular/1024-1279.pbf')).toBeUndefined()
  })
})
