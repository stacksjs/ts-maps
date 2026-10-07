import { afterEach, describe, expect, test } from 'bun:test'
import { control, MAP_TYPE_EVENTS, mapTypes, styles, TsMap } from '../src/core-map'
import { planArea } from '../src/core-map/offline'
import { validateStyle } from '../src/core-map/style-spec/validate'

const TILES = 'https://tiles.test/{z}/{x}/{y}.pbf'
const IMAGERY = 'https://imagery.test/{z}/{y}/{x}.jpg'

function makeMap(): TsMap {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 430 })
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false, fadeAnimation: false })
  map.setView([37.78, -122.42], 14)
  return map
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('satellite, hybrid and driving styles', () => {
  test('validate against the style spec', () => {
    expect(validateStyle(styles.satellite())).toEqual([])
    expect(validateStyle(styles.hybrid({ tiles: TILES }))).toEqual([])
    expect(validateStyle(styles.light({ tiles: TILES, emphasis: 'driving' }))).toEqual([])
  })

  test('satellite is imagery alone, credited, from any source', () => {
    const style = styles.satellite()
    expect(style.layers.map(l => l.id)).toEqual(['background', 'imagery'])
    expect((style.sources.imagery as any).attribution).toContain('Esri')
    const mine = styles.satellite({ imagery: IMAGERY, imageryAttribution: '© Mine' })
    expect((mine.sources.imagery as any).tiles).toEqual([IMAGERY])
    expect((mine.sources.imagery as any).attribution).toBe('© Mine')
  })

  test('hybrid lays the roads and names over the imagery, white on dark', () => {
    const style = styles.hybrid({ tiles: TILES, imagery: IMAGERY })
    const ids = style.layers.map(l => l.id)
    expect(ids.slice(0, 2)).toEqual(['background', 'imagery'])
    expect(ids).toContain('road-major')
    expect(ids).toContain('place-label')
    expect(ids).not.toContain('water')
    expect(ids).not.toContain('building')
    expect((style.layers.find(l => l.id === 'place-label') as any).paint['text-color']).toBe('#ffffff')
  })

  test('driving widens the roads and keeps only the places a driver stops at', () => {
    const explore = styles.light({ tiles: TILES })
    const driving = styles.light({ tiles: TILES, emphasis: 'driving' })
    const width = (s: any, id: string): number[] => s.layers.find((l: any) => l.id === id).paint['line-width'].slice(3).filter((_: unknown, i: number) => i % 2 === 1)
    expect(width(driving, 'road-major')[2]).toBeCloseTo(width(explore, 'road-major')[2]! * 1.45)
    expect((driving.layers.find(l => l.id === 'poi') as any).minzoom).toBe(16)
    expect(JSON.stringify((driving.layers.find(l => l.id === 'poi') as any).filter)).toContain('fuel')
  })
})

describe('MapTypeControl', () => {
  const types = mapTypes({ tiles: TILES, imagery: IMAGERY })

  test('offers Explore, Driving, Transit and Satellite, and switches the style', () => {
    const map = makeMap()
    map.setStyle(styles.light({ tiles: TILES }))
    const picker = control.mapType({ types }).addTo(map)
    const changes: string[] = []
    picker.listen((type, e) => type === 'change' && changes.push(e.value))
    picker.open()
    const card = map.getContainer().querySelector('.tsmap-maptype-card')!
    expect([...card.querySelectorAll('.tsmap-maptype-label')].map(l => l.textContent)).toEqual(['Explore', 'Driving', 'Transit', 'Satellite'])
    card.querySelector<HTMLElement>('[data-type="satellite"]')!.click()
    expect(map.getStyle()!.layers.map(l => l.id)).toContain('imagery')
    expect(map.getTheme()).toBe('dark')
    expect(changes).toEqual(['satellite'])
    expect(card.querySelector('[data-type="satellite"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  test('keeps the camera, the markers and the layers the page added', () => {
    const map = makeMap()
    map.setStyle(styles.light({ tiles: TILES }))
    map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-122.42, 37.78], [-122.41, 37.79]] } } } as any)
    map.addStyleLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#0a84ff' } } as any)
    const center = map.getCenter()
    const picker = control.mapType({ types }).addTo(map)
    picker.select('satellite')
    picker.select('driving')
    const style = map.getStyle()!
    expect(style.layers.at(-1)!.id).toBe('route')
    expect(style.sources.route).toBeDefined()
    // Only once: carried, not stacked.
    expect(style.layers.filter(l => l.id === 'route')).toHaveLength(1)
    expect(map.getCenter()).toEqual(center)
  })

  test('sync follows value and open', () => {
    const map = makeMap()
    const picker = control.mapType({ types }).addTo(map)
    picker.sync({ value: 'driving', open: true })
    expect(picker.value).toBe('driving')
    expect(picker.isOpen).toBe(true)
    expect(JSON.stringify((map.getStyle()!.layers.find(l => l.id === 'poi') as any).filter)).toContain('fuel')
    picker.sync({ value: 'driving', open: false })
    expect(picker.isOpen).toBe(false)
    expect(Object.keys(MAP_TYPE_EVENTS)).toEqual(['change', 'openchange', 'trafficchange'])
  })

  test('a satellite map downloads its imagery for offline', () => {
    const map = makeMap()
    map.setStyle(styles.satellite({ imagery: IMAGERY }))
    const urls = planArea({ bounds: [-122.425, 37.775, -122.415, 37.785], minZoom: 14, maxZoom: 15, map }).build().urls
    expect(urls.some(u => u.startsWith('https://imagery.test/15/'))).toBe(true)
  })
})
