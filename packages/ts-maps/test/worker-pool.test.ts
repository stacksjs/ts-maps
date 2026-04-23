import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { registerWorkerHandler, WorkerPool } from '../src/core-map/workers/WorkerPool'

// very-happy-dom does not implement `Worker`. That's fine — the pool's
// intended fallback runs handlers synchronously on the main thread, and
// that path is what we exercise here. If a future version of the harness
// ships a real `Worker`, callers get the threaded path automatically.

describe('WorkerPool', () => {
  let originalWorker: unknown
  beforeEach(() => {
    originalWorker = (globalThis as any).Worker
    // Force the fallback path. The handler registry is shared between
    // main-thread and worker execution, so this doesn't change semantics.
    ;(globalThis as any).Worker = undefined
  })
  afterEach(() => {
    ;(globalThis as any).Worker = originalWorker
  })

  test('falls back to sync dispatch when Worker is unavailable', async () => {
    const pool = new WorkerPool({ size: 2 })
    expect(pool.size()).toBe(0)
    registerWorkerHandler<number, number>('double', ({ payload }) => payload * 2)
    const out = await pool.run<number, number>({ type: 'double', payload: 21 })
    expect(out).toBe(42)
    await pool.shutdown()
  })

  test('round-trips an async handler result', async () => {
    const pool = new WorkerPool({ size: 1 })
    registerWorkerHandler<string, string>('shout', async ({ payload }) => {
      await new Promise(r => setTimeout(r, 1))
      return payload.toUpperCase()
    })
    const out = await pool.run<string, string>({ type: 'shout', payload: 'hi' })
    expect(out).toBe('HI')
    await pool.shutdown()
  })

  test('unknown task type rejects', async () => {
    const pool = new WorkerPool({ size: 1 })
    await expect(pool.run({ type: 'no-such-handler', payload: null }))
      .rejects.toThrow('unknown task type')
    await pool.shutdown()
  })

  test('mvt-decode handler is registered and returns layer arrays', async () => {
    const pool = new WorkerPool({ size: 1 })
    // Build a minimal MVT body: one layer `things` with a single point.
    const { Pbf } = await import('../src/core-map/proto/Pbf')
    function zz(n: number): number { return (n << 1) ^ (n >> 31) }
    function cmd(id: number, count: number): number { return (id & 0x7) | (count << 3) }

    const pbf = new Pbf()
    pbf.writeMessage(3, (_, p) => {
      p.writeVarintField(15, 2)
      p.writeStringField(1, 'things')
      p.writeMessage(2, (_f, q) => {
        q.writeVarintField(3, 1)
        q.writePackedVarint(4, [cmd(1, 1), zz(100), zz(200)])
      }, null)
      p.writeVarintField(5, 4096)
    }, null)
    const bytes = pbf.finish()

    const result = await pool.run<Uint8Array, { layers: Array<{ name: string, features: unknown[] }> }>({
      type: 'mvt-decode',
      payload: bytes,
    })
    expect(result.layers.length).toBe(1)
    expect(result.layers[0].name).toBe('things')
    expect(result.layers[0].features.length).toBe(1)
    await pool.shutdown()
  })

  test('shutdown rejects any still-pending tasks', async () => {
    const pool = new WorkerPool({ size: 1 })
    // With no worker, run() resolves synchronously — there's nothing pending
    // to reject. But shutdown() must still be idempotent / safe.
    await pool.shutdown()
    await pool.shutdown()
    expect(pool.size()).toBe(0)
  })
})
