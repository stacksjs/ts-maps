import { afterEach, describe, expect, test } from 'bun:test'
import {
  extractTile,
  IndexedDBOfflineStore,
  matchScore,
  MemoryOfflineStore,
  offlineFetch,
  OfflineMaps,
  planArea,
  RoadGraph,
  routeOnGraph,
  setOfflineMaps,
  withOfflineFallback,
} from '../src/core-map/offline'
import type { OfflineRoad } from '../src/core-map/offline'
import type { GeocoderProvider } from '../src/core-map/services/types'
import { Pbf } from '../src/core-map/proto'
import { latToUnit, lngToUnit, unitToLat, unitToLng } from '../src/core-map/offline/plan'

// ---------- a small MVT writer ----------

type Value = string | number | boolean
interface FeatureSpec {
  type: 1 | 2 | 3
  props: Record<string, Value>
  lines: Array<Array<[number, number]>>
}

function zz(n: number): number {
  return (n << 1) ^ (n >> 31)
}

function encodeTile(layers: Record<string, FeatureSpec[]>): Uint8Array {
  const pbf = new Pbf()
  for (const [name, features] of Object.entries(layers)) {
    const keys: string[] = []
    const values: Value[] = []
    const tagged = features.map((f) => {
      const tags: number[] = []
      for (const [k, v] of Object.entries(f.props)) {
        let ki = keys.indexOf(k)
        if (ki < 0)
          ki = keys.push(k) - 1
        let vi = values.indexOf(v)
        if (vi < 0)
          vi = values.push(v) - 1
        tags.push(ki, vi)
      }
      const geometry: number[] = []
      let cx = 0
      let cy = 0
      for (const line of f.lines) {
        geometry.push((1 & 0x7) | (1 << 3), zz(line[0]![0] - cx), zz(line[0]![1] - cy))
        cx = line[0]![0]
        cy = line[0]![1]
        if (line.length > 1) {
          geometry.push((2 & 0x7) | ((line.length - 1) << 3))
          for (const [x, y] of line.slice(1)) {
            geometry.push(zz(x - cx), zz(y - cy))
            cx = x
            cy = y
          }
        }
      }
      return { type: f.type, tags, geometry }
    })
    pbf.writeMessage(3, (_: unknown, p: Pbf) => {
      p.writeVarintField(15, 2)
      p.writeStringField(1, name)
      for (const f of tagged) {
        p.writeMessage(2, (_f: unknown, q: Pbf) => {
          q.writePackedVarint(2, f.tags)
          q.writeVarintField(3, f.type)
          q.writePackedVarint(4, f.geometry)
        }, f)
      }
      for (const k of keys)
        p.writeStringField(3, k)
      for (const v of values) {
        p.writeMessage(4, (_v: unknown, q: Pbf) => {
          if (typeof v === 'string')
            q.writeStringField(1, v)
          else if (typeof v === 'boolean')
            q.writeBooleanField(7, v)
          else if (Number.isInteger(v))
            q.writeSVarintField(6, v)
          else
            q.writeDoubleField(3, v)
        }, v)
      }
      p.writeVarintField(5, 4096)
    }, null)
  }
  return pbf.finish()
}

const road = (props: Record<string, Value>, ...points: Array<[number, number]>): FeatureSpec => ({ type: 2, props, lines: [points] })

// San Francisco, at the zoom OpenMapTiles publishes its full detail.
const Z = 14
const X = Math.floor(lngToUnit(-122.42) * 2 ** Z)
const Y = Math.floor(latToUnit(37.78) * 2 ** Z)

/** The lat/lng of a point inside tile (X + dx, Y). */
function at(px: number, py: number, dx = 0): { lat: number, lng: number } {
  return { lat: unitToLat((Y + py / 4096) / 2 ** Z), lng: unitToLng((X + dx + px / 4096) / 2 ** Z) }
}

/** A tile with two streets meeting at (2000, 1000), a café, and a neighbourhood. */
function cityTile(): Uint8Array {
  return encodeTile({
    transportation: [
      road({ class: 'minor' }, [500, 1000], [2000, 1000], [3500, 1000]),
      road({ class: 'minor' }, [2000, 500], [2000, 1000], [2000, 3500]),
      road({ class: 'primary', oneway: 1 }, [500, 3800], [3500, 3800]),
    ],
    transportation_name: [
      road({ class: 'minor', name: 'Market Street' }, [500, 1000], [3500, 1000]),
      road({ class: 'minor', name: 'Van Ness Avenue' }, [2000, 500], [2000, 3500]),
    ],
    poi: [{ type: 1, props: { name: 'Blue Bottle Coffee', class: 'cafe', rank: 5 }, lines: [[[2100, 1100]]] }],
    place: [{ type: 1, props: { name: 'Hayes Valley', class: 'neighbourhood' }, lines: [[[1500, 2000]]] }],
  })
}

/** A fake tile server: counts requests, can hold them, can fail. */
function server(tiles: (url: string) => Uint8Array | number = () => cityTile()) {
  const state = {
    requests: [] as string[],
    hold: null as Promise<void> | null,
    fetch: async (url: string, init?: RequestInit): Promise<Response> => {
      state.requests.push(url)
      if (state.hold)
        await state.hold
      if (init?.signal?.aborted) {
        const err = new Error('aborted')
        err.name = 'AbortError'
        throw err
      }
      const out = tiles(url)
      if (typeof out === 'number')
        return new Response(null, { status: out })
      return new Response(out as unknown as BodyInit, { status: 200, headers: { 'content-type': 'application/x-protobuf' } })
    },
  }
  return state
}

const SOURCE = { url: 'https://tiles.test/{z}/{x}/{y}.pbf', maxZoom: 14 }
// A small area well inside the tile, from zoom 13 (server zoom 12) to 15 (14).
const AREA = { bounds: [at(1000, 1000).lng, at(3000, 3000).lat, at(3000, 3000).lng, at(1000, 1000).lat] as [number, number, number, number], minZoom: 13, sources: [SOURCE] }

afterEach(() => setOfflineMaps(null))

describe('planning an area', () => {
  test('counts one tile per zoom for an area inside one tile', () => {
    const planned = planArea(AREA)
    expect(planned.count).toBe(3)
    expect(planned.kinds.vector).toBe(3)
    const plan = planned.build()
    expect(plan.urls).toContain(`https://tiles.test/14/${X}/${Y}.pbf`)
    expect(plan.urls).toContain(`https://tiles.test/12/${X >> 2}/${Y >> 2}.pbf`)
    // Search and routing read the top zoom only.
    expect(plan.index).toEqual([{ url: `https://tiles.test/14/${X}/${Y}.pbf`, x: X, y: Y, z: 14 }])
  })

  test('raster sources stop at zoom 16 unless asked for more', () => {
    const planned = planArea({ ...AREA, minZoom: 16, sources: [{ url: 'https://img.test/{z}/{x}/{y}.png', maxZoom: 19 }] })
    expect(planned.maxZoom).toBe(16)
    expect(planArea({ ...AREA, minZoom: 16, maxZoom: 18, sources: [{ url: 'https://img.test/{z}/{x}/{y}.png' }] }).maxZoom).toBe(18)
  })

  test('an area on a tile edge does not need the tile beyond it', () => {
    const edge = unitToLng((X + 1) / 2 ** Z)
    const planned = planArea({ bounds: [at(100, 100).lng, at(200, 200).lat, edge, at(100, 100).lat], minZoom: 15, sources: [SOURCE] })
    expect(planned.count).toBe(1)
  })

  test('with a map, asks each tile layer for its own URLs', async () => {
    const { TsMap } = await import('../src/core-map/map/Map')
    const { TileLayer } = await import('../src/core-map/layer/tile/TileLayer')
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 400 })
    Object.defineProperty(el, 'clientHeight', { value: 300 })
    document.body.appendChild(el)
    const map = new TsMap(el, { center: [37.78, -122.42], zoom: 14, zoomAnimation: false })
    new TileLayer('https://{s}.img.test/{z}/{x}/{y}.png', { subdomains: 'ab' }).addTo(map)
    const planned = planArea({ bounds: AREA.bounds, minZoom: 15, maxZoom: 15, map })
    const { urls } = planned.build()
    expect(urls.length).toBe(planned.count)
    expect(urls.every(u => /^https:\/\/[ab]\.img\.test\/15\//.test(u))).toBe(true)
    map.remove()
    el.remove()
  })
})

describe('downloading', () => {
  test('stores every tile, then reads them back for the map', async () => {
    const tiles = server()
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tiles.fetch })
    const progress: number[] = []
    maps.on('progress', (e: any) => progress.push(e.region.downloaded))

    const region = await maps.download({ ...AREA, name: 'Hayes Valley' })
    expect(region.status).toBe('complete')
    expect(region.name).toBe('Hayes Valley')
    expect(region.downloaded).toBe(3)
    expect(region.bytes).toBeGreaterThan(0)
    expect(progress.at(-1)).toBe(3)
    expect(maps.regions).toHaveLength(1)

    const hit = await maps.lookup(`https://tiles.test/14/${X}/${Y}.pbf`)
    expect(hit?.data.byteLength).toBe(cityTile().byteLength)
    expect(await maps.lookup('https://tiles.test/14/0/0.pbf')).toBeUndefined()
  })

  test('the map reads downloaded tiles before the network, and only them when told to', async () => {
    const tiles = server()
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tiles.fetch })
    setOfflineMaps(maps)
    await maps.download(AREA)

    const original = globalThis.fetch
    const network: string[] = []
    globalThis.fetch = (async (url: string) => {
      network.push(url)
      return new Response('net')
    }) as any
    try {
      const downloaded = await offlineFetch(`https://tiles.test/14/${X}/${Y}.pbf`)
      expect(new Uint8Array(await downloaded.arrayBuffer()).byteLength).toBe(cityTile().byteLength)
      expect(network).toHaveLength(0)

      expect(await (await offlineFetch('https://tiles.test/14/1/1.pbf')).text()).toBe('net')

      maps.onlyOffline = true
      const blocked = await offlineFetch('https://tiles.test/14/2/2.pbf')
      expect(blocked.status).toBe(504)
      expect(network).toHaveLength(1)
    }
    finally {
      globalThis.fetch = original
    }
  })

  test('a missing tile is kept as an empty one, which draws as nothing', async () => {
    const tiles = server(url => (url.includes('/12/') ? 404 : cityTile()))
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tiles.fetch })
    setOfflineMaps(maps)
    const region = await maps.download(AREA)
    expect(region.status).toBe('complete')
    const response = await offlineFetch(`https://tiles.test/12/${X >> 2}/${Y >> 2}.pbf`)
    expect(response.status).toBe(204)
  })

  test('overlapping maps share tiles, and deleting one keeps what the other needs', async () => {
    const store = new MemoryOfflineStore()
    const tiles = server()
    const maps = new OfflineMaps({ store, fetch: tiles.fetch })
    const a = await maps.download(AREA)
    const requests = tiles.requests.length
    const b = await maps.download({ ...AREA, minZoom: 14 })
    // Everything b needs was already here.
    expect(tiles.requests.length).toBe(requests)
    expect(b.downloaded).toBe(2)
    expect((await maps.usage()).entries).toBe(3)

    await maps.delete(a.id)
    expect((await maps.usage()).entries).toBe(2)
    expect(await store.getTile(`https://tiles.test/14/${X}/${Y}.pbf`)).toBeDefined()
    expect(await store.getTile(`https://tiles.test/12/${X >> 2}/${Y >> 2}.pbf`)).toBeUndefined()

    await maps.delete(b.id)
    expect(await maps.usage()).toEqual({ bytes: 0, entries: 0 })
    expect(maps.regions).toHaveLength(0)
  })

  test('pauses, and resumes without fetching what it already has', async () => {
    const tiles = server()
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tiles.fetch, concurrency: 1 })
    let release!: () => void
    const firstDone = new Promise<void>((resolve) => {
      maps.on('progress', function once(e: any) {
        if (e.region.downloaded === 1) {
          maps.off('progress', once)
          resolve()
        }
      })
    })
    const done = maps.download(AREA)
    await firstDone
    tiles.hold = new Promise(resolve => (release = resolve))
    const id = maps.regions[0]!.id
    const paused = maps.pause(id)
    release()
    expect((await paused)?.status).toBe('paused')
    expect((await done).status).toBe('paused')
    tiles.hold = null

    const before = tiles.requests.length
    const resumed = await maps.resume(id)
    expect(resumed.status).toBe('complete')
    expect(resumed.downloaded).toBe(3)
    // Only the tiles it did not have.
    expect(tiles.requests.length - before).toBeLessThanOrEqual(2)
  })

  test('failed tiles leave the map in error, and resuming finishes it', async () => {
    let failing = true
    const tiles = server(url => (failing && url.includes('/13/') ? 400 : cityTile()))
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tiles.fetch })
    const errors: unknown[] = []
    maps.on('error', (e: unknown) => errors.push(e))
    const region = await maps.download(AREA)
    expect(region.status).toBe('error')
    expect(region.error).toContain('1 of 3')
    expect(errors).toHaveLength(1)

    failing = false
    expect((await maps.resume(region.id)).status).toBe('complete')
  })

  test('update fetches every tile again', async () => {
    const tiles = server()
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tiles.fetch })
    const region = await maps.download(AREA)
    const before = tiles.requests.length
    const updated = await maps.update(region.id)
    expect(updated.status).toBe('complete')
    expect(tiles.requests.length - before).toBe(3)
    expect(updated.updatedAt).toBeGreaterThanOrEqual(region.updatedAt)
  })

  test('refuses an area larger than the limit', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: server().fetch, maxTiles: 2 })
    expect((await maps.estimate(AREA)).tooLarge).toBe(true)
    await expect(maps.download(AREA)).rejects.toThrow(/too large/)
  })

  test('estimates size from a sample of the area\'s own tiles', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: server().fetch })
    const estimate = await maps.estimate(AREA)
    expect(estimate.tiles).toBe(3)
    expect(estimate.bytes).toBe(3 * cityTile().byteLength)
  })

  test('survives a reload, with an interrupted download paused', async () => {
    const store = new MemoryOfflineStore()
    const first = new OfflineMaps({ store, fetch: server().fetch })
    const region = await first.download({ ...AREA, name: 'Mission' })
    await store.putRegion({ ...region, id: 'stale', status: 'downloading' })
    await store.putPlan('stale', { urls: [], index: [] })

    const second = new OfflineMaps({ store, fetch: server().fetch })
    const regions = await second.list()
    expect(regions.map(r => r.name).sort()).toEqual(['Mission', 'Mission'])
    expect(regions.find(r => r.id === 'stale')?.status).toBe('paused')
    expect((await second.lookup(`https://tiles.test/14/${X}/${Y}.pbf`))?.data.byteLength).toBeGreaterThan(0)
  })

  test('rename and clear', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: server().fetch })
    const region = await maps.download(AREA)
    expect((await maps.rename(region.id, 'Home'))?.name).toBe('Home')
    await maps.clear()
    expect(await maps.list()).toEqual([])
  })
})

describe('the IndexedDB store', () => {
  test('keeps tiles, refs, regions, plans and indexes', async () => {
    const store = new IndexedDBOfflineStore(`test-${Math.random()}`)
    await store.putTile('u', { data: new Uint8Array([1, 2, 3]), mime: 'x' })
    await store.putRefs('u', { regions: ['r'], bytes: 3 })
    expect([...(await store.getTile('u'))!.data]).toEqual([1, 2, 3])
    expect(await store.usage()).toEqual({ bytes: 3, entries: 1 })
    await store.putRegion({ id: 'r', name: 'R', bounds: [0, 0, 1, 1], minZoom: 0, maxZoom: 1, sources: [], status: 'complete', tiles: 1, downloaded: 1, bytes: 3, createdAt: 1, updatedAt: 1 })
    expect((await store.listRegions()).map(r => r.id)).toEqual(['r'])
    await store.putPlan('r', { urls: ['u'], index: [] })
    expect((await store.getPlan('r'))?.urls).toEqual(['u'])
    await store.deleteTile('u')
    await store.deleteRefs('u')
    expect(await store.getTile('u')).toBeUndefined()
    expect(await store.usage()).toEqual({ bytes: 0, entries: 0 })
    store.close()
  })
})

describe('reading a tile', () => {
  test('finds places, streets and roads, named from the name layer', () => {
    const { places, roads } = extractTile(cityTile(), X, Y, Z)
    const names = places.map(p => p.name)
    expect(names).toContain('Blue Bottle Coffee')
    expect(names).toContain('Hayes Valley')
    expect(names).toContain('Market Street')
    expect(roads).toHaveLength(3)
    expect(roads.map(r => r.name)).toEqual(['Market Street', 'Van Ness Avenue', undefined])
    expect(roads[2]!.oneway).toBe(1)
    const cafe = places.find(p => p.name === 'Blue Bottle Coffee')!
    expect(cafe.lat).toBeCloseTo(at(2100, 1100).lat, 6)
    expect(cafe.lng).toBeCloseTo(at(2100, 1100).lng, 6)
  })

  test('drops the part of a road in the buffer, which the next tile draws', () => {
    const { roads } = extractTile(encodeTile({ transportation: [road({ class: 'minor' }, [3000, 2000], [4160, 2000])] }), X, Y, Z)
    const end = roads[0]!.coords.slice(-2)
    expect(end[1]).toBeCloseTo(unitToLng((X + 1) / 2 ** Z), 7)
  })
})

describe('offline search', () => {
  async function geocoder() {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: server().fetch })
    await maps.download(AREA)
    return maps.geocoder()
  }

  test('matches names by prefix and by word, ignoring case and accents', async () => {
    expect(matchScore('Café Réveille', 'cafe')).toBeGreaterThan(0.5)
    expect(matchScore('Blue Bottle Coffee', 'bottle')).toBeGreaterThan(0)
    expect(matchScore('Blue Bottle Coffee', 'tea')).toBe(0)
    expect(matchScore('Market Street', 'market street')).toBe(1)

    const results = await (await geocoder()).search('blue bot')
    expect(results[0]?.text).toBe('Blue Bottle Coffee')
    expect(results[0]?.placeType).toBe('poi')
    expect(results[0]?.properties?.offline).toBe(true)
  })

  test('reverse finds the street you are on', async () => {
    const [nearest] = await (await geocoder()).reverse(at(2600, 1010))
    expect(nearest?.text).toBe('Market Street')
  })

  test('backs up an online provider that fails, not one that works', async () => {
    const offline = await geocoder()
    const failing: GeocoderProvider = { name: 'net', search: async () => { throw new TypeError('Failed to fetch') }, reverse: async () => [] }
    const both = withOfflineFallback(failing, offline)
    expect((await both.search('hayes'))[0]?.text).toBe('Hayes Valley')

    const working: GeocoderProvider = { name: 'net', search: async () => [{ text: 'online', center: { lat: 0, lng: 0 } }], reverse: async () => [] }
    expect((await withOfflineFallback(working, offline).search('hayes'))[0]?.text).toBe('online')

    // Nothing offline either: the online error is the one worth seeing.
    await expect(both.search('zzzz')).rejects.toThrow('Failed to fetch')
  })
})

describe('offline directions', () => {
  function roadsOf(...tiles: Array<[Uint8Array, number]>): OfflineRoad[] {
    return tiles.flatMap(([bytes, dx]) => extractTile(bytes, X + dx, Y, Z).roads)
  }

  test('turns at a junction, with the street names and a sensible time', () => {
    const graph = new RoadGraph(roadsOf([cityTile(), 0]))
    const [route] = routeOnGraph(graph, [at(700, 1000), at(2000, 3000)])
    expect(route).toBeDefined()
    const codes = route!.steps.map(s => s.maneuver)
    expect(codes).toEqual(['depart', 'turn-right', 'arrive'])
    expect(route!.steps[0]!.name).toBe('Market Street')
    expect(route!.steps[1]!.instruction).toBe('Turn right onto Van Ness Avenue')
    // About 1.3 km at 30 km/h.
    expect(route!.distance).toBeGreaterThan(1000)
    expect(route!.distance).toBeLessThan(1600)
    expect(route!.duration).toBeCloseTo(route!.distance / (30 / 3.6), 0)
  })

  test('joins streets the tiles simplified apart, but not a bridge to the road below', () => {
    // A straight avenue with no vertex where the side street meets it, and a
    // cross street passing straight through: both are junctions all the same.
    const tile = encodeTile({
      transportation: [
        road({ class: 'minor' }, [500, 1000], [3500, 1000]),
        road({ class: 'minor' }, [2000, 1000], [2000, 3500]),
        road({ class: 'minor' }, [1000, 500], [1000, 1500]),
        road({ class: 'motorway', brunnel: 'bridge' }, [3000, 500], [3000, 3500]),
      ],
    })
    const graph = new RoadGraph(roadsOf([tile, 0]))
    const tee = routeOnGraph(graph, [at(600, 1000), at(2000, 3000)])[0]!
    expect(tee.steps.map(s => s.maneuver)).toEqual(['depart', 'turn-right', 'arrive'])
    const cross = routeOnGraph(graph, [at(600, 1000), at(1000, 1400)])[0]!
    expect(cross.steps.map(s => s.maneuver)).toEqual(['depart', 'turn-right', 'arrive'])
    // From the avenue onto the bridge overhead there is no way up.
    const bridge = routeOnGraph(graph, [at(2800, 1000), at(3000, 3000)])[0]!
    expect(bridge).toBeUndefined()
  })

  test('crosses from one tile to the next', () => {
    const left = encodeTile({ transportation: [road({ class: 'minor' }, [3000, 2000], [4160, 2000])] })
    const right = encodeTile({ transportation: [road({ class: 'minor' }, [-64, 2000], [1000, 2000])] })
    const [route] = routeOnGraph(new RoadGraph(roadsOf([left, 0], [right, 1])), [at(3100, 2000), at(900, 2000, 1)])
    expect(route).toBeDefined()
    expect(route!.distance).toBeGreaterThan(200)
  })

  test('keeps to one-way streets, except on foot', () => {
    const tile = encodeTile({ transportation: [road({ class: 'primary', oneway: 1 }, [500, 2000], [3500, 2000])] })
    const roads = roadsOf([tile, 0])
    const against = [at(3000, 2000), at(1000, 2000)]
    expect(routeOnGraph(new RoadGraph(roads), against)).toEqual([])
    expect(routeOnGraph(new RoadGraph(roads, { profile: 'walking' }), against)).toHaveLength(1)
    expect(routeOnGraph(new RoadGraph(roads), [...against].reverse())).toHaveLength(1)
  })

  test('the manager routes over what it has downloaded', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: server().fetch })
    await maps.download(AREA)
    const routes = await maps.directions().getDirections([at(700, 1000), at(2000, 3000)])
    expect(routes[0]?.steps.map(s => s.maneuver)).toEqual(['depart', 'turn-right', 'arrive'])
  })
})
