import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { OfflineRegionRecord } from '../src/core-map/offline'
import { MemoryOfflineStore, OfflineMaps, setOfflineMaps } from '../src/core-map/offline'
import { latToUnit, lngToUnit, unitToLat, unitToLng } from '../src/core-map/offline/plan'

const Z = 14
const X = Math.floor(lngToUnit(-122.42) * 2 ** Z)
const Y = Math.floor(latToUnit(37.78) * 2 ** Z)
const at = (px: number, py: number): [number, number] => [unitToLng((X + px / 4096) / 2 ** Z), unitToLat((Y + py / 4096) / 2 ** Z)]
const [w, n] = at(1000, 1000)
const [e, s] = at(3000, 3000)
const AREA = { bounds: [w, s, e, n] as [number, number, number, number], minZoom: 12, sources: [{ url: 'https://tiles.test/{z}/{x}/{y}.png', type: 'raster' as const }], maxZoom: 16 }

const tile = (): Response => new Response(new Uint8Array(10) as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })
const managers: OfflineMaps[] = []
function manager(options: ConstructorParameters<typeof OfflineMaps>[0] = {}): OfflineMaps {
  const maps = new OfflineMaps({ fetch: async () => tile(), ...options })
  managers.push(maps)
  return maps
}

let online = true
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })

function forgetSwitch(): void {
  try {
    localStorage.removeItem('ts-maps-offline-auto-update')
  }
  catch {}
}

beforeEach(forgetSwitch)

afterEach(() => {
  // The switch is remembered on the device, which here is every test file.
  forgetSwitch()
  for (const maps of managers.splice(0))
    maps.dispose()
  setOfflineMaps(null)
  online = true
  delete (navigator as any).connection
})

/** A region stored as a reload would leave it. */
async function stored(store: MemoryOfflineStore, region: Partial<OfflineRegionRecord>): Promise<OfflineRegionRecord> {
  const seeded = manager({ store })
  const done = await seeded.download({ ...AREA, name: region.name ?? 'Seed' })
  const record = { ...done, ...region }
  await store.putRegion(record)
  return record
}

describe('autoResume', () => {
  test('a download a reload interrupted resumes once ready and online; one paused by hand does not', async () => {
    const store = new MemoryOfflineStore()
    const cut = await stored(store, { name: 'Cut short', status: 'downloading', downloaded: 1 })
    const held = await stored(store, { name: 'Held', status: 'paused' })
    const maps = manager({ store, autoResume: true })
    await maps.ready()
    const end = Date.now() + 1000
    while ((await maps.get(cut.id))?.status !== 'complete' && Date.now() < end)
      await new Promise(r => setTimeout(r, 5))
    expect((await maps.get(cut.id))?.status).toBe('complete')
    expect((await maps.get(cut.id))?.interrupted).toBeUndefined()
    expect((await maps.get(held.id))?.status).toBe('paused')
  })

  test('without it, an interrupted download waits paused', async () => {
    const store = new MemoryOfflineStore()
    const cut = await stored(store, { status: 'downloading' })
    const maps = manager({ store })
    await maps.ready()
    expect(maps._jobs.size).toBe(0)
    expect((await maps.get(cut.id))?.status).toBe('paused')
  })

  test('a lost connection pauses a download as interrupted, and its return resumes it', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => (release = resolve))
    const maps = manager({
      store: new MemoryOfflineStore(),
      autoResume: true,
      fetch: async (_url, init) => {
        await gate
        if (init?.signal?.aborted)
          throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        return tile()
      },
    })
    await maps.ready()
    const first = maps.download(AREA)
    await new Promise(r => setTimeout(r, 0))
    online = false
    window.dispatchEvent(new Event('offline'))
    release()
    const paused = await first
    expect(paused.status).toBe('paused')
    expect(paused.interrupted).toBe(true)

    online = true
    window.dispatchEvent(new Event('online'))
    const end = Date.now() + 1000
    while ((await maps.get(paused.id))?.status !== 'complete' && Date.now() < end)
      await new Promise(r => setTimeout(r, 5))
    expect((await maps.get(paused.id))?.status).toBe('complete')
  })
})

describe('autoUpdate', () => {
  test('refreshes maps past their age, oldest first, one at a time', async () => {
    const store = new MemoryOfflineStore()
    const old = await stored(store, { name: 'Old', updatedAt: Date.now() - 40 * 864e5 })
    const older = await stored(store, { name: 'Older', updatedAt: Date.now() - 90 * 864e5 })
    const fresh = await stored(store, { name: 'Fresh', updatedAt: Date.now() - 864e5 })
    const order: string[] = []
    const maps = manager({ store, autoUpdate: { maxAge: 30 * 864e5 } })
    maps.on('progress', (e: any) => {
      if (order.at(-1) !== e.region.name)
        order.push(e.region.name)
    })
    await maps.updateStale()
    expect(order).toEqual(['Older', 'Old'])
    for (const r of [old, older])
      expect((await maps.get(r.id))!.updatedAt).toBeGreaterThan(Date.now() - 60_000)
    expect((await maps.get(fresh.id))!.updatedAt).toBe(fresh.updatedAt)
  })

  test('waits for an unmetered connection', async () => {
    const store = new MemoryOfflineStore()
    const old = await stored(store, { updatedAt: Date.now() - 40 * 864e5 })
    ;(navigator as any).connection = { type: 'cellular' }
    const maps = manager({ store, autoUpdate: true })
    await maps.updateStale()
    expect((await maps.get(old.id))!.updatedAt).toBe(old.updatedAt)
    // Unless told it may spend data.
    const anyway = manager({ store, autoUpdate: { unmeteredOnly: false } })
    await anyway.updateStale()
    expect((await anyway.get(old.id))!.updatedAt).toBeGreaterThan(old.updatedAt)
  })

  test('the switch is remembered on the device', () => {
    const maps = manager({ store: new MemoryOfflineStore() })
    expect(maps.autoUpdate).toBe(false)
    const heard: unknown[] = []
    maps.on('settingchange', (e: any) => heard.push(e.autoUpdate))
    maps.autoUpdate = true
    expect(heard).toEqual([true])
    expect(manager({ store: new MemoryOfflineStore() }).autoUpdate).toBe(true)
  })
})

describe('storage', () => {
  test('asks the browser to keep the maps on the first download', async () => {
    let asked = 0
    const real = navigator.storage
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: async () => { asked++; return true }, persisted: async () => true, estimate: async () => ({ usage: 400, quota: 1000 }) },
    })
    try {
      const maps = manager({ store: new MemoryOfflineStore() })
      await maps.download(AREA)
      await maps.download({ ...AREA, name: 'Second' })
      expect(asked).toBe(1)
      expect(await maps.storage()).toEqual({ usage: 400, quota: 1000, free: 600, persisted: true })
      expect(await manager({ store: new MemoryOfflineStore(), persist: false }).download(AREA).then(() => asked)).toBe(1)
    }
    finally {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: real })
    }
  })

  test('running out of space stops the download with a clear error', async () => {
    const store = new MemoryOfflineStore()
    let puts = 0
    store.putTile = async () => {
      if (++puts > 2)
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    const requests: string[] = []
    const maps = manager({ store, concurrency: 1, fetch: async (url) => { requests.push(url); return tile() } })
    const region = await maps.download(AREA)
    expect(region.status).toBe('error')
    expect(region.error).toContain('Not enough storage')
    expect(region.interrupted).toBeUndefined()
    // It stopped there rather than failing every tile after.
    expect(requests.length).toBe(3)
  })
})
