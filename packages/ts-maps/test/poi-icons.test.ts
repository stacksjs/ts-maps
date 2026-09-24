import { describe, expect, test } from 'bun:test'
import { evaluate } from '../src/core-map/style-spec/expressions'
import { IconAtlas } from '../src/core-map/symbols/IconAtlas'
import { builtinIcon, POI_CATEGORIES, POI_CLASSES, POI_ICON_PREFIX, POI_ICON_SIZE, poiCategoryExpression, poiColorExpression } from '../src/core-map/symbols/poiIcons'
import { styles } from '../src/core-map'
import { validateStyle } from '../src/core-map/style-spec/validate'

const context = (cls: string) => ({ zoom: 16, feature: { type: 1 as const, properties: { class: cls } } })

describe('POI icons', () => {
  test('every category a class maps to has a badge', () => {
    for (const category of Object.keys(POI_CLASSES))
      expect(POI_CATEGORIES[category]).toBeDefined()
  })

  test('no class belongs to two categories', () => {
    const seen = new Set<string>()
    for (const classes of Object.values(POI_CLASSES)) {
      for (const cls of classes) {
        expect(seen.has(cls)).toBe(false)
        seen.add(cls)
      }
    }
  })

  test('the category expression sorts OpenMapTiles classes', () => {
    const expression = poiCategoryExpression()
    expect(evaluate(expression, context('cafe'))).toBe('cafe')
    expect(evaluate(expression, context('fast_food'))).toBe('food')
    expect(evaluate(expression, context('hospital'))).toBe('health')
    expect(evaluate(expression, context('something_new'))).toBe('place')
  })

  test('labels take their category\'s colour', () => {
    const expression = poiColorExpression(c => c.textLight)
    expect(evaluate(expression, context('park'))).toBe(POI_CATEGORIES.park!.textLight)
  })

  test('a built-in badge is drawn on first use, at high density', () => {
    const atlas = new IconAtlas()
    const entry = builtinIcon(atlas, `${POI_ICON_PREFIX}food`)
    expect(entry).toBeDefined()
    expect(entry!.pixelRatio).toBe(3)
    // Drawn at three times its CSS size, shadow margin included.
    expect(entry!.width / entry!.pixelRatio!).toBeGreaterThanOrEqual(POI_ICON_SIZE)
    expect(builtinIcon(atlas, `${POI_ICON_PREFIX}food`)).toBe(entry)
  })

  test('names outside the built-in set are left to the style\'s sprite', () => {
    const atlas = new IconAtlas()
    expect(builtinIcon(atlas, 'restaurant-15')).toBeUndefined()
    expect(builtinIcon(atlas, `${POI_ICON_PREFIX}not-a-category`)).toBeUndefined()
  })
})

describe('POIs in the built-in style', () => {
  test('light and dark both carry a POI layer that validates', () => {
    for (const make of [styles.light, styles.dark]) {
      const style = make({ tiles: 'https://tiles/{z}/{x}/{y}.pbf' })
      expect(validateStyle(style)).toEqual([])
      const poi = style.layers.find(l => l.id === 'poi') as any
      expect(poi.type).toBe('symbol')
      expect(poi['source-layer']).toBe('poi')
      expect(JSON.stringify(poi.layout['icon-image'])).toContain(POI_ICON_PREFIX)
    }
  })

  test('dark labels use the lighter ink', () => {
    const dark = styles.dark({ tiles: 'https://tiles/{z}/{x}/{y}.pbf' }).layers.find(l => l.id === 'poi') as any
    expect(evaluate(dark.paint['text-color'], context('park'))).toBe(POI_CATEGORIES.park!.textDark)
  })

  test('bus and tram stops wait for street level; stations do not', () => {
    const poi = styles.light({ tiles: 'https://tiles/{z}/{x}/{y}.pbf' }).layers.find(l => l.id === 'poi') as any
    const at = (zoom: number, properties: Record<string, unknown>) =>
      evaluate(poi.filter, { zoom, feature: { type: 1, properties: { name: 'x', rank: 1, ...properties } } }, 'boolean')
    expect(at(16, { class: 'bus', subclass: 'bus_stop' })).toBe(false)
    expect(at(16, { class: 'railway', subclass: 'tram_stop' })).toBe(false)
    expect(at(18, { class: 'bus', subclass: 'bus_stop' })).toBe(true)
    expect(at(16, { class: 'railway', subclass: 'station' })).toBe(true)
  })
})
