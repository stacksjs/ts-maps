import type { Style as StyleSpecification } from '../src/core-map/style-spec/types'
import { describe, expect, test } from 'bun:test'
import { mercatorX, mercatorY, renderStaticMap, staticMapSvg, staticMapView, staticMapZoom } from '../src/core-map/static'
import { encodeTile } from './helpers/mvt'

// One z0 tile covering the world, drawn 512px square: style zoom 0.
const world = { left: 0, top: 0, scale: 512 }

const tile = encodeTile({
  water: [
    { type: 3, props: { class: 'ocean' }, lines: [[[0, 0], [2048, 0], [2048, 4096], [0, 4096], [0, 0]]] },
    { type: 3, props: { class: 'lake' }, lines: [[[3000, 3000], [3500, 3000], [3500, 3500], [3000, 3000]]] },
  ],
  transportation: [
    { type: 2, props: { class: 'primary' }, lines: [[[2200, 100], [2200, 4000]]] },
  ],
  place: [
    { type: 1, props: { class: 'town', name: 'Del Mar' }, lines: [[[3000, 1000]]] },
    { type: 1, props: { class: 'town', name: 'Hidden' }, lines: [[[3000, 1004]]] },
  ],
})

function style(): StyleSpecification {
  return {
    version: 8,
    sources: { basemap: { type: 'vector', tiles: ['https://tiles.test/{z}/{x}/{y}.pbf'], maxzoom: 14, attribution: '&copy; <a href="https://osm.org">OpenStreetMap</a>' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#0b1220' } },
      { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', filter: ['==', ['get', 'class'], 'ocean'], paint: { 'fill-color': '#0b1a2b' } },
      { id: 'road', type: 'line', source: 'basemap', 'source-layer': 'transportation', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#3d4c63', 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 3, 10, 13] } },
      { id: 'place', type: 'symbol', source: 'basemap', 'source-layer': 'place', layout: { 'text-field': ['get', 'name'], 'text-size': 14, 'text-font': ['Geist Semibold'], 'text-padding': 4 }, paint: { 'text-color': '#cbd5e1', 'text-halo-color': '#0b1220', 'text-halo-width': 1.5 } },
    ],
  } as unknown as StyleSpecification
}

const fetchTile = async (url: string) => {
  expect(url).toBe('https://tiles.test/0/0/0.pbf')
  return new Response(tile as BodyInit)
}

describe('renderStaticMap', () => {
  test('draws the style in order as vector SVG', async () => {
    const map = await renderStaticMap({ style: style(), width: 512, height: 512, view: world, fetch: fetchTile })
    expect(map.tiles).toBe(1)
    expect(map.zoom).toBe(0)
    expect(map.attribution).toBe('© OpenStreetMap')

    const { markup } = map
    expect(markup).toStartWith('<defs><clipPath')
    expect(markup).toContain('<rect width="512" height="512" fill="#0b1220"/>')
    // The ocean passes the filter; the lake does not.
    expect(markup).toContain('fill="#0b1a2b" d="M0 0L256 0L256 512L0 512L0 0Z"')
    expect(markup).not.toContain('M375 375')
    // The line width is the style's own zoom ramp, evaluated at zoom 0.
    expect(markup).toContain('stroke="#3d4c63" stroke-width="3" stroke-linecap="round"')
    // Labels: the weight comes out of the font name, and of two labels in the
    // same spot only the first is kept.
    expect(markup).toContain('>Del Mar</text>')
    expect(markup).toContain('font-weight="600"')
    expect(markup).toContain('paint-order="stroke"')
    expect(markup).not.toContain('>Hidden<')
    expect(markup.indexOf('fill="#0b1220"')).toBeLessThan(markup.indexOf('fill="#0b1a2b"'))
    expect(markup.indexOf('stroke="#3d4c63"')).toBeLessThan(markup.indexOf('>Del Mar<'))

    const svg = staticMapSvg(map, 512, 512)
    expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"')
  })

  test('moves a label off a route it would sit under, and names route places first', async () => {
    // Del Mar's point is at (375, 125). A route straight through it.
    const route: Array<[number, number]> = [[375, 20], [375, 230]]
    const map = await renderStaticMap({ style: style(), width: 512, height: 512, view: world, fetch: fetchTile, avoid: [route] })
    const match = map.markup.match(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)"[^>]*>Del Mar<\/text>/)
    expect(match).not.toBeNull()
    expect(match![3]).not.toBe('middle')
  })

  test('leaves labels out when asked', async () => {
    const map = await renderStaticMap({ style: style(), width: 512, height: 512, view: world, fetch: fetchTile, labels: false })
    expect(map.markup).not.toContain('<text')
  })

  test('resolves a TileJSON source and survives a failed tile', async () => {
    const spec = style()
    spec.sources.basemap = { type: 'vector', url: 'https://tiles.test/tiles.json' } as never
    const map = await renderStaticMap({
      style: spec,
      width: 512,
      height: 512,
      view: world,
      fetch: async url => url.endsWith('tiles.json')
        ? Response.json({ tiles: ['https://tiles.test/{z}/{x}/{y}.pbf'], maxzoom: 14, attribution: 'OpenFreeMap' })
        : new Response('gone', { status: 404 }),
    })
    expect(map.tiles).toBe(0)
    expect(map.attribution).toBe('OpenFreeMap')
    expect(map.markup).toContain('fill="#0b1220"')
  })

  test('fits points into a view, north up', () => {
    const points = [{ lat: 32.94, lng: -117.26 }, { lat: 32.76, lng: -117.25 }]
    const view = staticMapView(points, 464, 486, 60)!
    const px = (p: { lat: number, lng: number }) => [(mercatorX(p.lng) - view.left) * view.scale, (mercatorY(p.lat) - view.top) * view.scale]
    const [north, south] = points.map(px)
    expect(north![1]).toBeCloseTo(60, 0)
    expect(south![1]).toBeCloseTo(486 - 60, 0)
    expect(north![1]).toBeLessThan(south![1])
    expect(staticMapZoom(view)).toBeGreaterThan(9)
    expect(staticMapView([], 100, 100)).toBeNull()
  })
})
