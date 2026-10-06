import type { TileJSON, TileServer } from '../src/server'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { VectorTile } from '../src/core-map/mvt'
import { Pbf } from '../src/core-map/proto'
import { acceptsEncoding, BytesSource, createTileServer, TileType, writePMTiles } from '../src/server'
import { encodeTile, road } from './helpers/mvt'

// Tiles z0..z5 around San Francisco, plus the world tiles above them, so the
// archive has real bounds to be inside or outside of.
const SF = { lon: -122.42, lat: 37.77 }
function lonLatToTile(z: number): [number, number] {
  const n = 2 ** z
  const rad = SF.lat * Math.PI / 180
  return [Math.floor((SF.lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n)]
}

function fixtureTiles(label: string): Array<{ z: number, x: number, y: number, data: Uint8Array }> {
  const tiles = []
  for (let z = 0; z <= 5; z++) {
    const [x, y] = lonLatToTile(z)
    tiles.push({
      z,
      x,
      y,
      data: encodeTile({
        water: [road({ class: 'ocean' }, [0, 0], [4096, 4096])],
        transportation: [road({ class: 'primary', label }, [0, 2048], [4096, 2048])],
      }),
    })
  }
  return tiles
}

const metadata = {
  name: 'Fixture basemap',
  attribution: '© OpenStreetMap contributors',
  vector_layers: [{ id: 'water', fields: { class: 'String' } }, { id: 'transportation', fields: { class: 'String' } }],
}

let dir: string
let path: string
let server: TileServer
let tileJSON: TileJSON
const [x5, y5] = lonLatToTile(5)

const get = (url: string, init?: RequestInit): Promise<Response> => server.fetch(new Request(`http://maps.test${url}`, init))
const versioned = (z: number, x: number, y: number, ext = 'pbf'): string => {
  const version = new URL(tileJSON.tiles[0]!.replace('{z}/{x}/{y}.pbf', 'tile')).searchParams.get('v')
  return `/tiles/${z}/${x}/${y}.${ext}?v=${version}`
}

function layersOf(bytes: Uint8Array): string[] {
  return Object.keys(new VectorTile(new Pbf(bytes)).layers).sort()
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ts-maps-tiles-'))
  path = join(dir, 'basemap.pmtiles')
  await Bun.write(path, await writePMTiles(fixtureTiles('v1'), {
    tileType: TileType.Mvt,
    metadata,
    bounds: [-123, 37, -122, 38.5],
    center: [-122.42, 37.77, 5],
  }))
  server = createTileServer({ archive: path, basePath: '/tiles/', open: { watch: 0 }, onError: () => {} })
  tileJSON = await (await get('/tiles/tiles.json')).json() as TileJSON
})

afterAll(async () => {
  await server.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('TileJSON', () => {
  test('describes the archive the way MapLibre and OpenFreeMap clients expect', () => {
    expect(tileJSON).toMatchObject({
      tilejson: '3.0.0',
      name: 'Fixture basemap',
      attribution: '© OpenStreetMap contributors',
      scheme: 'xyz',
      minzoom: 0,
      maxzoom: 5,
      bounds: [-123, 37, -122, 38.5],
      center: [-122.42, 37.77, 5],
      format: 'pbf',
      vector_layers: metadata.vector_layers,
    })
    expect(tileJSON.tiles[0]).toMatch(/^http:\/\/maps\.test\/tiles\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=[0-9a-f]{16}$/)
  })

  test('is served at the base path too, with a short cache and CORS', async () => {
    const res = await get('/tiles')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect((await res.json() as TileJSON).tiles).toEqual(tileJSON.tiles)
  })

  test('uses publicUrl and overrides when given', async () => {
    const behindCdn = createTileServer({ archive: server.archive, basePath: '/tiles', publicUrl: 'https://tiles.example.com/v1/', attribution: 'Mine' })
    const doc = await behindCdn.tileJSON()
    expect(doc.tiles[0]).toStartWith('https://tiles.example.com/v1/{z}/{x}/{y}.pbf?v=')
    expect(doc.attribution).toBe('Mine')
  })
})

describe('tiles', () => {
  test('passes stored gzip through to clients that accept it', async () => {
    const res = await get(versioned(5, x5, y5), { headers: { 'Accept-Encoding': 'br, gzip' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/vnd.mapbox-vector-tile')
    expect(res.headers.get('Content-Encoding')).toBe('gzip')
    expect(res.headers.get('Vary')).toBe('Accept-Encoding')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('ETag')).toMatch(/-gzip"$/)
    const body = new Uint8Array(await res.arrayBuffer())
    expect(layersOf(gunzipSync(body))).toEqual(['transportation', 'water'])
  })

  test('inflates for clients that do not accept gzip', async () => {
    const res = await get(versioned(5, x5, y5), { headers: { 'Accept-Encoding': 'gzip;q=0, identity' } })
    expect(res.headers.get('Content-Encoding')).toBeNull()
    expect(layersOf(new Uint8Array(await res.arrayBuffer()))).toEqual(['transportation', 'water'])
  })

  test('caches unversioned URLs briefly, and answers 304 to a matching ETag', async () => {
    const res = await get(`/tiles/5/${x5}/${y5}.pbf`)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600, stale-while-revalidate=86400')
    const again = await get(`/tiles/5/${x5}/${y5}.pbf`, { headers: { 'If-None-Match': `W/${res.headers.get('ETag')}` } })
    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
  })

  test('404 outside the bounds or the zoom range, so clients overzoom', async () => {
    // The z5 neighbour east of San Francisco lies wholly east of the bounds.
    expect((await get(versioned(5, x5 + 1, y5))).status).toBe(404)
    expect((await get('/tiles/6/0/0.pbf')).status).toBe(404)
    const [x4, y4] = lonLatToTile(4)
    expect((await get(`/tiles/4/${x4}/${y4}.pbf`)).status).toBe(200)
  })

  test('validates the path', async () => {
    expect((await get('/tiles/2/4/0.pbf')).status).toBe(400)
    expect((await get(`/tiles/5/${x5}/${y5}.png`)).status).toBe(404)
    expect((await get('/tiles/5/x/1.pbf')).status).toBe(404)
    expect(await server.handle(new Request('http://maps.test/api/trails'))).toBeUndefined()
    expect((await get('/elsewhere')).status).toBe(404)
  })

  test('answers preflight, HEAD, and refuses writes', async () => {
    const preflight = await get('/tiles/tiles.json', { method: 'OPTIONS' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    const head = await get(versioned(5, x5, y5), { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } })
    expect(head.status).toBe(200)
    expect(Number(head.headers.get('Content-Length'))).toBeGreaterThan(0)
    expect(await head.text()).toBe('')
    expect((await get(versioned(5, x5, y5), { method: 'POST' })).status).toBe(405)
  })
})

describe('empty tiles', () => {
  test('a tile the archive skipped inside its bounds is 204, not 404', async () => {
    const world = createTileServer({
      archive: new BytesSource(await writePMTiles(
        [{ z: 0, x: 0, y: 0, data: encodeTile({ water: [] }) }, { z: 1, x: 0, y: 0, data: encodeTile({ water: [] }) }],
        { tileType: TileType.Mvt, bounds: [-180, -85, 180, 85] },
      )),
    })
    const res = await world.fetch(new Request('http://maps.test/1/1/1.pbf'))
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect((await world.fetch(new Request('http://maps.test/1/0/0.pbf'))).status).toBe(200)
  })
})

describe('raster archives', () => {
  test('serve images with their own content type and extension', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 7])
    const raster = createTileServer({ archive: new BytesSource(await writePMTiles([{ z: 0, x: 0, y: 0, data: png }], { tileType: TileType.Png })) })
    const res = await raster.fetch(new Request('http://maps.test/0/0/0.png', { headers: { 'Accept-Encoding': 'gzip' } }))
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Content-Encoding')).toBeNull()
    expect(res.headers.get('Vary')).toBeNull()
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png)
    expect((await raster.tileJSON('https://x.test')).vector_layers).toBeUndefined()
    expect((await raster.fetch(new Request('http://maps.test/0/0/0.pbf'))).status).toBe(404)
  })
})

describe('archive replacement', () => {
  test('a rebuilt archive renamed into place is served without a restart', async () => {
    const before = tileJSON.tiles[0]
    const next = join(dir, 'next.pmtiles')
    await Bun.write(next, await writePMTiles(fixtureTiles('v2'), { tileType: TileType.Mvt, metadata, bounds: [-123, 37, -122, 38.5] }))
    renameSync(next, path)

    const res = await get(`/tiles/5/${x5}/${y5}.pbf`)
    const tile = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())))
    expect(tile.layers.transportation!.feature(0).properties.label).toBe('v2')
    const doc = await (await get('/tiles/tiles.json')).json() as TileJSON
    expect(doc.tiles[0]).not.toBe(before)
    tileJSON = doc
  })
})

describe('over a real socket', () => {
  test('works as Bun.serve({ fetch })', async () => {
    const http = Bun.serve({ port: 0, fetch: server.fetch })
    try {
      const doc = await (await fetch(`${http.url}tiles/tiles.json`)).json() as TileJSON
      const url = doc.tiles[0]!.replace('{z}', '5').replace('{x}', String(x5)).replace('{y}', String(y5))
      expect(url.startsWith(`${http.url}tiles/5/`)).toBe(true)
      const res = await fetch(url) // fetch sends Accept-Encoding: gzip and inflates for us
      expect(res.status).toBe(200)
      expect(layersOf(new Uint8Array(await res.arrayBuffer()))).toEqual(['transportation', 'water'])
    }
    finally {
      http.stop(true)
    }
  })
})

describe('acceptsEncoding', () => {
  test('follows q-values and wildcards', () => {
    expect(acceptsEncoding('gzip, deflate, br', 'gzip')).toBe(true)
    expect(acceptsEncoding('br;q=1.0, gzip;q=0.8', 'gzip')).toBe(true)
    expect(acceptsEncoding('gzip;q=0', 'gzip')).toBe(false)
    expect(acceptsEncoding('*', 'gzip')).toBe(true)
    expect(acceptsEncoding('*, gzip;q=0', 'gzip')).toBe(false)
    expect(acceptsEncoding('identity', 'gzip')).toBe(false)
    expect(acceptsEncoding(null, 'gzip')).toBe(false)
  })
})
