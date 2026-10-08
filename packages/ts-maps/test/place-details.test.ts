import { afterEach, describe, expect, test } from 'bun:test'
import type { SearchPlace } from '../src/core-map/search'
import { control, Map } from '../src/core-map'
import { describeOpening, detailsFromTags, openingStatus, OverpassPlaceDetails, parseOpeningHours } from '../src/core-map/search'

// A Wednesday afternoon, local time.
const WED_1430 = new Date(2026, 9, 7, 14, 30)

describe('opening_hours', () => {
  test('reads the common forms', () => {
    expect(parseOpeningHours('24/7')!.every(day => day[0]![1] === 1440)).toBe(true)
    const week = parseOpeningHours('Mo-Fr 08:00-18:00; Sa 10:00-14:00; Su off')!
    expect(week[0]).toEqual([[480, 1080]])
    expect(week[5]).toEqual([[600, 840]])
    expect(week[6]).toEqual([])
    // Lunch closing, a list of days, and a later rule replacing an earlier one.
    const lunch = parseOpeningHours('Mo-Su 11:00-14:00,17:00-22:00; Mo,Tu off')!
    expect(lunch[2]).toEqual([[660, 840], [1020, 1320]])
    expect(lunch[0]).toEqual([])
    // Past midnight.
    expect(parseOpeningHours('Fr-Sa 18:00-02:00')![4]).toEqual([[1080, 1560]])
    expect(parseOpeningHours('sunrise-sunset')).toBeUndefined()
  })

  test('says whether a place is open now, and until when', () => {
    expect(openingStatus('24/7', WED_1430)).toEqual({ open: true, always: true })
    const open = openingStatus('Mo-Fr 08:00-18:00', WED_1430)!
    expect(open.open).toBe(true)
    expect(open.closes!.getHours()).toBe(18)
    const closed = openingStatus('Mo-Fr 08:00-12:00', WED_1430)!
    expect(closed.open).toBe(false)
    expect(closed.opens!.getDate()).toBe(8)
    expect(closed.opens!.getHours()).toBe(8)
    // Still open from last night.
    expect(openingStatus('We 20:00-03:00', new Date(2026, 9, 8, 1, 0))!.open).toBe(true)
  })

  test('in words, as Apple writes them', () => {
    expect(describeOpening({ open: true, always: true })).toBe('Open 24 hours')
    expect(describeOpening(openingStatus('Mo-Fr 08:00-18:00', WED_1430)!, WED_1430, 'en-US')).toBe('Open · Closes 6 PM')
    expect(describeOpening(openingStatus('Mo-Fr 08:00-12:00', WED_1430)!, WED_1430, 'en-US')).toBe('Closed · Opens tomorrow 8 AM')
    expect(describeOpening(openingStatus('Mo-Fr 15:30-23:00', WED_1430)!, WED_1430, 'en-US')).toBe('Closed · Opens 3:30 PM')
    expect(describeOpening(openingStatus('We 18:00-02:00', new Date(2026, 9, 7, 23, 0))!, new Date(2026, 9, 7, 23, 0), 'en-US')).toBe('Open · Closes 2 AM')
  })
})

const place: SearchPlace = { id: 'p1', name: 'Tartine Bakery', center: { lat: 37.7614, lng: -122.4241 }, kind: 'bakery', icon: 'bakery', source: 'map', rank: 5 }

describe('OverpassPlaceDetails', () => {
  test('asks by OpenStreetMap id where search has one, by name nearby where not', () => {
    const overpass = new OverpassPlaceDetails()
    expect(overpass.query({ ...place, properties: { osm_type: 'N', osm_id: 123 } })).toBe('[out:json][timeout:10];node(123);out tags;')
    expect(overpass.query(place)).toContain('nwr(around:50,37.761400,-122.424100)["name"="Tartine Bakery"]')
  })

  test('reads hours, phone and website from the tags', async () => {
    const asked: string[] = []
    const overpass = new OverpassPlaceDetails({
      fetch: (async (url: string) => {
        asked.push(url)
        return new Response(JSON.stringify({ elements: [{ type: 'node', id: 42, tags: { 'name': 'Tartine Bakery', 'opening_hours': 'Mo-Su 08:00-17:00', 'phone': '+1 415 487 2600;+1 415 555 0100', 'contact:website': 'https://tartinebakery.com' } }] }))
      }) as unknown as typeof fetch,
    })
    expect(await overpass.details(place)).toEqual({ openingHours: 'Mo-Su 08:00-17:00', phone: '+1 415 487 2600', website: 'https://tartinebakery.com', osm: { type: 'node', id: 42 } })
    expect(asked[0]).toStartWith('https://overpass-api.de/api/interpreter?data=')
  })

  test('tags without details are an empty answer', () => {
    expect(detailsFromTags({ name: 'X' })).toEqual({})
  })
})

function makeMap(): Map {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 430 })
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  document.body.appendChild(container)
  const map = new Map(container, { zoomAnimation: false, fadeAnimation: false })
  map.setView([place.center.lat, place.center.lng], 15)
  return map
}

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  document.body.replaceChildren()
  delete (navigator as any).share
})

describe('the place card', () => {
  test('shows at once, then fills in hours, Call and Website as they arrive', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => (release = resolve))
    const details = { name: 'fake', details: async () => { await gate; return { openingHours: '24/7', phone: '+1 (415) 487-2600', website: 'tartinebakery.com' } } }
    const map = makeMap()
    const search = control.search({ provider: null, offline: null, recents: false, details }).addTo(map)
    const heard: unknown[] = []
    search.listen((type, e) => type === 'details' && heard.push(e.details))
    search.select(place)
    const card = map.getContainer()
    expect(card.querySelector('.tsmap-search-place-name')?.textContent).toBe('Tartine Bakery')
    expect(card.querySelector('.tsmap-search-place-hours')).toBeNull()

    release()
    await tick()
    expect(card.querySelector('.tsmap-search-place-hours')?.textContent).toBe('Open 24 hours')
    expect(card.querySelector<HTMLAnchorElement>('a.tsmap-search-action[href^="tel:"]')?.getAttribute('href')).toBe('tel:+14154872600')
    expect(card.querySelector<HTMLAnchorElement>('a.tsmap-search-action[target="_blank"]')?.getAttribute('href')).toBe('https://tartinebakery.com')
    expect(heard).toHaveLength(1)
  })

  test('Share uses the share sheet where there is one, and copies the link where not', async () => {
    const map = makeMap()
    const search = control.search({ provider: null, offline: null, recents: false }).addTo(map)
    const shared: ShareData[] = []
    ;(navigator as any).share = async (data: ShareData) => { shared.push(data) }
    expect(await search.share(place)).toBe('shared')
    expect(shared[0]!.url).toContain('openstreetmap.org/?mlat=37.761400&mlon=-122.424100')

    delete (navigator as any).share
    const copied: string[] = []
    const realClipboard = (navigator as any).clipboard
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { copied.push(text) } } })
    try {
      search.select(place)
      expect(await search.share(place)).toBe('copied')
      expect(copied).toHaveLength(1)
      expect(map.getContainer().querySelector('.tsmap-search-note')?.textContent).toBe('Link copied')
    }
    finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: realClipboard })
    }
  })

  test('with search kept off the network, no details are asked for', () => {
    const map = makeMap()
    const search = control.search({ provider: null, offline: null, recents: false }).addTo(map)
    expect(search.detailsProvider).toBeNull()
  })
})
