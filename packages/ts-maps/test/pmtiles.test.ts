import type { Entry, RangeResponse, Source } from '../src/core-map/pmtiles'
import { describe, expect, test } from 'bun:test'
import { VectorTile } from '../src/core-map/mvt'
import {
  BytesSource,
  Compression,
  decodeDirectory,
  encodeDirectory,
  FetchSource,
  findTile,
  parseHeader,
  PMTiles,
  PMTilesChangedError,
  PMTilesFormatError,
  serializeHeader,
  tileBounds,
  tileIdToZxy,
  TileType,
  writePMTiles,
  zxyToTileId,
} from '../src/core-map/pmtiles'
import { Pbf } from '../src/core-map/proto'
import { encodeTile, road } from './helpers/mvt'

/** A small pyramid z0..z3 where every tile names itself in a `tile` layer. */
function pyramid(maxZoom = 3, tag = ''): Array<{ z: number, x: number, y: number, data: Uint8Array }> {
  const tiles = []
  for (let z = 0; z <= maxZoom; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++)
        tiles.push({ z, x, y, data: encodeTile({ tile: [road({ id: `${z}/${x}/${y}${tag}` }, [0, 0], [4096, 4096])] }) })
    }
  }
  return tiles
}

function tileName(bytes: Uint8Array): unknown {
  return new VectorTile(new Pbf(bytes)).layers.tile!.feature(0).properties.id
}

/** A Source that counts reads, to prove caching and request coalescing. */
class CountingSource implements Source {
  reads: Array<[number, number]> = []
  constructor(private readonly inner: Source) {}
  getKey(): string {
    return 'counting'
  }

  getBytes(offset: number, length: number): Promise<RangeResponse> {
    this.reads.push([offset, length])
    return this.inner.getBytes(offset, length)
  }
}

describe('tile ids', () => {
  test('match the reference values from the PMTiles spec', () => {
    expect(zxyToTileId(0, 0, 0)).toBe(0)
    expect(zxyToTileId(1, 0, 0)).toBe(1)
    expect(zxyToTileId(1, 0, 1)).toBe(2)
    expect(zxyToTileId(1, 1, 1)).toBe(3)
    expect(zxyToTileId(1, 1, 0)).toBe(4)
    expect(zxyToTileId(2, 0, 0)).toBe(5)
    expect(zxyToTileId(3, 0, 0)).toBe(21)
    expect(zxyToTileId(20, 0, 0)).toBe(366503875925)
  })

  test('cover each zoom with one contiguous block, visiting neighbours in turn', () => {
    const ids = new Set<number>()
    let previous: [number, number] | undefined
    const byId: Array<[number, number]> = []
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const id = zxyToTileId(3, x, y)
        ids.add(id)
        byId[id - 21] = [x, y]
      }
    }
    expect([...ids].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => 21 + i))
    // Hilbert property: consecutive ids are adjacent tiles.
    for (const cell of byId) {
      if (previous)
        expect(Math.abs(cell[0] - previous[0]) + Math.abs(cell[1] - previous[1])).toBe(1)
      previous = cell
    }
  })

  test('round-trip through tileIdToZxy, up to zoom 26', () => {
    for (const [z, x, y] of [[0, 0, 0], [5, 17, 3], [14, 2620, 6332], [20, 1048575, 0], [26, 67108863, 67108863], [26, 12345678, 54321098]] as const)
      expect(tileIdToZxy(zxyToTileId(z, x, y))).toEqual([z, x, y])
    for (let i = 0; i < 2000; i++) {
      const z = Math.floor(Math.random() * 27)
      const x = Math.floor(Math.random() * 2 ** z)
      const y = Math.floor(Math.random() * 2 ** z)
      expect(tileIdToZxy(zxyToTileId(z, x, y))).toEqual([z, x, y])
    }
  })

  test('reject coordinates outside the grid', () => {
    expect(() => zxyToTileId(2, 4, 0)).toThrow(RangeError)
    expect(() => zxyToTileId(27, 0, 0)).toThrow(RangeError)
    expect(() => zxyToTileId(1, -1, 0)).toThrow(RangeError)
    expect(() => tileIdToZxy(-1)).toThrow(RangeError)
  })

  test('tileBounds gives the Web Mercator square', () => {
    const [w, s, e, n] = tileBounds(0, 0, 0)
    expect([w, e]).toEqual([-180, 180])
    expect(n).toBeCloseTo(85.0511, 3)
    expect(s).toBeCloseTo(-85.0511, 3)
  })
})

describe('header', () => {
  test('round-trips every field', async () => {
    const bytes = await writePMTiles(pyramid(1), { tileType: TileType.Mvt, bounds: [-122.5, 37.7, -122.3, 37.9], center: [-122.4, 37.8, 1] })
    const header = parseHeader(bytes)
    expect(parseHeader(serializeHeader(header))).toEqual(header)
    expect(header).toMatchObject({
      specVersion: 3,
      tileType: TileType.Mvt,
      tileCompression: Compression.Gzip,
      internalCompression: Compression.Gzip,
      minZoom: 0,
      maxZoom: 1,
      minLon: -122.5,
      maxLat: 37.9,
      centerLon: -122.4,
      clustered: true,
      numAddressedTiles: 5,
    })
  })

  test('refuses files that are not v3 archives', () => {
    expect(() => parseHeader(new Uint8Array(127))).toThrow(PMTilesFormatError)
    const v2 = new Uint8Array(127)
    v2.set([0x50, 0x4D, 2, 0])
    expect(() => parseHeader(v2)).toThrow(/version 2/)
    expect(() => parseHeader(new Uint8Array(10))).toThrow(/127 bytes/)
  })
})

describe('directories', () => {
  const entries: Entry[] = [
    { tileId: 0, offset: 0, length: 10, runLength: 1 },
    { tileId: 1, offset: 10, length: 20, runLength: 1 }, // contiguous, encoded as 0
    { tileId: 5, offset: 0, length: 10, runLength: 16 }, // deduplicated run
    { tileId: 40, offset: 900, length: 5, runLength: 0 }, // leaf pointer
  ]

  test('round-trip through the columnar varint encoding', () => {
    expect(decodeDirectory(encodeDirectory(entries))).toEqual(entries)
    expect(decodeDirectory(encodeDirectory([]))).toEqual([])
  })

  test('findTile resolves exact hits, runs, gaps and leaves', () => {
    expect(findTile(entries, 1)?.offset).toBe(10)
    expect(findTile(entries, 5 + 15)?.length).toBe(10) // last id of the run
    expect(findTile(entries, 21)).toBeUndefined() // just past the run
    expect(findTile(entries, 3)).toBeUndefined() // gap
    expect(findTile(entries, 1_000_000)?.runLength).toBe(0) // leaf covers the tail
  })

  test('reject truncated or absurd input', () => {
    const encoded = encodeDirectory(entries)
    expect(() => decodeDirectory(encoded.subarray(0, encoded.length - 2))).toThrow(/truncated/)
    expect(() => decodeDirectory(encoded.subarray(0, encoded.length - 1))).toThrow(/truncated/)
    expect(() => decodeDirectory(new Uint8Array([0xFF, 0xFF, 0x03]))).toThrow(/claims/)
  })
})

describe('PMTiles reader + writer', () => {
  test('reads back every tile and the metadata', async () => {
    const tiles = pyramid()
    const metadata = { name: 'Fixture', vector_layers: [{ id: 'tile', fields: { id: 'String' } }] }
    const archive = new PMTiles(new BytesSource(await writePMTiles(tiles, { tileType: TileType.Mvt, metadata })))
    expect(await archive.getMetadata()).toEqual(metadata)
    for (const { z, x, y } of tiles)
      expect(tileName((await archive.getTileData(z, x, y))!)).toBe(`${z}/${x}/${y}`)
    expect(await archive.getTile(4, 0, 0)).toBeUndefined()
    expect((await archive.getTile(2, 1, 1))!.compression).toBe(Compression.Gzip)
  })

  test('deduplicates bodies and run-length encodes neighbours that share one', async () => {
    const ocean = encodeTile({ water: [road({ kind: 'ocean' }, [0, 0], [10, 10])] })
    const tiles = [{ z: 0, x: 0, y: 0, data: encodeTile({ tile: [] }) }]
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++)
        tiles.push({ z: 2, x, y, data: ocean })
    }
    const bytes = await writePMTiles(tiles, { tileType: TileType.Mvt })
    const header = parseHeader(bytes)
    expect(header.numAddressedTiles).toBe(17)
    expect(header.numTileContents).toBe(2)
    expect(header.numTileEntries).toBe(2) // z0 + one run of 16
    const archive = new PMTiles(new BytesSource(bytes))
    expect(new VectorTile(new Pbf((await archive.getTileData(2, 3, 0))!)).layers.water!.length).toBe(1)
  })

  test('descends leaf directories, caching and coalescing their reads', async () => {
    const tiles = pyramid(4) // 341 tiles
    const source = new CountingSource(new BytesSource(await writePMTiles(tiles, { tileType: TileType.Mvt, leafSize: 16 })))
    const archive = new PMTiles(source)
    const header = await archive.getHeader()
    expect(header.leafDirectoryLength).toBeGreaterThan(0)

    // 16 concurrent reads of tiles under the same leaf: one leaf fetch.
    const sameLeaf = tiles.filter(t => t.z === 4).slice(0, 16)
    const results = await Promise.all(sameLeaf.map(t => archive.getTileData(t.z, t.x, t.y)))
    results.forEach((bytes, i) => expect(tileName(bytes!)).toBe(`4/${sameLeaf[i]!.x}/${sameLeaf[i]!.y}`))
    const inLeafSection = (offset: number): boolean => offset >= header.leafDirectoryOffset && offset < header.tileDataOffset
    const leafReads = source.reads.filter(([offset]) => inLeafSection(offset))
    expect(new Set(leafReads.map(([o]) => o)).size).toBe(leafReads.length)

    for (const { z, x, y } of tiles)
      expect(tileName((await archive.getTileData(z, x, y))!)).toBe(`${z}/${x}/${y}`)
  })

  test('entries() walks the whole index in id order, through leaves', async () => {
    const bytes = await writePMTiles(pyramid(3), { tileType: TileType.Mvt, leafSize: 7 })
    const archive = new PMTiles(new BytesSource(bytes))
    const ids: number[] = []
    for await (const entry of archive.entries()) {
      ids.push(entry.tileId)
      const [z, x, y] = tileIdToZxy(entry.tileId)
      expect(entry.offset).toBe((await archive.getTile(z, x, y))!.offset)
    }
    expect(ids).toEqual(Array.from({ length: 85 }, (_, i) => i))
  })

  test('grows into leaves on its own when the root would pass 16 KiB', async () => {
    // Incompressible-ish bodies so each entry costs real directory bytes.
    const tiles = []
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++)
        tiles.push({ z: 6, x, y, data: new Uint8Array([x, y, (x * 7 + y * 13) & 0xFF, x ^ y]) })
    }
    const bytes = await writePMTiles(tiles, { tileType: TileType.Png, internalCompression: Compression.None })
    const header = parseHeader(bytes)
    expect(header.rootDirectoryOffset + header.rootDirectoryLength).toBeLessThanOrEqual(16_384)
    expect(header.leafDirectoryLength).toBeGreaterThan(0)
    const archive = new PMTiles(new BytesSource(bytes))
    expect(Array.from((await archive.getTileData(6, 63, 62))!)).toEqual([63, 62, (63 * 7 + 62 * 13) & 0xFF, 63 ^ 62])
  })

  test('raster archives store bodies uncompressed by default', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 1, 2, 3])
    const archive = new PMTiles(new BytesSource(await writePMTiles([{ z: 0, x: 0, y: 0, data: png }], { tileType: TileType.Png })))
    expect((await archive.getHeader()).tileCompression).toBe(Compression.None)
    expect(await archive.getTileData(0, 0, 0)).toEqual(png)
  })

  test('the version changes when the archive does', async () => {
    const a = new PMTiles(new BytesSource(await writePMTiles(pyramid(1), { tileType: TileType.Mvt })))
    const b = new PMTiles(new BytesSource(await writePMTiles(pyramid(2), { tileType: TileType.Mvt })))
    expect(await a.getVersion()).toMatch(/^[0-9a-f]{16}$/)
    expect(await a.getVersion()).not.toBe(await b.getVersion())
  })

  test('a failed open is retried, not remembered', async () => {
    const bytes = await writePMTiles(pyramid(0), { tileType: TileType.Mvt })
    let fail = true
    const archive = new PMTiles({
      getKey: () => 'flaky',
      getBytes: async (offset, length) => {
        if (fail)
          throw new Error('network down')
        return { data: bytes.subarray(offset, offset + length) }
      },
    })
    await expect(archive.getHeader()).rejects.toThrow('network down')
    fail = false
    expect((await archive.getHeader()).maxZoom).toBe(0)
  })
})

describe('FetchSource', () => {
  /** A static host answering `Range` the way S3 / R2 do. */
  function host(state: { bytes: Uint8Array, etag: string, ignoreRange?: boolean }): { fetch: typeof fetch, ranges: string[] } {
    const ranges: string[] = []
    const fake = async (_input: unknown, init?: RequestInit): Promise<Response> => {
      const range = new Headers(init?.headers).get('Range')!
      ranges.push(range)
      if (state.ignoreRange)
        return new Response(state.bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'ETag': state.etag, 'Content-Length': String(state.bytes.length) } })
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range)!
      return new Response(state.bytes.slice(Number(a), Number(b) + 1) as Uint8Array<ArrayBuffer>, { status: 206, headers: { ETag: state.etag } })
    }
    return { fetch: fake as unknown as typeof fetch, ranges }
  }

  test('reads tiles with HTTP Range requests', async () => {
    const state = { bytes: await writePMTiles(pyramid(2), { tileType: TileType.Mvt }), etag: '"v1"' }
    const { fetch, ranges } = host(state)
    const archive = new PMTiles(new FetchSource('https://r2.example/basemap.pmtiles', { fetch }))
    expect(tileName((await archive.getTileData(2, 3, 1))!)).toBe('2/3/1')
    expect(ranges[0]).toBe('bytes=0-16383')
    expect(ranges.length).toBe(2) // root fetch + the tile; directory came with the root
  })

  test('copes with a host that ignores Range', async () => {
    const state = { bytes: await writePMTiles(pyramid(1), { tileType: TileType.Mvt }), etag: '"v1"', ignoreRange: true }
    const archive = new PMTiles(new FetchSource('https://static.example/a.pmtiles', { fetch: host(state).fetch }))
    expect(tileName((await archive.getTileData(1, 1, 0))!)).toBe('1/1/0')
  })

  test('reloads when the archive is replaced under it', async () => {
    const state = { bytes: await writePMTiles(pyramid(1), { tileType: TileType.Mvt }), etag: '"v1"' }
    const archive = new PMTiles(new FetchSource('https://r2.example/basemap.pmtiles', { fetch: host(state).fetch }), { revalidate: 0 })
    const before = await archive.getVersion()
    expect(tileName((await archive.getTileData(1, 0, 0))!)).toBe('1/0/0')

    // Same key, new build: z2 now exists and the old offsets mean nothing.
    // The old root has no z2 entries at all, so only revalidation finds them.
    state.bytes = await writePMTiles(pyramid(2), { tileType: TileType.Mvt })
    state.etag = '"v2"'
    expect(tileName((await archive.getTileData(2, 2, 2))!)).toBe('2/2/2')
    expect(await archive.getVersion()).not.toBe(before)
  })

  test('an ETag change seen on a tile read drops stale directories', async () => {
    const state = { bytes: await writePMTiles(pyramid(3), { tileType: TileType.Mvt, leafSize: 8 }), etag: '"v1"' }
    const archive = new PMTiles(new FetchSource('https://r2.example/basemap.pmtiles', { fetch: host(state).fetch }))
    expect(tileName((await archive.getTileData(3, 1, 1))!)).toBe('3/1/1')
    // A rebuild under the same URL: every body (and so every offset) moved.
    state.bytes = await writePMTiles(pyramid(3, ' rebuilt'), { tileType: TileType.Mvt, leafSize: 8 })
    state.etag = '"v2"'
    expect(tileName((await archive.getTileData(3, 1, 1))!)).toBe('3/1/1 rebuilt')
  })

  test('throws a typed error on an ETag mismatch, and a clear one on HTTP errors', async () => {
    const state = { bytes: new Uint8Array(100), etag: '"v2"' }
    const source = new FetchSource('https://r2.example/x', { fetch: host(state).fetch })
    await expect(source.getBytes(0, 10, undefined, '"v1"')).rejects.toBeInstanceOf(PMTilesChangedError)
    expect((await source.getBytes(0, 10, undefined, 'W/"v2"')).data.length).toBe(10)
    const missing = new FetchSource('https://r2.example/404', { fetch: (async () => new Response('no', { status: 404 })) as unknown as typeof fetch })
    await expect(missing.getBytes(0, 10)).rejects.toThrow(/HTTP 404/)
  })
})
