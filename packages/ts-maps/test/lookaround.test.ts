import { afterEach, describe, expect, test } from 'bun:test'
import type { StreetImage, StreetImageryProvider } from '../src/core-map'
import { bearingBetween, control, LookAround, MapillaryImagery, metresBetween, panoramaU, PanoramaxImagery, stepsFrom, stepToward, styles, TsMap } from '../src/core-map'

const TILES = 'https://tiles.test/{z}/{x}/{y}.pbf'

// A street running north from the Louvre, a picture every ~10 m.
const STREET: StreetImage[] = [0, 1, 2, 3].map(i => ({
  id: `p${i}`,
  provider: 'test',
  lat: 48.8600 + i * 0.00009,
  lng: 2.3370,
  heading: 0,
  fov: 360,
  url: `https://img.test/p${i}.jpg`,
  thumbUrl: `https://img.test/p${i}-thumb.jpg`,
  capturedAt: Date.UTC(2025, 4, 5),
  sequence: 's1',
  prev: i > 0 ? `p${i - 1}` : undefined,
  next: i < 3 ? `p${i + 1}` : undefined,
  attribution: 'test imagery',
}))

function fakeProvider(images: StreetImage[] = STREET): StreetImageryProvider & { asked: unknown[] } {
  const asked: unknown[] = []
  return {
    name: 'test',
    attribution: '© test',
    asked,
    async near(at, options = {}) {
      asked.push(at)
      const p = Array.isArray(at) ? { lat: at[0], lng: at[1] } : at as { lat: number, lng: number }
      return images
        .filter(i => metresBetween(p, i) <= (options.radius ?? 50))
        .sort((a, b) => metresBetween(p, a) - metresBetween(p, b))
        .slice(0, options.limit ?? 20)
    },
    async get(id) {
      return images.find(i => i.id === id)
    },
    coverage: () => ({ tiles: 'https://cover.test/{z}/{x}/{y}.mvt', minzoom: 0, maxzoom: 15, lines: 'sequences', points: 'pictures' }),
  }
}

function makeMap(): TsMap {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 600 })
  Object.defineProperty(container, 'clientHeight', { value: 400 })
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false, fadeAnimation: false, locale: 'en' })
  map.setView([48.8601, 2.3370], 17)
  map.setStyle(styles.light({ tiles: TILES }))
  return map
}

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 20))

afterEach(() => {
  document.body.replaceChildren()
})

describe('imagery providers', () => {
  test('Panoramax: asks round a point, keeps the 360° pictures, reads its STAC items', async () => {
    const asked: string[] = []
    const item = (id: string, lng: number, fov: number): unknown => ({
      id,
      collection: 'seq',
      geometry: { type: 'Point', coordinates: [lng, 48.8551] },
      properties: { 'view:azimuth': 293, 'datetime': '2025-05-05T09:49:47.602000+00:00', 'geovisio:producer': 'immergis', 'pers:interior_orientation': { field_of_view: fov } },
      assets: { hd: { href: `https://pmx.test/${id}/hd.jpg` }, sd: { href: `https://pmx.test/${id}/sd.jpg` }, thumb: { href: `https://pmx.test/${id}/thumb.jpg` } },
      links: [{ rel: 'prev', id: 'before' }, { rel: 'next', id: 'after' }],
    })
    const provider = new PanoramaxImagery({
      fetch: (async (url: string) => {
        asked.push(url)
        return new Response(JSON.stringify({ features: [item('far', 2.3352, 360), item('flat', 2.33503, 70), item('near', 2.33503, 360)] }))
      }) as unknown as typeof fetch,
          })
    const found = await provider.near([48.8551, 2.33503], { radius: 30 })
    expect(asked[0]).toContain('/search?place_position=2.3350300,48.8551000&place_distance=0-30')
    expect(found.map(i => i.id)).toEqual(['near', 'far'])
    expect(found[0]).toMatchObject({ heading: 293, fov: 360, url: 'https://pmx.test/near/sd.jpg', hdUrl: 'https://pmx.test/near/hd.jpg', thumbUrl: 'https://pmx.test/near/thumb.jpg', sequence: 'seq', prev: 'before', next: 'after' })
    expect(found[0]!.attribution).toBe('immergis, © Panoramax contributors')
    expect(new Date(found[0]!.capturedAt!).getUTCFullYear()).toBe(2025)
    expect(provider.coverage()).toMatchObject({ tiles: 'https://api.panoramax.xyz/api/map/{z}/{x}/{y}.mvt', lines: 'sequences', points: 'pictures' })
  })

  test('Mapillary: a box round the point, its own alignment, panoramas only', async () => {
    const asked: string[] = []
    const provider = new MapillaryImagery({
      accessToken: 'MLY|1|abc',
      fetch: (async (url: string) => {
        asked.push(url)
        return new Response(JSON.stringify({
          data: [
            { id: '1', geometry: { coordinates: [2.3370, 48.8600] }, computed_geometry: { coordinates: [2.33701, 48.86001] }, compass_angle: 10, computed_compass_angle: 12, is_pano: true, thumb_256_url: 't', thumb_1024_url: 'm', thumb_2048_url: 'l', captured_at: 1700000000000, sequence: 'q' },
            { id: '2', geometry: { coordinates: [2.3500, 48.8600] }, compass_angle: 0, is_pano: true, thumb_2048_url: 'x' },
          ],
        }))
      }) as unknown as typeof fetch,
          })
    const found = await provider.near({ lat: 48.86, lng: 2.337 }, { radius: 40 })
    expect(asked[0]).toContain('https://graph.mapillary.com/images?access_token=MLY%7C1%7Cabc')
    expect(asked[0]).toContain('&is_pano=true')
    expect(found.map(i => i.id)).toEqual(['1'])
    expect(found[0]).toMatchObject({ lat: 48.86001, lng: 2.33701, heading: 12, fov: 360, url: 'm', hdUrl: 'l', thumbUrl: 't' })
    expect(provider.coverage().tiles).toContain('access_token=MLY%7C1%7Cabc')
    expect(provider.coverage().filter).toEqual(['==', ['get', 'is_pano'], true])
  })
})

describe('moving along a street', () => {
  test('ahead and behind are the next pictures that way; nothing past the end', () => {
    const [, second, third] = STREET
    expect(stepToward(second!, STREET, 0)!.id).toBe('p2')
    expect(stepToward(second!, STREET, 180)!.id).toBe('p0')
    expect(stepToward(second!, STREET, 90)).toBeUndefined()
    expect(stepsFrom(third!, STREET, 10)).toMatchObject({ forward: { id: 'p3' }, back: { id: 'p1' } })
    expect(stepToward(STREET[3]!, STREET, 0)).toBeUndefined()
  })

  test('bearings, and where a heading falls across a panorama', () => {
    expect(bearingBetween(STREET[0]!, STREET[1]!)).toBeCloseTo(0, 3)
    expect(bearingBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 3)
    expect(panoramaU({ heading: 90 }, 90)).toBeCloseTo(0.5)
    expect(panoramaU({ heading: 90 }, 0)).toBeCloseTo(0.25)
    expect(panoramaU({ heading: 0 }, 270)).toBeCloseTo(0.25)
  })
})

describe('the Look Around viewer', () => {
  test('opens at the picture nearest a place, turned to face it, with its date and credit', async () => {
    const map = makeMap()
    const look = new LookAround({ provider: fakeProvider() }).addTo(map)
    const events: string[] = []
    look.listen(type => events.push(type))
    const image = await look.open({ lat: 48.86003, lng: 2.3370 }, { lookAt: { lat: 48.8600, lng: 2.3380 } })
    expect(image!.id).toBe('p0')
    expect(look.view.heading).toBeCloseTo(90, 0)
    const overlay = map.getContainer().querySelector('.tsmap-lookaround')!
    expect(overlay.getAttribute('role')).toBe('dialog')
    expect(overlay.querySelector('.tsmap-lookaround-date')!.textContent).toBe('Captured May 2025')
    expect(overlay.querySelector('.tsmap-lookaround-credit')!.textContent).toBe('test imagery')
    // No WebGL here: the picture is the background, scrolled to the heading.
    expect(overlay.querySelector<HTMLElement>('.tsmap-lookaround-fallback')!.style.backgroundImage).toContain('p0.jpg')
    expect(events).toEqual(['imagechange', 'open'])
  })

  test('steps forward and back along the street, by arrow, key and method', async () => {
    const map = makeMap()
    const look = new LookAround({ provider: fakeProvider(), miniMap: false }).addTo(map)
    await look.open(STREET[1]!, { heading: 0 })
    await tick()
    const overlay = map.getContainer().querySelector<HTMLElement>('.tsmap-lookaround')!
    expect(overlay.querySelector<HTMLButtonElement>('[data-step="forward"]')!.disabled).toBe(false)
    overlay.querySelector<HTMLElement>('[data-step="forward"]')!.click()
    await tick()
    expect(look.image!.id).toBe('p2')
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await tick()
    expect(look.image!.id).toBe('p1')
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(look.view.heading).toBe(15)
    expect(await look.step('right')).toBeUndefined()
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(look.isOpen).toBe(false)
    expect(map.getContainer().querySelector('.tsmap-lookaround')).toBeNull()
  })

  test('the small map follows where you stand and which way you look', async () => {
    const map = makeMap()
    const look = new LookAround({ provider: fakeProvider() }).addTo(map)
    await look.open(STREET[2]!, { heading: 45 })
    const mini = look._mini
    expect(mini).toBeDefined()
    expect(mini.getCenter().lat).toBeCloseTo(STREET[2]!.lat, 5)
    look.setView({ heading: 120 })
    const turn = map.getContainer().querySelector<HTMLElement>('.tsmap-lookaround-cone-turn')!
    expect(turn.style.transform).toBe('rotate(120deg)')
    look.close()
  })

  test('choosing draws the streets with pictures, and a tap opens the nearest', async () => {
    const map = makeMap()
    const look = control.lookAround({ provider: fakeProvider() }).addTo(map)
    const changes: boolean[] = []
    look.listen((type, e) => type === 'choosingchange' && changes.push(e.choosing))
    map.getContainer().querySelector<HTMLElement>('.tsmap-lookaround-button')!.click()
    expect(look.choosing).toBe(true)
    const style = map.getStyle()!
    expect(style.sources['ts-maps-lookaround']).toMatchObject({ type: 'vector', tiles: ['https://cover.test/{z}/{x}/{y}.mvt'] })
    const lines = style.layers.find(l => l.id === 'ts-maps-lookaround-lines') as any
    expect(lines['source-layer']).toBe('sequences')
    expect(lines.metadata['ts-maps:overlay']).toBe(true)
    map.fire('click', { latlng: { lat: STREET[3]!.lat, lng: 2.33701 } })
    await tick()
    expect(look.image!.id).toBe('p3')
    expect(look.choosing).toBe(false)
    expect(map.getStyle()!.sources['ts-maps-lookaround']).toBeUndefined()
    expect(changes).toEqual([true, false])
  })

  test('says so where there are no pictures', async () => {
    const map = makeMap()
    const look = new LookAround({ provider: fakeProvider([]) }).addTo(map)
    const missed: unknown[] = []
    look.listen((type, e) => type === 'notfound' && missed.push(e.at))
    expect(await look.open([48.9, 2.4])).toBeUndefined()
    expect(missed).toEqual([{ lat: 48.9, lng: 2.4 }])
    expect(look.isOpen).toBe(false)
  })

  test('sync opens at a place, turns, and closes', async () => {
    const map = makeMap()
    const look = new LookAround({ provider: fakeProvider(), miniMap: false }).addTo(map)
    look.sync({ at: [48.86012, 2.3370], heading: 200 })
    await tick()
    expect(look.image!.id).toBe('p1')
    expect(look.view.heading).toBe(200)
    // Unchanged: left alone, so a re-render keeps the way you turned.
    look.setView({ heading: 30 })
    look.sync({ at: [48.86012, 2.3370], heading: 200 })
    expect(look.view.heading).toBe(30)
    look.sync({ at: null })
    expect(look.isOpen).toBe(false)
  })

  test('in German', async () => {
    const map = makeMap()
    const look = new LookAround({ provider: fakeProvider(), locale: 'de', miniMap: false }).addTo(map)
    await look.open(STREET[0]!)
    const overlay = map.getContainer().querySelector('.tsmap-lookaround')!
    expect(overlay.querySelector('.tsmap-lookaround-done')!.textContent).toBe('Fertig')
    expect(overlay.querySelector('.tsmap-lookaround-title')!.textContent).toBe('Umsehen')
  })
})

describe('from a place card', () => {
  test('a place with pictures near offers them, looking toward it', async () => {
    const map = makeMap()
    const look = new LookAround({ provider: fakeProvider(), miniMap: false }).addTo(map)
    const search = control.search({ provider: null, offline: null, recents: false, lookAround: look }).addTo(map)
    const place = { id: 'cafe', name: 'Café Marly', center: { lat: 48.86027, lng: 2.3375 }, source: 'map', kind: 'cafe', icon: 'cafe', rank: 1 } as any
    search.select(place)
    await tick()
    const button = map.getContainer().querySelector<HTMLElement>('.tsmap-search-lookaround')!
    expect(button.getAttribute('style')).toContain('p3-thumb.jpg')
    expect(button.textContent).toContain('Look Around')
    button.click()
    await tick()
    expect(look.image!.id).toBe('p3')
    expect(look.view.heading).toBeCloseTo(90, -1)
  })
})
