import { describe, expect, test } from 'bun:test'
import { Pbf } from '../src/core-map/proto'
import { VectorTile } from '../src/core-map/mvt'
import type { VectorTileValue } from '../src/core-map/mvt'

// ---------- fixture helpers ----------
//
// The tests fabricate MVT tiles using the Pbf writer rather than shipping
// pre-encoded fixture bytes. This keeps the test corpus readable and lets
// us exercise the writer+reader pair end-to-end.

// Zigzag-encode a signed integer to the unsigned form used on the wire.
function zz(n: number): number {
  return (n << 1) ^ (n >> 31)
}

// Encode a Value message body (no length prefix — use inside writeMessage).
function writeValueBody(value: VectorTileValue, pbf: Pbf): void {
  if (typeof value === 'string')
    pbf.writeStringField(1, value)
  else if (typeof value === 'number') {
    // Write as double for lossless round-trip.
    pbf.writeDoubleField(3, value)
  }
  else if (typeof value === 'boolean')
    pbf.writeBooleanField(7, value)
  // null → empty message (all fields absent, which decodes to null).
}

// Build a Feature message body given a command stream, geom type, tags, and
// an optional id.
function writeFeatureBody(
  geomType: number,
  tags: number[],
  geometry: number[],
  id: number | undefined,
  pbf: Pbf,
): void {
  if (id !== undefined)
    pbf.writeVarintField(1, id)
  if (tags.length > 0)
    pbf.writePackedVarint(2, tags)
  pbf.writeVarintField(3, geomType)
  if (geometry.length > 0)
    pbf.writePackedVarint(4, geometry)
}

// A command word: (cmd_id & 0x7) | (count << 3).
function cmd(cmdId: number, count: number): number {
  return (cmdId & 0x7) | (count << 3)
}

// Fabricate a square ring starting at (x0, y0) with width/height `size`,
// wound clockwise (the MVT outer-ring convention). Returns the raw command
// stream as a packed-uint32 array.
function clockwiseSquare(x0: number, y0: number, size: number): number[] {
  // MoveTo (x0, y0), LineTo (x0+size, y0), (x0+size, y0+size), (x0, y0+size),
  // ClosePath. Coordinates are cursor deltas (zigzagged).
  return [
    cmd(1, 1), zz(x0), zz(y0),
    cmd(2, 3),
    zz(size), zz(0),
    zz(0), zz(size),
    zz(-size), zz(0),
    cmd(7, 1),
  ]
}

interface LayerFixture {
  name: string
  extent?: number
  version?: number
  keys: string[]
  values: VectorTileValue[]
  features: {
    id?: number
    type: 1 | 2 | 3
    tags: number[]
    geometry: number[]
  }[]
}

function encodeLayer(layer: LayerFixture, pbf: Pbf): void {
  pbf.writeVarintField(15, layer.version ?? 2)
  pbf.writeStringField(1, layer.name)
  // Features
  for (const f of layer.features) {
    pbf.writeMessage(2, (feat, p) => {
      writeFeatureBody(feat.type, feat.tags, feat.geometry, feat.id, p)
    }, f)
  }
  // Keys
  for (const k of layer.keys)
    pbf.writeStringField(3, k)
  // Values
  for (const v of layer.values) {
    pbf.writeMessage(4, (val, p) => writeValueBody(val, p), v)
  }
  pbf.writeVarintField(5, layer.extent ?? 4096)
}

function encodeTile(layers: LayerFixture[]): Uint8Array {
  const pbf = new Pbf()
  for (const layer of layers) {
    pbf.writeMessage(3, (l, p) => encodeLayer(l, p), layer)
  }
  return pbf.finish()
}

// ---------- tests ----------

describe('VectorTile: single-layer polygon', () => {
  test('decodes a one-feature water layer with properties and geometry', () => {
    const bytes = encodeTile([
      {
        name: 'water',
        extent: 4096,
        keys: ['name', 'class'],
        values: ['Ocean', 'sea'],
        features: [
          {
            id: 42,
            type: 3,
            tags: [0, 0, 1, 1], // name=Ocean, class=sea
            geometry: clockwiseSquare(10, 20, 100),
          },
        ],
      },
    ])

    const tile = new VectorTile(new Pbf(bytes))
    expect(Object.keys(tile.layers)).toEqual(['water'])

    const water = tile.layers.water
    expect(water.name).toBe('water')
    expect(water.extent).toBe(4096)
    expect(water.version).toBe(2)
    expect(water.length).toBe(1)

    const feat = water.feature(0)
    expect(feat.id).toBe(42)
    expect(feat.type).toBe(3)
    expect(feat.extent).toBe(4096)
    expect(feat.properties.name).toBe('Ocean')
    expect(feat.properties.class).toBe('sea')

    const geom = feat.loadGeometry()
    expect(geom.length).toBe(1)
    const ring = geom[0]
    // 4 corners + ClosePath duplicate.
    expect(ring.length).toBe(5)
    expect(ring[0].x).toBe(10)
    expect(ring[0].y).toBe(20)
    expect(ring[1].x).toBe(110)
    expect(ring[1].y).toBe(20)
    expect(ring[2].x).toBe(110)
    expect(ring[2].y).toBe(120)
    expect(ring[3].x).toBe(10)
    expect(ring[3].y).toBe(120)
    expect(ring[4].x).toBe(10) // closed
    expect(ring[4].y).toBe(20)

    const bb = feat.bbox()
    expect(bb).toEqual([10, 20, 110, 120])
  })

  test('toGeoJSON produces valid coords at z=0', () => {
    const bytes = encodeTile([
      {
        name: 'water',
        keys: ['name'],
        values: ['Ocean'],
        features: [
          {
            type: 3,
            tags: [0, 0],
            geometry: clockwiseSquare(1024, 1024, 512),
          },
        ],
      },
    ])
    const tile = new VectorTile(new Pbf(bytes))
    const gj = tile.layers.water.feature(0).toGeoJSON(0, 0, 0)

    expect(gj.type).toBe('Feature')
    expect(gj.properties.name).toBe('Ocean')
    expect(gj.geometry.type).toBe('Polygon')

    const coords = (gj.geometry as { coordinates: [number, number][][] }).coordinates
    expect(coords[0]).toBeDefined()
    expect(coords[0].length).toBe(5)
    const [lng, lat] = coords[0][0]
    // Tile 0/0/0 covers the entire world. (1024/4096) * 360 - 180 = -90.
    expect(lng).toBeCloseTo(-90, 5)
    // At py=1024/4096, lat is in the northern hemisphere.
    expect(lat).toBeGreaterThan(0)
    expect(lat).toBeLessThan(85.1) // Mercator clamp
  })
})

describe('VectorTile: multi-layer', () => {
  test('indexes every layer by name', () => {
    const bytes = encodeTile([
      {
        name: 'roads',
        keys: ['type'],
        values: ['highway'],
        features: [
          {
            type: 2,
            tags: [0, 0],
            geometry: [cmd(1, 1), zz(0), zz(0), cmd(2, 1), zz(50), zz(50)],
          },
        ],
      },
      {
        name: 'water',
        keys: ['name'],
        values: ['Lake'],
        features: [
          {
            type: 3,
            tags: [0, 0],
            geometry: clockwiseSquare(0, 0, 50),
          },
        ],
      },
    ])

    const tile = new VectorTile(new Pbf(bytes))
    expect(Object.keys(tile.layers).sort()).toEqual(['roads', 'water'])
    expect(tile.layers.roads.length).toBe(1)
    expect(tile.layers.water.length).toBe(1)

    const road = tile.layers.roads.feature(0)
    expect(road.type).toBe(2)
    expect(road.properties.type).toBe('highway')
    const line = road.loadGeometry()
    expect(line.length).toBe(1)
    expect(line[0].length).toBe(2)
  })
})

describe('VectorTile: polygon with a hole', () => {
  test('GeoJSON output has outer ring first, inner ring second', () => {
    // Outer: clockwise square (0,0)→(1000,0)→(1000,1000)→(0,1000)→close.
    // After the final LineTo the cursor is at (0, 1000); ClosePath does not
    // move the cursor. To jump to the hole's start at (200, 200) the next
    // MoveTo needs delta (200, -800).
    //
    // Build the command stream manually so cursor math is explicit.
    const geometry = [
      // Outer ring (clockwise in y-down → positive shoelace area).
      cmd(1, 1), zz(0), zz(0),
      cmd(2, 3),
      zz(1000), zz(0),
      zz(0), zz(1000),
      zz(-1000), zz(0),
      cmd(7, 1),
      // Inner ring (counter-clockwise in y-down → negative area = hole).
      // Cursor is currently at (0, 1000).
      cmd(1, 1), zz(200), zz(-800), // MoveTo (200, 200)
      cmd(2, 3),
      zz(0), zz(400),   // (200, 600)
      zz(400), zz(0),   // (600, 600)
      zz(0), zz(-400),  // (600, 200)
      cmd(7, 1),
    ]

    const bytes = encodeTile([
      {
        name: 'water',
        keys: ['name'],
        values: ['Ocean'],
        features: [
          {
            type: 3,
            tags: [0, 0],
            geometry,
          },
        ],
      },
    ])

    const tile = new VectorTile(new Pbf(bytes))
    const feat = tile.layers.water.feature(0)
    const rings = feat.loadGeometry()
    expect(rings.length).toBe(2)

    const gj = feat.toGeoJSON(0, 0, 0)
    expect(gj.geometry.type).toBe('Polygon')
    const coords = (gj.geometry as { coordinates: [number, number][][] }).coordinates
    expect(coords.length).toBe(2)
    // Outer ring is bigger (roughly — lng range).
    const outerLngRange
      = Math.max(...coords[0].map(p => p[0])) - Math.min(...coords[0].map(p => p[0]))
    const innerLngRange
      = Math.max(...coords[1].map(p => p[0])) - Math.min(...coords[1].map(p => p[0]))
    expect(outerLngRange).toBeGreaterThan(innerLngRange)
  })
})

describe('VectorTile: error handling', () => {
  test('invalid command id throws', () => {
    // Command id 5 is not one of 1/2/7.
    const bytes = encodeTile([
      {
        name: 'bad',
        keys: [],
        values: [],
        features: [
          {
            type: 3,
            tags: [],
            geometry: [cmd(5, 1), zz(0), zz(0)],
          },
        ],
      },
    ])
    const tile = new VectorTile(new Pbf(bytes))
    expect(() => tile.layers.bad.feature(0).loadGeometry()).toThrow(/Unknown geometry command/)
  })

  test('truncated geometry (count > data) throws', () => {
    // Announce 10 LineTo pairs after the MoveTo, but supply 2 coordinate
    // words (1 pair). After the loop consumes that pair the length counter
    // is still 8; the next iteration calls readVarint at the end of the
    // packed region, and since the buffer happens to contain zeros (or
    // the loop never reaches the cmd refresh branch) the parser will pick
    // up a bogus command id 0 once a fresh cmdLen is finally read. We
    // force this by leaving the command count mismatched.
    const bytes = encodeTile([
      {
        name: 'bad',
        keys: [],
        values: [],
        features: [
          {
            type: 2,
            tags: [],
            // MoveTo 1 pair (valid), then LineTo claiming 10 pairs but only
            // 1 pair follows. The second iteration tries to read past the
            // packed end — we assert *some* error surfaces.
            geometry: [cmd(1, 1), zz(5), zz(5), cmd(2, 10), zz(1), zz(1)],
          },
        ],
      },
    ])
    const tile = new VectorTile(new Pbf(bytes))
    expect(() => tile.layers.bad.feature(0).loadGeometry()).toThrow()
  })

  test('feature index out of bounds throws', () => {
    const bytes = encodeTile([
      {
        name: 'empty',
        keys: [],
        values: [],
        features: [],
      },
    ])
    const tile = new VectorTile(new Pbf(bytes))
    expect(() => tile.layers.empty.feature(0)).toThrow(/out of bounds/)
  })
})

describe('VectorTile: Value types', () => {
  test('string, number, and boolean values decode correctly', () => {
    const bytes = encodeTile([
      {
        name: 'mixed',
        keys: ['s', 'n', 'b'],
        values: ['hello', 3.14, true],
        features: [
          {
            type: 1,
            tags: [0, 0, 1, 1, 2, 2],
            geometry: [cmd(1, 1), zz(0), zz(0)],
          },
        ],
      },
    ])
    const tile = new VectorTile(new Pbf(bytes))
    const feat = tile.layers.mixed.feature(0)
    expect(feat.properties.s).toBe('hello')
    expect(feat.properties.n).toBeCloseTo(3.14, 10)
    expect(feat.properties.b).toBe(true)
  })
})
