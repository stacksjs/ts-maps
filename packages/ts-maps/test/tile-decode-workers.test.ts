import { afterAll, describe, expect, test } from 'bun:test'
import { shutdownDecodePool, VectorTileMapLayer } from '../src/core-map/layer/tile/VectorTileMapLayer'
import { FlatTile } from '../src/core-map/mvt/FlatTile'
import { VectorTile } from '../src/core-map/mvt/VectorTile'
import { Pbf } from '../src/core-map/proto/Pbf'
import { decodeMvtFlat } from '../src/core-map/workers/decodeMvtFlat'
import { WorkerPool } from '../src/core-map/workers/WorkerPool'

function tileBytes(x = 64, y = 96): Uint8Array {
  const cmd = (id: number, count: number): number => (id & 0x7) | (count << 3)
  const zz = (n: number): number => (n << 1) ^ (n >> 31)
  const pbf = new Pbf()
  pbf.writeMessage(3, (_, p) => {
    p.writeVarintField(15, 2)
    p.writeStringField(1, 'poi')
    p.writeMessage(2, (_f, q) => {
      q.writeVarintField(3, 1)
      q.writePackedVarint(4, [cmd(1, 1), zz(x), zz(y)])
    }, null)
    p.writeVarintField(5, 4096)
  }, null)
  return pbf.finish()
}

afterAll(async () => {
  await shutdownDecodePool()
})

describe('worker-backed tile decode', () => {
  test('decodes on a real worker thread, end to end', async () => {
    const pool = new WorkerPool({ size: 1 })
    // Guard rather than assume: a host without `Worker` runs the fallback,
    // which the tests below cover on their own.
    if (pool.size() === 0) {
      await pool.shutdown()
      return
    }

    // This is the load-bearing assertion for the whole worker design. The
    // handler reaches the thread as source text, so it passing here means
    // `decodeMvtFlat` really did survive serialisation with nothing captured
    // from its module — the property the file is written to preserve.
    const flat = await pool.run<Uint8Array, any>({ type: 'mvt-decode', payload: tileBytes(12, 34) })
    expect(flat.layers.map((l: any) => l.name)).toEqual(['poi'])
    expect(Array.from(flat.layers[0].coords)).toEqual([12, 34])

    const tile = new FlatTile(flat)
    expect(tile.layers.poi.feature(0).loadGeometry()).toEqual([[{ x: 12, y: 34 } as any]])
    await pool.shutdown()
  })

  test('a layer decodes its tiles through the pool', async () => {
    const layer = new VectorTileMapLayer({ url: 'https://example.com/{z}/{x}/{y}.pbf' })
    const tile = await layer._decode(tileBytes())
    expect(tile.layers.poi.length).toBe(1)
    expect(tile.layers.poi.feature(0).loadGeometry()[0][0].x).toBe(64)
  })

  test('opting out of workers decodes inline', async () => {
    const layer = new VectorTileMapLayer({ url: 'x', workers: false })
    expect(layer._workerPool()).toBeNull()
    const tile = await layer._decode(tileBytes())
    expect(tile).toBeInstanceOf(VectorTile)
    expect(tile.layers.poi.feature(0).loadGeometry()[0][0].y).toBe(96)
  })

  test('a pool result is wrapped rather than copied', async () => {
    const layer = new VectorTileMapLayer({ url: 'x' })
    let asked = 0
    layer._workerPool = () => ({
      size: () => 2,
      run: async (task: any) => {
        asked++
        expect(task.type).toBe('mvt-decode')
        return decodeMvtFlat(task.payload)
      },
    }) as any

    const tile = await layer._decode(tileBytes())
    expect(asked).toBe(1)
    expect(tile).toBeInstanceOf(FlatTile)
    expect(tile.layers.poi.feature(0).loadGeometry()[0][0].y).toBe(96)
  })

  test('a worker failure falls back, and the layer stops asking', async () => {
    const layer = new VectorTileMapLayer({ url: 'x' })
    let attempts = 0
    const failing = {
      size: () => 2,
      run: async () => {
        attempts++
        throw new Error('worker exploded')
      },
    } as any
    layer._workerPool = () => (layer._workersUsable === false ? null : failing)

    // The tile still decodes; the layer just does it itself.
    const first = await layer._decode(tileBytes())
    expect(first).toBeInstanceOf(VectorTile)
    expect(first.layers.poi.length).toBe(1)
    expect(attempts).toBe(1)

    const second = await layer._decode(tileBytes())
    expect(second.layers.poi.length).toBe(1)
    expect(attempts).toBe(1)
  })
})
